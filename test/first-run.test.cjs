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
const toResult = (run) => run(`handleDailyAction("life-quick",{}); handleDailyAction("life-servings",{count:"2"}); for (let i = 0; i < 6; i++) handleDailyAction("life-quick-next",{});`);

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
  // Codex review #252：始まる前の日は、レシピの棚からは今夜に入れられないので、その入口は出さない
  run(`handleDailyAction("life-swap",{date: today()})`);
  assert.ok(!run("renderSwapChoices()").includes("life-swap-shelf"), "no shelf link before the first round");
  run(`handleDailyAction("life-close-swap",{})`);
  run(`handleDailyAction("life-swap",{date: today()}); handleDailyAction("life-choose",{date: today(), recipe: ${JSON.stringify(other)}})`);
  assert.equal(run("prestartPick().recipe.id"), other);
  assert.ok(run("prestartPick().chosen"));
  // Codex review #242：始まる前の日は献立タブに出ないので、選んだ後・閉じた後は今日タブへ戻す（選んだ一皿と「これにする」が続けて見える）
  assert.equal(run("state.view"), "today", "back on the today screen after choosing");
  run(`handleDailyAction("life-swap",{date: today()})`);
  assert.equal(run("state.view"), "plan");
  run(`handleDailyAction("life-close-swap",{})`);
  assert.equal(run("state.view"), "today", "and after closing without choosing");
  // ふつうの日（献立が始まった後の日）の入れ替えは、今までどおり献立タブのまま
  const later = run("prestartUntil()");
  run(`handleDailyAction("life-swap",{date: ${JSON.stringify(later)}}); handleDailyAction("life-close-swap",{})`);
  assert.equal(run("state.view"), "plan");
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

// 最初の献立の精度（2026-11-15。APP_MAP §71）：夜ごはんの形・好みに寄せるボタン・全部の日に理由。
const finishWith = (run, shape) => run(`handleDailyAction("life-quick",{}); handleDailyAction("life-servings",{count:"2"}); for (let i = 0; i < 3; i++) handleDailyAction("life-quick-next",{}); ${shape ? `handleDailyAction("life-shape",{value:"${shape}"})` : `handleDailyAction("life-quick-next",{})`}; for (let i = 0; i < 2; i++) handleDailyAction("life-quick-next",{}); handleDailyAction("life-finish",{})`);
const planStats = (run) => JSON.parse(run(`JSON.stringify(dailyPlan().filter((d) => d.candidate).map((d) => ({ ...Lifestyle.traits(d.candidate.recipe), reason: planReason(d), badge: planBadge(d), id: d.candidate.recipe.id })))`));

test("the usual shape of dinner steers the first plan: おかず＋ごはん → mostly main dishes, 丼・麺 → mostly one-dish meals", () => {
  const okazu = app("2026-11-16T10:00:00");
  finishWith(okazu, "okazu");
  const one = app("2026-11-16T10:00:00");
  finishWith(one, "onedish");
  const a = planStats(okazu), b = planStats(one);
  assert.ok(a.length >= 5 && b.length >= 5);
  const mains = (xs) => xs.filter((x) => x.staple === "other").length;
  assert.ok(mains(a) > mains(b) + 2, `okazu ${mains(a)} vs onedish ${mains(b)}`);
  assert.ok(mains(a) / a.length >= 0.7);
  assert.ok(mains(b) / b.length <= 0.4);
  // 形は条件ではない：選ばなくても献立はできる（スキップ）
  const skip = app("2026-11-16T10:00:00");
  finishWith(skip, "");
  assert.equal(skip("state.foodProfile.mealShape"), undefined);
  assert.ok(planStats(skip).length >= 5);
});

test("every planned day carries a one-line reason, and the photo badge is never empty", () => {
  const run = app("2026-11-16T10:00:00");
  finishWith(run, "mix");
  const days = planStats(run);
  assert.ok(days.length >= 5);
  for (const d of days) {
    assert.ok(d.reason, `reason for ${d.id}`);
    assert.ok(d.badge && Array.from(d.badge).length <= 12, `badge for ${d.id}: ${d.badge}`);
  }
  assert.equal(run(`Lifestyle.hintOf(Lifestyle.starters.find((r) => r.planning.minutes <= 10), Lifestyle.profile({}))`).includes("分で作れる"), true);
});

