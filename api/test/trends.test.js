import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, isDinnerRecipe } from '../src/trends.js';
import { createPopularBook } from '../src/popular.js';

const DAY = 86_400_000;
const recipe = (id, extra = {}) => ({ title: `料理${id}`, videoUrl: `https://www.youtube.com/watch?v=${id}`, ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], ...extra });
function fakeCatalog(overrides = {}) {
  const calls = [], read = new Set();
  const ready = new Map(); // 読み取り済み（peek で読み出せる）
  const refreshed = [];
  return { calls, refreshed, async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh(url) { refreshed.push(url.match(/v=([\w-]{11})/)[1]); return true; },
    async import(url, o = {}) {
      // 本物のカタログと同じく、AI を呼ぶ直前に aiGate を通す（この偽物は1回の取り込みで AI を1回呼ぶ）。
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('trend'), { code: 'trend_ai_budget', status: 429 });
      const budgetRefused = overrides[url.match(/v=([\w-]{11})/)[1]] === 'budget';
      if (!budgetRefused) o.aiGate?.used();
      const r = await this._import(url, o); ready.set(url.match(/v=([\w-]{11})/)[1], r); return r; },
    async _import(url, o = {}) { const id = url.match(/v=([\w-]{11})/)[1]; calls.push([id, !!o.forceVideo]); if (o.forceVideo) read.add(id); if (overrides[id] === 'fail') throw Object.assign(new Error('gone'), { code: 'video_not_found' }); if (overrides[id] === 'flaky') throw Object.assign(new Error('timeout'), { code: 'youtube_timeout', status: 504 }); if (overrides[id] === 'budget') throw Object.assign(new Error('budget'), { code: 'analysis_budget_exceeded', status: 429 }); if (overrides[id] === 'empty' && !o.forceVideo) throw Object.assign(new Error('empty'), { code: 'empty_description' }); if (overrides[id] === 'nosteps' && !read.has(id)) return recipe(id, { steps: [] }); return recipe(id, overrides[id] && typeof overrides[id] === 'object' ? overrides[id] : {}); } };
}
const ids = Array.from({ length: 14 }, (_, i) => `vid${String(i).padStart(8, '0')}`);

test('weekly trends: 10 per week, a bounded number of tries, video read only when steps are missing, gone after 28 days', async () => {
  let now = Date.parse('2026-09-28T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog({ [ids[0]]: 'fail', [ids[1]]: { title: 'チョコケーキ' }, [ids[2]]: 'nosteps' });
  let searches = 0;
  const book = createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 99, aiPerWeek: 99, weekMax: 10, search: async () => { searches++; return ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })); } });
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
  const later = createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 99, aiPerWeek: 99, weekMax: 10, search: async () => [] });
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
  const catalog = fakeCatalog();
  for (const id of ids.slice(0, 3)) await catalog.import(`https://www.youtube.com/watch?v=${id}`);
  const before = catalog.calls.length;
  const book = createPopularBook(createMemorySyncStore(), { catalog, now: () => Date.parse('2026-09-28T01:00:00Z') });
  await assert.rejects(book.record({ videoId: 'bad', segment: 'LLL-3', kind: 'cooked' }), { code: 'invalid_event' });
  for (let i = 0; i < 3; i++) await book.record({ videoId: ids[0], segment: 'RRR-2', kind: 'planned' }, `ip${i}`);
  assert.equal((await book.record({ videoId: ids[0], segment: 'RRR-2', kind: 'planned' }, 'ip0')).counted, false);
  await book.record({ videoId: ids[1], segment: 'LLL-3', kind: 'cooked' }, 'a');
  await book.record({ videoId: ids[1], segment: 'LLL-3', kind: 'planned' }, 'b');
  await book.record({ videoId: ids[2], segment: 'LLL-3', kind: 'planned' }, 'c');
  const top = await book.top('LLL-3');
  assert.deepEqual(top.items.map((i) => i.videoId), [ids[1], ids[0]], 'same taste first; one planning alone is too few to show');
  assert.equal(catalog.calls.length, before, 'showing the list reads saved results only');
  for (let i = 0; i < 3; i++) await book.record({ videoId: ids[9], segment: 'LLL-3', kind: 'planned' }, `x${i}`);
  assert.equal((await book.top('any-0')).items.some((i) => i.videoId === ids[9]), false, 'an unread video is left out');
  assert.equal(catalog.calls.length, before, 'a video nobody has read yet is not sent to the AI from GET /api/popular');
});

