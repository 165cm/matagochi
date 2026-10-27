const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lpDir = path.join(__dirname, "..", "lp");
const html = fs.readFileSync(path.join(lpDir, "index.html"), "utf8");
const css = fs.readFileSync(path.join(lpDir, "styles.css"), "utf8");
const waitlistJs = fs.readFileSync(path.join(lpDir, "waitlist.js"), "utf8");

test("LP primary CTAs lead directly to the live beta app (../?start=quick)", () => {
  assert.match(html, /data-cta="header"[^>]*href="\.\.\/\?start=quick"|href="\.\.\/\?start=quick"[^>]*data-cta="header"/);
  assert.match(html, /href="\.\.\/\?start=quick"[^>]*data-cta="hero"/);
  assert.match(html, /href="\.\.\/\?start=quick"[^>]*data-cta="steps"/);
  assert.match(html, /href="\.\.\/\?start=quick"[^>]*data-cta="final"/);
  assert.match(html, /href="\.\.\/\?start=quick"[^>]*data-cta="sticky"/);
});

test("LP showcases the latest beta differentiators and 3-month free feedback perk", () => {
  // Deep personalization (わが家のごはん方針)
  assert.match(html, /わが家のごはん方針/);
  assert.match(html, /聞き返し/);
  // Cooking mode (hands-free gesture + voice + looping + local privacy)
  assert.match(html, /料理モード/);
  assert.match(html, /くり返し再生|自動ループ/);
  assert.match(html, /手の形＆声でハンズフリー/);
  assert.match(html, /リピごちのサーバーに音声が送信・保存されることはありません/);
  // Smart shopping (cross-unit merge, pack conversion, use-up, 3-min side dishes)
  assert.match(html, /パック換算/);
  assert.match(html, /3分添え物/);
  // Beta user perk (3 months free invite code for feedback)
  assert.match(html, /3か月無料/);
  // Does not claim discontinued/out-of-scope features
  assert.doesNotMatch(html, /料理写真のイラスト化/);
});

test("all local images referenced in lp/index.html exist on disk and are non-empty", () => {
  const imgSrcs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(imgSrcs.length >= 15, `expected at least 15 images in LP, got ${imgSrcs.length}`);
  for (const raw of imgSrcs) {
    const clean = raw.split("?")[0];
    const resolved = path.resolve(lpDir, clean);
    assert.ok(fs.existsSync(resolved), `missing LP image: ${clean} (${resolved})`);
    const stat = fs.statSync(resolved);
    assert.ok(stat.size > 1000, `LP image too small or empty: ${clean} (${stat.size} bytes)`);
  }

  // Also check OGP image exists in lp/assets/
  const ogMatch = html.match(/property="og:image"\s+content="https:\/\/165cm\.github\.io\/matagochi\/lp\/([^"]+)"/);
  assert.ok(ogMatch, "og:image meta tag should be present");
  const ogPath = path.resolve(lpDir, ogMatch[1]);
  assert.ok(fs.existsSync(ogPath), `missing OGP image: ${ogMatch[1]}`);
  assert.ok(fs.statSync(ogPath).size > 10000, "OGP image should be non-empty");
});

test("LP styles and waitlist script define required selectors", () => {
  for (const cls of [".pill-beta", ".beta-perk-box", ".feature-spotlight", ".cookmode-section", ".sticky-cta"]) {
    assert.ok(css.includes(cls), `styles.css should define ${cls}`);
  }
  assert.match(waitlistJs, /\[data-cta="hero"\]/);
});
