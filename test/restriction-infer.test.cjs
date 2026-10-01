const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");

// 食べられないもの（restrictions）は、原材料の印（planning.contains・allergens）がない料理でも、材料名からの推測で外す。
// 以前は「豚こま」が「肉なし」を、「鮭」が「魚なし」を通っていた（PR 4a の棚卸しで見つけた）。
const meta = { ingredientsVerified: true, minutes: 15, easy: true, tasks: [], noEquipment: true, conditionsConfirmed: true };
const dish = (title, names) => ({ id: title, title, mealType: "dinner", ingredients: names.map((name) => ({ name, amount: "1" })), steps: [], planning: { ...meta } });
const ok = (recipe, raw) => L.fit(recipe, L.profile({ completed: true, ...raw }), "2026-10-07").ok;

test("restrictions also use what the ingredient names imply, even without allergen labels", () => {
  assert.equal(ok(dish("豚こまの塩炒め", ["豚こま", "キャベツ"]), { restrictions: ["肉"] }), false);
  assert.equal(ok(dish("牛こまのしぐれ煮", ["牛こま", "しょうが"]), { restrictions: ["肉"] }), false);
  assert.equal(ok(dish("ささみのレンジ蒸し", ["ささみ"]), { restrictions: ["肉"] }), false);
  assert.equal(ok(dish("鮭のホイル焼き", ["鮭", "きのこ"]), { restrictions: ["魚"] }), false);
  assert.equal(ok(dish("ぶりの照り焼き", ["ぶり"]), { restrictions: ["魚"] }), false);
  assert.equal(ok(dish("野菜炒め", ["キャベツ", "しょうゆ"]), { restrictions: ["小麦"] }), false, "しょうゆ contains wheat");
  assert.equal(ok(dish("ミルクスープ", ["牛乳", "じゃがいも"]), { restrictions: ["肉"] }), true, "牛乳 is not meat");
  assert.equal(ok(dish("ひきわり納豆ごはん", ["ひきわり納豆", "ごはん"]), { restrictions: ["肉"] }), true);
  assert.equal(ok(dish("豚こまの塩炒め", ["豚こま", "キャベツ"]), {}), true, "no restriction → fine");
});

test("dislikes are not widened by the guesses (e.g. miso is not 'fish' for someone who just dislikes fish)", () => {
  assert.equal(ok(dish("豆腐のみそ汁", ["豆腐", "みそ"]), { dislikes: ["魚"] }), true);
  assert.equal(ok(dish("豆腐のみそ汁", ["豆腐", "みそ"]), { restrictions: ["魚"] }), false, "a restriction is careful: miso may contain fish stock");
  assert.equal(ok(dish("鮭のホイル焼き", ["鮭"]), { dislikes: ["鮭"] }), false, "named ingredients still count for dislikes");
});

test("review fix (#115): 牛蒡 is not meat, and common spellings (katakana, half-width, kanji) are caught", () => {
  assert.equal(ok(dish("きんぴら", ["牛蒡", "にんじん"]), { restrictions: ["肉"] }), true, "牛蒡 (burdock) is a vegetable");
  for (const name of ["タラ", "ﾀﾗ", "ブリ", "マグロ", "サーモン", "アジ", "カジキ", "鱈", "鰤", "鮪"]) assert.equal(ok(dish(`${name}の料理`, [name]), { restrictions: ["魚"] }), false, name);
  for (const name of ["ササミ", "笹身", "合挽き肉", "合挽き", "合びき", "牛こま", "ベーコン", "ｳｲﾝﾅｰ"]) assert.equal(ok(dish(`${name}の料理`, [name]), { restrictions: ["肉"] }), false, name);
  // 似た名前の別のもの
  for (const name of ["タラゴン", "ブリオッシュ", "アジアンソース"]) assert.equal(ok(dish(`${name}の料理`, [name]), { restrictions: ["魚"] }), true, name);
});
