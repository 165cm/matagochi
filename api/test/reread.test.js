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

test('catalog reread: reads the description again (not the cache), keeps the old result when steps get fewer, rereads video-read recipes', async () => {
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
  // 動画から読んだレシピも、運営は読み直せる（説明欄＋字幕。時刻の誤りを直す入口）
  const vurl = 'https://www.youtube.com/watch?v=videovideo1';
  answer = recipe(5, { analyzedFrom: 'video' });
  await cat.import(vurl);
  answer = recipe(6, { analyzedFrom: 'description+transcript' });
  const vr = await cat.import(vurl, { reread: true });
  assert.equal(vr.analyzedFrom, 'description+transcript'); assert.equal(vr.steps.length, 6);
  // 字幕で整理し直して工程が減っても採用する（工程数だけでは採否を決めない）
  answer = recipe(4, { analyzedFrom: 'description+transcript' });
  assert.equal((await cat.import(vurl, { reread: true })).steps.length, 4);

  // 字幕ハイブリッド（description+transcript）のレシピは説明欄から再度読み直せる
  const hurl = 'https://www.youtube.com/watch?v=hybridreci1';
  answer = recipe(4, { analyzedFrom: 'description+transcript' });
  await cat.import(hurl);
  answer = recipe(6, { analyzedFrom: 'description+transcript' });
  const hr = await cat.import(hurl, { reread: true });
  assert.equal(hr.steps.length, 6);
  assert.equal(hr.analyzedFrom, 'description+transcript');
  assert.ok(hr.rereadAt);
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
  // 動画から読んだレシピも、管理画面のメインボタン（reread）で読み直せる（以前は 409 で字幕まで進まなかった）
  assert.equal((await fetch(`${base}/api/admin/recipes/${ids[3]}/reread`, { method: 'POST', headers: admin })).status, 200);
  // 動画から時刻を探し直す（保存しない）
  const re = await (await fetch(`${base}/api/admin/recipes/${ids[5]}/timecodes/reanalyze`, { method: 'POST', headers: admin, body: '{}' })).json();
  assert.deepEqual(re.stepTimes, [0, 60, 120, 180, 240, 300, 360]); assert.equal(re.seenSeconds, 1200);
  const one = await (await fetch(`${base}/api/admin/recipes/${ids[5]}`, { headers: { Authorization: admin.Authorization } })).json();
  assert.deepEqual(one.stepTimes, [], 'not saved until the admin presses save');
});

test('review fix (#138): a re-read never hides the saved recipe — not while it runs, not when the AI says "not a recipe", not after a crash', async () => {
  const store = createMemorySyncStore();
  let answer = recipe(10), release, gateOpen = Promise.resolve();
  const cat = createRecipeCatalog(store, async () => { await gateOpen; if (answer instanceof Error) throw answer; return answer; });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  // 読み直しの途中でも、前のレシピが読める
  gateOpen = new Promise((r) => { release = r; });
  answer = recipe(12);
  const running = cat.import(url, { reread: true });
  await new Promise((r) => setImmediate(r));
  assert.equal((await cat.peek(url))?.steps.length, 10, 'readable while re-reading');
  release(); assert.equal((await running).steps.length, 12);
  // 「レシピではない」と言われても消えない（印だけ付く）
  gateOpen = Promise.resolve();
  answer = Object.assign(new Error('uncertain'), { code: 'analysis_uncertain' });
  await assert.rejects(cat.import(url, { reread: true }), { code: 'analysis_uncertain' });
  const kept = await cat.peek(url);
  assert.equal(kept?.steps.length, 12); assert.ok(kept.rereadAt);
  assert.equal((await store.get('youtube-abcdefghijk')).envelope.status, 'ready');
  // 途中で止まった読み直しの鍵が残っていても、レシピはそのまま。新しい鍵は待つ（古い鍵は取り直せる）
  await store.put('reread-lock/abcdefghijk', { at: new Date().toISOString() }, { ifGeneration: 0 });
  answer = recipe(14);
  await assert.rejects(cat.import(url, { reread: true }), { code: 'analysis_pending' });
  assert.equal((await cat.peek(url))?.steps.length, 12);
  const lock = await store.get('reread-lock/abcdefghijk');
  await store.put('reread-lock/abcdefghijk', { at: new Date(Date.now() - 11 * 60_000).toISOString() }, { ifGeneration: lock.generation });
  assert.equal((await cat.import(url, { reread: true })).steps.length, 14);
  assert.equal(await store.get('reread-lock/abcdefghijk'), null, 'the lock is released');
});

