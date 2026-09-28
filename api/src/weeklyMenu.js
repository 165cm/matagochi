import sharp from "sharp";
import { ApiError } from "./errors.js";
import { prepareImages } from "./imageImport.js";

// 1週間コンプのメニュー：その週に作った料理の写真（3〜7枚）を、まとめて1回で、選んだ画風の「素材シート」に描き直す
// （料理は見えない格子に1マス1皿）。ここで一皿ずつ切り出して返す。1回で描くので、画風がそろい、原価も1枚分（約5円）。
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
// 素材シートの格子：品数ごとの列×段と、画像の縦横比。
export function sheetGrid(n) {
  if (n <= 3) return { cols: 3, rows: 1, aspect: "21:9" };
  if (n === 4) return { cols: 2, rows: 2, aspect: "1:1" };
  if (n <= 6) return { cols: 3, rows: 2, aspect: "3:2" };
  return { cols: 4, rows: 2, aspect: "16:9" };
}
// 素材シートから一皿ずつ切り出す。白くない所のかたまりを見つけ、中心が入っているマスの料理とみなす（格子が少しずれても拾える）。
// かたまりが見つからないマスは、マスそのものを使う。切り出した絵は、白地の正方形（640px）に収める。
export async function cutSheet(raw, n, grid) {
  const source = sharp(raw, { limitInputPixels: 30_000_000 });
  const meta = await source.metadata().catch(() => null);
  if (!meta?.width || !meta?.height) throw new ApiError(502, "menu_failed", FAILED);
  const W = meta.width, H = meta.height, sw = 240, sh = Math.max(1, Math.round((H / W) * sw)), k = W / sw;
  const { data } = await sharp(raw).resize(sw, sh, { fit: "fill" }).flatten({ background: "#ffffff" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ink = new Uint8Array(sw * sh);
  for (let i = 0; i < sw * sh; i += 1) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2], lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    ink[i] = lo < 232 || hi - lo > 22 ? 1 : 0;
  }
  // かたまり（上下左右でつながった所）
  const label = new Int32Array(sw * sh).fill(-1), blobs = [];
  for (let start = 0; start < sw * sh; start += 1) {
    if (!ink[start] || label[start] >= 0) continue;
    const blob = { x0: sw, y0: sh, x1: 0, y1: 0, sx: 0, sy: 0, area: 0 }, stack = [start];
    label[start] = blobs.length;
    while (stack.length) {
      const p = stack.pop(), x = p % sw, y = (p - x) / sw;
      blob.area += 1; blob.sx += x; blob.sy += y;
      if (x < blob.x0) blob.x0 = x; if (x > blob.x1) blob.x1 = x; if (y < blob.y0) blob.y0 = y; if (y > blob.y1) blob.y1 = y;
      for (const q of [x > 0 ? p - 1 : -1, x < sw - 1 ? p + 1 : -1, y > 0 ? p - sw : -1, y < sh - 1 ? p + sw : -1]) if (q >= 0 && ink[q] && label[q] < 0) { label[q] = blobs.length; stack.push(q); }
    }
    blobs.push(blob);
  }
  const cw = sw / grid.cols, ch = sh / grid.rows, noise = cw * ch * 0.004;
  const pieces = [];
  for (let i = 0; i < n; i += 1) {
    const cx0 = (i % grid.cols) * cw, cy0 = Math.floor(i / grid.cols) * ch;
    const mine = blobs.filter((b) => b.area >= noise && b.sx / b.area >= cx0 && b.sx / b.area < cx0 + cw && b.sy / b.area >= cy0 && b.sy / b.area < cy0 + ch);
    let box = { x0: cx0, y0: cy0, x1: cx0 + cw, y1: cy0 + ch };
    if (mine.length) {
      const u = mine.reduce((a, b) => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1 + 1, b.x1 + 1), y1: Math.max(a.y1 + 1, b.y1 + 1) }), { x0: sw, y0: sh, x1: 0, y1: 0 });
      // となりの皿とつながっていても、マスの少し外までで止める
      const mx = cw * 0.12, my = ch * 0.12;
      box = { x0: Math.max(u.x0, cx0 - mx), y0: Math.max(u.y0, cy0 - my), x1: Math.min(u.x1, cx0 + cw + mx), y1: Math.min(u.y1, cy0 + ch + my) };
    }
    const pw = (box.x1 - box.x0) * 0.06, ph = (box.y1 - box.y0) * 0.06;
    const left = Math.max(0, Math.floor((box.x0 - pw) * k)), top = Math.max(0, Math.floor((box.y0 - ph) * k));
    const width = Math.max(1, Math.min(W - left, Math.ceil((box.x1 - box.x0 + pw * 2) * k))), height = Math.max(1, Math.min(H - top, Math.ceil((box.y1 - box.y0 + ph * 2) * k)));
    const bytes = await sharp(raw).extract({ left, top, width, height }).flatten({ background: "#ffffff" })
      .resize({ width: 640, height: 640, fit: "contain", background: "#ffffff", withoutEnlargement: false }).webp({ quality: 84 }).toBuffer()
      .catch(() => { throw new ApiError(502, "menu_failed", FAILED); });
    pieces.push({ mimeType: "image/webp", data: bytes.toString("base64") });
  }
  return pieces;
}
// 目安の数字：カロリー（1人分）・材料費（1人分）・ひとこと。取れなくてもメニューは作る。
function cleanNote(n) {
  const kcal = Math.round(Number(n?.kcal));
  const yen = Math.round(Number(n?.yen));
  return { kcal: kcal >= 30 && kcal <= 3000 ? kcal : null, yen: yen >= 10 && yen <= 5000 ? yen : null, copy: text(n?.copy, 24) };
}

export function createWeeklyMenu(store, { drawSheet, describe, tickets, reserveBudget, now = Date.now } = {}) {
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
        const grid = sheetGrid(photos.length);
        const draw = () => drawSheet(prepared, photos.map((p) => p.dish), { style, prompt, grid });
        const drawing = draw().catch(() => draw()).then((out) => {
          const raw = Buffer.from(String(out?.data || ""), "base64");
          if (!raw.length) throw new ApiError(502, "menu_failed", FAILED);
          return cutSheet(raw, photos.length, grid);
        });
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
