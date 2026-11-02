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
  assert.match(run("servingsManualNote(slot.recipe)"), /手動で設定.*2人分/s);
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

test("「⚡️ 異議あり」 is for the whole recipe: it sits in the top row of the recipe and cook screens, and asks which part is wrong", async () => {
  const { run, sent } = app();
  setup(run);
  assert.match(run("objectionButton(own)"), /life-obj-open.*異議あり/s);
  assert.equal(run(`objectionButton({ id: "x", title: "手書き", videoUrl: "" })`), "", "only recipes with a video");
  run(`recipeDetailId = own.id; state.view = "recipe"`);
  assert.match(run("renderRecipeDetail()"), /class="detail-top">.*life-obj-open/s);
  run(`cookingDate = d; state.view = "cooking"`);
  assert.match(run("renderCooking()"), /class="detail-top">.*life-obj-open[^>]*data-date/s);
  await run(`handleDailyAction("life-obj-open", { recipe: own.id, date: d })`);
  assert.doesNotMatch(run("renderObjectionSheet()"), /aria-pressed="true"><span aria-hidden="true">/, "nothing chosen yet");
  await run("sendObjection()");
  assert.equal(sent.length, 0);
  assert.match(run("renderObjectionSheet()"), /どこに異議があるか選んでください/);
  await run(`handleDailyAction("life-obj-cat", { category: "steps" })`);
  await run("sendObjection()");
  assert.equal(sent[0].category, "steps");
  assert.equal(sent[0].servings, undefined);
});

// Claude review #216
test("review: the count only goes to the recipe that was set (and its copies), not to another recipe the user made from the same video", async () => {
  const { run } = app();
  setup(run);
  run(`globalThis.mine = { ...clone(own), id: "r-mine", starterId: undefined, sourceServings: 3 }; state.recipes.push(mine)`);
  run("setRecipeServings(own.id, 2, { date: d })");
  assert.equal(run("own.sourceServings"), 2);
  assert.equal(run("slot.recipe.sourceServings"), 2);
  assert.equal(run("mine.sourceServings"), 3, "the user's other recipe keeps its own count");
});

test("review: 「⚡️ 異議あり」 opens for the suggested dish on the cook screen (not yet in the plan)", async () => {
  const { run } = app();
  run(`globalThis.d = today(); globalThis.cand = { id: "trend-${V}", title: "提案の料理", videoUrl: "${item.videoUrl}", ingredients: [], steps: ["a", "b"] }; dailyPlan = () => [{ date: d, candidate: { recipe: cand } }]`);
  await run(`handleDailyAction("life-obj-open", { recipe: cand.id, date: d })`);
  assert.match(run("renderObjectionSheet()"), /提案の料理/);
});

// 2026-11-02：運営が人数を直したら、端末にも届く（手で決めた人数はそのまま）。運営の方へ（APP_MAP §52-12）。
test("the operator's fixed count reaches copies whose count was unknown or read by the app, but not a count set by hand", async () => {
  const fixed = { ...item, revision: "r2", sourceServings: 2 };
  const a = app(() => ({ [V]: fixed }));
  setup(a.run);
  await a.run("refreshSavedRecipes({ force: true })");
  assert.equal(a.run("own.sourceServings"), 2);
  assert.equal(a.run("slot.recipe.sourceServings"), 2);
  assert.equal(a.run("own.sourceServingsBy"), undefined);
  const b = app(() => ({ [V]: fixed }));
  setup(b.run);
  b.run("setRecipeServings(own.id, 3, { date: d })");
  await b.run("refreshSavedRecipes({ force: true })");
  assert.equal(b.run("own.sourceServings"), 3);
  assert.equal(b.run("own.sourceRevision"), "r2");
});

test("「🛠 運営の方へ」 asks for the admin password only to register; it is not kept on the device", async () => {
  const { run } = app();
  assert.match(run("renderAdminPush()"), /運営の方へ/);
  run(`pushState = () => "off"`);
  assert.match(run("renderAdminPush()"), /admin-push-token.*この端末で受け取る/s);
  run(`localStorage.setItem("ripigochi-admin-push", "https://fcm.googleapis.com/x")`);
  assert.match(run("renderAdminPush()"), /届きます.*受け取るのをやめる/s);
  assert.equal(run(`localStorage.getItem("ripigochi-admin")`), null);
});
