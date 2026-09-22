const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.TEST_URL || "http://127.0.0.1:8124");
  await page.waitForSelector(".profile-wizard");
  await page.locator('[data-profile=servings][value="2"]').check();
  await page.locator("[data-action=life-next]").first().click();
  await page.reload();
  await page.waitForSelector(".profile-wizard");
  assert.match(await page.locator(".wizard-progress").innerText(), /2 \/ 16/);
  for (let step = 1; step < 15; step++) {
    if (step === 5) {
      await page.locator('[data-profile=weekdayMinutes][value="20"]').check();
      await page.locator('[data-profile=weekendMinutes][value="30"]').check();
    }
    if (step === 7) {
      for (const group of [0, 1]) {
        await page.locator(`.equipment-group[data-group="${group}"]`).click();
        for (const name of (group === 0 ? ["コンロ", "電子レンジ", "フライパン", "鍋", "ざる"] : ["耐熱ボウル"])) {
          const button = page.locator(`[data-action="life-equipment-toggle"][data-name="${name}"]`);
          if (await button.getAttribute('aria-pressed') !== 'true') await button.click();
        }
      }
    }
    if (step === 8)
      await page.locator('[data-owned="しょうゆ"]').selectOption("have");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    assert.equal(overflow, false, "step " + step + " overflow");
    if (step === 7)
      await page.screenshot({
        path: "/tmp/daily-onboarding.png",
        fullPage: true,
      });
    await page.locator("[data-action=life-next]").first().click();
  }
  await page.locator("[data-action=life-finish]").click();
  await page.waitForSelector("[data-action=life-confirm]");
  await page.locator("[data-action=life-confirm]").click();
  await page.waitForSelector("[data-shopping-id]");
  await page.locator("[data-shopping-id]").first().selectOption("purchased");
  await page.locator(".tab[data-view=today]").click();
  await page.waitForSelector(".today-dish");
  await page.screenshot({ path: "/tmp/daily-today.png", fullPage: true });
  await page.locator("[data-action=life-cook]").first().click();
  await page.locator("[data-action=life-cooked]").click();
  assert.match(await page.locator("#app").innerText(), /ごちそうさま/);
  await page.reload();
  await page.waitForSelector(".today-dish");
  assert.match(await page.locator("#app").innerText(), /ごちそうさま/);
  for (const width of [320, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const view of ["today", "plan", "shopping", "collection", "repeat"]) {
      await page.locator(`.tab[data-view=${view}]`).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        view + " overflow at " + width,
      );
    }
  }
  await page.locator("#profile-button").click();
  await page.locator("[data-action=life-profile]").click();
  await page.waitForSelector(".profile-wizard");
  assert.match(await page.locator(".wizard-progress").innerText(), /16 \/ 16/);
  // Personal recipe registration remains available, with optional planning metadata.
  await page.locator("[data-action=life-pause]").click();
  await page.locator(".tab[data-view=collection]").click();
  await page.locator("[data-action=go-view][data-view=register]").click();
  await page.locator("[data-action=entry-method][data-method=manual]").click();
  await page.locator("#recipe-title").fill("テストの丼");
  await page.locator("#recipe-steps").fill("材料を温める");
  await page
    .locator("summary")
    .filter({ hasText: "献立に使う調理条件" })
    .click();
  await page.locator("#planning-minutes").fill("15");
  await page.locator("#planning-equipment").fill("コンロ、フライパン");
  await page.locator("[data-action=save-recipe]").click();
  await page.waitForSelector("#recipe-search");
  assert.match(await page.locator("#app").innerText(), /テストの丼/);
  assert.equal(
    await page.evaluate(
      () =>
        state.recipes.find((r) => r.title === "テストの丼").planning.minutes,
    ),
    15,
  );
  // Service worker contains every new JS asset; reload works offline.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector(".today-dish");
  await page.locator(".tab[data-view=plan]").click();
  assert.ok(await page.locator(".daily-plan-row").count());
  await context.setOffline(false);
  await page.locator(".tab[data-view=today]").click();
  await page.screenshot({ path: "/tmp/daily-today.png", fullPage: true });
  console.log(
    JSON.stringify({
      errors,
      flow: "onboarding/resume/plan/shopping/cook/record/reload/navigation/settings",
      widths: [320, 390, 430],
    }),
  );
  await browser.close();
  assert.deepEqual(errors, []);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
