import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, paceCap, REVIVE_PER_DAY, TREND_USER_SHARE } from '../src/trends.js';

// 2026-10-28：新着を28日で十分な量に保つ（docs/APP_MAP.md §46-8）。
// ② 月の予算を月末まで均等に・利用者の分を残す ③ AI の前に説明欄を0円で確かめる ④ 休んでいる料理を0円で新着に戻す。
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-28T01:00:00Z'); // 日本時間 10/28
let seq = 0;
const vid = () => `rv${String(++seq).padStart(9, '0')}`;
const recipe = (v, extra = {}) => ({ title: `料理${v}`, caption: '材料 豚こま 200g しょうゆ 大さじ1', videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: `ch-${v}`, ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], planning: { minutes: 10 }, ...extra });
function fakeCatalog() {
  const ready = new Map(), calls = [];
  return { ready, calls, ai: 0,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); this.ai += 1; calls.push(v);
      const r = recipe(v); ready.set(v, r); return r;
    } };
}
// 28日を過ぎた週（休みに入る料理）を入れる。
async function oldWeek(store, catalog, n, extra = () => ({})) {
  const items = Array.from({ length: n }, () => { const v = vid(); catalog.ready.set(v, recipe(v, extra(v))); return { videoId: v }; });
  const startedAt = new Date(NOW - 30 * DAY).toISOString();
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW - 30 * DAY), startedAt, candidates: [], tried: [], items, skipped: {} }] }, { ifGeneration: 0 });
  return items.map((i) => i.videoId);
}
const make = (store, catalog, extra = {}) => createTrendBook(store, { catalog, now: () => extra.now?.() ?? NOW, search: async () => [], aiPerDay: 0, ...extra });

test('④ dishes older than 28 days rest, then come back to the list for free (no AI, no YouTube API)', async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  const ids = await oldWeek(store, catalog, 5);
  const book = make(store, catalog);
  const r = await book.step();
  assert.equal(catalog.ai, 0, 'no AI call');
  assert.deepEqual([r.revived.run, r.revived.today, r.revived.resting], [5, 5, 0]);
  const shown = (await book.list()).items.map((i) => i.videoId).sort();
  assert.deepEqual(shown, [...ids].sort(), 'shown again for another 28 days');
  const ix = (await store.get('trends/index')).envelope;
  const w = ix.weeks.find((x) => x.revived);
  assert.equal(w.day, '2026-10-28');
  assert.equal(Date.parse(w.startedAt), NOW, 'the new 28 days start today');
});

test('④ only dishes that still pass the usual rules come back; the rest wait at the end of the line or leave it', async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  let i = 0;
  const kinds = ['ok', 'stale', 'long', 'notDinner', 'gone', 'optedOut'];
  const ids = await oldWeek(store, catalog, kinds.length, () => {
    const k = kinds[i++];
    return k === 'stale' ? { caption: '' } : k === 'long' ? { planning: { minutes: 45 } } : k === 'notDinner' ? { title: '簡単プリン' } : {};
  });
  catalog.ready.delete(ids[4]); // 削除・非公開（読み出せない）
  const book = make(store, catalog, { optedOut: async () => new Set([ids[5]]) });
  const r = await book.step();
  assert.equal(r.revived.run, 1);
  assert.deepEqual((await book.list()).items.map((x) => x.videoId), [ids[0]]);
  const ix = (await store.get('trends/index')).envelope;
  // 説明文が30日以内に取り直されていない・親のない30分以上・掲載停止は、列の最後で待つ。晩ごはんでない・読めない料理は列から外す。
  assert.deepEqual(ix.retired, [ids[1], ids[2], ids[5]]);
});

test(`④ at most ${REVIVE_PER_DAY} a day; the rest come back on the next days`, async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  await oldWeek(store, catalog, REVIVE_PER_DAY + 20);
  let now = NOW;
  const book = make(store, catalog, { now: () => now });
  assert.equal((await book.step()).revived.run, REVIVE_PER_DAY);
  assert.equal((await book.step()).revived.run, 0, 'the same day does not revive more');
  now += DAY;
  const next = await book.step();
  assert.deepEqual([next.revived.run, next.revived.resting], [20, 0]);
  assert.equal(catalog.ai, 0);
});

