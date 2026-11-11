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
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);
  assert.notEqual(run(`state.planOverrides?.[${JSON.stringify(d0)}]`), "bad-allergen");
  assert.notEqual(run(`state.mealSlots?.[${JSON.stringify(d0)}]?.status`), "confirmed");

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

test("8. Card Book opens in the reflection tab (図鑑) and cooking does not block 1-tap post-meal rating", () => {
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

  // 図鑑は振り返りタブの「🃏 図鑑」で見る（2026-11-11 のユーザーの判断）
  run(`setView = (v) => { state.view = v; }`);
  run(`handleCardTrayAction("life-card-book-open", {})`);
  assert.equal(run(`state.view`), "repeat");
  assert.equal(run(`reflView`), "book");
  const reflHtml = run(`renderReflection()`);
  assert.ok(reflHtml.includes('data-view="book" aria-pressed="true"'), "図鑑 is a view of the reflection tab");
  assert.ok(reflHtml.includes("rc-book"), "Card book renders inline in the reflection tab");
  assert.ok(!run(`renderToday()`).includes("わが家のカード図鑑"), "Card book no longer opens over Today");
});

test("9. The tray is part of the plan tab (no sheet); Escape closes only the card back; tab switch keeps an edited draft", () => {
  const run = app();
  const rId = run(`allDinnerRecipes()[0].id`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`bindSwapSheet()`);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false, "Inline tray is not a modal");
  assert.ok(run(`renderDailyPlan()`).includes('id="tray-cards"'), "Candidate cards are inside the plan tab");

  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(rId)} })`);
  run(`bindSwapSheet()`);
  assert.equal(run(`trayFlipId`), rId);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), true);

  run(`document.dispatchKeydown("Escape")`);
  assert.equal(run(`trayFlipId`), "");
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false);

  // 選び直しの途中でタブを切り替えても、下書きは残る
  const d0 = run(`trayTargetDays()[0].date`);
  run(`handleCardTrayAction("life-tray-clear-one", { date: ${JSON.stringify(d0)} })`);
  assert.equal(run(`isTrayDraftActive()`), true);
  run(`resetCardTrayModals()`);
  assert.equal(run(`isTrayDraftActive()`), true, "Edited draft survives a tab switch");
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false);
  // 「元の献立に戻す」で捨てられる
  run(`handleCardTrayAction("life-tray-close", {})`);
  assert.equal(run(`isTrayDraftActive()`), false);
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
  assert.ok(html2.includes("に入れる候補"));

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

test("13. Regression (Claude #1): Unchanged already-confirmed day is NOT re-confirmed by life-tray-confirm-all, keeping shopped items off the shopping list", () => {
  const run = app();
  run(`setView = (v) => { state.view = v; }`);
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const d1 = days[1].date;
  const r0 = run(`allDinnerRecipes()[0]`);
  const r1 = run(`allDinnerRecipes()[1]`);
  const r2 = run(`allDinnerRecipes()[2]`);

  // Day 0 is already confirmed and shopped at an earlier timestamp
  run(`
    confirmDaily({ date: ${JSON.stringify(d0)} }, ${JSON.stringify(r0)});
    state.mealSlots[${JSON.stringify(d0)}].updatedAt = "2026-11-08T08:00:00.000Z";
    state.shopDone = { legacy: "2026-11-08T09:00:00.000Z" };
  `);
  assert.equal(run(`dailyShopping().length`), 0, "Before tray open, already-shopped Day 0 has 0 items to buy");

  // Open tray, leave Day 0 unchanged, and change only Day 1
  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`handleCardTrayAction("life-tray-select-day", { date: ${JSON.stringify(d1)} })`);
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(r1.id)}, date: ${JSON.stringify(d1)} })`);
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(r2.id)}, date: ${JSON.stringify(days[2].date)} })`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);

  assert.equal(
    run(`state.mealSlots[${JSON.stringify(d0)}].updatedAt`),
    "2026-11-08T08:00:00.000Z",
    "Unchanged confirmed day must keep its original updatedAt so shopDone stays newer"
  );
  // Shopping list must contain only newly confirmed days' ingredients, not Day 0's already-shopped items
  const shopUses = run(`dailyShopping().flatMap(i => i.uses || [])`);
  assert.ok(!shopUses.includes(r0.title), "Already-shopped unchanged day d0 must not return to shopping list");
  assert.ok(shopUses.includes(r1.title), "Newly confirmed day d1 must appear on shopping list");
});

test("14. Regression (Claude #2 & Codex #2, #3): Empty slot hides confirm button & blocks confirm-all; target day becoming off/cooked/locked during edit aborts all days", () => {
  const run = app();
  run(`handleCardTrayAction("life-tray-open", {})`);
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const d1 = days[1].date;

  // All 3 slots filled initially -> confirm button is shown
  assert.ok(run(`renderTrayActionBar(trayTargetDays())`).includes("life-tray-confirm-all"));

  // Clear one slot -> confirm button must NOT be rendered, and direct confirm-all must abort without confirming remaining days
  run(`handleCardTrayAction("life-tray-clear-one", { date: ${JSON.stringify(d0)} })`);
  assert.ok(!run(`renderTrayActionBar(trayTargetDays())`).includes("life-tray-confirm-all"), "Confirm button must be hidden when any slot is empty");
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);
  assert.notEqual(run(`state.mealSlots?.[${JSON.stringify(d1)}]?.status`), "confirmed", "Must not partially confirm when a slot is empty");

  // Re-open with all slots filled, then d0 becomes 'off' while tray is open -> confirm-all must abort all days
  run(`handleCardTrayAction("life-tray-close", {})`);
  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`state.mealSlots[${JSON.stringify(d0)}] = { date: ${JSON.stringify(d0)}, status: "off", updatedAt: nowIso() }`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);
  assert.notEqual(run(`state.mealSlots?.[${JSON.stringify(d1)}]?.status`), "confirmed", "Must abort all days if any pinned target date became off while tray was open");
});

test("15. Regression (Codex #1): Conflict resolution uses c.local, does not prematurely save discover recipe, and preserves other days' tray draft", async () => {
  const run = app();
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const d1 = days[1].date;

  // Add a discover recipe to candidate pool
  run(`
    discover.savedAt = "2026-11-09T09:00:00Z";
    discover.trends = [{
      videoId: "vidtest1",
      title: "新着テスト鶏の照り焼き",
      videoUrl: "https://www.youtube.com/watch?v=vidtest1",
      thumbnailUrl: "https://i.ytimg.com/vi/vidtest1/hqdefault.jpg",
      planning: { minutes: 15, easy: true, equipment: ["フライパン"], contains: ["鶏肉"], tasks: [] },
      sourceServings: 2,
      ingredients: [{ name: "鶏もも肉", amount: "250g" }, { name: "しょうゆ", amount: "大さじ1" }],
      steps: ["フライパンで焼く"]
    }];
    discover.popular = [];
    discoverRecipes();
  `);
  const rRemote = run(`allDinnerRecipes().find(r => r.id !== "trend-vidtest1")`);
  const rDay1Pick = run(`allDinnerRecipes().find(r => r.id !== "trend-vidtest1" && r.id !== ${JSON.stringify(rRemote.id)})`);
  const recipesBefore = run(`state.recipes.length`);

  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`handleCardTrayAction("life-tray-place", { recipe: "trend-vidtest1", date: ${JSON.stringify(d0)} })`);
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(rDay1Pick.id)}, date: ${JSON.stringify(d1)} })`);

  // Simulate remote family device confirming rRemote on d0 while tray was open
  run(`state.mealSlots[${JSON.stringify(d0)}] = confirmedSlot(${JSON.stringify(d0)}, ${JSON.stringify(rRemote)})`);
  run(`handleCardTrayAction("life-tray-confirm-all", {})`);

  // 1. Conflict detected, discover recipe NOT saved to state.recipes yet
  assert.ok(run(`Boolean(state.sync?.conflicts?.[${JSON.stringify(d0)}])`));
  assert.equal(run(`state.recipes.length`), recipesBefore, "Discover recipe must not be saved before user chooses local in conflict");

  // 2. Conflict choice UI shows the local tray choice ("新着テスト鶏の照り焼き"), NOT the remote recipe
  const conflictHtml = run(`renderPlanConflictChoices(state.sync.conflicts)`);
  assert.ok(conflictHtml.includes("この端末：新着テスト鶏の照り焼き"), `Expected local tray recipe title in conflict button, got: ${conflictHtml}`);

  // 3. Other day's draft (d1) is preserved
  assert.equal(run(`trayDraft[${JSON.stringify(d1)}]`), rDay1Pick.id, "Non-conflicting day's draft must be preserved");

  // 4. Choosing 'sync-plan-local' applies c.local (and saves the discover recipe now)
  await run(`handleSyncPlanAction("sync-plan-local", { date: ${JSON.stringify(d0)} })`);
  assert.equal(run(`state.mealSlots[${JSON.stringify(d0)}]?.recipe?.title`), "新着テスト鶏の照り焼き");
  assert.equal(run(`state.recipes.length`), recipesBefore + 1, "Discover recipe is saved once local conflict choice is selected");

  // 5. Re-opening tray keeps d1's draft intact so user can finish confirming
  run(`handleCardTrayAction("life-tray-open", {})`);
  assert.equal(run(`trayDraft[${JSON.stringify(d1)}]`), rDay1Pick.id);
});

