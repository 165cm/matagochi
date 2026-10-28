const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 初回体験の見直し（2026-10-28 のユーザーの判断）：少ない質問で献立を出す・「今夜から／明日から」を選べる。
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
  run("state=freshState();saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
// 初回設定を最後の確認の画面まで進める（平日5日のリズム）。
const toResult = (run) => run(`handleDailyAction("life-quick",{}); handleDailyAction("life-servings",{count:"2"}); for (let i = 0; i < 5; i++) handleDailyAction("life-quick-next",{});`);

test("the first-run start: before 17:00 the default is tonight, later it is tomorrow; not on a day off or late at night", () => {
  let run = app("2026-10-01T10:00:00");
  toResult(run);
  assert.equal(run("FUNNEL[state.onboardingDraft.quickSetupIndex]"), "result");
  assert.equal(run("startTonight(state.onboardingDraft)"), true);
  const html = run("renderFunnelStep('result')[1]");
  assert.ok(html.includes("いつから始める？") && html.includes("今夜から") && html.includes("明日から"));
  run(`handleDailyAction("life-start-when",{when:"tomorrow"})`);
  assert.equal(run("startTonight(state.onboardingDraft)"), false, "the person's choice wins");
  run = app("2026-10-01T18:00:00");
  toResult(run);
  assert.equal(run("startTonight(state.onboardingDraft)"), false, "after 17:00 the default is tomorrow");
  run(`handleDailyAction("life-start-when",{when:"tonight"})`);
  assert.equal(run("startTonight(state.onboardingDraft)"), true, "but tonight can still be chosen");
  run = app("2026-10-01T21:30:00");
  toResult(run);
  assert.equal(run("canStartTonight()"), false, "too late for tonight");
  assert.ok(!run("renderFunnelStep('result')[1]").includes("いつから始める？"));
  run = app("2026-10-03T10:00:00"); // 土曜：平日5日のリズムではお休み
  toResult(run);
  assert.equal(run("canStartTonight()"), false, "today is not a cooking day");
});

test("starting tonight makes today the first day of the first round, with shopping about an hour later", () => {
  let run = app("2026-10-01T10:20:00");
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date(), { tonight: true });`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.rhythm.kickoff)")), { start: "2026-10-01", dates: ["2026-10-01", "2026-10-02"], shopAt: "2026-10-01T11:30" });
  assert.equal(run("prestartUntil()"), "", "no 「献立は◯日から」 today");
  // 明日から（今までどおり）
  run = app("2026-10-01T10:20:00");
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date(), { tonight: false });`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.rhythm.kickoff)")), { start: "2026-10-02", dates: ["2026-10-02"], shopAt: "2026-10-01T17:00" });
  // ちょうど :00 は切り上げない
  run = app("2026-10-01T10:00:00");
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date(), { tonight: true });`);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-01T11:00");
});

test("finishing the first run with 「今夜から」 puts tonight's dish on the today screen", () => {
  const run = app("2026-10-01T10:00:00");
  toResult(run);
  run(`handleDailyAction("life-start-when",{when:"tonight"}); handleDailyAction("life-finish",{})`);
  assert.equal(run("state.onboarded"), true);
  const today = run("JSON.stringify(dailyPlan().find((d) => d.date === '2026-10-01'))");
  const day = JSON.parse(today);
  assert.ok(day && !day.prestart && !day.off, "today is a planned day");
  assert.ok(day.candidate?.recipe || day.slot, "with a dish");
  assert.ok(!run("renderToday()").includes("献立は"), "not 「献立は◯日から」");
  // 明日からを選んだ時は、今までどおり明日から
  const r2 = app("2026-10-01T10:00:00");
  toResult(r2);
  r2(`handleDailyAction("life-start-when",{when:"tomorrow"}); handleDailyAction("life-finish",{})`);
  assert.equal(r2("prestartUntil()"), "2026-10-02");
});

test("starting the rhythm again (another rhythm, or tonight after tomorrow) does not mistake the old first round for a full one", () => {
  const run = app("2026-10-28T10:30:00"); // 水曜
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date());`);
  const once = run("JSON.stringify(state.rhythm.kickoff)");
  assert.deepEqual(JSON.parse(once).dates, ["2026-10-29", "2026-10-30"]);
  run(`startRhythm(new Date());`);
  assert.equal(run("JSON.stringify(state.rhythm.kickoff)"), once, "the same twice");
  run(`startRhythm(new Date(), { tonight: true });`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.rhythm.kickoff)")).dates, ["2026-10-28", "2026-10-29", "2026-10-30"], "tonight to Friday");
});
