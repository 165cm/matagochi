import sharp from "sharp";
import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 1週間コンプのメニュー：その週に作った料理の写真（3〜7枚）を、絵本風のイラストにする。
// 文字（日付・料理名・ロゴ）はアプリが重ねるので、ここでは絵だけ。写真も絵も保存しない（端末に返すだけ）。
// mode "one"：全部の料理を1枚の食卓の絵に（上位の画像モデル）。mode "each"：料理ごとに1枚ずつ（いつものモデル）。
// チケット3枚（開発コードは無料）。描けなかったらチケットを戻す。1家庭1日3回まで。
export const MENU_TICKETS = 3;
export const MENUS_PER_DAY = 3;
const MAX_PHOTO_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const text = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");

function readPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 3 || list.length > 7) throw new ApiError(400, "invalid_photo_count", "写真は3〜7枚です。");
  return list.map((p) => {
    if (!TYPES.has(p?.mimeType) || typeof p.data !== "string" || p.data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(p.data)) throw new ApiError(400, "invalid_image", "JPEG・PNG・WebPの写真を1枚1MB以下で送ってください。");
    const buffer = Buffer.from(p.data, "base64");
    if (!buffer.length) throw new ApiError(400, "invalid_image", "写真を読み込めません。");
    return { buffer, mimeType: p.mimeType, dish: text(p.dish, 40) };
  });
}
async function shrink(out) {
  const raw = Buffer.from(String(out?.data || ""), "base64");
  if (!raw.length) throw new ApiError(502, "menu_failed", "メニューの絵を描けませんでした。チケットは戻しました。");
  const bytes = await sharp(raw, { limitInputPixels: 30_000_000 }).resize({ width: 1024, height: 1280, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    .catch(() => { throw new ApiError(502, "menu_failed", "メニューの絵を描けませんでした。チケットは戻しました。"); });
  return { mimeType: "image/webp", data: bytes.toString("base64") };
}

export function createWeeklyMenu(store, { drawOne, drawEach, tickets, reserveBudget, now = Date.now } = {}) {
  return {
    async make(body, household = "", { unlimited = false } = {}) {
      if (!store || !tickets) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      const mode = body?.mode === "each" ? "each" : "one";
      const photos = readPhotos(body?.photos);
      const dayKey = `weekly-menu-quota/${new Date(now()).toISOString().slice(0, 10)}/${household}`;
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0;
      if (used >= MENUS_PER_DAY && !unlimited) throw new ApiError(429, "menu_quota", "今日はここまでです。明日また作れます。");
      const prepared = await prepareImages(photos.map(({ buffer, mimeType }) => ({ buffer, mimeType })));
      const dishes = photos.map((p) => p.dish);
      const spent = await tickets.spend(household, { unlimited, count: MENU_TICKETS });
      try {
        await reserveBudget();
        await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
        let images;
        if (mode === "one") images = [await shrink(await drawOne(prepared, dishes))];
        else {
          images = [];
          for (let i = 0; i < prepared.length; i += 1) images.push(await shrink(await drawEach(prepared[i], dishes[i])));
        }
        return { mode, images, wallet: spent };
      } catch (error) {
        const back = await tickets.refund(household, { unlimited, count: MENU_TICKETS }).catch(() => null);
        const failure = error instanceof ApiError ? error : new ApiError(502, "menu_failed", "メニューの絵を描けませんでした。チケットは戻しました。");
        if (back) failure.wallet = back;
        throw failure;
      }
    }
  };
}
