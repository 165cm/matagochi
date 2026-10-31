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
  assert.deepEqual(cleanCandidateTimes([10, 700, 5, null, 300], 5, 675), { stepTimes: [10, null, null, null, 300], dropped: 2, suspects: [0], duplicates: [] });
  assert.deepEqual(cleanCandidateTimes([], 2, null), { stepTimes: [null, null], dropped: 0, suspects: [], duplicates: [] });
  // [500, 100, 200]：先頭の 500 が正しいとは限らないので「要確認」（review fix 2026-10-31）
  assert.deepEqual(cleanCandidateTimes([500, 100, 200], 3, null), { stepTimes: [500, null, null], dropped: 2, suspects: [0], duplicates: [] });
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

async function serve(t, { importRecipe, env = {}, deps = {} } = {}) {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', ...env }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], importRecipe, ...deps });
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
  // 時刻を保存した（版が変わった）後は断る
  await catalog.setStepTimes(URL_, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { baseRevision: 'r-old' });
  await assert.rejects(catalog.adoptCandidate(URL_, { candidateId: c.candidateId }), { code: 'catalog_conflict' });
  // 料理名を直しただけなら、候補を作り直さずに採用でき、直した料理名が引き継がれる（review 2026-10-31）
  const c1 = await catalog.makeCandidate(URL_, { mode: 'video' });
  await catalog.setDishName(URL_, 'クリームパスタ');
  await catalog.adoptCandidate(URL_, { candidateId: c1.candidateId });
  assert.equal((await store.get(`youtube-${V}`)).envelope.result.dishName, 'クリームパスタ');
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

// ── 手順の文を直す（APP_MAP §52-7） ──
test('admin steps edit: rows (text + time + needs-check) are saved together; needs-check times are kept aside and not used until confirmed', async (t) => {
  const { store, call } = await serve(t);
  const got = (await call(`/api/admin/recipes/${V}`)).body;
  assert.equal(got.revision, 'r-old');
  // 版が違えば断る
  assert.equal((await call(`/api/admin/recipes/${V}/steps`, { baseRevision: 'r-other', rows: [{ text: 'a' }, { text: 'b' }] }, 'PUT')).body.error.code, 'catalog_conflict');
  assert.equal((await call(`/api/admin/recipes/${V}/steps`, { baseRevision: 'r-old', rows: [{ text: 'a' }] }, 'PUT')).body.error.code, 'invalid_steps');
  const rows = [{ text: '古い手順2', time: 40 }, { text: 'パスタを  ゆでる（直した）', time: 5, pending: true }, { text: '新しい手順', time: null }];
  const saved = await call(`/api/admin/recipes/${V}/steps`, { baseRevision: 'r-old', rows }, 'PUT');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.steps, ['古い手順2', 'パスタを ゆでる（直した）', '新しい手順']);
  assert.deepEqual(saved.body.stepTimes, [40, null, null]);
  assert.deepEqual(saved.body.stepTimesPending, [null, 5, null]);
  assert.equal(saved.body.guideRemoved, true);
  const r = (await store.get(`youtube-${V}`)).envelope.result;
  assert.equal(r.guide, undefined); assert.equal(r.stepTimesFrom, 'admin'); assert.notEqual(r.catalog.revision, 'r-old');
  // 作る画面の ▶ にも、確かめ済みの時刻だけ（要確認の 5秒 は入らない）
  const view = (await call(`/api/admin/recipes/${V}`)).body;
  assert.deepEqual(view.stepTimes, [40, null, null]);
  assert.deepEqual(view.stepTimesPending, [null, 5, null]);
  // 運営が時刻を保存したら、要確認は確定（なくなる）
  await call(`/api/admin/recipes/${V}/step-times`, { stepTimes: [40, 5, null], baseRevision: view.revision }, 'PUT');
  const after = (await store.get(`youtube-${V}`)).envelope.result;
  assert.deepEqual(after.stepTimes, [40, 5, null]);
  assert.equal(after.stepTimesPending, undefined);
  // 前の版は履歴に残っている
  const names = (await store.list('versions/', { max: 10 })).names;
  assert.ok((await Promise.all(names.map((k) => store.get(k)))).some((x) => x.envelope.catalog?.revision === 'r-old'));
});

