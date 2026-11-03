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

test("Supermarket aisle order, pantry shelf categories, and default expiration cycles", () => {
  // スーパーの動線順：青果→魚→肉→日配→卵・乳→主食→乾物・粉→調味料→最後に冷凍→その他
  assert.deepEqual(
    A.AISLES.map(([id]) => id),
    ["veg", "fish", "meat", "daily", "chilled", "staple", "dry", "seasoning", "frozen", "other"],
  );
  assert.equal(A.aisleOf("梅干し"), "daily");
  assert.equal(A.aisleOf("焼きそば用の中華麺"), "daily");
  assert.equal(A.aisleOf("切り干し大根"), "dry");
  assert.equal(A.aisleOf("はるさめ（乾燥）"), "dry");
  assert.equal(A.aisleOf("冷凍うどん"), "frozen");
  assert.equal(A.aisleOf("ミックスベジタブル（冷凍）"), "frozen");
  assert.equal(A.aisleOf("ぽん酢"), "seasoning");

  // 調味料売り場の棚順（基本液体→塩砂糖→油→たれソース→だし中華→チューブ香辛料）
  assert.ok(A.seasoningShelfOrder("しょうゆ") < A.seasoningShelfOrder("サラダ油"));
  assert.ok(A.seasoningShelfOrder("サラダ油") < A.seasoningShelfOrder("マヨネーズ"));
  assert.ok(A.seasoningShelfOrder("マヨネーズ") < A.seasoningShelfOrder("こしょう"));

  // 常備品のスーパー棚分類
  assert.equal(L.pantryCategoryOf("しょうゆ"), "調味料・油");
  assert.equal(L.pantryCategoryOf("ごま油"), "調味料・油");
  assert.equal(L.pantryCategoryOf("めんつゆ"), "つゆ・たれ・ソース");
  assert.equal(L.pantryCategoryOf("顆粒コンソメ"), "だし・中華・スパイス");
  assert.equal(L.pantryCategoryOf("薄力粉"), "粉・乾物・缶詰");
  assert.equal(L.pantryCategoryOf("食パン"), "米・パン・麺");
  assert.equal(L.pantryCategoryOf("バター"), "冷蔵・冷凍");

  // デフォルト賞味期限・買い替え目安
  assert.equal(L.defaultPantryCycle("牛乳"), 7);
  assert.equal(L.defaultPantryCycle("卵"), 14);
  assert.equal(L.defaultPantryCycle("米"), 30);
  assert.equal(L.defaultPantryCycle("サラダ油"), 60);
  assert.equal(L.defaultPantryCycle("しょうゆ"), 90);
  assert.equal(L.defaultPantryCycle("薄力粉"), 180);
  assert.equal(L.defaultPantryCycle("塩"), 365);

  // 水・冷水は買わないものに分類される
  assert.equal(L.isBought("飲用の冷水"), false);
});

