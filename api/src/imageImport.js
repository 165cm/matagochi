import sharp from "sharp";
import { createHmac } from "node:crypto";
import { ApiError } from "./errors.js";

const MAX_IMAGE_BYTES = 1024 * 1024;
const FORMATS = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" };
const TTL = 10 * 60_000;

function decodeImages(body) {
  if (!/^[a-f0-9]{64}$/.test(body?.clientKey || "")) throw new ApiError(400, "invalid_image_session", "画像取り込み用の識別情報が正しくありません。");
  if (!Array.isArray(body.images) || body.images.length < 1 || body.images.length > 5) throw new ApiError(400, "invalid_image_count", "画像は1〜5枚選んでください。");
  return body.images.map((image) => {
    if (!FORMATS[image?.mimeType] || typeof image.data !== "string" || image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(image.data)) {
      throw new ApiError(400, "invalid_image", "JPEG・PNG・WebP画像を1枚1MB以下で送信してください。");
    }
    const buffer = Buffer.from(image.data, "base64");
    if (buffer.toString("base64") !== image.data) throw new ApiError(400, "invalid_image", "画像のエンコードが正しくありません。");
    if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_large", "画像の容量が上限を超えています。");
    return { buffer, mimeType: image.mimeType };
  });
}

export async function prepareImages(images) {
  const prepared = [];
  for (const image of images) {
    try {
      const input = sharp(image.buffer, { limitInputPixels: 12_000_000, failOn: "warning" });
      const meta = await input.metadata();
      if (meta.format !== FORMATS[image.mimeType] || (meta.pages || 1) !== 1 || !meta.width || !meta.height) throw new Error("Invalid image");
      // Re-encoding strips EXIF and all metadata; never use withMetadata().
      const bytes = await input.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      prepared.push({ mimeType: "image/jpeg", data: bytes.toString("base64") });
    } catch {
      throw new ApiError(400, "invalid_image", "画像を読み込めません。破損・アニメーション・過大な解像度の画像は利用できません。");
    }
  }
  return prepared;
}

export function normalizeImageResult(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApiError(502, "invalid_image_analysis", "画像の解析結果を読み取れませんでした。");
  if (raw.multipleRecipes === true) throw new ApiError(422, "multiple_recipes", "複数の料理が含まれています。1つの料理の画像だけを選んでください。");
  const text = value => typeof value === "string" ? value.trim().slice(0, 2000) : "";
  if (!Array.isArray(raw.ingredients) || raw.ingredients.length > 50 || (Array.isArray(raw.steps) && raw.steps.length > 30)) throw new ApiError(422, "invalid_image_analysis", "材料・手順を読み取れませんでした。画像を分けるか手動入力をご利用ください。");
  const ingredients = raw.ingredients.map(i => ({name:text(i?.name),amount:text(i?.amount) || "不明",category:text(i?.category) || "その他"})).filter(i => i.name);
  if (!ingredients.length) throw new ApiError(422, "no_recipe_in_image", "材料を読み取れませんでした。別の画像を選ぶか、手動で入力してください。");
  const steps = Array.isArray(raw.steps) ? raw.steps.map(text).filter(Boolean) : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map(text).filter(Boolean).slice(0, 10) : [];
  if (!steps.length) warnings.push("調理手順が読み取れていません。元の投稿を確認して入力してください。");
  if (ingredients.some(i => i.amount === "不明")) warnings.push("分量が不明な材料があります。元の投稿を確認してください。");
  return { title: text(raw.title), ingredients, steps, warnings, sourceServings: Number.isInteger(raw.sourceServings) && raw.sourceServings > 0 && raw.sourceServings <= 100 ? raw.sourceServings : null, requiresReview: true, source: "画像から取り込み", catalog: null };
}

// Only opaque job markers are durable. Images, session keys and extracted private
// text never enter the shared recipe DB. Results live in bounded memory for 10 min.
export function createImageImporter({ store, analyze, reserveBudget, now = Date.now }) {
  const inFlight = new Map(), results = new Map();
  return async body => {
    const images = decodeImages(body);
    if (!store) throw new ApiError(503, "catalog_not_configured", "画像解析の保存先が未設定です。手動入力をご利用ください。");
    const hash = createHmac("sha256", Buffer.from(body.clientKey, "hex")).update("image-import-v1");
    for (const image of images) hash.update(`${image.mimeType}:${image.buffer.length}:`).update(image.buffer);
    const id = `image-jobs/${hash.digest("hex")}`;
    for (const [key, value] of results) if (value.expiresAt <= now()) { clearTimeout(value.timer); results.delete(key); }
    if (results.has(id)) return { ...structuredClone(results.get(id).result), cacheHit: true };
    if (inFlight.has(id)) return structuredClone(await inFlight.get(id));
    if (inFlight.size >= 4) throw new ApiError(429, "image_capacity", "画像解析が混雑しています。しばらくしてからお試しください。");
    const work = (async () => {
      const current = await store.get(id);
      if (current && current.envelope.status !== "failed") throw new ApiError(409, "image_result_unavailable", "この画像は分析中、または結果の再取得ができない状態です。重複分析を防いでいます。しばらくしてから同じ画面で再試行するか、手動入力をご利用ください。");
      const prepared = await prepareImages(images);
      const claim = await store.put(id, { status: "pending", createdAt: new Date(now()).toISOString() }, { ifGeneration: current?.generation ?? 0 });
      if (!claim) throw new ApiError(409, "image_analysis_pending", "この画像は分析中です。しばらくしてから再試行してください。");
      let analysisStarted = false;
      try {
        await reserveBudget();
        analysisStarted = true;
        const result = normalizeImageResult(await analyze(prepared));
        if (!await store.put(id, { status: "ready", completedAt: new Date(now()).toISOString() }, { ifGeneration: claim.generation })) throw new Error("Image claim changed");
        if (results.size >= 32) {
          const oldest = results.keys().next().value;
          clearTimeout(results.get(oldest).timer); results.delete(oldest);
        }
        const timer = setTimeout(() => results.delete(id), TTL);
        timer.unref();
        results.set(id, { result, expiresAt: now() + TTL, timer });
        return { ...structuredClone(result), cacheHit: false };
      } catch (error) {
        // Once AI starts, an error or disconnect must not enable a paid replay.
        if (!analysisStarted) await store.put(id, { status: "failed" }, { ifGeneration: claim.generation }).catch(() => {});
        throw error;
      }
    })();
    inFlight.set(id, work);
    try { return structuredClone(await work); }
    finally { inFlight.delete(id); }
  };
}
