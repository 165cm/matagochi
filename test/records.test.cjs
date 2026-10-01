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
  assert.match(html, /data-action="life-edit-record" data-id="e2" aria-label="10月1日 唐揚げ・さばと豆腐のみそ丼の記録を開く"/);
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
