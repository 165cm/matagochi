const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// PR 4b：採用率のため、新着・みんなの定番の料理を献立の候補に出したら「shown」を送る（同じ料理は1日1回・名前は送らない）。
function app(store = new Map()) {
  const sent = [];
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const fetch = (url, o = {}) => { sent.push({ url, body: o.body ? JSON.parse(o.body) : null }); return Promise.resolve({ ok: true, json: async () => ({}) }); };
  const ctx = vm.createContext({ console, URL, Date, fetch, localStorage, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return { run, sent: () => sent.filter((x) => /popular\/event/.test(x.url)).map((x) => x.body) };
}
const trend = (id) => ({ recipe: { id: `trend-${id}`, title: "x", videoUrl: `https://www.youtube.com/watch?v=${id}`, discover: { kind: "trend" } } });
const plan = (...cands) => JSON.stringify(cands.map((c, i) => ({ date: `2026-10-0${i + 1}`, candidate: c })));

test("PR 4b: a new dish proposed in the plan is reported once a day as 'shown' (video id and taste type only)", () => {
  const store = new Map();
  const a = app(store);
  a.run(`shareShown(${plan(trend("aaaaaaaaaaa"), trend("bbbbbbbbbbb"), trend("aaaaaaaaaaa"), { recipe: { id: "starter-01", title: "x" } })})`);
  const got = a.sent();
  assert.deepEqual(got.map((b) => [b.videoId, b.kind]), [["aaaaaaaaaaa", "shown"], ["bbbbbbbbbbb", "shown"]], "starter dishes and duplicates are not sent");
  assert.deepEqual(Object.keys(got[0]).sort(), ["kind", "segment", "videoId"]);
  a.run(`shareShown(${plan(trend("aaaaaaaaaaa"))})`);
  assert.equal(a.sent().length, 2, "not again the same day");
  // 決めた日（slot）の料理は候補ではない
  a.run(`shareShown([{ date: "2026-10-05", slot: { status: "confirmed" }, candidate: ${JSON.stringify(trend("ccccccccccc"))} }])`);
  assert.equal(a.sent().length, 2);
});

test("PR 4b: nothing is sent when sharing stats is off or for someone only viewing the family's plan; the plan view reports its candidates", () => {
  const off = app(new Map([["ripigochi-share-stats", "off"]]));
  off.run(`shareShown(${plan(trend("aaaaaaaaaaa"))})`);
  assert.equal(off.sent().length, 0);
  const viewer = app();
  viewer.run(`isViewer = () => true; shareShown(${plan(trend("aaaaaaaaaaa"))})`);
  assert.equal(viewer.sent().length, 0);
  const a = app();
  a.run("calls = []; shareShown = (p) => calls.push(p.length); renderDailyPlan();");
  assert.equal(a.run("calls.length"), 1);
});
