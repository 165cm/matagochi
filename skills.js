/* 料理のスキル（内部DB）。レシピの料理名・手順・器具から、必要な技法とその難しさ（★1〜5）を判定する。
   ★1 はじめて：混ぜる・のせる・レンジ
   ★2 慣れてきた：包丁の基本・炒める・ゆでる・煮る・蒸す
   ★3 ふつう：みじん切り・肉魚を焼いて中まで火を通す・煮からめる・切り開く
   ★4 得意：揚げ焼き・練って成形する／包む
   ★5 上級：揚げ物・魚をおろす・生地から作る */
(function (root) {
  const SKILLS = [
    { id: "mix", label: "混ぜる・和える", level: 1, re: /混ぜ|和え|溶く|溶き/ },
    { id: "hand", label: "ちぎる・ほぐす（包丁なし）", level: 1, re: /ちぎ|はさみ|手で|折る|ほぐす|崩/ },
    { id: "microwave", label: "レンジで加熱", level: 1, re: /\d+W|レンジ/ },
    { id: "boil", label: "ゆでる・温める", level: 2, re: /ゆで|茹で|沸か|沸騰|温める/ },
    { id: "knife", label: "包丁で切る", level: 2, re: /(?<!はさみで[^。]{0,10})(?<!(汁|湯|水|水気|油)を)(?<!(汁|湯|水|水気|油)気?を)(切る|切り|刻む|刻み)/ },
    { id: "stirfry", label: "炒める", level: 2, re: /炒め/ },
    { id: "simmer", label: "煮る", level: 2, re: /煮る|煮て|煮込|煮立/ },
    { id: "steam", label: "ふたをして蒸す", level: 2, re: /蒸す|蒸し(?!器)/ },
    { id: "egg", label: "卵に火を通す", level: 2, re: /溶き卵|卵を(加え|入れ|溶)|卵が.*固まる/ },
    { id: "mince", label: "みじん切り・細かく切る", level: 3, re: /みじん切り|細かく切|細かく刻/ },
    { id: "sear", label: "焼いて中まで火を通す", level: 3, re: /焼く|焼き(?!のり)|両面を/ },
    { id: "glaze", label: "煮からめる・煮詰める", level: 3, re: /煮絡め|煮からめ|煮詰め/ },
    { id: "butterfly", label: "切り開く・厚さをそろえる", level: 3, re: /切り開|開き、|部分を開|筋を取|厚さ.{0,6}(そろえ|以下にする)/ },
    { id: "shallowfry", label: "揚げ焼き", level: 4, re: /揚げ焼き/ },
    { id: "shape", label: "練る・成形する・包む", level: 4, re: /練る|包む|包み|たねを|等分して/ },
    { id: "emulsify", label: "ソースを乳化させる", level: 4, re: /乳化/ },
    { id: "deepfry", label: "揚げる（たっぷりの油）", level: 5, re: /(?<!揚げ)揚げる(?!焼)|揚げ油|油で揚げ/ },
    { id: "fillet", label: "魚をおろす", level: 5, re: /三枚におろ|魚をおろ/ },
    { id: "dough", label: "生地から作る", level: 5, re: /生地|こねる|発酵/ },
  ];
  const LEVELS = { 1: "はじめて", 2: "慣れてきた", 3: "ふつう", 4: "得意", 5: "上級" };
  // Hand-checked where the text alone misleads (id → level). Kept small on purpose.
  const OVERRIDES = {};
  function rate(recipe = {}) {
    // Techniques come from the steps; titles such as 焼きうどん / 包まない小籠包 would mislead.
    const text = (recipe.steps || []).join(" ");
    const found = SKILLS.filter((s) => s.re.test(text));
    const top = found.reduce((m, s) => Math.max(m, s.level), 1);
    // Several ★3 techniques in one dish (timing them together) count one step harder.
    const busy = top === 3 && found.filter((s) => s.level === 3).length >= 3 ? 1 : 0;
    const level = OVERRIDES[recipe.starterId || recipe.id] || Math.min(5, top + busy);
    return { level, label: LEVELS[level], skills: found.map((s) => s.id).sort((a, b) => SKILLS.findIndex((x) => x.id === b) - SKILLS.findIndex((x) => x.id === a)) };
  }
  const skillLabel = (id) => SKILLS.find((s) => s.id === id)?.label || id;
  const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const api = { SKILLS, LEVELS, rate, skillLabel, stars };
  root.Skills = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
