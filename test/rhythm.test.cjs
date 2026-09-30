const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 献立のリズム（PR 5a・docs/PERSONALIZE_PLAN.md §9）：3日／3日＋3日／5日・週の始まり・作る曜日・買い物の日。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T03:00:00Z") { // 木曜
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
const J = (run, code) => JSON.parse(run(`JSON.stringify(${code})`));
const blocks = (run) => J(run, "blocksFrom(today(), 14).map((b) => ({ dates: b.dates, shopAt: b.shopAt }))");

test("PR 5a: rhythms saved before this version keep exactly the same days (Monday start), and normalizing adds nothing", () => {
  const run = app();
  for (const [preset, want] of [["weekday", [[1, 2, 3, 4, 5]]], ["3day", [[1, 2, 3], [4, 5, 6]]], ["week", [[1, 2, 3, 4, 5, 6]]]]) {
    run(`state.rhythm = normalizeRhythm({ preset: ${JSON.stringify(preset)}, shopTime: "17:00", updatedAt: "2026-09-01T00:00:00Z" })`);
    assert.deepEqual(J(run, "rhythmBlocks()"), want);
    assert.deepEqual(Object.keys(J(run, "state.rhythm")).sort(), ["dismissed", "preset", "shopTime", "startFrom", "updatedAt"]);
    assert.deepEqual(J(run, "normalizeRhythm(JSON.parse(JSON.stringify(state.rhythm)))"), J(run, "state.rhythm"));
  }
  run(`state.rhythm = normalizeRhythm({ preset: "3day" })`);
  assert.deepEqual(blocks(run).slice(0, 2), [
    { dates: ["2026-10-01", "2026-10-02", "2026-10-03"], shopAt: "2026-09-30T17:00" },
    { dates: ["2026-10-05", "2026-10-06", "2026-10-07"], shopAt: "2026-10-04T17:00" },
  ]);
});

test("PR 5a: 3 days / 3+3 / 5 days with a chosen start weekday, blocks may cross the week, and the shopping day can be the first day", () => {
  const run = app();
  run(`handleDailyAction("life-rhythm", { preset: "three" })`);
  assert.deepEqual(J(run, "rhythmBlocks()"), [[1, 2, 3]], "3日：月火水（週1回の買い物）");
  run(`handleDailyAction("life-rhythm-start", { day: "3" })`);
  assert.deepEqual(J(run, "rhythmBlocks()"), [[3, 4, 5]]);
  // 最初は「今週の残り」の回（明日・金曜の1日だけ、既存の動き）。そのあとが水木金の回
  assert.deepEqual(blocks(run).find((b) => b.dates[0] === "2026-10-07"), { dates: ["2026-10-07", "2026-10-08", "2026-10-09"], shopAt: "2026-10-06T17:00" });
  // 3日＋3日を土曜はじまりに：土日月／火水木（週をまたぐ）。金曜はお休み
  run(`handleDailyAction("life-rhythm", { preset: "3day" }); handleDailyAction("life-rhythm-start", { day: "6" })`);
  assert.deepEqual(J(run, "rhythmBlocks()"), [[6, 0, 1], [2, 3, 4]]);
  assert.deepEqual(blocks(run).find((b) => b.dates[0] === "2026-10-03").dates, ["2026-10-03", "2026-10-04", "2026-10-05"]);
  assert.deepEqual(J(run, "rhythmDays()").sort(), ["0", "1", "2", "3", "4", "6"]);
  // 週の始まりを変えても、選んだ形（3日＋3日）はそのまま
  assert.equal(run("state.rhythm.preset"), "3day");
  // 買い物は初日に
  run(`handleDailyAction("life-rhythm-shopday", { before: "0" })`);
  assert.equal(blocks(run).find((b) => b.dates[0] === "2026-10-03").shopAt, "2026-10-03T17:00");
  assert.deepEqual(J(run, "rhythmBlocks()"), [[6, 0, 1], [2, 3, 4]], "the days stay");
  assert.equal(J(run, "rhythmReminder().days").join(), "6,2", "the reminder follows the shopping day");
  run(`handleDailyAction("life-rhythm-shopday", { before: "1" })`);
  assert.equal(J(run, "rhythmReminder().days").join(), "5,1");
});

test("PR 5a: cooking days can skip a weekday; the choice is saved only when the count matches", () => {
  const run = app();
  run(`handleDailyAction("life-rhythm", { preset: "weekday" })`);
  run(`handleDailyAction("life-rhythm-day", { day: "3" })`); // 水を外す → 4日
  assert.deepEqual(J(run, "rhythmBlocks()"), [[1, 2, 3, 4, 5]], "not saved with 4 days");
  assert.match(run("renderRhythmSettings()"), /あと1日/);
  run(`handleDailyAction("life-rhythm-day", { day: "6" })`); // 土を足す → 5日
  assert.deepEqual(J(run, "rhythmBlocks()"), [[1, 2, 4, 5, 6]]);
  assert.deepEqual(blocks(run).find((b) => b.dates[0] === "2026-10-05").dates, ["2026-10-05", "2026-10-06", "2026-10-08", "2026-10-09", "2026-10-10"]);
  assert.equal(J(run, "rhythmDays()").includes("3"), false, "Wednesday is a day off");
  // 同期で届いても同じ（形の違う曜日は使わない）
  assert.deepEqual(J(run, "normalizeRhythm(JSON.parse(JSON.stringify(state.rhythm))).days"), [1, 2, 4, 5, 6]);
  for (const days of [[1, 2, 3], [1, 1, 2, 3, 4], [1, 2, 3, 4, 7], ["a", 1, 2, 3, 4]]) assert.equal(J(run, `normalizeRhythm({ preset: "weekday", days: ${JSON.stringify(days)} })`).days, undefined);
  assert.deepEqual(J(run, `rhythmBlocks(normalizeRhythm({ preset: "weekday", days: [1, 2, 3] }))`), [[1, 2, 3, 4, 5]], "a broken choice falls back to the usual days");
});

test("PR 5a: the menu plans only the chosen cooking days, and the settings screen shows the shape", () => {
  const run = app();
  run(`handleDailyAction("life-rhythm", { preset: "three" }); handleDailyAction("life-rhythm-start", { day: "5" })`); // 金土日
  const plan = J(run, "dailyPlan().slice(0, 10).map((d) => ({ date: d.date, off: !!d.off, prestart: !!d.prestart, has: !!d.candidate }))");
  const cook = plan.filter((d) => !d.off && !d.prestart && d.has).map((d) => new Date(d.date + "T12:00:00Z").getUTCDay());
  assert.ok(cook.length > 0);
  assert.ok(cook.every((w) => [5, 6, 0].includes(w)), `only Fri/Sat/Sun: ${cook}`);
  const html = run("renderRhythmSettings()");
  assert.match(html, /金土日・週1回の買い物/);
  assert.match(html, /data-action="life-rhythm-start" data-day="5" aria-pressed="true"/);
});
