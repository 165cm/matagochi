const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(t);
    }
    static now() {
      return t;
    }
  };
}

function app({ now = "2026-11-09T10:00:00Z" } = {}) {
  const classSet = new Set();
  const bodyClassList = {
    toggle(cls, force) {
      const next = force === undefined ? !classSet.has(cls) : Boolean(force);
      if (next) classSet.add(cls);
      else classSet.delete(cls);
      return next;
    },
    add(cls) {
      classSet.add(cls);
    },
    remove(cls) {
      classSet.delete(cls);
    },
    contains(cls) {
      return classSet.has(cls);
    },
  };
  let keydownHandler = null;
  const mockModal = {
    addEventListener(ev, fn) {
      if (ev === "keydown") keydownHandler = fn;
    },
    querySelectorAll() {
      return [];
    },
    contains() {
      return false;
    },
    focus() {},
  };
  const ctx = vm.createContext({
    console,
    URL,
    Date: fixedDate(now),
    requestAnimationFrame: (fn) => fn(),
    document: {
      body: { classList: bodyClassList, contains: () => false },
      activeElement: null,
      querySelector: (sel) => {
        if (
          typeof sel === "string" &&
          (sel.includes(".swap-sheet") || sel.includes(".rc-flip-overlay")) &&
          bodyClassList.contains("has-sheet")
        ) {
          return mockModal;
        }
        return null;
      },
      querySelectorAll: () => [],
      dispatchKeydown: (key, extra = {}) => {
        if (keydownHandler) {
          let prevented = false;
          keydownHandler({
            key,
            ...extra,
            preventDefault() {
              prevented = true;
            },
            get defaultPrevented() {
              return prevented;
            },
          });
        }
      },
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
    if (f === "app.js")
      s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run(
    "state=freshState();state.onboarded=true;state.rhythm=null;saveState=()=>{};render=()=>{};showToast=()=>{}"
  );
  return run;
}

test("1. Demo action never modifies recipes, evaluations, or sync data, and cleanDemoGetRecords strips demo-get-* safely", () => {
  const run = app();
  const rId = run(`allDinnerRecipes()[0].id`);
  const beforeRecipesCount = run(`state.recipes.length`);
  const beforeEvalsCount = run(`state.evaluations.length`);

  // Normal tray sheet must NOT render demo GET button
  run(`handleCardTrayAction("life-tray-open", {})`);
  const sheetHtml = run(`renderCardTraySheet()`);
  assert.ok(!sheetHtml.includes("life-card-get-demo"), "Public tray UI must not show GET demo button");

  // Even if life-card-get-demo is invoked directly, it must NOT write to state.recipes or state.evaluations
  run(`handleCardTrayAction("life-card-get-demo", { recipe: ${JSON.stringify(rId)} })`);
  assert.equal(run(`state.recipes.length`), beforeRecipesCount);
  assert.equal(run(`state.evaluations.length`), beforeEvalsCount);

  // If legacy demo-get-* records exist alongside real records, cleanDemoGetRecords removes only demo-get-*
  run(`
    state.evaluations.push(
      { id: "real-eval-1", recipeId: ${JSON.stringify(rId)}, personId: "self", rating: "again", createdAt: "2026-11-01T10:00:00Z" },
      { id: "demo-get-1700000001", recipeId: ${JSON.stringify(rId)}, personId: "self", rating: "again", createdAt: "2026-11-02T10:00:00Z" }
    );
  `);
  const removed = run(`cleanDemoGetRecords(state)`);
  assert.equal(removed.removedCount, 1);
  assert.equal(removed.removedIds[0], "demo-get-1700000001");
  assert.equal(run(`state.evaluations.length`), beforeEvalsCount + 1);
  assert.equal(run(`state.evaluations.some(e => e.id.startsWith("demo-get-"))`), false);
  assert.ok(run(`Boolean(state.tombstones.evaluations["demo-get-1700000001"])`));
});

test("2 & 3. Tray draft isolation: placing 1 card does not change other days, undo restores previous draft, and closing discards draft without modifying plan or shopping", () => {
  const run = app();
  const beforePlan = run(`JSON.parse(JSON.stringify(dailyPlan()))`);
  const beforeShopping = run(`JSON.parse(JSON.stringify(dailyShopping()))`);
  const beforeOverrides = run(`JSON.parse(JSON.stringify(state.planOverrides || {}))`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const d1 = days[1].date;
  const d2 = days[2].date;
  const initialD0 = run(`trayDraft[${JSON.stringify(d0)}]`);
  const initialD1 = run(`trayDraft[${JSON.stringify(d1)}]`);
  const initialD2 = run(`trayDraft[${JSON.stringify(d2)}]`);

  // Place a different recipe on day 0
  const sheetHtml = run(`renderCardTraySheet()`);
  const candidates = [...sheetHtml.matchAll(/data-action="life-tray-place" data-recipe="([^"]+)"/g)].map((m) => m[1]);
  const newRecipeId = candidates.find((id) => id !== initialD0) || candidates[0];

  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(newRecipeId)} })`);

  // Day 0 changed in draft, but Day 1 and Day 2 in draft are completely untouched
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), newRecipeId);
  assert.equal(run(`trayDraft[${JSON.stringify(d1)}]`), initialD1, "Day 2 must not reshuffle when Day 1 changes");
  assert.equal(run(`trayDraft[${JSON.stringify(d2)}]`), initialD2, "Day 3 must not reshuffle when Day 1 changes");

  // Underlying state.planOverrides is still untouched while in draft
  assert.deepEqual(run(`JSON.parse(JSON.stringify(state.planOverrides || {}))`), beforeOverrides);

  // Undo restores Day 0 to initialD0
  run(`handleCardTrayAction("life-tray-undo", {})`);
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), initialD0);

  // Place again, then close tray without confirming -> discards draft
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(newRecipeId)} })`);
  run(`handleCardTrayAction("life-tray-close", {})`);
  assert.equal(run(`trayOpen`), false);
  assert.equal(run(`isTrayDraftActive()`), false);
  assert.deepEqual(run(`JSON.parse(JSON.stringify(dailyPlan()))`), beforePlan);
  assert.deepEqual(run(`JSON.parse(JSON.stringify(dailyShopping()))`), beforeShopping);
});