test('short videos without a description are read from the video; a thin week searches again with other words', async () => {
  const store = createMemorySyncStore();
  const first = ids.slice(0, 4), second = ids.slice(4, 14);
  const catalog = fakeCatalog({ [ids[0]]: 'empty', [ids[1]]: 'fail' });
  const queries = [];
  const book = createTrendBook(store, { catalog, perDay: 10, aiPerDay: 99, aiPerWeek: 99, weekMax: 10, now: () => Date.parse('2026-09-28T01:00:00Z'), search: async (q) => { queries.push(q); return (queries.length <= 3 ? first : second).map((videoId, i) => ({ videoId, channelId: `c${videoId}`, title: 'レシピ' })); } });
  const r = await book.step();
  assert.ok(catalog.calls.some(([id, video]) => id === ids[0] && video), 'an empty description falls back to the video');
  assert.equal(r.items, 10); assert.equal(r.rounds, 3, 'after the channel round, a second set of search words filled the week');
  assert.equal(r.skipped.video_not_found, 1);
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
  const book = createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 99, aiPerWeek: 99, weekMax: 10,
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
  const book = createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 99, aiPerWeek: 99, reserveBudget: async () => { budget++; }, writeCatches, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `ch${i}`, title: 'レシピ' })) });
  await book.step();
  assert.equal(calls, 1, 'catches are written by the scheduled collection'); assert.equal(budget, 1);
  const list = await book.list();
  assert.equal(calls, 1, 'not by showing the list');
  assert.ok(list.items.every((i) => i.catch));
  assert.equal(list.items.find((i) => i.videoId === ids[3]).catch, 'もとからある一言', 'a catch from the reading is kept');
  const again = createTrendBook(store, { catalog, now: () => now, writeCatches, search: async () => [] });
  assert.ok((await again.list()).items.every((i) => i.catch)); assert.equal(calls, 1, 'saved catches are reused');
});

test('collecting and showing are separate: a few a day even after 10 are shown, a new day looks at new uploads, the list shows at most 10 a week and never calls the AI', async () => {
  let now = Date.parse('2026-09-28T01:00:00Z'); // 月曜 10:00 JST
  const store = createMemorySyncStore();
  const ch = 'UC' + 'c'.repeat(22);
  const catalog = fakeCatalog();
  let uploads = ids.slice(0, 6), channelCalls = 0, keyword = 0;
  const make = () => createTrendBook(store, { catalog, now: () => now, perDay: 4, weekMax: 12,
    searchChannels: async (q) => (q.startsWith('リュウジ') ? [{ channelId: ch, title: 'リュウジのバズレシピ' }] : []),
    channelUploads: async () => { channelCalls++; return uploads.map((videoId) => ({ videoId, channelId: `c-${videoId}`, title: 'レシピ', publishedAt: new Date(now - DAY).toISOString() })); },
    search: async () => { keyword++; return []; } });
  let book = make();
  const mon = await book.step();
  assert.deepEqual([mon.today, mon.items, mon.done], [4, 4, true], "today's quota");
  const calls = catalog.calls.length;
  assert.equal((await book.step()).today, 4); assert.equal(catalog.calls.length, calls, 'nothing more today');
  // 火曜：新しい動画が上がった → その日の分として拾う（週の初めにそろっても止まらない）。
  now += DAY; uploads = ids.slice(6, 14); book = make();
  const tue = await book.step();
  assert.deepEqual([tue.today, tue.items], [4, 8]);
  assert.equal(channelCalls >= 2, true, 'the registered channels are checked again on a new day');
  now += DAY; book = make();
  const wed = await book.step();
  assert.equal(wed.items, 12, 'up to the weekly maximum');
  now += DAY; book = make();
  const thu = await book.step();
  assert.deepEqual([thu.items, thu.today, thu.done], [12, 0, true], 'the weekly maximum bounds the AI cost');
  // 見せる：1週10品まで、新しい順。読み出すだけ。
  const before = catalog.calls.length;
  const list = await make().list();
  assert.equal(list.items.length, 10);
  assert.equal(list.items[0].videoId, (await store.get('trends/index')).envelope.weeks[0].items.at(-1).videoId, 'newest first');
  assert.equal(catalog.calls.length, before, 'GET /api/trends does not start any reading');
  assert.equal(keyword, 0, 'keyword searches (costly) only when the channels run out');
});