// ── review fix（2026-10-31・Codex の再現4件） ──
const { createHash } = await import('node:crypto');
const tcKey = (steps) => `timecodes/${V}-${createHash('sha256').update(steps.join('\n')).digest('hex').slice(0, 16)}`;
const quietDeps = (count) => ({
  fetchYouTubeTranscript: async () => { count.transcript++; return { status: 'not_available', reason: 'unplayable' }; },
  fetchYouTubeSnippet: async () => ({ title: 't', description: '', durationSeconds: 675 }),
  analyzeStepTimes: async () => { count.video++; return { stepTimes: [] }; }
});
const shared = async (base, steps) => (await (await fetch(`${base}/api/import/youtube/timecodes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-household': 'home-review-1' }, body: JSON.stringify({ url: URL_, steps, peek: true }) })).json());

test('review fix P1-1: after adopting a candidate, an older transcript cache for the same steps no longer wins on the cook screen', async (t) => {
  const count = { transcript: 0, video: 0 };
  const { store, call, base } = await serve(t, { importRecipe: async () => structuredClone(videoAnswer), deps: quietDeps(count) });
  await store.put(tcKey(videoAnswer.steps), { stepTimes: [10, 30, 50, 70], source: 'transcript', transcriptChecked: true, transcriptMatched: true, chaptersChecked: true }, { ifGeneration: 0 });
  const c = (await call(`/api/admin/recipes/${V}/candidate`, { mode: 'video' })).body.candidate;
  const ok = (await call(`/api/admin/recipes/${V}/candidate/adopt`, { candidateId: c.candidateId })).body;
  assert.equal(ok.sharedTimes, 'ok');
  // peek（レシピに時刻がある時の問い合わせ）：古い字幕の時刻はもう返らない（作る画面はレシピの採用した時刻を使う）
  assert.deepEqual((await shared(base, videoAnswer.steps)).stepTimes, []);
  const full = await (await fetch(`${base}/api/import/youtube/timecodes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-household': 'home-review-1' }, body: JSON.stringify({ url: URL_, steps: videoAnswer.steps }) })).json();
  assert.deepEqual(full.stepTimes, [30, 190, null, 640]);
  assert.equal(count.video, 0);
  assert.deepEqual((await call(`/api/admin/recipes/${V}`)).body.stepTimes, [30, 190, null, 640]);
});

test('review fix P1-1b: a time just before one that goes back is "needs check" after adopting, and is not searched or used until confirmed', async (t) => {
  const count = { transcript: 0, video: 0 };
  const { call, base } = await serve(t, { importRecipe: async () => ({ ...structuredClone(videoAnswer), stepTimes: [500, 100, 200, 300] }), deps: quietDeps(count) });
  const c = (await call(`/api/admin/recipes/${V}/candidate`, { mode: 'video' })).body.candidate;
  assert.deepEqual(c.suspectTimes, [0]);
  const ok = (await call(`/api/admin/recipes/${V}/candidate/adopt`, { candidateId: c.candidateId })).body;
  assert.equal(ok.pending, 1);
  const view = (await call(`/api/admin/recipes/${V}`)).body;
  assert.deepEqual(view.stepTimes, [null, null, null, null]);
  assert.deepEqual(view.stepTimesPending, [500, null, null, null]);
  const before = { ...count };
  assert.deepEqual((await shared(base, videoAnswer.steps)).stepTimes, [null, null, null, null]);
  assert.deepEqual(count, before, 'no subtitle fetch or video search while it waits for a check');
});

test('review fix P1-2: marking every time as "needs check" does not bring the old times back (admin view and cook screen)', async (t) => {
  const count = { transcript: 0, video: 0 };
  const { store, call, base } = await serve(t, { deps: quietDeps(count) });
  const steps = ['古い手順1', '古い手順2'];
  await store.put(tcKey(steps), { stepTimes: [10, 30], source: 'transcript', transcriptChecked: true, transcriptMatched: true, chaptersChecked: true }, { ifGeneration: 0 });
  const saved = (await call(`/api/admin/recipes/${V}/steps`, { baseRevision: 'r-old', rows: [{ text: steps[0], time: 10, pending: true }, { text: steps[1], time: 30, pending: true }] }, 'PUT')).body;
  assert.equal(saved.sharedTimes, 'ok');
  const view = (await call(`/api/admin/recipes/${V}`)).body;
  assert.deepEqual(view.stepTimes, [null, null]);
  assert.deepEqual(view.stepTimesPending, [10, 30]);
  assert.deepEqual((await shared(base, steps)).stepTimes, [null, null]);
  assert.equal(count.video, 0);
});

test('review fix P1-3: an old editor cannot overwrite times saved in another tab (times change the version too)', async (t) => {
  const { call } = await serve(t);
  const opened = (await call(`/api/admin/recipes/${V}`)).body;
  const other = await call(`/api/admin/recipes/${V}/step-times`, { stepTimes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], baseRevision: opened.revision }, 'PUT');
  assert.equal(other.status, 200);
  assert.notEqual(other.body.revision, opened.revision);
  const stale = await call(`/api/admin/recipes/${V}/steps`, { baseRevision: opened.revision, rows: [{ text: 'a', time: 5 }, { text: 'b', time: 6 }] }, 'PUT');
  assert.equal(stale.body.error.code, 'catalog_conflict');
  const staleTimes = await call(`/api/admin/recipes/${V}/step-times`, { stepTimes: [9, 9, 9, 9, 9, 9, 9, 9, 9, 9], baseRevision: opened.revision }, 'PUT');
  assert.equal(staleTimes.body.error.code, 'catalog_conflict');
});

