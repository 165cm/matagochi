const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 使い始めの週の見え方（2026-10-27 のユーザー目線のレビュー）：過去の週の帯・最初の買い物の時間・今日やること・保存の表示。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T10:00:00") { // 木曜・端末の時刻
  const ctx = vm.createContext({ console, URL, Date: fixedDate(now), document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
const startWeekday = (run) => run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date());`);

test("week board: a week before the user started shows no 「決定 ✓」; a week whose days were all made still does", () => {
  const run = app();
  startWeekday(run);
  run("boardWeek = -1");
  assert.ok(!run("renderWeekBoard()").includes("決定"), "nothing was decided that week");
  run(`const r = allDinnerRecipes()[0]; for (const d of ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25"]) state.mealSlots[d] = { date: d, status: "cooked", recipe: r };`);
  assert.ok(run("renderWeekBoard()").includes("決定 ✓"));
  run("boardWeek = 0");
  assert.ok(run("renderWeekBoard()").includes("受付中"), "the current week is unchanged");
});

test("first shopping uses the usual shopping time: today if it is still ahead, otherwise tomorrow — never late at night", () => {
  let run = app("2026-10-01T10:00:00");
  startWeekday(run);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.rhythm.kickoff)")), { start: "2026-10-02", dates: ["2026-10-02"], shopAt: "2026-10-01T17:00" });
  run = app("2026-10-01T23:10:00");
  startWeekday(run);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-02T17:00");
  run = app("2026-10-01T17:00:00");
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "19:00" }); startRhythm(new Date());`);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-01T19:00", "the chosen time is used");
});

test("today's to-dos: only one of the extra questions at a time, and one already started comes first", () => {
  const run = app();
  const html = () => run("renderTodayTodos()");
  const count = (h) => ["スキル試験", "わが家のごはん方針", "好み・常備品まで教えると"].filter((w) => h.includes(w)).length;
  assert.equal(count(html()), 1);
  assert.ok(html().includes("スキル試験"));
  assert.ok(!html().includes("好みとキッチン"), "the kitchen was already asked in the first setup");
  run("state.skillProfile = { level: 2 }");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("わが家のごはん方針"));
  run("state.skillProfile = null; state.onboardingDraft = { step: 1 }");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("好み・常備品まで教えると"), "the detailed setup in progress comes first");
});

test("save status: hidden while used alone on this device, shown once sharing is set up", () => {
  const run = app();
  assert.equal(run("renderSyncSavePanel()"), "");
  run("state.sync.roomId = 'room-1'");
  assert.ok(run("renderSyncSavePanel()").includes("sync-save-panel"));
});
