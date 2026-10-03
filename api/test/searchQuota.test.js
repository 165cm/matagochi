import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createSearchQuota, pacificDay, nextPacificMidnight, YT_SEARCH_PER_DAY, YT_SEARCH_KEEP_FOR_OTHERS } from '../src/searchQuota.js';
import { createTrendBook, SEED_QUERIES, WAVE_TREND_WORDS } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// review fix (#131)：YouTube の検索（search.list）は、プロジェクト全体で1日の回数を守る。1日は太平洋時間（YouTube と同じ）。
test('quota: the day follows Pacific time (16:00 JST in summer, 17:00 in winter), not Japan time', () => {
  assert.equal(pacificDay(Date.parse('2026-10-03T09:41:00Z')), '2026-10-03');
  assert.equal(new Date(nextPacificMidnight(Date.parse('2026-10-03T09:41:00Z'))).toISOString(), '2026-10-04T07:00:00.000Z');
  assert.equal(new Date(nextPacificMidnight(Date.parse('2026-12-01T12:00:00Z'))).toISOString(), '2026-12-02T08:00:00.000Z');
  // 日本時間の0時（UTC 15時）をまたいでも、太平洋時間の日付は同じ
  assert.equal(pacificDay(Date.parse('2026-10-03T14:59:00Z')), pacificDay(Date.parse('2026-10-03T15:01:00Z')));
});

test('quota: one shared count; the bulk collection leaves 30 for the others; it does not reset at midnight in Japan', async () => {
  let now = Date.parse('2026-10-03T14:00:00Z'); // 日本時間 23:00
  const store = createMemorySyncStore();
  const q = createSearchQuota(store, { now: () => now });
  let seed = 0;
  while (await q.take('seed')) seed += 1;
  assert.equal(seed, YT_SEARCH_PER_DAY - YT_SEARCH_KEEP_FOR_OTHERS);
  now = Date.parse('2026-10-03T15:30:00Z'); // 日本時間 0:30（翌日）でも同じ YouTube の1日
  assert.equal(await q.take('seed'), false, 'no new searches after midnight in Japan');
  let other = 0;
  while (await q.take('variant')) other += 1;
  assert.equal(other, YT_SEARCH_KEEP_FOR_OTHERS);
  const st = await q.status();
  assert.deepEqual([st.used, st.by.seed, st.by.variant], [YT_SEARCH_PER_DAY, 65, 30]);
  now = Date.parse('2026-10-04T07:00:00Z'); // 太平洋時間の0時
  assert.equal(await q.take('seed'), true);
  assert.equal((await q.status()).used, 1);
});

test('quota: when the store cannot be read or written, no search is made', async () => {
  const q = createSearchQuota({ get: async () => { throw new Error('down'); }, put: async () => true });
  assert.equal(await q.take('trend'), false);
  const q2 = createSearchQuota({ get: async () => null, put: async () => { throw new Error('down'); } });
  assert.equal(await q2.take('trend'), false);
  let called = 0;
  await assert.rejects(q2.wrap(async () => { called += 1; return []; })('x'), (e) => e.code === 'youtube_search_quota');
  assert.equal(called, 0);
});

test('quota: the seed stops with search_day_limit when the shared quota is used up, without using up its word or its own daily count', async () => {
  const now = Date.parse('2026-10-03T09:00:00Z');
  const store = createMemorySyncStore();
  await store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [] }, { ifGeneration: 0 });
  const quota = createSearchQuota(store, { now: () => now, perDay: 35, keepForOthers: 30 });
  const searched = [];
  const catalog = { async peek() { return null; }, async refresh() { return true; }, async import() { throw new Error('no'); } };
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search: quota.wrap(async (q) => { searched.push(q); return []; }, 'trend') });
  const r = await book.seed({ yen: 10, axis: 'trend' });
  assert.equal(r.reason, 'search_day_limit');
  assert.equal(searched.length, 5, 'seed cap = 35 - 30');
  assert.equal(r.waves.searchedToday, 5, 'the refused search is not counted');
  assert.equal(r.waves.trendReady, WAVE_TREND_WORDS.length - 5, 'the refused word stays unused');
  assert.equal((await quota.status()).by.seed, 5);
});

test('quota: all search paths share it through the server (seed, daily collection, other ways to cook), and the admin status shows it', async (t) => {
  const store = createMemorySyncStore();
  await store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [] }, { ifGeneration: 0 });
  // 今日はもう90回使った
  await store.put('youtube/search-quota', { day: pacificDay(Date.now()), n: YT_SEARCH_PER_DAY - 5, by: { trend: 90 } }, { ifGeneration: 0 });
  let calls = 0;
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => { calls += 1; return []; } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  const r = await (await fetch(base + '/api/admin/trends/seed', { method: 'POST', headers: auth, body: JSON.stringify({ yen: 10 }) })).json();
  assert.equal(r.reason, 'search_day_limit');
  assert.equal(calls, 0, 'the seed leaves the last searches for the others');
  for (let i = 0; i < 5; i++) {
    const res = await fetch(base + '/api/search/variants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: `肉じゃが${i}` }) });
    assert.equal(res.status, 200);
  }
  const over = await fetch(base + '/api/search/variants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: '肉じゃが9' }) });
  assert.equal(over.status, 429);
  assert.equal((await over.json()).error.code, 'youtube_search_quota');
  assert.equal(calls, 5);
  const st = await (await fetch(base + '/api/admin/trends/seed', { headers: auth })).json();
  assert.deepEqual([st.youtubeSearch.used, st.youtubeSearch.perDay, st.youtubeSearch.seedCap], [YT_SEARCH_PER_DAY, YT_SEARCH_PER_DAY, YT_SEARCH_PER_DAY - YT_SEARCH_KEEP_FOR_OTHERS]);
  assert.ok(st.youtubeSearch.resetAt);
});

test('review fix (#131): the admin button stays usable while put-off candidates remain (they may be read without searching)', () => {
  const html = readFileSync(new URL('../../admin/catalog.html', import.meta.url), 'utf8');
  assert.match(html, /const dayFull = searchFull && !d\.candidatesLeft && !d\.queriesLeft && !d\.laterLeft;/);
});
