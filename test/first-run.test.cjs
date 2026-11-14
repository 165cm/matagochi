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
  run(`state = normalizeState(JSON.parse(JSON.stringify(state))); saveState=()=>{};render=()=>{};`);
  assert.equal(run("startTonight(profileDraft())"), false, "and survives a reload");
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

// 2026-11-14 のユーザーの判断（APP_MAP §68）：献立が始まる前の日（作る日でない日・夜遅くに始めた日）にも、今夜の一品を出す。
test("before the first round starts, the today screen still offers tonight's dish, and choosing it does not move the rhythm", () => {
  const run = app("2026-10-03T10:00:00"); // 土曜：平日5日のリズムではお休み → 献立は月曜から
  toResult(run);
  run(`handleDailyAction("life-finish",{})`);
  assert.equal(run("prestartUntil()"), "2026-10-05");
  const pick = JSON.parse(run("JSON.stringify((({recipe, buy}) => ({ id: recipe.id, title: recipe.title, buy }))(prestartPick()))"));
  assert.ok(pick.id, "there is a dish for tonight");
  const html = run("renderToday()");
  assert.ok(html.includes("今夜のおすすめ") && html.includes(pick.title), "the dish is on the today screen");
  assert.ok(html.includes('data-action="life-tonight-pick"') && html.includes("ほかの一皿"), "with これにする and ⇄ ほかの一皿");
  assert.ok(html.includes("いつもの献立は") && html.includes("10月5日") && html.includes("最初の献立を見る"), "and when the usual plan starts");
  // 買い足しの少ない料理から選ぶ（合う料理の中で、少ない順の先頭8品の中）
  const buys = JSON.parse(run("JSON.stringify(allDinnerRecipes().filter((r) => Lifestyle.fit(r, dailyProfile(), today()).ok).map((r) => prestartBuy(r).length).sort((a, b) => a - b))"));
  assert.ok(pick.buy <= buys[7], "one of the dishes that need the least shopping");
  // これからの献立の料理とは重ならない
  const planned = JSON.parse(run("JSON.stringify(dailyPlan().map((d) => d.candidate?.recipe?.id).filter(Boolean))"));
  assert.ok(!planned.includes(pick.id));
  // 日ごとに決まる（同じ日は同じ料理）
  assert.equal(run("prestartPick().recipe.id"), pick.id);
  // これにする → 今夜の一品になる。リズムの始まり・これからの献立は動かない
  const before = run("JSON.stringify([state.rhythm.startFrom, state.rhythm.kickoff || null, currentBlocks().map((b) => b.start)])");
  run(`handleDailyAction("life-tonight-pick",{recipe:${JSON.stringify(pick.id)}})`);
  assert.equal(run("state.mealSlots[today()].status"), "confirmed");
  assert.equal(run("state.mealSlots[today()].recipe.title"), pick.title);
  assert.equal(run("JSON.stringify([state.rhythm.startFrom, state.rhythm.kickoff || null, currentBlocks().map((b) => b.start)])"), before);
  const after = run("renderToday()");
  assert.ok(after.includes("今夜の一品") && after.includes("作り方を見る") && !after.includes("今夜のおすすめ"));
  if (pick.buy) assert.ok(after.includes("買い足す物（目安）"), "what to buy is shown here (it is not in the shopping list)");
  assert.equal(run("prestartPick()"), null, "no second suggestion once tonight is decided");
  // 次の日（日曜）は、別の日として出す
  assert.ok(run("dailyPlan()[1].prestart"), "tomorrow is still before the first round");
});

test("before the first round: a dish chosen in ⇄ ほかの一皿 becomes tonight's suggestion; viewers and unknown dishes change nothing", () => {
  const run = app("2026-10-03T10:00:00");
  toResult(run);
  run(`handleDailyAction("life-finish",{})`);
  const first = run("prestartPick().recipe.id");
  const other = run(`allDinnerRecipes().find((r) => r.id !== ${JSON.stringify(first)} && Lifestyle.fit(r, dailyProfile(), today()).ok).id`);
  run(`handleDailyAction("life-swap",{date: today()}); handleDailyAction("life-choose",{date: today(), recipe: ${JSON.stringify(other)}})`);
  assert.equal(run("prestartPick().recipe.id"), other);
  assert.ok(run("prestartPick().chosen"));
  assert.ok(run("renderToday()").includes("自分で選んだ一皿"));
  // 知らない料理・見るだけの人は決められない
  run(`handleDailyAction("life-tonight-pick",{recipe:"no-such-dish"})`);
  assert.equal(run("state.mealSlots[today()]"), undefined);
  run(`handleDailyAction("life-tonight-pick",{recipe:${JSON.stringify(other)}})`);
  assert.equal(run("state.mealSlots[today()].recipe.id.length > 0"), true);
  assert.equal(run("state.planOverrides[today()]"), undefined, "the chosen-dish note is cleared once decided");
});

test("on a normal day (the plan has started) nothing changes: no prestart suggestion", () => {
  const run = app("2026-10-01T10:00:00");
  toResult(run);
  run(`handleDailyAction("life-start-when",{when:"tonight"}); handleDailyAction("life-finish",{})`);
  assert.equal(run("prestartPick()"), null);
  assert.ok(!run("renderToday()").includes("life-tonight-pick"));
});
