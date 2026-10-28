const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");
const C = require("../scripts/catalog-taste.cjs");

// はじめのレシピを「新着の一覧」の形にして、親の料理名をつける（同じ料理名を3品ずつ）。
const list = () => ({ items: L.curated.map((r, i) => ({ videoId: `v${String(i).padStart(10, "0")}`, title: r.title, ingredients: r.ingredients, steps: r.steps, planning: r.planning, tags: r.tags || [], thumbnailUrl: `https://i.ytimg.com/vi/v${i}/hqdefault.jpg`, dish: { name: `料理${Math.floor(i / 3)}` } })) });

test("catalog taste inventory: counts by main ingredient, cuisine and flavour, and picks 12 dish names that spread out", () => {
  const r = C.analyze(list());
  assert.equal(r.total, L.curated.length);
  assert.equal(Object.values(r.protein).reduce((a, b) => a + b, 0), r.total, "every recipe has one main ingredient");
  assert.equal(Object.values(r.cuisine).reduce((a, b) => a + b, 0), r.total);
  assert.equal(r.picks.length, C.PICKS);
  assert.ok(r.picks.every((f) => f.n >= 3 && f.thumb), "only names with 3+ ways and a photo");
  assert.equal(new Set(r.picks.map((f) => f.name)).size, C.PICKS, "no duplicates");
  assert.ok(new Set(r.picks.map((f) => f.protein)).size >= 2 && new Set(r.picks.map((f) => f.cuisine)).size >= 2, "spread over main ingredients and cuisines");
  const md = C.markdown(r);
  assert.match(md, /集まったレシピの棚卸し/);
  assert.match(md, /写真の候補 12枚/);
});

test("catalog taste inventory: an empty or broken list does not crash", () => {
  for (const bad of [null, {}, { items: null }, { items: [null, { title: "x" }] }]) {
    const r = C.analyze(bad);
    assert.equal(r.picks.length, 0);
    assert.match(C.markdown(r), /0品/);
  }
});

// 棚卸しで見つかった見分け方の間違い（2026-10-28）がもどらないように。
test("main ingredient and flavour: katakana and kanji fish, stock is not the main, sweet-salty and garnish chili are not spicy", () => {
  const r = (title, names) => ({ title, ingredients: names.map((name) => ({ name })) });
  const main = (title, names) => L.traits(r(title, names)).protein;
  const tags = (title, names) => L.tags(r(title, names));
  assert.equal(main("ぶりの照り焼き", ["ブリ", "しょうゆ"]), "fish");
  assert.equal(main("かれいの煮付け", ["カレイ", "しょうが"]), "fish");
  assert.equal(main("サーモンのムニエル", ["サーモン", "バター"]), "fish");
  assert.equal(main("さばの味噌煮", ["鯖", "みそ"]), "fish");
  assert.equal(main("揚げ出し豆腐", ["豆腐", "かつお節", "めんつゆ"]), "eggtofu", "bonito flakes are not the main");
  assert.equal(main("野菜スープ", ["キャベツ", "鶏ガラスープの素"]), "veg", "chicken stock is not the main");
  assert.equal(main("カルボナーラうどん", ["うどん", "卵", "牛乳"]), "eggtofu", "milk is not beef");
  assert.equal(main("天津飯", ["卵", "カニカマ", "ごはん"]), "eggtofu", "crab sticks are not the main");
  assert.ok(!tags("豚汁", ["豚こま", "大根", "七味"]).includes("spicy"), "garnish chili");
  assert.ok(!tags("照り焼きチキン", ["鶏もも肉", "甘辛だれ"]).includes("spicy"), "甘辛");
  assert.ok(tags("麻婆豆腐", ["豆腐", "豚ひき肉", "豆板醤"]).includes("spicy"));
  assert.equal(L.traits(r("八宝菜", ["豚こま", "白菜", "オイスターソース"])).cuisine, "chinese", "seasonings still tell the cuisine");
  assert.ok(!L.tags({ title: "鶏むね肉のソテー", ingredients: [{ name: "鶏むね肉" }], steps: ["ふたをして蒸し焼きにする"] }).includes("light"), "a step does not make it light");
});
