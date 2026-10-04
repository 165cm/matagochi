import { ApiError } from "./errors.js";

// 手順の書き直し（「覚えやすい手順」。2026-10-04 のユーザーの判断。APP_MAP §49）。
// AI が書いた手順（guide）を表に出し、元の手順（steps）はそのまま残す（▶ の時刻・みんなで直した時刻は元の手順に付く）。
// 書き直した手順ごとに、元の手順のどれをまとめたか（from：0 から）を持つ。▶ は from の最初の手順の時刻。
// 手順の数の上限：20分以内 7・30分 10・45分以上 15（時間が分からない時は 10）。
export function guideLimit(minutes) {
  const m = Number(minutes);
  if (!(m > 0)) return 10;
  return m <= 20 ? 7 : m <= 30 ? 10 : 15;
}
export const GUIDE_TEXT_MAX = 90;

// 手順の中の「数字＋単位」（時間・温度・ワット数・分量・個数）。書き直しても変えてはいけないもの（review fix #139）。
// 全角は NFKC で半角に（600Ｗ・２分）。帯分数（大さじ1と1/2）・範囲（10〜15分）は1つの数として扱う。
const N = String.raw`\d+(?:\.\d+)?(?:/\d+)?(?:と\d+(?:\.\d+)?(?:/\d+)?)?`;
const RANGE = String.raw`${N}(?:\s*[〜~\-–]\s*${N})?`;
const UNITS = "時間|分|秒|℃|°C|度|W|w|kg|mg|g|ml|mL|cc|L|cm|mm|個|本|枚|片|袋|缶|カップ|合|切れ|かけ|束|パック|株|玉|房|粒|杯|人分|人前|等分|回|倍|%";
const NUMBER = new RegExp(String.raw`(?:大さじ|小さじ|カップ)\s*${RANGE}|${RANGE}\s*(?:${UNITS})`, "g");
const canon = (x) => x.replace(/\s+/g, "").replace(/[〜~\-–]/g, "~").replace("°C", "℃").replace("mL", "ml").replace(/w$/, "W");
// 重なりも数える（同じ「2分」が2回あれば2つ）。
export function numbersIn(text) {
  return (String(text || "").normalize("NFKC").match(NUMBER) || []).map(canon);
}
// 数字の種類（並びを比べる単位）。
const kindOf = (n) => (/(時間|分|秒)$/.test(n) && !/人分$/.test(n) ? "time" : /(℃|度)$/.test(n) ? "temp" : /W$/.test(n) ? "power" : "amount");
const KIND_LABEL = { time: "時間", temp: "温度", power: "ワット数", amount: "分量" };
const countOf = (list) => list.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());

// 0円の確かめ：数・長さ・from の範囲と順番・元の手順の抜け・数字の取りこぼし。issues が空なら使える。
export function checkGuide(steps, guide, { limit = 10 } = {}) {
  const list = (Array.isArray(steps) ? steps : []).map((s) => String(s || "").trim());
  const items = Array.isArray(guide) ? guide : [];
  const issues = [];
  const add = (code, item = null, detail = "") => issues.push({ code, ...(item !== null ? { item } : {}), ...(detail ? { detail } : {}) });
  if (!items.length) { add("empty"); return { ok: false, issues }; }
  if (items.length > limit) add("too_many", null, `${items.length} > ${limit}`);
  let prevMax = -1;
  const covered = new Map(); // 元の手順 → それを含む書き直しの手順
  items.forEach((g, i) => {
    const text = String(g?.text || "").trim();
    if (!text) add("text_empty", i);
    else if (text.length > GUIDE_TEXT_MAX) add("text_long", i);
    const from = Array.isArray(g?.from) ? g.from : [];
    if (!from.length || from.some((j) => !Number.isInteger(j) || j < 0 || j >= list.length) || from.some((j, k) => k > 0 && j <= from[k - 1])) { add("from_bad", i); return; }
    // 順番：前の手順がまとめた最後の手順より前には戻らない（1つの手順を2つに分けるのはよい）。
    if (from[0] < prevMax) add("order", i);
    prevMax = Math.max(prevMax, from[from.length - 1]);
    for (const j of from) covered.set(j, [...(covered.get(j) || []), i]);
  });
  list.forEach((s, j) => {
    if (!s) return;
    const by = covered.get(j);
    if (!by) { add("missing", null, `元の手順${j + 1}`); return; }
    const have = new Set(by.flatMap((i) => numbersIn(items[i]?.text)));
    const lost = numbersIn(s).filter((n) => !have.has(n));
    if (lost.length) add("number_lost", by[0], `元の手順${j + 1}：${[...new Set(lost)].join("・")}`);
  });
  // 全体でも数を比べる：元にない数字（変えた・足した）は使わない。元の数字の数が減るのも使わない（review fix #139）。
  const before = countOf(list.flatMap(numbersIn)), after = countOf(items.flatMap((g) => numbersIn(g?.text)));
  const added = [...after].filter(([n, c]) => c > (before.get(n) || 0)).map(([n]) => n);
  const fewer = [...before].filter(([n, c]) => c > (after.get(n) || 0) && after.has(n)).map(([n]) => n);
  if (added.length) add("number_added", null, added.join("・"));
  if (fewer.length) add("number_lost", null, `数が減った：${fewer.join("・")}`);
  // 並びも比べる：時間・温度・ワット数・分量それぞれの数字が、元の手順と同じ順に出てくる（「200℃で10分焼き、5分休ませる」の10分と5分を入れ替えない。review fix #139 r2）。
  // 種類が違う数字（600W と 2分）の前後は問わない（「2分（600W）」→「600Wで2分」はよい）。
  // 数字の消えた・足した・手順の抜けがある時は、そちらだけ伝える（並びの理由は重ねない）。
  if (!issues.some((x) => x.code === "missing" || x.code.startsWith("number_"))) {
    const seq = (texts) => { const by = {}; for (const n of texts.flatMap(numbersIn)) (by[kindOf(n)] ||= []).push(n); return by; };
    const a = seq(list), b = seq(items.map((g) => g?.text));
    const swapped = Object.keys(a).filter((k) => (a[k] || []).join("|") !== (b[k] || []).join("|"));
    if (swapped.length) add("number_order", null, swapped.map((k) => `${KIND_LABEL[k]}：元 ${a[k].join("→")}／書き直し ${(b[k] || []).join("→")}`).join("、"));
  }
  return { ok: !issues.length, issues };
}

