const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 2026-10-04：ホーム画面のアプリ（iPhone）が古い版のままにならないように、開いた時・戻った時に version.json と比べて読み込み直す。
function app({ version, busy = false, store = {}, brokenSession = false }) {
  const reloads = [];
  const body = { classList: { contains: (c) => busy && c === "cook-mode-open" }, append() {} };
  const ctx = vm.createContext({ console, URL, Date, setTimeout, MATAGOCHI_API_BASE_URL: "https://api.test",
    fetch: async (url) => (String(url).includes("version.json") ? { ok: true, json: async () => ({ version }) } : { ok: true, json: async () => ({}) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { if (brokenSession) throw new Error("SecurityError"); store[k] = v; } },
    location: { reload: () => reloads.push(1) },
    navigator: {},
    window: { scrollTo() {} },
    document: { querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, remove() {}, querySelector: () => ({ addEventListener: (t, f) => { ctx.clickUpdate = f; } }) }), activeElement: null, body } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  vm.runInContext("state = freshState(); showToast = () => {}", ctx);
  return { run: (s) => vm.runInContext(s, ctx), reloads, store };
}

test("a new version on the server reloads the app once; the same version does nothing", async () => {
  const current = fs.readFileSync(path.join(__dirname, "..", "version.json"), "utf8");
  const same = app({ version: JSON.parse(current).version });
  assert.equal(await same.run("checkAppUpdate({ now: 1e12 })"), "same");
  assert.equal(same.reloads.length, 0);
  const next = app({ version: "29991231-next" });
  assert.equal(await next.run("checkAppUpdate({ now: 1e12 })"), "reload");
  assert.equal(next.reloads.length, 1);
  // 読み込み直しても古い画面のままだった時は、くり返さずに帯で知らせる
  const again = app({ version: "29991231-next", store: next.store });
  assert.equal(await again.run("checkAppUpdate({ now: 1e12 })"), "bar");
  assert.equal(again.reloads.length, 0);
  // 1分の間は確かめ直さない
  assert.equal(await again.run("checkAppUpdate({ now: 1e12 + 30_000 })"), "skip");
});

test("while cooking mode is open (or typing), the app does not reload and waits to show the bar", async () => {
  const a = app({ version: "29991231-next", busy: true });
  assert.equal(await a.run("checkAppUpdate({ now: 1e12 })"), "later");
  assert.equal(a.reloads.length, 0);
});

test("review fix (#143): unsaved drafts in memory (record edit, dinner-type quiz, time fixing, recipe registration) are never reloaded away", async () => {
  for (const setup of ["recordDraft = { date: '2026-10-04' }", "talkTypeDraft = { step: 2 }", "timeFix = { key: 'x', times: [] }", "state.view = 'register'"]) {
    const a = app({ version: "29991231-next" });
    a.run(setup);
    assert.equal(await a.run("checkAppUpdate({ now: 1e12 })"), "later", setup);
    assert.equal(a.reloads.length, 0, setup);
  }
});

test("review fix (#143): after the user has touched the app, it only shows the bar (no automatic reload)", async () => {
  const a = app({ version: "29991231-next" });
  a.run("appTouched = true");
  assert.equal(await a.run("checkAppUpdate({ now: 1e12 })"), "bar");
  assert.equal(a.reloads.length, 0);
});

test("review fix (#143): when the reload mark cannot be saved (sessionStorage blocked), the app shows the bar instead of reloading again and again", async () => {
  const a = app({ version: "29991231-next", brokenSession: true });
  assert.equal(await a.run("checkAppUpdate({ now: 1e12 })"), "bar");
  assert.equal(a.reloads.length, 0);
});

test("version.json, app.js, sw.js and index.html carry the same version", () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  const v = JSON.parse(read("version.json")).version;
  assert.match(read("app.js"), new RegExp(`const APP_VERSION = "${v}"`));
  assert.match(read("sw.js"), new RegExp(`const APP_VERSION = "${v}"`));
  assert.match(read("index.html"), new RegExp(`\\?v=${v}`));
  assert.match(read("sw.js"), /version\.json"\)\) return/, "the service worker never caches version.json");
  assert.match(read("sw.js"), /cache: "no-store"/, "page loads skip the browser cache");
});

test("review fix (#143): pressing the bar while a draft is open does not reload (the draft is kept)", async () => {
  const a = app({ version: "29991231-next" });
  a.run("showUpdateBar(); recordDraft = { date: '2026-10-04' }; clickUpdate()");
  assert.equal(a.reloads.length, 0);
  a.run("recordDraft = null; showUpdateBar(); clickUpdate()");
  assert.equal(a.reloads.length, 1);
});
