import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createChannelStats } from '../src/channelStats.js';
import { fetchChannelStats } from '../src/youtube.js';
import { createTrendBook, weekOf, SEED_QUERIES } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-03：管理の画面の投稿者の一覧に、チャンネル名・登録者数・動画数など。
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T01:00:00Z');
const ch = (c) => 'UC' + c.repeat(22);

test('channel stats: names, subscribers (hidden → null), videos, views and start month from channels.list', async () => {
  let url = '';
  const fetchImpl = async (u) => { url = u; return { ok: true, status: 200, json: async () => ({ items: [
    { id: ch('a'), snippet: { title: 'たろうの台所', publishedAt: '2019-04-01T00:00:00Z' }, statistics: { subscriberCount: '123000', videoCount: '450', viewCount: '9000000' } },
    { id: ch('b'), snippet: { title: 'ひみつ', publishedAt: '2021-01-01T00:00:00Z' }, statistics: { hiddenSubscriberCount: true, videoCount: '12' } },
  ] }) }; };
  const got = await fetchChannelStats([ch('a'), ch('b'), 'bad'], { YOUTUBE_API_KEY: 'k' }, fetchImpl);
  assert.match(url, /part=snippet%2Cstatistics/);
  assert.deepEqual(got[ch('a')], { title: 'たろうの台所', subscribers: 123000, videos: 450, views: 9000000, since: '2019-04' });
  assert.equal(got[ch('b')].subscribers, null);
});

test('channel stats: fetched only when missing or older than 7 days, dropped after 30 days, old values kept when a fetch fails', async () => {
  let now = NOW;
  const store = createMemorySyncStore();
  const asked = [];
  let fail = false;
  const stats = createChannelStats(store, { now: () => now, fetchStats: async (ids) => { asked.push(ids); if (fail) throw new Error('down'); return Object.fromEntries(ids.map((id) => [id, { title: `名${id.slice(2, 3)}`, subscribers: 10, videos: 1 }])); } });
  const a = await stats.get([ch('a'), ch('b'), 'bad']);
  assert.deepEqual(Object.keys(a).sort(), [ch('a'), ch('b')]);
  assert.equal(asked.length, 1);
  now += 3 * DAY;
  await stats.get([ch('a')]);
  assert.equal(asked.length, 1, 'fresh → no fetch');
  now += 5 * DAY; fail = true;
  const b = await stats.get([ch('a')]);
  assert.equal(asked.length, 2, 'older than 7 days → fetch again');
  assert.equal(b[ch('a')].title, '名a', 'kept when the fetch fails');
  now += 30 * DAY;
  const c = await stats.get([ch('a')]);
  assert.deepEqual(c, {}, 'dropped after 30 days (YouTube data is not kept longer)');
  assert.deepEqual(Object.keys((await store.get('youtube/channel-stats')).envelope.map), []);
});

test('channel board: each channel shows its dishes in the list, share, scores and state', async () => {
  const store = createMemorySyncStore();
  const ready = new Map();
  const items = [];
  for (let i = 0; i < 40; i++) { const v = `brd${String(i).padStart(8, '0')}`; ready.set(v, { title: `料理${i}`, channelId: i < 2 ? ch('a') : `o${i}`, channelTitle: i < 2 ? 'Aの台所' : '' }); items.push({ videoId: v }); }
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items, skipped: {} }] }, { ifGeneration: 0 });
  await store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [], channels: { [ch('a')]: { ai: 4, ok: 4, fast: 3 }, [ch('b')]: { ai: 3, ok: 0, fast: 0 }, [ch('c')]: { ai: 4, ok: 4, fast: 4 }, [ch('d')]: { ai: 2, ok: 2, fast: 2 } } }, { ifGeneration: 0 });
  const catalog = { async peek(u) { return ready.get(u.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; }, async import() { throw new Error('no'); } };
  const book = createTrendBook(store, { catalog, now: () => NOW, optedOut: async () => new Set([ch('d')]), search: async () => [] });
  const b = await book.channelBoard();
  const row = (c) => b.rows.find((r) => r.id === ch(c));
  assert.deepEqual([row('a').inList, row('a').share, row('a').name, row('a').full, row('a').fastShare], [2, 5, 'Aの台所', true, 75], 'A has 2 of 40 = 5% → over 3%');
  assert.equal(row('b').low, true);
  assert.equal(row('c').digOk, true);
  assert.equal(row('d').opted, true);
  assert.equal(b.maxPer, 1);
});

