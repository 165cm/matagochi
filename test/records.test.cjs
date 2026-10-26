const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// PR 6a（docs/PERSONALIZE_PLAN.md §10）：記録の画面に「作った回数・日付・人数・元の動画・もう一度、献立に入れる」、
// ふりかえりに「🏆 わが家の定番」。もう一度入れる時は、決めた日・本人が選んだ日を置き換えない。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T03:00:00Z") { // 木曜
  const ctx = vm.createContext({ console, URL, Date: fixedDate(now), document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};toasts=[];showToast=(m)=>toasts.push(m)");
  return run;
}
const J = (run, code) => JSON.parse(run(`JSON.stringify(${code})`));
const RECIPE = { id: "own-karaage", title: "唐揚げ", mealType: "dinner", sourceServings: 2, videoUrl: "https://www.youtube.com/watch?v=abc", author: "よはく食堂", ingredients: [{ name: "鶏もも肉", amount: "300g" }], steps: ["揚げる"], planning: { ingredientsVerified: true, minutes: 20, easy: true, tasks: [], noEquipment: true, conditionsConfirmed: true } };
const evalOf = (id, date, cycles = {}) => ({ id, recipeId: RECIPE.id, recipeTitle: RECIPE.title, cookedAt: date, mealType: "dinner", familyRepeatCycles: cycles, memo: "", photo: "", updatedAt: date + "T12:00:00Z" });
const setup = (run, evals) => run(`state.recipes.push(${JSON.stringify(RECIPE)}); state.evaluations = ${JSON.stringify(evals)};`);

