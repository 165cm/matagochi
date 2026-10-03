import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, SEED_QUERIES, WAVE_TREND_WORDS, WAVE_CLASSIC_DISHES, WAVE_TREND_REUSE_DAYS, WORD_PRIOR_FAST, CHANNEL_MIN_READS, titleHint, wordScore, channelRate, channelFast } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-03：成績表（検索語・投稿者）と題名の見込みで、時短の料理を効率よく集める。定番の3本は説明欄の確認の後で数える。
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T01:00:00Z');
const id = (n) => `lern${String(n).padStart(7, '0')}`;
const recipe = (v, minutes = 10, steps = ['切る', '炒める']) => ({ title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'chX', ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps, tags: [], planning: { minutes } });
function fakeCatalog(make = (v) => recipe(v)) {
  const ready = new Map(), calls = [];
  return { ready, calls,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); calls.push(v);
      const r = make(v); ready.set(v, r); return r;
    } };
}
const start = (store, extra = {}) => store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [], ...extra }, { ifGeneration: 0 });

test('learn: title hints, word scores and channel rates are simple averages with a prior', () => {
  assert.equal(titleHint('【10分】豚こまのやみつき炒め'), 'fast');
  assert.equal(titleHint('レンジで簡単！鶏むね'), 'fast');
  assert.equal(titleHint('フライパン1つで晩ごはん'), 'fast');
  assert.equal(titleHint('じっくり煮込むビーフシチュー'), 'slow');
  assert.equal(titleHint('とろとろ角煮'), 'slow');
  assert.equal(titleHint('60分でできる本格カレー'), 'slow');
  assert.equal(titleHint('100均グッズで'), '', '"100" is not 10 minutes');
  assert.equal(titleHint('鮭のムニエル'), '');
  assert.equal(wordScore(undefined), WORD_PRIOR_FAST, 'an unused word starts at the prior');
  assert.equal(wordScore({ s: 1, fast: 0 }), 1);
  assert.equal(wordScore({ s: 2, fast: 7 }), 3);
  assert.equal(channelRate(undefined), 0.5);
  assert.equal(channelRate({ ai: 3, ok: 0 }), 0.2);
  assert.equal(channelRate({ ai: 3, ok: 1 }), 0.4);
  assert.equal(channelFast({ ok: 4, fast: 0 }), 1 / 6);
});

test('learn: the trend word with the best score (quick dishes per search) is used first; unused words are tried before poor ones', async () => {
  const store = createMemorySyncStore();
  const [good, poor] = [WAVE_TREND_WORDS[5], WAVE_TREND_WORDS[0]];
  const long = Date.parse('2026-01-01T00:00:00Z');
  await start(store, { waves: { turn: 0, trend: 0, trendAt: Object.fromEntries(WAVE_TREND_WORDS.map((w) => [w, new Date(long).toISOString()])), classic: 0, classicUsed: {}, log: [], n: 0,
    words: { [good]: { s: 2, fast: 8, added: 9 }, [poor]: { s: 3, fast: 0, added: 1 } } } });
  const searched = [];
  const book = createTrendBook(store, { catalog: fakeCatalog(), now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async (q) => { searched.push(q); return []; } });
  const r = await book.seed({ yen: 50, axis: 'trend' });
  const base = (q) => q.replace(/^時短 /, '');
  assert.equal(base(searched[0]), good, 'the best word first');
  assert.equal(base(searched.at(-1)), poor, 'the poor word last (after all unused words)');
  assert.equal(searched.length, WAVE_TREND_WORDS.length);
  const ws = r.waves.words;
  assert.equal(ws.find((x) => x.word === good).s, 3);
  assert.ok(ws.every((x, i) => i === 0 || ws[i - 1].score >= x.score), 'shown best first');
});

test('learn: each search word records how many dishes it added and how many were quick', async () => {
  const store = createMemorySyncStore();
  await start(store);
  const minutes = [10, 15, 30];
  const catalog = fakeCatalog((v) => recipe(v, minutes[Number(v.slice(-1))]));
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => [0, 1, 2].map((i) => ({ videoId: id(i), channelId: `c${i}`, title: '料理' })) });
  const r = await book.seed({ yen: 3, axis: 'trend' });
  const w = r.waves.words.find((x) => x.word === WAVE_TREND_WORDS[0]);
  assert.deepEqual([w.s, w.added, w.fast], [1, 2, 2], '30 minutes is left out by the 20% rule; 2 quick added');
  assert.equal(w.score, (2 + WORD_PRIOR_FAST) / 2);
});

