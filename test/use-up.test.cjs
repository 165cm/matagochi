const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");

// 提案3：同じ買い物のまとまりの中で、余りやすい食材（キャベツ・大根・豆腐など）を別の日にも使い回す。
const start = "2026-09-23";
const addDays = (d, n) => {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const profile = L.profile({ equipment: Object.fromEntries(L.equipment.map((x) => [x, "have"])) });
const recipe = (id, title, names) => ({
  id, title, mealType: "dinner", ingredients: names.map((name) => ({ name })), steps: ["炒める"],
  planning: { minutes: 15, easy: true, equipment: ["フライパン"], tasks: [], contains: [], conditionsConfirmed: true, ingredientsVerified: true },
});
const slotOf = (date, r) => ({ date, status: "confirmed", recipe: r, mealType: "dinner", servings: 2 });
const pickDay1 = (recipes, first, extra = {}) =>
  L.propose({ recipes, profile, start, length: 2, addDays, slots: { [start]: slotOf(start, first) }, ...extra })[1].candidate;

const pork = recipe("pork-cabbage", "豚とキャベツの味噌炒め", ["豚こま切れ肉", "キャベツ", "味噌"]);

test("useUpKeys: finds produce that is usually left over; ignores canned, processed and seasoning", () => {
  assert.deepEqual([...L.useUpKeys(recipe("a", "a", ["キャベツ", "にんじん", "ツナ缶", "トマト缶", "トマトケチャップ", "ベーコン", "塩"]))].sort(), ["キャベツ", "にんじん"].sort());
  assert.deepEqual([...L.useUpKeys(recipe("b", "b", ["木綿豆腐", "ニラ"]))].sort(), ["ニラ", "豆腐"].sort());
});

test("a dish that shares cabbage with another day in the round is nudged up, with a reason naming the day", () => {
  const withCabbage = recipe("z-chicken-cabbage", "鶏とキャベツの塩炒め", ["鶏もも肉", "キャベツ", "塩"]);
  const without = recipe("a-chicken-zucchini", "鶏とズッキーニの塩炒め", ["鶏もも肉", "ズッキーニ", "塩"]);
  // ID の並びでは「without」が先に来るのに、キャベツの方が選ばれる
  const day = pickDay1([pork, withCabbage, without], pork);
  assert.equal(day.recipe.id, withCabbage.id);
  assert.match(day.reasons.join(), /🥬 .のキャベツを使い回し/);
  assert.equal(day.useUp.score, 1.5);
});

test("without anything to share, nothing changes and there is no reason", () => {
  const plain = recipe("plain", "鶏の塩焼き", ["鶏もも肉", "塩"]);
  const noCabbage = recipe("no-cabbage", "豚の生姜焼き", ["豚ロース", "しょうが"]);
  const day = pickDay1([noCabbage, plain], noCabbage);
  assert.equal(day.useUp.score, 0);
  assert.ok(!day.reasons.some((r) => /使い回し/.test(r)));
});

test("the nudge is small: it never beats the rotation penalty (same protein the day before still loses)", () => {
  const samePorkCabbage = recipe("a-pork-cabbage2", "回鍋肉", ["豚バラ肉", "キャベツ", "甜麺醤"]);
  const fish = recipe("z-fish", "鮭の塩焼き", ["鮭", "塩"]);
  const day = pickDay1([samePorkCabbage, fish], pork);
  assert.equal(day.recipe.id, fish.id);
});

test("only the same shopping round counts: a dish after the round ends gets no bonus", () => {
  const withCabbage = recipe("z-chicken-cabbage", "鶏とキャベツの塩炒め", ["鶏もも肉", "キャベツ", "塩"]);
  const without = recipe("a-chicken-zucchini", "鶏とズッキーニの塩炒め", ["鶏もも肉", "ズッキーニ", "塩"]);
  // 1日目と2日目は別の買い物のまとまり
  const day = pickDay1([pork, withCabbage, without], pork, { rounds: [[start], [addDays(start, 1)]] });
  assert.equal(day.useUp.score, 0);
  // 同じまとまりなら加点される（キャベツの方が選ばれ、理由が付く）
  const together = pickDay1([pork, withCabbage, without], pork, { rounds: [[start, addDays(start, 1)]] });
  assert.equal(together.recipe.id, withCabbage.id);
  assert.equal(together.useUp.score, 1.5);
});

test("a day the user picked ahead (override) also counts for the days before it", () => {
  const withCabbage = recipe("z-chicken-cabbage", "鶏とキャベツの塩炒め", ["鶏もも肉", "キャベツ", "塩"]);
  const without = recipe("a-chicken-zucchini", "鶏とズッキーニの塩炒め", ["鶏もも肉", "ズッキーニ", "塩"]);
  const pick = recipe("pick", "お好み焼き", ["豚バラ肉", "キャベツ", "小麦粉"]);
  const plan = L.propose({ recipes: [withCabbage, without, pick], profile, start, length: 3, addDays, overrides: { [addDays(start, 2)]: pick.id } });
  assert.equal(plan[2].candidate.recipe.id, pick.id);
  assert.equal(plan[0].candidate.recipe.id, withCabbage.id);
});
