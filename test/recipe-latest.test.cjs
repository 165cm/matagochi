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
  run("recipeDetailId = own.id; latestAsked.set(videoOfRecipe(own), Date.now())");
  const html = run("renderRecipeDetail()");
  assert.match(html, /source-note[^>]*>📝 作り方が新しくなりました/);
  assert.ok(html.indexOf("source-note") < html.indexOf("材料"), "shown before the ingredients");
});

// ── Claude のコードレビュー（PR #212）の指摘への対応 ──
test("review #212: times the app found by itself do not count as the user's edit, so the later update is still automatic", async () => {
  const { run } = app(() => ({ [V]: newer }));
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend"))`);
  run("keepSourceBaseline(own, () => { own.stepTimes = [10, 30, 90]; })");
  await run("refreshSavedRecipes({ force: true })");
  assert.deepEqual(JSON.parse(run("JSON.stringify(own.steps)")), newer.steps);
  assert.equal(run("own.sourcePending"), undefined);
});

test("review #212: the planned meal's own copy is updated too (cook screen); with changed ingredients in a decided meal, that copy waits for the button", async () => {
  const sameIngredients = { ...newer, ingredients: item.ingredients };
  let latest = { [V]: sameIngredients };
  const { run } = app(() => latest);
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend")); globalThis.d = today(); state.mealSlots[d] = { date: d, recipe: clone(own), status: "confirmed" }; globalThis.slot = state.mealSlots[d]`);
  await run("refreshSavedRecipes({ force: true })");
  assert.deepEqual(JSON.parse(run("JSON.stringify(slot.recipe.steps)")), newer.steps, "the cook screen reads this copy");
  latest = { [V]: { ...newer, revision: "r3", steps: [...newer.steps, "盛る"] } };
  await run("refreshSavedRecipes({ force: true })");
  assert.equal(run("own.steps.length"), 5, "the saved recipe does not drive the shopping list, so it updates");
  assert.equal(run("slot.recipe.sourcePending.planned"), true, "ingredients change while the meal is decided");
  assert.equal(run("slot.recipe.ingredients.length"), 1, "the shopping list does not change by itself");
  assert.match(run("renderSourceNote(slot.recipe, true, d)"), /決めた献立と買い物リスト.*data-date=/s);
  run("applySourcePending(own.id)");
  assert.equal(run("slot.recipe.ingredients.length"), 2);
  assert.equal(run("slot.recipe.steps.length"), 5);
});

test("2026-10-31 report: a meal-plan copy that is not linked to any saved recipe (different id) is found by its video and updated; the cook screen checks too", async () => {
  const { run, asked } = app(() => ({ [V]: { ...newer, ingredients: item.ingredients } }));
  run(`globalThis.d = today(); state.mealSlots[d] = { date: d, recipe: { id: "trend-${V}", title: "鶏", videoUrl: "${item.videoUrl}", ingredients: ${JSON.stringify(item.ingredients)}, steps: Array.from({ length: 10 }, (_, i) => "古い手順" + i), stepTimes: [] }, status: "confirmed" }`);
  run("cookingDate = d; state.view = 'cooking'");
  run("renderCooking()");
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(asked, [[V]], "opening the cook screen asks for this video");
  assert.equal(run("state.mealSlots[d].recipe.steps.length"), 4);
  assert.match(run("renderCooking()"), /📝 作り方が新しくなりました/);
});

test("review #212: every saved copy is checked (50 at a time); a failed check does not start the 6-hour pause", async () => {
  const { run } = app(() => ({}));
  run(`globalThis.__fail = true; globalThis.__asked = []; const f0 = globalThis.fetch;
    globalThis.fetch = (url, o) => { if (!String(url).endsWith("/api/recipes/latest")) return f0(url, o); __asked.push(JSON.parse(o.body).videoIds.length);
      return Promise.resolve(__fail ? { ok: false, json: async () => ({}) } : { ok: true, json: async () => ({ items: {} }) }); }`);
  run(`for (let i = 0; i < 120; i++) state.recipes.push({ id: "c" + i, starterId: "trend-x", title: "x", videoUrl: "https://www.youtube.com/watch?v=" + String(i).padStart(11, "a"), ingredients: [], steps: ["a", "b"], stepTimes: [] })`);
  assert.equal(await run("refreshSavedRecipes()"), false, "the server did not answer");
  run("__fail = false; __asked = []");
  await run("refreshSavedRecipes()");
  assert.deepEqual(JSON.parse(run("JSON.stringify(__asked)")), [50, 50, 20], "not paused by the failed try; all 120 asked");
  run("__asked = []");
  await run("refreshSavedRecipes()");
  assert.deepEqual(JSON.parse(run("JSON.stringify(__asked)")), [], "then the 6-hour pause");
});