test("PR 6a: the record screen shows how many times it was cooked (with dates), the servings that day, the source video and 'cook it again'", () => {
  const run = app();
  setup(run, [evalOf("meal-2026-09-28", "2026-09-28", { me: "weekly" }), evalOf("e2", "2026-09-14"), evalOf("e3", "2026-08-30")]);
  run(`state.mealSlots["2026-09-28"] = { date: "2026-09-28", status: "cooked", servings: 3, updatedAt: nowIso(), recipe: ${JSON.stringify(RECIPE)} };`);
  run(`openRecordEditor(state.evaluations[0])`);
  const html = run("renderRecordEditor()");
  assert.match(html, /🍳 3回つくった（9月28日・9月14日・8月30日）/);
  assert.match(html, /👥 この日は3人分/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=abc"[^>]*>▶ 元の動画（よはく食堂）/);
  assert.match(html, /data-action="life-replan"[^>]*data-recipe="own-karaage"|data-recipe="own-karaage"[^>]*data-action="life-replan"/);
  // 手でつけた記録（meal- 以外）は人数を推測しない。新しい記録を書いている途中は「もう一度」を出さない。
  run(`openRecordEditor(state.evaluations[1])`);
  assert.doesNotMatch(run("renderRecordEditor()"), /人分/);
  run(`openRecordEditor({ ...state.evaluations[1], isNew: true })`);
  assert.doesNotMatch(run("renderRecordEditor()"), /life-replan/);
  // 家族の画面を見ているだけの人には出さない
  run(`isViewer = () => true; openRecordEditor(state.evaluations[0])`);
  assert.doesNotMatch(run("renderRecordEditor()"), /life-replan/);
});

test("PR 6a: 'cook it again' fills the nearest undecided day as a draft and never replaces a decided day or another choice", () => {
  const run = app();
  setup(run, [evalOf("e1", "2026-09-20", { me: "monthly" })]); // 「月1」なので、献立の提案には自然には入らない
  assert.equal(J(run, "dailyPlan().some((d) => d.candidate?.recipe.id === 'own-karaage')"), false);
  run(`state.mealSlots["2026-10-01"] = { date: "2026-10-01", status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: { id: "x", title: "カレー", mealType: "dinner", ingredients: [] } };`);
  run(`state.planOverrides["2026-10-02"] = "someone-else";`);
  run(`handleDailyAction("life-replan", { recipe: "own-karaage" })`);
  assert.equal(J(run, "state.planOverrides['2026-10-03']"), "own-karaage");
  assert.equal(J(run, "state.planOverrides['2026-10-02']"), "someone-else");
  assert.equal(J(run, "state.mealSlots['2026-10-01'].recipe.id"), "x", "the confirmed day is untouched");
  assert.equal(J(run, "state.view"), "plan");
  assert.match(J(run, "toasts.at(-1)"), /10月3日（土）の献立に入れました（まだ決定前の下書き）/);
  assert.equal(J(run, "dailyPlan().find((d) => d.date === '2026-10-03').candidate.recipe.id"), "own-karaage");
  // 2回押しても、同じ料理をもう1日入れない
  run(`handleDailyAction("life-replan", { recipe: "own-karaage" })`);
  assert.equal(J(run, "Object.values(state.planOverrides).filter((x) => x === 'own-karaage').length"), 1);
  assert.match(J(run, "toasts.at(-1)"), /10月3日（土）の献立にもう入っています/);
  // 家族の画面を見ているだけの人は入れられない
  const v = app(); setup(v, []);
  v(`isViewer = () => true; handleDailyAction("life-replan", { recipe: "own-karaage" })`);
  assert.deepEqual(J(v, "state.planOverrides"), {});
});

test("PR 6a: 'cook it again' says so when no undecided day fits", () => {
  const run = app();
  setup(run, []);
  run(`for (let i = 0; i < 7; i++) { const d = addDays(today(), i); state.mealSlots[d] = { date: d, status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: { id: "x" + i, title: "料理" + i, mealType: "dinner", ingredients: [] } }; }`);
  run(`handleDailyAction("life-replan", { recipe: "own-karaage" })`);
  assert.deepEqual(J(run, "state.planOverrides"), {});
  assert.match(J(run, "toasts.at(-1)"), /入れられる日がありません/);
  assert.notEqual(J(run, "state.view"), "plan");
});

test("PR 6a: the staples list needs 2+ cooks and a latest 'again soon' rating", () => {
  const run = app();
  setup(run, [evalOf("e1", "2026-09-28", { me: "weekly" }), evalOf("e2", "2026-09-14", { me: "never" })]);
  run(`state.recipes.push({ id: "own-soup", title: "豚汁", mealType: "dinner", ingredients: [] }, { id: "own-once", title: "一回だけ", mealType: "dinner", ingredients: [] }, { id: "own-cooled", title: "飽きた", mealType: "dinner", ingredients: [] });
    state.evaluations.push(
      { id: "s1", recipeId: "own-soup", cookedAt: "2026-09-10", familyRepeatCycles: { me: "tomorrow" } },
      { id: "s2", recipeId: "own-soup", cookedAt: "2026-09-03", familyRepeatCycles: {} },
      { id: "s3", recipeId: "own-soup", cookedAt: "2026-08-20", familyRepeatCycles: {} },
      { id: "o1", recipeId: "own-once", cookedAt: "2026-09-25", familyRepeatCycles: { me: "weekly" } },
      { id: "c1", recipeId: "own-cooled", cookedAt: "2026-09-26", familyRepeatCycles: { me: "monthly" } },
      { id: "c2", recipeId: "own-cooled", cookedAt: "2026-09-01", familyRepeatCycles: { me: "weekly" } });`);
  const recipeOf = "(e) => recipeById(e.recipeId)";
  assert.deepEqual(J(run, `stapleRecipes(${recipeOf}).map((x) => [x.recipe.title, x.times, x.last])`), [["豚汁", 3, "2026-09-10"], ["唐揚げ", 2, "2026-09-28"]]);
  const html = run("renderReflection()");
  assert.match(html, /🏆 わが家の定番/);
  assert.match(html, /豚汁<\/b><small>3回・前回 9月10日/);
  assert.equal((html.match(/data-action="life-replan"/g) || []).length, 2);
  // 前の月を見ている時は出さない
  run("reflMonth = -1");
  assert.doesNotMatch(run("renderReflection()"), /わが家の定番/);
});

test("PR 6a: the done sheet's 'あとで' and the per-item 'あとで買う' are different actions", () => {
  const run = app();
  run(`state.mealSlots["2026-10-03"] = { date: "2026-10-03", status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: { id: "m", title: "もやし炒め", sourceServings: 2, ingredients: [{ name: "もやし", amount: "1袋" }] } };`);
  run(`handleDailyAction("life-shop-later", {})`);
  assert.equal(J(run, "Object.values(state.shoppingMarks).some((m) => m.status === 'later')"), false, "closing the sheet marks nothing");
  assert.equal(J(run, "shopDoneLater"), true);
  run("shopDoneLater = false");
  const id = run(`dailyShopping().find((i) => i.name === "もやし").id`);
  run(`handleDailyAction("life-item-later", { id: ${JSON.stringify(id)} })`);
  assert.equal(J(run, `dailyShopping().find((i) => i.name === "もやし").status`), "later");
  assert.equal(J(run, "shopDoneLater"), false, "the per-item button does not hide the done sheet");
});

test("review fix (#109): two saved copies of the same starter recipe count as the same dish for 'cook it again'", () => {
  const run = app();
  const copy = (id) => ({ ...RECIPE, id, starterId: "starter-karaage", videoUrl: "" });
  run(`state.recipes.push(${JSON.stringify(copy("copy-a"))}, ${JSON.stringify(copy("copy-b"))}); state.evaluations = [];`);
  run(`state.mealSlots[today()] = { date: today(), status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: state.recipes.find((r) => r.id === "copy-b") };`);
  run(`handleDailyAction("life-replan", { recipe: "copy-a" })`);
  assert.deepEqual(J(run, "state.planOverrides"), {}, "copy A is not added again");
  assert.match(J(run, "toasts.at(-1)"), /10月1日（木）の献立にもう入っています/);
  // 元のおすすめが別のもの（starterId が違う）なら、別の料理として入る
  const other = app();
  other(`state.recipes.push(${JSON.stringify(copy("copy-a"))}, ${JSON.stringify({ ...copy("copy-c"), starterId: "starter-other" })}); state.evaluations = [{ id: "m", recipeId: "copy-a", cookedAt: "2026-09-20", familyRepeatCycles: { me: "monthly" } }];`);
  other(`state.mealSlots[today()] = { date: today(), status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: state.recipes.find((r) => r.id === "copy-c") };`);
  other(`handleDailyAction("life-replan", { recipe: "copy-a" })`);
  assert.equal(J(other, "Object.values(state.planOverrides).includes('copy-a')"), true);
});

test("review fix (#109): one person's newer rating does not drop the other's 'weekly' from the staples", () => {
  const run = app();
  setup(run, [
    evalOf("e1", "2026-09-10", { A: "weekly", B: "monthly" }),
    evalOf("e2", "2026-09-20", { A: "weekly", B: "monthly" }),
    evalOf("e3", "2026-09-28", { B: "monthly" }), // A はまだ答えていない
  ]);
  assert.deepEqual(J(run, "stapleRecipes((e) => recipeById(e.recipeId)).map((x) => [x.recipe.title, x.times, x.last])"), [["唐揚げ", 3, "2026-09-28"]]);
  // A が新しい記録で「月1回」にしたら、定番から外れる
  run(`state.evaluations.push({ ...state.evaluations[0], id: "e4", cookedAt: "2026-09-29", familyRepeatCycles: { A: "monthly" }, updatedAt: "2026-09-29T12:00:00Z" })`);
  assert.deepEqual(J(run, "stapleRecipes((e) => recipeById(e.recipeId))"), []);
});

test("PR 6c: the records calendar shows the month (Sunday first), a photo on cooked days, '+1' for two dishes, and opens the record", () => {
  const run = app();
  setup(run, [evalOf("e1", "2026-10-01", {}), evalOf("e0", "2026-09-28", {})]);
  run(`state.evaluations.push({ id: "e2", recipeId: "starter-04", recipeTitle: "さば", cookedAt: "2026-10-01", familyRepeatCycles: {} });`);
  const html = run("renderReflection()");
  assert.match(html, /class="record-cal"/, "calendar is the default view");
  assert.equal((html.match(/cal-cell is-blank/g) || []).length, 4, "Oct 1 2026 is a Thursday → 4 blanks");
  assert.equal((html.match(/class="cal-cell[^"]*"/g) || []).length - 4, 31, "31 days");
  assert.match(html, /data-action="life-edit-record" data-id="e1" aria-label="10月1日 唐揚げ・さばと豆腐のみそ丼の記録を開く"/, "e1 has the newer update time");
  assert.match(html, /<b class="cal-more">\+1<\/b>/);
  assert.match(html, /cal-cell is-today/);
  assert.doesNotMatch(html, /data-id="e0"/, "only this month");
  // 写真の一覧に切り替え（覚えていなくても動く）
  run(`handleDailyAction("life-refl-view", { view: "grid" })`);
  const grid = run("renderReflection()");
  assert.doesNotMatch(grid, /record-cal/);
  assert.match(grid, /class="table-grid"/);
  assert.match(grid, /aria-pressed="true">🖼 写真/);
  // 前の月
  run(`handleDailyAction("life-refl-view", { view: "cal" }); reflMonth = -1;`);
  const prev = run("renderReflection()");
  assert.match(prev, /data-id="e0"/);
  assert.equal((prev.match(/cal-cell is-blank/g) || []).length, 2, "Sep 1 2026 is a Tuesday");
});

test("PR 6c: 'cook it again' is counted (meal_replanned) only when it actually adds a day", () => {
  const run = app();
  setup(run, [evalOf("e1", "2026-09-20", { me: "monthly" })]);
  run(`handleDailyAction("life-replan", { recipe: "own-karaage" })`);
  run(`handleDailyAction("life-replan", { recipe: "own-karaage" })`); // もう入っている
  assert.equal(J(run, "state.experienceEvents.filter((e) => e.name === 'meal_replanned').length"), 1);
  assert.equal(J(run, "usageSummary(today()).events.meal_replanned"), 1);
});

test("review fix (#113): on a day with two records the calendar shows and opens the newest one (saved first in the list)", () => {
  const run = app();
  run(`state.recipes.push(${JSON.stringify(RECIPE)});`);
  // ふつうの保存（新しい記録が先頭）：A を記録 → B を記録。更新日時は同じ（同じ分に記録）
  run(`state.evaluations = [];
    state.evaluations.unshift({ id: "a", recipeId: "own-karaage", cookedAt: "2026-10-01", familyRepeatCycles: {}, updatedAt: "2026-10-01T10:00:00Z" });
    state.evaluations.unshift({ id: "b", recipeId: "starter-04", cookedAt: "2026-10-01", familyRepeatCycles: {}, updatedAt: "2026-10-01T10:00:00Z" });`);
  let html = run("renderReflection()");
  assert.match(html, /data-id="b" aria-label="10月1日 さばと豆腐のみそ丼・唐揚げの記録を開く">[^]*?starter-04/);
  // 更新した日時が新しい方を開く（並びにかかわらず）
  run(`state.evaluations.find((e) => e.id === "a").updatedAt = "2026-10-01T12:00:00Z";`);
  html = run("renderReflection()");
  assert.match(html, /data-id="a" aria-label="10月1日 唐揚げ・さばと豆腐のみそ丼の記録を開く"/);
});

test("Proposal 10: post-cook quick repeat-cycle chips on Today card, next-day todo rate bar, and staple growth badges & candidates", () => {
  const run = app();
  run(`state.recipes.push(${JSON.stringify(RECIPE)});
       state.mealSlots[today()] = { date: today(), status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: ${JSON.stringify(RECIPE)} };
       dailyRecord(state.mealSlots[today()]);`);
  let todayHtml = run("renderToday()");
  assert.match(todayHtml, /class="tonight-quick-rate"/);
  assert.match(todayHtml, /🍽 次はいつ食べたい？/);
  const evalId = run("state.evaluations[0].id");
  const rater = run("raterNames()[0]");
  run(`handleDailyAction("life-rate", { id: ${JSON.stringify(evalId)}, member: ${JSON.stringify(rater)}, cycle: "weekly" })`);
  // 2人分なのでもう1人も答える
  const rater2 = run("raterNames()[1]");
  if (rater2) run(`handleDailyAction("life-rate", { id: ${JSON.stringify(evalId)}, member: ${JSON.stringify(rater2)}, cycle: "weekly" })`);
  todayHtml = run("renderToday()");
  assert.match(todayHtml, /あと1回作ると「🏆 わが家の定番」入り！/);
  // ふりかえり画面でも「🌱 もうすぐ定番」として見える
  let reflHtml = run("renderReflection()");
  assert.match(reflHtml, /もうすぐ定番/);
  assert.match(reflHtml, /1回（あと1回！）/);
  // 2回目を作って「毎週」をつけると「🏆 わが家の定番」に昇格トーストが出る
  run(`state.evaluations.unshift({ id: "meal-2026-09-20", recipeId: ${JSON.stringify(RECIPE.id)}, recipeTitle: ${JSON.stringify(RECIPE.title)}, cookedAt: "2026-09-20", mealType: "dinner", preferencePending: true, familyRepeatCycles: {}, updatedAt: "2026-09-20T12:00:00Z" });
       state.evaluations.find((e) => e.id === ${JSON.stringify(evalId)}).familyRepeatCycles = {};
       state.evaluations.find((e) => e.id === ${JSON.stringify(evalId)}).preferencePending = true;`);
  run(`handleDailyAction("life-rate", { id: ${JSON.stringify(evalId)}, member: ${JSON.stringify(rater)}, cycle: "weekly" })`);
  if (rater2) run(`handleDailyAction("life-rate", { id: ${JSON.stringify(evalId)}, member: ${JSON.stringify(rater2)}, cycle: "weekly" })`);
  assert.match(J(run, "toasts.at(-1)"), /わが家の定番に入りました/);
  reflHtml = run("renderReflection()");
  assert.match(reflHtml, /🏆 定番/);
});

test("Proposal 11: data protection status card in Settings, contextual backup reminder in Reflection & Today todos, and snooze / backup completion", () => {
  const run = app();
  setup(run, [
    evalOf("e1", "2026-09-10", { me: "weekly" }),
    evalOf("e2", "2026-09-20", { me: "weekly" }),
  ]);
  // 1 recipe + 2 evaluations = 3 items, no sync and no backup -> level is "local" and backupReminderDue() is true
  const st1 = J(run, "dataProtectionStatus()");
  assert.equal(st1.level, "local");
  assert.equal(J(run, "backupReminderDue()"), true);
  assert.match(run("renderSettings()"), /🛡 データの保護状態[\s\S]*🟠 この端末のみ/);
  assert.match(run("renderReflection()"), /🛡 バックアップのおすすめ（レシピ1品・記録2回）/);
  assert.match(run("renderTodayTodos()"), /is-backup-row[\s\S]*レシピ1品・記録2回<\/b>をバックアップして保護/);
  // バックアップ実施後は level が "safe" になり、催促は消える
  run("state.lastBackupAt = today()");
  const st2 = J(run, "dataProtectionStatus()");
  assert.equal(st2.level, "safe");
  assert.equal(J(run, "backupReminderDue()"), false);
  assert.match(run("renderSettings()"), /🛡 データの保護状態[\s\S]*🟢 保護ずみ/);
  assert.doesNotMatch(run("renderReflection()"), /バックアップのおすすめ/);
  assert.doesNotMatch(run("renderTodayTodos()"), /is-backup-row/);
});

test("Proposal 12: Lifestyle.planBalance and renderPlanBalance summarize main protein, vegetable kinds (including quick sides), and mood balance", () => {
  const L = require("../lifestyle.js");
  // All meat, 0 veg -> warns about meat bias and low veg
  const meatOnly = [
    { date: "2026-10-01", candidate: { recipe: { title: "鶏の唐揚げ", ingredients: [{ name: "鶏もも肉", amount: "250g" }] } } },
    { date: "2026-10-02", candidate: { recipe: { title: "豚の生姜焼き", ingredients: [{ name: "豚ロース", amount: "200g" }] } } },
    { date: "2026-10-03", candidate: { recipe: { title: "牛丼", ingredients: [{ name: "牛こま切れ肉", amount: "200g" }] } } },
  ];
  const b1 = L.planBalance(meatOnly);
  assert.equal(b1.proteinText, "🍖肉3");
  assert.equal(b1.vegCount, 0);
  assert.match(b1.vegLabel, /野菜少なめ/);
  assert.match(b1.moodNote, /お肉中心/);

  // Adding a fish dish and quick sides increases veg variety and switches to balanced note
  const balanced = [
    { date: "2026-10-01", slot: { recipe: { title: "鶏とキャベツの炒め物", ingredients: [{ name: "鶏もも肉" }, { name: "キャベツ" }, { name: "にんじん" }] }, side: "トマトスライス" } },
    { date: "2026-10-02", candidate: { recipe: { title: "鮭としめじのバター醤油", ingredients: [{ name: "鮭" }, { name: "しめじ" }, { name: "玉ねぎ" }] } } },
  ];
  const b2 = L.planBalance(balanced);
  assert.equal(b2.proteinText, "🍖肉1・🐟魚1");
  assert.equal(b2.vegCount, 5); // キャベツ, にんじん, トマト, きのこ, 玉ねぎ
  assert.match(b2.vegLabel, /🥬 野菜たっぷり5種/);
  assert.match(b2.moodNote, /肉・魚バランス◎/);

  // renderDailyPlan includes .plan-balance-bar
  const run = app();
  const planHtml = run("renderDailyPlan()");
  assert.match(planHtml, /class="plan-balance-bar"/);
  assert.match(planHtml, /aria-label="献立のバランス"/);
});

test("review: widening preserves manual recipe choices", () => {
  const run = app();
  run(`state.planOverrides['2026-10-03']='chosen'; handleDailyAction('life-widen',{key:'weekdayMinutes',value:'30'})`);
  assert.equal(run("state.planOverrides['2026-10-03']"), 'chosen');
});
test("review: staple celebration appears once even before all family ratings", () => {
  const run = app();
  setup(run, [evalOf('e1','2026-09-30'),evalOf('e2','2026-09-28')]);
  run(`state.family=['A','B'];raterNames=()=>['A','B'];handleDailyAction('life-rate',{id:'e1',member:'A',cycle:'weekly'})`);
  assert.equal(J(run,'toasts.filter(x=>x.includes("定番に入りました")).length'),1);
  run(`handleDailyAction('life-rate',{id:'e1',member:'B',cycle:'weekly'})`);
  assert.equal(J(run,'toasts.filter(x=>x.includes("定番に入りました")).length'),1);
});
test("review: balance counts distinct vegetables, normalizing only aliases", () => {
  const L=require('../lifestyle.js');
  const days = names => names.map(name=>({candidate:{recipe:{title:'野菜料理',ingredients:[{name}]}}}));
  const b=L.planBalance(days(['アスパラ','オクラ','ズッキーニ','とうもろこし','ゴーヤ','コーン']));
  assert.equal(b.vegCount,5);
  assert.equal(L.planBalance(days(['豆苗','もやし','レタス','水菜','ピーマン','パプリカ','しめじ','えのき'])).vegCount,8);
  assert.match(L.planBalance(days(['玉ねぎ','人参'])).vegLabel,/野菜少なめ/);
  assert.doesNotMatch(L.planBalance(days(['玉ねぎ','人参','レタス','水菜'])).vegLabel,/たっぷり/);
});

test('recipe images retry the same video on the alternate host and retain saved URLs', () => {
 const run=app();
 const r={...RECIPE, videoUrl:'https://www.youtube.com/watch?v=h0eufSnYIl4',thumbnailUrl:'https://i.ytimg.com/vi/h0eufSnYIl4/hqdefault.jpg'};
 assert.deepEqual(J(run,`recipeImageSources(${JSON.stringify(r)})`),[r.thumbnailUrl,'https://img.youtube.com/vi/h0eufSnYIl4/hqdefault.jpg']);
 const html=run(`dishTile(${JSON.stringify(r)})`);
 assert.match(html,/recoverRecipeImage/);assert.doesNotMatch(html,/visibility/);assert.match(html,/referrerpolicy="no-referrer"/);
 const expired={...r,thumbnailUrl:'https://example.com/expired.jpg'};
 assert.equal(J(run,`recipeImageSources(${JSON.stringify(expired)})`).length,3);
 assert.deepEqual(J(run,`recipeImageSources({id:'manual',thumbnailUrl:'https://example.com/expired.jpg'})`),['https://example.com/expired.jpg']);
});

test('failed image retries are finite and end in a labelled fallback without deleting the video link', () => {
 const run=app();
 run(`document.createElement = () => ({style:{},setAttribute(k,v){this[k]=v},append(x){this.label=x}});
 var replacement=null;var img={dataset:{imageSources:JSON.stringify(['https://img.youtube.com/vi/h0eufSnYIl4/hqdefault.jpg']),imageFallback:'assets/dishes/fallback-rice.webp'},className:'dish-tile hero',replaceWith(x){replacement=x}};
 recoverRecipeImage(img);`);
 assert.equal(run('img.src'),'https://img.youtube.com/vi/h0eufSnYIl4/hqdefault.jpg');assert.equal(run('replacement'),null);
 run('recoverRecipeImage(img)');
 assert.equal(run('replacement.label.textContent'),'イメージ');assert.equal(run('img.onerror'),null);
 assert.match(run('replacement.className'),/dish-tile hero/);assert.match(run('replacement["aria-label"]'),/写真を表示できない/);
});
