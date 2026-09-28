const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const fullSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
function app() {
  const context = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const file of ['dinner-persona.js','taste.js','taste-ui.js','starter-recipes.js','skills.js','aisles.js','lifestyle.js','daily-ui.js','playlist-import.js','household.js','skill-quiz.js','cook-level.js','weekly.js','cook-type.js','plan-moves.js','plus.js','folders.js','install.js','push.js','tickets.js','account.js','discover.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
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

test('during the trial nothing is locked; after it, 3 days a week stay free', () => {
  const run = app();
  setup(run, { trial: true });
  assert.equal(run('lockedDates().size'), 0, 'trial');
  setup(run);
  const days = cookable(run);
  const locked = JSON.parse(run('JSON.stringify([...lockedDates()])'));
  const byWeek = {};
  for (const d of days) (byWeek[weekOf(run, d)] ||= []).push(d);
  for (const [w, list] of Object.entries(byWeek)) {
    const free = list.filter((d) => !locked.includes(d));
    assert.equal(free.length, Math.min(3, list.length), `week ${w}: 3 free days`);
    assert.deepEqual(free, list.slice(0, free.length), 'the earliest days are free');
  }
  assert.ok(locked.length > 0);
  run('gatingOverride = false');
  assert.equal(run('lockedDates().size'), 0, 'off until payments go live');
});

test('confirmed days count toward the 3 and are never locked; eat-out days do not count', () => {
  const run = app();
  setup(run);
  const days = cookable(run);
  const last = days[days.length - 1];
  run(`confirmDaily({ date: "${last}" }, dailyPlan().find((d) => d.date === "${last}").candidate.recipe)`);
  assert.equal(run(`lockedDates().has("${last}")`), false, 'a decided day stays');
  const w = weekOf(run, last);
  const free = JSON.parse(run(`JSON.stringify(freeDatesOfWeek("${w}"))`));
  assert.ok(free.includes(last) && free.length <= 3);
  // 外食の日は数えない：無料の日を外食にすると、次の日が無料になる
  const first = free.find((d) => d !== last);
  run(`state.mealSlots["${first}"] = { status: "off", kind: "out", date: "${first}" }`);
  const free2 = JSON.parse(run(`JSON.stringify(freeDatesOfWeek("${w}"))`));
  assert.ok(!free2.includes(first));
  assert.equal(free2.length, Math.min(3, days.filter((d) => weekOf(run, d) === w && d !== first).length));
});

test('a locked day can be swapped into the 3; the plan confirms only free days', () => {
  const run = app();
  setup(run);
  const locked = JSON.parse(run('JSON.stringify([...lockedDates()])'));
  const target = locked[0];
  assert.equal(run(`pickFreeDay("${target}")`), true);
  assert.equal(run(`lockedDates().has("${target}")`), false, 'the picked day is free now');
  assert.equal(run(`freeDatesOfWeek(weekStartOf("${target}")).length`), 3);
  run('handleDailyAction("life-confirm", {})');
  const confirmed = JSON.parse(run('JSON.stringify(Object.keys(state.mealSlots).filter((d) => state.mealSlots[d].status === "confirmed"))'));
  const stillLocked = JSON.parse(run('JSON.stringify([...lockedDates()])'));
  assert.ok(confirmed.length > 0);
  assert.ok(confirmed.every((d) => !stillLocked.includes(d)));
  assert.equal(run(`state.mealSlots["${stillLocked[0]}"]`), undefined, 'a locked day is not confirmed');
});

test('plus unlocks every day; the locked card and the upsell sheet', () => {
  const run = app();
  setup(run);
  assert.match(run('renderDailyPlan()'), /プラスなら毎日の献立/);
  run('state.plus = { until: addDays(today(), 10) }');
  assert.equal(run('lockedDates().size'), 0);
  assert.doesNotMatch(run('renderDailyPlan()'), /プラスなら毎日の献立/);
  run('state.plus = null; handleDailyAction("life-plus-open", { from: "locked" })');
  const sheet = run('renderPaywall()');
  assert.match(sheet, /毎日の献立は、プラスで/);
  assert.match(sheet, /600円/);
  assert.match(sheet, /6,000円/);
  assert.match(sheet, /利用規約/);
  run('handleDailyAction("life-pay-close", {})');
  assert.equal(run('paywall'), null);
});

test('the trial start is kept for existing users and set at the end of the first setup', () => {
  const run = app();
  assert.equal(run('normalizeState({ ...clone(demoState), onboarded: true, trialFrom: "" }).trialFrom'), run('today()'));
  assert.equal(run('normalizeState({ ...clone(demoState), onboarded: true, trialFrom: "2026-09-01" }).trialFrom'), '2026-09-01');
  assert.deepEqual(JSON.parse(run('JSON.stringify(normalizeFreePicks({ "2026-09-28": ["2026-09-30", "x"], bad: [] }))')), { '2026-09-28': ['2026-09-30'] });
});
