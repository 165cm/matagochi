import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { createTicketBook } from '../src/tickets.js';
import { importYouTubeRecipe } from '../src/importRecipe.js';
import { createTrendBook } from '../src/trends.js';
import { analyzeRecipeVideo } from '../src/analyzer.js';

// 本物のカタログと取り込み（importYouTubeRecipe）を使い、外の AI と YouTube だけを偽物にする。
// 新着集めが数えた AI の回数と、実際に AI を呼んだ回数が一致するかを確かめる（Codex の結合検証と同じ形）。
const vid = (i) => `trv${String(i).padStart(8, '0')}`;
function world({ description = '材料：豚こま 200g、キャベツ 1/4玉、しょうゆ 大さじ1', videoFails = false, chapters = false } = {}) {
  const ai = { description: 0, video: 0, chapters: 0 };
  const deps = {
    fetchYouTubeSnippet: async (id) => ({ title: `料理${id}`, description: description + (chapters ? '\n0:00 切る\n0:30 炒める\n1:00 味付け' : ''), channelTitle: 'ch', channelId: `c-${id}`, durationSeconds: 120, privacyStatus: 'public' }),
    // 説明欄には材料だけ（作り方なし）→ 新着集めは動画でも読む
    analyzeRecipeDescription: async (s) => { ai.description++; return { title: s.title, ingredients: [{ name: '豚こま', amount: '200g' }, { name: 'キャベツ', amount: '1/4玉' }, { name: 'しょうゆ', amount: '大さじ1' }], steps: [], stepsInDescription: false }; },
    analyzeRecipeVideo: async () => { ai.video++; if (videoFails) throw Object.assign(new Error('video'), { code: 'video_analysis_failed', status: 502 }); return { steps: ['切る', '炒める', '味付けする'], stepTimes: [0, 30, 60] }; },
    matchStepsToChapters: async (steps) => { ai.chapters++; return { chapterIndex: steps.map((_, i) => i) }; },
  };
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store);
  const catalog = createRecipeCatalog(store, (url, options = {}) => importYouTubeRecipe(url, deps, { ...options, videoMaxSeconds: 600 }), { tickets, dailyLimit: 1000, monthlyLimit: 10000 });
  return { ai, store, catalog, total: () => ai.description + ai.video + ai.chapters };
}
const search = async () => Array.from({ length: 6 }, (_, i) => ({ videoId: vid(i), channelId: `c${i}`, title: 'レシピ' }));

test('review fix 3: the AI cap counts every real AI call (description again + video + chapters), and never goes over', async () => {
  for (const [aiPerDay, chapters] of [[2, false], [3, false], [5, true], [7, true]]) {
    const w = world({ chapters });
    const book = createTrendBook(w.store, { catalog: w.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 10, aiPerDay, aiPerWeek: 99, search });
    const r = await book.step();
    assert.equal(r.ai.today, w.total(), `cap ${aiPerDay}: counted ${r.ai.today}, real ${JSON.stringify(w.ai)}`);
    assert.ok(w.total() <= aiPerDay, `cap ${aiPerDay}: real ${w.total()}`);
    assert.equal(r.limited, 'trend_ai_budget');
    if (aiPerDay === 7) assert.ok(w.ai.chapters >= 1 && r.items >= 1, 'chapter matching ran and was counted');
  }
  // 1本を最後まで読むには、説明欄 → 説明欄（動画の前にもう一度）→ 動画 の3回。上限2なら0品で止まる（2回だけ使う）。
  const w = world();
  const r = await createTrendBook(w.store, { catalog: w.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 10, aiPerDay: 2, search }).step();
  assert.deepEqual([r.items, w.ai.description, w.ai.video], [0, 2, 0]);
});

test('review fix 4: a failed video read is reported as a failure to retry, not as an incomplete recipe', async () => {
  const w = world({ videoFails: true });
  const make = () => createTrendBook(w.store, { catalog: w.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 10, aiPerDay: 99, search });
  const r = await make().step();
  assert.equal(r.skipped.incomplete_recipe, undefined, 'not treated as "not a recipe"');
  assert.deepEqual([r.items, r.paused, r.done], [0, 'temporary_error', false]);
  assert.equal((await w.store.get('trends/index')).envelope.weeks[0].tried.length, 0, 'the video goes back to the candidates');
});

test('importer: only "analyzed but not a recipe" falls back to the description; other video failures reach the caller', async () => {
  const snippet = { title: '丼', description: '材料：米 2合', durationSeconds: 60 };
  const base = { fetchYouTubeSnippet: async () => snippet, analyzeRecipeDescription: async () => ({ title: '丼', ingredients: [{ name: '米', amount: '2合' }], steps: [] }) };
  await assert.rejects(importYouTubeRecipe('https://youtu.be/abcdefghijk', { ...base, analyzeRecipeVideo: async () => { throw Object.assign(new Error('x'), { code: 'video_analysis_failed', status: 502 }); } }, { forceVideo: true }), { code: 'video_analysis_failed' });
  await assert.rejects(importYouTubeRecipe('https://youtu.be/abcdefghijk', { ...base, analyzeRecipeVideo: async () => ({ steps: ['炊く'] }) }, { forceVideo: true, reserveBudget: async () => { throw Object.assign(new Error('b'), { code: 'analysis_budget_exceeded', status: 429 }); } }), { code: 'analysis_budget_exceeded' });
  const uncertain = await importYouTubeRecipe('https://youtu.be/abcdefghijk', { ...base, analyzeRecipeVideo: async () => { throw Object.assign(new Error('u'), { code: 'analysis_uncertain', status: 503 }); } }, { forceVideo: true });
  assert.equal(uncertain.ingredients.length, 1, 'analysis_uncertain keeps the description result');
});

