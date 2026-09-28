import sharp from "sharp";
import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 1週間コンプのメニュー：その週に作った料理の写真（3〜7枚）を、まとめて1回で「カフェ風の献立表」1枚に描いてもらう（文字も絵の中）。
// 不確かさを減らすために：
//   1) 先に文字のモデルで、書く文字（英語の料理名など）と目安（1人分のkcal・材料費）・ひとことを決める
//   2) 画像のモデルには、品数・並べ方・書く文字を一字一句指定して、写真といっしょに渡す
//   3) 描けたら文字のモデルで読み返し、品数か文字が違えば1回だけ描き直す
// 写真も絵も保存しない（端末に返すだけ）。チケット3枚（開発コードは無料）。描けなかったらチケットを戻す。1家庭1日3回まで。
export const MENU_TICKETS = 3;
export const MENUS_PER_DAY = 3;
export const MENU_STYLES = ["chalk", "watercolor", "pencil", "anime", "retro"];
export const MENU_LANGS = ["en", "ja"];
export const MENU_INFOS = ["none", "kcal", "kcal_yen"];
const MAX_PHOTO_BYTES = 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const DAYS = { en: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], ja: ["月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日", "日曜日"] };
const text = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");
// 画像に書く文字は、書き崩れにくい文字だけにする（引用符や記号の指示の混入も防ぐ）。
const safe = (v, n) => text(v, n * 2).replace(/[「」『』"“”<>{}\[\]\\|`]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
const FAILED = "メニューを描けませんでした。チケットは戻しました。";

function readPhotos(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 3 || list.length > 7) throw new ApiError(400, "invalid_photo_count", "写真は3〜7枚です。");
  return list.map((p) => {
    if (!TYPES.has(p?.mimeType) || typeof p.data !== "string" || p.data.length > Math.ceil(MAX_PHOTO_BYTES / 3) * 4 || /[^A-Za-z0-9+/=]/.test(p.data)) throw new ApiError(400, "invalid_image", "JPEG・PNG・WebPの写真を1枚1MB以下で送ってください。");
    const buffer = Buffer.from(p.data, "base64");
    if (!buffer.length) throw new ApiError(400, "invalid_image", "写真を読み込めません。");
    const ingredients = (Array.isArray(p.ingredients) ? p.ingredients : []).map((x) => text(x, 30)).filter(Boolean).slice(0, 12);
    const servings = Math.max(1, Math.min(8, Math.round(Number(p.servings) || 2)));
    const day = Number.isInteger(p.day) && p.day >= 0 && p.day <= 6 ? p.day : null;
    return { buffer, mimeType: p.mimeType, dish: text(p.dish, 40), ingredients, servings, day };
  });
}
// 目安の数字：カロリー（1人分）・材料費（1人分）・ひとこと・英語の料理名。
function cleanNote(n) {
  const kcal = Math.round(Number(n?.kcal));
  const yen = Math.round(Number(n?.yen));
  return { kcal: kcal >= 30 && kcal <= 3000 ? kcal : null, yen: yen >= 10 && yen <= 5000 ? yen : null, copy: text(n?.copy, 24), en: safe(n?.en, 32).replace(/[^\x20-\x7e]/g, "").trim() };
}
// 画像に書く文字（一字一句この通りに書いてもらう）。
export function boardTexts({ photos, notes, lang, info, range }) {
  const title = lang === "en" ? "WEEKLY MENU" : "今週の献立";
  const items = photos.map((p, i) => {
    const n = notes[i] || {};
    const name = lang === "en" ? n.en || "" : safe(p.dish, 16);
    const extra = info === "none" ? "" : [n.kcal ? `${n.kcal}kcal` : "", info === "kcal_yen" && n.yen ? `¥${n.yen}` : ""].filter(Boolean).join(" · ");
    return { day: DAYS[lang][p.day ?? i % 7], name, extra };
  });
  return { title, subtitle: safe(range, 20), items };
}
// 読み返し：品数と、書くはずの文字がそろっているか（大文字小文字・空白・記号の違いは気にしない）。
const squash = (s) => String(s || "").toLowerCase().normalize("NFKC").replace(/[\s·・,.:;!?'"&()（）\-–—~〜]/g, "");
export function boardMatches(expected, seen) {
  if (!seen || Number(seen.dishCount) !== expected.items.length) return false;
  const all = squash([...(seen.texts || [])].join(" "));
  const need = [expected.title, ...expected.items.flatMap((x) => [x.day, x.name])].filter(Boolean);
  return need.every((t) => all.includes(squash(t)));
}
async function shrink(out) {
  const raw = Buffer.from(String(out?.data || ""), "base64");
  if (!raw.length) throw new ApiError(502, "menu_failed", FAILED);
  const bytes = await sharp(raw, { limitInputPixels: 40_000_000 }).resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 90 }).toBuffer()
    .catch(() => { throw new ApiError(502, "menu_failed", FAILED); });
  return { mimeType: "image/webp", data: bytes.toString("base64") };
}

export function createWeeklyMenu(store, { drawBoard, describe, check, tickets, reserveBudget, now = Date.now } = {}) {
  return {
    async make(body, household = "", { unlimited = false } = {}) {
      if (!store || !tickets) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      const style = MENU_STYLES.includes(body?.style) ? body.style : MENU_STYLES[0];
      let lang = MENU_LANGS.includes(body?.lang) ? body.lang : "en";
      const info = MENU_INFOS.includes(body?.info) ? body.info : "none";
      const prompt = text(body?.prompt, 60);
      const range = text(body?.range, 20);
      // 開発コードの端末だけ、軽いモデル（lite）と見比べられる
      const model = unlimited && body?.model === "lite" ? "lite" : "standard";
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
        const listed = await Promise.resolve(describe ? describe(photos.map(({ dish, ingredients, servings }) => ({ dish, ingredients, servings }))) : []).catch(() => []);
        const notes = photos.map((_, i) => cleanNote(Array.isArray(listed) ? listed[i] : null));
        // 英語の料理名がそろわなければ、日本語で書く
        if (lang === "en" && notes.some((n) => !n.en)) lang = "ja";
        const texts = boardTexts({ photos, notes, lang, info, range });
        const spec = { style, lang, info, prompt, texts, model };
        const draw = () => drawBoard(prepared, spec);
        let out = await draw().catch(() => draw());
        let checked = null;
        if (check) {
          const seen = await check(out, texts).catch(() => null);
          checked = seen ? boardMatches(texts, seen) : null;
          if (checked === false) {
            const again = await draw().catch(() => null);
            if (again) {
              const seen2 = await check(again, texts).catch(() => null);
              const ok2 = seen2 ? boardMatches(texts, seen2) : null;
              if (ok2 !== false) { out = again; checked = ok2; }
            }
          }
        }
        const image = await shrink(out);
        return { style, lang, info, model, image, notes, texts, checked, wallet: spent };
      } catch (error) {
        const back = await tickets.refund(household, { unlimited, count: MENU_TICKETS }).catch(() => null);
        const failure = error instanceof ApiError && error.code === "menu_failed" ? error : new ApiError(502, "menu_failed", FAILED);
        if (back) failure.wallet = back;
        throw failure;
      }
    }
  };
}