// ── Claude のコードレビュー（PR #213）の指摘への対応 ──
test("review #213: meal-plan copies of the user's own or imported recipes are never replaced automatically", async () => {
  const { run } = app(() => ({ [V]: { ...newer, ingredients: item.ingredients, changedAt: "2000-01-01T00:00:00Z" } }));
  run(`globalThis.d1 = today();`);
  run(`state.mealSlots[d1] = { date: d1, recipe: { id: "r-mine", title: "自分の", videoUrl: "${item.videoUrl}", updatedAt: "2026-10-30T00:00:00Z", ingredients: [], steps: ["自分の手順1", "自分の手順2"], stepTimes: [] }, status: "planned" }`);
  run(`state.mealSlots["2999-01-01"] = { date: "2999-01-01", recipe: { id: "r-imp", catalog: { id: "youtube-${V}", revision: "r0" }, title: "取り込み", videoUrl: "${item.videoUrl}", ingredients: ${JSON.stringify(item.ingredients)}, steps: ["直した1", "直した2"], stepTimes: [] }, status: "planned" }`);
  await run("refreshSavedRecipes({ force: true })");
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.mealSlots[d1].recipe.steps)")), ["自分の手順1", "自分の手順2"], "the user's own recipe is never touched");
  assert.equal(run("state.mealSlots[d1].recipe.sourcePending"), undefined, "the admin changed it before the user's recipe: no button");
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.mealSlots["2999-01-01"].recipe.steps)')), ["直した1", "直した2"]);
  assert.equal(run('state.mealSlots["2999-01-01"].recipe.sourcePending.revision'), "r2", "an imported one waits for the button");
});

test("2026-10-31 report 2: a planned recipe with no marks (imported long ago) gets the button when the admin changed it later; the cook screen shows it", async () => {
  const { run } = app(() => ({ [V]: { ...newer, changedAt: "2026-10-31T11:20:00Z" } }));
  run(`globalThis.d = today(); state.mealSlots[d] = { date: d, recipe: { id: "r-old", title: "鶏むね肉の濃厚マッシュルームクリームソース", videoUrl: "${item.videoUrl}", updatedAt: "2026-10-20T00:00:00Z", ingredients: ${JSON.stringify(item.ingredients)}, steps: Array.from({ length: 10 }, (_, i) => "古い手順" + i), stepTimes: [] }, status: "confirmed" }`);
  run("cookingDate = d; state.view = 'cooking'; renderCooking()");
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(run("state.mealSlots[d].recipe.steps.length"), 10, "not replaced by itself");
  assert.match(run("renderCooking()"), /運営が作り方を直しました（手順 10 → 4）.*新しい作り方にする/s);
  run("applySourcePending('r-old', d)");
  assert.equal(run("state.mealSlots[d].recipe.steps.length"), 4);
  // ボタンで入れたあとは、同じ版でまたボタンを出さない
  await run("refreshSavedRecipes({ force: true })");
  assert.equal(run("state.mealSlots[d].recipe.sourcePending"), undefined);
});

test("review #213: a failed check is retried only once", async () => {
  const { run } = app(() => ({}));
  run(`globalThis.__n = 0; const f0 = globalThis.fetch; globalThis.fetch = (url, o) => String(url).endsWith("/api/recipes/latest") ? (__n++, Promise.resolve({ ok: false, json: async () => ({}) })) : f0(url, o);
    globalThis.__timers = []; globalThis.setTimeout = (fn, ms) => { if (ms === 120000) __timers.push(fn); return { unref() {} }; }`);
  run(`globalThis.own = saveOwnRecipe(discoverRecipe(${JSON.stringify(item)}, "trend"))`);
  await run("refreshSavedRecipes()");
  assert.equal(run("__timers.length"), 1, "one retry scheduled");
  run("__timers.shift()()");
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(run("__n"), 2);
  assert.equal(run("__timers.length"), 0, "no endless retries");
});
