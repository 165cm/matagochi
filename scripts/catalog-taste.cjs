/* 集まったレシピの棚卸し（好きな味の質問を作るため・2026-10-28 のユーザーの判断「1＋3」）。
   いま見えている新着（GET /api/trends の返事。読み出すだけで AI も YouTube API も使わない）を、
   親の料理名・主役・系統・味の方向で数え、「料理名の写真12枚」の候補を選ぶ。
   主役・系統・味は、アプリと同じ決め方（lifestyle.js の traits と tags）で決める。
   使い方：node scripts/catalog-taste.cjs trends.json   （要約の書き先は環境変数 GITHUB_STEP_SUMMARY） */
const fs = require("node:fs");
const path = require("node:path");
const L = require(path.join(__dirname, "..", "lifestyle.js"));

const PICKS = 12;
const MIN_CHILDREN = 3; // 写真の候補にする料理名は、作り方が3品以上あるもの（選んだら効く数があるように）
const PROTEIN = { meat: "肉", fish: "魚", eggtofu: "卵・豆腐", veg: "野菜" };
const CUISINE = { japanese: "和風", western: "洋風", chinese: "中華", ethnic: "エスニック" };
const MOOD = { light: "さっぱり", rich: "こってり", spicy: "ピリ辛", plain: "ふつう" };

