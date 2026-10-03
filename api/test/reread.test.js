import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { checkStepTimes } from '../src/timecodeCheck.js';
import { createTimecodeBook } from '../src/timecodes.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { analyzeStepTimes, TIMECODE_FPS } from '../src/analyzer.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-04：動画から手順の時刻を探す時は5秒に1コマ・動画の最後まで（30分まで）。手順10個のレシピは説明欄から読み直す。
const steps = (n) => Array.from({ length: n }, (_, i) => `手順${i + 1}`);
const codes = (r) => [...new Set(r.issues.map((i) => i.code))].sort();

test('step times from the video: 1 frame every 5 seconds (fps 0.2), with or without a clip; env can change it', async () => {
  const seen = [];
  const clients = [{ name: 'fake', ai: () => ({ models: { generateContent: async (req) => { seen.push(req.contents[0].parts[0].videoMetadata); return { text: '{"stepTimes":[5,30]}' }; } } }) }];
  assert.equal(TIMECODE_FPS, 0.2);
  await analyzeStepTimes('https://www.youtube.com/watch?v=abcdefghijk', ['切る', '焼く'], {}, { clients });
  await analyzeStepTimes('https://www.youtube.com/watch?v=abcdefghijk', ['切る', '焼く'], {}, { clients, clipSeconds: 1800 });
  await analyzeStepTimes('https://www.youtube.com/watch?v=abcdefghijk', ['切る', '焼く'], { TIMECODE_FPS: '0.5' }, { clients });
  assert.deepEqual(seen, [{ fps: 0.2 }, { startOffset: '0s', endOffset: '1800s', fps: 0.2 }, { fps: 0.5 }]);
});

test('step times: the AI watches to the end (up to maxSeconds); how long it watched is kept and used by the check', async () => {
  let clip = 'unset';
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, { reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 1500 }), maxSeconds: 1800,
    analyze: async (url, list, o) => { clip = o.clipSeconds; return { stepTimes: [10, 700, 1400, null] }; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: steps(4) };
  await book.find(ask, 'home-0001');
  assert.equal(clip, null, 'a 25-minute video is watched to the end');
  const st = await book.stored(ask);
  assert.equal(st.seenSeconds, 1500);
  // 全部見た動画で後ろの手順に時刻がなくても「見ていない後半」ではない
  assert.deepEqual(codes(checkStepTimes(ask.steps, st.stepTimes, { source: 'video', durationSeconds: 1500, seenSeconds: st.seenSeconds })), []);
  // 以前の保存（見た長さなし）は、最初の10分だけを見た扱いのまま
  assert.deepEqual(codes(checkStepTimes(ask.steps, [10, 120, 300, null], { source: 'video', durationSeconds: 1500 })), ['clip']);
});

