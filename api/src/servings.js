// 説明文から「元のレシピは何人分か」を読む。AIが取りこぼした時の保険（決まったルールで読む）。
// 読めるもの：2人分・2人前・2名分・二人分・ふたり分・2〜3人分（→2）・材料（2人）・serves 2 など。
// 読まないもの：「1人分あたり」「カロリー（1人分）」など栄養の表示。
const KANJI = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const toNumber = (s) => (/^\d+$/.test(s) ? Number(s) : KANJI[s] ?? null);
const NUM = "(\\d{1,2}|[一二三四五六七八九十])";
const PATTERNS = [
  new RegExp(`${NUM}\\s*(?:[〜~\\-－−–ー]\\s*${NUM}\\s*)?(?:人|名)\\s*(?:分|前|份|用)`, "g"),
  new RegExp(`材料\\s*[（(【\\[]\\s*${NUM}\\s*(?:[〜~\\-－−–ー]\\s*${NUM}\\s*)?(?:人|名)\\s*[）)】\\]]`, "g"),
  /(ひとり|ふたり)\s*(?:分|前)/g,
  /serves?\s*(\d{1,2})|(\d{1,2})\s*servings?/gi,
];
const NUTRITION_AFTER = /^\s*[)）】\]]?\s*(?:あたり|当たり|[:：]?\s*\d+(?:\.\d+)?\s*(?:kcal|キロカロリー|g\b))/i;
const NUTRITION_BEFORE = /(?:カロリー|kcal|栄養|糖質|塩分|たんぱく質|タンパク質|脂質)[^\n]{0,8}$/i;
export function detectServings(text) {
  const t = String(text || "").normalize("NFKC");
  const found = [];
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const raw = m[1] || m[2];
      const n = raw === "ひとり" ? 1 : raw === "ふたり" ? 2 : toNumber(raw);
      if (!n || n < 1 || n > 20) continue;
      const before = t.slice(Math.max(0, m.index - 24), m.index);
      const after = t.slice(m.index + m[0].length, m.index + m[0].length + 16);
      if (NUTRITION_AFTER.test(after) || NUTRITION_BEFORE.test(before)) continue;
      // 「材料」の見出しの近くにある人数を優先する。
      found.push({ n, index: m.index, near: /材料|用意するもの|ingredients/i.test(before) });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => Number(b.near) - Number(a.near) || a.index - b.index);
  return found[0].n;
}
