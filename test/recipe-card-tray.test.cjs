const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

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
  const ctx = vm.createContext({
    console,
    URL,
    Date: fixedDate(now),
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

test("cardArtOf returns unified hand-drawn dish illustration even when recipe has YouTube thumbnail URL", () => {
  const run = app();
  const ytRecipe = {
    id: "yt-test-1",
    title: "鮭とキャベツのバター蒸し",
    imageUrl: "https://i.ytimg.com/vi/abc123xyz/hqdefault.jpg",
    tags: ["魚", "フライパン"],
  };
  const art = run(`cardArtOf(${JSON.stringify(ytRecipe)})`);
  assert.ok(
    art.startsWith("assets/dish-picks/") || art.startsWith("assets/dishes/"),
    `Expected unified local illustration, got ${art}`
  );

  const udonArt = run(
    `cardArtOf({ id: "yt-2", title: "きのこの焦がし醤油うどん", imageUrl: "https://i.ytimg.com/vi/zzz/hqdefault.jpg" })`
  );
  assert.ok(udonArt.includes("udon") || udonArt.startsWith("assets/"));
});

test("recipeCardSpec computes 5 card statuses and evolves rank as dish is cooked", () => {
  const run = app();
  const rId = run(`allDinnerRecipes()[0].id`);

  // 0 times cooked -> draft card
  const draftSpec = run(
    `recipeCardSpec(allDinnerRecipes().find(r => r.id === ${JSON.stringify(rId)}))`
  );
  assert.equal(draftSpec.isCollected, false);
  assert.equal(draftSpec.rank, "draft");
  assert.equal(draftSpec.cooks, 0);
  assert.ok(draftSpec.typeText.length > 0);
  assert.ok(draftSpec.speedText.includes("⏱") || draftSpec.speedText.includes("⚡"));
  assert.ok(Array.isArray(draftSpec.nutriPills) && draftSpec.nutriPills.length >= 2);
  assert.ok(draftSpec.skillText.includes("★"));

  // Record 1 cooked evaluation -> bronze GET card
  run(`state.evaluations.push({
    id: "ev-1",
    recipeId: ${JSON.stringify(rId)},
    personId: "self",
    rating: "ok",
    createdAt: new Date().toISOString()
  })`);
  const bronzeSpec = run(
    `recipeCardSpec(allDinnerRecipes().find(r => r.id === ${JSON.stringify(rId)}))`
  );
  assert.equal(bronzeSpec.isCollected, true);
  assert.equal(bronzeSpec.rank, "bronze");
  assert.equal(bronzeSpec.cooks, 1);

  // Record 2nd cooked evaluation -> silver regular card
  run(`state.evaluations.push({
    id: "ev-2",
    recipeId: ${JSON.stringify(rId)},
    personId: "self",
    rating: "ok",
    createdAt: "2026-11-01T10:00:00Z"
  })`);
  const silverSpec = run(
    `recipeCardSpec(allDinnerRecipes().find(r => r.id === ${JSON.stringify(rId)}))`
  );
  assert.equal(silverSpec.rank, "silver");
  assert.equal(silverSpec.cooks, 2);

  // Record 3rd cooked evaluation -> gold family classic card
  run(`state.evaluations.push({
    id: "ev-3",
    recipeId: ${JSON.stringify(rId)},
    personId: "self",
    rating: "again",
    createdAt: "2026-10-20T10:00:00Z"
  })`);
  const goldSpec = run(
    `recipeCardSpec(allDinnerRecipes().find(r => r.id === ${JSON.stringify(rId)}))`
  );
  assert.equal(goldSpec.rank, "gold");
  assert.equal( goldSpec.cooks, 3);
  assert.ok(goldSpec.sealText.includes("定番"));
  assert.match(goldSpec.cardNo, /^No\.\d{3}$/);
  assert.ok(["high", "mid", "low"].includes(goldSpec.proteinTier));
  assert.ok(["high", "mid", "low"].includes(goldSpec.vegTier));
  assert.ok(["high", "mid", "watch"].includes(goldSpec.saltTier));
});

test("3-day wooden meal tray opens, clears all slots, places cards in order, and supports similar-dish attraction & flip", () => {
  const run = app();
  const planHtml = run(`renderDailyPlan()`);
  assert.ok(planHtml.includes("life-tray-open"), "Plan tab should show tray banner");
  assert.ok(planHtml.includes("life-card-book-open"), "Plan tab should show card book button");

  // Open the tray
  const firstDay = run(`trayTargetDays()[0].date`);
  const secondDay = run(`trayTargetDays()[1].date`);
  run(`handleCardTrayAction("life-tray-open", { date: ${JSON.stringify(firstDay)} })`);
  assert.equal(run(`trayOpen`), true);
  let sheetHtml = run(`renderCardTraySheet()`);
  assert.ok(sheetHtml.includes("献立トレイ"));
  assert.ok(sheetHtml.includes("life-tray-clear-all"));
  // Always shows 6 trading cards for side-by-side comparison, with corner peel and external dock
  assert.equal([...sheetHtml.matchAll(/<article class="rc-card /g)].length, 6, "Should show 6 trading cards for comparison");
  assert.ok(sheetHtml.includes("rc-corner-peel"), "Should have animated corner peel button for card back");
  assert.ok(sheetHtml.includes("rc-dock"), "Action buttons should be placed in external dock outside the card");
  assert.ok(sheetHtml.includes("rc-crown"), "Should highlight #1 stat among the 6 cards with a crown");
  assert.ok(!sheetHtml.includes("/1人前"), "Should not repeat '/1人前' inside every card");

  // Clear all slots ("全部変えちゃうことが多い")
  run(`handleCardTrayAction("life-tray-clear-all", {})`);
  assert.equal(run(`trayDayRecipe(trayTargetDays()[0])`), null);
  assert.equal(run(`trayDayRecipe(trayTargetDays()[1])`), null);

  // Place first card from shelf into Day 1, auto-advancing active slot to Day 2
  sheetHtml = run(`renderCardTraySheet()`);
  const firstCardMatch = sheetHtml.match(/data-action="life-tray-place" data-recipe="([^"]+)"/);
  assert.ok(firstCardMatch, "Expected placeable recipe card on shelf");
  const pickedId1 = firstCardMatch[1];
  run(`handleCardTrayAction("life-tray-place", { recipe: ${JSON.stringify(pickedId1)} })`);
  assert.equal(run(`state.planOverrides[${JSON.stringify(firstDay)}]`), pickedId1);
  assert.equal(run(`trayActiveDate`), secondDay);

  // Attract similar dishes ("🔍 似たカード")
  run(`handleCardTrayAction("life-tray-similar", { recipe: ${JSON.stringify(pickedId1)} })`);
  assert.equal(run(`trayAnchorId`), pickedId1);
  sheetHtml = run(`renderCardTraySheet()`);
  assert.ok(sheetHtml.includes("に近いカードを集めたよ"));

  // Flip a card to view ingredients & original YouTube link
  run(`handleCardTrayAction("life-card-flip", { recipe: ${JSON.stringify(pickedId1)} })`);
  assert.equal(run(`trayFlipId`), pickedId1);
  const flipHtml = run(`renderCardFlipModal()`);
  assert.ok(flipHtml.includes("材料（"));
  assert.ok(flipHtml.includes("作り方（全"));

  // Trigger Card GET celebration when cooking a dish or pressing demo
  run(`handleCardTrayAction("life-card-get-demo", { recipe: ${JSON.stringify(pickedId1)} })`);
  assert.ok(run(`Boolean(cardGetRecipeId)`));
  const getHtml = run(`renderCardGetModal()`);
  assert.ok(getHtml.includes("RECIPE CARD COLLECTED!"));
});

test("estimateRecipeNutrition and computeTrayCombo calculate MEXT-based salt/nutrition and 3-day tray combination parameters", () => {
  const run = app();
  // Explicit Japanese seasoning quantities -> status: "calculated"
  const clearRecipe = {
    id: "salt-test-1",
    title: "豚肉とキャベツのしょうが焼き",
    sourceServings: 2,
    ingredients: [
      { name: "豚こま切れ肉", amount: "200g" },
      { name: "キャベツ", amount: "150g" },
      { name: "しょうゆ", amount: "大さじ1" },
      { name: "みりん", amount: "大さじ1" },
    ],
  };
  const n1 = run(`estimateRecipeNutrition(${JSON.stringify(clearRecipe)})`);
  assert.equal(n1.status, "calculated");
  assert.equal(n1.statusLabel, "成分表計算");
  assert.ok(n1.saltG >= 1.2 && n1.saltG <= 2.0, `Expected ~1.4g salt/serving, got ${n1.saltG}`);
  assert.ok(n1.proteinG >= 18);
  assert.ok(n1.vegG >= 70);
  assert.ok(n1.lowSaltTip.includes("しょうゆ"));

  // Ambiguous seasoning ("適量") -> status: "estimated" ("仮計算・目安")
  const vagueRecipe = {
    id: "salt-test-2",
    title: "野菜炒め",
    sourceServings: 2,
    ingredients: [
      { name: "もやし", amount: "1袋" },
      { name: "塩こしょう", amount: "適量" },
    ],
  };
  const n2 = run(`estimateRecipeNutrition(${JSON.stringify(vagueRecipe)})`);
  assert.equal(n2.status, "estimated");
  assert.equal(n2.statusLabel, "仮計算・目安");

  // 3-day tray combination parameter meter
  const combo = run(`computeTrayCombo(trayTargetDays())`);
  assert.ok(combo.count >= 2);
  assert.ok(combo.avgProteinG > 0);
  assert.ok(combo.totalVegG > 0);
  assert.ok(combo.avgSaltG > 0);
  assert.ok(combo.varietyScore > 0);
  const comboHtml = run(`renderTrayComboPanel(trayTargetDays())`);
  assert.ok(comboHtml.includes("組み合わせパラメータ"));
  assert.ok(comboHtml.includes("食塩相当量"));
});