test('admin re-analyze: does not save, does not use the household quota, but goes through the AI budget', async () => {
  let budget = 0, calls = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, { reserveBudget: async () => { budget++; }, snippet: async () => ({ durationSeconds: 3000 }), maxSeconds: 1800,
    analyze: async (url, list, o) => { calls++; assert.equal(o.clipSeconds, 1800); return { stepTimes: [3, 90] }; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['切る', '焼く'] };
  const r = await book.reanalyze(ask);
  assert.deepEqual(r, { stepTimes: [3, 90], source: 'video', seenSeconds: 1800 });
  assert.equal(await book.stored(ask), null, 'nothing saved');
  assert.equal(budget, 1); assert.equal(calls, 1);
  await assert.rejects(createTimecodeBook(store, { reserveBudget: async () => {}, analyze: async () => ({ stepTimes: [null, null] }) }).reanalyze(ask), { code: 'timecodes_not_found' });
});

const recipe = (n, extra = {}) => ({ title: '豚の炒め物', ingredients: [{ name: '豚肉' }], steps: steps(n), ...extra });

test('catalog reread: reads the description again (not the cache), keeps the old result when steps get fewer, refuses video-read recipes', async () => {
  const store = createMemorySyncStore();
  let answer = recipe(10), calls = 0;
  const cat = createRecipeCatalog(store, async () => { calls++; return answer; });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  assert.equal((await cat.import(url)).cacheHit, true); assert.equal(calls, 1);
  answer = recipe(14);
  const r = await cat.import(url, { reread: true });
  assert.equal(r.steps.length, 14); assert.equal(calls, 2); assert.ok(r.rereadAt);
  // 手順が減る読み直しは保存しない（前の結果のまま。「読み直した」印は付く）
  answer = recipe(3);
  await assert.rejects(cat.import(url, { reread: true }), { code: 'reread_worse' });
  const kept = await cat.peek(url);
  assert.equal(kept.steps.length, 14); assert.ok(kept.rereadAt);
  // 動画から読んだレシピは説明欄から読み直さない
  const vurl = 'https://www.youtube.com/watch?v=videovideo1';
  answer = recipe(5, { analyzedFrom: 'video' });
  await cat.import(vurl);
  await assert.rejects(cat.import(vurl, { reread: true }), { code: 'reread_not_description' });
});

test('admin: re-read the 10-step description recipes in batches; video re-analyze returns times without saving', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const mk = (v, n, extra = {}) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: steps(n), planning: { minutes: 10 }, analyzedFrom: 'description', snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }, ...extra } }, { ifGeneration: 0 });
  const ids = ['tenaaaaaaa1', 'tenaaaaaaa2', 'tenaaaaaaa3', 'videotenaa4', 'donetenaaa5', 'sevenaaaaa6'];
  await mk(ids[0], 10); await mk(ids[1], 10); await mk(ids[2], 10);
  await mk(ids[3], 10, { analyzedFrom: 'video' });
  await mk(ids[4], 10, { rereadAt: new Date().toISOString() });
  await mk(ids[5], 7);
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: ids.map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const asked = [];
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    videoDetails: async (list) => Object.fromEntries(list.map((id) => [id, { status: 'public', durationSeconds: 600 }])),
    importRecipe: async (url) => { asked.push(url.slice(-11)); return { title: '料理', ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: steps(url.endsWith('2') ? 4 : 13) }; },
    fetchYouTubeSnippet: async () => ({ durationSeconds: 1200 }),
    analyzeStepTimes: async (url, list, o) => ({ stepTimes: list.map((_, i) => i * 60), clip: o.clipSeconds }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/admin/reread/steps10`, { method: 'POST' })).status, 403);
  const a = await (await fetch(`${base}/api/admin/reread/steps10`, { method: 'POST', headers: admin, body: JSON.stringify({ max: 2 }) })).json();
  const b = await (await fetch(`${base}/api/admin/reread/steps10`, { method: 'POST', headers: admin, body: JSON.stringify({ max: 2 }) })).json();
  const all = [...a.done, ...b.done].map((x) => [x.videoId, x.before, x.after ?? x.error]).sort();
  assert.deepEqual(all, [[ids[0], 10, 13], [ids[1], undefined, 'reread_worse'], [ids[2], 10, 13]], 'a recipe that got worse is not tried again');
  assert.deepEqual([a.done.length, a.left, b.done.length, b.left], [2, 1, 1, 0]);
  assert.deepEqual(asked.sort(), [ids[0], ids[1], ids[2]], 'video-read, already re-read and 7-step recipes are left alone');
  // 1品だけ読み直す
  assert.equal((await fetch(`${base}/api/admin/recipes/${ids[3]}/reread`, { method: 'POST', headers: admin })).status, 409);
  // 動画から時刻を探し直す（保存しない）
  const re = await (await fetch(`${base}/api/admin/recipes/${ids[5]}/timecodes/reanalyze`, { method: 'POST', headers: admin, body: '{}' })).json();
  assert.deepEqual(re.stepTimes, [0, 60, 120, 180, 240, 300, 360]); assert.equal(re.seenSeconds, 1200);
  const one = await (await fetch(`${base}/api/admin/recipes/${ids[5]}`, { headers: { Authorization: admin.Authorization } })).json();
  assert.deepEqual(one.stepTimes, [], 'not saved until the admin presses save');
});