const recipeOf = (i) => ({ title: i.title || "", ingredients: Array.isArray(i.ingredients) ? i.ingredients : [], steps: i.steps || [], planning: i.planning || null, tags: i.tags || [] });
function axesOf(item) {
  const r = recipeOf(item);
  const t = L.traits(r), tags = new Set(L.tags(r));
  return {
    protein: t.protein,
    cuisine: tags.has("ethnic") ? "ethnic" : t.cuisine,
    mood: tags.has("spicy") ? "spicy" : tags.has("light") && !tags.has("rich") ? "light" : tags.has("rich") ? "rich" : "plain",
  };
}
const parentName = (i) => String(i.dish?.name || i.dishName || "").trim();
const most = (list) => { const c = {}; list.forEach((x) => { c[x] = (c[x] || 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || ""; };
const pct = (n, all) => (all ? `${Math.round((n / all) * 100)}%` : "—");

function analyze(list) {
  const items = (Array.isArray(list?.items) ? list.items : []).filter((i) => i && i.videoId);
  const count = (axis) => { const c = {}; for (const i of items) { const k = axesOf(i)[axis]; c[k] = (c[k] || 0) + 1; } return c; };
  const parents = new Map();
  for (const i of items) {
    const name = parentName(i);
    if (!name) continue;
    const p = parents.get(name) || { name, children: [], thumb: "" };
    p.children.push(i);
    if (!p.thumb && i.thumbnailUrl) p.thumb = i.thumbnailUrl;
    parents.set(name, p);
  }
  const families = [...parents.values()].map((p) => {
    const ax = p.children.map(axesOf);
    return { name: p.name, n: p.children.length, thumb: p.thumb, videoId: p.children[0].videoId, protein: most(ax.map((a) => a.protein)), cuisine: most(ax.map((a) => a.cuisine)), mood: most(ax.map((a) => a.mood)) };
  }).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return { total: items.length, withParent: items.filter((i) => parentName(i)).length, protein: count("protein"), cuisine: count("cuisine"), mood: count("mood"), families, picks: pick(families) };
}

// 写真12枚：作り方の多い料理名から、主役・系統・味がまだ出ていないものを優先して選ぶ（偏らないように）。
function pick(families, n = PICKS) {
  const pool = families.filter((f) => f.n >= MIN_CHILDREN && f.thumb);
  const seen = { protein: new Set(), cuisine: new Set(), mood: new Set() };
  const out = [];
  while (out.length < n && pool.length) {
    const score = (f) => f.n + ["protein", "cuisine", "mood"].reduce((s, k) => s + (seen[k].has(f[k]) ? 0 : 8), 0)
      // 同じ組み合わせ（主役・系統・味）が続かないように
      - out.filter((o) => o.protein === f.protein && o.cuisine === f.cuisine && o.mood === f.mood).length * 10;
    pool.sort((a, b) => score(b) - score(a) || b.n - a.n || a.name.localeCompare(b.name));
    const f = pool.shift();
    out.push(f);
    for (const k of Object.keys(seen)) seen[k].add(f[k]);
  }
  return out;
}

function markdown(r) {
  const table = (title, counts, names) => [`### ${title}`, "", "| 分け方 | 品数 | 割合 |", "|---|---:|---:|", ...Object.entries(names).map(([k, label]) => `| ${label} | ${counts[k] || 0} | ${pct(counts[k] || 0, r.total)} |`), ""];
  const covered = r.picks.reduce((s, f) => s + f.n, 0);
  return [
    "## 集まったレシピの棚卸し（好きな味の質問のため）",
    "",
    `いま見えている新着 **${r.total}品**（親の料理名がわかる ${r.withParent}品・料理名 ${r.families.length}種）。AI も YouTube の検索も使わずに数えています。`,
    "",
    ...table("主役", r.protein, PROTEIN),
    ...table("系統", r.cuisine, CUISINE),
    ...table("味の方向", r.mood, MOOD),
    "### 作り方の多い料理名（上位30）",
    "",
    "| 料理名 | 作り方 | 主役 | 系統 | 味 |",
    "|---|---:|---|---|---|",
    ...r.families.slice(0, 30).map((f) => `| ${f.name} | ${f.n} | ${PROTEIN[f.protein] || ""} | ${CUISINE[f.cuisine] || ""} | ${MOOD[f.mood] || ""} |`),
    "",
    `### 写真の候補 ${r.picks.length}枚（作り方${MIN_CHILDREN}品以上・主役・系統・味が散らばるように）`,
    "",
    `この${r.picks.length}種で、新着の ${covered}品（${pct(covered, r.total)}）に直接効きます。`,
    "",
    "| # | 料理名 | 作り方 | 主役 | 系統 | 味 | 写真 |",
    "|---:|---|---:|---|---|---|---|",
    ...r.picks.map((f, i) => `| ${i + 1} | ${f.name} | ${f.n} | ${PROTEIN[f.protein] || ""} | ${CUISINE[f.cuisine] || ""} | ${MOOD[f.mood] || ""} | [見る](https://youtu.be/${f.videoId}) |`),
    "",
  ].join("\n") + "\n";
}

// 理想までの進み具合（2026-10-28 のユーザーの判断：理想の12品と、主役・味の割合の目安。api/src/ideal.js）。
// 毎朝の新着集めの最後に出す（.github/workflows/trends.yml）。
const GROUP_OF_PROTEIN = { meat: "肉", fish: "魚", eggtofu: "卵・豆腐", veg: "野菜が主役" };
function idealProgress(list, ideal) {
  const items = (Array.isArray(list?.items) ? list.items : []).filter((i) => i && i.videoId);
  const dishes = ideal.IDEAL_DISHES.map((d) => ({ ...d, n: items.filter((i) => parentName(i) === d.name).length, need: ideal.IDEAL_CHILDREN }));
  const ax = items.map(axesOf);
  const share = (pred) => (items.length ? ax.filter(pred).length / items.length : 0);
  const shares = Object.entries(ideal.TARGET_SHARES).map(([g, target]) => ({ group: g, target, share: g === "さっぱり" ? share((a) => a.mood === "light") : share((a) => GROUP_OF_PROTEIN[a.protein] === g) }));
  const short = dishes.reduce((s, d) => s + Math.max(0, d.need - d.n), 0) + shares.reduce((s, x) => s + Math.max(0, Math.ceil((x.target - x.share) * items.length)), 0);
  return { total: items.length, dishes, shares, short, done: dishes.every((d) => d.n >= d.need) && shares.every((x) => x.share >= x.target) };
}
function idealMarkdown(p) {
  const pc = (x) => `${Math.round(x * 100)}%`;
  return [
    `## 理想の品ぞろえまで：${p.done ? "✅ そろいました" : `あと約${p.short}品`}`,
    "",
    "| 理想の12品 | 作り方 | 目標 |",
    "|---|---:|---:|",
    ...p.dishes.map((d) => `| ${d.label} | ${d.n >= d.need ? `✅ ${d.n}` : d.n} | ${d.need} |`),
    "",
    "| 分野 | いま | 目安 |",
    "|---|---:|---:|",
    ...p.shares.map((x) => `| ${x.group} | ${x.share >= x.target ? "✅ " : ""}${pc(x.share)} | ${pc(x.target)} |`),
    "",
    `見えている新着 ${p.total}品から数えています（AI は使いません）。足りないものから先に補充します。`,
    "",
  ].join("\n") + "\n";
}

if (require.main === module) {
  (async () => {
    let list = null;
    try { list = JSON.parse(fs.readFileSync(process.argv[2], "utf8")); } catch {}
    let text;
    if (process.argv.includes("--ideal")) {
      const ideal = await import(require("node:url").pathToFileURL(path.join(__dirname, "..", "api", "src", "ideal.js")).href);
      text = idealMarkdown(idealProgress(list, ideal));
    } else text = markdown(analyze(list));
    console.log(text);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  })();
}

module.exports = { analyze, markdown, pick, axesOf, idealProgress, idealMarkdown, PICKS };