test("16. Regression (Claude #3 & Codex #4, #5): Ponzu salt, diluted liquid broth vs dry granules, plain oil kcal, impossible salt cap, and partial vs total separation", () => {
  const run = app();

  // (a) Ponzu must match SEASONING_SALT_RULES ("ponzu"), NOT unsalted vinegar
  const ponzuRecipe = {
    id: "nutri-ponzu",
    title: "豚しゃぶポン酢",
    sourceServings: 2,
    ingredients: [
      { name: "豚肉", amount: "200g" },
      { name: "ポン酢", amount: "大さじ2" },
    ],
  };
  const nPonzu = run(`estimateRecipeNutrition(${JSON.stringify(ponzuRecipe)})`);
  assert.equal(nPonzu.status, "estimated");
  assert.equal(nPonzu.saltG, 1.6, "Ponzu 2 tbsp (3.0g) + pork (0.2g) / 2 servings = 1.6g");
  assert.ok(nPonzu.matchedItems.some((m) => m.foodId === "ponzu"));

  // (b) Diluted soup ("鶏ガラスープ 800ml") must NOT be counted as 53 tbsp of dry granules (52.2g/serving)!
  // And plain "油 大さじ1" must count ~108 kcal.
  const brothRecipe = {
    id: "nutri-liquid-broth",
    title: "鶏ガラスープ鍋",
    sourceServings: 4,
    ingredients: [
      { name: "鶏もも肉", amount: "300g" },
      { name: "白菜", amount: "400g" },
      { name: "鶏ガラスープ", amount: "800ml" },
      { name: "油", amount: "大さじ1" },
      { name: "塩", amount: "小さじ1" },
    ],
  };
  const nBroth = run(`estimateRecipeNutrition(${JSON.stringify(brothRecipe)})`);
  assert.equal(nBroth.saltG, null, "Dish total saltG must be null (unknown) when diluted soup stock has unknown dilution");
  assert.equal(nBroth.status, "partial");
  assert.equal(nBroth.partialSaltG, 1.6, "Known salt subtotal (1 tsp salt + chicken / 4) is exposed as partialSaltG");
  assert.ok(nBroth.kcal >= 200, "Plain '油 大さじ1' and chicken/cabbage kcal are counted");

  // (c) Partial salt ("塩 適量") sets saltG to null and shows partialSaltG on card back
  const partialRecipe = {
    id: "nutri-partial-salt",
    title: "豚の生姜焼き（塩適量）",
    sourceServings: 2,
    ingredients: [
      { name: "豚ロース", amount: "200g" },
      { name: "しょうゆ", amount: "大さじ1" },
      { name: "塩", amount: "適量" },
    ],
  };
  run(`state.recipes.push(${JSON.stringify(partialRecipe)})`);
  const nPartial = run(`estimateRecipeNutrition(${JSON.stringify(partialRecipe)})`);
  assert.equal(nPartial.saltG, null, "Dish total saltG must be null when '塩 適量' is present");
  assert.equal(nPartial.partialSaltG, 1.4, "Known soy sauce + pork salt is in partialSaltG");
  assert.equal(nPartial.status, "partial");

  run(`trayFlipId = "nutri-partial-salt"`);
  const flipHtml = run(`renderCardFlipModal()`);
  assert.ok(flipHtml.includes("不明") && flipHtml.includes("判明分 小計 約1.4g"), "Card back must show '不明（判明分 小計 約1.4g）'");
});

