// 2026-11-20：人数の分からないレシピは、主役の材料の量から目安の人数を出す。かけ算した分量は台所で量りやすい数に。
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");
const L = require("../lifestyle.js");

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "table-review.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};");
  return run;
}
const R = (ingredients) => ({ title: "t", ingredients: ingredients.map(([name, amount]) => ({ name, amount })) });

test("estimate: meat/fish 100g = 1, chicken thigh 1 piece = 2, fillet = 1, staples and tofu as fallbacks, nothing when unsure", () => {
  assert.equal(L.estimateServings(R([["豚こま切れ肉", "200g"], ["玉ねぎ", "1/2個"]])), 2);
  assert.equal(L.estimateServings(R([["鶏もも肉", "1枚"]])), 2);
  assert.equal(L.estimateServings(R([["生鮭", "3切れ"]])), 3);
  assert.equal(L.estimateServings(R([["スパゲッティ", "200g"], ["にんにく", "1片"]])), 2);
  assert.equal(L.estimateServings(R([["米", "2合"]])), 4);
  assert.equal(L.estimateServings(R([["木綿豆腐", "1丁"], ["ねぎ", "少々"]])), 2);
  assert.equal(L.estimateServings(R([["キャベツ", "1/4個"]])), null, "no main ingredient: no guess");
});

test("rounding: grams to 10 (5 under 100), spoons and pieces to 1/2, eggs whole, 適量 as is; old results still hold", () => {
  const run = app();
  const s = (a, n, src, name = "") => run(`scaleAmountForServings(${JSON.stringify(a)}, ${n}, ${src}, ${JSON.stringify(name)})`);
  assert.equal(s("300g", 1, 2), "150g");
  assert.equal(s("120g", 3, 2), "180g");
  assert.equal(s("70g", 1, 3), "25g");
  assert.equal(s("大さじ1", 3, 2), "大さじ1と1/2");
  assert.equal(s("大さじ1と1/2", 4, 2), "大さじ3");
  assert.equal(s("小さじ1", 1, 3), "小さじ1/3");
  assert.equal(s("1/2個", 3, 2), "3/4個");
  assert.equal(s("1本", 5, 2), "2と1/2本");
  assert.equal(s("2個", 3, 4, "卵"), "2個");
  assert.equal(s("1個", 1, 3, "卵"), "1個", "at least one egg");
  assert.equal(s("適量", 3, 2), "適量");
  assert.equal(s("大さじ1/2", 2, 4), "大さじ1/4");
  assert.equal(s("1/4個", 1, 2), "1/8個");
});

test("a recipe with no count is scaled from the estimate, and the screen says it is an estimate", () => {
  const run = app();
  const r = { id: "x1", title: "生姜焼き", sourceServings: null, ingredients: [{ name: "豚ロース", amount: "200g" }, { name: "醤油", amount: "大さじ2" }], steps: ["焼く"] };
  run(`globalThis.r = ${JSON.stringify(r)}`);
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 4)"), "400g");
  assert.equal(run("scaleIngredient(r, r.ingredients[1], 3)"), "大さじ3");
  assert.equal(run("servingsLabel(r, 4)"), "4人分（元は目安で2人分）");
  assert.match(run("servingsUnknownBanner(r, true, '')"), /目安で2人分.*正しい人数を選ぶ/s);
  assert.doesNotMatch(run("servingsUnknownBanner(r, true, '')"), /未確認/);
  run("r.ingredients = [{ name: 'キャベツ', amount: '1/4個' }]");
  assert.equal(run("servingsLabel(r, 4)"), "動画の分量のまま");
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 4)"), "1/4個");
});
