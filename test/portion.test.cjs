// 2026-11-20：食べる量（×0.5〜2.0・0.25 きざみ）。設定でまとめて、レシピごとにも。料理の画面・作る画面・買い物リストに効く。
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");

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
const R = { id: "p1", title: "生姜焼き", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", sourceServings: 2, ingredients: [{ name: "豚ロース", amount: "200g" }, { name: "醤油", amount: "大さじ1" }, { name: "卵", amount: "1個" }], steps: ["焼く"] };
const act = (action, data) => `handleAction({ currentTarget: { dataset: ${JSON.stringify({ action, ...data })} } })`;

test("the amount setting is kept between 0.5 and 2.0 in quarter steps", () => {
  const run = app();
  assert.equal(run("normalizePortion(1.3)"), 1.25);
  assert.equal(run("normalizePortion(5)"), 2);
  assert.equal(run("normalizePortion('x')"), 1);
  assert.equal(run("portionText(1)"), "×1.0");
  assert.equal(run("portionText(1.25)"), "×1.25");
  assert.equal(run("portionText(0.5)"), "×0.5");
});

test("the bulk setting multiplies every recipe; a recipe's own setting wins; going back to the usual amount removes it", async () => {
  const run = app();
  run(`globalThis.r = ${JSON.stringify(R)}`);
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 2)"), "200g");
  await run(act("adjust-portion", { delta: "0.25" }));
  await run(act("adjust-portion", { delta: "0.25" }));
  assert.equal(run("state.portion"), 1.5);
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 2)"), "300g");
  assert.equal(run("scaleIngredient(r, r.ingredients[1], 2)"), "大さじ1と1/2");
  assert.equal(run("scaleIngredient(r, r.ingredients[2], 2)"), "2個", "eggs stay whole");
  assert.equal(run("servingsLabel(r, 2)"), "2人分×1.5");
  // この料理だけ ×0.75
  run(`handleDailyAction("life-portion", { key: portionKey(r), delta: "-0.25" }); handleDailyAction("life-portion", { key: portionKey(r), delta: "-0.25" }); handleDailyAction("life-portion", { key: portionKey(r), delta: "-0.25" })`);
  assert.equal(run("portionOf(r)"), 0.75);
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 2)"), "150g");
  assert.equal(run("portionOf({ id: 'other' })"), 1.5, "other recipes keep the bulk amount");
  assert.match(run("portionControl(r)"), /いつもの量（×1\.5）に戻す/);
  run(`handleDailyAction("life-portion-reset", { key: portionKey(r) })`);
  assert.equal(run("portionOf(r)"), 1.5);
  assert.equal(run("Object.keys(state.portionByRecipe).length"), 0);
  assert.doesNotMatch(run("portionControl(r)"), /いつもの量/);
});

test("a recipe with no known count is multiplied from the video's amounts; the shopping list follows the recipe's amount", () => {
  const run = app();
  run(`globalThis.r = { id: 'u1', title: 'サラダ', sourceServings: null, ingredients: [{ name: 'キャベツ', amount: '1/4個' }], steps: [] }; state.portion = 2`);
  assert.equal(run("scaleIngredient(r, r.ingredients[0], 4)"), "1/2個");
  assert.equal(run("servingsLabel(r, 4)"), "動画の分量の×2.0");
  run(`globalThis.g = ${JSON.stringify(R)}; state.portionByRecipe[portionKey(g)] = 0.5`);
  assert.equal(run("shoppingScale('200g', 2, 2, g, '豚ロース')"), "100g");
  assert.equal(run("shoppingScale('大さじ1', 2, 2, undefined, '醤油')"), "大さじ2", "side dishes use the bulk amount");
});

test("the amount is saved, synced like the other settings, and shown in the settings", () => {
  const run = app();
  run("state.portion = 1.25; state.portionByRecipe = { 'v:abcdefghijk': 0.75 }");
  const payload = JSON.parse(run("JSON.stringify(buildSyncPayload())"));
  assert.equal(payload.portion, 1.25);
  assert.deepEqual(payload.portionByRecipe, { "v:abcdefghijk": 0.75 });
  run("state.portion = 1; state.portionByRecipe = {}");
  run(`applySyncPayload(${JSON.stringify(payload)})`);
  assert.equal(run("state.portion"), 1.25);
  assert.equal(run("state.portionByRecipe['v:abcdefghijk']"), 0.75);
  const html = run("renderSettings()");
  assert.match(html, /食べる量/);
  assert.match(html, /×1\.25/);
});
