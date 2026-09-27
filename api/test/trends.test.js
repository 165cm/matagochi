import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, isDinnerRecipe } from '../src/trends.js';
import { createPopularBook } from '../src/popular.js';

const DAY = 86_400_000;
const recipe = (id, extra = {}) => ({ title: `料理${id}`, videoUrl: `https://www.youtube.com/watch?v=${id}`, ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], ...extra });
function fakeCatalog(overrides = {}) {
  const calls = [], read = new Set();
  return { calls, async import(url, o = {}) { const id = url.match(/v=([\w-]{11})/)[1]; calls.push([id, !!o.forceVideo]); if (o.forceVideo) read.add(id); if (overrides[id] === 'fail') throw new Error('x'); if (overrides[id] === 'empty' && !o.forceVideo) throw Object.assign(new Error('empty'), { code: 'empty_description' }); if (overrides[id] === 'nosteps' && !read.has(id)) return recipe(id, { steps: [] }); return recipe(id, overrides[id] && typeof overrides[id] === 'object' ? overrides[id] : {}); } };
}
const ids = Array.from({ length: 14 }, (_, i) => `vid${String(i).padStart(8, '0')}`);

test('weekly trends: 10 per week, a bounded number of tries, video read only when steps are missing, gone after 28 days', async () => {
  let now = Date.parse('2026-09-28T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog({ [ids[0]]: 'fail', [ids[1]]: { title: 'チョコケーキ' }, [ids[2]]: 'nosteps' });
  let searches = 0;
  const book = createTrendBook(store, { catalog, now: () => now, search: async () => { searches++; return ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })); } });
  const first = await book.step();
  assert.equal(first.items, 10); assert.equal(first.done, true);
  assert.equal(searches, 3);
  assert.ok(catalog.calls.some(([id, video]) => id === ids[2] && video), 'a description without steps is read from the video');
  const tries = catalog.calls.length;
  assert.equal((await book.step()).items, 10); assert.equal(catalog.calls.length, tries, 'a finished week does nothing more'); assert.equal(searches, 3);
  const list = await book.list();
  assert.equal(list.items.length, 10); assert.ok(!list.items.some((i) => i.title === 'チョコケーキ'));
  assert.match(list.items[0].thumbnailUrl, /i\.ytimg\.com/);
  now += 29 * DAY;
  const later = createTrendBook(store, { catalog, now: () => now, search: async () => [] });
  assert.equal((await later.list()).items.length, 0, 'weeks older than 28 days are not shown');
  await later.step();
  assert.equal((await store.get('trends/index')).envelope.weeks.some((w) => w.week === weekOf(Date.parse('2026-09-28T01:00:00Z'))), false, 'and are dropped from the index');
});

test('weeks start on Monday in Japan; dinner filter', () => {
  assert.equal(weekOf(Date.parse('2026-09-27T16:00:00Z')), '2026-09-28', 'Monday 01:00 JST');
  assert.equal(weekOf(Date.parse('2026-09-27T14:00:00Z')), '2026-09-21', 'Sunday 23:00 JST');
  assert.equal(isDinnerRecipe(recipe('x', { title: '簡単プリン' })), false);
  assert.equal(isDinnerRecipe(recipe('x', { steps: ['一つだけ'] })), false);
});

test('popular: anonymous counts, one per source a day, similar tastes first, small counts hidden', async () => {
  const book = createPopularBook(createMemorySyncStore(), { catalog: fakeCatalog(), now: () => Date.parse('2026-09-28T01:00:00Z') });
  await assert.rejects(book.record({ videoId: 'bad', segment: 'LLL-3', kind: 'cooked' }), { code: 'invalid_event' });
  for (let i = 0; i < 3; i++) await book.record({ videoId: ids[0], segment: 'RRR-2', kind: 'planned' }, `ip${i}`);
  assert.equal((await book.record({ videoId: ids[0], segment: 'RRR-2', kind: 'planned' }, 'ip0')).counted, false);
  await book.record({ videoId: ids[1], segment: 'LLL-3', kind: 'cooked' }, 'a');
  await book.record({ videoId: ids[1], segment: 'LLL-3', kind: 'planned' }, 'b');
  await book.record({ videoId: ids[2], segment: 'LLL-3', kind: 'planned' }, 'c');
  const top = await book.top('LLL-3');
  assert.deepEqual(top.items.map((i) => i.videoId), [ids[1], ids[0]], 'same taste first; one planning alone is too few to show');
});

test('short videos without a description are read from the video; a thin week searches again with other words', async () => {
  const store = createMemorySyncStore();
  const first = ids.slice(0, 4), second = ids.slice(4, 14);
  const catalog = fakeCatalog({ [ids[0]]: 'empty', [ids[1]]: 'fail' });
  const queries = [];
  const book = createTrendBook(store, { catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), search: async (q) => { queries.push(q); return (queries.length <= 3 ? first : second).map((videoId, i) => ({ videoId, channelId: `c${videoId}`, title: 'レシピ' })); } });
  const r = await book.step();
  assert.ok(catalog.calls.some(([id, video]) => id === ids[0] && video), 'an empty description falls back to the video');
  assert.equal(r.items, 10); assert.equal(r.rounds, 3, 'after the channel round, a second set of search words filled the week');
  assert.equal(r.skipped.error, 1);
});

