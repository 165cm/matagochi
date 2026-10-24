const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../lifestyle.js");

test("Lifestyle.QUICK_SIDES and Lifestyle.sideOf", () => {
  assert.ok(Array.isArray(L.QUICK_SIDES));
  assert.ok(L.QUICK_SIDES.length >= 5);
  const tofu = L.sideOf("冷奴");
  assert.ok(tofu);
  assert.equal(tofu.name, "冷奴");
  assert.ok(tofu.ingredients.some((i) => i.name.includes("豆腐")));
  assert.equal(L.sideOf("存在しない副菜"), undefined);
});

test("Lifestyle.shopping includes side ingredients from mealSlots", () => {
  const slots = {
    "2026-10-01": {
      date: "2026-10-01",
      status: "confirmed",
      recipe: {
        id: "r_okazu",
        title: "豚の生姜焼き",
        mealType: "dinner",
        ingredients: [{ name: "豚肉", amount: "200g" }],
        steps: ["炒める"],
      },
      servings: 2,
      side: "冷奴",
    },
  };
  const list = L.shopping({
    slots,
    start: "2026-10-01",
    end: "2026-10-01",
    scale: (amt) => amt,
  });
  assert.ok(list.some((item) => item.name === "豚肉" && item.amounts.includes("200g")));
  assert.ok(list.some((item) => item.name === "絹豆腐" && item.amounts.includes("1/2丁")));

  // without side
  const noSideSlots = {
    "2026-10-01": {
      date: "2026-10-01",
      status: "confirmed",
      recipe: {
        id: "r_okazu",
        title: "豚の生姜焼き",
        mealType: "dinner",
        ingredients: [{ name: "豚肉", amount: "200g" }],
        steps: ["炒める"],
      },
      servings: 2,
    },
  };
  const list2 = L.shopping({
    slots: noSideSlots,
    start: "2026-10-01",
    end: "2026-10-01",
    scale: (amt) => amt,
  });
  assert.ok(list2.some((item) => item.name === "豚肉"));
  assert.ok(!list2.some((item) => item.name === "絹豆腐"));
});

function app(now = "2026-10-01T03:00:00Z") {
  const t = Date.parse(now);
  const D = class extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(t);
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

test("renderDailyPlan renders rice note & quick sides, and handles life-add-side / life-remove-side", () => {
  const run = app();
  const date = "2026-10-01";
  // Setup an okazu recipe in mealSlots
  run(`
    const okazuRecipe = {
      id: "r1",
      title: "豚の生姜焼き",
      mealType: "dinner",
      ingredients: [{ name: "豚ロース肉", amount: "200g" }],
      steps: ["焼く"],
      planning: { minutes: 15, staple: "other", easy: true, tasks: [], noEquipment: true, conditionsConfirmed: true }
    };
    state.mealSlots["${date}"] = {
      date: "${date}",
      status: "confirmed",
      recipe: okazuRecipe,
      servings: 2,
    };
    state.recipes = [okazuRecipe];
  `);

  let html = run("renderDailyPlan()");
  assert.match(html, /plan-staple-note/);
  assert.match(html, /🍚 ごはん準備/);
  assert.match(html, /data-action="life-add-side"/);
  assert.match(html, /冷奴/);

  // Add side "冷奴"
  run(`handleDailyAction("life-add-side", { date: "${date}", side: "冷奴" });`);
  const slot = run(`state.mealSlots["${date}"]`);
  assert.equal(slot.side, "冷奴");

  // Re-render: now shows side pill and remove button
  html = run("renderDailyPlan()");
  assert.match(html, /plan-side-pill/);
  assert.match(html, /添え物：冷奴/);
  assert.match(html, /data-action="life-remove-side"/);

  // Check shopping list includes tofu
  const shoppingHtml = run("renderDailyShopping()");
  assert.match(shoppingHtml, /絹豆腐/);
  assert.match(shoppingHtml, /shop-rice-tip/); // rice stock tip displayed

  // Remove side
  run(`handleDailyAction("life-remove-side", { date: "${date}" });`);
  const slotAfter = run(`state.mealSlots["${date}"]`);
  assert.equal(slotAfter.side, undefined);

  // Re-render: chips are back, side pill is gone
  html = run("renderDailyPlan()");
  assert.doesNotMatch(html, /plan-side-pill/);
  assert.match(html, /data-action="life-add-side"/);
});

test("renderCooking shows staple alert and side dish box when cooking okazu", () => {
  const run = app();
  const date = "2026-10-01";
  run(`
    const okazuRecipe = {
      id: "r1",
      title: "豚の生姜焼き",
      mealType: "dinner",
      ingredients: [{ name: "豚ロース肉", amount: "200g" }],
      steps: ["タレを合わせる", "焼く"],
      staple: "other",
      planning: { minutes: 15, staple: "other", easy: true, tasks: [], noEquipment: true, conditionsConfirmed: true }
    };
    state.mealSlots["${date}"] = {
      date: "${date}",
      status: "confirmed",
      recipe: okazuRecipe,
      side: "冷奴",
      servings: 2,
    };
    cookingDate = "${date}";
  `);

  const html = run("renderCooking()");
  assert.match(html, /cooking-staple-alert/);
  assert.match(html, /ごはん（主食）の準備はOKですか？/);
  assert.match(html, /cooking-side-box/);
  assert.match(html, /今日の添え物：冷奴/);
});
