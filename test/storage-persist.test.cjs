const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const fullSource = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
// navigator.storage の persist/persisted を数えるだけの偽物を入れて、app.js を読み込む。
function app(storage) {
  const context = vm.createContext({ console, URL, Date, navigator: storage === undefined ? {} : { storage }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const file of ['dinner-persona.js','taste.js','taste-ui.js','starter-recipes.js','skills.js','aisles.js','lifestyle.js','profile-talk.js','talk-ui.js','daily-ui.js','playlist-import.js','household.js','skill-quiz.js','cook-level.js','weekly.js','cook-type.js','plan-moves.js','plus.js','cook-mode.js','folders.js','install.js','push.js','tickets.js','account.js','discover.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function fakeStorage(persisted) {
  const calls = { persist: 0, persisted: 0 };
  return { calls, storage: { persisted: async () => { calls.persisted += 1; return persisted; }, persist: async () => { calls.persist += 1; return true; } } };
}

test('persistent storage: asked once per launch, only after onboarding', async () => {
  const { calls, storage } = fakeStorage(false);
  const run = app(storage);
  run('state = clone(demoState); state.onboarded = false;');
  run('requestPersistentStorage()');
  await flush();
  assert.equal(calls.persist, 0, 'not before onboarding');
  run('state.onboarded = true; requestPersistentStorage(); requestPersistentStorage();');
  await flush();
  assert.equal(calls.persisted, 1);
  assert.equal(calls.persist, 1, 'only once');
});

test('persistent storage: not asked again when already persisted', async () => {
  const { calls, storage } = fakeStorage(true);
  const run = app(storage);
  run('state = clone(demoState); state.onboarded = true; requestPersistentStorage();');
  await flush();
  assert.equal(calls.persisted, 1);
  assert.equal(calls.persist, 0);
});

test('persistent storage: browsers without the API are left alone', () => {
  const run = app(undefined);
  assert.doesNotThrow(() => run('state = clone(demoState); state.onboarded = true; requestPersistentStorage();'));
});
