const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.TEST_URL || "http://127.0.0.1:8124/";
    await page.goto(base + "?start=quick");
    await page.waitForSelector("[data-action=life-quick-next]");
    await page.locator('[data-profile=servings][value="2"]').check();
    await page.waitForSelector("[data-profile=weekdayMinutes]");
    await page.reload();
    await page.waitForSelector("[data-profile=weekdayMinutes]");
    assert.match(await page.locator(".wizard-progress").innerText(), /2 \/ 3/);
    await page.locator('[data-profile=weekdayMinutes][value="20"]').check();
    await page.locator("[data-action=life-finish]").click();
    await page.waitForSelector("[data-action=life-confirm]");
    assert.equal(await page.evaluate(() => state.servingCount), 2);
    assert.equal(await page.evaluate(() => state.planLength), 3);
    assert.equal(await page.evaluate(() => dailyShopping().length), 0);
    assert.equal(await page.evaluate(() => state.foodProfile.completed), false);
    await page.locator("[data-action=life-confirm]").click();
    assert.ok((await page.evaluate(() => dailyShopping().length)) > 0);
    await page.locator(".tab[data-view=today]").click();
    // Existing data must survive campaign links.
    const snapshot = await page.evaluate(() => JSON.stringify(state.mealSlots));
    await page.goto(base + "?start=quick");
    await page.waitForSelector(".tab");
    assert.equal(
      await page.evaluate(() => JSON.stringify(state.mealSlots)),
      snapshot,
    );
    const preview = await browser.newContext({
        viewport: { width: 390, height: 844 },
      }),
      demo = await preview.newPage();
    await demo.goto(base + "?start=preview");
    await demo.waitForSelector("[data-action=life-confirm]");
    assert.equal(
      await demo.evaluate(() => dailyPlan().filter((d) => d.candidate).length),
      3,
    );
    assert.equal(
      await demo.evaluate(() => Object.keys(state.mealSlots).length),
      0,
    );
    await demo.locator("[data-action=life-quick]").click();
    await demo.waitForSelector("[data-action=life-quick-next]");
    await page.goto(base + "lp/");
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    // hero, steps, final and the mobile sticky bar
    assert.equal(await page.locator('a[href="../?start=quick"]').count(), 4);
    assert.equal(await page.locator('a[href="../?quiz=1"]').count(), 1);
    assert.doesNotMatch(
      await page.locator("body").innerText(),
      /完全無料|課金も広告もありません|サーバーには送りません|6段階/,
    );
    await page
      .locator('img[src="assets/screen-recipes.webp"]')
      .scrollIntoViewIfNeeded();
    await page.evaluate(() => { for (const image of document.images) image.loading = "eager"; });
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: "/tmp/lp-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "/tmp/lp-mobile.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: quick setup/resume, preview, confirmation shopping, existing-data preservation, LP mobile layout and links",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
