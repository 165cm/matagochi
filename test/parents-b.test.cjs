const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

// 親の料理名 122b（APP_MAP §48）：食べ比べ・子の評価と親の連動・親を「もう出さない」。
function app(items) {
  const fetch = (url) => Promise.resolve({ ok: true, json: async () => (/\/api\/trends/.test(url) ? { items } : { items: [] }) });
  const ctx = vm.createContext({ console, URL, Date, fetch, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] }, AbortSignal, AbortController, setTimeout, clearTimeout });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.foodProfile=Lifestyle.profile({completed:true});saveState=()=>{};render=()=>{};showToast=(m)=>{globalThis.toast=m}");
  return run;
}
// 献立に入れられる（条件の確かめが済んだ）料理の形を、最初から入っている定番から借りる。
const base = L.curated.find((r) => L.fit(r, L.profile({}), "2026-10-05").ok);
const item = (n, title, dish) => ({ videoId: `v${String(n).padStart(10, "0")}`, title, videoUrl: `https://www.youtube.com/watch?v=v${String(n).padStart(10, "0")}`, ingredients: base.ingredients, steps: base.steps, planning: base.planning, expiresAt: "2099-01-01T00:00:00Z", ...(dish ? { dish: { key: dish, name: dish } } : {}) });
const items = [item(1, "王将風 八宝菜", "八宝菜"), item(2, "陳健一さんの八宝菜", "八宝菜"), item(3, "プロが作る八宝菜", "八宝菜"), item(4, "塩こんぶ肉じゃが", "肉じゃが")];

test("same parent counts as the same dish for 'days since last time'", () => {
  assert.equal(L.sameDish({ id: "a", title: "王将風 八宝菜", dish: "八宝菜" }, { id: "b", title: "陳健一さんの八宝菜", dish: "八宝菜" }), true);
  assert.equal(L.sameDish({ id: "a", title: "x", dish: "八宝菜" }, { id: "b", title: "y", dish: "肉じゃが" }), false);
});