test('learn: a channel that does not write recipes (3 reads, 0 dishes) is skipped before the AI; channel numbers count only AI reads', async () => {
  const store = createMemorySyncStore();
  await start(store, { channels: { bad: { ai: CHANNEL_MIN_READS, ok: 0, fast: 0 }, young: { ai: 2, ok: 0, fast: 0 } } });
  const catalog = fakeCatalog((v) => recipe(v, 10, v === id(3) ? [] : undefined));
  catalog.ready.set(id(4), recipe(id(4))); // もう読んだ（0円）→ 投稿者の成績に数えない
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => (n++ ? [] : [{ videoId: id(1), channelId: 'bad', title: '料理' }, { videoId: id(2), channelId: 'young', title: '料理' }, { videoId: id(3), channelId: 'good', title: '料理' }, { videoId: id(4), channelId: 'free', title: '料理' }]) });
  const r = await book.seed({ yen: 3, axis: 'trend' });
  assert.deepEqual(catalog.calls.sort(), [id(2), id(3)], 'the bad channel is not read');
  assert.equal(r.stage.skipped.channel_low, 1);
  const doc = (await store.get('trends/seed')).envelope;
  assert.ok(doc.tried.includes(id(1)), 'skipped as tried (it will not come back)');
  assert.deepEqual(doc.channels.young, { ai: 3, ok: 1, fast: 1 });
  assert.deepEqual(doc.channels.good, { ai: 1, ok: 0, fast: 0 }, 'no steps → read but not a dish');
  assert.equal(doc.channels.free, undefined, 'a free (already read) dish is not counted');
  assert.equal(r.waves.channels.learned, 3);
  assert.equal(r.waves.channels.skipped, 1);
  assert.equal(JSON.stringify(doc).includes('料理'), false, 'no titles are stored');
});

test('learn: with no room for a 30-minute dish, slow-looking titles and slow channels wait (not read, not marked tried); fast titles are read first', async () => {
  const store = createMemorySyncStore();
  await start(store, { channels: { slowch: { ai: 4, ok: 4, fast: 0 } } });
  const catalog = fakeCatalog();
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => (n++ ? [] : [{ videoId: id(1), channelId: 'a', title: 'じっくり煮込みハンバーグ' }, { videoId: id(2), channelId: 'slowch', title: '肉じゃが' }, { videoId: id(3), channelId: 'b', title: '普通の炒め物' }, { videoId: id(4), channelId: 'c', title: '10分でできる豚キムチ' }]) });
  const r = await book.seed({ yen: 2, axis: 'trend' });
  assert.deepEqual(catalog.calls, [id(4), id(3)], 'fast title first; slow ones are not read');
  assert.equal(r.stage.skipped.title_long, 1);
  assert.equal(r.stage.skipped.channel_slow, 1);
  const doc = (await store.get('trends/seed')).envelope;
  assert.ok(!doc.tried.includes(id(1)) && !doc.tried.includes(id(2)), 'they can come back when there is room');
});

test('learn: a classic search keeps 3 videos that pass the description check (not the first 3 found)', async () => {
  const store = createMemorySyncStore();
  await start(store);
  const catalog = fakeCatalog();
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    videoDetails: async (ids) => Object.fromEntries(ids.map((v) => [v, { status: 'public', snippet: { description: Number(v.slice(-2)) < 4 ? 'おいしい' : '材料\n豚肉 200g\nしょうゆ 大さじ1\n砂糖 小さじ1\n1. 切る\n2. 炒める' } }])),
    search: async () => Array.from({ length: 10 }, (_, i) => ({ videoId: id(i), channelId: `c${i}`, title: '料理' })) });
  const r = await book.seed({ yen: 3, axis: 'classic' });
  const e = r.waves.log.find((x) => !x.skipped);
  assert.equal(e.picked, 3);
  assert.equal(r.stage.skipped.description_not_recipe, 4);
  assert.equal(r.stage.skipped.classic_enough, 3);
  assert.deepEqual(r.stage.added.length, 3);
});

