const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../lifestyle.js");
const A = require("../aisles.js");

function setupApp() {
  const t = new Date("2026-10-01T12:00:00+09:00").getTime();
  const D = class extends Date {
    constructor(...args) {
      if (args.length === 0) super(t);
      else super(...args);
    }
    static now() {
      return t;
    }
  };
  const ctx = vm.createContext({
    console,
    URL,
    Date: D,
    document: { querySelector: () => null, querySelectorAll: () => [] },
    window: {
      prompt: (msg, def) => def || "代用品",
    },
  });
  for (const f of [
    "dinner-persona.js",
    "taste.js",
    "taste-ui.js",
    "starter-recipes.js",
    "skills.js",
    "aisles.js",
    "lifestyle.js",
    "profile-talk.js",
    "talk-ui.js",
    "daily-ui.js",
    "playlist-import.js",
    "household.js",
    "skill-quiz.js",
    "cook-level.js",
    "weekly.js",
    "cook-type.js",
    "plan-moves.js",
    "plus.js",
    "cook-mode.js",
    "folders.js",
    "install.js",
    "push.js",
    "tickets.js",
    "account.js",
    "discover.js",
    "app.js",
  ]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}


const DAY = `
  state.rhythm = normalizeRhythm({ preset: "3day" });
  startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
  state.mealSlots = {
    "2026-10-01": { date: "2026-10-01", status: "confirmed", servings: 2, updatedAt: "2026-10-01T01:00:00.000Z", recipe: { id: "r1", title: "豚生姜焼き", sourceServings: 2, ingredients: [{ name: "みりん", amount: "大さじ1" }], steps: ["焼く"] } },
  };
`;

// review 2026-11-03 #4：「元に戻す」で、次の回のための代用・パスの記憶も戻す
test("undo of substitute/skip also reverts the remembered preference, and the clear survives sync", () => {
  const run = setupApp();
  run(DAY);
  run("handleDailyAction('life-item-skip', { id: 'みりん' })");
  assert.equal(run("state.itemPrefs['みりん'].action"), "skip");
  run("shopUndo.undo()");
  assert.equal(run("state.itemPrefs['みりん'].action"), "clear", "no memory before → a clear record");
  assert.doesNotMatch(run("renderDailyShopping()"), /前回: ⏭/);
  // clear は前回の記憶として使わない
  run("handleDailyAction('life-apply-item-pref', { id: 'みりん' })");
  assert.equal(run("state.shoppingMarks['みりん'].status"), "buy");
  // 相手の端末に古い「パス」が残っていても、新しい clear が勝つ（保存し直しても消えない）
  const merged = run(`JSON.stringify(normalizeItemPrefs(mergeSyncPayloads(buildSyncPayload(), { ...buildSyncPayload(), itemPrefs: { みりん: { action: "skip", updatedAt: "2026-09-30T00:00:00.000Z" } } }).itemPrefs))`);
  assert.equal(JSON.parse(merged)["みりん"].action, "clear");

  // 前に記憶があった時は、その記憶に戻す
  run("state.itemPrefs['みりん'] = { action: 'sub', subText: '砂糖', updatedAt: '2026-09-01T00:00:00.000Z' }; delete state.shoppingMarks['みりん']");
  run("handleDailyAction('life-item-skip', { id: 'みりん' })");
  run("shopUndo.undo()");
  assert.equal(run("state.itemPrefs['みりん'].action"), "sub");
  assert.equal(run("state.itemPrefs['みりん'].subText"), "砂糖");
});

// review 2026-11-03 #3：料理の画面の「代用・今回はなし」は、その日・その料理の買い物の印だけ
test("cook view shows substitute/skip badges only for the shopping trip of that date and recipe", () => {
  const run = setupApp();
  run(DAY);
  run("handleDailyAction('life-item-skip', { id: 'みりん' })");
  const ing = "[{ name: 'みりん', amount: '大さじ1' }]";
  assert.match(run(`CookMode.ingredientsHtml(${ing}, (x) => x.amount, '', { date: '2026-10-01', recipeId: 'r1' })`), /今回はなし/);
  // 次の回（別の日）に同じ料理を作る時は、前回のパスを出さない
  assert.doesNotMatch(run(`CookMode.ingredientsHtml(${ing}, (x) => x.amount, '', { date: '2026-10-08', recipeId: 'r1' })`), /今回はなし/);
  // 同じ日でも別の料理なら出さない・どの回か分からない時も出さない
  assert.doesNotMatch(run(`CookMode.ingredientsHtml(${ing}, (x) => x.amount, '', { date: '2026-10-01', recipeId: 'r2' })`), /今回はなし/);
  assert.doesNotMatch(run(`CookMode.ingredientsHtml(${ing}, (x) => x.amount)`), /今回はなし/);
});

// review 2026-11-03 #6：「買い物前に戻す」は、同期で相手の端末の完了が戻ってこない
test("undoing shopping done is kept after sync with a device that still has the old done record", () => {
  const run = setupApp();
  run(DAY);
  const key = run("(planPageBlocks ? planPageBlocks() : currentBlocks())[0].key");
  run(`state.shopDone = { [${JSON.stringify(key)}]: "2026-10-01T02:00:00.000Z" }; state.mealSlots["2026-10-01"].bought = "2026-10-01T02:00:00.000Z"`);
  const remote = run("JSON.stringify(buildSyncPayload())");
  run(`handleDailyAction('life-block-unshop', { key: ${JSON.stringify(key)} })`);
  assert.equal(run(`state.shopDone[${JSON.stringify(key)}]`), undefined);
  assert.ok(run(`state.shopUndone[${JSON.stringify(key)}]`));
  const merged = run(`JSON.stringify(mergeSyncPayloads(buildSyncPayload(), ${remote}))`);
  const m = JSON.parse(merged);
  assert.equal(m.shopDone[key], undefined, "the partner's old done record does not come back");
  assert.equal(m.mealSlots["2026-10-01"].bought, undefined, "the bought mark does not come back");
  // 戻した後にもう一度「買い物完了」を押したら、完了が勝つ
  const again = JSON.parse(run(`JSON.stringify(mergeShopDone({ [${JSON.stringify(key)}]: "2026-10-03T00:00:00.000Z" }, {}, {}, state.shopUndone))`));
  assert.equal(again.shopDone[key], "2026-10-03T00:00:00.000Z");
});