test("ratings: an unrated child inherits the parent's best 'again' per person; a child's own rating wins ('never' drops only that child); pause is not inherited", async () => {
  const run = app(items);
  await run("loadDiscover({ force: true })");
  run(`state.recipes.push({ ...clone(base_ = discoverRecipes()[0]), id: "own1", curated: undefined, discover: undefined });
       state.recipes.push({ ...clone(base_), id: "own2", title: "休みの八宝菜", curated: undefined, discover: undefined });
       state.evaluations.push({ id: "e1", recipeId: "own1", cookedAt: "2026-10-01", familyRepeatCycles: { 母: "weekly", 父: "monthly" } });
       state.evaluations.push({ id: "e2", recipeId: "own2", cookedAt: "2026-10-02", familyRepeatCycles: { 父: "pause" } })`.replace("base_ =", "globalThis.base_ ="));
  const cycles = JSON.parse(run("JSON.stringify(plannedCycles()(discoverRecipes().find((r)=>r.title==='陳健一さんの八宝菜')))"));
  assert.deepEqual(cycles, { 母: "weekly", 父: "monthly" }, "inherits the best rating per person; pause is not inherited");
  run(`state.recipes.push({ ...clone(base_), id: "own3", title: "もう作らない八宝菜", curated: undefined, discover: undefined }); state.evaluations.push({ id: "e3", recipeId: "own3", cookedAt: "2026-10-03", familyRepeatCycles: { 母: "never" } })`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(plannedCycles()(recipeById('own3')))")), { 母: "never" }, "its own 'never' stays (only that way of cooking is dropped)");
  assert.deepEqual(JSON.parse(run("JSON.stringify(plannedCycles()(discoverRecipes().find((r)=>r.title==='プロが作る八宝菜')))")), { 母: "weekly", 父: "monthly" }, "the parent itself is not dropped");
  assert.deepEqual(JSON.parse(run("JSON.stringify(plannedCycles()(discoverRecipes().find((r)=>r.dish==='肉じゃが')))")), {});
});

test("compare: fills the open days of the plan with different children of the parent (chosen days are kept)", async () => {
  const run = app(items);
  await run("loadDiscover({ force: true })");
  run("state.planLength=4; state.planOverrides[addDays(today(),1)]=discoverRecipes().find((r)=>r.dish==='肉じゃが').id");
  const key = run("parentKeyOf(discoverRecipes()[0])");
  run(`handleDailyAction('life-dish-compare',{parent:${JSON.stringify(key)},dish:'八宝菜'})`);
  const o = JSON.parse(run("JSON.stringify(state.planOverrides)"));
  const ids = Object.entries(o).filter(([d]) => d !== run("addDays(today(),1)")).map(([, id]) => id);
  assert.equal(ids.length, 3, `3 open days get a 八宝菜: ${JSON.stringify(o)}`);
  assert.equal(new Set(ids).size, 3, "each a different way of cooking");
  assert.ok(ids.every((id) => run(`parentKeyOf(findDiscover(${JSON.stringify(id)}))`) === key));
  assert.match(run("toast"), /八宝菜」の食べ比べ：3日分/);
  const planned = JSON.parse(run("JSON.stringify(dailyPlan().map((d)=>d.candidate?.recipe.dish||''))"));
  assert.equal(planned.filter((d) => d === "八宝菜").length, 3, "the plan keeps the chosen days even with the weekly limit");
});

test("hide a parent: not in the list or the auto plan (a chosen day stays); restoring brings it back; the detail shows the line", async () => {
  const run = app(items);
  await run("loadDiscover({ force: true })");
  const key = run("parentKeyOf(discoverRecipes()[0])");
  assert.match(run("recipeDetailId=discoverRecipes()[0].id;renderParentLine(detailRecipe())"), /この料理で食べ比べ/);
  run(`handleDailyAction('life-dish-hide',{parent:${JSON.stringify(key)},dish:'八宝菜'})`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(normalizeStarterPref(state.starterPref).hiddenDishes)")), [key]);
  assert.equal(run("starterRecipeList().filter((r)=>r.dish==='八宝菜').length"), 0);
  assert.equal(run("planRecipes().filter((r)=>r.dish==='八宝菜').length"), 0);
  run("state.planOverrides[today()]=discoverRecipes().find((r)=>r.dish==='八宝菜').id");
  assert.equal(run("planRecipes().filter((r)=>r.dish==='八宝菜').length"), 1, "a day you chose yourself stays");
  assert.match(run("renderParentLine(detailRecipe())"), /出すように戻す/);
  run(`handleDailyAction('life-dish-unhide',{parent:${JSON.stringify(key)}})`);
  assert.equal(run("starterRecipeList().filter((r)=>r.dish==='八宝菜').length"), 3);
});

test("review fix (#123): compare does not overwrite a weekday pin", async () => {
  const run = app(items);
  await run("loadDiscover({ force: true })");
  run(`state.recipes.push({ ...clone(discoverRecipes().find((r)=>r.dish==='肉じゃが')), id: "nik1", folder: "fnik", curated: undefined, discover: undefined });
       state.folders = { fnik: { key: "fnik", name: "肉じゃが", ranking: [], pinDay: String(new Date(today()+"T12:00:00").getDay()), updatedAt: nowIso() } };
       state.planLength = 3`);
  const key = run("parentKeyOf(discoverRecipes().find((r)=>r.dish==='八宝菜'))");
  run(`handleDailyAction('life-dish-compare',{parent:${JSON.stringify(key)},dish:'八宝菜'})`);
  assert.equal(run("state.planOverrides[today()] || ''"), "", "the pinned day is left alone");
  assert.equal(run("dailyPlan()[0].candidate?.recipe.id"), "nik1");
});

test("review fix (#123): a hidden parent's dish chosen for one day is not planned automatically on other days", async () => {
  const run = app(items);
  await run("loadDiscover({ force: true })");
  run(`state.recipes.push({ ...clone(discoverRecipes()[0]), id: "hap1", curated: undefined, discover: undefined });
       state.starterPref = { ...normalizeStarterPref(state.starterPref), show: false, updatedAt: nowIso() };
       state.planLength = 4`);
  const key = run("parentKeyOf(recipeById('hap1'))");
  run(`handleDailyAction('life-dish-hide',{parent:${JSON.stringify(key)},dish:'八宝菜'})`);
  run("state.planOverrides[today()]='hap1'");
  const ids = JSON.parse(run("JSON.stringify(dailyPlan().map((d)=>d.candidate?.recipe.id||''))"));
  assert.equal(ids[0], "hap1");
  assert.ok(ids.slice(1).every((id) => id !== "hap1"), `only the chosen day: ${ids}`);
});
