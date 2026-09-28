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
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
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
  assert.ok(html.includes('🥬 野菜・果物'));assert.ok(html.includes('🥩 肉'));
  assert.ok(!html.includes('<select'));
});
test("pantry page and setup share one pantry: either place updates the saved profile",()=>{
  const run=app();run('state.foodProfile=Lifestyle.profile({completed:true,pantry:{"しょうゆ":"have"}});state.view="shopping"');
  run('handleDailyAction("life-pantry-open",{})');assert.equal(run('state.view'),"pantry");
  assert.ok(run('renderPantryPage()').includes('data-action="life-pantry-set" data-name="しょうゆ"'));
  run('handleDailyAction("life-pantry-set",{name:"しょうゆ"})');
  assert.equal(run('state.householdProfile.pantry["しょうゆ"]'),"none");assert.equal(run('dailyProfile().pantry["しょうゆ"]'),"none");
  run('handleDailyAction("life-profile",{});profileDraft().step=8');assert.equal(run('profileDraft().pantry["しょうゆ"]'),"none");
  run('handleDailyAction("life-pantry-toggle",{name:"しょうゆ"})');assert.equal(run('state.householdProfile.pantry["しょうゆ"]'),"have");
  run('handleDailyAction("life-pantry-back",{})');assert.equal(run('state.view'),"shopping");
});
test("creators: channel names and TikTok handles group saved recipes and filter the grid",()=>{
  const run=app();
  run(`state.recipes.push({id:"t1",title:"A丼",mealType:"dinner",ingredients:[],steps:[],videoUrl:"https://www.tiktok.com/@kurashiru/video/1",author:""},{id:"t2",title:"B丼",mealType:"dinner",ingredients:[],steps:[],videoUrl:"https://www.youtube.com/watch?v=x",author:"リュウジ<b>"})`);
  assert.equal(run('authorOf(state.recipes.find(r=>r.id==="t1"))'),"@kurashiru");
  assert.equal(run('sourceOf(state.recipes.find(r=>r.id==="t2"))'),"youtube");
  run('recipeTab="creators"');const html=run('renderCollection()');
  assert.ok(html.includes("@kurashiru"));assert.ok(html.includes("リュウジ&lt;b&gt;"));assert.ok(!html.includes("リュウジ<b>"));
  run('handleDailyAction("life-creator",{name:"@kurashiru"})');
  assert.equal(run('recipeFacets.author'),"@kurashiru");assert.equal(run('recipeTab'),"saved");
});
test("save guide: first visit shows steps, then a small paste strip stays; copied text becomes a draft",()=>{
  const run=app();run('state.onboarded=true;state.view="collection"');
  assert.ok(run('renderCollection()').includes('class="save-guide"'));
  run('saveGuideOpen=false');const html=run('renderCollection()');
  assert.ok(html.includes('class="save-strip"'));assert.ok(!html.includes('class="save-guide"'));
  assert.equal(run('startRecipeFromText("そぼろ丼 https://www.tiktok.com/@kurashiru/video/1")'),true);
  assert.equal(run('state.view'),"register");assert.equal(run('state.draft.shareTitle'),"そぼろ丼");assert.equal(run('state.draft.title'),"");assert.equal(run('state.draft.source'),"TikTok");
  assert.equal(run('startRecipeFromText("URLなし")'),false);
});
test("register: servings are read from the caption; unknown servings keep amounts as written",()=>{
  const run=app();
  assert.equal(run('detectSourceServings("材料（2人分）豚こま 200g")'),2);
  assert.equal(run('detectSourceServings("3〜4人前です")'),3);
  assert.equal(run('detectSourceServings("豚こま 200g")'),null);
  assert.equal(run('scaleAmountForServings("200g",2,null)'),"200g");
  run('state.onboarded=true;state.view="register";state.draft={...clone(emptyDraft),title:"丼",videoUrl:"https://youtu.be/x"};state.extractedIngredients=[{name:"豚こま",amount:"200g",category:"肉"}];state.draftExpanded=true');
  const html=run('renderRecipeEntry()');
  assert.ok(html.includes('servings-pick is-unknown'));assert.ok(!html.includes('ingredient-category-input'));
  run('state.editingRecipeId="x"');assert.ok(!run('renderRecipeEntry()').includes('entry-methods'));
});
test("import fallback: when AI analysis failed, ingredients are read from the description; TikTok caption gives a short title",()=>{
  const run=app();
  run('state.draft={...clone(emptyDraft),videoUrl:"https://youtube.com/shorts/abcdefghijk"}');
  run(`applyImportedRecipe({title:"豚こま丼",caption:"説明文:\\n材料（2人分）\\n豚こま 200g\\n玉ねぎ 1個\\n作り方\\n1. 炒める",ingredients:[],steps:[],analysis:{ok:false,code:"analysis_uncertain"}})`);
  assert.equal(run('state.extractedIngredients.length'),2);assert.equal(run('state.draft.sourceServings'),2);assert.equal(run('state.extractedSteps[0]'),"炒める");
  assert.equal(run('tiktokTitle("#時短 豚こま丼の作り方 #料理\\n材料 豚こま 200g")'),"豚こま丼の作り方");
});
test("video-read recipes say so; nutrition lines never become ingredients",()=>{
  const run=app();
  run('state.draft={...clone(emptyDraft),videoUrl:"https://youtube.com/shorts/abcdefghijk"}');
  run(`applyImportedRecipe({title:"コールスロー",caption:"",ingredients:[{name:"キャベツ",amount:"1/2玉"}],steps:["切る","和える"],analyzedFrom:"video"})`);
  assert.equal(run('state.extractedSteps.length'),2);
  assert.deepEqual(JSON.parse(run('JSON.stringify(parseIngredients("キャベツ 1/2玉\\n酢 大さじ4\\n1人前あたり、約102kcal P2.1g 11.6g").map(i=>i.name))')),["キャベツ","酢"]);
});
test("fallback does not turn description chatter into steps",()=>{
  const run=app();
  run('state.draft={...clone(emptyDraft),videoUrl:"https://youtube.com/watch?v=abcdefghijk"}');
  run(`applyImportedRecipe({title:"コールスロー",caption:"キャベツ 1/2玉\\n酢 大さじ4\\nキャベツ使い切り\\n味付けはケンタッキー風で、甘味料を入れてほんのり甘めに、具材には玉ねぎを入れています",ingredients:[],steps:[],analysis:{ok:false,code:"incomplete_recipe"}})`);
  assert.equal(run('state.extractedSteps.length'),0);assert.equal(run('state.extractedIngredients.length'),2);
});
test("request replies: the requester hears it was planned or passed, the planner hears thanks",()=>{
  const run=app();
  run('state.onboarded=true;state.family=["パパ","むすめ"];state.me="むすめ";state.roles={members:{"パパ":"owner","むすめ":"viewer"},updatedAt:nowIso()};globalThis.localStorage&&localStorage.removeItem&&localStorage.removeItem("ripigochi-request-seen")');
  run('const r=Lifestyle.curated[4];state.requests={"req-1":{id:"req-1",recipeId:r.id,recipeTitle:r.title,from:"むすめ",date:addDays(today(),1),status:"open",createdAt:nowIso(),updatedAt:nowIso()}}');
  assert.equal(run('requestNews().length'),0,"nothing until the planner acts");
  run('state.me="パパ";handleHouseholdAction("life-apply-swap",{id:"req-1"})');
  assert.equal(run('state.requests["req-1"].adoptedDate'),run('addDays(today(),1)'));
  run('state.me="むすめ"');
  assert.equal(run('requestNews()[0].kind'),"planned");assert.ok(run('renderRequestNews()').includes("パパが献立に入れてくれたよ"));
  run('handleHouseholdAction("life-request-thanks",{id:"req-1",key:"req-1:planned"})');
  assert.equal(run('requestNews().length'),0);assert.ok(run('state.requests["req-1"].thanksAt'));
  run('state.me="パパ"');assert.equal(run('requestNews()[0].kind'),"thanks");
  run('state.requests["req-2"]={id:"req-2",recipeId:"x",recipeTitle:"餃子",from:"むすめ",status:"dismissed",createdAt:nowIso(),updatedAt:nowIso()};state.me="むすめ"');
  assert.ok(run('requestNews().some(n=>n.kind==="passed")'));
});
test("joining under a new name renames the invitee instead of adding a third person",()=>{
  const run=app();
  run('state.family=["パパ","むすめ"];state.roles={members:{"パパ":"owner","むすめ":"viewer"},updatedAt:nowIso()};state.memberPrefs={"むすめ":{restrictions:[],likes:[],done:true,updatedAt:nowIso()}};state.evaluations=[{id:"e1",recipeId:"x",recipeTitle:"丼",cookedAt:today(),familyRepeatCycles:{"むすめ":"weekly"}}]');
  run('renameHouseholdMember("むすめ","ゆい")');
  assert.deepEqual(JSON.parse(run('JSON.stringify(state.family)')),["パパ","ゆい"]);
  assert.equal(run('state.roles.members["ゆい"]'),"viewer");assert.equal(run('"むすめ" in state.roles.members'),false);
  assert.equal(run('state.memberPrefs["ゆい"].done'),true);assert.equal(run('state.evaluations[0].familyRepeatCycles["ゆい"]'),"weekly");
  run('joinInvite={code:"x",from:"パパ",to:"ゆい"};joinPick=""');
  const html=run('renderJoin()');assert.ok(html.includes('data-name="ゆい"'));assert.ok(html.includes('data-name="パパ"'));
});
test("playlist import keeps chatter out of steps and offers a video re-read",()=>{
  const run=app();
  run('state.onboarded=true');
  run(`globalThis.__r=playlistRecipe({title:"濃厚冷やし胡麻坦々うどん",url:"https://www.youtube.com/watch?v=abcdefghijk",description:"材料\\nうどん 1玉\\nごま 大さじ2\\n本当にレンジだけで作ったの？と全く信じて貰えなかったりw\\n#レンジレシピ #無限レシピ",channelTitle:"こったそ"},{id:"PL1",title:"料理"})`);
  assert.equal(run('__r.steps.length'),0);assert.equal(run('__r.ingredients.length'),2);
  run('state.recipes.unshift(__r);recipeDetailId=__r.id;state.view="recipe"');
  assert.ok(!run('renderRecipeDetail()').includes('data-action="life-reread"'),"no API here, so no re-read button");
});
test("AI-judged conditions need no check, unless the household has foods it cannot eat",()=>{
  const run=app();
  run('state.onboarded=true;state.foodProfile=Lifestyle.profile({servings:2,completed:true,restrictions:[]})');
  run('state.draft={...clone(emptyDraft),videoUrl:"https://youtu.be/abcdefghijk"}');
  run(`applyImportedRecipe({title:"丼",ingredients:[{name:"豚こま",amount:"200g"}],steps:["焼く","盛る"],planning:{minutes:20,easy:true,equipment:["コンロ","フライパン"],tasks:[],tastes:["和風"]}})`);
  assert.equal(run('state.draft.planning.aiJudged'),true);assert.equal(run('state.draft.planning.conditionsConfirmed'),true);assert.equal(run('state.draft.planning.ingredientsVerified'),true);
  assert.equal(run('state.draft.planning.minutes'),20);
  assert.ok(!run('renderPlanningFields()').includes("未確認で保存"));
  run('state.foodProfile=Lifestyle.profile({servings:2,completed:true,restrictions:["卵"]})');
  run(`applyImportedRecipe({title:"丼",ingredients:[{name:"卵",amount:"2個"}],steps:["焼く","盛る"],planning:{minutes:15,easy:true,equipment:["コンロ"]}})`);
  assert.equal(run('state.draft.planning.ingredientsVerified'),false);assert.ok(run('renderPlanningFields()').includes("食べられないもの（卵）"));
});
test("creators: short names, a shared nickname, and grouping by channel ID",()=>{
  const run=app();
  assert.equal(run('shortCreatorName("リュウジのバズレシピ【料理研究家】")'),"リュウジ");
  assert.equal(run('shortCreatorName("だれウマ【料理研究家】")'),"だれウマ");
  assert.equal(run('shortCreatorName("こったそ の自由気ままに")'),"こったそ");
  assert.equal(run('shortCreatorName("@kurashiru")'),"kurashiru");
  assert.equal(run('shortCreatorName("Kurashiru [クラシル] 公式チャンネル")'),"Kurashiru");
  run(`state.recipes.push({id:"c1",title:"A",mealType:"dinner",ingredients:[],steps:[],videoUrl:"https://youtu.be/aaaaaaaaaaa",author:"リュウジのバズレシピ",channelId:"UCabcdefghij123"},{id:"c2",title:"B",mealType:"dinner",ingredients:[],steps:[],videoUrl:"https://youtu.be/bbbbbbbbbbb",author:"料理のおにいさんリュウジ",channelId:"UCabcdefghij123"})`);
  assert.equal(run('creatorsIn(state.recipes).length'),1,"a renamed channel stays one creator");
  run('handleDailyAction("life-creator-edit",{key:"yt:UCabcdefghij123"})');
  run('document.querySelector=(q)=>q==="#creator-alias"?{value:"リュウジさん"}:null;handleDailyAction("life-creator-save",{key:"yt:UCabcdefghij123"})');
  assert.equal(run('creatorName(state.recipes.find(r=>r.id==="c1"))'),"リュウジさん");
  assert.ok(run('JSON.stringify(buildSyncPayload().creatorNames)').includes("リュウジさん"));
  run('handleDailyAction("life-creator",{name:"yt:UCabcdefghij123"})');
  assert.equal(run('state.recipes.filter(r=>facetMatch(r)).length'),2);
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
  assert.ok(first.reasons[0].startsWith("一昨日はパスタ → "), first.reasons[0]);
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
  const plain = { パパ: "twice_month", むすめ: "twice_month" };
  assert.match(L.repeatFit(dish, start, ate(15), gap, plain).reason, /^ちょうどいい頃（15日ぶり）/);
  assert.match(L.repeatFit(dish, start, ate(30), gap, plain).reason, /^久しぶり/);
  assert.equal(L.repeatFit(dish, start, ate(30), gap, { パパ: "weekly", むすめ: "never" }).exclude, true);
  assert.equal(L.repeatFit(dish, start, ate(8), gap, { パパ: "weekly", むすめ: "weekly" }).reason, "ふたりの好物・8日ぶり");
  assert.equal(L.repeatFit(dish, start, ate(15), gap, { パパ: "weekly", むすめ: "twice_month" }).reason, "パパの好物・15日ぶり");
  assert.equal(L.repeatFit(dish, start, ate(9), gap, { パパ: "weekly" }).reason, "大好物・9日ぶり");
  assert.equal(L.repeatFit(dish, start, ate(9), gap, { パパ: "weekly", ママ: "tomorrow", むすめ: "weekly" }).reason, "みんなの好物・9日ぶり");
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
  assert.ok(day.candidate.reasons.some((r) => /^ふたりの好物・\d+日ぶり$/.test(r)), day.candidate.reasons.join());
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

test("app: 3-day rhythm splits the week into 月火水／木金土 with Sunday off and shopping the day before", () => {
  const run = app();
  run('today=()=>"2026-09-24";state.onboarded=true;state.rhythm=normalizeRhythm({preset:"3day",shopTime:"17:00",updatedAt:nowIso()})');
  const blocks = JSON.parse(run("JSON.stringify(currentBlocks())"));
  assert.deepEqual(blocks.map((b) => [b.start, b.end, b.shopAt]), [["2026-09-24", "2026-09-26", "2026-09-23T17:00"], ["2026-09-28", "2026-09-30", "2026-09-27T17:00"]]);
  assert.equal(run("rhythmPlanDays()"), 7);
  const plan = JSON.parse(run("JSON.stringify(dailyPlan().map(d=>[d.date,!!d.off]))"));
  assert.deepEqual(plan.find(([d]) => d === "2026-09-27"), ["2026-09-27", true], "Sunday is off");
  run('handleDailyAction("life-confirm",{block:"2026-09-24"})');
  assert.equal(run('blockStatus(currentBlocks()[0])'), "decided");
  assert.ok(!run('state.mealSlots["2026-09-28"]'), "the next block stays a draft");
  assert.equal(run("decidedUntil()"), "2026-09-26");
  run('handleDailyAction("life-block-shopped",{key:"2026-09-24"})');
  assert.equal(run('blockStatus(currentBlocks()[0])'), "shopped");
  assert.ok(run("renderWeekBoard()").includes("wk-bar"));
});

test("traits: パン粉 and フライパン do not make a dish a bread meal", () => {
  assert.notEqual(L.traits(L.curated.find((r) => /ハンバーグ/.test(r.title))).staple, "bread");
  assert.equal(L.traits(L.curated.find((r) => /ビリヤニ/.test(r.title))).staple, "rice");
  assert.equal(L.traits({ title: "たまごサンド", ingredients: [{ name: "食パン" }] }).staple, "bread");
});

test("tags: every starter gets a staple, a cuisine and a main ingredient; facets narrow in three taps", () => {
  for (const r of L.curated) {
    const t = L.tags(r);
    assert.ok(["rice", "noodle", "bread", "other"].some((x) => t.includes(x)), r.title);
    assert.ok(["japanese", "western", "chinese"].some((x) => t.includes(x)), r.title);
    assert.ok(["chicken", "pork", "beef", "mince", "fish", "egg", "tofu", "veg"].some((x) => t.includes(x)), r.title);
  }
  assert.ok(L.tags(L.curated.find((r) => /担々/.test(r.title))).includes("spicy"));
  const run = app();
  run('state.onboarded=true;recipeFacets={staple:"noodle",main:"",style:""}');
  const noodles = run("starterRecipeList().filter(r=>facetMatch(r)).length");
  run('recipeFacets.style="spicy"');
  const spicy = run("starterRecipeList().filter(r=>facetMatch(r)).length");
  assert.ok(noodles > spicy && spicy >= 1, `${noodles} > ${spicy}`);
});

test("app: saved SNS recipes keep the poster and can be filtered by 投稿者 and わが家", () => {
  const run = app();
  run('state.onboarded=true;state.recipes=normalizeRecipes([{...clone(Lifestyle.curated[3]),id:"r1",curated:undefined,author:"山田ごはん",mealType:"dinner"},{...clone(Lifestyle.curated[4]),id:"r2",curated:undefined,author:"",mealType:"dinner"}])');
  assert.equal(run('state.recipes[0].author'), "山田ごはん");
  run(`recipeFacets={home:"",staple:"",main:"",style:"",author:"name:山田ごはん"}`);
  assert.equal(run('state.recipes.filter(r=>facetMatch(r)).length'), 1);
  assert.ok(run(`renderFacets(state.recipes).includes("山田ごはん ✕")`));assert.ok(!run(`renderFacets(state.recipes).includes("投稿者")`));
  run('recipeFacets={home:"new",staple:"",main:"",style:"",author:""}');
  assert.equal(run('state.recipes.filter(r=>facetMatch(r)).length'), 2);
  assert.ok(run('getFilteredRecipes({allMeals:true}).length===2'));
  run('state.searchText="山田"');
  assert.equal(run('getFilteredRecipes({allMeals:true}).length'), 1);
});

test("aisles: names decide the aisle, not the recipe's category; household fixes win and sync", () => {
  const A = require("../aisles.js");
  const cases = { "豚バラ薄切り肉": "meat", "鶏ガラスープの素": "seasoning", "にんにく（チューブ）": "seasoning", "しょうが": "veg", "ほうれんそう": "veg", "えのきだけ": "veg", "ツナ缶": "dry", "油揚げ": "daily", "牛乳": "chilled", "卵": "chilled", "納豆": "daily", "ごま油": "seasoning", "塩鮭": "fish", "冷凍うどん": "frozen", "中華麺": "staple", "パン粉": "dry", "豆腐": "daily" };
  for (const [name, aisle] of Object.entries(cases)) assert.equal(A.aisleOf(name, "その他"), aisle, name);
  assert.equal(A.aisleOf("謎の食材", "野菜"), "veg", "falls back to the recipe category");
  assert.equal(A.aisleOf("謎の食材"), "other");
  assert.equal(A.aisleOf("ツナ缶", "", { "ツナ缶": { aisle: "fish" } }), "fish");
  const run = app();
  run('state.aisleOverrides={"ツナ缶":{aisle:"fish",updatedAt:nowIso()},"x":{aisle:"bad"}}');
  assert.deepEqual(Object.keys(JSON.parse(run("JSON.stringify(normalizeAisleOverrides(buildSyncPayload().aisleOverrides))"))), ["ツナ缶"]);
});

test("app: after 買い物完了 the next plan gets a fresh list — old purchases and their amounts drop out", () => {
  const run = app();
  run('state.onboarded=true');
  const r = 'Lifestyle.curated.find(r=>r.id==="starter-03")';
  run(`confirmDaily({date:today()},${r});dailyShopping().forEach(i=>state.shoppingMarks[i.id]={status:"purchased",signature:i.signature,updatedAt:nowIso()})`);
  assert.ok(run('dailyShopping().every(i=>i.status==="purchased")'));
  run('state.shopDone={x:new Date(Date.now()+1000).toISOString()}');
  assert.equal(run("dailyShopping().length"), 0, "last trip is no longer on the list");
  run(`const later=new Date(Date.now()+2000).toISOString();confirmDaily({date:addDays(today(),1)},${r});state.mealSlots[addDays(today(),1)].updatedAt=later`);
  const items = JSON.parse(run("JSON.stringify(dailyShopping())"));
  assert.ok(items.length > 0);
  assert.ok(items.every((i) => i.status !== "purchased"), "nothing is pre-ticked from the last trip");
  const pork = items.find((i) => i.name === "豚こま");
  assert.equal(pork.amount, JSON.parse(run(`JSON.stringify(${r}.ingredients.find(i=>i.name==="豚こま").amount)`)), "amount is only for the new meal");
  assert.ok(pork.uses.includes("豚こまキャベツ丼"));
  assert.ok(run("renderTripMeals()").includes("1食分"));
});

test("app: tapping a recipe opens a read-only detail; starters can be hidden from the list and the plan", () => {
  const run = app();
  run('state.onboarded=true;handleDailyAction("life-recipe-open",{recipe:"starter-03"})');
  assert.equal(run("state.view"), "recipe");
  const html = run("renderRecipeDetail()");
  assert.ok(html.includes("材料") && html.includes("作り方") && html.includes("豚こま"));
  assert.ok(html.includes("自分のレシピに保存"));
  run('handleDailyAction("life-save-starter",{recipe:"starter-03"})');
  assert.ok(run("!detailRecipe().curated"), "detail follows the saved copy");
  assert.ok(run('renderRecipeDetail().includes("編集する")'));
  run('handleDailyAction("life-starters",{show:"false"})');
  assert.equal(run("starterRecipeList().length"), 0);
  assert.ok(run("allDinnerRecipes().every(r=>!r.curated)"));
  assert.equal(run("normalizeStarterPref(buildSyncPayload().starterPref).show"), false);
  run('handleDailyAction("life-starters",{show:"true"})');
  assert.ok(run("starterRecipeList().length") > 0);
});

test("skills: every starter gets a 1–5 skill level from its steps; titles and draining do not count", () => {
  const S = require("../skills.js");
  const byId = (n) => L.curated.find((r) => r.id === `starter-${n}`);
  for (const r of L.curated) { const x = S.rate(r); assert.ok(x.level >= 1 && x.level <= 5, r.title); }
  assert.equal(S.rate(byId("04")).level, 1, "レンジで混ぜるだけ");
  assert.equal(S.rate(byId("29")).level, 1, "汁を切る is not knife work");
  assert.equal(S.rate(byId("08")).level, 2, "焼きうどん in the title is not searing");
  assert.ok(S.rate(byId("13")).level >= 4, "照り焼き: open, sear and glaze");
  assert.ok(S.rate(byId("26")).skills.includes("shallowfry"));
  assert.ok(L.tags(byId("04")).includes("easy"));
  assert.ok(!L.tags(byId("13")).includes("easy"));
});

test("skill quiz: answers give a level; the plan stays at that level, or adds one challenge when growing", () => {
  const run = app();
  const bank = JSON.parse(run("JSON.stringify(SKILL_BANK)"));
  assert.ok(bank.length >= 50, "a bank of about 50 questions");
  assert.equal(new Set(bank.map((q) => q.id)).size, bank.length, "unique ids");
  for (const q of bank) { assert.equal(q.c.length, 4, q.id); assert.equal(new Set(q.c).size, 4, q.id); assert.ok(q.why && q.a >= 0 && q.a < 4, q.id); assert.ok(run(`!!SKILL_CATS["${q.cat}"]`), q.id); }
  for (const l of [1, 2, 3, 4, 5]) assert.ok(bank.filter((q) => q.level === l).length >= 7, `enough at ★${l}`);
  const take = (rightWhen) => run(`startSkillQuiz();for(let i=0;i<10;i++){const q=SKILL_BANK.find(x=>x.id===skillQuiz.current.id);handleDailyAction("life-quiz-answer",{value:String((${rightWhen})(i,q)?q.a:(q.a+1)%4)});handleDailyAction("life-quiz-next",{})};JSON.stringify({...cbtResult(skillQuiz),done:skillQuiz.done,levels:skillQuiz.answers.map(a=>SKILL_BANK.find(q=>q.id===a.id).level),ids:new Set(skillQuiz.answers.map(a=>a.id)).size})`);
  const top = JSON.parse(take("() => true"));
  assert.deepEqual([top.score, top.star, top.kyu, top.done, top.ids], [1000, 5, "初段", true, 10], "all right: the top, no repeats");
  assert.ok(JSON.parse(take("() => true")).levels.slice(-3).every((l) => l === 5), "right answers climb to ★5 questions");
  const low = JSON.parse(take("() => false"));
  assert.deepEqual([low.score, low.star, low.kyu], [0, 1, "10級"]);
  const mid = JSON.parse(take("(i) => i % 2 === 0"));
  assert.ok(mid.score > 200 && mid.score < 700 && mid.star >= 2 && mid.star <= 4, `alternating lands in the middle: ${mid.score}`);
  assert.deepEqual(JSON.parse(run("JSON.stringify([starOfScore(239),starOfScore(240),starOfScore(840),kyuOfScore(612),kyuOfScore(99)])")), [1, 2, 5, "4級", "10級"]);
  const S = require("../skills.js");
  const steady = L.propose({ recipes: L.curated, profile: L.profile({ skillLevel: 2 }), start, length: 7, addDays });
  assert.ok(steady.every((d) => !d.candidate || S.rate(d.candidate.recipe).level <= 2), "routine keeps to ★2");
  const grow = L.propose({ recipes: L.curated, profile: L.profile({ skillLevel: 2, skillGrowth: "grow" }), start, length: 7, addDays });
  const hard = grow.filter((d) => d.candidate && S.rate(d.candidate.recipe).level > 2);
  assert.ok(hard.length <= 1, "at most one challenge per plan");
  assert.ok(grow.every((d) => !d.candidate || S.rate(d.candidate.recipe).level <= 3));
  if (hard.length) assert.match(hard[0].candidate.reasons[0], /^ちょっと挑戦/);
  run('state.onboarded=true;startSkillQuiz();skillQuiz.theta=3.4;skillQuiz.answers=Array(10).fill({id:"m1",ok:true});skillQuiz.done=true');
  assert.match(run("renderSkillQuiz()"), /580<\/b><small>\/ 1000点[\s\S]*5級[\s\S]*いまここ[\s\S]*★4「おうちシェフ」<\/b>へ[\s\S]*約\d+皿[\s\S]*life-quiz-save" data-value="grow"/, "score, rank, ladder, the way to the next star, then growth");
  run('handleDailyAction("life-quiz-save",{value:"steady"})');
  assert.deepEqual(JSON.parse(run("JSON.stringify([state.skillProfile.level,state.skillProfile.score,state.skillProfile.growth,dailyProfile().skillLevel,skillQuiz])")), [3, 580, "steady", 3, null]);
});

test("freshness: perishable, hard-to-freeze food goes first after shopping", () => {
  const f = (names) => L.freshness({ ingredients: names.map((name) => ({ name })) });
  assert.deepEqual([f(["もやし", "豚こま切れ肉"]).urgency, f(["ほうれん草"]).label, f(["冷凍えび", "ツナ缶"]).urgency, f(["じゃがいも", "玉ねぎ"]).urgency], [5, "葉もの野菜", 0, 0]);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const plan = L.propose({ recipes: L.curated, profile: L.profile({}), start, length: 7, addDays, rounds: [dates] });
  const u = plan.map((d) => L.freshness(d.candidate.recipe).urgency);
  assert.ok(u[0] + u[1] > u[5] + u[6], `perishables early: ${u}`);
  assert.ok(u.slice(3).every((x) => x < 5), "nothing that spoils fast on day 4 and later");
  assert.match(plan.find((d) => L.freshness(d.candidate.recipe).urgency >= 3).candidate.reasons.join(), /日持ちしないので早めに/);
});

test("eating out moves the bought dinners back a day; neighbours can swap", () => {
  const run = app();
  run(`state.onboarded=true;state.rhythm=null;const rs=allDinnerRecipes().slice(0,3);[0,1,2].forEach(i=>{confirmDaily({date:addDays(today(),i)},rs[i]);state.mealSlots[addDays(today(),i)].updatedAt="2026-01-01T00:00:00.000Z"});state.shopDone={x:"2026-01-02T00:00:00.000Z"};globalThis.T=rs.map(r=>r.title)`);
  const titles = JSON.parse(run("JSON.stringify(T)"));
  run('handleDailyAction("life-skip",{date:today()});handleDailyAction("life-skip-kind",{date:today(),kind:"out",shift:"true"})');
  const got = JSON.parse(run("JSON.stringify([0,1,2,3].map(i=>{const s=state.mealSlots[addDays(today(),i)];return s.status==='off'?s.kind:s.recipe.title}))"));
  assert.deepEqual(got, ["out", ...titles], "each dinner one day later; the last one spills over");
  assert.ok(run("[1,2,3].every(i=>state.mealSlots[addDays(today(),i)].bought)"), "still marked as bought");
  assert.equal(run("tripMeals().length"), 0, "moved dinners do not come back to the shopping list");
  assert.match(run("renderToday()"), /今日は外食[\s\S]*また次の晩ごはんで/);
  assert.match(run("renderDailyPlan()"), /🍽 外食[\s\S]*からずらしました/);
  run('handleDailyAction("life-move",{date:addDays(today(),1),dir:"down"})');
  assert.deepEqual(JSON.parse(run("JSON.stringify([1,2].map(i=>state.mealSlots[addDays(today(),i)].recipe.title))")), [titles[1], titles[0]], "swapped with the next day");
  run('handleDailyAction("life-skip-kind",{date:addDays(today(),3),kind:"deli",shift:"false"})');
  assert.equal(run("state.mealSlots[addDays(today(),3)].status+state.mealSlots[addDays(today(),3)].kind+(state.mealSlots[addDays(today(),4)]?.status||'none')"), "offdelinone", "without shifting, the dinner is dropped");
});

test("eating out on a weekday rhythm: cook the extra dinner on Saturday (recommended) or carry it to next week", () => {
  const setup = () => {
    const run = app();
    run(`state.onboarded=true;handleDailyAction("life-rhythm",{preset:"weekday"});globalThis.B=currentBlocks();handleDailyAction("life-confirm",{block:B[0].key});state.shopDone={...(state.shopDone||{}),[B[0].key]:nowIso()}`);
    return run;
  };
  let run = setup();
  const b = JSON.parse(run("JSON.stringify(B.map(x=>x.dates))"));
  const fri = run(`state.mealSlots["${b[0][b[0].length - 1]}"].recipe.title`);
  const sat = run(`addDays("${b[0][b[0].length - 1]}",1)`);
  run(`skipDate="${b[0][1]}"`);
  const panel = run(`renderSkipPanel("${b[0][1]}")`);
  assert.match(panel, /value="early" checked[\s\S]*<u>土曜日<\/u>も料理する（おすすめ）[\s\S]*value="carry"[\s\S]*次の自炊日まで持ち越す[\s\S]*value="none"/, "recommend Saturday, keep carry and none");
  run(`handleDailyAction("life-skip-kind",{date:"${b[0][1]}",kind:"out",mode:"early"})`);
  const s1 = JSON.parse(run(`JSON.stringify(state.mealSlots["${sat}"])`));
  assert.deepEqual([s1.recipe.title, s1.status, !!s1.bought], [fri, "confirmed", true], "Friday's dinner is cooked on Saturday");
  assert.equal(run(`state.mealSlots["${b[1][0]}"]?.status||"none"`), "none", "next week starts fresh");
  assert.match(run("renderDailyPlan()"), new RegExp(`${fri}`));
  // 次の自炊日まで持ち越す
  run = setup();
  run(`handleDailyAction("life-skip-kind",{date:"${b[0][1]}",kind:"out",mode:"carry"})`);
  const mon = JSON.parse(run(`JSON.stringify(state.mealSlots["${b[1][0]}"])`));
  assert.equal(mon.recipe.title, fri, "carried to next Monday");
  assert.ok(mon.bought && mon.status === "confirmed");
  assert.match(run("renderDailyPlan()"), /↪ [^<]+の分を持ち越し/);
  const plan = JSON.parse(run(`JSON.stringify(dailyPlan().filter(d=>${JSON.stringify(b[1])}.includes(d.date)).map(d=>d.slot?"slot":d.candidate?"new":"-"))`));
  assert.deepEqual(plan, ["slot", "new", "new", "new", "new"], "next week starts with the carried dinner and fills the rest");
  assert.equal(run(`dailyShopping().filter(i=>i.status==="buy"&&(i.uses||[]).includes("${fri}")).length`), 0, "not on any shopping list again");
  run(`handleDailyAction("life-skip-kind",{date:"${b[0][2]}",kind:"deli",mode:"carry"})`);
  assert.equal(run(`[0,1].map(i=>state.mealSlots[${JSON.stringify(b[1])}[i]]?.bought?"c":"-").join("")`), "cc", "a second night out carries one more");
});

test("ホーム画面に追加: after the first plan, again after the first cook, then weekly up to 3 times", () => {
  const run = app();
  run(`globalThis.__store={};globalThis.localStorage={getItem:(k)=>__store[k]??null,setItem:(k,v)=>{__store[k]=String(v)},removeItem:(k)=>{delete __store[k]}};installPlatform=()=>"ios";state.onboarded=true`);
  assert.equal(run("installDue()"), false, "not before a plan is decided");
  run(`confirmDaily({date:today()},allDinnerRecipes()[0])`);
  assert.equal(run("installDue()"), true, "after the first plan");
  const card = run("renderInstallCard()");
  assert.match(card, /共有ボタン[\s\S]*ホーム画面に追加[\s\S]*「追加」/, "iPhone: the three steps");
  assert.match(card, /通知[\s\S]*消えにくく/, "why it matters");
  run('handleDailyAction("life-install-later",{})');
  assert.equal(run("installDue()"), false, "closed: quiet for now");
  run("noteInstallCook()");
  assert.equal(run("installDue()"), true, "the first cooked dinner brings it back once");
  run('handleDailyAction("life-install-later",{})');
  assert.equal(run("installDue()"), false);
  run(`const i=installInfo();i.lastAt=new Date(Date.now()-8*86400000).toISOString();saveInstall(i)`);
  assert.equal(run("installDue()"), true, "a week later");
  run('handleDailyAction("life-install-later",{})');
  run(`const j=installInfo();j.lastAt=new Date(Date.now()-30*86400000).toISOString();saveInstall(j)`);
  assert.equal(run("installDue()"), false, "never more than three times");
  run(`installPlatform=()=>"inapp"`);
  assert.match(run("renderInstallSettings()"), /ブラウザで開く[\s\S]*life-install-copy/, "in LINE: open in the browser first");
  run(`installPlatform=()=>"android";installPrompt={prompt(){},userChoice:Promise.resolve({outcome:"dismissed"})}`);
  assert.match(run("renderInstallSettings()"), /life-install-prompt/, "Android: one button");
  run(`saveInstall({...installInfo(),installed:true})`);
  assert.match(run("renderSettings()"), /ホーム画面に追加[\s\S]*追加ずみ/);
});

test("通知: the next two weeks of reminders come from the plan and change as it does", () => {
  const run = app();
  run(`globalThis.__store={};globalThis.localStorage={getItem:(k)=>__store[k]??null,setItem:(k,v)=>{__store[k]=String(v)},removeItem:(k)=>{delete __store[k]}};state.onboarded=true;handleDailyAction("life-rhythm",{preset:"weekday"});globalThis.B=currentBlocks().find(b=>blockStatus(b)==="open")`);
  const ids = () => JSON.parse(run("JSON.stringify(pushSchedule().map(x=>x.id))"));
  const key = run("B?.key||''");
  let list = ids();
  if (key) {
    const [decideAhead, shopAhead] = JSON.parse(run("JSON.stringify([new Date(B.shopAt)-3*3600e3>Date.now(),new Date(B.shopAt)-30*60e3>Date.now()])"));
    assert.equal(list.includes(`decide-${key}`), decideAhead, "decide 3 hours before shopping, while still ahead");
    assert.equal(list.includes(`shop-${key}`), shopAhead, "shop 30 minutes before");
    run('handleDailyAction("life-confirm",{block:B.key})');
    list = ids();
    assert.ok(!list.includes(`decide-${key}`), "once decided, no decide reminder");
    assert.equal(list.includes(`shop-${key}`), shopAhead, "the shopping reminder stays");
    run('state.shopDone={...(state.shopDone||{}),[B.key]:nowIso()}');
    assert.ok(!ids().includes(`shop-${key}`), "after shopping, no shopping reminder");
  }
  assert.ok(ids().some((id) => id.startsWith("tonight-")), "tonight reminders for planned days");
  assert.ok(!ids().some((id) => id.startsWith("record-")), "the record reminder is off by default");
  run(`savePush({...pushInfo(),record:true,tonight:false})`);
  assert.ok(!ids().some((id) => id.startsWith("tonight-")));
  const item = JSON.parse(run("JSON.stringify(pushSchedule()[0]||null)"));
  if (item) assert.ok(Date.parse(item.at) > Date.now() && /^\?view=/.test(item.url || "?view=today"));
  assert.match(run("renderSettings()"), /🔔[\s\S]*通知/);
});

test("定番フォルダ: one dish, many ways; once a week, pinned weekdays, a top-5 ranking", () => {
  const run = app();
  assert.equal(run('dishNameOf("【悪魔の】レンジで明太子パスタ｜リュウジのバズレシピ")'), "明太子パスタ");
  assert.equal(run('dishNameOf("簡単！やみつき 鶏むね肉の照り焼き #shorts")'), "鶏むね肉の照り焼き");
  run(`state.onboarded=true;state.rhythm=null;const b=Lifestyle.curated.find(r=>r.id==="starter-03");
    state.recipes=["A","B","C","D","E","F"].map((x,i)=>({...JSON.parse(JSON.stringify(b)),id:"v"+x,curated:undefined,starterId:undefined,title:(i%2?"たらこ":"明太子")+"パスタ "+x,author:"作者"+x,videoUrl:"https://www.youtube.com/watch?v=aaaaaaaaaa"+x,savedAt:"2026-01-0"+(i+1)}));
    handleDailyAction("life-folder-add",{recipe:"vA",folder:"new"})`);
  const key = run("Object.keys(state.folders)[0]");
  assert.equal(run(`state.folders["${key}"].name`), "明太子パスタ");
  assert.equal(run('suggestFolder("たらこパスタ B")?.name'), "明太子パスタ", "たらこ counts as 明太子");
  run(`["vB","vC","vD","vE","vF"].forEach(id=>handleDailyAction("life-folder-add",{recipe:id,folder:"${key}"}))`);
  assert.equal(run('childText(recipeById("vA"))'), "▶作者A流", "a short child name: icon + poster + 流");
  const plan = JSON.parse(run("JSON.stringify(dailyPlan().map(d=>d.candidate?.recipe.folder||''))"));
  assert.ok(plan.filter(Boolean).length <= 1, `the folder appears once in the plan: ${plan}`);
  assert.equal(run("planRecipes().filter(r=>r.folder).length"), 1, "one way per folder goes to the planner");
  const tue = run('(()=>{for(let i=0;i<7;i++){const d=addDays(today(),i);if(new Date(d+"T12:00:00").getDay()===2)return d}})()');
  run(`setFolderPin("${key}","2");state.planLength=7`);
  const pinned = JSON.parse(run(`JSON.stringify(dailyPlan().filter(d=>d.candidate?.recipe.folder).map(d=>[d.date,d.candidate.reasons[0]]))`));
  assert.deepEqual(pinned, [[tue, "📌 毎週火曜"]], "pinned to Tuesday, and only there");
  assert.match(run("renderDailyPlan()"), /明太子パスタ<span class="child-name">/);
  // ランキング：5位までに入れると、5位は圏外へ
  run(`["vA","vB","vC","vD","vE"].forEach((id,i)=>handleDailyAction("life-rank",{folder:"${key}",recipe:id,pos:String(i+1)}))`);
  run(`handleDailyAction("life-rank",{folder:"${key}",recipe:"vF",pos:"2"})`);
  assert.equal(run(`state.folders["${key}"].ranking.join()`), "vA,vF,vB,vC,vD", "vE drops out of the top 5");
  run(`handleDailyAction("life-rank",{folder:"${key}",recipe:"vA",pos:"out"})`);
  assert.equal(run(`state.folders["${key}"].ranking.join()`), "vF,vB,vC,vD");
  // 作ったあと：何位？を聞く
  run(`const d=today();confirmDaily({date:d},recipeById("vE"));dailyRecord(state.mealSlots[d]);preferencePromptId=""`);
  assert.match(run("renderRankPrompt()"), /明太子パスタ[\s\S]*作者E[\s\S]*5位[\s\S]*圏外/);
  // 選択：まだ作っていない作り方 → ランキング → ほかの作り方を探す
  run(`swapDate=addDays(today(),1);state.mealSlots[swapDate]=undefined;delete state.mealSlots[swapDate];state.planOverrides[swapDate]="vA"`);
  assert.match(run("renderSwapChoices()"), /明太子パスタ<\/b>の作り方[\s\S]*まだ作っていない[\s\S]*ランキング[\s\S]*🥇[\s\S]*ほかの作り方を探す/);
  assert.match(run('recipeTab="folders";folderOpen="' + key + '";renderFolders()'), /毎週[\s\S]*ランキング[\s\S]*ほかの「明太子パスタ」の作り方を探す/);
  run(`handleDailyAction("life-folder-delete",{folder:"${key}"})`);
  assert.equal(run("state.recipes.filter(r=>r.folder).length+':'+folderList().length"), "0:0", "deleting the folder keeps the recipes");
});

test("定番フォルダ: make one by name, then add recipes from a picker", () => {
  const run = app();
  run(`state.onboarded=true;recipeTab="folders"`);
  assert.match(run("renderFolders()"), /data-folder-create[\s\S]*料理名/, "a create form even with no folders");
  const key = run(`createFolder("照り焼き丼")`);
  assert.equal(run(`createFolder("照り焼き丼 ")`), key, "the same name is not made twice");
  run(`folderOpen="${key}";folderPicking=true`);
  const html = run("renderFolders()");
  assert.match(html, /まだ作り方がありません[\s\S]*＋ レシピを入れる/);
  const first = run(`(()=>{const m=/data-action="life-folder-add" data-recipe="([^"]+)"/.exec(renderFolderPicker(state.folders["${key}"]));return m[1]})()`);
  assert.match(run(`allDinnerRecipes().find(r=>r.id==="${first}").title`), /照り焼き丼/, "recipes with a similar name come first");
  run(`handleDailyAction("life-folder-add",{recipe:"${first}",folder:"${key}"})`);
  assert.equal(run(`folderMembers("${key}").length`), 1, "a starter is saved as your own recipe and put in the folder");
  assert.doesNotMatch(run(`renderFolderPicker(state.folders["${key}"])`), new RegExp(`data-recipe="${first}"`), "already in: not offered again");
});

test("選択: new recipes first, then the best three by rating", () => {
  const run = app();
  run(`state.onboarded=true;state.rhythm=null;const r=Lifestyle.curated.find(x=>x.id==="starter-12");state.evaluations.unshift({id:"meal-x",recipeId:r.id,recipeTitle:r.title,cookedAt:addDays(today(),-20),mealType:"dinner",familyRepeatCycles:{自分:"tomorrow"},memo:"",photo:"",updatedAt:nowIso()});swapDate=addDays(today(),1)`);
  const html = run("renderSwapChoices()");
  assert.match(html, /🆕 まだ作っていない[\s\S]*⭐ 評価順ベスト3[\s\S]*starter-12/);
  assert.equal((html.match(/life-choose/g) || []).length, 4, "three new and one rated (collapsed rest)");
  assert.match(html, /ほかの候補を見る/);
});

test("cooking XP, levels, badges, the skill list and the promotion exam", () => {
  const run = app();
  const S = require("../skills.js");
  run('state.onboarded=true;state.skillProfile={level:2,quizLevel:2,growth:"steady",diagnosed:true,updatedAt:nowIso()}');
  assert.deepEqual(JSON.parse(run("JSON.stringify([cookStats().xp,cookStats().lv,earnedBadges().length])")), [0, 1, 1], "nothing cooked yet: only the test badge");
  run(`const r=Lifestyle.curated[0]; for (let i=11;i>=0;i--) state.evaluations.unshift({id:"meal-"+addDays(today(),-i),recipeId:r.id,recipeTitle:r.title,cookedAt:addDays(today(),-i),mealType:"dinner",photo:i===0?"data:image/jpeg;base64,xx":"",familyRepeatCycles:{},memo:"",updatedAt:nowIso()})`);
  const L = S.rate(require("../lifestyle.js").curated[0]).level;
  const s = JSON.parse(run("JSON.stringify(cookStats())"));
  assert.equal(s.xp, 12 * (10 + 5 * (L - 1)) + 10 + 5 + 11 * 5, "base + ★ + first time + photo + days in a row");
  assert.deepEqual([s.count, s.kinds, s.streak, s.week, s.photos], [12, 1, 12, true, 1]);
  assert.deepEqual(JSON.parse(run("JSON.stringify(earnedBadges().map(b=>b.id))")), ["first", "test", "photo", "streak3", "week", "d10", "regular", "streak7"]);
  assert.equal(run("levelOfXp(39).lv+','+levelOfXp(40).lv+','+levelOfXp(100).lv+','+xpAtLv(4)"), "1,2,3,180");
  assert.ok(s.lv >= 4 && run("examReady()"), "Lv4 opens the ★3 exam");
  assert.match(run("renderSkillSettings()"), /lv-badge[\s\S]*昇級試験を受ける[\s\S]*身についたスキル[\s\S]*バッジ <small>8\/15/);
  run("startSkillExam()");
  const levels = JSON.parse(run('const out=[];for(let i=0;i<5;i++){const q=SKILL_BANK.find(x=>x.id===skillQuiz.current.id);out.push(q.level);handleDailyAction("life-quiz-answer",{value:String(i===0?(q.a+1)%4:q.a)});handleDailyAction("life-quiz-next",{})};JSON.stringify(out)'));
  assert.deepEqual(levels, [3, 3, 3, 3, 3], "the exam asks ★3 questions");
  assert.match(run("renderSkillQuiz()"), /4<\/b> \/ 5 問正解[\s\S]*合格/);
  run('handleDailyAction("life-exam-done",{})');
  assert.deepEqual(JSON.parse(run("JSON.stringify([state.skillProfile.level,state.skillProfile.promoted,earnedBadges().some(b=>b.id==='promote'),examReady()])")), [3, 1, true, false], "★3 now; the ★4 exam waits for Lv7");
  run("startSkillExam();for(let i=0;i<5;i++){const q=SKILL_BANK.find(x=>x.id===skillQuiz.current.id);handleDailyAction('life-quiz-answer',{value:String((q.a+1)%4)});handleDailyAction('life-quiz-next',{})};handleDailyAction('life-exam-done',{})");
  assert.deepEqual(JSON.parse(run("JSON.stringify([state.skillProfile.level,state.skillProfile.examFailedOn===today()])")), [3, true], "a failed exam keeps the star; try again tomorrow");
});

test("rhythm: starting mid-block begins at the next whole block; days before it are 'いつもどおり'", () => {
  const run = app();
  run('state.onboarded=true;handleDailyAction("life-rhythm",{preset:"3day"})');
  const from = run("state.rhythm.startFrom");
  assert.ok(from >= run("today()"), "starts today or later");
  assert.ok(run(`currentBlocks()[0].start === "${from}"`));
  assert.ok(run(`currentBlocks()[0].shopAt > localStamp(new Date())`), "its shopping time is still ahead");
  const pre = JSON.parse(run("JSON.stringify(dailyPlan().filter(d=>d.date<state.rhythm.startFrom).map(d=>!!d.prestart))"));
  assert.ok(pre.every(Boolean));
  run('confirmDaily({date:today()},Lifestyle.curated[0]);handleDailyAction("life-rhythm",{preset:"week"})');
  assert.equal(run("state.rhythm.startFrom"), "", "already-decided meals keep the rhythm starting now");
});

test("persona: plain-language features, one per answered axis", () => {
  const P = require("../dinner-persona.js");
  const answers = P.questions.map((q) => ({ id: q.id, choice: q.leftScore < 0 ? "left" : "right" }));
  const r = P.result(answers);
  assert.equal(r.features.length, 3);
  assert.ok(r.features.every(([icon, text]) => icon && text.length <= 20));
  assert.ok(!/今夜|今日の気分/.test(JSON.stringify(P.characters)));
});

test("hidden starter recipes leave the list and the planner; bulk delete removes recipes and their records", () => {
  const run = app();
  run(`state.onboarded=true; state.recipes=[{...clone(Lifestyle.curated[0]),id:"own1",curated:undefined,mealType:"dinner"},{...clone(Lifestyle.curated[1]),id:"own2",curated:undefined,mealType:"dinner"}];
    state.evaluations=[{id:"e1",recipeId:"own1",cookedAt:today(),familyRepeatCycles:{}}];
    state.starterPref=normalizeStarterPref({hidden:["${L.curated[5].id}", 3, "${L.curated[5].id}"]});`);
  assert.equal(run("JSON.stringify(state.starterPref.hidden)"), JSON.stringify([L.curated[5].id]));
  assert.equal(run(`allDinnerRecipes().some((r)=>r.id==="${L.curated[5].id}")`), false);
  assert.equal(run(`starterRecipeList().some((r)=>r.id==="${L.curated[5].id}")`), false);
  run(`removeRecipes(["own1"])`);
  assert.equal(run("state.recipes.map((r)=>r.id).join()"), "own2");
  assert.equal(run("state.evaluations.length"), 0);
  assert.ok(run("!!state.tombstones.recipes.own1 && !!state.tombstones.evaluations.e1"));
});

test("the first-run funnel: part 1 is today, part 2 is what comes next, answers kept across a reload", () => {
  const run = app();
  run(`handleDailyAction("life-quick",{}); handleDailyAction("life-funnel-pick",{field:"pain",value:"tired"})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), 0, "pain moves on by itself, then how many people");
  run(`handleDailyAction("life-servings",{count:"4"})`);
  assert.equal(run("state.onboardingDraft.servings"), 4, "three or more people can be chosen");
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "eaters", "then who eats");
  run(`handleDailyAction("life-eater",{value:"partner"}); handleDailyAction("life-eater",{value:"kids"}); handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.onboardingDraft.eaters.join()"), "partner,kids");
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), 4, "then foods to avoid");
  run(`handleDailyAction("life-quick-next",{})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "equipment");
  run(`state.onboardingDraft.equipment = Lifestyle.equipmentDefaults(state.onboardingDraft.equipment); handleDailyAction("life-equipment-toggle",{name:"オーブン"}); handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.onboardingDraft.equipment.オーブン"), "have");
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "ratio", "then how the week's dinners split");
  run(`handleDailyAction("life-ratio",{part:"wd",kind:"out",delta:"1"}); handleDailyAction("life-ratio",{part:"we",kind:"deli",delta:"1"})`);
  assert.equal(run("JSON.stringify(partOf(state.onboardingDraft,'wd'))"), JSON.stringify({ self: 2, out: 2, take: 1, deli: 0 }), "weekdays stay 5: more eating out comes from cooking");
  assert.equal(run("JSON.stringify(partOf(state.onboardingDraft,'we'))"), JSON.stringify({ self: 0, out: 1, take: 0, deli: 1 }), "the weekend stays 2");
  assert.equal(run("JSON.stringify(ratioOf(state.onboardingDraft))"), JSON.stringify({ self: 2, out: 3, take: 1, deli: 1 }), "together, 7 nights");
  run(`handleDailyAction("life-quick-next",{}); handleDailyAction("life-staple",{value:"rice"}); handleDailyAction("life-staple",{value:"noodle"}); handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.onboardingDraft.staples.join()"), "rice,noodle");
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "chains");
  run(`["ichiran","ohsho","sukiya","mcd"].forEach((value) => handleDailyAction("life-chain",{value})); handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.onboardingDraft.chains.join()"), "ichiran,ohsho,sukiya", "three shops at most");
  run(`handleDailyAction("life-priority",{value:"fast"})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), 2, "the priority moves on by itself to skill");
  assert.equal(run("cookTypeOf(state.onboardingDraft).code"), "CKQ", "ramen, chinese and beef bowls, fast: 疾風のスパイスハンター");
  assert.match(run("renderCookTypeCard(cookTypeOf(state.onboardingDraft))"), /assets\/types\/CKQ\.webp/);
  assert.match(run("renderCookTypeCard(cookTypeOf(state.onboardingDraft))"), /cs-grade g-[SABCDEFG]/, "stats show S to G grades");
  assert.equal(run("chainTastes(state.onboardingDraft).join()"), "中華風,和風");
  assert.match(run("cookTypeOf(state.onboardingDraft).story"), /一蘭や餃子の王将など.*主食はごはんと麺類の二刀流.*「早さ」/, "a personal write-up from the answers");
  assert.equal(run("[combinedSkill(3, 4), combinedSkill(2, null), combinedSkill(null, 5)].join()"), "4,2,5", "photo and test together: the average, rounded up");
  run(`handleDailyAction("life-quick-next",{}); handleDailyAction("life-quick-skill",{level:"3"})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "type", "a picked skill shows the dinner type");
  run(`handleDailyAction("life-quick-next",{})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "videos");
  run(`handleDailyAction("life-funnel-pick",{field:"savedVideos",value:"few"})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "demo");
  run(`handleDailyAction("life-quick-next",{})`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "loss", "part 1 ends with what staying the same costs");
  assert.equal(run("nowCost(state.onboardingDraft).kg"), 76, "19kg a person a year");
  assert.equal(run("nowCost(state.onboardingDraft).hours"), 122, "20 minutes a dinner");
  run(`handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.onboardingDraft.quickSetupIndex"), run("FUNNEL_PART2"), "part 2 starts with the goal");
  run(`handleDailyAction("life-funnel-pick",{field:"goal",value:"save"}); handleDailyAction("life-quick-next",{})`);
  assert.equal(run("state.rhythm.preset"), "weekday", "the rhythm starts on weekdays");
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "remind");
  assert.equal(run("rhythmReminder().label"), "日曜 16:00", "decide the day before the weekday block, an hour before shopping");
  run(`handleDailyAction("life-quick-next",{}); handleDailyAction("life-minutes",{minutes:"45"})`);
  assert.equal(run("state.onboardingDraft.weekdayMinutes"), 45);
  run(`handleDailyAction("life-funnel-commit",{}); state = normalizeState(JSON.parse(JSON.stringify(state)))`);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "building");
  assert.match(run("buildingLines(state.onboardingDraft).join('|')"), /4人分に、分量をそろえています\|.*オーブンも使える料理.*★3までの.*平日45分以内/, "the building screen shows the answers being used");
  assert.equal(run("state.onboardingDraft.eaters.join()"), "partner,kids", "who eats survives a reload");
  assert.equal(run("state.onboardingDraft.ratio.wd.out + ':' + state.onboardingDraft.chains.length + ':' + state.onboardingDraft.priority"), "2:3:fast", "the diagnosis answers survive a reload");
  assert.equal(run("state.onboardingDraft.goal + state.onboardingDraft.pain + state.onboardingDraft.weekdayMinutes"), "savetired45");
  run(`handleDailyAction("life-finish",{})`);
  assert.equal(run("state.onboarded && state.view"), "plan");
  assert.equal(run("state.servingCount"), 4);
  assert.ok(run("state.foodProfile.tastes.includes('中華風')"), "the shops' tastes feed the plan");
});

test("the paywall: yearly by default, a free trial of the odd days plus two weeks from Monday, closing just closes", () => {
  const run = app();
  run(`state.onboarded = true; state.foodProfile = Lifestyle.profile({ servings: 2, completed: true, goal: "time" }); openPaywall()`);
  assert.equal(run("paywall.plan"), "year", "the yearly plan is chosen by default");
  assert.equal(run("JSON.stringify(trialPlan('2026-09-30'))"), JSON.stringify({ start: "2026-10-05", end: "2026-10-18", notify: "2026-10-16", charge: "2026-10-19" }), "Wednesday: the rest of the week, then Mon 10/5 for two weeks");
  assert.equal(run("trialPlan('2026-10-05').start"), "2026-10-05", "a Monday starts the two weeks that day");
  assert.match(run("renderPaywall()"), /まるごと2週間/);
  run(`handleDailyAction("life-pay-close",{})`);
  assert.equal(run("paywall"), null);
});

test("trend recipes: ranked by chosen dishes, saved when planned, removed after their 28 days", () => {
  const run = app();
  run(`state.onboarded = true; state.foodProfile = Lifestyle.profile({ servings: 2, completed: true });
    const item = (id, title, ing, days) => ({ videoId: id, title, videoUrl: "https://www.youtube.com/watch?v=" + id, expiresAt: new Date(Date.now() + days * 86400000).toISOString(), ingredients: ing.map((name) => ({ name, amount: "適量" })), steps: ["切る", "焼く"], planning: { minutes: 15, equipment: ["フライパン"], tastes: ["和風"] } });
    discover = { trends: [item("aaaaaaaaaaa", "豚こま焼き", ["豚こま", "玉ねぎ", "しょうゆ"], 10), item("bbbbbbbbbbb", "鮭のムニエル", ["鮭", "バター", "小麦粉"], 10), item("ccccccccccc", "古い人気", ["鶏肉", "塩", "油"], -1)], popular: [], savedAt: new Date().toISOString() };
    state.tasteSeeds = [Lifestyle.traits({ title: "鮭の塩焼き", ingredients: [{ name: "鮭" }] })];`);
  assert.equal(run("discoverRecipes().length"), 2, "expired trends are dropped");
  assert.equal(run("rankByTaste(discoverRecipes())[0].title"), "鮭のムニエル", "closest to the chosen dishes first");
  run(`confirmDaily({ date: today() }, discoverRecipes()[0])`);
  assert.equal(run("state.mealSlots[today()].recipe.discover"), undefined, "a planned trend becomes the user's own recipe");
  assert.equal(run("state.recipes.length"), 1);
  assert.equal(run("discoverRecipes().length"), 1, "and leaves the suggestions");
});

test("trend recipes are listed unless they contain avoided foods, even when time or checks would keep them out of the plan", () => {
  const run = app();
  run(`state.onboarded = true; state.foodProfile = Lifestyle.profile({ servings: 2, completed: true, restrictions: ["卵"], weekdayMinutes: 10 });
    const item = (id, title, ing) => ({ videoId: id, title, videoUrl: "https://www.youtube.com/watch?v=" + id, expiresAt: new Date(Date.now() + 86400000 * 5).toISOString(), ingredients: ing.map((name) => ({ name, amount: "適量" })), steps: ["切る", "焼く"], planning: { minutes: 30, equipment: ["フライパン"], tastes: ["和風"] } });
    discover = { trends: [item("aaaaaaaaaaa", "豚の生姜焼き", ["豚こま", "しょうが", "しょうゆ"]), item("bbbbbbbbbbb", "ふわとろ卵丼", ["卵", "ごはん", "だし"])], popular: [], savedAt: new Date().toISOString() };`);
  assert.equal(run("starterRecipeList().filter((r) => r.discover).map((r) => r.title).join()"), "豚の生姜焼き");
});

test("reason: meat two days running → fish, said in one line", () => {
  const meat = { id: "m", title: "豚のしょうが焼き", ingredients: [{ name: "豚こま" }] };
  const fish = { id: "f", title: "鮭のムニエル", ingredients: [{ name: "生鮭" }] };
  const tl = [{ date: addDays(start, -1), recipe: meat }, { date: addDays(start, -2), recipe: { ...meat, id: "m2", title: "鶏の照り焼き" } }];
  assert.equal(L.rotation(fish, start, tl, gap).reason, "肉続き → 魚");
  assert.equal(L.rotation(fish, start, tl.slice(0, 1), gap).reason, "昨日は肉 → 魚");
});

test("reason: season adds a small nudge and a short label", () => {
  const dish = { title: "さんまの塩焼き", ingredients: [{ name: "さんま" }] };
  assert.deepEqual(L.season(dish, "2026-10-01"), { score: 2, reason: "🍂 旬のさんま" });
  assert.equal(L.season(dish, "2026-05-01").reason, "");
  assert.equal(L.season({ ingredients: [{ name: "冷凍かぼちゃ" }] }, "2026-10-01").reason, "");
  assert.equal(L.season({ ingredients: [{ name: "片栗粉" }] }, "2026-10-01").reason, "");
});

test("insights: shows how many more ratings are needed, then per-person likes, staples and exclusions", () => {
  const R = {
    a: { id: "a", title: "ざるうどん", ingredients: [{ name: "うどん" }] },
    b: { id: "b", title: "焼きそば", ingredients: [{ name: "中華麺" }, { name: "豚こま" }] },
    c: { id: "c", title: "鮭の塩焼き", ingredients: [{ name: "生鮭" }] },
    d: { id: "d", title: "ゴーヤチャンプルー", ingredients: [{ name: "ゴーヤ" }] },
  };
  const ev = (recipeId, day, cycles) => ({ recipeId, cookedAt: `2026-09-${day}`, familyRepeatCycles: cycles });
  const family = ["パパ", "ママ"];
  const few = L.insights({ evaluations: [ev("a", "01", { パパ: "weekly", ママ: "monthly" })], recipeOf: (id) => R[id], family });
  assert.equal(few.left, 2);
  const evaluations = [
    ev("a", "01", { パパ: "weekly", ママ: "monthly" }),
    ev("b", "03", { パパ: "tomorrow", ママ: "twice_month" }),
    ev("c", "05", { パパ: "weekly", ママ: "weekly" }),
    ev("c", "12", { パパ: "weekly", ママ: "weekly" }),
    ev("d", "07", { パパ: "monthly", ママ: "never" }),
  ];
  const texts = L.insights({ evaluations, recipeOf: (id) => R[id], family }).items.map((x) => x.text);
  assert.deepEqual(texts, ["🍜 パパは麺が好き", "🏆 ふたりの定番：鮭の塩焼き", "🙅 1品は献立に出しません"]);
});

test("a dish the user decided on goes into that day even when it misses the conditions", () => {
  const long = { id: "mine-long", title: "じっくり煮込みカレー", mealType: "dinner", ingredients: [{ name: "牛肉" }], steps: ["煮込む"], planning: { minutes: 120, easy: false, equipment: ["鍋"], tasks: [], conditionsConfirmed: true, ingredientsVerified: true } };
  const recipes = [...L.curated, long];
  const profile = L.profile({ restrictions: ["牛肉"] });
  assert.equal(L.fit(long, profile, start).ok, false);
  const plan = L.propose({ recipes, profile, start, length: 3, addDays, overrides: { [addDays(start, 1)]: long.id } });
  const day = plan[1];
  assert.equal(day.candidate.recipe.id, long.id);
  assert.equal(day.candidate.forced, true);
  assert.equal(day.candidate.chosen, true);
  assert.equal(day.candidate.warn, "⚠ 避けたい食材あり");
  assert.ok(!plan.filter((d, i) => i !== 1).some((d) => d.candidate?.recipe.id === long.id));
});
