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
