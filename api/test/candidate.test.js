import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { importYouTubeRecipe } from '../src/importRecipe.js';
import { createRecipeCatalog, cleanCandidateTimes } from '../src/recipeCatalog.js';
import { recordUsage, usage, usageYen } from '../src/aiUsage.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-31：字幕が取れず、説明欄にも手順がない動画を、管理画面で「候補を作る → 見比べる → 採用」で直す（APP_MAP §52-6）。
const V = 'UsOqhEG-7hY';
const URL_ = `https://www.youtube.com/watch?v=${V}`;
const onlyIngredients = { title: '青のりクリームパスタ', description: '【材料】パスタ 100g\n生クリーム 100ml\n青のり 大さじ1', durationSeconds: 675 };
const describe = async () => ({ title: '青のりクリームパスタ', ingredients: [{ name: 'パスタ', amount: '100g' }, { name: '生クリーム', amount: '100ml' }], steps: [] });
const fromVideo = { title: '青のりクリームパスタ', ingredients: [], steps: ['パスタをゆでる', 'ソースを作る', '和える', '盛り付ける'], stepTimes: ['00:30', '03:10', '08:00', '10:40'], stepsComplete: true };

test('import (auto candidate): no subtitles and no steps in the description → the video is read to the end; materials stay from the description', async () => {
  let clip = 'unset', videoCounted = 0;
  const r = await importYouTubeRecipe(URL_, {
    fetchYouTubeSnippet: async () => onlyIngredients,
    analyzeRecipeDescription: describe,
    fetchYouTubeTranscript: async () => ({ status: 'not_available', reason: 'unplayable' }),
    buildHybridRecipeSteps: async () => { throw new Error('must not run without subtitles'); },
    analyzeRecipeVideo: async (url, snippet, o) => { clip = o.clipSeconds; return fromVideo; }
  }, { videoIfNeeded: true, videoFullOnly: true, videoMaxSeconds: 1800, reserveVideo: async () => { videoCounted++; } });
  assert.equal(clip, null, 'the 11-minute video is not cut at 10 minutes');
  assert.equal(videoCounted, 1);
  assert.equal(r.analyzedFrom, 'video');
  assert.deepEqual(r.steps, fromVideo.steps);
  assert.deepEqual(r.stepTimes, [30, 190, 480, 640]);
  assert.equal(r.ingredients[0].name, 'パスタ');
  assert.equal(r.durationSeconds, 675);
});

test('import (auto candidate): when the subtitles organize the steps, the video is not read', async () => {
  let videoCalls = 0;
  const r = await importYouTubeRecipe(URL_, {
    fetchYouTubeSnippet: async () => onlyIngredients,
    analyzeRecipeDescription: describe,
    fetchYouTubeTranscript: async () => ({ status: 'ok', items: [{ start: 30, duration: 2, text: 'ゆでます' }, { start: 190, duration: 2, text: 'ソース' }] }),
    buildHybridRecipeSteps: async () => ({ steps: ['パスタをゆでる', 'ソースを作って和える'], stepTimes: [30, 190], stepsComplete: true }),
    analyzeRecipeVideo: async () => { videoCalls++; return fromVideo; }
  }, { videoIfNeeded: true, videoFullOnly: true, videoMaxSeconds: 1800 });
  assert.equal(r.analyzedFrom, 'description+transcript');
  assert.equal(videoCalls, 0);
});

test('import (candidate): a video longer than the limit (or of unknown length) is not read halfway as if it were complete', async () => {
  let videoCalls = 0;
  const deps = (durationSeconds) => ({ fetchYouTubeSnippet: async () => ({ ...onlyIngredients, durationSeconds }), analyzeRecipeDescription: describe,
    analyzeRecipeVideo: async () => { videoCalls++; return fromVideo; } });
  await assert.rejects(importYouTubeRecipe(URL_, deps(2400), { videoIfNeeded: true, videoFullOnly: true, videoMaxSeconds: 1800 }), { code: 'video_too_long' });
  await assert.rejects(importYouTubeRecipe(URL_, deps(undefined), { forceVideo: true, videoFullOnly: true, videoMaxSeconds: 1800 }), { code: 'video_too_long' });
  assert.equal(videoCalls, 0);
});

