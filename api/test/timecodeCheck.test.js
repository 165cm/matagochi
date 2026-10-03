import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { checkStepTimes } from '../src/timecodeCheck.js';
import { normalizeImportResult, MAX_STEPS } from '../src/importRecipe.js';
import { createTimecodeBook } from '../src/timecodes.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-03：手順は30個まで（以前は10個で切れていた）・手順の時刻の0円の点検。
const steps = (n) => Array.from({ length: n }, (_, i) => `手順${i + 1}`);
const codes = (r) => r.issues.map((i) => i.code).sort();

test('check: good times pass; no times at all is "none"', () => {
  assert.equal(checkStepTimes(steps(4), [10, 60, 120, 200], { durationSeconds: 300 }).status, 'ok');
  assert.equal(checkStepTimes(steps(4), [null, null, null, null]).status, 'none');
});

test('check: order, same time, beyond the video, too few times, clustered', () => {
  assert.deepEqual(codes(checkStepTimes(steps(4), [10, 200, 100, 300])), ['order']);
  assert.equal(checkStepTimes(steps(4), [10, 200, 100, 300]).issues[0].step, 2);
  assert.deepEqual(codes(checkStepTimes(steps(4), [10, 60, 60, 300])), ['same']);
  assert.deepEqual(codes(checkStepTimes(steps(4), [10, 60, 120, 400], { durationSeconds: 300 })), ['beyond']);
  assert.deepEqual(codes(checkStepTimes(steps(6), [10, null, null, null, 200, null])), ['sparse']);
  assert.deepEqual(codes(checkStepTimes(steps(4), [10, 15, 20, 25])), ['cluster']);
  assert.deepEqual(codes(checkStepTimes(steps(4), [10, 13, 15, 400])), [], 'small back-and-forth within 5 seconds is fine');
});

test('check: AI looked at the first 10 minutes only — later steps without times are flagged for long (or unknown) videos', () => {
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 120, 300, null, null], { source: 'video', durationSeconds: 900 })), ['clip']);
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 120, 300, null, null], { source: 'video' })), ['clip']);
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 120, 300, null, null], { source: 'video', durationSeconds: 400 })), [], 'short video: the AI saw it all');
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 120, 300, null, null], { source: 'chapters', durationSeconds: 900 })), [], 'chapters are not clipped');
});

test('check: exactly 10 steps is flagged (may have been cut by the old limit)', () => {
  assert.ok(codes(checkStepTimes(steps(10), steps(10).map((_, i) => i * 30))).includes('steps10'));
  assert.equal(checkStepTimes(steps(10), []).status, 'warn');
});

test('steps: up to 30 are kept (11th and later are no longer cut)', () => {
  assert.equal(MAX_STEPS, 30);
  const r = normalizeImportResult({ title: 'x', ingredients: [{ name: '豚肉', amount: '200g' }], steps: steps(15), planning: { minutes: 20 } });
  assert.equal(r.steps.length, 15);
  assert.equal(r.steps[14], '手順15');
  assert.equal(normalizeImportResult({ title: 'x', ingredients: [{ name: '豚肉' }], steps: steps(40) }).steps.length, 30);
});

test('timecodes: stored() reads the saved times without the AI; 15-step recipes keep all times', async () => {
  const store = createMemorySyncStore();
  let ai = 0;
  const book = createTimecodeBook(store, { analyze: async (url, list) => { ai += 1; return { stepTimes: list.map((_, i) => i * 40) }; }, reserveBudget: async () => {} });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.equal(await book.stored({ url, steps: steps(15) }), null);
  await book.find({ url, steps: steps(15) }, 'h1');
  const st = await book.stored({ url, steps: steps(15) });
  assert.equal(st.stepTimes.length, 15);
  assert.equal(st.stepTimes[14], 14 * 40);
  assert.equal(st.source, 'video');
  assert.equal(ai, 1);
});

test('admin: the check lists recipes with problems; the recipe shows its issues and video length', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const mk = (v, st, times) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: st, stepTimes: times, planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await mk('goodgoodgoo', steps(3), [10, 60, 120]);
  await mk('badbadbadba', steps(3), [10, 200, 100]);
  await mk('longlonglon', steps(3), [10, 60, 900]);
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: ['goodgoodgoo', 'badbadbadba', 'longlonglon'].map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    videoDetails: async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'public', durationSeconds: 600 }])) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer admin-test-token' };
  assert.equal((await fetch(`${base}/api/admin/timecodes/check`)).status, 403);
  const d = await (await fetch(`${base}/api/admin/timecodes/check`, { headers: admin })).json();
  assert.deepEqual([d.checked, d.ok, d.warn], [3, 1, 2]);
  assert.deepEqual(d.rows.map((r) => [r.videoId, r.issues.map((i) => i.code).join()]).sort(), [['badbadbadba', 'order'], ['longlonglon', 'beyond']]);
  assert.ok(d.labels.order);
  const one = await (await fetch(`${base}/api/admin/recipes/badbadbadba`, { headers: admin })).json();
  assert.equal(one.durationSeconds, 600);
  assert.equal(one.check.status, 'warn');
  assert.equal(one.check.issues[0].step, 2);
});