test("first-plan tune buttons: a tap remembers the lean and re-plans only undecided days, on the spot; a second tap undoes it", () => {
  const run = app("2026-11-16T10:00:00");
  finishWith(run, "mix");
  assert.equal(run("firstPlanReveal"), true);
  // 招待の案内は、決める前は出さない（決定直後のまとめの中で。APP_MAP §77）
  assert.ok(!run("renderDailyPlan()").includes("life-share-open"), "no invite before deciding");
  // 好みに寄せるボタンは、お祝いの中ではなく、決定ボタンの下の「ちょっと違う？」に（最初は開いている。docs/UX_REDESIGN.md）
  assert.ok(!run("renderFirstPlanReveal()").includes("life-plan-tune"), "the welcome no longer pushes the menu down");
  const html = run("renderDailyPlan()");
  assert.ok(html.includes('<details class="plan-tune-fold" open>'), "open on the first plan");
  assert.ok(html.indexOf("plan-tune-fold") > html.indexOf('data-action="life-confirm"'), "under the decide button");
  for (const t of ["魚を増やして", "もっと手軽に", "丼・麺も入れて", "おかず＋ごはんを多めに"]) assert.ok(html.includes(t), t);
  // 1日だけ決めておく（決めた日は変えない）
  run(`const d0 = dailyPlan().find((d) => d.candidate); state.mealSlots[d0.date] = { date: d0.date, status: "confirmed", recipe: d0.candidate.recipe, servings: 2 }; globalThis.__d0 = d0.date; globalThis.__r0 = d0.candidate.recipe.id;`);
  const fish = (xs) => xs.filter((x) => x.protein === "fish").length;
  const before = fish(planStats(run));
  run(`handleDailyAction("life-plan-tune",{tune:"fish"})`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.foodProfile.planLean)")), ["fish"]);
  assert.ok(fish(planStats(run)) > before, "more fish");
  assert.equal(run("state.mealSlots[__d0].recipe.id === __r0"), true, "a decided day stays");
  assert.equal(run("firstPlanReveal"), true, "the welcome stays open to press another");
  assert.ok(run(`renderDailyPlan()`).includes('data-tune="fish" aria-pressed="true"'));
  assert.ok(planStats(run).some((d) => d.badge === "🐟 魚を増やした日" || /魚/.test(d.reason)));
  // 自分で選んだ料理の本体が下書きにしかない日も、そのまま（Codex review #246）
  run(`const d1 = dailyPlan().find((d) => d.candidate && d.date !== __d0); const own = { ...clone(d1.candidate.recipe), id: "trend-gone", title: "消えた新着の料理", curated: false }; state.planDrafts[d1.date] = own; state.planOverrides[d1.date] = own.id; globalThis.__d1 = d1.date;`);
  assert.equal(run("dailyPlan().find((d) => d.date === __d1).candidate?.recipe.id"), "trend-gone");
  run(`handleDailyAction("life-plan-tune",{tune:"light"}); handleDailyAction("life-plan-tune",{tune:"light"})`);
  assert.equal(run("dailyPlan().find((d) => d.date === __d1).candidate?.recipe.id"), "trend-gone", "a hand-picked day keeps its dish");
  // 肉を押すと魚は外れる（どちらか一方）
  run(`handleDailyAction("life-plan-tune",{tune:"meat"})`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.foodProfile.planLean)")), ["meat"]);
  run(`handleDailyAction("life-plan-tune",{tune:"meat"})`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.foodProfile.planLean)")), []);
  // 形のボタン：押す → その形・もう一度 → どちらも
  run(`handleDailyAction("life-plan-tune",{tune:"onedish"})`);
  assert.equal(run("state.foodProfile.mealShape"), "onedish");
  run(`handleDailyAction("life-plan-tune",{tune:"onedish"})`);
  assert.equal(run("state.foodProfile.mealShape"), "mix");
  // 好みは保存しても残る
  run(`handleDailyAction("life-plan-tune",{tune:"quick"}); state = normalizeState(JSON.parse(JSON.stringify(state))); saveState=()=>{};render=()=>{};`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(Lifestyle.profile(state.foodProfile).planLean)")), ["quick"]);
  // ほかの操作をしたら、お祝いのカードは閉じる
  run(`handleDailyAction("life-reveal-close",{})`);
  assert.equal(run("firstPlanReveal"), false);
});

// 常備品は会話風に（2026-11-15。APP_MAP §72）
test("before the first shopping, yohaku asks about pantry items once: tap only what is missing; the rest are remembered as on hand", () => {
  const run = app("2026-11-16T10:00:00");
  finishWith(run, "mix");
  run(`for (const d of dailyPlan().filter((d) => d.candidate)) state.mealSlots[d.date] = { date: d.date, status: "confirmed", recipe: d.candidate.recipe, servings: 2 }`);
  const ask = JSON.parse(run("JSON.stringify(pantryAskItems(shopPageItems()).map((i) => [i.id, i.name]))"));
  assert.ok(ask.length >= 5, "seasonings and dry goods are asked");
  assert.ok(ask.every(([, n]) => !/レモン|キャベツ|肉|もやし/.test(n)), "fresh food is not asked");
  assert.ok(run("renderPantryAsk(shopPageItems())").includes("買う前に、ちょっとだけ"));
  const [missId, missName] = ask[0];
  run(`handleDailyAction("life-pantry-ask",{id:${JSON.stringify(missId)}})`);
  assert.ok(run("renderPantryAsk(shopPageItems())").includes("これでOK（1品を買う）"));
  run(`handleDailyAction("life-pantry-ask-done",{})`);
  const items = JSON.parse(run("JSON.stringify(Object.fromEntries(shopPageItems().map((i) => [i.id, i.status])))"));
  assert.equal(items[missId], "buy", "the missing one stays on the list");
  assert.ok(ask.slice(1).every(([id]) => items[id] === "have"), "the rest move to 家にある");
  assert.equal(run(`dailyProfile().pantry[${JSON.stringify(missName)}]`), "none");
  assert.equal(run(`dailyProfile().pantry[${JSON.stringify(ask[1][1])}]`), "have", "remembered as a pantry item");
  assert.equal(run("pantryAskItems(shopPageItems()).length"), 0, "not asked again");
  assert.equal(run("renderPantryAsk(shopPageItems())"), "");
  // 元に戻す
  run(`handleDailyAction("life-shop-undo",{})`);
  const back = JSON.parse(run("JSON.stringify(Object.fromEntries(shopPageItems().map((i) => [i.id, i.status])))"));
  assert.ok(ask.every(([id]) => back[id] === "buy"), "undo puts them back on the list");
  assert.ok(ask.every(([id]) => run(`state.shoppingMarks[${JSON.stringify(id)}]?.status`) === "buy"), "with a fresh 買う mark, so a sync cannot bring 家にある back (Codex review #247)");
  assert.equal(run(`dailyProfile().pantry[${JSON.stringify(ask[1][1])}]`), "unknown", "and the pantry is undone");
});

test("pantry ask: あとで hides it until the app is opened again", () => {
  const run = app("2026-11-16T10:00:00");
  finishWith(run, "mix");
  run(`for (const d of dailyPlan().filter((d) => d.candidate)) state.mealSlots[d.date] = { date: d.date, status: "confirmed", recipe: d.candidate.recipe, servings: 2 }`);
  assert.ok(run("renderPantryAsk(shopPageItems())").length > 0);
  run(`handleDailyAction("life-pantry-ask-later",{})`);
  assert.equal(run("renderPantryAsk(shopPageItems())"), "");
});

// 🧾 今週のレシート（2026-11-15。APP_MAP §73）
test("the weekly receipt counts this device's records: decided, cooked, reused food, loved dishes, new cards, and what changes next week", () => {
  const run = app("2026-11-21T10:00:00"); // 土曜：今週（11/16〜11/21）
  assert.equal(run("weekReceipt()"), null, "nothing decided or cooked: no receipt");
  assert.deepEqual(JSON.parse(run("JSON.stringify(receiptWeek())")), { start: "2026-11-16", end: "2026-11-21", label: "今週" });
  assert.deepEqual(JSON.parse(run(`JSON.stringify(receiptWeek("2026-11-18"))`)), { start: "2026-11-09", end: "2026-11-15", label: "先週" }, "Mon–Thu shows last week");
  run(`
    const withCabbage = Lifestyle.starters.filter((r) => r.ingredients.some((i) => /キャベツ/.test(i.name))).slice(0, 2);
    const other = Lifestyle.starters.filter((r) => !withCabbage.includes(r)).slice(0, 2);
    const plan = [...withCabbage, ...other];
    ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"].forEach((d, k) => { state.mealSlots[d] = { date: d, status: k < 3 ? "cooked" : "confirmed", recipe: plan[k], servings: 2 }; });
    state.mealSlots["2026-11-09"] = { date: "2026-11-09", status: "cooked", recipe: plan[3], servings: 2 };
    const ev = (r, d, c) => state.evaluations.push({ id: "e-" + d, recipeId: r.id, recipeTitle: r.title, cookedAt: d, mealType: "dinner", familyRepeatCycles: { 自分: c } });
    ev(plan[0], "2026-11-16", "weekly"); ev(plan[1], "2026-11-17", "never"); ev(plan[2], "2026-11-18", "monthly"); ev(plan[2], "2026-11-10", "monthly");
    globalThis.__plan = plan;
  `);
  const r = JSON.parse(run("JSON.stringify(weekReceipt())"));
  assert.equal(r.decided, 4);
  assert.equal(r.cooked, 3);
  assert.ok(r.reused.includes("キャベツ"), r.reused.join(","));
  assert.deepEqual(r.loved, [run("__plan[0].title")]);
  assert.deepEqual(r.never, [run("__plan[1].title")]);
  assert.equal(r.newCards.length, 2, "a card already made last week is not new");
  const html = run("renderWeekReceipt()");
  for (const t of ["今週のリピごち", "11月16日〜11月21日", "決めた夜ごはん", "4食", "使い回した食材", "また食べたい", "図鑑に入った", "来週は", "もう出しません"]) assert.ok(html.includes(t), t);
  assert.ok(run("renderReflection()").includes("week-receipt"), "on top of the reflection tab");
  // 週の途中で「もう作らない」→「毎週」に変えたら、最新の答えだけ（Codex review #248）
  run(`state.evaluations.push({ id: "e-2026-11-20", recipeId: __plan[1].id, recipeTitle: __plan[1].title, cookedAt: "2026-11-20", mealType: "dinner", familyRepeatCycles: { 自分: "weekly" } })`);
  const r2 = JSON.parse(run("JSON.stringify(weekReceipt())"));
  assert.deepEqual(r2.never, []);
  assert.ok(r2.loved.includes(run("__plan[1].title")));
});