test('④ the first run also picks up videos the collector tried before this existed; the refill keeps the resting line', async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  const before = [vid(), vid()];
  for (const v of before) catalog.ready.set(v, recipe(v));
  await store.put('trends/seed', { stages: [], q: 0, candidates: [], tried: before }, { ifGeneration: 0 });
  const book = make(store, catalog);
  assert.equal((await book.step()).revived.run, 2);
  // 休みの列は、補充（seed）が一覧を書き直しても消えない。
  const ix = (await store.get('trends/index')).envelope;
  await store.put('trends/index', { ...ix, weeks: [...ix.weeks, { week: weekOf(NOW - 40 * DAY), startedAt: new Date(NOW - 40 * DAY).toISOString(), items: [{ videoId: 'xx-old-0001' }] }] }, { ifGeneration: (await store.get('trends/index')).generation });
  await book.seed({ yen: 1, axis: 'parent', maxAi: 0, timeMs: 1 }).catch(() => null);
  const after = (await store.get('trends/index')).envelope;
  assert.ok(after.retired.includes('xx-old-0001'), 'an expired week moves to the resting line, also when the refill writes the list');
  assert.equal(after.retiredSeeded, true);
});

test('② pace: the automatic collection spends the month evenly (cap × day ÷ days in the month)', async () => {
  assert.equal(paceCap(1000, '2026-10-01'), 33);
  assert.equal(paceCap(1000, '2026-10-15'), 484);
  assert.equal(paceCap(1000, '2026-10-31'), 1000);
  assert.equal(paceCap(1000, '2026-02-28'), 1000);
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  const ids = Array.from({ length: 20 }, vid);
  const book = make(store, catalog, { now: () => Date.parse('2026-10-05T01:00:00Z'), aiPerDay: 99, aiPerWeek: 99, perDay: 20, weekMax: 20, yenPerMonth: 31, yenPerAi: 1,
    search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await book.step();
  assert.equal(catalog.ai, 5, 'by Oct 5: 31 × 5 ÷ 31 = 5 calls');
  assert.equal(r.limited, 'trend_pace');
  assert.equal(r.done, true, 'a used-up day is not a failure');
});

test('② the collector leaves the users\' share of the app-wide monthly AI calls', async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  await store.put('usage/2026-10', { used: Math.floor(1000 * (1 - TREND_USER_SHARE)) }, { ifGeneration: 0 });
  const ids = Array.from({ length: 5 }, vid);
  const book = make(store, catalog, { aiPerDay: 99, aiPerWeek: 99, monthlyLimit: 1000, search: async () => ids.map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await book.step();
  assert.equal(catalog.ai, 0);
  assert.equal(r.limited, 'trend_user_reserve');
  // 補充（seed）も同じ
  await store.put('trends/seed', { stages: [], q: 99, candidates: [{ videoId: ids[0] }], tried: [] }, { ifGeneration: 0 });
  const s = await book.seed({ yen: 10, axis: 'parent', paced: true });
  assert.equal(s.reason, 'user_reserve');
  assert.equal(catalog.ai, 0);
});

test('③ the daily collection checks the description for free before calling the AI', async () => {
  const store = createMemorySyncStore(), catalog = fakeCatalog();
  const [bad, good, priv] = [vid(), vid(), vid()];
  const desc = { [bad]: '今日は簡単ごはん！チャンネル登録お願いします', [good]: '材料\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1\n作り方\n1. 切る\n2. 炒める' };
  const book = make(store, catalog, { aiPerDay: 99, aiPerWeek: 99, perDay: 5, weekMax: 5,
    videoDetails: async (ids) => Object.fromEntries(ids.map((id) => [id, id === priv ? { status: 'non_public' } : { status: 'public', snippet: { description: desc[id] || '' } }])),
    search: async () => [bad, good, priv].map((videoId, i) => ({ videoId, channelId: `c${i}`, title: 'レシピ' })) });
  const r = await book.step();
  assert.deepEqual(catalog.calls, [good], 'only the video with a written recipe is sent to the AI');
  assert.equal(r.skipped.description_not_recipe, 1);
  assert.equal(r.skipped.not_public, 1);
});
