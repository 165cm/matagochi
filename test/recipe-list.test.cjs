// レシピタブの整理（2026-10-28 のユーザーの判断：案①②⑤）：タブ2つ・気分のボタン1行・好きな料理から・保存の説明は ＋ の画面へ。
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
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};loadDiscover=()=>{};state.foodProfile=Lifestyle.profile({servings:2,completed:true});state.view='collection';");
  return run;
}
// 新着をまねる：定番の料理に料理名（dish）をつけて n 品。
const seed = (run, n = 30, dishes = ["麻婆豆腐", "肉じゃが", "", ""]) => run(`discover.trends = Array.from({ length: ${n} }, (_, i) => { const r = Lifestyle.curated[i % Lifestyle.curated.length]; const d = ${JSON.stringify(dishes)}[i % ${dishes.length}]; return { videoId: "v" + i, title: (d ? d + i : r.title + i), ingredients: r.ingredients, steps: r.steps, videoUrl: "https://youtu.be/v" + i, thumbnailUrl: "", channelTitle: "テスト", ...(d ? { dish: { name: d } } : {}), planning: r.planning, tags: [] }; }); discover.savedAt = new Date().toISOString();`);

test("two tabs only; the list starts with search, one row of mood buttons and the dishes", () => {
  const run = app();
  seed(run);
  const html = run("renderCollection()");
  const tabs = html.match(/data-action="life-recipe-tab" data-tab="(\w+)"/g).map((x) => x.match(/data-tab="(\w+)"/)[1]);
  assert.deepEqual([...new Set(tabs)], ["starter", "saved"]);
  assert.ok(html.includes("料理名・材料・投稿者で探す"));
  assert.ok(!html.includes("save-guide") && !html.includes("paste-recipe-url"), "no save instructions on top");
  assert.ok(!html.includes('class="facets"'), "the full filter list is folded");
  assert.ok(html.includes("⏱ 10分以内") && html.includes("もっと ▾"));
  assert.ok(!html.includes("discover-badge"), "tiles stay light");
  run("handleDailyAction('life-facets-toggle',{})");
  assert.ok(run("renderCollection()").includes('class="facets"'), "もっと opens the full list");
});

test("a mood button filters the dishes (tap again to clear)", () => {
  const run = app();
  run("handleDailyAction('life-quick-filter',{value:'fish'})");
  const ids = JSON.parse(run(`JSON.stringify([...renderCollection().matchAll(/data-action="life-recipe-open" data-recipe="([^"]+)"/g)].map((m) => m[1]))`));
  assert.ok(ids.length > 0);
  assert.ok(run(`${JSON.stringify([...new Set(ids)])}.every((id) => recipeTags(detailRecipeById(id)).includes("fish"))`.replace("detailRecipeById(id)", "(findDiscover(id) || Lifestyle.curated.find((r) => r.id === id))")));
  run("handleDailyAction('life-quick-filter',{value:'fish'})");
  assert.equal(run("quickFilter"), "");
});

test("💛 好きな料理から: the dishes picked from the 12 photos, with how many ways to make each; tapping searches that dish", () => {
  const run = app();
  seed(run);
  assert.ok(!run("renderCollection()").includes("好きな料理から"), "nothing before picking");
  run("state.foodProfile = Lifestyle.profile({ servings: 2, completed: true, dishPicks: ['mabo', 'omurice'], dishPicksAt: '2026-10-28T00:00:00Z' })");
  const html = run("renderCollection()");
  assert.ok(html.includes("💛 好きな料理から") && html.includes("あなたに合いそうな順"));
  assert.match(html, /data-dish="麻婆豆腐"><img[^>]*><b>麻婆豆腐<\/b><small>作り方 8つ<\/small>/);
  assert.ok(!html.includes("<b>オムライス</b>"), "a picked dish with no recipes yet is not shown");
  run("handleDailyAction('life-dish-variants',{dish:'麻婆豆腐'})");
  assert.equal(run("state.searchText"), "麻婆豆腐");
  // 合いそうな順：選んだ料理名の作り方が先
  run("state.searchText=''");
  const first = run(`renderCollection().match(/data-action="life-recipe-open" data-recipe="([^"]+)"/)[1]`);
  assert.equal(run(`findDiscover(${JSON.stringify(first)}).dish`), "麻婆豆腐");
});

test("the list is not cut at 6: 40 at a time, then 続きを見る", () => {
  const run = app();
  seed(run, 120, [""]);
  const count = () => new Set([...run("renderCollection()").matchAll(/data-action="life-recipe-open" data-recipe="([^"]+)"/g)].map((m) => m[1])).size;
  assert.equal(count(), 40);
  assert.ok(run("renderCollection()").includes("続きを見る"));
  run("handleDailyAction('life-starter-more',{})");
  assert.equal(count(), 80);
});

test("わたしのレシピ: saved dishes with how often they were cooked; select lives only here", () => {
  const run = app();
  run("saveOwnRecipe(Lifestyle.curated[0]); saveOwnRecipe(Lifestyle.curated[1])");
  const id = run("state.recipes[0].id");
  run(`state.evaluations.push({ id: "e1", recipeId: ${JSON.stringify(id)}, recipeTitle: "x", cookedAt: "2026-10-20", mealType: "dinner" })`);
  assert.ok(!run("renderCollection()").includes('data-action="life-select"'), "no select on おすすめ");
  run("handleDailyAction('life-recipe-tab',{tab:'saved'})");
  const html = run("renderCollection()");
  assert.ok(html.includes("📁 わが家の定番") && html.includes("保存したレシピ"));
  assert.ok(html.includes("✓ 1回作った") && html.includes("まだ作っていない"));
  assert.ok(html.includes('data-action="life-select"'));
  assert.ok(html.includes("献立に出やすくなります"));
  run("handleDailyAction('life-recipe-tab',{tab:'folders'})");
  assert.ok(run("renderCollection()").includes("‹ わたしのレシピ"), "folders open from わたしのレシピ");
});

test("with the starter dishes hidden, the list opens on わたしのレシピ", () => {
  const run = app();
  run("handleDailyAction('life-starters',{show:'false'}); recipeTab = 'starter'");
  const html = run("renderCollection()");
  assert.equal(run("recipeTab"), "saved");
  assert.ok(!html.includes('data-tab="starter"'));
});
