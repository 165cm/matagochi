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
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "lifestyle.js", "daily-ui.js", "playlist-import.js", "household.js", "app.js"]) {
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
  const days = propose(p, { recipes: L.curated.slice(0, 12) });
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
  assert.equal(new Set(L.curated.map((r) => r.id)).size, 38);
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

test('equipment presets cover all tools once and preserve existing answers, including unknown', () => {
  const names=L.equipmentGroups.flatMap(g=>g.names);
  assert.deepEqual([...names].sort(), [...L.equipment].sort());
  assert.equal(new Set(names).size,names.length);
  const seeded=L.equipmentDefaults({コンロ:'none',電子レンジ:'unknown',圧力鍋:'have',蒸し器:'have'});
  assert.equal(seeded.フライパン,'have');
  assert.equal(seeded.ミキサー,'none');
  assert.equal(seeded.コンロ,'none');
  assert.equal(seeded.電子レンジ,'unknown');
  assert.equal(seeded.圧力鍋,'have');
  assert.equal(seeded.蒸し器,'have');
  assert.deepEqual(L.equipmentDefaults(seeded),seeded);
  assert.deepEqual(L.profile({}).equipment,{});
});
test('equipment tap switches ownership once and persists through normalization without changing pantry', () => {
  const run=app();
  run('state.onboardingDraft=Lifestyle.profile({equipment:Lifestyle.equipmentDefaults(),pantry:{塩:"unknown"}});handleDailyAction("life-equipment-toggle",{name:"フライパン"});state=normalizeState(JSON.parse(JSON.stringify(state)))');
  assert.equal(run('state.onboardingDraft.equipment.フライパン'),'none');
  run('handleDailyAction("life-equipment-toggle",{name:"フライパン"})');
  assert.equal(run('state.onboardingDraft.equipment.フライパン'),'have');
  assert.equal(run('state.onboardingDraft.pantry.塩'),'unknown');
});

test('pantry cards preserve unknown until tapped and toggle without changing equipment', () => {
  const run=app();
  run('state.onboardingDraft=Lifestyle.profile({equipment:{コンロ:"none"},pantry:{塩:"unknown",砂糖:"none"}})');
  assert.match(run('ownershipFields("pantry",["塩","砂糖"])'), /aria-pressed="mixed"/);
  assert.equal(run('state.onboardingDraft.pantry.塩'),'unknown');
  run('handleDailyAction("life-pantry-toggle",{name:"塩"});state=normalizeState(JSON.parse(JSON.stringify(state)))');
  assert.equal(run('state.onboardingDraft.pantry.塩'),'have');
  run('handleDailyAction("life-pantry-toggle",{name:"塩"})');
  assert.equal(run('state.onboardingDraft.pantry.塩'),'none');
  assert.equal(run('state.onboardingDraft.pantry.砂糖'),'none');
  assert.equal(run('state.onboardingDraft.equipment.コンロ'),'none');
});

test('quick setup persists only its three answers and does not mark detailed setup complete', () => {
 const run=app();
 run('handleDailyAction("life-quick",{});state.onboardingDraft.servings=2;state.onboardingDraft.restrictions=["卵"];handleDailyAction("life-quick-next",{});state=normalizeState(JSON.parse(JSON.stringify(state)))');
 assert.equal(run('state.onboardingDraft.quickSetupIndex'),1);
 run('state.onboardingDraft.weekdayMinutes=20;handleDailyAction("life-quick-next",{});handleDailyAction("life-finish",{})');
 assert.equal(run('state.onboarded'),true);
 assert.equal(run('state.foodProfile.completed'),false);
 assert.equal(run('state.foodProfile.quickSetupIndex'),null);
 assert.equal(run('state.foodProfile.weekdayMinutes'),20);
 assert.equal(run('state.foodProfile.restrictions[0]'),'卵');
 assert.equal(run('Object.keys(state.foodProfile.equipment).length'),0);
 assert.equal(run('Object.keys(state.mealSlots).length'),0);
 assert.equal(run('state.planLength'),3);
});

test("reviewed recipe metadata excludes conditional allergens and composite dislikes", () => {
  const byId = n => L.curated.find(r => r.id === `starter-${n}`);
  for (const [id, restriction] of [[21,"大豆"],[23,"卵"],[15,"魚"]])
    assert.equal(L.fit(byId(id), L.profile({...profile, restrictions:[restriction]}), start).ok, false);
  for (const [id, dislike] of [[34,"トマト"],[19,"きのこ"]])
    assert.equal(L.fit(byId(id), L.profile({...profile, dislikes:[dislike]}), start).ok, false);
  const p = L.profile({...profile, restrictions:["大豆"], weekdayMinutes:20, weekendMinutes:20});
  assert.equal(L.curated.filter(r => L.fit(r,p,start).ok).length, 5);
  const days = propose(p,{length:7});
  assert.equal(days.filter(d => d.candidate).length,7);
  assert.equal(new Set(days.slice(0,5).map(d => d.candidate.recipe.id)).size,5);
  assert.ok(days.slice(5).every(d => d.candidate.repeated));
});
test("reuse never bypasses exclusions, unavailable tools, time or no-repeat ratings", () => {
  const only = L.curated.find(r => r.id === "starter-16");
  const args = {recipes:[only],length:7};
  assert.ok(propose(profile,args).every(d=>d.candidate));
  for (const p of [L.profile({...profile,restrictions:["肉"]}),L.profile({...profile,equipment:{電子レンジ:"none"}}),L.profile({...profile,weekdayMinutes:10,weekendMinutes:10})])
    assert.ok(propose(p,args).every(d=>d.candidate===null));
  assert.ok(propose(profile,{...args,repeatScore:()=>-Infinity}).every(d=>d.candidate===null));
});
test("tool defaults preserve explicit ownership and reviewed recipes stay within schema", () => {
  assert.equal(L.equipmentDefaults().耐熱ボウル,"have");
  assert.equal(L.equipmentDefaults({キッチンばさみ:"none",耐熱ボウル:"unknown"}).キッチンばさみ,"none");
  assert.equal(L.equipmentDefaults({耐熱ボウル:"unknown"}).耐熱ボウル,"unknown");
  for (const r of L.curated.slice(12)) {
    assert.ok(r.steps.length<=4);
    assert.ok(r.planning.equipment.every(e=>L.equipment.includes(e)));
    assert.ok(r.planning.contains.every(a=>L.restrictionOptions.includes(a)));
  }
});
test("new recipe metadata survives personal save, confirmation and reload", () => {
  const run = app();
  run('const added = Lifestyle.curated.find(r=>r.id==="starter-23"); const saved = saveOwnRecipe(added); confirmDaily({date:today()},saved); state=normalizeState(JSON.parse(JSON.stringify(state)))');
  assert.ok(run('state.mealSlots[today()].recipe.planning.contains.includes("卵")'));
  assert.ok(run('state.recipes.find(r=>r.starterId==="starter-23").planning.contains.includes("大豆")'));
  assert.equal(run('allDinnerRecipes().filter(r=>r.id==="starter-23").length'),0);
});

test("import planning suggestions never certify allergens or invent duration", () => {
  const draft=L.suggestPlanning({ingredients:[{name:"鶏肉"},{name:"しょうゆ"}],steps:["フライパンで肉を焼く"]});
  assert.equal(draft.minutes,null);assert.equal(draft.ingredientsVerified,false);
  assert.ok(draft.equipment.includes("コンロ"));assert.ok(draft.contains.includes("大豆"));
  const recipe={id:"saved",mealType:"dinner",ingredients:[{name:"トマト"}],steps:["切る"]};
  const p=L.profile({...profile,weekdayMinutes:20,skill:"easy",restrictions:["卵"]});
  assert.equal(L.fit(recipe,p,start).ok,false);
  assert.equal(L.reviewable(recipe,p,start),true);
  assert.equal(L.reviewable({...recipe,ingredients:[{name:"卵"}]},p,start),false);
  assert.equal(L.reviewable({...recipe,planning:{minutes:30}},p,start),false);
  const ready={...recipe,planning:{minutes:20,equipment:["包丁"],tasks:[],contains:[],easy:true,ingredientsVerified:true,conditionsConfirmed:true}};
  assert.equal(L.fit(ready,p,start).ok,true);
});
test("cooked rice uses rice pantry ownership only when explicitly available", () => {
  const args={slots:{[start]:{date:start,status:"confirmed",servings:1,recipe:{id:"rice",sourceServings:1,ingredients:[{name:"ごはん（炊飯済み）",amount:"150g",category:"主食"}]}}},start,end:start,scale:a=>a,combine:a=>a.join(" + ")};
  assert.equal(L.shopping({...args,pantry:{米:"have"}})[0].status,"have");
  assert.equal(L.shopping({...args,pantry:{米:"none"}})[0].status,"buy");
  assert.equal(L.shopping(args)[0].category,"主食");
});
test("past three days are recordable once, future and older slots are not", () => {
  const run=app();
  run('const yesterday=addDays(today(),-1);confirmDaily({date:yesterday},Lifestyle.curated[0]);dailyRecord(state.mealSlots[yesterday]);dailyRecord(state.mealSlots[yesterday]);');
  assert.equal(run('state.evaluations.length'),1);
  assert.equal(run('state.evaluations[0].cookedAt===yesterday'),true);
  assert.equal(run('renderPreferencePrompt().includes("次はいつ食べたい")'),true);
  run('handleDailyAction("life-rate",{id:state.evaluations[0].id,member:state.family[0],cycle:"monthly"})');
  assert.equal(run('state.evaluations[0].familyRepeatCycles[state.family[0]]'),"monthly");
  assert.equal(run('renderPreferencePrompt()'),"");
  assert.equal(run('canRecordDate(addDays(today(),-3))'),true);
  assert.equal(run('canRecordDate(addDays(today(),-4))'),false);
  run('confirmDaily({date:addDays(today(),1)},Lifestyle.curated[0]);dailyRecord(state.mealSlots[addDays(today(),1)])');
  assert.equal(run('state.evaluations.length'),1);
});
test("shopping renders one-tap checkboxes and aisle headings instead of status selects",()=>{
  const run=app();run('confirmDaily({date:today()},Lifestyle.curated[2])');
  const html=run('renderDailyShopping()');
  assert.ok(html.includes('type="checkbox" data-shopping-id='));
  assert.ok(html.includes('🥬 野菜'));assert.ok(html.includes('🥩 肉・魚'));
  assert.ok(!html.includes('<select'));
});
test("seasoning with soy sauce or mentsuyu is not mistaken for boiling in a pot", () => {
  const eq = (step) => L.suggestPlanning({ ingredients: [], steps: [step] }).equipment;
  assert.ok(!eq("しょうゆで味を整える").includes("鍋"));
  assert.ok(!eq("めんつゆで和える").includes("鍋"));
  assert.ok(eq("パスタをゆでる").includes("鍋"));
  assert.ok(eq("卵を茹でる").includes("鍋"));
});
test("shopping keeps concentration and product variants separate", () => {
  const items = L.shopping({ slots: { x: { date: start, status: "confirmed", servings: 1, recipe: { id: "x", sourceServings: 1, ingredients: [
    {name:"めんつゆ（3倍濃縮）",amount:"大さじ1"}, {name:"めんつゆ（ストレート）",amount:"大さじ2"}, {name:"ごはん（炊飯済み）",amount:"150g"}
  ]}}}, start, end:start, scale: a=>a, combine:a=>a.join(" + "), pantry:{米:"have"} });
  assert.equal(items.length,3);
  assert.ok(items.some(i=>i.name==="めんつゆ(3倍濃縮)"));
  assert.ok(items.some(i=>i.name==="めんつゆ(ストレート)"));
  assert.equal(items.find(i=>i.name==="ごはん").status,"have");
});

test("rotation: pasta the day before yesterday leads to a rice dish with a friendly reason", () => {
  const pasta = { id: "p1", title: "納豆パスタ", mealType: "dinner", ingredients: [{ name: "パスタ" }, { name: "納豆" }], steps: [] };
  const history = [{ date: addDays(start, -2), recipe: pasta }];
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 3, addDays, history });
  const first = plan[0].candidate;
  assert.notEqual(L.traits(first.recipe).staple, "noodle");
  assert.ok(first.reasons[0].startsWith("一昨日はパスタだったので、"), first.reasons[0]);
});

