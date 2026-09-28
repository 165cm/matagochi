import sharp from "sharp";
import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 1週間コンプのメニュー：その週に作った料理の写真（3〜7枚）を、選んだ画風のイラストに一皿ずつ描き直す。
// 並べ方・料理名・カロリーや材料費の目安・ひとことはアプリが重ねるので、ここでは絵と目安の数字だけ。
// 写真も絵も保存しない（端末に返すだけ）。チケット3枚（開発コードは無料）。描けなかったらチケットを戻す。1家庭1日3回まで。
export const MENU_TICKETS = 3;
export const MENUS_PER_DAY = 3;
export const MENU_STYLES = ["watercolor", "pencil", "anime", "retro"];
const MAX_PHOTO_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const text = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");
const FAILED = "メニューの絵を描けませんでした。チケットは戻しました。";

function readPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 3 || list.length > 7) throw new ApiError(400, "invalid_photo_count", "写真は3〜7枚です。");
  return list.map((p) => {
    if (!TYPES.has(p?.mimeType) || typeof p.data !== "string" || p.data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(p.data)) throw new ApiError(400, "invalid_image", "JPEG・PNG・WebPの写真を1枚1MB以下で送ってください。");
    const buffer = Buffer.from(p.data, "base64");
    if (!buffer.length) throw new ApiError(400, "invalid_image", "写真を読み込めません。");
    const ingredients = (Array.isArray(p.ingredients) ? p.ingredients : []).map((x) => text(x, 30)).filter(Boolean).slice(0, 12);
    const servings = Math.max(1, Math.min(8, Math.round(Number(p.servings) || 2)));
    return { buffer, mimeType: p.mimeType, dish: text(p.dish, 40), ingredients, servings };
  });
}
async function shrink(out) {
  const raw = Buffer.from(String(out?.data || ""), "base64");
  if (!raw.length) throw new ApiError(502, "menu_failed", FAILED);
  const bytes = await sharp(raw, { limitInputPixels: 30_000_000 }).resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toBuffer()
    .catch(() => { throw new ApiError(502, "menu_failed", FAILED); });
  return { mimeType: "image/webp", data: bytes.toString("base64") };
}
// 目安の数字：カロリー（1人分）・材料費（1人分）・ひとこと。取れなくてもメニューは作る。
function cleanNote(n) {
  const kcal = Math.round(Number(n?.kcal));
  const yen = Math.round(Number(n?.yen));
  return { kcal: kcal >= 30 && kcal <= 3000 ? kcal : null, yen: yen >= 10 && yen <= 5000 ? yen : null, copy: text(n?.copy, 24) };
}

export function createWeeklyMenu(store, { drawDish, describe, tickets, reserveBudget, now = Date.now } = {}) {
  return {
    async make(body, household = "", { unlimited = false } = {}) {
      if (!store || !tickets) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      const style = MENU_STYLES.includes(body?.style) ? body.style : MENU_STYLES[0];
      const prompt = text(body?.prompt, 60);
      const photos = readPhotos(body?.photos);
      const dayKey = `weekly-menu-quota/${new Date(now()).toISOString().slice(0, 10)}/${household}`;
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0;
      if (used >= MENUS_PER_DAY && !unlimited) throw new ApiError(429, "menu_quota", "今日はここまでです。明日また作れます。");
      const prepared = await prepareImages(photos.map(({ buffer, mimeType }) => ({ buffer, mimeType })));
      const spent = await tickets.spend(household, { unlimited, count: MENU_TICKETS });
      try {
        await reserveBudget();
        await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
        const once = (i) => drawDish(prepared[i], photos[i].dish, { style, prompt });
        const drawing = Promise.all(photos.map((_, i) => once(i).catch(() => once(i)).then(shrink)));
        const notes = Promise.resolve(describe ? describe(photos.map(({ dish, ingredients, servings }) => ({ dish, ingredients, servings }))) : [])
          .then((list) => photos.map((_, i) => cleanNote(Array.isArray(list) ? list[i] : null)))
          .catch(() => photos.map(() => cleanNote(null)));
        const [images, noteList] = await Promise.all([drawing, notes]);
        return { style, images, notes: noteList, wallet: spent };
      } catch (error) {
        const back = await tickets.refund(household, { unlimited, count: MENU_TICKETS }).catch(() => null);
        const failure = error instanceof ApiError && error.code === "menu_failed" ? error : new ApiError(502, "menu_failed", FAILED);
        if (back) failure.wallet = back;
        throw failure;
      }
    }
  };
}
