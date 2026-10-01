/* 品ぞろえの棚卸し（PR 4a・docs/PERSONALIZE_PLAN.md §7.2）。
   「主材料・味付け・10/20/30分・器具・調理負担・元人数」で何品あるかと、
   よくある条件（時間・食材制限）で献立の候補が何品残るか（Lifestyle.fit。条件はゆるめない）を数える。
   使い方：node scripts/catalog-coverage.cjs            → docs/CATALOG_COVERAGE.md を書き直す
           node scripts/catalog-coverage.cjs --check    → 書き直さずに、表が古くなっていないかだけ確かめる（CI 用ではなく手元用）
   100品あるように見せかけない：数えるのは実際にある料理だけ。目標の数（MIN_CELL・MIN_WEEK）は仮の値。 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

const MIN_CELL = 3; // 主材料×時間のひとますに、最低これだけ（仮）
const MIN_WEEK = 7; // 条件をつけても、1週間ぶん（7品）は残ってほしい（仮）
const MIN_TWO_WEEKS = 14; // 2週間、同じ料理を出さずに回せる数（仮）
const WEEKDAY = "2026-10-07"; // 水曜（平日の時間で見る）

const PROTEIN = [["meat", "肉"], ["fish", "魚"], ["eggtofu", "卵・豆腐"], ["veg", "野菜が主役"]];
const TIME = [["t10", "10分以内"], ["t20", "11〜20分"], ["t30", "21〜30分"], ["t31", "31分以上"], ["tx", "時間が不明"]];
const timeOf = (r) => { const m = r?.planning?.minutes; return !m ? "tx" : m <= 10 ? "t10" : m <= 20 ? "t20" : m <= 30 ? "t30" : "t31"; };
// よくある条件。profile は Lifestyle.profile に渡す答え。
const CONDITIONS = [
  ["条件なし", {}],
  ["平日20分以内", { weekdayMinutes: 20 }],
  ["平日15分以内・かんたん", { weekdayMinutes: 15, skill: "easy" }],
  ["卵なし", { restrictions: ["卵"] }],
  ["乳なし", { restrictions: ["乳"] }],
  ["小麦なし", { restrictions: ["小麦"] }],
  ["えび・かになし", { restrictions: ["えび", "かに"] }],
  ["魚なし", { restrictions: ["魚"] }],
  ["肉なし", { restrictions: ["肉"] }],
  ["卵・乳・小麦なし", { restrictions: ["卵", "乳", "小麦"] }],
];

function coverage(recipes, { date = WEEKDAY } = {}) {
  const list = (recipes || []).filter((r) => r && r.mealType !== "lunch");
  const count = (pred) => list.filter(pred).length;
  const grid = PROTEIN.map(([p, label]) => {
    const row = Object.fromEntries(TIME.map(([t]) => [t, count((r) => L.traits(r).protein === p && timeOf(r) === t)]));
    const within30 = row.t10 + row.t20 + row.t30;
    return { id: p, label, ...row, total: Object.values(row).reduce((a, b) => a + b, 0), short: TIME.slice(0, 3).filter(([t]) => row[t] < MIN_CELL).map(([, l]) => l), within30 };
  });
  const tagCount = (ids) => ids.map(([id, label]) => ({ id, label, n: count((r) => L.tags(r).includes(id)) }));
  const axes = {
    staple: [["rice", "ごはんもの"], ["noodle", "麺"], ["bread", "パン"], ["other", "おかず"]].map(([id, label]) => ({ id, label, n: count((r) => L.traits(r).staple === id) })),
    cuisine: [["japanese", "和風"], ["western", "洋風"], ["chinese", "中華"]].map(([id, label]) => ({ id, label, n: count((r) => L.traits(r).cuisine === id) })),
    taste: tagCount([["light", "さっぱり"], ["spicy", "ピリ辛"], ["rich", "こってり"], ["soup", "汁もの"]]),
    tool: tagCount([["micro", "レンジ"], ["pan", "フライパン"], ["pot", "鍋"]]),
    load: [
      { id: "easy", label: "かんたん（★1〜2）", n: count((r) => L.tags(r).includes("easy")) },
      { id: "noknife", label: "包丁を使わない", n: count((r) => (r.planning?.equipment || []).length > 0 && !(r.planning.equipment || []).includes("包丁")) },
    ],
    info: [
      { id: "servings", label: "元の人数が分かる", n: count((r) => Number(r.sourceServings) > 0) },
      { id: "verified", label: "材料・条件を確認ずみ", n: count((r) => r.planning?.ingredientsVerified && r.planning?.minutes && r.planning?.conditionsConfirmed !== false) },
    ],
  };
  const conditions = CONDITIONS.map(([label, raw]) => {
    const p = L.profile({ completed: true, ...raw });
    const n = count((r) => L.fit(r, p, date).ok);
    return { label, n, week: n >= MIN_WEEK, twoWeeks: n >= MIN_TWO_WEEKS };
  });
  return { total: list.length, grid, axes, conditions, min: { cell: MIN_CELL, week: MIN_WEEK, twoWeeks: MIN_TWO_WEEKS } };
}

function markdown(c, source) {
  const out = [];
  out.push("# 品ぞろえの棚卸し（CATALOG_COVERAGE）", "");
  out.push(`\`node scripts/catalog-coverage.cjs\` で作る表です（手で直さない）。対象：${source}・**${c.total}品**。`, "");
  out.push(`目標の数は仮の値です：主材料×時間のひとますに${c.min.cell}品／条件をつけても1週間ぶん（${c.min.week}品）・2週間ぶん（${c.min.twoWeeks}品）。`);
  out.push("数えるのは実際にある料理だけです（100品あるように見せかけない）。条件で候補が足りない時も、アプリは条件をゆるめません。", "");
  out.push("## 主材料 × かかる時間", "");
  out.push(`| 主材料 | ${TIME.map(([, l]) => l).join(" | ")} | 合計 | 足りない（30分以内で${c.min.cell}品未満） |`);
  out.push(`|---|${TIME.map(() => "---:").join("|")}|---:|---|`);
  for (const g of c.grid) out.push(`| ${g.label} | ${TIME.map(([t]) => g[t]).join(" | ")} | ${g.total} | ${g.short.length ? "⚠️ " + g.short.join("・") : "—"} |`);
  out.push("");
  const axis = (title, rows) => { out.push(`## ${title}`, "", "| 分け方 | 品数 |", "|---|---:|", ...rows.map((r) => `| ${r.label} | ${r.n} |`), ""); };
  axis("主食", c.axes.staple);
  axis("味の系統", c.axes.cuisine);
  axis("味・汁もの", c.axes.taste);
  axis("使う道具", c.axes.tool);
  axis("調理の負担", c.axes.load);
  axis("情報のそろい方", c.axes.info);
  out.push("## 条件をつけた時に残る品数（平日の献立・Lifestyle.fit）", "");
  out.push("| 条件 | 残る品数 | 1週間ぶん | 2週間ぶん |", "|---|---:|:---:|:---:|");
  for (const x of c.conditions) out.push(`| ${x.label} | ${x.n} | ${x.week ? "✓" : "⚠️ 足りない"} | ${x.twoWeeks ? "✓" : "⚠️ 足りない"} |`);
  out.push("");
  return out.join("\n");
}

module.exports = { coverage, markdown, CONDITIONS, MIN_CELL, MIN_WEEK, MIN_TWO_WEEKS };

if (require.main === module) {
  const file = path.join(__dirname, "..", "docs", "CATALOG_COVERAGE.md");
  const text = markdown(coverage(L.curated), "アプリに最初から入っているおすすめ料理（`Lifestyle.curated`）");
  if (process.argv.includes("--check")) {
    const same = fs.existsSync(file) && fs.readFileSync(file, "utf8") === text;
    console.log(same ? "docs/CATALOG_COVERAGE.md is up to date" : "docs/CATALOG_COVERAGE.md is out of date — run node scripts/catalog-coverage.cjs");
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(file, text);
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