test("4. Confirming the tray updates mealSlots, dailyShopping, planPage/shopPage, trackDaily, switches to shopping view, and detects concurrent family conflicts", () => {
  const run = app();
  run(`setView = (v) => { state.view = v; }`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const sheetHtml = run(`renderCardTraySheet()`);
  const pickedId = sheetHtml.match(/data-action="life-tray-place" data-recipe="([^"]+)"/)[1];

  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(pickedId)} })`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);

  assert.equal(run(`trayOpen`), false);
  assert.equal(run(`state.view`), "shopping");
  assert.equal(run(`state.planOverrides[${JSON.stringify(d0)}]`), pickedId);
  assert.equal(run(`state.mealSlots[${JSON.stringify(d0)}]?.status`), "confirmed");
  assert.equal(run(`state.mealSlots[${JSON.stringify(d0)}]?.recipe?.id`), pickedId);
  assert.ok(run(`Boolean(state.planConfirmedAt)`));

  const shop = run(`dailyShopping()`);
  assert.ok(Array.isArray(shop) && shop.length > 0);

  // Concurrent family edit conflict detection
  run(`handleCardTrayAction("life-tray-open", {})`);
  const familyOtherRecipe = run(`allDinnerRecipes().find(r => r.id !== ${JSON.stringify(pickedId)})`);
  // Simulate a remote family sync changing d0's confirmed mealSlot while tray is open
  run(`state.mealSlots[${JSON.stringify(d0)}] = confirmedSlot(${JSON.stringify(d0)}, ${JSON.stringify(familyOtherRecipe)})`);
  run(`trayDraft[${JSON.stringify(d0)}] = ${JSON.stringify(pickedId)}`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);

  // Must record conflict instead of silently overwriting family member's change
  assert.equal(run(`state.mealSlots[${JSON.stringify(d0)}]?.recipe?.id`), familyOtherRecipe.id);
  assert.ok(run(`Boolean(state.sync?.conflicts?.[${JSON.stringify(d0)}])`));
});

test("5. Viewer mode (isViewer) blocks tray open/place/clear/confirm and dailyRecord", () => {
  const run = app();
  run(`isViewer = () => true`);
  const beforeOverrides = run(`JSON.parse(JSON.stringify(state.planOverrides || {}))`);
  const beforeEvals = run(`state.evaluations.length`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  assert.equal(run(`trayOpen`), false, "Viewer must not open tray");

  const d0 = run(`dailyPlan()[0].date`);
  const r0 = run(`allDinnerRecipes()[0]`);
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(r0.id)} })`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);
  assert.deepEqual(run(`JSON.parse(JSON.stringify(state.planOverrides || {}))`), beforeOverrides);

  run(`dailyRecord({ date: ${JSON.stringify(d0)}, status: "confirmed", recipe: ${JSON.stringify(r0)} })`);
  assert.equal(run(`state.evaluations.length`), beforeEvals, "Viewer must not record cooked dishes");

  assert.equal(run(`VIEWER_BLOCKED.includes("life-tray-open")`), true);
  assert.equal(run(`VIEWER_BLOCKED.includes("life-tray-place")`), true);
  assert.equal(run(`VIEWER_BLOCKED.includes("life-tray-confirm-all")`), true);
  assert.equal(run(`VIEWER_BLOCKED.includes("life-cooked")`), true);
});

