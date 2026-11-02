const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 2026-11-02：元の人数を手で決めたら、作る画面（献立の写し）のバナーも消える。手動の印と「⚡️ 異議あり」（APP_MAP §52-11）。
function app(latest = () => ({})) {
  const sent = [];
  const mem = {};
  const fetch = (url, opts = {}) => {
    if (String(url).endsWith("/api/recipes/latest")) return Promise.resolve({ ok: true, json: async () => ({ items: latest() }) });
    if (String(url).endsWith("/api/recipes/objections")) { sent.push(JSON.parse(opts.body)); return Promise.resolve({ ok: true, json: async () => ({ ok: true, id: "abcd1234" }) }); }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  const ctx = vm.createContext({ console, URL, Date, fetch, AbortController, setTimeout, clearTimeout, localStorage: { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return { run, sent };
}
const V = "oWLCye3SXu4";
const item = { videoId: V, title: "鶏むね肉のクリームソース", videoUrl: `https://www.youtube.com/watch?v=${V}`, revision: "r1", sourceServings: null, ingredients: [{ name: "鶏むね肉", amount: "1枚" }], steps: ["開く", "刻む", "焼く"], stepTimes: [16, 16, 121] };
const setup = (run) => run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend")); globalThis.d = today(); state.mealSlots[d] = { date: d, recipe: clone(own), status: "confirmed" }; globalThis.slot = state.mealSlots[d]; globalThis.old = { date: "2020-01-01", recipe: clone(own), status: "cooked" }; state.mealSlots["2020-01-01"] = old`);

test("tapping the count in the banner sets it on the saved recipe and on the meal-slot copy (the cook screen banner goes away), marked as set by hand", async () => {
  const { run } = app();
  setup(run);
  assert.equal(run("own.sourceServings"), null);
  assert.match(run("servingsUnknownBanner(slot.recipe, true, d)"), /life-servings-set.*2人分/s);
  assert.match(run("servingsUnknownBanner(slot.recipe, false, d)"), /編集できる人/);
  await run(`handleDailyAction("life-servings-set", { recipe: own.id, date: d, count: "2" })`);
  assert.equal(run("own.sourceServings"), 2);
  assert.equal(run("slot.recipe.sourceServings"), 2);
  assert.equal(run("slot.recipe.sourceServingsBy"), "manual");
  assert.equal(run("old.recipe.sourceServings"), null, "a meal already cooked keeps its record");
  assert.equal(run("servingsUnknownBanner(slot.recipe, true, d)"), "");
  assert.match(run("servingsManualNote(slot.recipe, d)"), /手動で設定.*2人分.*life-obj-open/s);
  assert.equal(run("servingsManualNote({ sourceServings: 2 })"), "", "counts read from the video show no note");
});

test("saving the count from the edit form also reaches the meal-slot copy, and marks it as set by hand", async () => {
  const { run } = app();
  setup(run);
  await run(`handleAction({ currentTarget: { dataset: { action: "edit-recipe", recipe: own.id } } })`);
  await run(`handleAction({ currentTarget: { dataset: { action: "set-source-servings", count: "3" } } })`);
  assert.equal(run("state.draft.servingsManual"), true);
  await run(`handleAction({ currentTarget: { dataset: { action: "save-recipe" } } })`);
  assert.equal(run("own.sourceServings"), 3);
  assert.equal(run("own.sourceServingsBy"), "manual");
  assert.equal(run("slot.recipe.sourceServings"), 3);
  assert.equal(run("slot.recipe.sourceServingsBy"), "manual");
});

test("a newer version from the operator whose count is still unknown does not undo the count set by hand", async () => {
  const newer = { ...item, revision: "r2", steps: ["開いて塩", "刻む", "焼く", "煮詰める"], stepTimes: [16, 48, 120, 216], sourceServings: null };
  const { run } = app(() => ({ [V]: newer }));
  setup(run);
  run("setRecipeServings(own.id, 2, { date: d })");
  await run("refreshSavedRecipes({ force: true })");
  assert.equal(run("own.steps.length"), 4, "the steps are replaced");
  assert.equal(run("own.sourceServings"), 2);
  assert.equal(run("own.sourceServingsBy"), "manual");
});

test("「⚡️ 異議あり」 sends the category, the shown count and the right count; the family recipe takes the right count at once", async () => {
  const { run, sent } = app();
  setup(run);
  run("setRecipeServings(own.id, 2, { date: d })");
  await run(`handleDailyAction("life-obj-open", { recipe: own.id, date: d, category: "servings" })`);
  assert.match(run("renderObjectionSheet()"), /このレシピに異議あり！.*2人分（手動で設定）.*異議を申し立てる/s);
  await run(`handleDailyAction("life-obj-servings", { count: "4" })`);
  await run("sendObjection()");
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].servings, { shown: 2, by: "manual", suggested: 4 });
  assert.equal(sent[0].videoId, V);
  assert.equal(sent[0].category, "servings");
  assert.equal(run("own.sourceServings"), 4);
  assert.equal(run("slot.recipe.sourceServings"), 4);
  assert.match(run("renderObjectionSheet()"), /受け付けました.*4人分/s);
  await run(`handleDailyAction("life-obj-close", {})`);
  assert.equal(run("renderObjectionSheet()"), "");
});

test("「その他」 needs a short comment before it is sent", async () => {
  const { run, sent } = app();
  setup(run);
  await run(`handleDailyAction("life-obj-open", { recipe: own.id, category: "other" })`);
  await run("sendObjection()");
  assert.equal(sent.length, 0);
  assert.match(run("renderObjectionSheet()"), /ひとこと書いてください/);
});