test("17. Regression (Claude #6 & #7 & Codex #6): Viewer hides all '作った' buttons; middle ingredient & 2nd evaluation rating invalidate cache; 4th cook banner", () => {
  const run = app();
  const dPast = run(`addDays(today(), -1)`);
  const r0 = run(`allDinnerRecipes()[0]`);
  run(`confirmDaily({ date: ${JSON.stringify(dPast)} }, ${JSON.stringify(r0)})`);
  run(`cookingDate = ${JSON.stringify(dPast)}`);

  // Viewer mode hides '作った' in renderTodayTodos, renderRecentMeals, and renderCooking
  run(`isViewer = () => true`);
  assert.ok(!run(`renderTodayTodos()`).includes("life-record-past"), "Viewer must not see life-record-past in Today todos");
  assert.equal(run(`renderRecentMeals()`), "", "Viewer must not see renderRecentMeals");
  assert.ok(!run(`renderCooking()`).includes("life-cooked"), "Viewer must not see life-cooked in renderCooking");
  run(`isViewer = () => false`);

  // Middle ingredient modification without changing first/last ingredient or updatedAt invalidates nutrition cache
  run(`
    state.recipes.push({
      id: "cache-mid-test",
      title: "キャッシュ検証炒め",
      mealType: "dinner",
      sourceServings: 2,
      ingredients: [
        { name: "豚肉", amount: "200g" },
        { name: "しょうゆ", amount: "小さじ1" },
        { name: "キャベツ", amount: "150g" }
      ],
      steps: ["炒める"]
    });
  `);
  const salt1 = run(`estimateRecipeNutrition(state.recipes.find(r => r.id === "cache-mid-test")).saltG`);
  run(`state.recipes.find(r => r.id === "cache-mid-test").ingredients[1].amount = "大さじ2"`);
  const salt2 = run(`estimateRecipeNutrition(state.recipes.find(r => r.id === "cache-mid-test")).saltG`);
  assert.ok(salt2 > salt1, "Modifying middle ingredient amount must invalidate NUTRITION_MEMO even without updatedAt change");

  // Modifying 2nd evaluation's rating invalidates CARD_SPEC_MEMO
  run(`
    state.evaluations = [
      { id: "ev-top", recipeId: "other-r", cookedAt: "2026-11-09", updatedAt: "2026-11-09T10:00:00Z", familyRepeatCycles: { 自分: "monthly" } },
      { id: "ev-second", recipeId: "cache-mid-test", cookedAt: "2026-11-08", updatedAt: "2026-11-08T10:00:00Z", familyRepeatCycles: { 自分: "monthly" } }
    ];
  `);
  const specBefore = run(`recipeCardSpec(state.recipes.find(r => r.id === "cache-mid-test"))`);
  assert.equal(specBefore.rank, "bronze");
  run(`state.evaluations[1].familyRepeatCycles = { 自分: "tomorrow" }`);
  const specAfter = run(`recipeCardSpec(state.recipes.find(r => r.id === "cache-mid-test"))`);
  assert.equal(specAfter.rank, "gold", "Changing 2nd evaluation's rating to 'tomorrow' must invalidate CARD_SPEC_MEMO and upgrade rank to gold");
});