test('a failed or paused collection is never reported as done; old-format weeks keep working', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), rounds: 4, candidates: [], tried: [], items: [{ videoId: ids[0] }], skipped: {} }] }, { ifGeneration: 0 });
  const catalog = fakeCatalog();
  await catalog.import(`https://www.youtube.com/watch?v=${ids[0]}`);
  const book = createTrendBook(store, { catalog, now: () => now, search: async () => [] });
  const r = await book.step();
  assert.equal(r.items, 1, 'the old week is kept');
  assert.equal(r.done, true, 'an old week whose keyword rounds were used up does not search again');
  assert.equal((await book.list()).items[0].videoId, ids[0]);
  const store2 = createMemorySyncStore();
  await store2.put(`usage/${new Date(now).toISOString().slice(0, 10)}`, { used: 99 }, { ifGeneration: 0 });
  const paused = await createTrendBook(store2, { catalog: fakeCatalog(), now: () => now, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) }).step();
  assert.deepEqual([paused.paused, paused.done], ['ai_budget', false]);
});

test('the scheduled collection refreshes saved descriptions once a day; the list does not', async () => {
  const store = createMemorySyncStore();
  let now = Date.parse('2026-09-28T01:00:00Z');
  const catalog = fakeCatalog();
  const book = createTrendBook(store, { catalog, now: () => now, search: async () => ids.slice(0, 3).map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  await book.step();
  const n = catalog.refreshed.length;
  assert.ok(n >= 1);
  await book.list(); await book.step();
  assert.equal(catalog.refreshed.length, n, 'once a day, and never from the list');
  now += DAY;
  await createTrendBook(store, { catalog, now: () => now, search: async () => [] }).step();
  assert.ok(catalog.refreshed.length > n, 'again the next day');
});

test('review fix 1a: when every search fails, nothing is marked done and the same searches run again next time', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  const catalog = fakeCatalog();
  let down = true, keyword = 0;
  const ch = 'UC' + 'c'.repeat(22);
  const make = () => createTrendBook(store, { catalog, now: () => now,
    searchChannels: async (q) => (q.startsWith('リュウジ') ? [{ channelId: ch, title: 'リュウジのバズレシピ' }] : []),
    channelUploads: async () => { if (down) throw Object.assign(new Error('x'), { code: 'youtube_timeout' }); return ids.slice(0, 4).map((videoId) => ({ videoId, channelId: `c-${videoId}`, title: 'レシピ', publishedAt: new Date(now).toISOString() })); },
    search: async () => { keyword++; if (down) throw new Error('network'); return []; } });
  const r = await make().step();
  assert.deepEqual([r.items, r.done, r.paused], [0, false, 'search_failed']);
  const w = (await store.get('trends/index')).envelope.weeks[0];
  assert.deepEqual([w.channelScan, w.kw], [false, 0], 'the failed channel check and search round are not counted as done');
  assert.equal(keyword, 3, 'one failed search round is not repeated within the same run');
  down = false;
  const again = await make().step();
  assert.equal(again.items, 2, 'the next run checks again and collects');
  assert.equal(again.paused, undefined);
});

test('review fix 1b: the AI budget pauses the run (not done) and the video is tried again later', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  const over = { [ids[0]]: 'budget' };
  const catalog = fakeCatalog(over);
  const make = () => createTrendBook(store, { catalog, now: () => now, search: async () => ids.slice(0, 3).map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await make().step();
  assert.deepEqual([r.items, r.done, r.paused], [0, false, 'ai_budget']);
  assert.equal(r.ai.today, 0, 'a refused call is not counted as an AI attempt');
  assert.equal((await store.get('trends/index')).envelope.weeks[0].tried.includes(ids[0]), false, 'the video is not used up');
  delete over[ids[0]];
  const next = await make().step();
  assert.equal(next.items, 2); assert.ok(catalog.calls.filter(([id]) => id === ids[0]).length >= 2, 'the same video is read on the next run');
});

test('review fix 1c: a temporary failure is retried on later runs (up to 3 times), and is not done meanwhile', async () => {
  const store = createMemorySyncStore();
  const now = Date.parse('2026-09-28T01:00:00Z');
  const catalog = fakeCatalog({ [ids[0]]: 'flaky' });
  const make = () => createTrendBook(store, { catalog, now: () => now, search: async () => ids.slice(0, 3).map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  for (let i = 1; i <= 2; i++) {
    const r = await make().step();
    assert.deepEqual([r.items, r.done, r.paused], [0, false, 'temporary_error'], `run ${i}`);
  }
  const third = await make().step();
  assert.equal(third.skipped.youtube_timeout, 1, 'after the third failure it is given up');
  assert.equal(third.items, 2, 'and the others are collected');
});

test('review fix 2: on a new day, the channels are checked before yesterday\'s leftover candidates, and new uploads go first', async () => {
  const store = createMemorySyncStore();
  let now = Date.parse('2026-09-28T01:00:00Z');
  const ch = 'UC' + 'c'.repeat(22);
  const catalog = fakeCatalog();
  let uploads = ids.slice(0, 8), channelCalls = 0;
  const make = () => createTrendBook(store, { catalog, now: () => now, perDay: 2, aiPerDay: 99,
    searchChannels: async (q) => (q.startsWith('リュウジ') ? [{ channelId: ch, title: 'リュウジのバズレシピ' }] : []),
    channelUploads: async () => { channelCalls++; return uploads.map((videoId) => ({ videoId, channelId: `c-${videoId}`, title: 'レシピ', publishedAt: new Date(now - DAY).toISOString() })); },
    search: async () => [] });
  await make().step(); // 月曜：2品。残りの候補（6本）は明日へ
  const left = (await store.get('trends/index')).envelope.weeks[0];
  assert.ok(left.candidates.length - left.tried.length >= 2, 'leftover candidates remain');
  now += DAY; uploads = [ids[12], ids[13]]; const before = channelCalls;
  const tue = await make().step();
  assert.ok(channelCalls > before, 'the channels were checked on the new day');
  const w = (await store.get('trends/index')).envelope.weeks[0];
  assert.deepEqual(w.items.filter((i) => i.day === tue.day).map((i) => i.videoId), [ids[12], ids[13]], "today's new uploads are tried before yesterday's leftovers");
});

test('the AI attempts for collecting have their own cap, counting failures, video fallbacks and catch writing', async () => {
  const store = createMemorySyncStore();
  let now = Date.parse('2026-09-28T01:00:00Z');
  // 説明欄に作り方がない動画ばかり（1本で2回：説明欄→動画）。読めない動画も混ぜる。
  const catalog = fakeCatalog(Object.fromEntries(ids.map((id, i) => [id, i % 3 === 0 ? 'fail' : 'nosteps'])));
  let catchCalls = 0;
  const make = () => createTrendBook(store, { catalog, now: () => now, perDay: 10, aiPerDay: 6, aiPerWeek: 8, writeCatches: async (items) => { catchCalls++; return Object.fromEntries(items.map((i) => [i.videoId, '一言'])); },
    search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await make().step();
  assert.ok(r.ai.today <= 6, `today ${r.ai.today}`);
  assert.equal(r.limited, 'trend_ai_budget'); assert.equal(r.done, true, 'reaching our own cap is a normal stop for today');
  const calls = catalog.calls.length;
  assert.equal(calls, r.ai.today, 'every AI call is counted (including failures and video fallbacks)');
  now += DAY;
  const next = await make().step();
  assert.ok(next.ai.week <= 8, 'the weekly cap holds');
  assert.equal(next.limited, 'trend_ai_budget');
  assert.equal(catalog.calls.length + catchCalls, next.ai.week, 'catch writing counts too');
});