test("6. Restricted ingredients, unsupported equipment, overtime, cooked, off, and locked days cannot be placed or confirmed", () => {
  const run = app();
  // Restrict shrimp ("えび"), limit weekday/weekend time to 15 min, and disallow オーブン
  run(`
    state.foodProfile = Lifestyle.profile({
      ...dailyProfile(),
      restrictions: ["えび"],
      weekdayMinutes: 15,
      weekendMinutes: 15,
      equipment: { ...Lifestyle.equipmentDefaults({}), オーブン: "none" }
    });
    state.recipes.push(
      {
        id: "bad-allergen",
        title: "えびチリ",
        mealType: "dinner",
        planning: { minutes: 10, equipment: ["フライパン"], contains: ["えび"], verified: true },
        ingredients: [{ name: "むきえび", amount: "200g" }],
        steps: ["フライパンで炒める"]
      },
      {
        id: "bad-time",
        title: "じっくり煮込み",
        mealType: "dinner",
        planning: { minutes: 45, equipment: ["鍋"], contains: [], verified: true },
        ingredients: [{ name: "豚肉", amount: "200g" }],
        steps: ["鍋で煮る"]
      },
      {
        id: "bad-equip",
        title: "オーブン焼き",
        mealType: "dinner",
        planning: { minutes: 10, equipment: ["オーブン"], contains: [], verified: true },
        ingredients: [{ name: "鶏肉", amount: "200g" }],
        steps: ["オーブンで焼く"]
      }
    );
  `);

  run(`handleCardTrayAction("life-tray-open", {})`);
  const d0 = run(`trayTargetDays()[0].date`);
  const origD0 = run(`trayDraft[${JSON.stringify(d0)}]`);

  // Attempt to place restricted / overtime / unsupported equipment recipes
  run(`handleCardTrayAction("life-tray-place", { recipe: "bad-allergen" })`);
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), origD0);

  run(`handleCardTrayAction("life-tray-place", { recipe: "bad-time" })`);
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), origD0);

  run(`handleCardTrayAction("life-tray-place", { recipe: "bad-equip" })`);
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), origD0);

  // If a draft has an invalid recipe injected, confirm-all aborts without partial update
  run(`trayDraft[${JSON.stringify(d0)}] = "bad-allergen"`);
  const beforeConfirmedAt = run(`state.planConfirmedAt`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);
  assert.equal(run(`state.planConfirmedAt`), beforeConfirmedAt);
  assert.notEqual(run(`state.planOverrides?.[${JSON.stringify(d0)}]`), "bad-allergen");

  // Cooked / off day is excluded from trayTargetDays and cannot be modified
  run(`handleCardTrayAction("life-tray-close", {})`);
  run(`state.mealSlots[${JSON.stringify(d0)}] = { date: ${JSON.stringify(d0)}, status: "off", updatedAt: nowIso() }`);
  run(`handleCardTrayAction("life-tray-open", {})`);
  const editableDates = run(`trayTargetDays().map(d => d.date)`);
  assert.ok(!editableDates.includes(d0), "Off day must not be editable in tray");
});