test("rotation: consecutive plan days avoid the same staple when alternatives exist", () => {
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 3, addDays });
  const staples = plan.map((d) => L.traits(d.candidate.recipe).staple);
  assert.notEqual(staples[0], staples[1]);
  assert.notEqual(staples[1], staples[2]);
});

test("rotation: a dish eaten within the last week is not suggested again, even if never rated", () => {
  const eaten = L.curated[0];
  const history = [{ date: addDays(start, -3), recipe: eaten }];
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 3, addDays, history });
  assert.ok(plan.every((d) => d.candidate.recipe.id !== eaten.id));
  const r = L.rotation(eaten, start, history, (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000));
  assert.equal(r.lastEatenDays, 3);
});

test("app history counts cooked-but-unrated meals and labels the last time", () => {
  const run = app();
  run(`const r=Lifestyle.curated[1]; state.mealSlots[addDays(today(),-2)]={date:addDays(today(),-2),status:"cooked",servings:1,recipe:clone(r),updatedAt:nowIso()};`);
  assert.equal(run("mealHistory().length"), 1);
  assert.equal(run("lastEatenLabel(Lifestyle.curated[1])"), "一昨日");
  assert.equal(run("lastEatenLabel(Lifestyle.curated[2])"), "はじめて");
  assert.ok(run("dailyPlan().every(d => !d.candidate || d.candidate.recipe.id !== Lifestyle.curated[1].id)"));
});