test('review fix (#138): the same video is not re-analyzed twice at once (other tab, resend, another instance)', async () => {
  let calls = 0, release;
  const store = createMemorySyncStore();
  const opts = { reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 300 }), analyze: async () => { calls++; await new Promise((r) => { release = r; }); return { stepTimes: [3, 90] }; } };
  const a = createTimecodeBook(store, opts), b = createTimecodeBook(store, opts);
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['切る', '焼く'] };
  const first = a.reanalyze(ask);
  await new Promise((r) => setImmediate(r));
  const [second, third] = await Promise.allSettled([a.reanalyze(ask), b.reanalyze(ask)]);
  assert.equal(second.reason?.code, 'reanalyze_pending'); assert.equal(third.reason?.code, 'reanalyze_pending');
  release(); assert.deepEqual((await first).stepTimes, [3, 90]);
  assert.equal(calls, 1);
  // 終わったら次は探し直せる（失敗でも鍵は外れる）
  const again = a.reanalyze(ask); await new Promise((r) => setImmediate(r)); release(); await again;
  assert.equal(calls, 2);
});

test('review fix (#138): a time after the part the AI watched is flagged ("unseen"), apart from "beyond the video"', () => {
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 1900], { source: 'video', seenSeconds: 1800, durationSeconds: 3600 })), ['unseen']);
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 1900], { source: 'video', seenSeconds: 1800 })), ['unseen'], 'video length unknown');
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 1900], { source: 'video', seenSeconds: 1800, durationSeconds: 1800 })), ['beyond']);
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 1900], { source: 'chapters', seenSeconds: 1800, durationSeconds: 3600 })), []);
});

test('review fix (#138 r2): the re-analyze lock outlasts 3 endpoints each running to their 150-second timeout', async () => {
  const { REANALYZE_LOCK_MS } = await import('../src/timecodes.js');
  assert.ok(REANALYZE_LOCK_MS > 3 * 150_000);
  let calls = 0, t = Date.now();
  const waits = [];
  const store = createMemorySyncStore();
  const opts = { now: () => t, reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 300 }), analyze: async () => { calls++; await new Promise((r) => waits.push(r)); return { stepTimes: [3, 90] }; } };
  const a = createTimecodeBook(store, opts), b = createTimecodeBook(store, opts);
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['切る', '焼く'] };
  const first = a.reanalyze(ask);
  await new Promise((r) => setImmediate(r));
  t += 3 * 150_000 + 1; // 3つ目の接続先が時間切れになる直前でも
  await assert.rejects(b.reanalyze(ask), { code: 'reanalyze_pending' });
  assert.equal(calls, 1);
  t += REANALYZE_LOCK_MS; // 止まった探し直しの鍵は、取り直せる
  const late = b.reanalyze(ask); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2);
  waits.forEach((r) => r()); await late; await first.catch(() => {});
});

test('review fix (#138 r2): older saves without seenSeconds count as "watched the first 10 minutes" for "unseen" too', () => {
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 700], { source: 'video', durationSeconds: 1200 })), ['unseen']);
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 700], { source: 'video' })), ['unseen']);
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 700], { source: 'video', durationSeconds: 1200, seenSeconds: 1200 })), []);
  assert.deepEqual(codes(checkStepTimes(['手順1', '手順2'], [10, 300], { source: 'video', durationSeconds: 400 })), []);
});

