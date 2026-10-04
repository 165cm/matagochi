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
  guide: [{ text: "下ごしらえ：キャベツを切り、豚こまに塩。", from: [0, 1] }, { text: "焼く：豚こまを2分、キャベツを足して1分炒める。", from: [2, 3] }], guideOf: "72b45ce8" };  // サーバーの stepsKey と同じ値

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

test("review fix (#139): the app's step fingerprint matches the server's; a rewrite for different steps of the same count is not used", () => {
  const run = app();
  assert.equal(run(`stepsKey(${JSON.stringify(item.steps)})`), item.guideOf, "same as api/src/rewrite.js stepsKey");
  const other = { ...item, steps: ["魚を洗う", "魚に塩", "魚を2分焼く", "ねぎを入れて1分煮る"] };
  run(`globalThis.c = discoverRecipe(${JSON.stringify(other)}, "trend")`);
  assert.equal(run("c.guide"), undefined);
  assert.equal(run(`recipeGuide(${JSON.stringify({ ...item, guideOf: undefined })})`), null, "no fingerprint, no rewrite");
});

test("2026-10-04 pilot: a recipe already in the meal plan (a copy without the rewrite) uses the rewrite from the latest list, only while the steps are the same", () => {
  const run = app();
  run(`discover.trends = [${JSON.stringify(item)}]`);
  const copy = { id: "slot-1", title: item.title, videoUrl: item.videoUrl, steps: item.steps, ingredients: item.ingredients };
  assert.equal(run(`recipeGuide(${JSON.stringify(copy)}).length`), 2);
  assert.match(run(`cookSections(${JSON.stringify(copy)}, 2).steps`), /動画では：手順1・2/);
  assert.equal(run(`recipeGuide(${JSON.stringify({ ...copy, steps: [...item.steps.slice(0, 3), "自分で直した手順"] })})`), null, "steps changed → not used");
  assert.equal(run(`recipeGuide(${JSON.stringify({ ...copy, videoUrl: "https://www.youtube.com/watch?v=zzzzzzzzzzz" })})`), null);
});

test("review fix (#141): an old rewrite in the new list does not hide the matching one in the popular list", () => {
  const run = app();
  run(`discover.trends = [${JSON.stringify({ ...item, guideOf: "00000000" })}]; discover.popular = [${JSON.stringify(item)}]`);
  const copy = { id: "slot-1", title: item.title, videoUrl: item.videoUrl, steps: item.steps, ingredients: item.ingredients };
  assert.equal(run(`recipeGuide(${JSON.stringify(copy)}).length`), 2);
});

test("review fix (#141): refetching the same list does not redraw the screen (typing is not lost); a changed rewrite does", async () => {
  const run = app();
  let body = { items: [{ ...item, expiresAt: "2099-01-01T00:00:00Z" }] };
  run("globalThis.renders = 0; render = () => { globalThis.renders += 1 }; state.view = 'plan'");
  run("globalThis.reply = null; fetchWithTimeout = async () => ({ ok: true, json: async () => JSON.parse(globalThis.reply) })");
  const fetchOnce = async (b) => { run(`globalThis.reply = ${JSON.stringify(JSON.stringify(b))}; discover.savedAt = "2020-01-01T00:00:00Z"; discoverTriedAt = 0`); await run("loadDiscover()"); };
  await fetchOnce(body);
  assert.equal(run("renders"), 1, "first time: new items");
  await fetchOnce(body);
  assert.equal(run("renders"), 1, "same items: no redraw");
  body = { items: [{ ...body.items[0], guide: [{ text: "全部まとめて：切って2分焼き、1分炒める。", from: [0, 1, 2, 3] }] }] };
  await fetchOnce(body);
  assert.equal(run("renders"), 2, "a changed rewrite is drawn");
});

test("2026-10-04: a planned recipe outside today's top 120 new recipes still gets its rewrite; a new app version refetches the list at once", async () => {
  const run = app();
  // サーバーは121品以上：書き直しのある料理が121品目（アプリの一覧には残らない）
  const others = Array.from({ length: 120 }, (_, i) => ({ videoId: `other${String(i).padStart(6, "0")}`, title: `料理${i}`, videoUrl: `https://www.youtube.com/watch?v=other${String(i).padStart(6, "0")}`, ingredients: [], steps: ["a", "b"], expiresAt: "2099-01-01T00:00:00Z" }));
  const body = { items: [...others, { ...item, expiresAt: "2099-01-01T00:00:00Z" }] };
  run("render = () => {}; globalThis.calls = 0");
  run(`fetchWithTimeout = async (url) => { if (url.includes('/api/trends')) globalThis.calls += 1; return { ok: true, json: async () => (url.includes('/api/trends') ? ${JSON.stringify(body)} : { items: [] }) }; }`);
  run(`discover.savedAt = new Date().toISOString(); discover.trends = [${JSON.stringify(others[0])}]; discover.appVersion = "old"; discoverTriedAt = 0`);
  await run("loadDiscover()");
  assert.equal(run("calls"), 1, "the list was fresh (savedAt now) but the app version changed → refetched");
  assert.equal(run("discover.trends.length"), 120);
  assert.equal(run(`discover.trends.some((x) => x.videoId === "${item.videoId}")`), false);
  const copy = { id: "slot-1", title: item.title, videoUrl: item.videoUrl, steps: item.steps, ingredients: item.ingredients };
  assert.equal(run(`recipeGuide(${JSON.stringify(copy)}).length`), 2, "the rewrite is kept for all received recipes");
  run("discoverTriedAt = 0");
  await run("loadDiscover()");
  assert.equal(run("calls"), 1, "same version: waits 15 minutes as before");
});