// 動画の接続先の切り替え（Gemini API → Vertex の地域 → Vertex global）まで本物（analyzeRecipeVideo・generateFromVideo）。
// 外の接続先だけを偽物にし、どの接続先を何回呼んだかを数える。
function fallbackWorld({ failFirst = 2 } = {}) {
  const w = world();
  const hits = [];
  const answer = JSON.stringify({ title: '豚こまキャベツ', ingredients: [{ name: '豚こま', amount: '200g' }], steps: ['切る', '炒める', '味付けする'], stepTimes: [0, 30, 60], stepsComplete: true });
  const clients = ['gemini-api', 'vertex-us-central1', 'vertex-global'].map((name, i) => ({ name, ai: () => ({ models: { generateContent: async () => {
    hits.push(name);
    if (i < failFirst) throw new Error(`${name} could not read the video`);
    return { text: answer };
  } } }) }));
  // 本物の動画の読み取り（接続先の切り替えつき）を、取り込みにつなぐ。
  const deps = { analyzeRecipeVideo: (url, snippet, o) => analyzeRecipeVideo(url, snippet, {}, { ...o, clients }) };
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store);
  const base = {
    fetchYouTubeSnippet: async (id) => ({ title: `料理${id}`, description: '材料：豚こま 200g、キャベツ 1/4玉、しょうゆ 大さじ1', channelTitle: 'ch', channelId: `c-${id}`, durationSeconds: 120, privacyStatus: 'public' }),
    analyzeRecipeDescription: async (sn) => { w.ai.description++; return { title: sn.title, ingredients: [{ name: '豚こま', amount: '200g' }, { name: 'キャベツ', amount: '1/4玉' }, { name: 'しょうゆ', amount: '大さじ1' }], steps: [], stepsInDescription: false }; },
  };
  const catalog = createRecipeCatalog(store, (url, options = {}) => importYouTubeRecipe(url, { ...base, ...deps }, { ...options, videoMaxSeconds: 600 }), { tickets, dailyLimit: 1000, monthlyLimit: 10000 });
  return { store, catalog, hits, real: () => w.ai.description + hits.length };
}

test('review fix 5: switching the video endpoint (Gemini API → Vertex → global) is counted and capped call by call', async () => {
  // 上限3：説明欄2回＋動画1回目で3回。2つ目の接続先へ切り替える前に止まる（4回目を呼ばない）。
  let f = fallbackWorld({ failFirst: 2 });
  let r = await createTrendBook(f.store, { catalog: f.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 10, aiPerDay: 3, search }).step();
  assert.deepEqual(f.hits, ['gemini-api'], 'the second endpoint is not called over the cap');
  assert.equal(r.ai.today, f.real(), `counted ${r.ai.today}, real ${f.real()}`);
  assert.ok(f.real() <= 3);
  assert.equal(r.limited, 'trend_ai_budget', 'reaching the cap is not treated as a connection failure');
  assert.equal(r.skipped.video_analysis_failed, undefined);
  // 上限5：説明欄2回＋接続先3つ＝5回で1品読める。数えた回数＝実際の回数。
  f = fallbackWorld({ failFirst: 2 });
  r = await createTrendBook(f.store, { catalog: f.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 1, aiPerDay: 5, search }).step();
  assert.deepEqual(f.hits, ['gemini-api', 'vertex-us-central1', 'vertex-global']);
  assert.deepEqual([r.items, r.ai.today, f.real()], [1, 5, 5]);
  // どの上限でも、実際に呼んだ回数は上限を超えず、数えた回数と一致する。
  for (const cap of [1, 2, 3, 4, 5, 6, 8, 11]) {
    const g = fallbackWorld({ failFirst: 2 });
    const out = await createTrendBook(g.store, { catalog: g.catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), perDay: 10, aiPerDay: cap, search }).step();
    assert.equal(out.ai.today, g.real(), `cap ${cap}: counted ${out.ai.today}, real ${g.real()}`);
    assert.ok(g.real() <= cap, `cap ${cap}: real ${g.real()}`);
  }
});

test('video endpoints: a budget refusal before switching stops at once; a real read failure on every endpoint is still video_analysis_failed', async () => {
  const calls = [];
  const clients = ['a', 'b', 'c'].map((name) => ({ name, ai: () => ({ models: { generateContent: async () => { calls.push(name); throw new Error('down'); } } }) }));
  const refuse = async () => { throw Object.assign(new Error('budget'), { code: 'analysis_budget_exceeded', status: 429 }); };
  await assert.rejects(analyzeRecipeVideo('https://www.youtube.com/watch?v=abcdefghijk', { title: 'x' }, {}, { clients, beforeRetry: refuse }), { code: 'analysis_budget_exceeded' });
  assert.deepEqual(calls, ['a'], 'no further endpoint after the budget refusal');
  calls.length = 0;
  let checks = 0;
  await assert.rejects(analyzeRecipeVideo('https://www.youtube.com/watch?v=abcdefghijk', { title: 'x' }, {}, { clients, beforeRetry: async () => { checks++; } }), { code: 'video_analysis_failed' });
  assert.deepEqual([calls, checks], [['a', 'b', 'c'], 2], 'the budget is checked before each switch');
});