test('channel board: the admin status adds YouTube names and numbers', async (t) => {
  const store = createMemorySyncStore();
  await store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [], channels: { [ch('a')]: { ai: 4, ok: 4, fast: 3 } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    channelStats: async (ids) => Object.fromEntries(ids.map((id) => [id, { title: 'たろうの台所', subscribers: 123000, videos: 450, views: 1, since: '2019-04' }])) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const d = await (await fetch(base + '/api/admin/trends/seed', { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.equal(d.channelBoard.rows[0].id, ch('a'));
  assert.equal(d.channelBoard.rows[0].youtube.title, 'たろうの台所');
  assert.equal(d.channelBoard.rows[0].youtube.subscribers, 123000);
});

test('review fix (#133): after a failed or missing fetch, the same channel is not asked again for a day; old values still vanish 30 days after they were fetched', async () => {
  let now = NOW;
  const store = createMemorySyncStore();
  const asked = [];
  let mode = 'ok';
  const stats = createChannelStats(store, { now: () => now, fetchStats: async (ids) => { asked.push([...ids]); if (mode === 'fail') throw new Error('down'); if (mode === 'missing') return {}; return Object.fromEntries(ids.map((id) => [id, { title: 'A', subscribers: 1, videos: 1 }])); } });
  await stats.get([ch('a')]);
  now += 8 * DAY; mode = 'fail';
  await stats.get([ch('a')]);
  await stats.get([ch('a')]);
  assert.equal(asked.length, 2, 'one retry, not one per reload');
  const doc = (await store.get('youtube/channel-stats')).envelope;
  assert.equal(doc.map[ch('a')].at, new Date(NOW).toISOString(), 'the old value is not made younger');
  now += DAY + 1; mode = 'missing';
  await stats.get([ch('a')]);
  await stats.get([ch('a')]);
  assert.equal(asked.length, 3, 'a missing answer also waits a day');
  // 新しいチャンネルが応答に含まれない時も
  await stats.get([ch('z')]); await stats.get([ch('z')]);
  assert.equal(asked.filter((a) => a.includes(ch('z'))).length, 1);
  now = NOW + 31 * DAY;
  const got = await stats.get([]);
  assert.deepEqual(got, {});
  const after = (await store.get('youtube/channel-stats')).envelope;
  assert.equal(after.map[ch('a')], undefined, 'gone 30 days after it was fetched');
});

test('review fix (#133): the daily housekeeping removes channel info older than 30 days even if the admin page is never opened', async () => {
  const { createHousekeeping } = await import('../src/housekeeping.js');
  const store = createMemorySyncStore();
  await store.put('youtube/channel-stats', { map: { [ch('a')]: { title: '古い', at: new Date(NOW - 31 * DAY).toISOString() }, [ch('b')]: { title: '新しい', at: new Date(NOW - 2 * DAY).toISOString() } }, checked: { [ch('c')]: new Date(NOW - 31 * DAY).toISOString() } }, { ifGeneration: 0 });
  const hk = createHousekeeping(store, { now: () => NOW });
  const out = await hk.run();
  assert.deepEqual(out.channelStats, { kept: 1, removed: 1 });
  const doc = (await store.get('youtube/channel-stats')).envelope;
  assert.deepEqual(Object.keys(doc.map), [ch('b')]);
  assert.deepEqual(doc.checked, {});
});
