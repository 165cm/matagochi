import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, SEED_QUERIES, portfolioMax, DIG_REUSE_DAYS, WAVE_SEARCH_PER_DAY } from '../src/trends.js';
import { pacificDay } from '../src/searchQuota.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-03：新着全体で1人の投稿者が3%を超えない・当たり投稿者の深掘り。
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T01:00:00Z');
const id = (n) => `port${String(n).padStart(7, '0')}`;
const recipe = (v, channelId, minutes = 10) => ({ title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId, channelTitle: `名前${channelId}`, ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], planning: { minutes } });
function fakeCatalog(channelOf) {
  const ready = new Map(), calls = [];
  return { ready, calls,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); calls.push(v);
      const r = recipe(v, channelOf(v)); ready.set(v, r); return r;
    } };
}
// 新着に total 品（チャンネル A が a 品、ほかは1人1品）。
async function withList(store, catalog, total, a) {
  const items = [];
  for (let i = 0; i < total; i++) { const v = id(9000 + i); catalog.ready.set(v, recipe(v, i < a ? 'A' : `o${i}`)); items.push({ videoId: v }); }
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items, skipped: {} }] }, { ifGeneration: 0 });
}
const start = (store, extra = {}) => store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [], ...extra }, { ifGeneration: 0 });

test('portfolio: one channel may have at most 3% of the whole list after adding (1 while the list is small)', () => {
  assert.equal(portfolioMax(0), 1);
  assert.equal(portfolioMax(33), 1);
  assert.equal(portfolioMax(99), 3);
  assert.equal(portfolioMax(180), 5);
});

test('portfolio: a channel already at 3% is not read (no AI) and not marked tried; others are added', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog((v) => (v === id(1) ? 'A' : 'B'));
  await withList(store, catalog, 99, 3);
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => (n++ ? [] : [{ videoId: id(1), channelId: 'A', title: '料理' }, { videoId: id(2), channelId: 'B', title: '料理' }]) });
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.deepEqual(catalog.calls, [id(2)]);
  assert.equal(r.stage.skipped.channel_cap, 1);
  assert.ok(!(await store.get('trends/seed')).envelope.tried.includes(id(1)));
});

test('portfolio: videos of one channel in the same batch are not all read when only one more fits', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'A');
  await withList(store, catalog, 99, 2);
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => (n++ ? [] : [1, 2].map((i) => ({ videoId: id(i), channelId: 'A', title: '料理' }))) });
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(catalog.calls.length, 1, 'AI once');
  assert.equal(r.stage.added.length, 1);
  assert.equal(r.stage.skipped.channel_cap, 1);
});

test('portfolio: a channel found only after reading (no channel in the search result) is checked again before adding', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'A');
  await withList(store, catalog, 99, 3);
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => (n++ ? [] : [{ videoId: id(1), channelId: '', title: '料理' }]) });
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(r.stage.added.length, 0);
  assert.equal(r.stage.skipped.channel_cap_read, 1);
});

test('dig: the best channel (recipes and quick dishes) is read from its uploads without a search; the same channel waits 14 days', async () => {
  let now = NOW;
  const store = createMemorySyncStore();
  const catalog = fakeCatalog((v) => (v.startsWith('port') ? 'G' : 'x'));
  await withList(store, catalog, 120, 0);
  await start(store, { channels: { G: { ai: 4, ok: 4, fast: 4 }, M: { ai: 4, ok: 3, fast: 0 }, L: { ai: 1, ok: 1, fast: 1 }, B: { ai: 4, ok: 1, fast: 1 } } });
  const uploadsOf = [], searched = [];
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000,
    channelUploads: async (ch, o) => { uploadsOf.push([ch, o.maxResults]); return ch === 'G' ? [1, 2].map((i) => ({ videoId: id(i), title: '10分 豚こま' })) : []; },
    search: async (q) => { searched.push(q); return []; } });
  const r = await book.seed({ yen: 2, axis: 'channel' });
  assert.equal(uploadsOf[0][0], 'G', 'the best scorer first (M has no quick dishes, L too few, B low rate)');
  assert.equal(searched.length, 0, 'no search');
  assert.equal(r.stage.added.length, 2);
  assert.equal(r.stage.byAxis.channel, 2);
  const e = r.waves.log.find((x) => x.axis === 'channel' && x.q === 'G');
  assert.deepEqual([e.picked, e.ai, e.added], [2, 2, 2]);
  now += DAY;
  uploadsOf.length = 0;
  const r2 = await book.seed({ yen: 5, axis: 'channel' });
  assert.deepEqual(uploadsOf.map(([c]) => c), ['M'], 'G waits; M is next');
  assert.equal(r2.reason, 'axis_exhausted');
  now += DIG_REUSE_DAYS * DAY;
  uploadsOf.length = 0;
  await book.seed({ yen: 5, axis: 'channel' });
  assert.equal(uploadsOf[0][0], 'G', 'after 14 days again');
});

test('dig: in the mixed mode it also runs after the search limit is reached (it uses no search)', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'G');
  await withList(store, catalog, 120, 0);
  await start(store, { channels: { G: { ai: 4, ok: 4, fast: 4 } }, waves: { turn: 0, trend: 0, trendAt: {}, classic: 0, log: [], n: 0, day: { on: pacificDay(NOW), n: WAVE_SEARCH_PER_DAY } } });
  const uploadsOf = [];
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    channelUploads: async (ch) => { uploadsOf.push(ch); return [{ videoId: id(5), title: '料理' }]; }, search: async () => { throw new Error('should not search'); } });
  const r = await book.seed({ yen: 5 });
  assert.deepEqual(uploadsOf, ['G']);
  assert.equal(r.stage.added.length, 1);
  assert.equal(r.reason, 'search_day_limit');
});

test('dig: a failed upload list does not make the channel wait', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'G');
  await start(store, { channels: { G: { ai: 4, ok: 4, fast: 4 } } });
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, channelUploads: async () => { throw new Error('down'); }, search: async () => [] });
  const r = await book.seed({ yen: 5, axis: 'channel' });
  assert.equal(r.reason, 'search_failed');
  assert.equal(r.waves.digReady, 1);
});

test('portfolio: the admin status shows the share of each channel in the whole list', async (t) => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'A');
  await withList(store, catalog, 40, 4);
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], catalog });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const d = await (await fetch(base + '/api/admin/trends/seed', { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.equal(d.portfolio.total, 40);
  assert.equal(d.portfolio.sharePct, 3);
  assert.equal(d.portfolio.maxPer, 1);
});
