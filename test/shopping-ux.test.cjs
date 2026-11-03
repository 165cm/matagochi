const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../lifestyle.js");

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

test("Lifestyle substitution hints and category helpers", () => {
  assert.ok(L.SUBSTITUTE_HINTS["みりん"]);
  assert.match(L.substituteHint("みりん"), /酒/);
  assert.equal(L.substituteHint("未知の食材123"), "");

  assert.equal(L.pantryCategoryOf("醤油"), "基本の調味料");
  assert.equal(L.pantryCategoryOf("薄力粉"), "常備する主食など");
  assert.equal(L.pantryCategoryOf("ごま油"), "油・乳製品");
  assert.equal(L.pantryCategoryOf("珍しいスパイス"), "香辛料");
});

test("DailyUI: shopBlocks and tripSlots block tabs", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.mealSlots = {
      "2026-10-01": { date: "2026-10-01", status: "confirmed", recipe: { id: "r1", title: "豚生姜焼き", mealType: "dinner", ingredients: [{ name: "豚肉", amount: "200g" }], steps: ["焼く"] } },
      "2026-10-02": { date: "2026-10-02", status: "confirmed", recipe: { id: "r2", title: "鮭塩焼き", mealType: "dinner", ingredients: [{ name: "鮭", amount: "2切れ" }], steps: ["焼く"] } },
      "2026-10-03": { date: "2026-10-03", status: "confirmed", recipe: { id: "r3", title: "親子丼", mealType: "dinner", ingredients: [{ name: "鶏肉", amount: "200g" }], steps: ["煮る"] } },
      "2026-10-04": { date: "2026-10-04", status: "confirmed", recipe: { id: "r4", title: "カレー", mealType: "dinner", ingredients: [{ name: "牛肉", amount: "200g" }], steps: ["煮る"] } },
      "2026-10-05": { date: "2026-10-05", status: "confirmed", recipe: { id: "r5", title: "シチュー", mealType: "dinner", ingredients: [{ name: "じゃがいも", amount: "2個" }], steps: ["煮る"] } },
      "2026-10-06": { date: "2026-10-06", status: "confirmed", recipe: { id: "r6", title: "麻婆豆腐", mealType: "dinner", ingredients: [{ name: "豆腐", amount: "1丁" }], steps: ["炒める"] } },
    };
  `);

  const blocks = run("shopBlocks()");
  assert.ok(blocks, "blocks is defined");
  assert.ok(blocks.current, "has current block");

  // Default tab is 'current'
  assert.equal(run("shopBlockTab"), "current");
  let currentSlots = run("tripSlots()");
  assert.ok(currentSlots["2026-10-01"]);
  assert.ok(currentSlots["2026-10-02"]);

  // Combine next block
  run("handleDailyAction('life-shop-combine')");
  assert.equal(run("shopCombineNext"), true);
  let combinedSlots = run("tripSlots()");
  assert.ok(combinedSlots["2026-10-01"]);
  if (blocks.next) {
    assert.ok(combinedSlots[blocks.next.start], "next block is included when combined");
  }

  // Uncombine
  run("handleDailyAction('life-shop-combine')");
  assert.equal(run("shopCombineNext"), false);

  // Switch tab
  if (blocks.next) {
    run("handleDailyAction('life-shop-tab', { tab: 'next' })");
    assert.equal(run("shopBlockTab"), "next");
    let nextSlots = run("tripSlots()");
    assert.equal(nextSlots["2026-10-01"], undefined);
    assert.ok(nextSlots[blocks.next.start]);
  }
});

test("DailyUI: renderDailyShopping tabs and use-day badge (no dish photo)", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.mealSlots = {
      "2026-10-01": { date: "2026-10-01", status: "confirmed", recipe: { id: "r1", title: "豚生姜焼き", mealType: "dinner", ingredients: [{ name: "豚肉", amount: "200g" }], steps: ["焼く"] } },
    };
  `);

  const html = run("renderDailyShopping()");
  // Contains tabs
  assert.match(html, /shop-tabs/);
  assert.match(html, /data-tab="current"/);
  // Contains combine button
  assert.match(html, /shop-combine-btn/);
  // Contains pantry button
  assert.match(html, /shop-pantry-btn/);
  // Contains weekday badge
  assert.match(html, /use-day-badge/);
  assert.match(html, /木/); // 2026-10-01 is Thursday
  // Does not contain dish photo
  assert.doesNotMatch(html, /shop-dish-thumb/);
});

test("DailyUI: item actions (substitute, skip) and itemPrefs repeat memory", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.mealSlots = {
      "2026-10-01": { date: "2026-10-01", status: "confirmed", recipe: { id: "r1", title: "豚生姜焼き", mealType: "dinner", ingredients: [{ name: "みりん", amount: "大さじ1" }], steps: ["焼く"] } },
    };
  `);

  // Substitute
  run("handleDailyAction('life-item-sub', { id: 'みりん' })");
  assert.equal(run("state.shoppingMarks['みりん'].status"), "sub");
  assert.ok(run("state.itemPrefs['みりん']"), "itemPrefs remembered substitution");
  assert.equal(run("state.itemPrefs['みりん'].action"), "sub");

  // Re-render shows fold and sub-hint
  let html = run("renderDailyShopping()");
  assert.match(html, /sub-hint/);
  assert.match(html, /🔄 酒＋砂糖（3:1）/);

  // Clear mark
  run("delete state.shoppingMarks['みりん']");

  // When rendered again, itemPref badge is offered
  html = run("renderDailyShopping()");
  assert.match(html, /shop-pref-badge/);
  assert.match(html, /前回: 🔄/);

  // 1-tap apply pref
  run("handleDailyAction('life-apply-item-pref', { id: 'みりん' })");
  assert.equal(run("state.shoppingMarks['みりん'].status"), "sub");
});

test("DailyUI: pantry modal categories, filter and restock alert", () => {
  const run = setupApp();
  run(`
    state.rhythm = normalizeRhythm({ preset: "3day" });
    startRhythm(new Date("2026-10-01T12:00:00+09:00"), { tonight: true });
    state.pantryMeta = {
      "しょうゆ": { cycleDays: 30, lastBoughtAt: "2026-08-01" }, // > 30 days -> alert!
      "みりん": { cycleDays: 60, lastBoughtAt: "2026-09-25" }, // OK
    };
  `);

  // Check alert detection
  assert.equal(run("pantryHasAlert()"), true);

  // Open pantry page
  run("handleDailyAction('life-pantry-open')");
  assert.equal(run("state.view"), "pantry");

  const html = run("renderPantryPage()");
  assert.match(html, /pantry-page/);
  // Alert box is displayed
  assert.match(html, /pantry-alert-section/);
  assert.match(html, /しょうゆ/);
  assert.match(html, /そろそろ確認/);

  // Category navigation is present
  assert.match(html, /pantry-cat-tabs/);
  assert.match(html, /調味料/);

  // Quick add to shopping list
  run("handleDailyAction('life-pantry-to-shop', { name: 'しょうゆ' })");
  assert.ok(run("Object.values(state.manualShopping || {}).some((m) => m.name === 'しょうゆ')"));
});