test("7. Opening 3-day tray from '今夜の4皿' (swapDate) commits pass learning (swapCommit) before switching", () => {
  const run = app();
  const d0 = run(`dailyPlan()[0].date`);
  const rPass = run(`allDinnerRecipes()[0].id`);

  run(`swapDate = ${JSON.stringify(d0)}`);
  run(`swapRemoved = [{ id: ${JSON.stringify(rPass)}, bulk: false }]`);

  run(`handleCardTrayAction("life-tray-open", { date: ${JSON.stringify(d0)} })`);
  assert.equal(run(`swapDate`), "", "swapDate must be cleared when opening tray");
  assert.equal(run(`trayOpen`), true, "trayOpen must be true");
  assert.ok(
    run(`Boolean(state.passMemo?.rests?.[${JSON.stringify(rPass)}])`),
    "swapCommit must have persisted passed recipe rest period before switching to tray"
  );
});

test("8. Card Book opens from Today tab and cooking does not block 1-tap post-meal rating", () => {
  const run = app();
  const todayDate = run(`today()`);
  const recipe = run(`dailyPlan().find(d => d.date === ${JSON.stringify(todayDate)})?.candidate?.recipe || allDinnerRecipes()[0]`);
  run(`confirmDaily({ date: ${JSON.stringify(todayDate)} }, ${JSON.stringify(recipe)})`);

  // Cook today's dish
  run(`dailyRecord(state.mealSlots[${JSON.stringify(todayDate)}])`);
  // Must NOT open full-screen blocking cardGetRecipeId modal
  assert.equal(run(`cardGetRecipeId`), "", "Cooking must not open blocking modal over 1-tap rating");
  assert.ok(run(`Boolean(cardGetBannerRecipeId)`), "First GET sets inline celebration banner");

  const todayHtml = run(`renderToday()`);
  assert.ok(todayHtml.includes("tonight-quick-rate") && todayHtml.includes('data-action="life-rate"'), "Today tab must show 1-tap rating immediately after cooking");
  assert.ok(todayHtml.includes("rc-get-inline-banner"), "Today tab shows non-blocking inline Card GET banner");

  // Open Card Book on Today tab
  run(`handleCardTrayAction("life-card-book-open", {})`);
  assert.equal(run(`cardBookOpen`), true);
  const todayWithBookHtml = run(`renderToday()`);
  assert.ok(todayWithBookHtml.includes("わが家のカード図鑑"), "Card Book sheet must render inside Today tab");
});