test('review fix (#136): exactly 5 seconds back is out of order; 4 times packed in part of the recipe are clustered', () => {
  assert.deepEqual(codes(checkStepTimes(['a', 'b'], [100, 95])), ['order']);
  assert.deepEqual(codes(checkStepTimes(['a', 'b'], [100, 96])), []);
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 15, 20, 25, 300])), ['cluster']);
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 50, 90, 130, 300])), []);
});

test('review fix (#136): times read from the video (also only the first 10 minutes) count as "video"; times from chapters are kept as "chapters"', async (t) => {
  const { createRecipeCatalog } = await import('../src/recipeCatalog.js');
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const mk = (v, extra) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: steps(5), planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }, ...extra } }, { ifGeneration: 0 });
  await mk('cliptimeaaa', { stepTimes: [10, 120, 300, null, null], analyzedFrom: 'video-clip' });
  await mk('chaptersbbb', { stepTimes: [10, 120, 300, null, null], stepTimesFrom: 'chapters', analyzedFrom: 'description' });
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: ['cliptimeaaa', 'chaptersbbb'].map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    videoDetails: async (ids) => Object.fromEntries(ids.map((id) => [id, { status: 'public', durationSeconds: 900 }])) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer admin-test-token' };
  const d = await (await fetch(`${base}/api/admin/timecodes/check`, { headers: admin })).json();
  assert.deepEqual(d.rows.map((r) => [r.videoId, r.source, r.issues.map((i) => i.code).join()]), [['cliptimeaaa', 'video', 'clip']]);
  const one = await (await fetch(`${base}/api/admin/recipes/chaptersbbb`, { headers: admin })).json();
  assert.equal(one.stepTimesSource, 'chapters');
  assert.equal(one.check.status, 'ok');
  // 取り込みの結果の「説明欄の章」は、保存する時にも残る
  const store2 = createMemorySyncStore();
  const cat = createRecipeCatalog(store2, async () => ({ title: '豚', ingredients: [{ name: '豚肉' }], steps: ['切る', '焼く'], stepTimes: [5, 30], stepTimesFrom: 'chapters', analyzedFrom: 'description' }));
  const r = await cat.import('https://www.youtube.com/watch?v=abcdefghijk').catch((e) => e);
  assert.equal(r.stepTimesFrom, 'chapters', r.message);
});

test('review fix (#136 r2): a time a user fixed (shared) wins over the older time in the recipe, as on the cooking screen; AI video times come after the recipe', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const st3 = steps(3);
  const mk = (v, extra) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: st3, planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }, ...extra } }, { ifGeneration: 0 });
  await mk('userfixaaaa', { stepTimes: [10, 60, 90] });
  await mk('aivideobbbb', { stepTimes: [10, 60, 90] });
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: ['userfixaaaa', 'aivideobbbb'].map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const book = createTimecodeBook(store, { analyze: async (url, list) => ({ stepTimes: list.map((_, i) => 500 - i * 100) }), reserveBudget: async () => {} });
  await book.fix({ url: 'https://www.youtube.com/watch?v=userfixaaaa', steps: st3, stepTimes: [20, 90, 140] }, 'h1');
  // AI（動画）の保存済みの時刻は、レシピの時刻より後
  await store.put((await (async () => { const { createHash } = await import('node:crypto'); return `timecodes/aivideobbbb-${createHash('sha256').update(st3.join('\n')).digest('hex').slice(0, 16)}`; })()), { stepTimes: [500, 400, 300], source: 'video', chaptersChecked: true }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer admin-test-token' };
  const a = await (await fetch(`${base}/api/admin/recipes/userfixaaaa`, { headers: admin })).json();
  assert.deepEqual([a.stepTimes, a.stepTimesSource], [[20, 90, 140], 'fix']);
  const b = await (await fetch(`${base}/api/admin/recipes/aivideobbbb`, { headers: admin })).json();
  assert.deepEqual([b.stepTimes, b.stepTimesSource], [[10, 60, 90], 'recipe']);
  const d = await (await fetch(`${base}/api/admin/timecodes/check`, { headers: admin })).json();
  assert.equal(d.warn, 0, 'the old AI times (reversed) are not used');
});

test('2026-10-04: chapter times may point several steps to the same chapter — counted as "coarse" (info), not as a problem; description-read recipes count as chapters', () => {
  const r = checkStepTimes(steps(5), [10, 10, 10, 90, 90], { source: 'chapters', durationSeconds: 300 });
  assert.equal(r.status, 'ok');
  assert.equal(r.coarse, 3);
  assert.deepEqual([...new Set(codes(checkStepTimes(steps(5), [10, 10, 10, 90, 90], { source: 'video' })))], ['same']);
  assert.deepEqual(codes(checkStepTimes(steps(5), [10, 10, 10, 90, 400], { source: 'chapters', durationSeconds: 300 })), ['beyond'], 'beyond the video still counts');
  assert.deepEqual(codes(checkStepTimes(steps(4), [100, 50, 150, 200], { source: 'chapters' })), ['order'], 'order still counts');
});

test('review fix (#137): chapter times packed in 30 seconds without the same time also count as "coarse"', () => {
  const r = checkStepTimes(['手順1', '手順2', '手順3', '手順4'], [10, 15, 20, 25], { source: 'chapters' });
  assert.equal(r.status, 'ok');
  assert.equal(r.coarse, 1);
  assert.equal(checkStepTimes(steps(4), [10, 60, 120, 200], { source: 'chapters' }).coarse, undefined);
});
