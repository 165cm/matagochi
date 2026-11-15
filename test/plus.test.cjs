const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const fullSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
function app(extra = {}) {
  const context = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] }, ...extra });
  for (const file of ['dinner-persona.js','taste.js','taste-ui.js','starter-recipes.js','skills.js','aisles.js','lifestyle.js','profile-talk.js','talk-ui.js','daily-ui.js','playlist-import.js','household.js','skill-quiz.js','cook-level.js','weekly.js','cook-type.js','plan-moves.js','plus.js','cook-mode.js','folders.js','install.js','push.js','tickets.js','account.js','discover.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}
// 無料期間が終わった家（使い始めは60日前）で、7日の献立を出す。
function setup(run, { trial = false } = {}) {
  run(`state = clone(demoState); state.onboarded = true; state.foodProfile = Lifestyle.profile({ servings: 2, completed: true, completedAt: today() });
    state.planLength = 7; state.mealSlots = {}; state.planOverrides = {}; state.freePicks = {}; state.plus = null;
    state.trialFrom = ${trial ? 'today()' : 'addDays(today(), -60)'}; gatingOverride = true;
    showToast = () => {}; saveState = () => {}; render = () => {};`);
}
const cookable = (run) => JSON.parse(run('JSON.stringify(dailyPlan().filter((d) => !d.off && !d.prestart && d.candidate).map((d) => d.date))'));
const weekOf = (run, d) => run(`weekStartOf("${d}")`);

// 2026-11-15 の作り直し（APP_MAP §74）：無料＝毎日「今夜の1品」。明日から先をまとめて決めるのがプラス。
test('during the trial nothing is locked; after it, only tonight stays free — every later day is locked', () => {
  const run = app();
  setup(run, { trial: true });
  assert.equal(run('lockedDates().size'), 0, 'trial');
  setup(run);
  const days = cookable(run);
  const locked = JSON.parse(run('JSON.stringify([...lockedDates()])'));
  assert.ok(locked.length > 0);
  assert.ok(!locked.includes(run('today()')), 'tonight is never locked');
  assert.deepEqual(locked, days.filter((d) => d > run('today()')), 'every later undecided day is locked');
  run('gatingOverride = false');
  assert.equal(run('lockedDates().size'), 0, 'off until payments go live');
});

test('decided days are never locked; the plan confirms only tonight', () => {
  const run = app();
  setup(run);
  const days = cookable(run);
  const last = days[days.length - 1];
  run(`confirmDaily({ date: "${last}" }, dailyPlan().find((d) => d.date === "${last}").candidate.recipe)`);
  assert.equal(run(`lockedDates().has("${last}")`), false, 'a decided day (e.g. from the trial) stays');
  run('state.mealSlots = {}; handleDailyAction("life-confirm", {})');
  const confirmed = JSON.parse(run('JSON.stringify(Object.keys(state.mealSlots).filter((d) => state.mealSlots[d].status === "confirmed"))'));
  assert.ok(confirmed.every((d) => d <= run('today()')), confirmed.join(','));
});

test('locked days are shown (peek), not hidden; the shopping tab peeks at the later list; plus unlocks every day', () => {
  const run = app();
  setup(run);
  const html = run('renderDailyPlan()');
  const locked = run('lockedDates().size');
  assert.equal((html.match(/plan-card is-dish is-peek/g) || []).length, locked, 'one peek card per locked day');
  assert.match(html, /プラスで決める/);
  assert.doesNotMatch(html, /lock-strip/);
  const peek = JSON.parse(run('JSON.stringify(lockedShoppingPeek())'));
  assert.equal(peek.days, locked);
  assert.ok(peek.names.length > 0);
  assert.match(run('renderShoppingPeek()'), /まとめ買いはプラス/);
  run('state.plus = { until: addDays(today(), 10) }');
  assert.equal(run('lockedDates().size'), 0);
  assert.doesNotMatch(run('renderDailyPlan()'), /is-peek/);
  assert.equal(run('renderShoppingPeek()'), '');
  run('state.plus = null; handleDailyAction("life-plus-open", { from: "locked" })');
  const sheet = run('renderPaywall()');
  assert.match(sheet, /今日なに作ろう/);
  assert.match(sheet, /捨てる食材/);
  assert.match(sheet, /まとめ買い/);
  assert.doesNotMatch(sheet, /1食あたり|毎日の献立|家族で共有/);
  assert.match(sheet, /600円/);
  assert.match(sheet, /6,000円/);
  assert.match(sheet, /1,800円おトク/, 'the yearly saving in yen, under the price');
  assert.match(sheet, /利用規約/);
  run('handleDailyAction("life-pay-close", {})');
  assert.equal(run('paywall'), null);
});

test('pause weeks: 4-week plan moves the bill a week per pause; yearly earns a renewal discount up to 10 weeks; 3 in a row, 14 a year', () => {
  const run = app();
  setup(run);
  const mon = run('addDays(weekStartOf(today()), 7)');
  run(`state.plus = { plan: "four", since: today(), until: addDays(today(), 27), pauses: [] }`);
  const base = run('plusUntil()');
  assert.equal(run(`togglePause("${mon}")`), true);
  assert.equal(run('plusUntil()'), run(`addDays("${base}", 7)`), 'the bill moves a week (no charge for the pause)');
  assert.equal(run(`dailyPlan().filter((d) => weekStartOf(d.date) === "${mon}").every((d) => d.off && d.pause && !d.candidate)`), true, 'no plan in a paused week');
  assert.equal(run(`togglePause(addDays("${mon}", 7))`), true);
  assert.equal(run(`togglePause(addDays("${mon}", 14))`), true);
  assert.equal(run(`pauseCheck(addDays("${mon}", 21)).ok`), false, 'four in a row is too many');
  assert.equal(run(`pauseCheck(weekStartOf(addDays(today(), -7))).ok`), false, 'a past week cannot be paused');
  run(`togglePause(addDays("${mon}", 14))`);
  assert.equal(run('plusState().pauses.length'), 2, 'a future pause can be undone');
  // いまの期間より後のお休みの予約は、いまの請求日を動かさない（Codex review #249）
  run(`state.plus = { plan: "four", since: today(), until: addDays(today(), 27), pauses: [addDays(weekStartOf(today()), 42)] }`);
  assert.equal(run('plusUntil()'), run('addDays(today(), 27)'), 'a pause after this term does not move this bill');
  run(`state.plus.pauses.push(addDays(weekStartOf(today()), 14))`);
  assert.equal(run('plusUntil()'), run('addDays(today(), 34)'), 'only the pause inside the term counts');
  // お休みの週は、献立・買い物・今夜の通知を作らない（Codex review #249）
  run(`state.plus = { plan: "four", since: today(), until: addDays(today(), 27), pauses: ["${mon}"] }`);
  // 通知を作るには、決めた日が要る（決めていない日は候補）：お休みの週の日を、休む前に決めておく
  run(`state.plus.pauses = []; for (const d of dailyPlan().filter((d) => d.candidate && weekStartOf(d.date) === "${mon}")) confirmDaily(d); state.plus.pauses = ["${mon}"]`);
  assert.ok(Number(run(`Object.values(state.mealSlots).filter((x) => x.status === "confirmed" && weekStartOf(x.date) === "${mon}").length`)) > 0, 'a decided day in the paused week');
  const ids = JSON.parse(run(`JSON.stringify(pushSchedule({ decide: true, shop: true, tonight: true, record: true }).map((x) => x.id))`));
  const dated = ids.map((id) => id.match(/\d{4}-\d{2}-\d{2}/)?.[0]).filter(Boolean);
  assert.ok(dated.length > 0, 'other weeks still notify');
  assert.ok(dated.every((d) => run(`weekStartOf("${d}")`) !== mon), ids.join(','));
  // 年額：割引は10週分まで・1年で14週まで
  const weeks = Array.from({ length: 20 }, (_, i) => run(`addDays("${mon}", ${7 * 2 * i})`));
  run(`state.plus = { plan: "year", since: today(), until: addDays(today(), 364), pauses: [] }`);
  let n = 0;
  for (const w of weeks) if (run(`togglePause("${w}")`)) n += 1;
  assert.equal(n, 14, '14 weeks a year');
  assert.deepEqual(JSON.parse(run('JSON.stringify(pauseCredit())')), { weeks: 10, yen: 10 * Math.round(6000 / 52) }, 'discount capped at 10 weeks');
  assert.equal(run('plusUntil()'), run('addDays(today(), 364)'), 'yearly: the term does not move');
  // 保存しても残る
  run('state = normalizeState(JSON.parse(JSON.stringify(state))); saveState = () => {}; render = () => {};');
  assert.equal(run('plusState().pauses.length'), 14);
  assert.equal(run('plusState().plan'), 'year');
  const settings = run('renderPlusSettings()');
  assert.match(settings, /次の更新で割引/);
  assert.match(settings, /年末年始の帰省/);
});

test('the trial start is kept for existing users and set at the end of the first setup', () => {
  const run = app();
  assert.equal(run('normalizeState({ ...clone(demoState), onboarded: true, trialFrom: "" }).trialFrom'), run('today()'));
  assert.equal(run('normalizeState({ ...clone(demoState), onboarded: true, trialFrom: "2026-09-01" }).trialFrom'), '2026-09-01');
  assert.deepEqual(JSON.parse(run('JSON.stringify(normalizeFreePicks({ "2026-09-28": ["2026-09-30", "x"], bad: [] }))')), { '2026-09-28': ['2026-09-30'] }, 'old saves still load');
});

test('in the beta, a pay button says thank you and invites feedback for a 3-month code', () => {
  const run = app();
  setup(run);
  run('handleDailyAction("life-plus-open", { from: "locked" }); handleDailyAction("life-pay-start", {})');
  assert.equal(run('paywall'), null);
  assert.equal(run('feedbackSheet.step'), 'thanks');
  const thanks = run('renderFeedbackSheet()');
  assert.match(thanks, /お気持ち、ありがとう/);
  assert.match(thanks, /3か月無料/);
  run('handleDailyAction("life-fb-form", {})');
  assert.match(run('renderFeedbackSheet()'), /id="fb-message"/);
  run('handleDailyAction("life-fb-close", {})');
  assert.equal(run('feedbackSheet'), null);
  // 初回設定の「無料ではじめる」は、お礼ではなくそのまま閉じる
  run('openPaywall(); handleDailyAction("life-pay-start", {})');
  assert.equal(run('feedbackSheet'), null);
});

test('usage summary: only today, only known events, days since the start; nothing personal', () => {
  const run = app();
  setup(run);
  run(`state.trialFrom = addDays(today(), -8); state.experienceEvents = [
    { name: "meal_cooked", at: new Date().toISOString() },
    { name: "meal_rated", at: new Date().toISOString() },
    { name: "meal_rated", at: new Date().toISOString() },
    { name: "profile_started", at: new Date().toISOString() },
    { name: "meal_cooked", at: new Date(Date.now() - 3 * 86400000).toISOString() }]`);
  const s = JSON.parse(run('JSON.stringify(usageSummary())'));
  assert.equal(s.n, 8);
  assert.deepEqual(s.events, { meal_cooked: 1, meal_rated: 2 });
  assert.deepEqual(Object.keys(s).sort(), ['anon', 'day', 'events', 'members', 'n', 'recipes', 'synced', 'v']);
});

// お試しをサーバーで持つ（2026-11-15。APP_MAP §75）
test('the server trial (signed in) wins over the device one; it starts from the device start once, and can be extended once', async () => {
  const store = { 'ripigochi-session': 'tok' };
  const run = app({ setTimeout, clearTimeout, MATAGOCHI_API_BASE_URL: 'https://api.test', localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
  setup(run, { trial: true });
  run('state.trialFrom = addDays(today(), -10)');
  run('account = { email: "hana@example.com" }');
  const localEnd = run('trialEnd()');
  const calls = [];
  run(`globalThis.__calls = [];
    fetchWithTimeout = async (url, init = {}) => { __calls.push([url.replace("https://api.test", ""), init.body ? JSON.parse(init.body) : null]);
      const path = url.replace("https://api.test/api/plus/", "");
      const trial = { start: state.trialFrom, end: addDays(today(), 2), extended: path === "trial/extend" };
      const body = path === "status" ? { trial: null, canExtend: false } : path === "trial/start" ? { trial, canExtend: true } : { trial: { ...trial, end: addDays(today(), 16) }, canExtend: false };
      return { ok: true, status: 200, json: async () => body }; };`);
  await run('refreshPlusTrial()');
  const sent = JSON.parse(run('JSON.stringify(__calls)'));
  assert.deepEqual(sent.map((c) => c[0]), ['/api/plus/status', '/api/plus/trial/start']);
  assert.equal(sent[1][1].from, run('state.trialFrom'), 'the device start carries over');
  assert.equal(run('trialEnd()'), run('addDays(today(), 2)'), 'the server end wins');
  assert.notEqual(run('trialEnd()'), localEnd);
  assert.match(run('renderTrialSettings()'), /お試しをあと2週間のばす/);
  await run('extendTrial()');
  assert.equal(run('trialEnd()'), run('addDays(today(), 16)'));
  assert.equal(run('state.trialServer.extended'), true);
  assert.doesNotMatch(run('renderTrialSettings()'), /あと2週間のばす/, 'only once');
  // 保存しても残る・家族の同期には入れない
  run('state = normalizeState(JSON.parse(JSON.stringify(state))); saveState = () => {}; render = () => {};');
  assert.equal(run('state.trialServer.end'), run('addDays(today(), 16)'));
  // 本人にひも付く：別のアカウントでは使わない・ログアウトで捨てる（Codex review #250）
  run('account = { email: "taro@example.com" }');
  assert.equal(run('trialEnd()'), localEnd, 'another account does not get her trial');
  assert.equal(run('renderTrialSettings().includes("あと2週間")'), false);
  run('account = { email: "hana@example.com" }');
  assert.equal(run('trialEnd()'), run('addDays(today(), 16)'));
  run('signOutLocal()');
  assert.equal(run('state.trialServer'), null, 'signing out drops it');
  assert.equal(run('trialEnd()'), localEnd);
  // 受け取りの途中で別のアカウントに変わったら、保存しない
  store['ripigochi-session'] = 'tok';
  run('account = { email: "hana@example.com" }');
  const pending = run('(() => { const p = refreshPlusTrial(); account = { email: "taro@example.com" }; return p; })()');
  await pending;
  assert.equal(run('state.trialServer'), null, 'a late answer for the old account is not saved');
  // その日にもう受け取っていれば、画面に戻っても受け取り直さない。日が変わったら受け取り直す
  run('account = { email: "hana@example.com" }; __calls.length = 0');
  await run('refreshPlusTrial()');
  const n = run('__calls.length');
  await run('refreshPlusTrial({ ifStale: true })');
  assert.equal(run('__calls.length'), n, 'not again on the same day');
  run('state.trialServer.checkedOn = addDays(today(), -1)');
  await run('refreshPlusTrial({ ifStale: true })');
  assert.ok(run('__calls.length') > n, 'again on a new day (so the extend button can appear)');
  assert.equal(run('JSON.stringify(typeof syncPayload === "function" ? syncPayload() : {}).includes("trialServer")'), false);
});
