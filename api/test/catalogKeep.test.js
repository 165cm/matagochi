import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf } from '../src/trends.js';
import { createPopularBook } from '../src/popular.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// PR 4b（docs/PERSONALIZE_PLAN.md §2、2026-10-01 のユーザーの判断）：
// 採用率（候補に出した回数・献立に入れた回数）・新着から献立に入れられた動画を「みんなの定番」に残す・新着集めの月の費用の上限。
const DAY = 86_400_000;
const ids = Array.from({ length: 12 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
const recipe = (id, extra = {}) => ({ title: `料理${id}`, videoUrl: `https://www.youtube.com/watch?v=${id}`, channelId: 'ch1', channelTitle: 'ちゃんねる', ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], ...extra });
function fakeCatalog() {
  const ready = new Map();
  let ai = 0;
  return { ready, get ai() { return ai; },
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('trend'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); ai += 1;
      const id = url.match(/v=([\w-]{11})/)[1]; const r = recipe(id); ready.set(id, r); return r;
    } };
}

test('PR 4b: trend collection stops for the month when the estimated cost reaches the monthly cap (yen ÷ yen per AI call)', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  const make = () => createTrendBook(store, { catalog, now: () => now, perDay: 10, weekMax: 20, aiPerDay: 99, aiPerWeek: 99, yenPerMonth: 20, yenPerAi: 5,
    search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  const first = await make().step();
  assert.equal(catalog.ai, 4, '20円 ÷ 5円 = 4 calls');
  assert.equal(first.limited, 'trend_month_budget');
  assert.equal(first.done, true, 'a used-up month is not a failure to retry');
  assert.deepEqual([first.ai.month, first.ai.monthCap, first.ai.yen, first.ai.yenCap], [4, 4, 20, 20]);
  now += DAY;
  assert.equal((await make().step()).limited, 'trend_month_budget', 'the next day in the same month stays stopped');
  assert.equal(catalog.ai, 4);
  now = Date.parse('2026-11-02T01:00:00Z');
  await make().step();
  assert.equal(catalog.ai, 8, 'a new month starts again');
  const cost = await make().cost();
  assert.deepEqual(cost.map((m) => [m.month, m.ai, m.yen, m.cap]), [['2026-11', 4, 20, 20], ['2026-10', 4, 20, 20]]);
});

test('PR 4b: "shown" is counted for the adoption rate but does not rank; a new arrival added to a plan is kept in みんなの定番 after 28 days', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  for (const id of ids.slice(0, 3)) await catalog.import(`https://www.youtube.com/watch?v=${id}`);
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: ids[0] }], skipped: {} }] }, { ifGeneration: 0 });
  const trends = createTrendBook(store, { catalog, now: () => now, search: async () => [] });
  let excluded = new Set();
  const make = () => createPopularBook(store, { catalog, now: () => now, isTrend: (id) => trends.has(id), optedOut: async () => excluded });
  const book = make();
  for (let i = 0; i < 4; i++) await book.record({ videoId: ids[0], segment: 'any-0', kind: 'shown' }, `ip${i}`);
  for (let i = 0; i < 5; i++) await book.record({ videoId: ids[1], segment: 'any-0', kind: 'shown' }, `ip${i}`);
  assert.equal((await book.top()).items.length, 0, 'being shown alone does not make a dish popular');
  await book.record({ videoId: ids[0], segment: 'any-0', kind: 'planned' }, 'ip0'); // 新着から献立へ
  await book.record({ videoId: ids[1], segment: 'any-0', kind: 'planned' }, 'ip0'); // 新着ではない
  const stats = await book.stats();
  const s0 = stats.find((s) => s.videoId === ids[0]), s1 = stats.find((s) => s.videoId === ids[1]);
  assert.deepEqual([s0.shown, s0.planned, s0.rate, s0.kept], [4, 1, 25, true]);
  assert.deepEqual([s1.shown, s1.planned, s1.rate, s1.kept], [5, 1, 20, false], 'only new arrivals are kept');
  // 28日・2か月を過ぎても、残した動画はみんなの定番に出る（数が少なくても）
  now += 70 * DAY;
  const later = make();
  const top = (await later.top()).items;
  assert.deepEqual(top.map((i) => [i.videoId, !!i.kept]), [[ids[0], true]]);
  // 掲載停止・見られなくなった動画は出さない
  excluded = new Set([ids[0]]);
  assert.equal((await make().top()).items.length, 0);
  excluded = new Set();
  catalog.ready.delete(ids[0]);
  assert.equal((await make().top()).items.length, 0);
  await assert.rejects(book.record({ videoId: ids[0], segment: 'any-0', kind: 'liked' }), { code: 'invalid_event' });
});

test('PR 4b: GET /api/admin/catalog needs the admin token and lists adoption, cost and creators to ask for consent', async (t) => {
  const store = createMemorySyncStore();
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/admin/catalog')).status, 403);
  const r = await fetch(base + '/api/admin/catalog', { headers: { Authorization: 'Bearer admin-test-token' } });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual(Object.keys(body).sort(), ['askConsent', 'cost', 'items']);
});

