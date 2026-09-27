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
  assert.equal(r.items, 10); assert.equal(r.rounds, 2, 'a second set of search words filled the week');
  assert.equal(r.skipped.error, 1);
});