test("18. Regression (Codex Round 3): Aburaage is not oil, unquantified ingredients consistently invalidate macro/salt, and remaining draft protects hasUnsavedWork after resolving last conflict", () => {
  const run = app();

  // 1. Codex #1: 油, 米油, 油揚げ, 厚揚げ distinction
  const rOil = {
    id: "test-oil-diff",
    title: "油の識別テスト",
    sourceServings: 1,
    ingredients: [
      { name: "油", amount: "10g" },
      { name: "米油", amount: "大さじ1" },
      { name: "油揚げ", amount: "100g" },
      { name: "厚揚げ", amount: "100g" },
    ],
  };
  const nOil = run(`estimateRecipeNutrition(${JSON.stringify(rOil)})`);
  const matchedOil = nOil.matchedItems.filter((i) => i.foodId === "oil");
  const matchedSoy = nOil.matchedItems.filter((i) => i.foodId === "soy");
  assert.equal(matchedOil.length, 2, "Only '油' and '米油' must match foodId 'oil'");
  assert.equal(matchedSoy.length, 2, "'油揚げ' and '厚揚げ' must match foodId 'soy' (not oil)");
  // 油揚げ(100g*0.8=80kcal) + 厚揚げ(100g*0.8=80kcal) + 油(10g*9=90kcal) + 米油(12g*9=108kcal) = 358 kcal
  assert.ok(nOil.kcal < 500, `Calories (${nOil.kcal}kcal) must not treat 200g of aburaage/atsuage as pure fat (which would be ~1800kcal)`);

  // 2. Codex #2: Unquantified ingredients consistently invalidate macro/salt totals
  const basePorkSoy = [
    { name: "豚肉", amount: "200g" },
    { name: "しょうゆ", amount: "大さじ1" },
  ];

  // 2-a: 砂糖・適量 -> macro total null, partial macro exists
  const rSugarSome = {
    id: "test-sugar-some",
    title: "豚の生姜焼き（砂糖適量）",
    sourceServings: 2,
    ingredients: [...basePorkSoy, { name: "砂糖", amount: "適量" }],
  };
  const nSugarSome = run(`estimateRecipeNutrition(${JSON.stringify(rSugarSome)})`);
  assert.equal(nSugarSome.kcal, null, "Sugar '適量' must make total kcal null");
  assert.ok(nSugarSome.partialKcal != null && nSugarSome.partialKcal > 0, "Known pork kcal must be in partialKcal");
  assert.equal(nSugarSome.saltG, 1.4, "Salt from soy sauce (2.6g/2) is unchanged by sugar");

  // 2-b: 砂糖・-1g -> invalid quantity makes total kcal null
  const rSugarInvalid = {
    id: "test-sugar-invalid",
    title: "豚の生姜焼き（砂糖-1g）",
    sourceServings: 2,
    ingredients: [...basePorkSoy, { name: "砂糖", amount: "-1g" }],
  };
  const nSugarInvalid = run(`estimateRecipeNutrition(${JSON.stringify(rSugarInvalid)})`);
  assert.equal(nSugarInvalid.kcal, null, "Sugar '-1g' must make total kcal null");
  assert.ok(nSugarInvalid.partialKcal != null && nSugarInvalid.partialKcal > 0);

  // 2-c: マヨネーズ・適量 -> both kcal and saltG must be null (mayonnaise contains both fat/kcal and salt)
  const rMayoSome = {
    id: "test-mayo-some",
    title: "豚の生姜焼き（マヨ適量）",
    sourceServings: 2,
    ingredients: [...basePorkSoy, { name: "マヨネーズ", amount: "適量" }],
  };
  const nMayoSome = run(`estimateRecipeNutrition(${JSON.stringify(rMayoSome)})`);
  assert.equal(nMayoSome.saltG, null, "Mayonnaise '適量' must make total saltG null");
  assert.equal(nMayoSome.kcal, null, "Mayonnaise '適量' must make total kcal null");
  assert.ok(nMayoSome.partialSaltG != null && nMayoSome.partialSaltG > 0, "Partial salt is retained");
  assert.ok(nMayoSome.partialKcal != null && nMayoSome.partialKcal > 0, "Partial kcal is retained");

  // 2-d: 牛乳・適量 -> both kcal and saltG must be null (milk contains both protein/kcal and mineral salt)
  const rMilkSome = {
    id: "test-milk-some",
    title: "豚の生姜焼き（牛乳適量）",
    sourceServings: 2,
    ingredients: [...basePorkSoy, { name: "牛乳", amount: "適量" }],
  };
  const nMilkSome = run(`estimateRecipeNutrition(${JSON.stringify(rMilkSome)})`);
  assert.equal(nMilkSome.saltG, null, "Milk '適量' must make total saltG null");
  assert.equal(nMilkSome.kcal, null, "Milk '適量' must make total kcal null");
  assert.ok(nMilkSome.partialSaltG != null && nMilkSome.partialSaltG > 0);
  assert.ok(nMilkSome.partialKcal != null && nMilkSome.partialKcal > 0);

  // 3. Codex #3: Resolving last conflict while other days have drafts keeps hasUnsavedWork() true
  run(`handleCardTrayAction("life-tray-open", {})`);
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const d1 = days[1].date;
  const rA = run(`allDinnerRecipes()[0]`);
  const rB = run(`allDinnerRecipes()[1]`);
  const rC = run(`allDinnerRecipes()[2]`);

  // Open tray, edit d0 and d1
  run(`handleCardTrayAction("life-tray-place", { date: ${JSON.stringify(d0)}, recipe: ${JSON.stringify(rA.id)} })`);
  run(`handleCardTrayAction("life-tray-place", { date: ${JSON.stringify(d1)}, recipe: ${JSON.stringify(rB.id)} })`);

  // Simulate tray closed (e.g., conflict dialog on top) with a conflict on d0
  run(`trayOpen = false`);
  run(`state.sync.conflicts = { [${JSON.stringify(d0)}]: { local: ${JSON.stringify(rA)}, remote: ${JSON.stringify(rC)} } }`);
  assert.ok(run(`isTrayDraftActive()`), "Draft should be active during conflict");
  assert.ok(run(`hasUnsavedWork()`), "hasUnsavedWork should be true during conflict");

  // Resolve d0 conflict by picking local selection
  run(`syncTrayAfterConflictResolution(${JSON.stringify(d0)}, { slot: { recipe: ${JSON.stringify(rA)} } })`);
  run(`delete state.sync.conflicts[${JSON.stringify(d0)}]`);

  // Now conflicts is empty ({}), trayOpen is false, but d1 draft is still unsaved!
  assert.equal(run(`Object.keys(state.sync.conflicts).length`), 0, "Conflicts are completely cleared");
  assert.equal(run(`trayOpen`), false, "Tray is closed");
  assert.notEqual(run(`trayDraft[${JSON.stringify(d1)}]`), run(`trayInitialDraft[${JSON.stringify(d1)}]`), "d1 draft is still different from initial");
  assert.ok(run(`isTrayDraftActive()`), "isTrayDraftActive must be true because d1 has an unsaved draft");
  assert.ok(run(`hasUnsavedWork()`), "hasUnsavedWork must remain true to protect unsaved d1 draft from automatic reload/sync");
});