test('review fix (#116): the AI calls are reserved in trends/cost before calling; if that cannot be saved, no AI is called and the run is not "done"', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const put = store.put.bind(store);
  let failCost = true;
  store.put = async (key, ...rest) => (failCost && key === 'trends/cost' ? false : put(key, ...rest));
  const catalog = fakeCatalog();
  const make = () => createTrendBook(store, { catalog, now: () => now, perDay: 10, weekMax: 20, aiPerDay: 99, aiPerWeek: 99, yenPerMonth: 20, yenPerAi: 5,
    search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  const first = await make().step();
  assert.equal(catalog.ai, 0, 'no reservation → no AI call');
  assert.equal(first.paused, 'cost_not_saved');
  assert.equal(first.done, false);
  now += DAY;
  await make().step();
  assert.equal(catalog.ai, 0, 'still nothing on the next day');
  failCost = false;
  now += DAY;
  await make().step();
  now += DAY;
  await make().step();
  assert.equal(catalog.ai, 4, 'never more than the monthly cap (20円 ÷ 5円)');
  // 予約したあと、使わなかった分を戻せなくても、上限は超えない（多めに数えたまま）
  const store2 = createMemorySyncStore();
  const put2 = store2.put.bind(store2);
  let writes = 0;
  store2.put = async (key, ...rest) => (key === 'trends/cost' && ++writes > 1 ? false : put2(key, ...rest));
  const c2 = fakeCatalog();
  const b2 = createTrendBook(store2, { catalog: c2, now: () => now, perDay: 1, weekMax: 20, aiPerDay: 3, aiPerWeek: 99, yenPerMonth: 20, yenPerAi: 5, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  await b2.step();
  assert.equal(c2.ai, 1);
  assert.equal((await store2.get('trends/cost')).envelope.months['2026-10'].ai, 3, 'the reservation (3) stays: counted high, never low');
});

test('review fix (#116): admin stats use the previous calendar month in Japan (on Oct 1 that is September, not August)', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  await store.put('popular/2026-09', { recipes: { [ids[0]]: { all: 2, seg: {}, shown: 5, planned: 2 } } }, { ifGeneration: 0 });
  const book = createPopularBook(store, { catalog, now: () => Date.parse('2026-09-30T16:00:00Z') }); // 10月1日 01:00 JST
  const s = (await book.stats()).find((x) => x.videoId === ids[0]);
  assert.deepEqual([s.shown, s.planned, s.rate], [5, 2, 40]);
  const jan = createPopularBook(store, { catalog, now: () => Date.parse('2027-01-01T03:00:00Z') });
  await store.put('popular/2026-12', { recipes: { [ids[1]]: { all: 1, seg: {}, shown: 1, planned: 1 } } }, { ifGeneration: 0 });
  assert.ok((await jan.stats()).some((x) => x.videoId === ids[1]), 'January sees December');
});

test('review fix (#116): the cached trend list is not reused across midnight in Japan, so a day has one order', async () => {
  let now = Date.parse('2026-10-05T14:59:00Z'); // 23:59 JST
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  for (const id of ids) await catalog.import(`https://www.youtube.com/watch?v=${id}`);
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: ids.map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const a = createTrendBook(store, { catalog, now: () => now, search: async () => [] });
  const before = (await a.list()).items.map((i) => i.videoId);
  now += 2 * 60_000; // 00:01 JST
  const sameInstance = (await a.list()).items.map((i) => i.videoId);
  const fresh = (await createTrendBook(store, { catalog, now: () => now, search: async () => [] }).list()).items.map((i) => i.videoId);
  assert.deepEqual(sameInstance, fresh);
  assert.notDeepEqual(before, fresh, 'a new day, a new order');
});

test('review fix (#116 r2): if returning the unused calls is saved but the reply is lost, it is not applied twice (never counted low)', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const put = store.put.bind(store);
  let costWrites = 0;
  // 2回目の trends/cost の書き込み（使わなかった分を返す）は、保存されたあとで通信が切れる
  store.put = async (key, ...rest) => {
    if (key !== 'trends/cost') return put(key, ...rest);
    costWrites += 1;
    const ok = await put(key, ...rest);
    if (costWrites === 2) throw Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    return ok;
  };
  const catalog = fakeCatalog();
  let catches = 0; // ひとことキャッチも AI を1回使う
  const calls = () => catalog.ai + catches;
  const make = () => createTrendBook(store, { catalog, now: () => now, writeCatches: async () => { catches += 1; return {}; }, perDay: 1, weekMax: 20, aiPerDay: 3, aiPerWeek: 99, yenPerMonth: 20, yenPerAi: 5,
    search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  await make().step();
  const used = calls();
  assert.equal(used, 2, 'the recipe and its catch copy');
  assert.equal((await store.get('trends/cost')).envelope.months['2026-10'].ai, used, 'reserved 3, the unused 1 returned only once');
  for (let d = 0; d < 6; d++) { now += DAY; await make().step(); }
  assert.ok(calls() <= 4, `never more than the monthly cap of 4 (${calls()})`);
  assert.ok((await store.get('trends/cost')).envelope.months['2026-10'].ai >= calls(), 'never counted low');
});
