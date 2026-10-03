const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 2026-10-04：覚えやすく書き直した手順（AI。APP_MAP §49）を表に、元の手順は各手順の下の「動画では」に。
function app() {
  const ctx = vm.createContext({ console, URL, Date, fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{}");
  run("globalThis.cm=null;const _set=CookMode.setRecipe;CookMode.setRecipe=(x)=>{globalThis.cm=x;return _set(x)}");
  return run;
}
const item = { videoId: "abcdefghijk", title: "豚キャベツ", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", ingredients: [{ name: "豚こま", amount: "200g" }, { name: "キャベツ", amount: "1/4個" }],
  steps: ["キャベツを切る", "豚こまに塩", "豚こまを2分焼く", "キャベツを入れて1分炒める"], stepTimes: [5, 20, 40, 90],
  guide: [{ text: "下ごしらえ：キャベツを切り、豚こまに塩。", from: [0, 1] }, { text: "焼く：豚こまを2分、キャベツを足して1分炒める。", from: [2, 3] }] };

test("the rewritten steps are the main list; the original steps sit under each one as 「動画では：手順1・2」; ▶ is the first original step's time", () => {
  const run = app();
  run(`globalThis.r = discoverRecipe(${JSON.stringify(item)}, "trend")`);
  assert.equal(run("r.guide.length"), 2);
  const html = run("cookSections(r, 2).steps");
  assert.match(html, /has-guide/);
  assert.match(html, /覚えやすい手順/);
  assert.match(html, /<b class="guide-key">下ごしらえ<\/b>キャベツを切り、豚こまに塩。/, "the key word is bold");
  assert.match(html, /動画では：手順1・2/);
  assert.match(html, /動画では：手順3・4/);
  assert.match(html, /data-guide-slot="2"[^>]*><button[^>]*data-seconds="40"/, "▶ of the 2nd step = time of original step 3");
  assert.match(html, /<li value="4">.*キャベツを入れて1分炒める/);
  assert.equal((html.match(/data-step-slot=/g) || []).length, 4, "every original step keeps its own ▶ / 📍 slot");
  // 料理モードも書き直した手順で、時刻はまとめた最初の元の手順
  assert.deepEqual(JSON.parse(run("JSON.stringify(cm.steps)")), item.guide.map((g) => g.text));
  assert.deepEqual(JSON.parse(run("JSON.stringify(cm.timesOf())")), [5, 40]);
});

test("without a rewrite (or with one that does not match the steps) the original steps are shown as before", () => {
  const run = app();
  run(`globalThis.a = discoverRecipe(${JSON.stringify({ ...item, guide: undefined })}, "trend")`);
  run(`globalThis.b = discoverRecipe(${JSON.stringify({ ...item, guide: [{ text: "x", from: [0, 9] }] })}, "trend")`);
  assert.equal(run("a.guide"), undefined); assert.equal(run("b.guide"), undefined);
  const html = run("cookSections(b, 2).steps");
  assert.doesNotMatch(html, /has-guide|動画では/);
  assert.match(html, /data-step-slot="3".*キャベツを入れて/);
  assert.deepEqual(JSON.parse(run("JSON.stringify(cm.timesOf())")), [5, 20, 40, 90]);
  // 保存済みのレシピでも、手順の数が変わった書き直しは使わない
  assert.equal(run(`recipeGuide({ steps: ["a"], guide: ${JSON.stringify(item.guide)} })`), null);
});
