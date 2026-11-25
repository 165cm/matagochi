// 2026-11-24：理想の12品の探し方の点検（健康診断の表）。
const test = require("node:test");
const assert = require("node:assert/strict");
const { markdown } = require("../scripts/ideal-log.cjs");

test("only dishes that are not complete are listed, with the missing kind, the next word, the waiting day and what each search found", () => {
  const md = markdown({ dishes: [
    { name: "豚の生姜焼き", full: true, stock: { quick: 6, long: 2 }, max: 8, quickMax: 8, longMax: 2, quick: { need: 0 }, long: { need: 0 }, searches: [] },
    { name: "冷しゃぶ", full: false, stock: { quick: 6, long: 0 }, max: 8, quickMax: 8, longMax: 2, quick: { need: 0, used: 12, words: 12, next: "", waitUntil: "" }, long: { need: 2, used: 2, words: 2, next: "", waitUntil: "2026-12-10" },
      searches: [{ at: "2026-11-25T01:00:00Z", q: "冷しゃぶ 人気 レシピ 材料", found: 20, picked: 3, ai: 2, added: 0, why: { parent_long: 2, filtered: 15 } }] },
  ] });
  assert.ok(!md.includes("| 豚の生姜焼き |"));
  assert.match(md, /\| 冷しゃぶ \| 6／0（8品まで・30分以上は2品まで） \| 0／2 \|/);
  assert.match(md, /30分以上：12\/10まで/);
  assert.match(md, /\| 冷しゃぶ \| 11\/25 \| 冷しゃぶ 人気 \| 20 \| 3 \| 2 \| 0 \| 題名・掲載停止・もう試した 15・20分以内はもう上限（30分以上だけ欲しい） 2 \|/);
});

test("an old API or no answer: say so instead of failing", () => {
  assert.match(markdown(null), /記録を読めませんでした/);
  assert.match(markdown({ dishes: [] }), /12品とも/);
});
