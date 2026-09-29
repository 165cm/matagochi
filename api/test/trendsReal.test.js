import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { createTicketBook } from '../src/tickets.js';
import { importYouTubeRecipe } from '../src/importRecipe.js';
import { createTrendBook } from '../src/trends.js';

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