test('candidate times: outside the video or going back in order become unknown (null); nothing is interpolated', () => {
  assert.deepEqual(cleanCandidateTimes([10, 700, 5, null, 300], 5, 675), { stepTimes: [10, null, null, null, 300], dropped: 2 });
  assert.deepEqual(cleanCandidateTimes([], 2, null), { stepTimes: [null, null], dropped: 0 });
});

test('cost: audio input is priced separately; a reply without usage is marked so the cost is not shown as 0円', async () => {
  const c = {};
  await usage.run(c, async () => {
    recordUsage('m', { usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 0, promptTokensDetails: [{ modality: 'AUDIO', tokenCount: 400_000 }, { modality: 'VIDEO', tokenCount: 600_000 }] } });
  });
  // 映像60万×$0.30 + 音声40万×$1.00 = $0.58 → 92.8円
  assert.equal(Math.round(usageYen(c, {}) * 10) / 10, 92.8);
  const d = {};
  await usage.run(d, async () => { recordUsage('m', {}); });
  assert.equal(d.unmetered, 1);
});

// ── サーバー：作る → 見る → 採用 ──
const oldRecipe = { title: '青のりクリームパスタ', videoId: V, videoUrl: URL_, ingredients: [{ name: 'パスタ', amount: '100g' }], steps: Array.from({ length: 10 }, (_, i) => `古い手順${i + 1}`),
  stepTimes: [5, 40, 80, 120, 200, 260, 330, 400, 900, 1200], dishName: '青のりパスタ', dishNameFrom: 'admin', guide: { steps: [{ text: 'x', from: [0] }] },
  snippetFetchedAt: new Date().toISOString(), catalog: { id: `youtube-${V}`, revision: 'r-old', analyzedAt: new Date().toISOString(), extractorVersion: 99 } };

async function serve(t, { importRecipe, env = {} } = {}) {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', ...env }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], importRecipe });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body, method) => { const r = await fetch(`${base}${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() }; };
  return { store, call, base };
}
const videoAnswer = { title: '青のりクリームパスタ', videoId: V, ingredients: [{ name: 'パスタ', amount: '100g' }], steps: ['パスタをゆでる', 'ソースを作る', '和える', '盛り付ける'], stepTimes: [30, 190, 700, 640], analyzedFrom: 'video', durationSeconds: 675 };

test('admin candidate: made without touching the saved recipe, with full-length options; checked times; progress shows it', async (t) => {
  let seen = null;
  const { store, call, base } = await serve(t, { importRecipe: async (url, o) => { seen = o; await o.reserveVideo(); return structuredClone(videoAnswer); } });
  assert.equal((await fetch(`${base}/api/admin/recipes/${V}/candidate`, { method: 'POST' })).status, 403);
  const made = await call(`/api/admin/recipes/${V}/candidate`, { mode: 'auto' });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal(seen.videoIfNeeded, true); assert.equal(seen.videoFullOnly, true); assert.equal(seen.videoMaxSeconds, 1800); assert.equal(seen.forceVideo, false);
  const c = made.body.candidate;
  assert.deepEqual(c.steps, videoAnswer.steps);
  assert.deepEqual(c.stepTimes, [30, 190, null, 640], 'beyond the video (700s) is unknown; the next one is still in order');
  assert.equal(c.droppedTimes, 1);
  assert.equal(c.dishName, '青のりパスタ', 'the admin dish name is kept');
  assert.equal(c.carriedAdminTimes, 0);
  // 保存済みのレシピは変わっていない
  const saved = (await store.get(`youtube-${V}`)).envelope.result;
  assert.equal(saved.steps.length, 10); assert.ok(saved.guide);
  assert.equal((await call(`/api/admin/recipes/${V}/candidate`)).body.candidate.candidateId, c.candidateId);
  const p = (await call(`/api/admin/recipes/${V}/reread/progress`)).body.progress;
  assert.equal(p.status, 'done'); assert.equal(p.outcome, 'candidate');
});