export const GUIDE_ISSUE_LABEL = {
  empty: "書き直した手順がない",
  too_many: "手順の数が上限より多い",
  text_empty: "空の手順がある",
  text_long: `1つの手順が${GUIDE_TEXT_MAX}字より長い`,
  from_bad: "元の手順の番号がおかしい",
  order: "元の手順の順番が前後している",
  missing: "入っていない元の手順がある",
  number_lost: "元の手順の数字（時間・温度・分量）が消えた",
  number_added: "元の手順にない数字（時間・温度・分量）がある",
  number_order: "数字の順番が元の手順と違う（時間・温度の入れ替え）",
};

// AI の答えを形にそろえる（from は 1 から → 0 から）。
export function normalizeGuide(raw) {
  const items = Array.isArray(raw?.steps) ? raw.steps : [];
  return items.map((g) => ({ text: String(g?.text || "").trim(), from: (Array.isArray(g?.from) ? g.from : []).map((n) => Number(n) - 1) }));
}

// 書き直す（AI 1回。だめなら理由を伝えてもう1回まで）。使えなければ ApiError(422) に理由。
// write：({ title, ingredients, steps, limit, retry }) → AI の答え。beforeRetry：2回目の前に予算を通す。
export async function rewriteGuide(recipe, { write, beforeRetry } = {}) {
  const steps = (recipe.steps || []).map((s) => String(s || "").trim());
  const limit = guideLimit(recipe.planning?.minutes);
  let last = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await beforeRetry?.();
    const raw = await write({ title: recipe.title || "", ingredients: recipe.ingredients || [], steps, limit, retry: last?.issues || null });
    const guide = normalizeGuide(raw);
    const check = checkGuide(steps, guide, { limit });
    if (check.ok) return { steps: guide, limit, tries: attempt + 1 };
    last = check;
  }
  const error = new ApiError(422, "guide_invalid", `書き直しを確かめると問題がありました：${last.issues.map((x) => GUIDE_ISSUE_LABEL[x.code] || x.code).join("・")}`);
  error.issues = last.issues;
  throw error;
}

// 元の手順の「指紋」：中身が1字でも変われば変わる（アプリの discover.js stepsKey と同じ計算：FNV-1a 32bit の16進。review fix #139）。
export function stepsKey(steps) {
  const s = (Array.isArray(steps) ? steps : []).map((x) => String(x || "").trim()).join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
// 一覧（新着・みんなの定番）に出す書き直し：書き直した時の元の手順と、いまの元の手順の中身が同じ時だけ。
export const listedGuide = (r) => (Array.isArray(r?.guide?.steps) && r.guide.steps.length && r.guide.of === stepsKey(r.steps) ? r.guide.steps : null);
