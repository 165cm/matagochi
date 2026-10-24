const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 家族で見ている間の「相手の変更を取りにいく」（shouldPollSync）と、同期の待ち時間。
function app({ visibility = "visible", busy = false } = {}) {
  const body = { classList: { contains: (c) => busy && c === "cook-mode-open" }, append() {} };
  const ctx = vm.createContext({ console, URL, Date, setTimeout, setInterval: () => 0, MATAGOCHI_API_BASE_URL: "https://api.test",
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    location: { reload() {} }, navigator: {}, window: { scrollTo() {} },
    document: { visibilityState: visibility, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ setAttribute() {}, remove() {}, querySelector: () => null }), activeElement: null, body } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  vm.runInContext("state = freshState(); showToast = () => {}", ctx);
  return { run: (s) => vm.runInContext(s, ctx) };
}
const joined = "state.family = ['はな', 'たろう']; state.sync = { code: 'abcdefgh-abcdefgh', roomId: 'room-1', lastSyncAt: '' }";

test("同期の待ちは2秒・取りにいくのは15秒ごと", () => {
  const a = app();
  assert.equal(a.run("SYNC_DEBOUNCE_MS"), 2000);
  assert.equal(a.run("SYNC_POLL_MS"), 15000);
});

test("家族2人以上でつながっていて、画面が見えていれば取りにいく", () => {
  const a = app();
  a.run(joined);
  assert.equal(a.run("shouldPollSync()"), true);
});

test("ひとりのとき・つながっていないとき・裏にいるとき・料理モード中は取りにいかない", () => {
  const solo = app();
  solo.run(joined + "; state.family = ['はな']");
  assert.equal(solo.run("shouldPollSync()"), false);
  const off = app();
  off.run("state.family = ['はな', 'たろう']");
  assert.equal(off.run("shouldPollSync()"), false);
  const hidden = app({ visibility: "hidden" });
  hidden.run(joined);
  assert.equal(hidden.run("shouldPollSync()"), false);
  const cooking = app({ busy: true });
  cooking.run(joined);
  assert.equal(cooking.run("shouldPollSync()"), false);
  const busy = app();
  busy.run(joined + "; syncInFlight = true");
  assert.equal(busy.run("shouldPollSync()"), false);
});
