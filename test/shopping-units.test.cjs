const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function app() {
  const ctx = vm.createContext({
    console,
    URL,
    Date,
    document: { querySelector: () => null, querySelectorAll: () => [] },
  });
  for (const f of [
    "dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js",
    "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js",
    "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js",
    "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js",
    "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js",
    "account.js", "discover.js", "app.js"
  ]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js")
      s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}

test("Lifestyle.parseAmountParts: parses fractions, mixed numbers, half prefix and full-width", () => {
  assert.deepEqual(L.parseAmountParts("200g"), { prefix: "", value: 200, unit: "g", step: 25 });
  assert.deepEqual(L.parseAmountParts("1/2個"), { prefix: "", value: 0.5, unit: "個", step: 1 });
  assert.deepEqual(L.parseAmountParts("1/4玉"), { prefix: "", value: 0.25, unit: "玉", step: 1 });
  assert.deepEqual(L.parseAmountParts("3/4丁"), { prefix: "", value: 0.75, unit: "丁", step: 1 });
  assert.deepEqual(L.parseAmountParts("1と1/2本"), { prefix: "", value: 1.5, unit: "本", step: 1 });
  assert.deepEqual(L.parseAmountParts("1 1/2本"), { prefix: "", value: 1.5, unit: "本", step: 1 });
  assert.deepEqual(L.parseAmountParts("半個"), { prefix: "", value: 0.5, unit: "個", step: 0.5 });
  assert.deepEqual(L.parseAmountParts("半丁"), { prefix: "", value: 0.5, unit: "丁", step: 0.5 });
  assert.deepEqual(L.parseAmountParts("２００ｇ"), { prefix: "", value: 200, unit: "g", step: 25 });
  assert.deepEqual(L.parseAmountParts("１／２個"), { prefix: "", value: 0.5, unit: "個", step: 1 });
  assert.deepEqual(L.parseAmountParts("大さじ1/2"), { prefix: "大さじ", value: 0.5, unit: "", step: 0.5 });
  assert.deepEqual(L.parseAmountParts("約300g"), { prefix: "約", value: 300, unit: "g", step: 25 });
  assert.equal(L.parseAmountParts("適量"), null);
  assert.equal(L.parseAmountParts("少々"), null);
});

test("Lifestyle.combineAmounts: merges same units, including fractions and clean totals", () => {
  assert.equal(L.combineAmounts(["100g", "150g"], "ごはん"), "250g");
  assert.equal(L.combineAmounts(["1/4個", "1/4個"], "キャベツ"), "1/2個");
  assert.equal(L.combineAmounts(["1/2丁", "1/2丁"], "木綿豆腐"), "1丁");
  assert.equal(L.combineAmounts(["1本", "1本"], "きゅうり"), "2本");
  assert.equal(L.combineAmounts(["大さじ1", "大さじ1/2"], "しょうゆ"), "大さじ1.5");
});

test("Lifestyle.combineAmounts: provides realistic packaging guidance on awkward fractions", () => {
  assert.equal(L.combineAmounts(["0.75丁"], "絹豆腐"), "3/4丁（目安: 1丁）");
  assert.equal(L.combineAmounts(["1.5丁"], "木綿豆腐"), "1.5丁（目安: 2丁）");
  assert.equal(L.combineAmounts(["1.5個"], "卵"), "1.5個（目安: 2個）");
  assert.equal(L.combineAmounts(["8個"], "卵"), "8個（目安: 1パック（10個））");
  assert.equal(L.combineAmounts(["350g"], "豚ひき肉"), "350g（目安: 2パック）");
  assert.equal(L.combineAmounts(["150g"], "豚ひき肉"), "150g（目安: 1パック）");
  assert.equal(L.combineAmounts(["1.5袋"], "もやし"), "1.5袋（目安: 2袋）");
});

test("Lifestyle.combineAmounts: merges heterogeneous units with ingredient conversion dictionary", () => {
  // 鶏もも肉: 1枚 ≒ 250g
  assert.equal(L.combineAmounts(["1枚", "150g"], "鶏もも肉"), "約400g（目安: 2枚）");
  // キャベツ: 1個 ≒ 1000g, 1/4個 ≒ 250g
  assert.equal(L.combineAmounts(["1/4個", "200g"], "キャベツ"), "約450g（目安: 1/2玉）");
  assert.equal(L.combineAmounts(["1/4玉", "1/4個"], "キャベツ"), "約500g（目安: 1/2玉）");
  // 大根: 1本 ≒ 1000g, 10cm ≒ 350g
  assert.equal(L.combineAmounts(["10cm", "200g"], "大根"), "約550g（目安: 1/2本）");
  // にんじん: 1本 ≒ 150g
  assert.equal(L.combineAmounts(["1本", "50g"], "にんじん"), "約200g（目安: 2本）");
  // 玉ねぎ: 1個 ≒ 200g
  assert.equal(L.combineAmounts(["1個", "100g"], "玉ねぎ"), "約300g（目安: 2個）");
  // ひき肉: 1パック ≒ 200g
  assert.equal(L.combineAmounts(["1パック", "200g"], "豚ひき肉"), "約400g（目安: 2パック）");
  // 未知の食材はフォールバックして元の表記を残す
  assert.equal(L.combineAmounts(["1本", "150g"], "未知の食材"), "1本 + 150g");
});

test("app integration: dailyShopping combines heterogeneous units across days and displays in UI", () => {
  const run = app();
  const recipeA = JSON.stringify({
    id: "r-chicken-1",
    title: "鶏の照り焼き",
    sourceServings: 1,
    ingredients: [
      { name: "鶏もも肉", amount: "1枚", category: "肉" },
      { name: "キャベツ", amount: "1/4個", category: "野菜" }
    ],
    steps: ["焼く"]
  });
  const recipeB = JSON.stringify({
    id: "r-chicken-2",
    title: "チキンソテー",
    sourceServings: 1,
    ingredients: [
      { name: "鶏もも肉", amount: "150g", category: "肉" },
      { name: "キャベツ", amount: "200g", category: "野菜" }
    ],
    steps: ["焼く"]
  });

  run(`
    state.mealSlots[today()] = { date: today(), status: "confirmed", servings: 1, recipe: ${recipeA} };
    state.mealSlots[addDays(today(), 1)] = { date: addDays(today(), 1), status: "confirmed", servings: 1, recipe: ${recipeB} };
  `);

  const chicken = JSON.parse(run('JSON.stringify(dailyShopping().find(i => i.name === "鶏もも肉"))'));
  assert.ok(chicken, "chicken exists on shopping list");
  assert.equal(chicken.amount, "約400g（目安: 2枚）");

  const cabbage = JSON.parse(run('JSON.stringify(dailyShopping().find(i => i.name === "キャベツ"))'));
  assert.ok(cabbage, "cabbage exists on shopping list");
  assert.equal(cabbage.amount, "約450g（目安: 1/2玉）");

  const html = run("renderDailyShopping()");
  assert.match(html, /約400g（目安: 2枚）/);
  assert.match(html, /約450g（目安: 1\/2玉）/);

  const text = run("shoppingListText()");
  assert.match(text, /・鶏もも肉 約400g（目安: 2枚）/);
  assert.match(text, /・キャベツ 約450g（目安: 1\/2玉）/);
});
