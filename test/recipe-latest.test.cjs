const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 2026-10-31：端末に保存した新着・定番の写しを、運営が直した最新の版にする（APP_MAP §52-9。ユーザーの判断：直していなければ自動・直していたらボタン・以前の写しは自動）。
function app(latest) {
  const asked = [];
  const mem = {};
  const fetch = (url, opts = {}) => {
    if (String(url).endsWith("/api/recipes/latest")) { asked.push(JSON.parse(opts.body).videoIds); return Promise.resolve({ ok: true, json: async () => ({ items: latest() }) }); }
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
  return { run, asked };
}
const V = "oWLCye3SXu4";
const item = { videoId: V, title: "鶏むね肉のクリームソース", videoUrl: `https://www.youtube.com/watch?v=${V}`, revision: "r1", ingredients: [{ name: "鶏むね肉", amount: "1枚" }],
  steps: ["開く", "刻む", "焼く"], stepTimes: [16, 16, 121] };
const newer = { revision: "r2", title: item.title, ingredients: [{ name: "鶏むね肉", amount: "1枚" }, { name: "生クリーム", amount: "150ml" }], steps: ["開いて塩", "刻む", "焼く", "煮詰める"], stepTimes: [16, 48, 120, 216] };

test("a saved copy the user did not change is replaced by the newer version, with a small notice; notes and ratings stay", async () => {
  const { run, asked } = app(() => ({ [V]: newer }));
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend")); own.note = "子どもに好評"`);
  assert.equal(run("own.sourceRevision"), "r1");
  assert.ok(run("own.sourcePrint"));
  assert.equal(await run("refreshSavedRecipes({ force: true })"), true);
  assert.deepEqual(asked, [[V]]);
  assert.deepEqual(JSON.parse(run("JSON.stringify(own.steps)")), newer.steps);
  assert.deepEqual(JSON.parse(run("JSON.stringify(own.stepTimes)")), newer.stepTimes);
  assert.equal(run("own.ingredients.length"), 2);
  assert.equal(run("own.note"), "子どもに好評");
  assert.equal(run("own.sourceRevision"), "r2");
  assert.match(run("renderSourceNote(own, true)"), /作り方が新しくなりました/);
});

test("a copy the user changed is not replaced; the recipe offers 「新しい作り方にする」, which applies it", async () => {
  const { run } = app(() => ({ [V]: newer }));
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend")); own.steps = ["開く", "細かく刻む", "焼く"]`);
  await run("refreshSavedRecipes({ force: true })");
  assert.deepEqual(JSON.parse(run("JSON.stringify(own.steps)")), ["開く", "細かく刻む", "焼く"]);
  assert.equal(run("own.sourcePending.revision"), "r2");
  assert.match(run("renderSourceNote(own, true)"), /運営が作り方を直しました.*新しい作り方にする/s);
  assert.equal(run("renderSourceNote(own, false)"), "", "viewers only see the recipe");
  assert.equal(run("applySourcePending(own.id)"), true);
  assert.deepEqual(JSON.parse(run("JSON.stringify(own.steps)")), newer.steps);
  assert.equal(run("own.sourcePending"), undefined);
});

test("an older copy (saved before this change, no fingerprint) is replaced automatically; a recipe made by importing gets the button instead", async () => {
  const { run } = app(() => ({ [V]: newer, abcdefghijk: { ...newer, revision: "i2" } }));
  run(`globalThis.old = { id: "r-old", starterId: "trend-${V}", title: "鶏", videoUrl: "${item.videoUrl}", ingredients: [{ name: "鶏むね肉", amount: "1枚" }], steps: ["開く", "刻む", "焼く"], stepTimes: [16, 16, 121] }; state.recipes.push(old)`);
  run(`globalThis.imp = { id: "r-imp", catalog: { id: "youtube-abcdefghijk", revision: "i1" }, title: "豚", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", ingredients: [{ name: "豚こま", amount: "200g" }], steps: ["切る", "炒める"], stepTimes: [] }; state.recipes.push(imp)`);
  await run("refreshSavedRecipes({ force: true })");
  assert.deepEqual(JSON.parse(run("JSON.stringify(old.steps)")), newer.steps);
  assert.deepEqual(JSON.parse(run("JSON.stringify(imp.steps)")), ["切る", "炒める"]);
  assert.equal(run("imp.sourcePending.revision"), "i2");
  run("applySourcePending('r-imp')");
  assert.equal(run("imp.catalog.revision"), "i2");
});

test("same version or same content: nothing is replaced and no notice is shown; the 6-hour pause skips the network", async () => {
  let latest = { [V]: { ...item, revision: "r1" } };
  const { run, asked } = app(() => latest);
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend"))`);
  assert.equal(await run("refreshSavedRecipes()"), false, "same version");
  assert.equal(asked.length, 1);
  assert.equal(await run("refreshSavedRecipes()"), false);
  assert.equal(asked.length, 1, "asked at most every 6 hours");
  latest = { [V]: { ...item, revision: "r9" } };
  await run("refreshSavedRecipes({ force: true })");
  assert.equal(run("own.sourceRevision"), "r9");
  assert.equal(run("own.sourceUpdatedAt"), undefined, "same content: no notice");
  assert.equal(run("renderSourceNote(own, true)"), "");
});

test("the recipe screen shows the notice above the ingredients", async () => {
  const { run } = app(() => ({ [V]: newer }));
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend"))`);
  await run("refreshSavedRecipes({ force: true })");
  run("recipeDetailId = own.id; latestAsked.set(own.id, Date.now())");
  const html = run("renderRecipeDetail()");
  assert.match(html, /source-note[^>]*>📝 作り方が新しくなりました/);
  assert.ok(html.indexOf("source-note") < html.indexOf("材料"), "shown before the ingredients");
});
