const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const fullSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
function app() {
  const context = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const file of ['dinner-persona.js','taste.js','taste-ui.js','starter-recipes.js','skills.js','aisles.js','lifestyle.js','profile-talk.js','talk-ui.js','daily-ui.js','playlist-import.js','household.js','skill-quiz.js','cook-level.js','weekly.js','cook-type.js','plan-moves.js','plus.js','cook-mode.js','folders.js','install.js','push.js','tickets.js','account.js','discover.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}
const PHOTO = 'data:image/jpeg;base64,AAAA';
function setupWeek(run, days) {
  // days: [kind per Mon..Sun] — photo / cooked / planned / off / none
  run(`state = clone(demoState); state.onboarded = true; state.evaluations = []; state.mealSlots = {}; var W = mondayOf(today());`);
  days.forEach((k, i) => run(`(() => { const d = addDays(W, ${i}); const r = {id:'r${i}', title:'料理${i}'};
    if ('${k}' === 'photo' || '${k}' === 'cooked') { state.mealSlots[d] = {status:'cooked', recipe:r}; state.evaluations.push({id:'meal-'+d, recipeId:r.id, recipeTitle:r.title, cookedAt:d, photo:'${k}' === 'photo' ? '${PHOTO}' : ''}); }
    if ('${k}' === 'planned') state.mealSlots[d] = {status:'confirmed', recipe:r};
    if ('${k}' === 'off') state.mealSlots[d] = {status:'off'}; })()`));
}

test('mondayOf returns the Monday of the week', () => {
  const run = app();
  assert.equal(run(`mondayOf('2026-09-28')`), '2026-09-28');
  assert.equal(run(`mondayOf('2026-10-04')`), '2026-09-28');
  assert.equal(run(`mondayOf('2026-10-01')`), '2026-09-28');
});

test('week completes when every planned day has a cooked photo (3 or more)', () => {
  const run = app();
  setupWeek(run, ['photo', 'off', 'photo', 'photo', 'none', 'none', 'none']);
  assert.deepEqual(JSON.parse(run('JSON.stringify(weekResult(weekStamps(W)))')), { target: 3, got: 3, complete: true });
  setupWeek(run, ['photo', 'photo', 'none', 'none', 'none', 'none', 'none']);
  assert.equal(run('weekResult(weekStamps(W)).complete'), false, 'two days are not enough');
  setupWeek(run, ['photo', 'cooked', 'photo', 'photo', 'none', 'none', 'none']);
  assert.equal(run('weekResult(weekStamps(W)).complete'), false, 'a cooked day without a photo blocks');
  assert.equal(run('weekStamps(W)[1].kind'), 'cooked');
});

test('eat-out days do not count and dish names come from the record', () => {
  const run = app();
  setupWeek(run, ['photo', 'off', 'off', 'photo', 'photo', 'none', 'none']);
  const r = JSON.parse(run('JSON.stringify(weekResult(weekStamps(W)))'));
  assert.equal(r.target, 3);
  assert.equal(run('weekStamps(W)[3].dish'), '料理3');
});

test('menu album is normalized, capped and kept out of sync', () => {
  const run = app();
  const album = Array.from({ length: 15 }, (_, i) => ({ id: `2026-0${1 + (i % 9)}-0${1 + (i % 7)}`, style: i % 2 ? 'anime' : 'nope', total: 5, days: [{ date: '2026-09-28', dish: 'カレー' }], art: [PHOTO], at: '' }));
  album.push({ id: 'bad', art: [PHOTO] }, { id: '2026-09-28', art: ['https://x'] });
  run(`state = normalizeState({ ...clone(demoState), menuAlbum: ${JSON.stringify(album)} })`);
  assert.equal(run('state.menuAlbum.length'), 12);
  assert.equal(run('state.menuAlbum[1].style'), 'anime');
  assert.equal(run('state.menuAlbum[0].style'), 'chalk', 'unknown styles fall back');
  assert.equal(run('state.menuAlbum[0].art.length'), 1);
  assert.equal(run('"menuAlbum" in buildSyncPayload()'), false);
});

test('stamp card celebrates completion (the illustrated menu is switched off), and the badge follows completion', () => {
  const run = app();
  setupWeek(run, ['photo', 'photo', 'photo', 'none', 'none', 'none', 'none']);
  run('state.menuAlbum = []');
  const html = run('renderWeeklyStamps()');
  assert.equal(run('MENU_ENABLED'), false);
  assert.doesNotMatch(html, /life-menu-setup/);
  assert.match(html, /コンプ！/);
  assert.match(html, /3\/3/);
  assert.equal(run('handleWeeklyAction("life-menu-setup", { week: W }) && menuSetup'), null, 'setup does not open');
  assert.equal(run('cookStats().comp'), true);
  setupWeek(run, ['photo', 'cooked', 'planned', 'none', 'none', 'none', 'none']);
  assert.doesNotMatch(run('renderWeeklyStamps()'), /life-menu-setup/);
});
