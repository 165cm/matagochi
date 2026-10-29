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

test("LP styles and waitlist script define required selectors and interactive controls", () => {
  for (const cls of [".pill-beta", ".beta-perk-box", ".feature-spotlight", ".cookmode-section", ".sticky-cta", ".tap-card", ".step-tabs", ".tile-grid"]) {
    assert.ok(css.includes(cls), `styles.css should define ${cls}`);
  }
  assert.match(waitlistJs, /\[data-cta="hero"\]/);
  assert.match(waitlistJs, /activateStep/);
});

test("LP surface visible text is less than half of full LP text via progressive disclosure", () => {
  const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  const mainMatch = html.match(/<main[\s\S]*?<\/main>/);
  assert.ok(mainMatch, "main element should exist");
  const mainHtml = mainMatch[0];

  const totalChars = stripTags(mainHtml).length;

  // Extract surface visible HTML: only active step panel (<article ... hidden> is removed)
  // and closed <details> only expose their direct <summary>
  function extractSurface(raw) {
    let out = "";
    let i = 0;
    const clean = raw.replace(/<article\b[^>]*\bhidden\b[^>]*>[\s\S]*?<\/article>/g, "")
                     .replace(/<figure\s+aria-hidden="true">[\s\S]*?<\/figure>/g, "");
    while (i < clean.length) {
      const detailsIdx = clean.indexOf("<details", i);
      if (detailsIdx === -1) {
        out += clean.slice(i);
        break;
      }
      out += clean.slice(i, detailsIdx);
      const tagEnd = clean.indexOf(">", detailsIdx);
      const tag = clean.slice(detailsIdx, tagEnd + 1);
      const isOpen = /\bopen\b/.test(tag);
      if (isOpen) {
        out += tag;
        i = tagEnd + 1;
      } else {
        const summaryStart = clean.indexOf("<summary", tagEnd);
        let summaryText = "";
        if (summaryStart !== -1 && summaryStart < clean.indexOf("</details>", tagEnd)) {
          const summaryTagEnd = clean.indexOf(">", summaryStart);
          const summaryEnd = clean.indexOf("</summary>", summaryTagEnd);
          summaryText = clean.slice(summaryTagEnd + 1, summaryEnd);
        }
        out += " " + summaryText + " ";
        let depth = 1;
        let pos = tagEnd + 1;
        while (depth > 0 && pos < clean.length) {
          const nextOpen = clean.indexOf("<details", pos);
          const nextClose = clean.indexOf("</details>", pos);
          if (nextClose === -1) break;
          if (nextOpen !== -1 && nextOpen < nextClose) {
            depth++;
            pos = clean.indexOf(">", nextOpen) + 1;
          } else {
            depth--;
            pos = nextClose + "</details>".length;
          }
        }
        i = pos;
      }
    }
    return out;
  }

  const surfaceChars = stripTags(extractSurface(mainHtml)).length;
  // Previously ~3,450 visible surface chars; now compressed to ~1,600 chars (over 50% reduction and < 25% of totalChars!)
  assert.ok(
    surfaceChars < 1650,
    `expected surface visible chars (${surfaceChars}) to be < 1650 (train-stop glance)`,
  );
  assert.ok(
    surfaceChars < totalChars * 0.35,
    `expected surface visible chars (${surfaceChars}) to be < 35% of total (${totalChars})`,
  );
});