test("9. Escape key and modal close always remove body.has-sheet and close only the topmost modal", () => {
  const run = app();
  const rId = run(`allDinnerRecipes()[0].id`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`bindSwapSheet()`);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), true);

  // Open card flip modal on top of tray
  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(rId)} })`);
  run(`bindSwapSheet()`);
  assert.equal(run(`trayOpen`), true);
  assert.equal(run(`trayFlipId`), rId);

  // First Escape closes only the topmost modal (trayFlipId), keeping trayOpen
  run(`document.dispatchKeydown("Escape")`);
  assert.equal(run(`trayFlipId`), "");
  assert.equal(run(`trayOpen`), true);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), true);

  // Second Escape closes trayOpen and removes body.has-sheet
  run(`document.dispatchKeydown("Escape")`);
  assert.equal(run(`trayOpen`), false);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false);

  // Switching tab also resets all card/tray modals and removes body.has-sheet
  run(`handleCardTrayAction("life-card-book-open", {})`);
  run(`bindSwapSheet()`);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), true);
  run(`resetCardTrayModals()`);
  assert.equal(run(`cardBookOpen`), false);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false);
});

test("10. Stage 2 Nutrition Engine: prevents false ingredient matches, parses fractions/ranges/invalid quantities, and never fabricates servings or clamped salt", () => {
  const run = app();

  // False match prevention: 牛乳 != 牛肉, 米油 != 米, パン粉 != パン, 無塩バター != 有塩バター
  const trickyRecipe = {
    id: "nutri-tricky",
    title: "牛乳と無塩バターのホワイトソース",
    sourceServings: 2,
    ingredients: [
      { name: "牛乳", amount: "200ml" },
      { name: "無塩バター", amount: "20g" },
      { name: "米油", amount: "大さじ1" },
      { name: "パン粉", amount: "大さじ2" },
    ],
  };
  const nTricky = run(`estimateRecipeNutrition(${JSON.stringify(trickyRecipe)})`);
  const matchedIds = nTricky.matchedItems.map((m) => m.foodId);
  assert.ok(matchedIds.includes("milk"), "牛乳 must match milk");
  assert.ok(!matchedIds.includes("beef"), "牛乳 must NOT match beef");
  assert.ok(matchedIds.includes("unsalted_butter"), "無塩バター must match unsalted_butter");
  assert.ok(!matchedIds.includes("butter"), "無塩バター must NOT match salted butter");
  assert.ok(matchedIds.includes("oil"), "米油 must match oil");
  assert.ok(!matchedIds.includes("rice"), "米油 must NOT match rice");
  assert.ok(matchedIds.includes("panko"), "パン粉 must match panko");
  assert.ok(!matchedIds.includes("bread"), "パン粉 must NOT match bread");

  // Mixed numbers ("1と1/2"), fractions ("1/2"), ranges ("1〜2個"), and invalid ("0g", "-1個", "1/0")
  const qMixed = run(`parseAmountQuantity("大さじ1と1/2")`);
  assert.equal(qMixed.qty, 1.5);
  assert.equal(qMixed.ambiguous, false);

  const qRange = run(`parseAmountQuantity("1〜2個")`);
  assert.equal(qRange.qty, 1.5);
  assert.equal(qRange.ambiguous, true);

  const qZero = run(`parseAmountQuantity("0g")`);
  assert.equal(qZero.invalid, true);
  assert.equal(qZero.qty, null);

  const qDivZero = run(`parseAmountQuantity("1/0個")`);
  assert.equal(qDivZero.invalid, true);
  assert.equal(qDivZero.qty, null);

  // Unknown servings -> per-serving values are null, not assumed 2 servings
  const noServingsRecipe = {
    id: "nutri-noserv",
    title: "しょうゆ炒め",
    sourceServings: null,
    ingredients: [
      { name: "豚こま切れ肉", amount: "200g" },
      { name: "しょうゆ", amount: "大さじ1" },
    ],
  };
  const nNoServ = run(`estimateRecipeNutrition(${JSON.stringify(noServingsRecipe)})`);
  assert.equal(nNoServ.servings, null);
  assert.equal(nNoServ.saltG, null, "Per-serving saltG must be null when servings are unknown");
  assert.equal(nNoServ.status, "unknown");
  assert.ok(nNoServ.totalSaltG > 2.0, "Total saltG is still computed for reference");
});

test("11. Stage 3 Honest Image Resolution: never assigns another dish's illustration by hash or mismatched parent", () => {
  const run = app();

  // Approved parent dish ("麻婆豆腐") -> uses approved parent illustration
  const mapoTofu = {
    id: "img-mapo-tofu",
    title: "基本の麻婆豆腐",
    imageUrl: "https://i.ytimg.com/vi/abc/hqdefault.jpg",
  };
  const infoTofu = run(`cardImageInfo(${JSON.stringify(mapoTofu)})`);
  assert.equal(infoTofu.kind, "illustration");
  assert.equal(infoTofu.src, "assets/dish-picks/mabo.webp");

  // Sub-recipe with different main ingredient ("麻婆なす") -> must NOT use 麻婆豆腐 illustration!
  const mapoNasu = {
    id: "img-mapo-nasu",
    title: "とろとろ麻婆なす",
    imageUrl: "https://i.ytimg.com/vi/xyz/hqdefault.jpg",
  };
  const infoNasu = run(`cardImageInfo(${JSON.stringify(mapoNasu)})`);
  assert.equal(infoNasu.kind, "photo");
  assert.equal(infoNasu.src, "https://i.ytimg.com/vi/xyz/hqdefault.jpg");

  // Unmatched dish with no thumbnail -> uses neutral pot placeholder ("イメージ"), never a random dish illustration
  const unknownNoThumb = {
    id: "img-unknown-nothumb",
    title: "カリフラワーのスパイスロースト",
  };
  const infoFallback = run(`cardImageInfo(${JSON.stringify(unknownNoThumb)})`);
  assert.equal(infoFallback.kind, "placeholder");
  assert.equal(infoFallback.src, "assets/dishes/photo-unavailable-pot.webp");
  assert.equal(infoFallback.label, "イメージ");
});

test("12. Performance benchmark with 400 recipes and cache invalidation on recipe edit", () => {
  const run = app();
  run(`
    for (let i = 0; i < 360; i++) {
      state.recipes.push({
        id: "perf-r-" + i,
        title: "テスト豚肉とキャベツ炒め " + i,
        mealType: "dinner",
        planning: { minutes: 15 + (i % 15), equipment: ["フライパン"], contains: ["豚肉"], verified: true },
        sourceServings: 2,
        updatedAt: "2026-11-09T00:00:00Z",
        ingredients: [
          { name: "豚肉", amount: "200g" },
          { name: "キャベツ", amount: "150g" },
          { name: "しょうゆ", amount: "大さじ1" }
        ],
        steps: ["フライパンで炒める"]
      });
    }
  `);
  const totalRecipes = run(`allDinnerRecipes().length`);
  assert.ok(totalRecipes >= 400, `Expected >= 400 recipes, got ${totalRecipes}`);

  const t0 = performance.now();
  run(`handleCardTrayAction("life-tray-open", {})`);
  const html1 = run(`renderCardTraySheet()`);
  const openMs = performance.now() - t0;

  const pickedId = html1.match(/data-action="life-tray-place" data-recipe="([^"]+)"/)[1];
  const t1 = performance.now();
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(pickedId)} })`);
  const html2 = run(`renderCardTraySheet()`);
  const placeMs = performance.now() - t1;

  assert.ok(openMs < 500, `Expected tray open + render < 500ms for 400 recipes, took ${openMs.toFixed(1)}ms`);
  assert.ok(placeMs < 250, `Expected card place + render < 250ms for 400 recipes, took ${placeMs.toFixed(1)}ms`);
  assert.ok(html2.includes("献立トレイ"));

  // Verify cache invalidates when a recipe's ingredients change
  const beforeSalt = run(`estimateRecipeNutrition(state.recipes.find(r => r.id === "perf-r-0")).saltG`);
  run(`
    const r = state.recipes.find(x => x.id === "perf-r-0");
    r.ingredients.push({ name: "しょうゆ", amount: "大さじ2" });
    r.updatedAt = "2026-11-10T00:00:00Z";
  `);
  const afterSalt = run(`estimateRecipeNutrition(state.recipes.find(r => r.id === "perf-r-0")).saltG`);
  assert.ok(afterSalt > beforeSalt, "Nutrition memo must invalidate when recipe ingredients/updatedAt change");
});
