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

  // Normal screens must NOT render demo GET button
  run(`recipeTab = "book"`);
  assert.ok(!run(`renderDailyPlan()`).includes("life-card-get-demo") && !run(`renderCollection()`).includes("life-card-get-demo"), "Public UI must not show GET demo button");

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

test("5. Viewer mode (isViewer): no decide button, and dailyRecord does nothing", () => {
  const run = app();
  run(`isViewer = () => true`);
  const beforeEvals = run(`state.evaluations.length`);
  const html = run(`renderDailyPlan()`);
  assert.ok(!html.includes('data-action="life-confirm"') && !html.includes("plan-decide"), "Viewer cannot decide the plan");

  const d0 = run(`dailyPlan()[0].date`);
  const r0 = run(`allDinnerRecipes()[0]`);
  run(`dailyRecord({ date: ${JSON.stringify(d0)}, status: "confirmed", recipe: ${JSON.stringify(r0)} })`);
  assert.equal(run(`state.evaluations.length`), beforeEvals, "Viewer must not record cooked dishes");
  assert.equal(run(`VIEWER_BLOCKED.includes("life-cooked")`), true);
  assert.equal(run(`VIEWER_BLOCKED.includes("life-confirm")`), true);
});

test("8. Card Book lives in the recipe tab (🃏 図鑑); the card back can add the dish to the plan; cooking does not block 1-tap post-meal rating", () => {
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

  // 図鑑はレシピタブの「🃏 図鑑」で見る（2026-11-15 のユーザーの判断。APP_MAP §78）
  run(`setView = (v) => { state.view = v; }`);
  run(`handleCardTrayAction("life-card-book-open", {})`);
  assert.equal(run(`state.view`), "collection");
  assert.equal(run(`recipeTab`), "book");
  const bookHtml = run(`renderCollection()`);
  assert.match(bookHtml, /data-action="life-recipe-tab" data-tab="book">🃏 図鑑 <small>1\/\d+<\/small>/, "The tab shows the progress");
  assert.ok(bookHtml.includes("rc-book") && bookHtml.includes("bk-chapter"), "Card book renders in the recipe tab");
  assert.ok(!bookHtml.includes("recipe-grid"), "No recipe list under the book");
  const reflHtml = run(`renderReflection()`);
  assert.ok(!reflHtml.includes("rc-book") && !reflHtml.includes('data-view="book"'), "The reflection tab no longer holds the book");
  assert.ok(reflHtml.includes('data-action="life-card-book-open"'), "…but links to it");
  assert.ok(!run(`renderToday()`).includes("わが家のカード図鑑"), "Card book no longer opens over Today");
  // 探している時は、図鑑のタブでも検索の結果を出す
  run(`state.searchText = "鮭"`);
  assert.ok(run(`renderCollection()`).includes("recipe-grid"));
  run(`state.searchText = ""`);
  // カードの裏の「🗓 献立に入れる」：その料理の画面で「いつ？」が開く
  const yet = run(`bookProgress().rows.find((x) => !x.cooks && !x.out).r.id`);
  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(yet)} })`);
  assert.ok(run(`renderCollection()`).includes('data-action="life-card-place"'), "The back offers 献立に入れる");
  // 裏面を開いている間は、後ろの図鑑が動かない（Codex review #254）
  assert.equal(run(`syncHasSheetBodyClass()`), true, "The page behind is locked while the back is open in the recipe tab");
  run(`handleCardTrayAction("life-card-place", { recipe: ${JSON.stringify(yet)} })`);
  assert.equal(run(`trayFlipId`), "");
  assert.equal(run(`state.view`), "recipe");
  assert.equal(run(`placeRecipeId`), yet);
  assert.equal(run(`syncHasSheetBodyClass()`), false, "…and unlocked once it is closed");
  assert.ok(run(`renderPlaceSheet(detailRecipe())`).includes('data-action="life-place"'), "Days to choose from");
  // 見るだけの家族には出さない
  run(`state.view = "collection"; isViewer = () => true; handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(yet)} })`);
  assert.ok(!run(`renderCardFlipModal()`).includes("life-card-place"));
});

test("9. Card back is a modal: it locks the page, Escape closes it, and a tab switch closes it", () => {
  const run = app();
  const rId = run(`allDinnerRecipes()[0].id`);

  run(`bindSwapSheet()`);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false, "Nothing is open at first");

  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(rId)} })`);
  run(`bindSwapSheet()`);
  assert.equal(run(`trayFlipId`), rId);
  assert.equal(run(`document.body.classList.contains("has-sheet")`), true);

  run(`document.dispatchKeydown("Escape")`);
  assert.equal(run(`trayFlipId`), "");
  assert.equal(run(`document.body.classList.contains("has-sheet")`), false);

  // タブを切り替えると、開いていた裏面は閉じる
  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(rId)} })`);
  run(`resetCardTrayModals()`);
  assert.equal(run(`trayFlipId`), "");
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

test("12. Performance benchmark with 400 recipes (plan tab and card book) and cache invalidation on recipe edit", () => {
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
  const html1 = run(`renderDailyPlan()`);
  const planMs = performance.now() - t0;
  const t1 = performance.now();
  const html2 = run(`renderCardBookInline()`);
  const bookMs = performance.now() - t1;

  assert.ok(planMs < 500, `Expected the plan tab < 500ms for 400 recipes, took ${planMs.toFixed(1)}ms`);
  assert.ok(bookMs < 500, `Expected the card book < 500ms for 400 recipes, took ${bookMs.toFixed(1)}ms`);
  assert.ok(html1.includes("plan-decide") && html2.includes("bk-chapter"));

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

test("18. Regression (Codex Round 3): Aburaage is not oil, and unquantified ingredients consistently invalidate macro/salt", () => {
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
});

test("19. Regression (PR #238 review): parseAmountQuantity('1/2袋（100g）') -> 100g, and bindSwapSheet prioritizes .rc-flip-overlay", () => {
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

  // 2. bindSwapSheet prioritizes .rc-flip-overlay over background .swap-sheet
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

test("20. Card front (card book extras): no reason ribbon over the photo, collector info, corner peel, and no place dock", () => {
  const run = app();
  const html = run(`renderRecipeTradingCard(allDinnerRecipes()[0], { mode: "book" })`);
  assert.ok(!html.includes("rc-unique-ribbon"), "Reason must not be overlaid on the photo");
  assert.ok(html.includes('class="rc-stats"'), "Card shows 作った・技・材料");
  assert.ok(html.includes('class="rc-tag-line"'), "Card shows taste/type tags");
  assert.ok(html.includes("rc-corner-peel"));
  assert.ok(!html.includes("rc-dock") && !html.includes("life-tray-"), "No day-placing dock: the plan changes through ⇄ 変更 only");
});

test("23. Plan tab is quiet: plan cards, one decide button with the shopping/reuse line, no candidate shelf; ⇄ 変更 opens the 4-dish sheet (docs/UX_REDESIGN.md)", () => {
  const run = app();
  const html = run(`renderDailyPlan()`);
  for (const gone of ["tray-cards", "rc-grid", "tray-shelves", "tray-yohaku-bar", "life-tray-select-day", "life-tray-clear-all", "life-tray-confirm-all"]) assert.ok(!html.includes(gone), `${gone} is not in the plan tab`);
  assert.ok(html.includes('data-action="life-swap"'), "Every undecided day changes through the same ⇄ 変更");
  assert.equal((html.match(/data-action="life-confirm"/g) || []).length, 1, "One decide button for the shown days");
  assert.match(html, /✓ この\d日分で決定/);
  assert.match(html, /plan-decide-sum[^>]*>🛒 買う物 <b>\d+品<\/b>/, "Shows how many things to buy before deciding");
  assert.ok(html.includes('<details class="plan-tune-fold">'), "Tune buttons are folded away");
  // 予告の数は、決定した後の買い物リストと同じ
  const n = Number(html.match(/買う物 <b>(\d+)品/)[1]);
  run(`handleDailyAction("life-confirm", {})`);
  assert.equal(run(`dailyShopping().filter((x) => x.status === "buy").length`), n);
  assert.ok(!run(`renderDailyPlan()`).includes("plan-decide"), "Nothing to decide after deciding");
  // 決定した直後：献立タブのまま「もう考えなくて大丈夫」のまとめ。買う物の数は買い物リストと同じ（APP_MAP §77）
  assert.equal(run(`state.view`), "plan");
  const done = run(`renderPlanDone()`);
  assert.match(done, /曜まで、<span class="marker nobr">もう考えなくて大丈夫/);
  assert.ok(done.includes(`🛒 買う物 ${n}品を見る`) && done.includes('data-view="shopping"'));
  assert.equal((done.match(/class="dish-tile/g) || []).length, run(`planDone.dates.length`), "One photo per decided day");
  assert.ok(run(`renderDailyPlan()`).indexOf("plan-done") < run(`renderDailyPlan()`).indexOf('class="plan-list"'), "Above the plan cards");
  // ほかの操作・タブの切り替えで片づく
  run(`handleDailyAction("life-plan-done-close", {})`);
  assert.equal(run(`renderPlanDone()`), "");
  run(`planDone = { dates: [], invite: false }; resetCardTrayModals()`);
  assert.equal(run(`planDone`), null);
  // 先に1日だけ決めて、その材料を買った後：予告は、買った印を引いた数（Codex review #252）
  const run3 = app();
  run3(`const d = dailyPlan().find((x) => x.candidate); confirmDaily(d);`);
  run3(`for (const x of dailyShopping().filter((x) => x.status === "buy")) handleDailyAction("life-shopping-status", { id: x.id, status: "have" });`);
  assert.equal(run3(`dailyShopping().filter((x) => x.status === "buy").length`), 0, "Day 1 is all marked");
  const html3 = run3(`renderDailyPlan()`);
  const n3 = Number(html3.match(/買う物 <b>(\d+)品/)[1]);
  const slotsBefore = run3(`JSON.stringify(state.mealSlots)`);
  run3(`renderDailyPlan()`);
  assert.equal(run3(`JSON.stringify(state.mealSlots)`), slotsBefore, "The preview never changes the plan");
  run3(`handleDailyAction("life-confirm", {})`);
  assert.equal(run3(`dailyShopping().filter((x) => x.status === "buy").length`), n3, "Bought marks are respected in the preview");
  // 4皿から「レシピの棚」へ：閉じてレシピタブ
  const run2 = app();
  const d0 = run2(`dailyPlan().find((d) => d.candidate).date`);
  run2(`handleDailyAction("life-swap", { date: ${JSON.stringify(d0)} })`);
  assert.ok(run2(`renderSwapChoices()`).includes('data-action="life-swap-shelf"'));
  run2(`handleDailyAction("life-swap-shelf", {})`);
  assert.equal(run2(`swapDate`), "");
  assert.equal(run2(`state.view`), "collection");
});

test("26. Card book: 48 fixed cards in six chapters, progress count, ranks, excluded cards, extras, and the story on the back", () => {
  const run = app();
  run(`state.onboarded = true`);
  let html = run(`renderCardBookInline()`);
  assert.equal((html.match(/class="bk-tile /g) || []).length, 48, "all 48 cards are shown (not a part)");
  assert.equal((html.match(/class="bk-chapter /g) || []).length, 6);
  assert.match(html, /<b>0<\/b><span> \/ 48枚<\/span>/);
  assert.match(html, /No\.001[\s\S]*No\.048/);
  assert.ok(!html.includes("is-got"), "nothing collected yet");
  // 作ると集まる。回数でランクが上がる（1回 ★GET・2回 ★★常連・3回 👑定番）
  const ev = (id, n) => run(`for (let i = 0; i < ${n}; i++) state.evaluations.push({ id: "t-${id}-" + i + "-" + state.evaluations.length, recipeId: "${id}", recipeTitle: Lifestyle.curated.find((r) => r.id === "${id}").title, cookedAt: "2026-11-0" + (i + 1), mealType: "dinner", familyRepeatCycles: {} })`);
  ev("starter-51", 3); ev("starter-52", 1); ev("starter-62", 2);
  html = run(`renderCardBookInline()`);
  assert.match(html, /<b>3<\/b><span> \/ 48枚<\/span>/);
  assert.match(html, /bk-tile is-got is-rank-gold" data-action="life-card-flip" data-recipe="starter-51"/);
  assert.match(html, /bk-tile is-got is-rank-bronze" data-action="life-card-flip" data-recipe="starter-52"/);
  assert.match(html, /bk-tile is-got is-rank-silver" data-action="life-card-flip" data-recipe="starter-62"/);
  assert.match(html, /肉のおかず<\/span><b>2 \/ 11<\/b>/);
  // 同じ料理名の動画レシピで作っても、そのカードが埋まる（麻婆豆腐 → No.021）
  run(`state.recipes.push({ id: "own-mabo", title: "本格 麻婆豆腐", dish: "麻婆豆腐", mealType: "dinner", videoUrl: "https://www.youtube.com/watch?v=aaaaaaaaaaa", ingredients: [{ name: "豆腐", amount: "1丁" }], steps: ["炒める"] });
       state.evaluations.push({ id: "t-own-mabo", recipeId: "own-mabo", recipeTitle: "本格 麻婆豆腐", cookedAt: "2026-11-05", mealType: "dinner", familyRepeatCycles: {} })`);
  assert.equal(run(`bookCardRecipe(recipeById("own-mabo")).id`), "starter-71");
  html = run(`renderCardBookInline()`);
  assert.match(html, /bk-tile is-got is-rank-bronze" data-action="life-card-flip" data-recipe="starter-71"/);
  assert.ok(!html.includes("番外のカード"), "a video recipe of a book dish is not an extra");
  // 図鑑にない料理を作ると「番外」
  run(`state.recipes.push({ id: "own-x", title: "ラタトゥイユ", mealType: "dinner", ingredients: [{ name: "なす", amount: "1本" }], steps: ["煮る"] });
       state.evaluations.push({ id: "t-own-x", recipeId: "own-x", recipeTitle: "ラタトゥイユ", cookedAt: "2026-11-06", mealType: "dinner", familyRepeatCycles: {} })`);
  html = run(`renderCardBookInline()`);
  assert.match(html, /番外のカード（1枚）/);
  assert.match(html, /<b>4<\/b><span> \/ 48枚<\/span>/, "extras do not count toward the 48");
  // 食べられないものが入るカードは対象外（そろえる数から外す）。もう作ったカードは外さない
  run(`state.foodProfile = Lifestyle.profile({ ...state.foodProfile, restrictions: ["えび"] })`);
  const prog = JSON.parse(run(`JSON.stringify((({ got, target, out }) => ({ got, target, out }))(bookProgress()))`));
  assert.ok(prog.out >= 2 && prog.target === 48 - prog.out && prog.got === 4, JSON.stringify(prog));
  html = run(`renderCardBookInline()`);
  assert.match(html, /bk-tile is-out" data-action="life-card-flip" data-recipe="starter-69"/, "エビチリ is excluded");
  assert.match(html, new RegExp(`${prog.out}枚は対象外`));
  // 時間や道具では対象外にしない
  run(`state.foodProfile = Lifestyle.profile({ ...state.foodProfile, restrictions: [], weekdayMinutes: 10, weekendMinutes: 10 })`);
  assert.equal(run(`bookProgress().out`), 0);
  // カードの裏：番号と章・ひとこと・5つの見出し。大きなカードの表にも番号とひとこと
  run(`handleCardTrayAction("life-card-flip", { recipe: "starter-51" }, [])`);
  const back = run(`renderCardFlipModal()`);
  assert.match(back, /📖 No\.001・肉のおかず/);
  for (const w of ["白いごはんが止まらない、甘辛しょうが", "作れると", "食べる人は", "栄養メモ", "ここが楽", "豆知識", "ジンゲロール"]) assert.ok(back.includes(w), w);
  const front = run(`renderRecipeTradingCard(Lifestyle.curated.find((r) => r.id === "starter-51"), { mode: "book" })`);
  assert.match(front, /is-book is-ch-meat/);
  assert.match(front, /rc-card-no">No\.001</);
  assert.match(front, /rc-catch">白いごはんが止まらない、甘辛しょうが</);
  // 図鑑にない料理のカードには、番号も読みものも出さない
  assert.equal(run(`renderCardStory(recipeById("own-x"))`), "");
  // 裏の「🎬 動画の作り方を見る」：裏面を閉じて、その料理名で探す
  run(`handleCardTrayAction("life-card-videos", { dish: "麻婆豆腐" }, [])`);
  assert.equal(run(`trayFlipId`), "");
  assert.equal(run(`state.searchText`), "麻婆豆腐");
  assert.equal(run(`state.view`), "collection");
});