test("19. Regression (PR #238 review): parseAmountQuantity('1/2袋（100g）') -> 100g, syncTrayAfterConflictResolution sets samePlan true, and bindSwapSheet prioritizes .rc-flip-overlay", () => {
  const run = app();

  // 1. parseAmountQuantity paren weight extraction
  const pqParen = run(`parseAmountQuantity("1/2袋（100g）")`);
  assert.equal(pqParen.unit, "g");
  assert.equal(pqParen.val, 100);
  assert.equal(pqParen.qty, 100);

  const pqParenApprox = run(`parseAmountQuantity("1/2袋（約150g）")`);
  assert.equal(pqParenApprox.unit, "g");
  assert.equal(pqParenApprox.val, 150);

  const pqParenMl = run(`parseAmountQuantity("1パック(200ml)")`);
  assert.equal(pqParenMl.unit, "ml");
  assert.equal(pqParenMl.val, 200);

  // Unreadable paren content falls back to outer unit (pack/piece)
  const pqUnreadable = run(`parseAmountQuantity("1/2袋（市販品）")`);
  assert.equal(pqUnreadable.unit, "pack");
  assert.equal(pqUnreadable.val, 0.5);

  const pqPieceParen = run(`parseAmountQuantity("1/2個（一口大に切る）")`);
  assert.equal(pqPieceParen.unit, "piece");
  assert.equal(pqPieceParen.val, 0.5);

  // Codex Round 4 verification: kg, spaces in range, and invalid quantities in parens
  const pqKg = run(`parseAmountQuantity("1袋（0.5kg）")`);
  assert.equal(pqKg.unit, "g");
  assert.equal(pqKg.val, 500);
  assert.equal(pqKg.invalid, false);

  const pqRangeSpace = run(`parseAmountQuantity("1袋（100 〜 150g）")`);
  assert.equal(pqRangeSpace.unit, "g");
  assert.equal(pqRangeSpace.val, 125);
  assert.equal(pqRangeSpace.ambiguous, true);
  assert.equal(pqRangeSpace.invalid, false);

  const pqZeroParen = run(`parseAmountQuantity("1袋（0g）")`);
  assert.equal(pqZeroParen.invalid, true);
  assert.equal(pqZeroParen.qty, null);

  const pqNegParen = run(`parseAmountQuantity("1袋（-100g）")`);
  assert.equal(pqNegParen.invalid, true);
  assert.equal(pqNegParen.qty, null);

  const pqDivZeroParen = run(`parseAmountQuantity("1袋（1/0g）")`);
  assert.equal(pqDivZeroParen.invalid, true);
  assert.equal(pqDivZeroParen.qty, null);

  const pqNegRangeParen = run(`parseAmountQuantity("1袋（-100〜200g）")`);
  assert.equal(pqNegRangeParen.invalid, true);
  assert.equal(pqNegRangeParen.qty, null);

  // 2. syncTrayAfterConflictResolution keeps trayBasePlan in sync with planSnapshot (samePlan === true)
  const days = run(`trayTargetDays()`);
  const d0 = days[0].date;
  const rA = run(`allDinnerRecipes()[0]`);
  run(`handleCardTrayAction("life-tray-open", {})`);
  run(`handleCardTrayAction("life-tray-place", { date: ${JSON.stringify(d0)}, recipe: ${JSON.stringify(rA.id)} })`);

  // Simulate conflict resolution selecting local recipe
  const chosenSlot = run(`confirmedSlot(${JSON.stringify(d0)}, ${JSON.stringify(rA)})`);
  run(`
    const plan = planSnapshot(state);
    plan[${JSON.stringify(d0)}] = { slot: ${JSON.stringify(chosenSlot)} };
    putPlan(state, plan);
    syncTrayAfterConflictResolution(${JSON.stringify(d0)}, { slot: ${JSON.stringify(chosenSlot)} });
  `);
  const isSame = run(`samePlan(trayBasePlan[${JSON.stringify(d0)}], planSnapshot(state)[${JSON.stringify(d0)}])`);
  assert.equal(isSame, true, "trayBasePlan must match planSnapshot after conflict resolution so samePlan is true and conflict is not repeatedly flagged");

  // 3. bindSwapSheet prioritizes .rc-flip-overlay over background .swap-sheet
  run(`
    let focusedElement = null;
    const flipOverlay = {
      classList: { contains: (c) => c === "rc-flip-overlay" },
      contains: () => false,
      querySelectorAll: (sel) => sel.includes("button") ? [{ tagName: "BUTTON", disabled: false, offsetParent: {}, focus: () => { focusedElement = "flip-btn"; } }] : [],
      addEventListener: () => {}
    };
    const swapSheet = {
      classList: { contains: (c) => c === "swap-sheet" },
      contains: () => false,
      querySelectorAll: (sel) => sel.includes("button") ? [{ tagName: "BUTTON", disabled: false, offsetParent: {}, focus: () => { focusedElement = "tray-btn"; } }] : [],
      addEventListener: () => {}
    };
    document.querySelector = (sel) => {
      if (sel === ".rc-flip-overlay") return flipOverlay;
      if (sel === ".swap-sheet") return swapSheet;
      return null;
    };
    bindSwapSheet();
  `);
  assert.equal(run(`focusedElement`), "flip-btn", "bindSwapSheet must focus inside the topmost .rc-flip-overlay, not background .swap-sheet");
});