test('admin candidate adopt: needs the same candidate id and an unchanged recipe; replaces the old result (old one kept in history); guide is removed', async (t) => {
  const { store, call } = await serve(t, { importRecipe: async () => structuredClone(videoAnswer) });
  const first = (await call(`/api/admin/recipes/${V}/candidate`, { mode: 'video' })).body.candidate;
  const second = (await call(`/api/admin/recipes/${V}/candidate`, { mode: 'video' })).body.candidate;
  // 別のタブで作り直された古い候補は採用できない
  assert.equal((await call(`/api/admin/recipes/${V}/candidate/adopt`, { candidateId: first.candidateId })).body.error.code, 'candidate_changed');
  const ok = await call(`/api/admin/recipes/${V}/candidate/adopt`, { candidateId: second.candidateId });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual([ok.body.before, ok.body.after, ok.body.guideRemoved], [10, 4, true], 'fewer steps are allowed when the admin chose it');
  const saved = (await store.get(`youtube-${V}`)).envelope.result;
  assert.deepEqual(saved.steps, videoAnswer.steps);
  assert.deepEqual(saved.stepTimes, [30, 190, null, 640]);
  assert.equal(saved.guide, undefined);
  assert.notEqual(saved.catalog.revision, 'r-old');
  assert.equal(saved.adoptedFrom.mode, 'video');
  const history = await store.list('versions/', { max: 10 });
  const olds = await Promise.all(history.names.map((k) => store.get(k)));
  assert.ok(olds.some((x) => x.envelope.catalog?.revision === 'r-old' && x.envelope.stepTimes[9] === 1200), 'the replaced version is kept');
  assert.equal((await call(`/api/admin/recipes/${V}/candidate`)).body.candidate, null);
});

test('admin candidate adopt: refused when the recipe changed after the candidate was made, or the candidate expired', async (t) => {
  let now = Date.parse('2026-10-31T00:00:00Z');
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => structuredClone(videoAnswer), { now: () => now });
  const c = await catalog.makeCandidate(URL_, { mode: 'video' });
  await catalog.setDishName(URL_, 'パスタ');
  await assert.rejects(catalog.adoptCandidate(URL_, { candidateId: c.candidateId }), { code: 'catalog_conflict' });
  const c2 = await catalog.makeCandidate(URL_, { mode: 'video' });
  now += 25 * 3600_000;
  await assert.rejects(catalog.adoptCandidate(URL_, { candidateId: c2.candidateId }), { code: 'candidate_expired' });
  assert.equal(await catalog.candidate(URL_), null);
});

test('admin candidate: admin-fixed times are carried only to the very same step text', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: { ...oldRecipe, steps: ['パスタをゆでる', '古い手順', '盛り付ける'], stepTimes: [33, 100, 650], stepTimesFrom: 'admin' } }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => ({ ...structuredClone(videoAnswer), stepTimes: [] }));
  const c = await catalog.makeCandidate(URL_, { mode: 'video' });
  assert.deepEqual(c.stepTimes, [33, null, null, 650]);
  assert.equal(c.carriedAdminTimes, 2);
});

test('admin candidate: video reads are limited per day, AI calls per candidate are limited, and only one runs at a time', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const catalog = createRecipeCatalog(store, async (url, o) => {
    calls++;
    if (calls === 1) await slow;
    if (calls === 2) { for (let i = 0; i < 10; i++) await o.reserveBudget(); }
    await o.reserveVideo();
    return structuredClone(videoAnswer);
  }, { candidateVideoPerDay: 2 });
  const running = catalog.makeCandidate(URL_, { mode: 'video' });
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(catalog.makeCandidate(URL_, { mode: 'video' }), { code: 'candidate_pending' });
  release(); await running;
  await assert.rejects(catalog.makeCandidate(URL_, { mode: 'video' }), { code: 'candidate_ai_limit' });
  await catalog.makeCandidate(URL_, { mode: 'video' });
  await assert.rejects(catalog.makeCandidate(URL_, { mode: 'video' }), { code: 'candidate_video_limit' });
});

test('admin candidate (video mode): when the video gives no steps, it fails instead of quietly using the description', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => ({ ...structuredClone(videoAnswer), analyzedFrom: 'description' }));
  await assert.rejects(catalog.makeCandidate(URL_, { mode: 'video' }), { code: 'video_analysis_failed' });
  assert.equal(await catalog.candidate(URL_), null);
});
