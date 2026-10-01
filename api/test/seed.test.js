import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, SEED_QUERIES } from '../src/trends.js';
import { recordUsage, usage, usageYen } from '../src/aiUsage.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 新着の手動の一括収集（初期投資・2026-10-01）：足りない分野の検索語で、説明欄だけで読める動画を、1段階＝ yen 円（目安）まで。
const DAY = 86_400_000;
const id = (n) => `seed${String(n).padStart(7, '0')}`;
const recipe = (v, extra = {}) => ({ title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'chX', channelTitle: 'ちゃんねる', ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], planning: { minutes: 10 }, ...extra });
function fakeCatalog(special = {}) {
  const ready = new Map(), calls = [];
  return { ready, calls,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); calls.push([v, !!o.forceVideo]);
      recordUsage('gemini-2.5-flash', { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 150, thoughtsTokenCount: 50 } });
      const r = special[v] === 'nosteps' ? recipe(v, { steps: [] }) : recipe(v);
      ready.set(v, r); return r;
    } };
}

test('seed: a stage collects up to its yen, skips duplicates / already-read / not-dinner / opted-out / a 3rd video of a channel, never reads the video itself', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog({ [id(3)]: 'nosteps' });
  catalog.ready.set(id(2), recipe(id(2))); // もう読んだ動画（0円）
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: id(1) }], skipped: {} }] }, { ifGeneration: 0 });
  const searched = [];
  const results = [
    { videoId: id(1), channelId: 'c1', title: '豚こま炒め' },          // もう新着にある
    { videoId: id(2), channelId: 'c2', title: '鶏の照り焼き' },        // もう読んだ → 0円
    { videoId: id(3), channelId: 'c3', title: '野菜炒め' },            // 説明欄に作り方がない
    { videoId: id(4), channelId: 'c4', title: '簡単プリン' },          // 晩ごはんでない
    { videoId: id(5), channelId: 'bad', title: '肉じゃが' },           // 掲載停止
    { videoId: id(6), channelId: 'c6', title: '回鍋肉' }, { videoId: id(7), channelId: 'c6', title: '酢豚' }, { videoId: id(8), channelId: 'c6', title: '青椒肉絲' }, // 同じ投稿者は2本まで
    { videoId: id(9), channelId: 'c9', title: '生姜焼き' }, { videoId: id(10), channelId: 'c10', title: '親子丼' }, { videoId: id(11), channelId: 'c11', title: '麻婆豆腐' },
  ];
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 5, yenPerMonth: 1000, optedOut: async () => new Set(['bad']),
    search: async (q) => { searched.push(q); return searched.length === 1 ? results : []; } });
  const r = await book.seed({ yen: 20 }); // 20円 ÷ 5円 = AI 4回
  assert.equal(r.stage.n, 1);
  assert.equal(r.stage.ai, 4);
  assert.equal(catalog.calls.length, 4);
  assert.ok(catalog.calls.every(([, video]) => !video), 'the video itself is never read (costly)');
  assert.equal(r.reason, 'stage_budget');
  assert.equal(r.stage.done, true);
  assert.deepEqual(r.stage.added.map((a) => [a.videoId, a.free]), [[id(2), true], [id(6), false], [id(7), false], [id(9), false]]);
  assert.deepEqual(r.stage.skipped, { filtered: 3, same_channel: 1, no_steps_in_description: 1 });
  assert.equal(r.stage.byQuery[SEED_QUERIES[0][1]], 4);
  assert.equal(r.stage.added[1].title, `料理${id(6)}`, 'titles are read from the saved results when shown');
  assert.equal(JSON.stringify((await store.get('trends/seed')).envelope).includes('料理'), false, 'the stage record keeps no YouTube titles');
  assert.equal(r.stage.yenEstimate, 20);
  assert.equal(r.stage.yenMeasured, Math.round(usageYen({ input: 4000, output: 800 }) * 100) / 100, 'cost from the actual tokens');
  // 集めた料理は新着に出る（新着集めの「今週」とは別）
  const list = (await book.list()).items.map((i) => i.videoId);
  for (const v of [id(2), id(6), id(7), id(9)]) assert.ok(list.includes(v));
  assert.equal(await book.has(id(9)), true);
  assert.equal((await store.get('trends/cost')).envelope.months['2026-10'].ai, 4, 'counted in the monthly cap');
  // 第2段階：前の段階の候補の続きから。試した動画は重ねない
  const r2 = await book.seed({ yen: 20 });
  assert.equal(r2.stage.n, 2);
  assert.deepEqual(r2.stage.added.map((a) => a.videoId), [id(10), id(11)]);
  assert.equal(r2.reason, 'exhausted', 'all the search words used');
  assert.equal(catalog.calls.length, 6);
  // 新着集め（毎日）は、seed の週を自分の週にしない
  const daily = createTrendBook(store, { catalog, now: () => now, search: async () => [] });
  await daily.step();
  const weeks = (await store.get('trends/index')).envelope.weeks;
  assert.equal(weeks.filter((w) => w.seed).length, 2);
  assert.ok(weeks.some((w) => !w.seed && w.items.some((i) => i.videoId === id(1))));
});

test('seed: stops at the monthly cap and keeps the remaining candidates for later', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await store.put('trends/cost', { months: { '2026-10': { ai: 198 } } }, { ifGeneration: 0 });
  const catalog = fakeCatalog();
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 5, yenPerMonth: 1000,
    search: async () => [1, 2, 3, 4, 5].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  const r = await book.seed({ yen: 100 });
  assert.equal(catalog.calls.length, 2, '1000円 ÷ 5円 = 200 回、残り2回');
  assert.equal(r.reason, 'month_budget');
  assert.equal(r.candidatesLeft, 3);
  assert.equal((await store.get('trends/cost')).envelope.months['2026-10'].ai, 200);
});

test('aiUsage: tokens are collected only inside usage.run, and priced from env', async () => {
  const outside = {};
  recordUsage('m', { usageMetadata: { promptTokenCount: 10 } });
  const c = {};
  await usage.run(c, async () => { await Promise.resolve(); recordUsage('m', { usageMetadata: { promptTokenCount: 1_000_000, candidatesTokenCount: 0 } }); });
  assert.deepEqual(outside, {});
  assert.equal(c.input, 1_000_000);
  assert.equal(usageYen(c, {}), 45, '0.30 USD × 150');
  assert.equal(usageYen(c, { GEMINI_PRICE_IN_USD_PER_M: '0.1', USD_JPY: '100' }), 10);
});

test('seed: the admin endpoints need the token', async (t) => {
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: createMemorySyncStore(), syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/admin/trends/seed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"yen":100}' })).status, 403);
  assert.equal((await fetch(base + '/api/admin/trends/seed')).status, 403);
  const r = await fetch(base + '/api/admin/trends/seed', { headers: { Authorization: 'Bearer admin-test-token' } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).queriesLeft, SEED_QUERIES.length);
});