test('trend collection stops at half of the daily AI limit so users can still import', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  await store.put(`usage/${new Date(now).toISOString().slice(0, 10)}`, { used: 50 }, { ifGeneration: 0 });
  const catalog = fakeCatalog();
  const book = createTrendBook(store, { catalog, now: () => now, dailyLimit: 100, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await book.step();
  assert.equal(r.paused, 'ai_budget'); assert.equal(catalog.calls.length, 0); assert.equal(r.done, false);
});

test('registered channels are found by name once; their new uploads come first; hit rates steer the order', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  const chA = 'UC' + 'a'.repeat(22), chB = 'UC' + 'b'.repeat(22);
  const channelSearches = [];
  const uploads = { [chA]: ids.slice(0, 6), [chB]: ids.slice(6, 12) };
  const catalog = fakeCatalog({ [ids[6]]: 'fail', [ids[7]]: 'fail' });
  let keyword = 0;
  const book = createTrendBook(store, { catalog, now: () => now,
    searchChannels: async (q) => { channelSearches.push(q); return q.startsWith('リュウジ') ? [{ channelId: chA, title: 'リュウジのバズレシピ' }] : q.startsWith('こっタソ') ? [{ channelId: chB, title: 'こっタソの自由気ままに' }] : [{ channelId: 'UC' + 'z'.repeat(22), title: '別の人' }]; },
    channelUploads: async (id) => (uploads[id] || []).map((videoId) => ({ videoId, channelId: id, title: 'レシピ', publishedAt: new Date(now - 86400000).toISOString() })),
    search: async () => { keyword++; return []; } });
  const r = await book.step();
  assert.equal(channelSearches.length, 5, 'five names are looked up per call');
  assert.equal(r.items, 2, "two new uploads per channel; the other channel's two failed");
  assert.equal(keyword, 9, 'then every set of keyword searches (3 × 3)');
  const doc = (await store.get('trends/channels')).envelope;
  assert.equal(doc.seeds['DELISH KITCHEN'], 'none', 'a channel whose name does not match is not used');
  assert.equal(doc.channels[chA].hits, 2); assert.equal(doc.channels[chB].tries, 2); assert.equal(doc.channels[chB].hits, 0);
});

test('only Japanese videos become trend candidates for now', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  const book = createTrendBook(store, { catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: i < 4 ? 'Easy Garlic Butter Chicken' : '簡単 鶏むね レシピ' })) });
  await book.step();
  assert.equal(catalog.calls.some(([id]) => ids.slice(0, 4).includes(id)), false);
});

test('a trend already collected from an English video is left out of the list', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog({ [ids[0]]: { caption: 'Easy garlic butter chicken. Ingredients: 1 lb chicken' }, [ids[1]]: { caption: '材料（2人分）鶏むね肉 1枚' } });
  const book = createTrendBook(store, { catalog, now: () => Date.parse('2026-09-28T01:00:00Z'), search: async () => ids.slice(0, 2).map((videoId, i) => ({ videoId, channelId: `c${i}`, title: '鶏むね レシピ' })) });
  await book.step();
  assert.deepEqual((await book.list()).items.map((i) => i.videoId), [ids[1]]);
});

test('a creator who asks to be left out disappears from trends and popular at once', async () => {
  const { createCreatorDesk } = await import('../src/creators.js');
  const store = createMemorySyncStore();
  const ch = 'UC' + 'q'.repeat(22);
  const desk = createCreatorDesk(store, { resolveChannel: async (x) => (x.includes('@taro') ? { channelId: ch, title: 'たろうの台所' } : null) });
  const catalog = fakeCatalog(Object.fromEntries(ids.map((id, i) => [id, { channelId: i < 3 ? ch : 'UCother' }])));
  const book = createTrendBook(store, { catalog, optedOut: () => desk.optedOut(), now: () => Date.parse('2026-09-28T01:00:00Z'), search: async () => ids.map((videoId, i) => ({ videoId, channelId: i < 3 ? ch : `c${i}`, title: 'レシピ' })) });
  await book.step();
  assert.equal((await book.list()).items.filter((i) => i.channelId === ch).length, 2, 'two per channel');
  await assert.rejects(desk.request({ channel: 'https://example.com' }), { code: 'channel_not_found' });
  assert.equal((await desk.request({ channel: 'https://www.youtube.com/@taro', message: '掲載を止めてください' })).removed, true);
  const fresh = createTrendBook(store, { catalog, optedOut: () => desk.optedOut(), now: () => Date.parse('2026-09-28T01:00:00Z'), search: async () => [] });
  assert.equal((await fresh.list()).items.some((i) => i.channelId === ch), false);
});

test('trend items without a catch line get one from a single batched call, saved and reused', async () => {
  const now = Date.parse('2026-09-28T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog({ [ids[3]]: { catch: 'もとからある一言' } });
  let calls = 0, budget = 0;
  const writeCatches = async (items) => { calls++; return Object.fromEntries(items.map((i) => [i.videoId, `${i.title}の一言`])); };
  const book = createTrendBook(store, { catalog, now: () => now, reserveBudget: async () => { budget++; }, writeCatches, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  await book.step();
  const list = await book.list();
  assert.equal(calls, 1); assert.equal(budget, 1);
  assert.ok(list.items.every((i) => i.catch));
  assert.equal(list.items.find((i) => i.videoId === ids[3]).catch, 'もとからある一言', 'a catch from the reading is kept');
  const again = createTrendBook(store, { catalog, now: () => now, writeCatches, search: async () => [] });
  assert.ok((await again.list()).items.every((i) => i.catch)); assert.equal(calls, 1, 'saved catches are reused');
});
