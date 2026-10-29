// 管理者・編集者・閲覧者で見えるもの（2026-10-29 のユーザーの判断：役割ごとに整理）。
// 🙋（お願い）は献立を変えられない閲覧者だけ。献立を変えられる人は「🗓 献立に入れる」で直接入れる。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");

// role：この端末の人（パパ）の役割。ママは管理者。sync：家族と共有しているか。
function app({ role = "viewer", sync = true } = {}) {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run(`state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};loadDiscover=()=>{};
    state.foodProfile=Lifestyle.profile({servings:2,completed:true});state.family=["ママ","パパ"];
    state.roles={members:{"ママ":"owner","パパ":${JSON.stringify(role === "owner" ? "editor" : role)}},updatedAt:nowIso()};
    state.me=${JSON.stringify(role === "owner" ? "ママ" : "パパ")};
    ${sync ? 'state.sync.roomId="room-1";syncEnabled=()=>true;' : ""}
    saveOwnRecipe(Lifestyle.curated[0]);state.view="collection";`);
  return run;
}
const hasAsk = (run) => {
  const list = run("renderCollection()");
  run("handleDailyAction('life-recipe-tab',{tab:'saved'})");
  const mine = run("renderCollection()");
  run("recipeDetailId=Lifestyle.curated[5].id");
  return [list, mine, run("renderRecipeDetail()")].some((h) => h.includes("🙋 食べたい"));
};

test("🙋 食べたい is only for the viewer (someone who cannot change the plan)", () => {
  assert.equal(hasAsk(app({ role: "viewer" })), true);
  assert.equal(hasAsk(app({ role: "owner" })), false, "管理者");
  assert.equal(hasAsk(app({ role: "editor" })), false, "編集者");
  assert.equal(hasAsk(app({ role: "editor", sync: false })), false, "family names on one phone, not shared");
  const owner = app({ role: "owner" });
  owner("recipeDetailId=Lifestyle.curated[5].id");
  assert.ok(owner("renderRecipeDetail()").includes("🗓 献立に入れる"), "they put it in the plan directly");
});

test("the request window card shows only when there is a viewer to send requests, with the viewer's name", () => {
  const withViewer = app({ role: "owner" });
  withViewer("state.roles.members['パパ']='viewer'");
  const card = withViewer("renderRoundCard()");
  assert.ok(card.includes("リクエストを受け付ける") && card.includes("パパがそれまでに"));
  assert.equal(app({ role: "owner" })("renderRoundCard()"), "", "the other person is an editor");
  assert.equal(app({ role: "editor" })("renderRoundCard()"), "", "an editor next to the owner: nobody sends requests");
  assert.equal(app({ role: "viewer" })("renderRoundCard()"), "");
});

test("the viewer's recipe tab says only what a viewer can do", () => {
  const run = app({ role: "viewer" });
  const list = run("renderCollection()");
  assert.ok(list.includes("食べたいのは🙋で送ろう") && !list.includes("保存したレシピもリクエストになる"));
  assert.ok(!list.includes("🤍"), "no save");
  run("handleDailyAction('life-recipe-tab',{tab:'saved'})");
  const mine = run("renderCollection()");
  assert.ok(!mine.includes("定番を作る") && !mine.includes('data-action="life-select"'));
});

test("shared: the tab is わが家のレシピ; alone: わたしのレシピ", () => {
  assert.ok(app({ role: "owner" })("renderCollection()").includes("わが家のレシピ"));
  const alone = app({ role: "owner", sync: false });
  assert.ok(alone("renderCollection()").includes("わたしのレシピ") && !alone("renderCollection()").includes("わが家のレシピ"));
});