test("two people rate separately; both loving a dish shows ふたりとも好き", () => {
  const run = app();
  run('state.servingCount=2;const y=addDays(today(),-1);confirmDaily({date:y},Lifestyle.curated[0]);dailyRecord(state.mealSlots[y]);');
  assert.deepEqual(JSON.parse(run('JSON.stringify(raterNames())')), ["自分", "いっしょに食べた人"]);
  const id = run('state.evaluations[0].id');
  run(`handleDailyAction("life-rate",{id:"${id}",member:"自分",cycle:"weekly"})`);
  assert.equal(run('state.evaluations[0].preferencePending'), true);
  run(`handleDailyAction("life-rate",{id:"${id}",member:"いっしょに食べた人",cycle:"weekly"})`);
  assert.equal(run('state.evaluations[0].preferencePending'), false);
  assert.equal(run('state.family.length'), 2);
  assert.equal(run('bothLike(Lifestyle.curated[0])'), true);
  assert.equal(run('renderPreferencePrompt()'), "");
});

// ----- 周期（次に食べたい頃）とリクエスト -----
const gap = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
test("repeat cycle: the household waits for the longest cycle; before that the dish is held back", () => {
  const dish = L.curated[4];
  const ate = (days) => [{ date: addDays(start, -days), recipe: dish }];
  const cycles = { パパ: "weekly", むすめ: "twice_month" };
  const early = L.repeatFit(dish, start, ate(8), gap, cycles);
  assert.equal(early.interval, 14);
  assert.equal(early.due, false);
  assert.ok(early.score < 0);
  const due = L.repeatFit(dish, start, ate(15), gap, cycles);
  assert.equal(due.due, true);
  assert.match(due.reason, /^ちょうどいい頃（15日ぶり）/);
  assert.match(L.repeatFit(dish, start, ate(30), gap, cycles).reason, /^久しぶり/);
  assert.equal(L.repeatFit(dish, start, ate(30), gap, { パパ: "weekly", むすめ: "never" }).exclude, true);
  assert.match(L.repeatFit(dish, start, ate(8), gap, { パパ: "weekly", むすめ: "weekly" }).reason, /^ふたりとも好き/);
});

