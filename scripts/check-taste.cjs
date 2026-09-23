const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      acceptDownloads: true,
    });
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:8124");
    await page.locator("[data-action=life-detailed]").click();
    for (let i = 0; i < 4; i++)
      await page.locator("[data-action=life-next]").click();
    await page.waitForSelector("#taste-card img");
    await page.waitForFunction(
      () => document.querySelector("#taste-card img").naturalWidth > 0,
    );
    await page.screenshot({ path: "/tmp/taste-card.png", fullPage: true });
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    // Real pointer gesture plus keyboard; ordinary tapping is not an answer.
    let box = await page.locator("#taste-card").boundingBox();
    await page.mouse.click(box.x + 100, box.y + 100);
    assert.equal(
      await page.evaluate(() => profileDraft().tasteVotes.length),
      0,
    );
    await page.mouse.move(box.x + 100, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 105, { steps: 8 });
    await page.mouse.up();
    assert.equal(
      await page.evaluate(() => profileDraft().tasteVotes[0].vote),
      "like",
    );
    await page.reload();
    await page.waitForSelector("#taste-card");
    assert.equal(
      await page.evaluate(() => profileDraft().tasteVotes.length),
      1,
    );
    await page.locator("#taste-undo").click();
    assert.equal(
      await page.evaluate(() => profileDraft().tasteVotes.length),
      0,
    );
    await page.locator("#taste-card").focus();
    await page.keyboard.press("ArrowLeft");
    assert.equal(
      await page.evaluate(() => profileDraft().tasteVotes[0].vote),
      "pass",
    );
    await page.locator("#taste-undo").click();
    for (let i = 0; i < 8; i++) {
      await page.waitForFunction(
        () => document.querySelector("#taste-card img")?.naturalWidth > 0,
      );
      await page.locator("[data-taste-vote=like]").click();
    }
    for (let i = 0; i < 9; i++) {
      await page.waitForSelector(".priority-card");
      await page.locator("[data-taste-vote=pass]").click();
      if (i === 2) {
        await page.reload();
        await page.waitForSelector(".priority-card");
      }
    }
    await page.waitForSelector("#taste-share");
    assert.match(
      await page.locator(".taste-result").innerText(),
      /満腹ハムスター/,
    );
    await page.screenshot({ path: "/tmp/taste-result.png", fullPage: true });
    await page
      .locator("summary")
      .filter({ hasText: "全8タイプのマトリックス" })
      .click();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    await page.locator('.persona-matrix').last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>[...document.querySelectorAll('.persona-matrix img')].every(img=>img.complete && img.naturalWidth>0));
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({ path: "/tmp/persona-result.png", fullPage: true });
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#taste-download").click();
    const download = await downloadPromise;
    await download.saveAs("/tmp/taste-share.png");
    // Native sharing is tested with a stub so automated tests never open an OS share target.
    await page.evaluate(() => {
      Object.defineProperty(navigator, "canShare", {
        configurable: true,
        value: () => true,
      });
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: async (data) => {
          globalThis.testShare = {
            url: data.url,
            title: data.title,
            count: data.files.length,
          };
        },
      });
    });
    await page.locator("#taste-share").click();
    await page.waitForFunction(() => !!globalThis.testShare);
    assert.equal(
      await page.evaluate(() => testShare.url),
      "https://165cm.github.io/matagochi/?quiz=1",
    );
    assert.equal(await page.evaluate(() => testShare.count), 1);
    await page.locator("#taste-undo").click();
    await page.locator("[data-taste-vote=skip]").click();
    await page.locator("[data-action=life-next]").click();
    for (let i = 0; i < 3; i++)
      await page.locator("[data-action=life-next]").click();
    assert.equal(
      await page.locator('[data-name="塩"]').getAttribute("aria-pressed"),
      "true",
    );
    await page.locator('[data-name="塩"]').click();
    await page.reload();
    await page.waitForSelector('[data-name="塩"]');
    assert.equal(
      await page.locator('[data-name="塩"]').getAttribute("aria-pressed"),
      "false",
    );
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector(".profile-wizard");
    await page.evaluate(() => {
      profileDraft().step = 4;
      profileDraft().tasteVotes = [];
      render();
    });
    await page.waitForFunction(
      () => document.querySelector("#taste-card img").naturalWidth > 0,
    );
    await context.setOffline(false);
    const invitation = await browser.newContext();
    const invited = await invitation.newPage();
    await invited.goto(
      (process.env.TEST_URL || "http://127.0.0.1:8124") + "?quiz=1",
    );
    await invited.waitForSelector("#taste-card");
    await invited.reload();
    await invited.waitForSelector("#taste-card");
    await invited.locator("[data-action=life-next]").click();
    assert.equal(
      await invited.locator(".profile-wizard").getAttribute("data-step"),
      "0",
    );
    assert.equal(await invited.evaluate(() => state.onboarded), false);
    await invitation.close();
    assert.deepEqual(errors, []);
    console.log(
      "PASS: mobile widths, swipe, tap, keyboard, undo, resume, result, download, pantry defaults, offline images",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