test('review fix P2-4: when the old version cannot be kept in history, adopting and editing stop without replacing the recipe', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => structuredClone(videoAnswer));
  const c = await catalog.makeCandidate(URL_, { mode: 'video' });
  const put = store.put.bind(store);
  store.put = async (key, ...rest) => { if (key.startsWith('versions/')) throw new Error('storage down'); return put(key, ...rest); };
  await assert.rejects(catalog.adoptCandidate(URL_, { candidateId: c.candidateId }), { code: 'history_failed' });
  await assert.rejects(catalog.setSteps(URL_, { baseRevision: 'r-old', rows: [{ text: 'a' }, { text: 'b' }] }), { code: 'history_failed' });
  assert.equal((await store.get(`youtube-${V}`)).envelope.result.steps.length, 10);
});

// ── review fix 2（2026-10-31・Codex の再現3件） ──
test('review fix 2 P1-2: an earlier save that finishes late does not write its old times over a later save', async (t) => {
  const { store, call } = await serve(t, { deps: quietDeps({ transcript: 0, video: 0 }) });
  let release, armed = false;
  const gate = new Promise((resolve) => { release = resolve; });
  const get = store.get.bind(store);
  store.get = async (key, ...rest) => { if (armed && key.startsWith('timecodes/')) { armed = false; await gate; } return get(key, ...rest); };
  const opened = (await call(`/api/admin/recipes/${V}`)).body;
  armed = true; // 次の時刻の保存（A の書き込み）だけを止める
  const timesA = [20, 40, 80, 120, 200, 260, 330, 400, 500, 600], timesB = [30, 60, 90, 130, 210, 270, 340, 410, 510, 610];
  const a = call(`/api/admin/recipes/${V}/step-times`, { stepTimes: timesA, baseRevision: opened.revision }, 'PUT');
  await new Promise((r) => setTimeout(r, 30));
  const mid = (await call(`/api/admin/recipes/${V}`)).body;
  const b = await call(`/api/admin/recipes/${V}/step-times`, { stepTimes: timesB, baseRevision: mid.revision }, 'PUT');
  assert.equal(b.body.sharedTimes, 'ok');
  release();
  assert.equal((await a).body.sharedTimes, 'superseded');
  assert.deepEqual((await call(`/api/admin/recipes/${V}`)).body.stepTimes, timesB);
  assert.deepEqual((await store.get(tcKey(oldRecipe.steps))).envelope.stepTimes, timesB);
});