test("repeat cycle: a due favourite comes back; a dish nobody wants again never does", () => {
  const fav = L.curated[4], stop = L.curated[5];
  const history = [{ date: addDays(start, -10), recipe: fav }, { date: addDays(start, -40), recipe: stop }];
  const cyclesOf = (r) => (r.id === fav.id ? { パパ: "weekly", むすめ: "weekly" } : r.id === stop.id ? { パパ: "never" } : {});
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 7, addDays, history, cyclesOf });
  const ids = plan.map((d) => d.candidate?.recipe.id);
  assert.ok(ids.includes(fav.id), "favourite is back");
  assert.ok(!ids.includes(stop.id), "never is excluded");
  const day = plan.find((d) => d.candidate?.recipe.id === fav.id);
  assert.ok(day.candidate.reasons.some((r) => /ふたりとも好き/.test(r)));
});

test("requests go into the plan first with the requester's name", () => {
  const wanted = L.curated[20];
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 3, addDays, requestOf: (r) => (r.id === wanted.id ? { from: "むすめ" } : null) });
  const day = plan.find((d) => d.candidate?.recipe.id === wanted.id);
  assert.ok(day, "requested dish is planned");
  assert.equal(day.candidate.reasons[0], "むすめのリクエスト");
});

test("app: a request syncs as data, boosts the plan and is fulfilled by cooking", () => {
  const run = app();
  run('state.family=["パパ","むすめ"];state.me="むすめ";handleDailyAction("life-request",{recipe:"starter-20"})');
  assert.equal(run("openRequests().length"), 1);
  assert.ok(run("buildSyncPayload().requests") && run("Object.keys(buildSyncPayload().requests).length") === 1);
  assert.ok(run('dailyPlan().some(d=>d.candidate&&d.candidate.recipe.id==="starter-20")'));
  run('const d=dailyPlan().find(d=>d.candidate&&d.candidate.recipe.id==="starter-20");confirmDaily({date:today()},d.candidate.recipe);dailyRecord(state.mealSlots[today()])');
  assert.equal(run("openRequests().length"), 0);
  run('state=normalizeState(JSON.parse(JSON.stringify(state)))');
  assert.equal(run("Object.values(state.requests)[0].status"), "done");
});

