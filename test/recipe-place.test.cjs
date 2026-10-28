// レシピの画面の「🗓 献立に入れる」（2026-10-28 のユーザーの判断：見つけた料理を献立につなげる）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};state.foodProfile=Lifestyle.profile({servings:2,completed:true});");
  return run;
}
// 献立に入っていない、条件に合うおすすめを1つ。
const pickRecipe = (run) => run(`(() => { const used = new Set(dailyPlan().map((d) => (d.slot?.recipe || d.candidate?.recipe)?.id)); return Lifestyle.curated.find((r) => !used.has(r.id) && placeDays().every((d) => Lifestyle.fit(r, dailyProfile(), d.date).ok)).id; })()`);
const shown = (run, date) => run(`(() => { const d = dailyPlan().find((x) => x.date === "${date}"); return (d.slot?.recipe || d.candidate?.recipe)?.id || ""; })()`);

test("the recipe screen leads with 🗓 献立に入れる; video, folders, record, edit and delete move into ⋯", () => {
  const run = app();
  run('handleDailyAction("life-recipe-open",{recipe:"starter-03"})');
  let html = run("renderRecipeDetail()");
  assert.ok(html.includes("🗓 献立に入れる") && html.includes("🤍 保存"));
  assert.ok(html.indexOf("🗓 献立に入れる") < html.indexOf("材料 <small>"), "above the ingredients");
  run('handleDailyAction("life-save-starter",{recipe:"starter-03"})');
  html = run("renderRecipeDetail()");
  const menu = html.slice(html.indexOf('class="plan-more detail-more"'), html.indexOf("</details>", html.indexOf('class="plan-more detail-more"')));
  assert.ok(menu.includes("編集する") && menu.includes("このレシピを削除") && menu.includes("作った記録をつける"), "in the ⋯ menu");
  assert.ok(!html.includes("🤍 保存"), "already saved");
  // 家族の画面を見ているだけの人：献立に入れるはない（リクエストのまま）
  run("isViewer = () => true");
  assert.ok(!run("renderRecipeDetail()").includes("🗓 献立に入れる"));
});

test("placing on an undecided day puts the dish there; the sheet shows what is planned now", () => {
  const run = app();
  const id = pickRecipe(run);
  const date = run("placeDays().find((d) => d.slot?.status !== 'confirmed').date");
  run(`handleDailyAction("life-recipe-open",{recipe:${JSON.stringify(id)}}); handleDailyAction("life-place-open",{recipe:${JSON.stringify(id)}})`);
  const html = run("renderRecipeDetail()");
  assert.ok(html.includes("を、いつ？") && html.includes("いまの予定："));
  assert.ok(html.includes(`data-action="life-place" data-recipe="${id}" data-date="${date}"`));
  run(`handleDailyAction("life-place",{recipe:${JSON.stringify(id)},date:"${date}"})`);
  assert.equal(shown(run, date), id);
  assert.equal(run("placeRecipeId"), "", "the sheet closes");
  assert.ok(run(`renderRecipeDetail()`).includes("🗓 献立に入れる"));
  run(`handleDailyAction("life-place-open",{recipe:${JSON.stringify(id)}})`);
  assert.ok(run("renderRecipeDetail()").includes("この料理です"), "the day already has it");
});

test("placing on a decided day replaces the decided dish", () => {
  const run = app();
  const date = run("placeDays()[0].date");
  run(`confirmDaily({date:"${date}"}, dailyPlan().find((d) => d.date === "${date}").candidate.recipe)`);
  const id = pickRecipe(run);
  run(`handleDailyAction("life-recipe-open",{recipe:${JSON.stringify(id)}}); handleDailyAction("life-place",{recipe:${JSON.stringify(id)},date:"${date}"})`);
  assert.equal(run(`state.mealSlots["${date}"].status`), "confirmed");
  assert.equal(run(`state.mealSlots["${date}"].recipe.id`), id);
});

test("with the starter dishes hidden, a starter is saved first and then placed", () => {
  const run = app();
  const id = pickRecipe(run);
  const date = run("placeDays()[0].date");
  run(`handleDailyAction("life-recipe-open",{recipe:${JSON.stringify(id)}}); handleDailyAction("life-starters",{show:"false"})`);
  run(`handleDailyAction("life-place",{recipe:${JSON.stringify(id)},date:"${date}"})`);
  const own = run(`state.recipes.find((r) => r.starterId === ${JSON.stringify(id)})?.id || ""`);
  assert.ok(own, "saved as the person's recipe");
  assert.equal(shown(run, date), own);
  assert.equal(run("detailRecipe().id"), own, "the screen follows the saved copy");
});

test("a day the dish does not fit (e.g. too long for the weekday time) cannot be chosen", () => {
  const run = app();
  run("state.foodProfile = Lifestyle.profile({ servings: 2, completed: true, weekdayMinutes: 5, weekendMinutes: 10 })");
  const id = run("Lifestyle.curated.find((r) => (r.planning?.minutes || 0) > 10).id");
  const date = run("placeDays()[0]?.date || ''");
  if (!date) return;
  run(`handleDailyAction("life-recipe-open",{recipe:${JSON.stringify(id)}}); handleDailyAction("life-place-open",{recipe:${JSON.stringify(id)}})`);
  const html = run("renderRecipeDetail()");
  assert.ok(!html.includes(`data-action="life-place" data-recipe="${id}" data-date="${date}"`));
  assert.ok(html.includes("place-day is-off"));
  const before = shown(run, date);
  run(`handleDailyAction("life-place",{recipe:${JSON.stringify(id)},date:"${date}"})`);
  assert.equal(shown(run, date), before, "nothing changes");
});