test('review fix 2 P1-2b: shared times written for an older recipe version are not shown in the admin view', async (t) => {
  const { store, call } = await serve(t);
  await store.put(tcKey(oldRecipe.steps), { stepTimes: oldRecipe.steps.map(() => 99), source: 'fix', recipeRevision: 'r-stale' }, { ifGeneration: 0 });
  assert.deepEqual((await call(`/api/admin/recipes/${V}`)).body.stepTimes, oldRecipe.stepTimes);
});

test('review fix 2 P2-3: on the real import path, a time that goes back still marks the one before it as needs-check', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const deps = { fetchYouTubeSnippet: async () => onlyIngredients, analyzeRecipeDescription: describe,
    fetchYouTubeTranscript: async () => ({ status: 'not_available', reason: 'unplayable' }),
    analyzeRecipeVideo: async () => ({ ...fromVideo, stepTimes: [10, 30, 20, 40] }) };
  const catalog = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, deps, o));
  const c = await catalog.makeCandidate(URL_, { mode: 'auto' });
  assert.deepEqual(c.stepTimes, [10, 30, null, 40]);
  assert.deepEqual(c.suspectTimes, [1]);
  assert.equal(c.droppedTimes, 1);
});

// ── review fix 3（2026-10-31・Codex の再現2件） ──
test('review fix 3 P1: the cook-screen API does not return admin times written for an older recipe version (same steps)', async (t) => {
  const count = { transcript: 0, video: 0 };
  const { store, base } = await serve(t, { deps: quietDeps(count) });
  await store.put(tcKey(oldRecipe.steps), { stepTimes: oldRecipe.steps.map(() => 90), source: 'fix', recipeRevision: 'r-stale' }, { ifGeneration: 0 });
  assert.deepEqual((await shared(base, oldRecipe.steps)).stepTimes, oldRecipe.stepTimes);
  const full = await (await fetch(`${base}/api/import/youtube/timecodes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-household': 'home-review-2' }, body: JSON.stringify({ url: URL_, steps: oldRecipe.steps }) })).json();
  assert.deepEqual(full.stepTimes, oldRecipe.stepTimes);
  assert.deepEqual(count, { transcript: 0, video: 0 });
  // 手順の違う古いレシピ（利用者の手元に残っている版）への時刻は、そのまま返す
  const otherSteps = ['別の手順1', '別の手順2'];
  await store.put(tcKey(otherSteps), { stepTimes: [7, 8], source: 'fix', recipeRevision: 'r-stale' }, { ifGeneration: 0 });
  assert.deepEqual((await shared(base, otherSteps)).stepTimes, [7, 8]);
});

test('review fix 3 P2: on the chapter path too, a time that goes back marks the one before it as needs-check', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const steps = ['ゆでる', 'ソースを作る', '和える', '盛る'];
  const deps = { fetchYouTubeSnippet: async () => ({ ...onlyIngredients, description: `${onlyIngredients.description}\n0:00 はじめに\n0:10 ゆでる\n0:20 和える\n0:30 ソース\n0:40 盛る` }),
    analyzeRecipeDescription: async () => ({ title: '青のりクリームパスタ', ingredients: [{ name: 'パスタ', amount: '100g' }], steps }),
    fetchYouTubeTranscript: async () => ({ status: 'not_available', reason: 'unplayable' }),
    matchStepsToChapters: async () => ({ chapterIndex: [2, 4, 3, 5] }) };
  const catalog = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, deps, o));
  const c = await catalog.makeCandidate(URL_, { mode: 'auto' });
  assert.equal(c.stepTimesFrom, 'chapters');
  assert.deepEqual(c.stepTimes, [10, 30, null, 40]);
  assert.deepEqual(c.suspectTimes, [1]);
  assert.equal(c.droppedTimes, 1);
});

// ── review fix 4（2026-10-31・Codex：全部が要確認の時に端末の古い時刻へ戻る） ──
test('review fix 4 P1: when every current time is waiting for a check, the cook-screen API says cleared so old device times are not used', async (t) => {
  const count = { transcript: 0, video: 0 };
  const { store, base } = await serve(t, { deps: quietDeps(count) });
  const steps = ['古い手順1', '古い手順2'];
  // いまのレシピ：確定 [null, null]・要確認 [10, 30]。キャッシュは古い版のまま（保存の途中で失敗した）
  const cur = (await store.get(`youtube-${V}`));
  await store.put(`youtube-${V}`, { ...cur.envelope, result: { ...cur.envelope.result, steps, stepTimes: [null, null], stepTimesPending: [10, 30], catalog: { ...cur.envelope.result.catalog, revision: 'r-now' } } }, { ifGeneration: cur.generation });
  await store.put(tcKey(steps), { stepTimes: [90, 95], source: 'fix', recipeRevision: 'r-stale' }, { ifGeneration: 0 });
  const r = await shared(base, steps);
  assert.deepEqual(r.stepTimes, [null, null]);
  assert.equal(r.cleared, true);
  // 採用した候補で、確かめ済みの時刻が1つもない時（pendingCheck）も同じ
  await store.put(tcKey(steps), { stepTimes: [null, null], source: 'video', pendingCheck: true, chaptersChecked: true }, { ifGeneration: (await store.get(tcKey(steps))).generation });
  assert.equal((await shared(base, steps)).cleared, true);
  assert.deepEqual(count, { transcript: 0, video: 0 });
});

// ── おおまかな章で時刻が重なる（2026-10-31・oWLCye3SXu4。Gemini・Codex で原因を確認） ──
test('candidate times: the same time as the step before is needs-check (all same, a gap in between, at the end)', () => {
  assert.deepEqual(cleanCandidateTimes([16, 16, 121, 159, 159], 5, 400), { stepTimes: [16, 16, 121, 159, 159], dropped: 0, suspects: [1, 4], duplicates: [1, 4] });
  assert.deepEqual(cleanCandidateTimes([10, 10, 10], 3, null).duplicates, [1, 2]);
  assert.deepEqual(cleanCandidateTimes([10, null, 10, 20], 4, null).duplicates, [2]);
  assert.deepEqual(cleanCandidateTimes([10, 20, 20], 3, null).duplicates, [2]);
});

const chapterDesc = `${onlyIngredients.description}\n0:00 はじめに\n0:16 鶏・野菜下ごしらえ\n2:01 鶏肉火入れ\n2:39 野菜火入れ\n3:48 ソース作り\n5:27 鶏を再熱・仕上げ`;
const sixSteps = ['鶏むね肉を開く', '玉ねぎを刻む', '鶏肉を焼く', '玉ねぎを炒める', 'マッシュルームを炒める', 'ソースを作る'];

test('coarse chapters (oWLCye3SXu4): candidate shows where the times came from, duplicates are needs-check and stay unused after adopting', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const deps = { fetchYouTubeSnippet: async () => ({ ...onlyIngredients, description: chapterDesc }),
    analyzeRecipeDescription: async () => ({ title: '鶏むね肉のマッシュルームソース', ingredients: [{ name: '鶏むね肉', amount: '1枚' }], steps: sixSteps }),
    fetchYouTubeTranscript: async () => ({ status: 'not_available', reason: 'unplayable' }),
    matchStepsToChapters: async () => ({ chapterIndex: [2, 2, 3, 4, 4, 5] }) };
  const catalog = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, deps, o));
  const c = await catalog.makeCandidate(URL_, { mode: 'auto' });
  assert.equal(c.timesFrom, 'chapters');
  assert.deepEqual(c.stepTimes, [16, 16, 121, 159, 159, 228]);
  assert.deepEqual(c.duplicateTimes, [1, 4]);
  await catalog.adoptCandidate(URL_, { candidateId: c.candidateId });
  const saved = (await store.get(`youtube-${V}`)).envelope.result;
  assert.deepEqual(saved.stepTimes, [16, null, 121, 159, null, 228]);
  assert.deepEqual(saved.stepTimesPending, [null, 16, null, null, 159, null]);
});

test('problem A: times found in the video are not overwritten by coarse chapters; precise chapters still win', async () => {
  const run = (chapterIndex) => importYouTubeRecipe(URL_, {
    fetchYouTubeSnippet: async () => ({ ...onlyIngredients, description: chapterDesc }),
    analyzeRecipeDescription: describe,
    analyzeRecipeVideo: async () => ({ ...fromVideo, steps: sixSteps.slice(0, 4), stepTimes: [20, 65, 125, 170] }),
    matchStepsToChapters: async () => ({ chapterIndex })
  }, { forceVideo: true });
  const coarse = await run([2, 2, 3, 4]);
  assert.deepEqual(coarse.stepTimes, [20, 65, 125, 170]);
  assert.equal(coarse.stepTimesFrom, undefined);
  // 1手順に1つの章（重ならない）なら、これまでどおり投稿者の章の時刻を使う
  const precise = await run([2, 3, 4, 5]);
  assert.deepEqual(precise.stepTimes, [16, 121, 159, 228]);
  assert.equal(precise.stepTimesFrom, 'chapters');
});

test('Codex review #210: a duplicate that the carried admin times resolve is not left as needs-check', async () => {
  const store = createMemorySyncStore();
  const steps = ['切る', '焼く', '盛る'];
  await store.put(`youtube-${V}`, { status: 'ready', result: { ...oldRecipe, steps, stepTimes: [10, 20, 30], stepTimesFrom: 'admin' } }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => ({ ...structuredClone(videoAnswer), steps, stepTimes: [10, 10, 30] }));
  const c = await catalog.makeCandidate(URL_, { mode: 'video' });
  assert.deepEqual(c.stepTimes, [10, 20, 30]);
  assert.deepEqual(c.duplicateTimes, []);
  assert.deepEqual(c.suspectTimes, []);
  await catalog.adoptCandidate(URL_, { candidateId: c.candidateId });
  const saved = (await store.get(`youtube-${V}`)).envelope.result;
  assert.deepEqual(saved.stepTimes, [10, 20, 30]);
  assert.equal(saved.stepTimesPending, undefined);
});

// ── 作り直しを1つのボタンに・字幕の貼り付け（2026-10-31 のユーザーの判断：A案＋貼り付け） ──
const { parseTranscriptText } = await import('../src/transcript.js');

test('pasted subtitles: YouTube "transcript" copy (time line + text line), one-line form, and SRT are read; times going back are skipped', () => {
  assert.deepEqual(parseTranscriptText('0:16\n鶏むね肉を開きます\n続けて塩\n2:01\n焼きます').map((x) => [x.start, x.text]), [[16, '鶏むね肉を開きます 続けて塩'], [121, '焼きます']]);
  assert.deepEqual(parseTranscriptText('0:16 開きます\n1:02:03 盛ります').map((x) => x.start), [16, 3723]);
  assert.deepEqual(parseTranscriptText('WEBVTT\n\n1\n00:00:16,000 --> 00:00:18,500\n切ります').map((x) => [x.start, x.text]), [[16, '切ります']]);
  assert.deepEqual(parseTranscriptText('0:30 a\n0:10 b\n0:40 c').map((x) => x.start), [30, 40]);
  assert.deepEqual(parseTranscriptText('字幕ではない文'), []);
});

const pastedDeps = (hybrid, count) => ({
  fetchYouTubeSnippet: async () => ({ ...onlyIngredients, durationSeconds: 400 }),
  analyzeRecipeDescription: describe,
  fetchYouTubeTranscript: async () => { count.fetch++; return { status: 'not_available', reason: 'unplayable' }; },
  buildHybridRecipeSteps: async (args) => { count.hybrid++; assert.ok(args.formattedTranscript.includes('ゆでます')); return hybrid; },
  analyzeRecipeVideo: async () => { count.video++; return fromVideo; }
});
const pasted = parseTranscriptText('0:10\nパスタをゆでます\n1:40\nソースを作ります\n4:20\n和えます\n6:00\n盛り付けます');

test('transcript mode: the pasted subtitles are used instead of fetching from YouTube; no video is read', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const count = { fetch: 0, hybrid: 0, video: 0 };
  const catalog = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, pastedDeps({ steps: ['パスタをゆでる', 'ソースを作る', '和える', '盛り付ける'], stepTimes: [10, 100, 260, 360], stepsComplete: true }, count), o));
  const c = await catalog.makeCandidate(URL_, { mode: 'transcript', transcriptItems: pasted });
  assert.deepEqual(count, { fetch: 0, hybrid: 1, video: 0 });
  assert.equal(c.analyzedFrom, 'description+transcript');
  assert.equal(c.timesFrom, 'transcript');
  assert.deepEqual(c.stepTimes, [10, 100, 260, 360]);
  assert.deepEqual(c.check, { ok: true, reasons: [] });
  // 時刻つきの行が少なすぎる／字幕で手順を作れなかった時は、はっきり断る
  await assert.rejects(catalog.makeCandidate(URL_, { mode: 'transcript', transcriptItems: pasted.slice(0, 2) }), { code: 'transcript_unreadable' });
  const rejected = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, pastedDeps(null, count), o));
  await assert.rejects(rejected.makeCandidate(URL_, { mode: 'transcript', transcriptItems: pasted }), { code: 'transcript_unused' });
});

test('basic mode (the one "rebuild" button): never reads the video by itself; the result says what to try next', async () => {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: oldRecipe }, { ifGeneration: 0 });
  const count = { fetch: 0, hybrid: 0, video: 0 };
  const noSteps = createRecipeCatalog(store, (url, o) => importYouTubeRecipe(url, pastedDeps(null, count), o));
  await assert.rejects(noSteps.makeCandidate(URL_, { mode: 'basic' }), { code: 'incomplete_recipe' });
  assert.equal(count.video, 0);
  // 章がおおまか → 見立ては「重なる」
  const coarse = createRecipeCatalog(store, async () => ({ ...structuredClone(videoAnswer), analyzedFrom: 'description', stepTimesFrom: 'chapters', stepTimes: [16, 16, 121, null] }));
  const c = await coarse.makeCandidate(URL_, { mode: 'basic' });
  assert.deepEqual(c.check, { ok: false, reasons: ['duplicates'] });
  const few = createRecipeCatalog(store, async () => ({ ...structuredClone(videoAnswer), analyzedFrom: 'description', stepTimes: [16, null, null, null] }));
  assert.deepEqual((await few.makeCandidate(URL_, { mode: 'basic' })).check.reasons, ['times_few']);
});

test('server: pasted subtitles (larger than the usual 64KB) are accepted, and the remaining video reads for today are shown', async (t) => {
  let seen = null;
  const { call } = await serve(t, { importRecipe: async (url, o) => { seen = o; return { ...structuredClone(videoAnswer), analyzedFrom: 'description+transcript', stepTimesFrom: 'transcript' }; }, env: { CANDIDATE_VIDEO_PER_DAY: '3' } });
  const long = Array.from({ length: 3000 }, (_, i) => `${Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}\n鶏むね肉を焼いていきます`).join('\n');
  assert.ok(Buffer.byteLength(long) > 64 * 1024);
  const r = await call(`/api/admin/recipes/${V}/candidate`, { mode: 'transcript', transcript: long });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(seen.transcriptItems.length, 3000);
  assert.equal(r.body.videoLeft, 3);
  assert.equal((await call(`/api/admin/recipes/${V}/candidate`)).body.videoLeft, 3);
});