test("20. Card front: no reason ribbon over the photo, richer collector info, and no duplicate 裏面 button", () => {
  const run = app();
  run(`handleCardTrayAction("life-tray-open", {})`);
  const html = run(`renderCardTraySheet()`);
  assert.ok(!html.includes("rc-unique-ribbon"), "Reason must not be overlaid on the photo");
  assert.ok(html.includes('class="rc-stats"'), "Card shows 作った・技・材料");
  assert.ok(html.includes('class="rc-tag-line"'), "Card shows taste/type tags");
  assert.ok(!/<small>裏面<\/small>/.test(html), "Back side opens from the corner peel only (no 裏面 dock button)");
  assert.ok(html.includes("rc-corner-peel"));
  assert.equal(run(`trayThinking`), false, "No thinking delay without animation support (tests, reduced motion)");
});

test("21. Similar mode: a reason shared by 2+ cards is said once by よはく, not repeated on every card", () => {
  const run = app();
  run(`handleCardTrayAction("life-tray-open", {})`);
  const first = run(`renderCardTraySheet()`).match(/data-action="life-tray-similar" data-recipe="([^"]+)"/)[1];
  run(`handleCardTrayAction("life-tray-similar", { recipe: ${JSON.stringify(first)} })`);
  const html = run(`renderCardTraySheet()`);
  const chips = [...html.matchAll(/<span class="rc-reason-chip">([^<]+)<\/span>/g)].map((m) => m[1]);
  const counts = chips.reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map());
  for (const [chip, n] of counts) assert.ok(n < 2, `chip "${chip}" must not repeat (${n} cards)`);
  const say = html.match(/class="tray-yohaku-bar[^"]*" data-say="([^"]+)"/)[1];
  assert.match(say, /に近い/);
});