test("app: invite members fill the placeholders and carry earlier ratings", () => {
  const run = app();
  run('state.family=["自分"];state.evaluations=[{id:"e1",recipeId:"starter-01",recipeTitle:"x",cookedAt:today(),mealType:"dinner",preferencePending:false,familyRepeatCycles:{"自分":"weekly"},memo:"",photo:"",updatedAt:nowIso()}];setMembers("パパ","むすめ")');
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.family)")), ["パパ", "むすめ"]);
  assert.equal(run('state.evaluations[0].familyRepeatCycles["パパ"]'), "weekly");
  assert.equal(run("me()"), "パパ");
});

test("app: viewers see the plan but only send requests; the owner applies a dated request", () => {
  const run = app();
  run('state.family=["パパ","むすめ"];state.me="むすめ";state.sync={code:"x",roomId:"a".repeat(64),lastSyncAt:""};state.roles={members:{"パパ":"owner","むすめ":"viewer"},updatedAt:nowIso()};syncEnabled=()=>true');
  assert.equal(run("isViewer()"), true);
  assert.ok(!run("renderDailyPlan()").includes('data-action="life-confirm"'));
  run('handleDailyAction("life-confirm",{})');
  assert.equal(run("Object.keys(state.mealSlots).length"), 0);
  run('handleDailyAction("life-request-swap",{date:addDays(today(),1),recipe:"starter-20"})');
  assert.equal(run("openRequests()[0].date===addDays(today(),1)"), true);
  assert.equal(run("openRequestFor(Lifestyle.curated.find(r=>r.id==='starter-20'))"), null);
  run('state.me="パパ";handleDailyAction("life-apply-swap",{id:openRequests()[0].id})');
  assert.equal(run("state.planOverrides[addDays(today(),1)]"), "starter-20");
  assert.equal(run("openRequests().length"), 0);
  assert.equal(run('roleOf("新しい人")'), "viewer");
});

