// 2026-11-20：献立に決めていたのに作れなかった日を申告する。材料を買ってあった時は「別の日に作る／残っている／もう使った」。
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"), fs = require("node:fs"), path = require("node:path");

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "table-review.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=(m)=>{globalThis.toast=m};state.foodProfile=Lifestyle.profile({servings:2,completed:true})");
  return run;
}
const R = { id: "m1", title: "鮭のムニエル", ingredients: [{ name: "生鮭", amount: "2切れ" }, { name: "薄力粉", amount: "大さじ1" }, { name: "キャベツ", amount: "1/4個" }], steps: ["焼く"] };
function setup(run, { bought }) {
  run(`globalThis.y = addDays(today(), -1); state.mealSlots[y] = { date: y, recipe: ${JSON.stringify(R)}, status: "confirmed", updatedAt: addDays(today(), -3) + "T09:00:00Z" }`);
  if (bought) run(`state.shopDone = { a: addDays(today(), -2) + "T10:00:00Z" }`);
}

test("yesterday's planned dish shows 作れなかった next to 作った; when nothing was bought the choices are 'make it another day' or 'not at all'", () => {
  const run = app();
  setup(run, { bought: false });
  assert.match(run("renderTodayTodos()"), /data-action="life-missed-open"/);
  run("handleDailyAction('life-missed-open', { date: y })");
  const html = run("renderTodayTodos()");
  assert.match(html, /miss-panel/);
  assert.match(html, /data-how="move"/);
  assert.doesNotMatch(html, /data-how="left"/, "nothing bought: no leftover choice");
  assert.doesNotMatch(html, /材料は買ってあります/);
  run("handleDailyAction('life-missed', { date: y, how: 'gone' })");
  assert.equal(run("state.mealSlots[y].status"), "off");
  assert.equal(run("state.mealSlots[y].kind"), "missed");
  assert.doesNotMatch(run("renderTodayTodos()"), /鮭のムニエル/, "the question goes away");
});

test("bought: 'make it another day' moves the dish to today or later (never to a past day) and keeps the bought mark", () => {
  const run = app();
  setup(run, { bought: true });
  run("handleDailyAction('life-missed-open', { date: y })");
  assert.match(run("renderTodayTodos()"), /材料は買ってありますね/);
  run("handleDailyAction('life-missed', { date: y, how: 'move' })");
  const moved = JSON.parse(run("JSON.stringify(Object.values(state.mealSlots).find((s) => s.status === 'confirmed' && s.recipe?.id === 'm1'))"));
  assert.ok(moved.date >= run("today()"), moved.date);
  assert.equal(moved.movedFrom, run("y"));
  assert.ok(moved.bought, "still counted as bought (not back on the shopping list)");
  assert.equal(run("state.mealSlots[y].kind"), "missed");
});

test("bought: 'not making it, the food is still here' puts the ingredients into the leftovers (pantry staples left out)", () => {
  const run = app();
  setup(run, { bought: true });
  run("handleDailyAction('life-missed-open', { date: y })");
  assert.match(run("renderTodayTodos()"), /data-how="left"/);
  run("handleDailyAction('life-missed', { date: y, how: 'left' })");
  const left = JSON.parse(run("JSON.stringify(activeLeftovers())"));
  assert.ok(left.length >= 1, JSON.stringify(left));
  assert.ok(left.some((n) => /鮭/.test(n)) && left.some((n) => /キャベツ/.test(n)), JSON.stringify(left));
  assert.ok(!left.some((n) => /薄力粉/.test(n)), "flour (a pantry staple) is not a leftover");
  assert.ok(!Object.values(JSON.parse(run("JSON.stringify(state.mealSlots)"))).some((s) => s.status === "confirmed" && s.recipe?.id === "m1"), "not moved");
  assert.match(run("globalThis.toast"), /残っている食材/);
});

test("someone only viewing the family's plan does not see 作れなかった", () => {
  const run = app();
  setup(run, { bought: false });
  run("isViewer = () => true");
  assert.doesNotMatch(run("renderTodayTodos()"), /life-missed-open/);
});