test('learn: old records (classic index) still work; the 16 new quick classics are next', async () => {
  const store = createMemorySyncStore();
  await start(store, { waves: { turn: 0, trend: 0, trendAt: {}, classic: 40, log: [], n: 0 } });
  const searched = [];
  const book = createTrendBook(store, { catalog: fakeCatalog(), now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async (q) => { searched.push(q); return []; } });
  const before = await book.seedStatus();
  assert.equal(WAVE_CLASSIC_DISHES.length, 56);
  const r = await book.seed({ yen: 50, axis: 'classic' });
  assert.equal(searched.length, 16);
  assert.equal(searched[0], `${WAVE_CLASSIC_DISHES[40][0]} 時短 レシピ 材料`);
  assert.equal(r.waves.classicLeft, 0);
  assert.ok(before);
});

test('learn: the admin status lists word scores and the channel summary', async (t) => {
  const store = createMemorySyncStore();
  await start(store, { channels: { x: { ai: 5, ok: 0, fast: 0 }, y: { ai: 2, ok: 2, fast: 1 } }, waves: { turn: 0, trend: 0, trendAt: {}, classic: 0, log: [], n: 0, words: { [WAVE_TREND_WORDS[1]]: { s: 1, fast: 3, added: 3 } } } });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const d = await (await fetch(base + '/api/admin/trends/seed', { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.deepEqual(d.waves.words[0], { word: WAVE_TREND_WORDS[1], axis: 'trend', s: 1, fast: 3, added: 3, score: 2.5 });
  assert.equal(d.waves.wordPrior, WORD_PRIOR_FAST);
  assert.deepEqual([d.waves.channels.learned, d.waves.channels.skipped], [2, 1]);
  assert.equal(d.waves.channels.top[0].id, 'x');
  assert.equal(WAVE_TREND_REUSE_DAYS * DAY > 0, true);
});

const longAgo = (n) => ({ stages: [{ n: 1, yen: 100, startedAt: '2026-10-04T00:00:00Z', ai: 0, input: 0, output: 0, added: Array.from({ length: n }, (_, i) => ({ videoId: `q${i}`, minutes: 10 })), skipped: {}, byQuery: {}, done: false }] });

test('review fix (#130): a saved dish (no AI needed) is never dropped by guesses about its channel or title; it is added for free by its real time', async () => {
  const store = createMemorySyncStore();
  await start(store, { channels: { bad: { ai: 3, ok: 0, fast: 0 }, slowch: { ai: 4, ok: 4, fast: 0 } } });
  const catalog = fakeCatalog();
  catalog.ready.set(id(1), recipe(id(1), 10)); // 作り方を書かない投稿者だが、もう読んだ料理（10分）
  catalog.ready.set(id(2), recipe(id(2), 15)); // 題名が長そう・時短の少ない投稿者だが、もう読んだ料理（15分）
  const desc = '材料\n豚肉 200g\nしょうゆ 大さじ1\n砂糖 小さじ1\n1. 切る\n2. 炒める';
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    videoDetails: async (ids) => Object.fromEntries(ids.map((v) => [v, { status: 'public', snippet: { description: desc } }])),
    search: async () => (n++ ? [] : [{ videoId: id(3), channelId: 'c3', title: '料理' }, { videoId: id(4), channelId: 'c4', title: '料理' }, { videoId: id(1), channelId: 'bad', title: '料理' }, { videoId: id(2), channelId: 'slowch', title: 'じっくり煮込み' }]) });
  const r = await book.seed({ yen: 2, axis: 'classic' });
  assert.deepEqual(r.stage.added.filter((a) => a.free).map((a) => a.videoId).sort(), [id(1), id(2)], 'both saved dishes are added for free');
  assert.equal(r.stage.added.length, 3, 'the 2 saved dishes count first among the 3, plus 1 read by the AI');
  assert.equal(catalog.calls.length, 1);
  assert.equal(r.stage.skipped.channel_low, undefined);
  assert.equal(r.stage.skipped.title_long, undefined);
});

test('review fix (#130): a candidate put off (title_long / channel_slow) is kept for later, retried at most once per run, and read once there is room', async () => {
  for (const [kind, video] of [['title_long', { videoId: id(7), channelId: 'c7', title: 'じっくり煮込み肉じゃが' }], ['channel_slow', { videoId: id(7), channelId: 'slowch', title: '肉じゃが' }]]) {
    let now = NOW;
    const store = createMemorySyncStore();
    await start(store, { channels: { slowch: { ai: 4, ok: 4, fast: 0 } } });
    const catalog = fakeCatalog((v) => recipe(v, 30));
    let first = true;
    const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search: async () => { if (first) { first = false; return [video]; } return []; } });
    const r1 = await book.seed({ yen: 5, axis: 'classic' });
    assert.equal(r1.stage.skipped[kind], 1, `${kind}: put off once in the run (no endless loop)`);
    assert.equal(r1.laterLeft, 1);
    let doc = (await store.get('trends/seed')).envelope;
    assert.ok(!doc.tried.includes(id(7)) && doc.later.some((c) => c.videoId === id(7)), 'kept for later, not marked tried');
    // 次の日：まだ枠がない → 後回しの列に残したまま（読まない・失わない）
    now += DAY;
    const r2 = await book.seed({ yen: 5, axis: 'classic' });
    assert.equal(r2.reason, 'axis_exhausted');
    assert.equal(r2.laterLeft, 1);
    assert.equal(catalog.calls.length, 0);
    // 時短が4品そろって、30分以上の枠が空く → 検索せずに後回しの候補を読む
    doc = (await store.get('trends/seed')).envelope;
    doc.stages = longAgo(4).stages;
    const cur = await store.get('trends/seed');
    await store.put('trends/seed', doc, { ifGeneration: cur.generation });
    now += DAY;
    const r3 = await book.seed({ yen: 5, axis: 'classic' });
    assert.deepEqual(catalog.calls, [id(7)], `${kind}: read once there is room`);
    assert.ok(r3.stage.added.some((a) => a.videoId === id(7)));
    assert.equal(r3.laterLeft, 0);
  }
});