test("app: a viewer's 食べられないもの apply to the household plan and 好き counts as 毎週", () => {
  const run = app();
  run('state.family=["パパ","むすめ"];state.me="むすめ";state.memberPrefs={"むすめ":{restrictions:["卵"],likes:["starter-20"],done:true,updatedAt:nowIso()}}');
  assert.ok(run('dailyProfile().restrictions.includes("卵")'));
  assert.ok(run('dailyPlan().every(d=>!d.candidate||Lifestyle.fit(d.candidate.recipe,Lifestyle.profile({restrictions:["卵"]}),d.date).ok)'));
  assert.equal(run('likedCycles(Lifestyle.curated.find(r=>r.id==="starter-20"))["むすめ"]'), "weekly");
  assert.equal(run('Object.keys(normalizeMemberPrefs(buildSyncPayload().memberPrefs)).length'), 1);
});

test("app: shopping round — requests until the deadline, only 'feelings' after, locked when shopping is done", () => {
  const run = app();
  run('state.family=["パパ","むすめ"];state.me="むすめ";state.sync={code:"x",roomId:"a".repeat(64),lastSyncAt:""};state.roles={members:{"パパ":"owner","むすめ":"viewer"},updatedAt:nowIso()};syncEnabled=()=>true');
  assert.equal(run("roundPhase()"), "none");
  run('const f=new Date(Date.now()+3*3600000);state.round=normalizeRound({deadline:localStamp(f),status:"open",updatedAt:nowIso()})');
  assert.equal(run("roundPhase()"), "open");
  assert.match(run("roundMessage()"), /に買い物に行く予定。献立変更のリクエストがあればそれまでによろしく！$/);
  run('handleDailyAction("life-request-swap",{date:addDays(today(),1),recipe:"starter-20"})');
  assert.equal(run("openRequests().length"), 1);
  run('state.round=normalizeRound({deadline:localStamp(new Date(Date.now()-60000)),status:"open",updatedAt:nowIso()})');
  assert.equal(run("roundPhase()"), "closed");
  run('handleDailyAction("life-request-swap",{date:addDays(today(),2),recipe:"starter-21"})');
  assert.equal(run("openRequests().length"), 1, "swap is locked after the deadline");
  run('handleDailyAction("life-request",{recipe:"starter-22"})');
  assert.equal(run('openRequests().find(q=>q.recipeId==="starter-22").late'), true);
  run('state.me="パパ";handleDailyAction("life-round-done",{})');
  assert.equal(run("roundPhase()"), "done");
  assert.equal(run("normalizeRound(JSON.parse(JSON.stringify(state.round))).status"), "done");
});

test("app: the shared timeline moves 献立 → リクエスト → 買い物 → 完了", () => {
  const run = app();
  run('state.onboarded=true;state.family=["パパ","むすめ"];state.me="パパ";state.sync={code:"x",roomId:"a".repeat(64),lastSyncAt:""};syncEnabled=()=>true;state.roles={members:{"パパ":"owner","むすめ":"viewer"},updatedAt:nowIso()}');
  assert.equal(run("flowState().step"), "献立");
  run('state.round=normalizeRound({deadline:localStamp(new Date(Date.now()+3600000)),status:"open",updatedAt:nowIso()})');
  assert.equal(run("flowState().step"), "リクエスト");
  run('dailyPlan().forEach(d=>d.candidate&&confirmDaily(d,d.candidate.recipe))');
  assert.equal(run("flowState().step"), "買い物");
  run('handleDailyAction("life-round-done",{})');
  assert.equal(run("flowState().step"), "完了");
  assert.ok(run("renderFlow()").includes("is-now"));
});
