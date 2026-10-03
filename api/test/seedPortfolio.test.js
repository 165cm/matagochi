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
  assert.equal(d.portfolio.total, 0, 'the server cannot read these fake items → not counted (review fix #132)');
  assert.equal(d.portfolio.sharePct, 3);
  assert.equal(typeof d.waves.digReady, 'number');
});

test('review fix (#132): unreadable (deleted / private / no result) and opted-out items are not in the 3% base', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'A');
  await withList(store, catalog, 99, 0);
  for (let i = 33; i < 99; i++) catalog.ready.delete(id(9000 + i)); // 66件は読み出せない
  catalog.ready.set(id(9000), recipe(id(9000), 'A')); // 読める33件のうち A が1品
  catalog.ready.set(id(9001), recipe(id(9001), 'GONE')); // 掲載停止の投稿者
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, optedOut: async () => new Set(['GONE']),
    search: async () => (n++ ? [] : [{ videoId: id(1), channelId: 'A', title: '料理' }]) });
  const pf = await book.portfolio();
  assert.equal(pf.total, 32, '33 readable minus 1 opted out');
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(r.stage.added.length, 0, 'A would be 2/33 = 6% → not added');
  assert.equal(r.stage.skipped.channel_cap, 1);
});

test('review fix (#132): a candidate put off by the 3% rule waits (not tried) and comes back once the list has grown', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog((v) => (v === id(1) || v === id(2) ? 'A' : `x${v}`));
  await withList(store, catalog, 60, 1); // 上限は1品（61×3%=1.83）
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => (n++ ? [] : [{ videoId: id(1), channelId: 'A', title: '料理' }, { videoId: id(3), channelId: '', title: '料理' }]) });
  // id(3) はチャンネルが分からない → 読んでから A でないと分かる。id(1) は A → 見送り
  const r1 = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(r1.stage.skipped.channel_cap, 1);
  let doc = (await store.get('trends/seed')).envelope;
  assert.ok(doc.capped.some((c) => c.videoId === id(1)) && !doc.tried.includes(id(1)));
  // 新着が増えて A にもう1品の枠ができる（67品 → 68×3%=2.04）
  const ix = await store.get('trends/index');
  const weeks = ix.envelope.weeks;
  for (let i = 0; i < 6; i++) { const v = id(8000 + i); catalog.ready.set(v, recipe(v, `y${i}`)); weeks[0].items.push({ videoId: v }); }
  await store.put('trends/index', { ...ix.envelope, weeks }, { ifGeneration: ix.generation });
  const r2 = await book.seed({ yen: 5, axis: 'trend' });
  assert.ok(r2.stage.added.some((a) => a.videoId === id(1)), 'added once there is room');
  doc = (await store.get('trends/seed')).envelope;
  assert.equal(doc.capped.length, 0);
});

test('review fix (#132): a candidate found to be over the 3% only after reading is not marked tried and is retried for free later', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'A');
  await withList(store, catalog, 60, 1);
  await start(store);
  let n = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => (n++ ? [] : [{ videoId: id(1), channelId: '', title: '料理' }]) });
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(r.stage.skipped.channel_cap_read, 1);
  const doc = (await store.get('trends/seed')).envelope;
  assert.ok(!doc.tried.includes(id(1)));
  assert.deepEqual(doc.capped.map((c) => [c.videoId, c.channelId]), [[id(1), 'A']]);
});

test('review fix (#132): digReady counts only channels that can really be dug (not opted out, under 3%)', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'x');
  await withList(store, catalog, 60, 2); // A は2品＝上限超え
  await start(store, { channels: { A: { ai: 4, ok: 4, fast: 4 }, GONE: { ai: 4, ok: 4, fast: 4 }, OK: { ai: 4, ok: 4, fast: 4 } } });
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, optedOut: async () => new Set(['GONE']), channelUploads: async () => [], search: async () => [] });
  assert.equal(await book.digReady(), 1);
  const r = await book.seed({ yen: 5, axis: 'trend' });
  assert.equal(r.waves.digReady, 1);
});

test('review fix (#132): the portfolio count is reused while the list is unchanged (no full re-read every time)', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'x');
  await withList(store, catalog, 50, 0);
  let peeks = 0;
  const peek = catalog.peek.bind(catalog);
  catalog.peek = async (u) => { peeks += 1; return peek(u); };
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => [] });
  await book.portfolio();
  const first = peeks;
  await book.portfolio();
  assert.equal(peeks, first, 'second read uses the cache');
  book.clearCache();
  await book.portfolio();
  assert.equal(peeks, first * 2, 'cleared when the opt-out list changes');
});

test('review fix (#132): the daily collection puts off a channel at 3% before the AI (not tried) and reads it once there is room', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog((v) => (v === id(1) ? 'A' : `z${v}`));
  // 先週の新着に60品（A が1品）→ A の上限は1品
  const items = [];
  for (let i = 0; i < 60; i++) { const v = id(9000 + i); catalog.ready.set(v, recipe(v, i < 1 ? 'A' : `o${i}`)); items.push({ videoId: v, day: '2026-09-30' }); }
  await store.put('trends/index', { weeks: [{ week: weekOf(now - 7 * DAY), startedAt: new Date(now - 7 * DAY).toISOString(), candidates: [], tried: [], items, skipped: {} }] }, { ifGeneration: 0 });
  let first = true;
  const book = createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 99, aiPerWeek: 99,
    search: async () => { if (!first) return []; first = false; return [{ videoId: id(1), channelId: 'A', title: 'レシピ' }, { videoId: id(2), channelId: 'B', title: 'レシピ' }]; } });
  await book.step();
  assert.ok(!catalog.calls.includes(id(1)), 'not read by the AI');
  let ix = (await store.get('trends/index')).envelope;
  let cur = ix.weeks.find((w) => w.week === weekOf(now) && !w.seed);
  assert.ok(cur.capped.includes(id(1)) && !cur.tried.includes(id(1)));
  // 新着が増えて A に枠ができる
  const grown = await store.get('trends/index');
  for (let i = 0; i < 10; i++) { const v = id(8000 + i); catalog.ready.set(v, recipe(v, `y${i}`)); grown.envelope.weeks.find((w) => w.week === weekOf(now - 7 * DAY)).items.push({ videoId: v, day: '2026-09-30' }); }
  await store.put('trends/index', grown.envelope, { ifGeneration: grown.generation });
  book.clearCache();
  now += DAY;
  await book.step();
  assert.ok(catalog.calls.includes(id(1)), 'read once there is room');
  ix = (await store.get('trends/index')).envelope;
  cur = ix.weeks.find((w) => w.week === weekOf(now) && !w.seed);
  assert.ok(cur.items.some((i) => i.videoId === id(1)));
});

test('review fix (#132 r2): the cached count is not reused when the opt-out list changes with the same size (A resumed, B stopped elsewhere)', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog(() => 'x');
  await withList(store, catalog, 40, 2); // A が2品
  catalog.ready.set(id(9039), recipe(id(9039), 'B')); // B が1品
  let stopped = new Set(['A']);
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, optedOut: async () => stopped, search: async () => [] });
  const before = await book.portfolio();
  assert.equal(before.total, 38);
  assert.ok(!before.top.some((c) => c.id === 'A'));
  stopped = new Set(['B']); // 別のインスタンスで A を再開・B を停止（このインスタンスの clearCache は呼ばれない）
  const after = await book.portfolio();
  assert.equal(after.total, 39);
  assert.equal(after.top.find((c) => c.id === 'A').n, 2);
  assert.ok(!after.top.some((c) => c.id === 'B'));
});