test('review fix (#130 r2): a put-off candidate that became a saved dish meanwhile is decided by its real time, even with no room for a long dish', async () => {
  for (const [minutes, want] of [[10, 'added'], [45, 'long_quota_free']]) {
    let now = NOW;
    const store = createMemorySyncStore();
    await start(store);
    const catalog = fakeCatalog();
    let first = true;
    const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search: async () => { if (first) { first = false; return [{ videoId: id(8), channelId: 'c8', title: 'じっくり煮込み' }]; } return []; } });
    const r1 = await book.seed({ yen: 5, axis: 'classic' });
    assert.equal(r1.laterLeft, 1);
    catalog.ready.set(id(8), recipe(id(8), minutes)); // ほかの人の取り込みで保存済みになった
    now += DAY;
    const r2 = await book.seed({ yen: 5, axis: 'classic' });
    assert.equal(catalog.calls.length, 0, 'no AI');
    assert.equal(r2.laterLeft, 0);
    if (want === 'added') assert.ok(r2.stage.added.some((a) => a.videoId === id(8) && a.free));
    else assert.equal(r2.stage.skipped.long_quota_free, 1);
    assert.ok((await store.get('trends/seed')).envelope.tried.includes(id(8)));
  }
});

test('review fix (#130 r2): with room for just one long dish, put-off candidates come back one at a time (AI once, 1 added, 2 stay for later)', async () => {
  const store = createMemorySyncStore();
  await start(store, { later: [9, 10, 11].map((n) => ({ videoId: id(n), channelId: `c${n}`, label: '定番・肉', wave: 1, axis: 'classic', word: '肉じゃが', hint: 'slow' })), ...longAgo(4) });
  const catalog = fakeCatalog((v) => recipe(v, 30));
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => [] });
  const r = await book.seed({ yen: 5, axis: 'classic' });
  assert.equal(catalog.calls.length, 1, 'AI once');
  assert.equal(r.stage.added.filter((a) => a.minutes === 30).length, 1);
  assert.equal(r.stage.skipped.long_quota, undefined);
  assert.equal(r.laterLeft, 2, 'the other two wait');
  const doc = (await store.get('trends/seed')).envelope;
  assert.deepEqual(doc.later.map((c) => c.videoId), [id(10), id(11)]);
  assert.ok(!doc.tried.includes(id(10)) && !doc.tried.includes(id(11)));
});

test('review fix (#130 r2): quick results let the next put-off candidate be read in the same run', async () => {
  const store = createMemorySyncStore();
  await start(store, { later: [12, 13].map((n) => ({ videoId: id(n), channelId: `c${n}`, label: '定番・肉', wave: 1, axis: 'classic', word: '肉じゃが', hint: 'slow' })), ...longAgo(4) });
  const catalog = fakeCatalog((v) => recipe(v, 15));
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => [] });
  const r = await book.seed({ yen: 5, axis: 'classic' });
  assert.deepEqual(catalog.calls, [id(12), id(13)]);
  assert.equal(r.laterLeft, 0);
});
