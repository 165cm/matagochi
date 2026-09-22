const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../lifestyle.js");
const fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const start = "2026-09-23";
const addDays = (d, n) => {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
function app() {
  const ctx = vm.createContext({
    console,
    URL,
    Date,
    document: { querySelector: () => null, querySelectorAll: () => [] },
  });
  for (const f of ["lifestyle.js", "daily-ui.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js")
      s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
const profile = L.profile({
  equipment: Object.fromEntries(L.equipment.map((x) => [x, "have"])),
});
const propose = (p = profile, extra = {}) =>
  L.propose({ recipes: L.curated, profile: p, start, addDays, ...extra });
test("unknown pantry and equipment are never assumed owned; partial profile survives round-trip", () => {
  const p = L.profile({
    step: 7,
    equipment: { コンロ: "none" },
    pantry: { 塩: "have" },
  });
  assert.equal(p.equipment.電子レンジ, undefined);
  assert.deepEqual(L.profile(JSON.parse(JSON.stringify(p))), p);
  assert.equal(propose(L.profile({}))[0].candidate.needsReview, true);
});
test("restriction and unavailable equipment apply without silently relaxing to fill empty days", () => {
  const p = L.profile({
    ...profile,
    restrictions: ["卵", "乳", "魚"],
    equipment: { ...profile.equipment, コンロ: "none" },
  });
  const days = propose(p);
  assert.equal(days.filter((x) => x.candidate).length, 0);
  const egg = propose(L.profile({ ...profile, restrictions: ["卵"] }));
  assert.ok(
    egg.every(
      (d) =>
        !d.candidate || !d.candidate.recipe.planning.contains.includes("卵"),
    ),
  );
});
test("unknown recipe ingredients or custom restrictions cannot be marked compliant", () => {
  const r = { ...L.curated[0], planning: undefined };
  assert.equal(L.fit(r, L.profile({ restrictions: ["卵"] }), start).ok, false);
  assert.equal(
    L.fit(L.curated[8], L.profile({ restrictions: ["特殊な食材"] }), start).ok,
    false,
  );
});
test("weekday/weekend time, tasks, and simplicity constraints apply", () => {
  const p = L.profile({
    ...profile,
    weekdayMinutes: 10,
    weekendMinutes: 30,
    avoidTasks: ["肉を切る"],
    skill: "easy",
  });
  assert.ok(
    propose(p).every(
      (d) => !d.candidate || d.candidate.recipe.planning.minutes <= 10,
    ),
  );
  assert.equal(L.fit(L.curated[2], p, "2026-09-26").ok, false);
  assert.equal(L.fit(L.curated[10], p, "2026-09-26").ok, true);
});
test("curated recipes are unique, single-dish, portioned and complete; serving two does not mutate source", () => {
  assert.equal(new Set(L.curated.map((r) => r.id)).size, 12);
  assert.ok(
    L.curated.every(
      (r) =>
        r.mealType === "dinner" &&
        r.sourceServings === 1 &&
        r.ingredients.length &&
        r.steps.length &&
        r.planning.equipment.length,
    ),
  );
  const run = app();
  run(
    'confirmDaily({date:today()},Lifestyle.curated[0]);state.mealSlots[today()].recipe.title="自分用"',
  );
  assert.equal(run("Lifestyle.curated[0].title"), "豆腐と卵のやさしい丼");
});
test("configured weekdays skip days and suggestions do not repeat", () => {
  const days = propose(L.profile({ ...profile, days: ["3", "5"] }), {
    length: 7,
  });
  assert.equal(days.filter((d) => d.off).length, 5);
  const ids = days.filter((d) => d.candidate).map((d) => d.candidate.recipe.id);
  assert.equal(new Set(ids).size, ids.length);
});
test("use-up expires after first week, preferred tastes change the ranking", () => {
  const p = L.profile({
    ...profile,
    tastes: ["中華風"],
    useUp: ["鮭"],
    useUpUntil: start,
  });
  assert.equal(propose(p)[0].candidate.recipe.id, "starter-11");
  assert.equal(
    propose(p, { start: addDays(start, 7) })[0].candidate.recipe.planning
      .tastes[0],
    "中華風",
  );
});
test("confirmed snapshots survive preference changes, source edits, reload and date advance", () => {
  const run = app();
  run(
    'confirmDaily({date:today()},Lifestyle.curated[0]);const title=state.mealSlots[today()].recipe.title;state.foodProfile=Lifestyle.profile({restrictions:["卵"]});state=normalizeState(JSON.parse(JSON.stringify(state)))',
  );
  assert.equal(run("dailyPlan()[0].slot.recipe.title===title"), true);
  assert.equal(run("dailyShopping().length>0"), true);
});
test("unconfirmed suggestions create no shopping; each confirmed snapshot uses its own serving count", () => {
  const run = app();
  assert.equal(run("dailyShopping().length"), 0);
  run(
    "confirmDaily({date:today()},Lifestyle.curated[0]);confirmDaily({date:addDays(today(),1)},Lifestyle.curated[0]);state.mealSlots[addDays(today(),1)].servings=2;state.draft.sourceServings=10",
  );
  assert.equal(
    run('dailyShopping().find(i=>i.name==="ごはん").amount'),
    "450g",
  );
});
test("purchased items need recheck after quantity change; unrelated marks survive", () => {
  const run = app();
  run(
    'confirmDaily({date:today()},Lifestyle.curated[0]);let item=dailyShopping().find(i=>i.name==="ごはん");state.shoppingMarks[item.id]={status:"purchased",signature:item.signature,updatedAt:nowIso()}',
  );
  assert.equal(
    run('dailyShopping().find(i=>i.name==="ごはん").status'),
    "purchased",
  );
  run("state.mealSlots[today()].servings=2");
  assert.equal(run('dailyShopping().find(i=>i.name==="ごはん").status'), "buy");
  assert.equal(run('dailyShopping().find(i=>i.name==="ごはん").recheck'), true);
});
test("known pantry excludes buying but explicit buy overrides ownership", () => {
  const run = app();
  run(
    'state.householdProfile={pantry:{しょうゆ:"have"}};confirmDaily({date:today()},Lifestyle.curated[0])',
  );
  assert.equal(
    run('dailyShopping().find(i=>i.name==="しょうゆ").status'),
    "have",
  );
  run(
    'state.shoppingMarks["しょうゆ"]={status:"buy",signature:"",updatedAt:nowIso()}',
  );
  assert.equal(
    run('dailyShopping().find(i=>i.name==="しょうゆ").status'),
    "buy",
  );
});
test("per-date merge preserves independent edits and skips; ties converge", () => {
  const a = {
    [start]: { date: start, status: "off", updatedAt: "2026-09-23T12:00:00Z" },
  };
  const b = {
    [addDays(start, 1)]: {
      date: addDays(start, 1),
      status: "removed",
      updatedAt: "2026-09-23T12:00:00Z",
    },
  };
  assert.equal(Object.keys(L.mergeMap(a, b)).length, 2);
  const c = { [start]: { ...a[start], status: "removed" } };
  assert.deepEqual(L.mergeMap(a, c), L.mergeMap(c, a));
});
test("sync excludes personal restrictions/preferences and drafts but includes household, plans, shopping", () => {
  const run = app();
  run(
    'state.foodProfile=Lifestyle.profile({restrictions:["卵"],dislikes:["なす"]});state.onboardingDraft=Lifestyle.profile({restrictions:["乳"]});state.householdProfile={pantry:{塩:"have"},equipment:{コンロ:"have"},updatedAt:nowIso()}',
  );
  const payload = JSON.parse(run("JSON.stringify(buildSyncPayload())"));
  assert.equal(payload.foodProfile, undefined);
  assert.equal(payload.onboardingDraft, undefined);
  assert.equal(payload.householdProfile.pantry.塩, "have");
  assert.ok(payload.mealSlots);
  assert.equal(JSON.stringify(payload).includes("なす"), false);
  run(
    'applySyncPayload(mergeSyncPayloads(buildSyncPayload(),{recipes:[],evaluations:[],householdProfile:{pantry:{塩:"none"},updatedAt:"2099-01-01T00:00:00Z"}}))',
  );
  assert.equal(run("state.foodProfile.restrictions[0]"), "卵");
});
test("legacy migration preserves recipes and checks without treating proposals as confirmed", () => {
  const run = app();
  run(
    "state=normalizeState({...clone(demoState),onboarded:true,shopping:{week:today(),checked:{米:true}}})",
  );
  assert.equal(run("state.recipes.length"), 3);
  assert.equal(run("state.shopping.checked.米"), true);
  assert.equal(run("Object.keys(state.mealSlots).length"), 0);
  assert.equal(run("state.onboarded"), true);
});
test("one-tap cooked is idempotent and does not invent a preference", () => {
  const run = app();
  run(
    "confirmDaily({date:today()},Lifestyle.curated[0]);dailyRecord(state.mealSlots[today()]);dailyRecord(state.mealSlots[today()]);state=normalizeState(JSON.parse(JSON.stringify(state)))",
  );
  assert.equal(run("state.evaluations.length"), 1);
  assert.equal(run("state.evaluations[0].preferencePending"), true);
  assert.equal(
    run("getRecipeRepeatSummary(state.evaluations[0].recipeId).unrecorded"),
    true,
  );
});
test("rendering profile summary escapes user-supplied text", () => {
  const run = app();
  assert.match(
    run('profileSummary(Lifestyle.profile({dislikes:["<img onerror=x>"]}))'),
    /&lt;img/,
  );
});
test("date advance keeps tomorrow snapshot and drops yesterday from shopping without deleting history", () => {
  const run = app();
  run(
    "confirmDaily({date:today()},Lifestyle.curated[0]);confirmDaily({date:addDays(today(),1)},Lifestyle.curated[8]);const tomorrow=addDays(today(),1);today=()=>tomorrow",
  );
  assert.equal(run("dailyPlan()[0].slot.recipe.id"), "starter-09");
  assert.equal(run("Object.keys(state.mealSlots).length"), 2);
  assert.equal(run('dailyShopping().some(i=>i.name==="豆腐")'), false);
});
test("personal edits and serving changes require explicit application to confirmed plans", () => {
  const run = app();
  run(
    'const own=saveOwnRecipe(Lifestyle.curated[0]);confirmDaily({date:today()},own);own.title="変更後";state.servingCount=2',
  );
  assert.equal(
    run("state.mealSlots[today()].recipe.title"),
    "豆腐と卵のやさしい丼",
  );
  assert.equal(run("slotHasUpdates(state.mealSlots[today()])"), true);
  run('handleDailyAction("life-refresh",{date:today()})');
  assert.equal(run("state.mealSlots[today()].recipe.title"), "変更後");
  assert.equal(run("state.mealSlots[today()].servings"), 2);
});
test("empty metadata never claims all equipment is verified", () => {
  assert.equal(
    L.fit(
      {
        ...L.curated[0],
        planning: { ...L.curated[0].planning, equipment: [] },
      },
      profile,
      start,
    ).needsReview,
    true,
  );
});
test("manual item tombstones survive normalization and household merge", () => {
  const run = app();
  run(
    'state.manualShopping={"manual-a":{name:"米",amount:"1袋",updatedAt:nowIso()}}',
  );
  assert.equal(run("dailyShopping().length"), 1);
  run(
    'handleDailyAction("life-remove-item",{id:"manual-a"});state=normalizeState(JSON.parse(JSON.stringify(state)))',
  );
  assert.equal(run("dailyShopping().length"), 0);
  assert.equal(
    run('buildSyncPayload().manualShopping["manual-a"].deleted'),
    true,
  );
});
test("removing a meal keeps a purchased check when remaining ingredients are already covered", () => {
  const run = app();
  run(
    'confirmDaily({date:today()},Lifestyle.curated[0]);confirmDaily({date:addDays(today(),1)},Lifestyle.curated[0]);let item=dailyShopping().find(i=>i.name==="ごはん");state.shoppingMarks[item.id]={status:"purchased",signature:item.signature,updatedAt:nowIso()};state.mealSlots[today()].status="cooked"',
  );
  assert.equal(
    run('dailyShopping().find(i=>i.name==="ごはん").status'),
    "purchased",
  );
});
test("a one-day cooking override does not change the weekly schedule", () => {
  const run = app();
  run(
    'state.foodProfile=Lifestyle.profile({days:[String((new Date().getDay()+1)%7)]});const previous=JSON.stringify(state.foodProfile.days);handleDailyAction("life-reopen",{date:today()})',
  );
  assert.equal(run("JSON.stringify(state.foodProfile.days)===previous"), true);
  assert.equal(run("!!dailyPlan()[0].candidate"), true);
});