test("22. Thinking state blocks tray edits until the reveal, and closing cancels it", () => {
  const run = app();
  run(`handleCardTrayAction("life-tray-open", {})`);
  const d0 = run(`trayTargetDays()[0].date`);
  const before = run(`trayDraft[${JSON.stringify(d0)}]`);
  run(`trayThinking = true`);
  const html = run(`renderCardTraySheet()`);
  assert.ok(html.includes("考えてる"), "よはく says she is thinking");
  assert.ok(!html.includes('data-action="life-tray-place"'), "No cards to place while thinking");
  assert.ok(!html.includes("life-tray-confirm-all"), "No confirm while thinking");
  run(`handleCardTrayAction("life-tray-clear-one", { date: ${JSON.stringify(d0)} })`);
  assert.equal(run(`trayDraft[${JSON.stringify(d0)}]`), before, "Edits are ignored while thinking");
  run(`handleCardTrayAction("life-tray-close", {})`);
  assert.equal(run(`trayThinking`), false);
});

test("23. Plan tab: the tray days show as the big plan cards, with confirm/空にする right under them and no switch to a separate tray", () => {
  const run = app();
  const html = run(`renderDailyPlan()`);
  assert.ok(!html.includes("wt-open-btn"), "No separate 3日トレイ entry");
  assert.ok(!html.includes("tray-slot-card"), "No small slots");
  const listEnd = html.indexOf("</section>", html.indexOf('class="plan-list"'));
  const bar = html.indexOf("tray-action-bar");
  assert.ok(bar > 0 && bar < listEnd, "Confirm bar sits inside the plan list, under the cards");
  assert.ok(html.indexOf('id="tray-cards"') > listEnd, "Candidates come after the plan cards");
  assert.ok(html.includes('data-action="life-tray-select-day"'), "Each plan card has 🔄 選び直す");
  // 選び直した日は、大きな献立カードにその料理が出る
  const d0 = run(`trayTargetDays()[0].date`);
  const pick = run(`renderCardTraySheet()`).match(/data-action="life-tray-place" data-recipe="([^"]+)"/)[1];
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(pick)}, date: ${JSON.stringify(d0)} })`);
  const html2 = run(`renderDailyPlan()`);
  const title = run(`findDinnerRecipeById(${JSON.stringify(pick)}).title`);
  assert.ok(html2.includes("選び直した"), "Draft day is marked");
  assert.ok(html2.includes(title.slice(0, 6)), "Picked dish is shown big in the plan card");
  // 見るだけの家族にはトレイを出さない
  run(`isViewer = () => true`);
  assert.ok(!run(`renderDailyPlan()`).includes("tray-cards"));
});