test("DailyUI: unified .plan-dots tabs, 3-day default, combine next, and new plan reflection", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
  `);
  const blocks = JSON.parse(run("JSON.stringify(shopBlocks())"));
  assert.ok(blocks.current, "has current block");
  assert.ok(blocks.next, "has next block");

  const cDate = blocks.current.dates[0];
  const nDate = blocks.next.dates[0];
  run(`
    state.mealSlots["${cDate}"] = { date: "${cDate}", status: "confirmed", updatedAt: "2026-10-01T10:00:00Z", recipe: { id: "r1", title: "豚生姜焼き", mealType: "dinner", ingredients: [{ name: "豚肉", amount: "200g" }], steps: ["焼く"] } };
    state.mealSlots["${nDate}"] = { date: "${nDate}", status: "confirmed", updatedAt: "2026-10-01T10:05:00Z", recipe: { id: "r4", title: "カレー", mealType: "dinner", ingredients: [{ name: "牛肉", amount: "200g" }], steps: ["煮る"] } };
  `);

  // 次回が決まっていても、今回が買い物前なら「今回」がデフォルト
  assert.equal(run("shopBlockTabName()"), "current");
  let html = run("renderDailyShopping()");
  assert.match(html, /class="plan-dots shop-plan-dots"/, "uses exact same .plan-dots UI as plan screen");
  assert.match(html, /🛒 買い物前/, "clearly shows before-shopping state");
  assert.match(html, /豚肉/);
  assert.doesNotMatch(html, /牛肉/);

  // 次回分も合算して買う
  run("handleDailyAction('life-shop-combine', {})");
  assert.equal(run("shopCombineNext"), true);
  html = run("renderDailyShopping()");
  assert.match(html, /豚肉/);
  assert.match(html, /牛肉/);

  // 合算を解除し、「今回」だけを買い物完了にする → 「次回」は勝手に完了にならない！
  run("handleDailyAction('life-shop-combine', {})");
  run(`handleDailyAction('life-block-shopped', { key: "${blocks.current.key}" })`);
  assert.ok(run(`state.shopDone["${blocks.current.key}"]`), "current block marked shopped");
  assert.equal(run(`state.shopDone["${blocks.next.key}"]`), undefined, "next block stays unshopped");

  // 今回タブに切り替えると、「✓ 買い物済み」バッジと購入済みリスト（豚肉）が確認できる
  run(`handleDailyAction('life-shop-page', { page: "${blocks.current.key}" })`);
  const shoppedHtml = run("renderDailyShopping()");
  assert.match(shoppedHtml, /✓ 買い物済み/);
  assert.match(shoppedHtml, /購入済みリスト/);
  assert.match(shoppedHtml, /豚肉/);

  // 新しく「次回」を献立画面から決定（life-confirm）すると、次回タブの買い物前リストに即座に反映される
  run(`handleDailyAction('life-confirm', { block: "${blocks.next.key}" })`);
  assert.equal(run("state.view"), "shopping");
  assert.equal(run("activeShopBlock().key"), blocks.next.key);
  const nextHtml = run("renderDailyShopping()");
  assert.match(nextHtml, /🛒 買い物前/);
  assert.match(nextHtml, /牛肉/);
});

test("DailyUI: 1-row swipe structure, substitute/skip actions, and repeat memory", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.mealSlots = {
      "2026-10-01": { date: "2026-10-01", status: "confirmed", recipe: { id: "r1", title: "豚生姜焼き", mealType: "dinner", ingredients: [{ name: "みりん", amount: "大さじ1" }], steps: ["焼く"] } },
    };
  `);

  let html = run("renderDailyShopping()");
  // Gmail風の1行スワイプ構造（背面 swipe-bg ＋ 前面 swipe-front、曜日バッジあり、料理写真なし）
  assert.match(html, /swipe-row/);
  assert.match(html, /swipe-bg-left/);
  assert.match(html, /swipe-bg-right/);
  assert.match(html, /swipe-front/);
  assert.match(html, /use-day-badge/);
  assert.doesNotMatch(html, /shop-actions-drawer/);
  assert.doesNotMatch(html, /shop-dish-thumb/);

  // 代用アクション＆リピート記憶
  run("handleDailyAction('life-item-sub', { id: 'みりん' })");
  assert.equal(run("state.shoppingMarks['みりん'].status"), "sub");
  assert.equal(run("state.itemPrefs['みりん'].action"), "sub");

  html = run("renderDailyShopping()");
  assert.match(html, /sub-hint/);
  assert.match(html, /🔄 酒＋砂糖（3:1）/);

  // 次回登場時に1タップで前回の代用を適用できる
  run("delete state.shoppingMarks['みりん']");
  html = run("renderDailyShopping()");
  assert.match(html, /shop-pref-badge/);
  assert.match(html, /前回: 🔄/);
  run("handleDailyAction('life-apply-item-pref', { id: 'みりん' })");
  assert.equal(run("state.shoppingMarks['みりん'].status"), "sub");
});

test("DailyUI: slim 1-row pantry list, info tooltip, and default shelf-life notification", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.foodProfile = Lifestyle.profile({ completed: true, pantry: { "牛乳": "have", "しょうゆ": "have" } });
    // cycleDays 未設定でも、牛乳のデフォルト目安（7日）を超えると自動で買い替え通知が出る
    state.pantryMeta = {
      "牛乳": { lastBoughtAt: "2026-09-20" },
      "しょうゆ": { lastBoughtAt: "2026-09-25" },
    };
  `);

  assert.equal(run("pantryHasAlert()"), true, "default 7-day cycle triggers alert for 牛乳");

  run("handleDailyAction('life-pantry-open', {})");
  assert.equal(run("state.view"), "pantry");

  const html = run("renderPantryPage()");
  assert.match(html, /pantry-page/);
  assert.match(html, /class="tip"/, "long explanation is tucked inside ⓘ tooltip");
  assert.match(html, /pantry-swipe-row/, "uses compact 1-row swipeable items");
  assert.doesNotMatch(html, /✓ ある/, "no redundant 'ある' text badges");
  assert.doesNotMatch(html, />未確認</, "no redundant '未確認' text badges");
  assert.match(html, /🔔 買い替え時期/, "shows expiration/replacement alert for 牛乳");
  assert.match(html, /調味料・油/, "uses supermarket shelf tabs");

  // 1タップまたは右スワイプ相当で買い物リストへ追加
  run("handleDailyAction('life-pantry-to-shop', { name: '牛乳' })");
  assert.ok(run("Object.values(state.manualShopping || {}).some((m) => m.name === '牛乳' && !m.deleted)"));
});
