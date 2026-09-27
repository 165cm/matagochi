import sharp from "sharp";
import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 作った料理の写真から、料理の腕前（★1〜5）をAIに見てもらう。写真は保存しない（判定したら捨てる）。
// 1家庭1日5枚まで。AIの1日の上限（全体）の中で動く。
export const PHOTO_JUDGES_PER_DAY = 5;
const MAX_IMAGE_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function normalizeJudgement(raw) {
  if (!raw || typeof raw !== "object") throw new ApiError(502, "invalid_photo_judgement", "写真を判定できませんでした。");
  if (raw.isFood === false) throw new ApiError(422, "not_food", "料理の写真が見つかりませんでした。作った料理が写っている写真を選んでください。");
  const text = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const level = Math.max(1, Math.min(5, Math.round(Number(raw.level)) || 1));
  return {
    dish: text(raw.dish, 40) || "手料理",
    level,
    techniques: Array.isArray(raw.techniques) ? raw.techniques.map((t) => text(t, 20)).filter(Boolean).slice(0, 4) : [],
    comment: text(raw.comment, 80),
  };
}

function decodePhoto(image) {
  if (!TYPES.has(image?.mimeType) || typeof image.data !== "string" || image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(image.data)) {
    throw new ApiError(400, "invalid_image", "JPEG・PNG・WebPの写真を1MB以下で送ってください。");
  }
  const buffer = Buffer.from(image.data, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, "image_too_large", "写真の容量が上限を超えています。");
  return buffer;
}

// 料理の写真を、絵本風のイラストにする（1週間の献立を達成した人が、チケット3枚で）。写真もイラストも保存しない（端末に返すだけ）。
// 1家庭1日3枚まで。描けなかった時はチケットを戻す。
export const ILLUSTRATIONS_PER_DAY = 3;
export const ILLUSTRATION_TICKETS = 3;
export function createIllustrator(store, { draw, tickets, reserveBudget, now = Date.now } = {}) {
  return {
    async illustrate(body, household = "", { unlimited = false } = {}) {
      if (!store || !tickets) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      const buffer = decodePhoto(body?.image);
      const dish = typeof body?.dish === "string" ? body.dish.trim().slice(0, 40) : "";
      const dayKey = `illustrate-quota/${new Date(now()).toISOString().slice(0, 10)}/${household}`;
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0;
      if (used >= ILLUSTRATIONS_PER_DAY) throw new ApiError(429, "illustrate_quota", "今日はここまでです。明日また試してください。");
      const [prepared] = await prepareImages([{ buffer, mimeType: body.image.mimeType }]);
      const spent = await tickets.spend(household, { unlimited, count: ILLUSTRATION_TICKETS });
      try {
        await reserveBudget();
        await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
        const out = await draw(prepared, dish);
        const raw = Buffer.from(String(out?.data || ""), "base64");
        if (!raw.length) throw new ApiError(502, "illustration_failed", "イラストにできませんでした。チケットは戻しました。");
        // 返ってきた画像も作り直して、軽くする（メタデータも消える）。
        const bytes = await sharp(raw, { limitInputPixels: 20_000_000 }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
          .catch(() => { throw new ApiError(502, "illustration_failed", "イラストにできませんでした。チケットは戻しました。"); });
        return { image: { mimeType: "image/webp", data: bytes.toString("base64") }, wallet: spent };
      } catch (error) {
        const back = await tickets.refund(household, { unlimited, count: ILLUSTRATION_TICKETS }).catch(() => null);
        const failure = error instanceof ApiError ? error : new ApiError(502, "illustration_failed", "イラストにできませんでした。チケットは戻しました。");
        if (back) failure.wallet = back;
        throw failure;
      }
    }
  };
}

export function createSkillJudge(store, { judge, reserveBudget, now = Date.now } = {}) {
  return {
    async judge(body, household = "") {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const image = body?.image;
      const buffer = decodePhoto(image);
      const dayKey = `skill-photo-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0;
      if (used >= PHOTO_JUDGES_PER_DAY) throw new ApiError(429, "photo_quota", "今日の判定はここまでです。明日また試してください。");
      await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
      const [prepared] = await prepareImages([{ buffer, mimeType: image.mimeType }]);
      await reserveBudget();
      return normalizeJudgement(await judge(prepared));
    }
  };
}
