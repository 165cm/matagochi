const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");
const Starter = require("../starter-recipes.js");

// 10分以内の夜ごはん（2026-10-29 のユーザーの依頼）：1人・平日10分以内でも、2週間は同じ料理をくり返さずに回せる品数と、
// 主役（肉・魚・卵豆腐・野菜）のかたよりの少なさを保つ。条件はゆるめず、実際にある料理だけで数える。
const WEEKDAY = "2026-10-07";
const quick = () => L.curated.filter((r) => L.fit(r, L.profile({ completed: true, servings: 1, weekdayMinutes: 10 }), WEEKDAY).ok);

test("quick dinners: 1 person, weekday 10 minutes still has two weeks of different dishes", () => {
  assert.ok(quick().length >= 14, `${quick().length} dishes`);
});

test("quick dinners: not mostly canned fish — meat, egg/tofu and vegetable dishes are there too", () => {
  const by = {};
  for (const r of quick()) by[L.traits(r).protein] = (by[L.traits(r).protein] || 0) + 1;
  assert.ok(by.meat >= 3 && by.eggtofu >= 3 && by.veg >= 2, JSON.stringify(by));
  assert.ok(by.fish <= quick().length / 3, JSON.stringify(by));
  const staples = new Set(quick().map((r) => L.traits(r).staple));
  assert.ok(staples.has("rice") && staples.has("noodle") && staples.has("bread"), [...staples].join(","));
});

test("quick dinners: no toaster or oven needed, so they also fit people who did not answer about tools", () => {
  for (const r of quick()) assert.ok(!r.planning.equipment.some((x) => ["トースター", "オーブン"].includes(x)), r.title);
});

test("starter dishes with raw meat say how long to heat it (center 75℃ for 1 minute)", () => {
  for (const r of Starter.recipes) {
    const raw = r.ingredients.filter((i) => i[2] === "肉" && !/ハム/.test(i[0]));
    if (raw.length) assert.ok(r.steps.some((s) => /75℃/.test(s)), r.title);
  }
});