test('admin reread: the real processing stage is saved and readable (needs the token); failures keep the stage where it stopped', async (t) => {
  const store = createMemorySyncStore();
  const v = 'progressvid';
  await store.put(`youtube-${v}`, { status: 'ready', result: { title: '料理', videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', ingredients: [{ name: '豚肉' }], steps: steps(5), analyzedFrom: 'description', snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  let fail = false;
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'tok' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    importRecipe: async (url, o) => { o.onProgress({ stage: 2, detail: '字幕に沿って整理中（AI応答待ち）' }); if (fail) throw Object.assign(new Error('AI down'), { code: 'ai_down' }); return { title: '料理', ingredients: [{ name: '豚肉' }], steps: steps(6) }; } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const h = { Authorization: 'Bearer tok', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/admin/recipes/${v}/reread/progress`)).status, 403);
  assert.equal((await (await fetch(`${base}/api/admin/recipes/${v}/reread/progress`, { headers: h })).json()).progress, null);
  assert.equal((await fetch(`${base}/api/admin/recipes/${v}/reread`, { method: 'POST', headers: h, body: '{}' })).status, 200);
  const done = (await (await fetch(`${base}/api/admin/recipes/${v}/reread/progress`, { headers: h })).json()).progress;
  assert.equal(done.status, 'done'); assert.equal(done.total, 5); assert.match(done.detail, /5 → 6/);
  fail = true;
  await fetch(`${base}/api/admin/recipes/${v}/reread`, { method: 'POST', headers: h, body: '{}' });
  const bad = (await (await fetch(`${base}/api/admin/recipes/${v}/reread/progress`, { headers: h })).json()).progress;
  assert.equal(bad.status, 'failed'); assert.equal(bad.stage, 2); assert.match(bad.detail, /AI down/);
});

test('admin reread: stores an array of execution logs so earlier details are not lost', async (t) => {
  const store = createMemorySyncStore();
  const v = 'logcheckvid';
  await store.put(`youtube-${v}`, { status: 'ready', result: { title: '料理', videoUrl: `https://www.youtube.com/watch?v=${v}`, ingredients: [{ name: '豚肉' }], steps: steps(5), snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'tok' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    importRecipe: async (url, o) => {
      o.onProgress({ stage: 1, detail: '字幕を取得しました（120行）' });
      o.onProgress({ stage: 2, detail: 'AI の整理が失敗しました（quota exceeded）' });
      return { title: '料理', ingredients: [{ name: '豚肉' }], steps: steps(2) }; // 手順が減るので reread_worse
    } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const h = { Authorization: 'Bearer tok', 'Content-Type': 'application/json' };
  await fetch(`${base}/api/admin/recipes/${v}/reread`, { method: 'POST', headers: h, body: '{}' });
  const p = (await (await fetch(`${base}/api/admin/recipes/${v}/reread/progress`, { headers: h })).json()).progress;
  assert.equal(p.status, 'failed');
  assert.ok(Array.isArray(p.logs));
  assert.ok(p.logs.some((l) => l.includes('字幕を取得しました')));
  assert.ok(p.logs.some((l) => l.includes('quota exceeded')));
});

test('reread: rejects description+transcript candidate if it completely loses existing valid timecodes', async () => {
  const store = createMemorySyncStore();
  const v = 'losttimevid';
  const url = `https://www.youtube.com/watch?v=${v}`;
  let answer = {
    title: '料理',
    videoUrl: url,
    ingredients: [{ name: '豚肉' }],
    steps: steps(5),
    stepTimes: [10, 20, 30, 40, 50],
    analyzedFrom: 'video',
    durationSeconds: 300,
    catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }
  };
  const cat = createRecipeCatalog(store, async () => answer);
  await cat.import(url);
  assert.equal((await cat.peek(url)).stepTimes.filter(Number.isFinite).length, 5);

  // 新結果が description+transcript で全時刻 null の場合
  answer = {
    title: '料理',
    videoUrl: url,
    ingredients: [{ name: '豚肉' }],
    steps: steps(4),
    stepTimes: [null, null, null, null],
    analyzedFrom: 'description+transcript',
    durationSeconds: 300,
    catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }
  };

  await assert.rejects(cat.import(url, { reread: true }), (err) => err.code === 'reread_lost_timecodes');
  // 前の5件の時刻が維持されていること
  assert.equal((await cat.peek(url)).stepTimes.filter(Number.isFinite).length, 5);
});

test('reread: marks rereadAt even when rejected with reread_lost_timecodes', async () => {
  const store = createMemorySyncStore();
  const v = 'marklostt01';
  const url = `https://www.youtube.com/watch?v=${v}`;
  let answer = {
    title: '料理',
    videoUrl: url,
    ingredients: [{ name: '豚肉' }],
    steps: steps(5),
    stepTimes: [10, 20, 30, 40, 50],
    analyzedFrom: 'description',
    durationSeconds: 300,
    catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }
  };
  const cat = createRecipeCatalog(store, async () => answer);
  await cat.import(url);
  assert.equal((await cat.peek(url)).rereadAt, undefined);

  // 新結果が全時刻 null
  answer = {
    title: '料理',
    videoUrl: url,
    ingredients: [{ name: '豚肉' }],
    steps: steps(4),
    stepTimes: [null, null, null, null],
    analyzedFrom: 'description+transcript',
    durationSeconds: 300,
    catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 }
  };

  await assert.rejects(cat.import(url, { reread: true }), (err) => err.code === 'reread_lost_timecodes');
  // 棄却されても rereadAt が付き、一括読み直しで何度も選ばれないこと
  const kept = await cat.peek(url);
  assert.ok(kept.rereadAt);
});
