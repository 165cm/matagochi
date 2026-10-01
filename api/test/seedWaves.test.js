import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, SEED_QUERIES, WAVE_TREND_WORDS, WAVE_CLASSIC_DISHES, WAVE_TREND_DAYS, WAVE_CLASSIC_AGE_DAYS, WAVE_TREND_REUSE_DAYS, WAVE_SEARCH_PER_DAY } from '../src/trends.js';
import { recordUsage } from '../src/aiUsage.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 検索語を使い切った後の広げ方（2026-10-01）：「話題」（公開60日以内）と「定番」（公開1年より前・料理名ごと）を、重ならないように。
const DAY = 86_400_000;
const id = (n) => `wave${String(n).padStart(7, '0')}`;
const recipe = (v, title = `料理${v}`) => ({ title, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'chX', ingredients: [{ name: '豚こま' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], planning: { minutes: 10 } });
function fakeCatalog() {
  const ready = new Map(), calls = [];
  return { ready, calls,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); calls.push(v);
      recordUsage('gemini-2.5-flash', { usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 150 } });
      const r = recipe(v); ready.set(v, r); return r;
    } };
}
// 決めた検索語はもう使い切った状態から始める。
const usedUp = (store) => store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [] }, { ifGeneration: 0 });

test('waves: after the fixed words, trend (recent) and classic (old) searches alternate, never overlap by date, and a classic dish already in the list is not searched', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await usedUp(store);
  const catalog = fakeCatalog();
  // 1品目の定番（肉じゃが）は、もう新着に2品ある → 検索しない
  const [dish0] = WAVE_CLASSIC_DISHES[0];
  catalog.ready.set(id(901), recipe(id(901), `ほくほく${dish0}`)); catalog.ready.set(id(902), recipe(id(902), `定番の${dish0}`));
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: id(901) }, { videoId: id(902) }], skipped: {} }] }, { ifGeneration: 0 });
  const searched = [];
  let n = 0;
  const search = async (q, o) => { searched.push([q, o]); n += 1; return [{ videoId: id(n * 10 + 1), channelId: `c${n}`, title: `料理${n}` }, { videoId: id(n * 10 + 2), channelId: `d${n}`, title: `料理${n}b` }]; };
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search });
  const r = await book.seed({ yen: 8 });
  assert.equal(r.reason, 'stage_budget');
  assert.equal(searched.length, 4);
  const [t1, c1, t2, c2] = searched;
  assert.equal(t1[0], WAVE_TREND_WORDS[0]);
  assert.equal(t1[1].publishedAfter, new Date(now - WAVE_TREND_DAYS * DAY).toISOString());
  assert.equal(t1[1].publishedBefore, undefined);
  assert.equal(c1[0], `${WAVE_CLASSIC_DISHES[1][0]} レシピ 材料 作り方`, 'the dish already in the list is skipped (no search)');
  assert.equal(c1[1].publishedBefore, new Date(now - WAVE_CLASSIC_AGE_DAYS * DAY).toISOString());
  assert.equal(c1[1].publishedAfter, undefined);
  assert.ok(Date.parse(t1[1].publishedAfter) > Date.parse(c1[1].publishedBefore), 'the two directions never share a video');
  assert.equal(t2[0], WAVE_TREND_WORDS[1]);
  assert.equal(c2[0], `${WAVE_CLASSIC_DISHES[2][0]} レシピ 材料 作り方`);
  assert.deepEqual(r.stage.byAxis, { trend: 4, classic: 4 });
  assert.equal(r.stage.byQuery['話題の新作'], 4);
  assert.equal(r.stage.byQuery[`定番・${WAVE_CLASSIC_DISHES[1][1]}`] >= 2, true);
  const log = r.waves.log;
  assert.equal(log.find((e) => e.skipped === 'enough').q, dish0);
  assert.ok(log.filter((e) => !e.skipped).every((e) => e.picked === 2 && e.added === 2 && e.ai === 2), 'each search records how many it picked, read with the AI and added');
  assert.equal(r.waves.searchedToday, 4);
  assert.equal(r.waves.searchPerDay, WAVE_SEARCH_PER_DAY);
  assert.equal(r.waves.trendReady, WAVE_TREND_WORDS.length - 2);
  assert.equal(r.waves.classicLeft, WAVE_CLASSIC_DISHES.length - 3);
  assert.equal(JSON.stringify((await store.get('trends/seed')).envelope).includes('料理'), false, 'no YouTube titles are stored');
});

test('waves: a trend word waits 14 days before reuse; one direction running out does not end the stage, both running out does', async () => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await usedUp(store);
  const catalog = fakeCatalog();
  const searched = [];
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search: async (q) => { searched.push(q); return []; } });
  const r = await book.seed({ yen: 50, axis: 'trend' });
  assert.equal(r.reason, 'axis_exhausted');
  assert.equal(r.stage.done, false, 'the other direction can continue the same stage');
  assert.deepEqual(searched, WAVE_TREND_WORDS);
  assert.equal(r.waves.trendReady, 0);
  assert.ok(r.waves.trendNextAt);
  searched.length = 0;
  now += WAVE_TREND_REUSE_DAYS * DAY;
  await book.seed({ yen: 50, axis: 'trend' });
  assert.deepEqual(searched, WAVE_TREND_WORDS, 'after 14 days the words are used again (new videos by then)');
  searched.length = 0;
  // 両方：定番を使い切り、話題は14日あけ中 → 終わり
  // 1日の検索の上限があるので、日をまたいで続ける
  let end;
  for (let i = 0; i < 3; i++) { end = await book.seed({ yen: 50 }); if (end.reason !== 'search_day_limit') break; now += DAY / 2 + 1; }
  assert.equal(end.reason, 'exhausted');
  assert.equal(end.stage.done, true);
  assert.equal(searched.length, WAVE_CLASSIC_DISHES.length);
  assert.equal(end.waves.classicLeft, 0);
});

test('waves: a failed search is retried later with the same word; searches per day are capped', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await usedUp(store);
  const catalog = fakeCatalog();
  let fail = true;
  const searched = [];
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, search: async (q) => { searched.push(q); if (fail) throw new Error('quota'); return []; } });
  const first = await book.seed({ yen: 50 });
  assert.equal(first.reason, 'search_failed');
  fail = false;
  const second = await book.seed({ yen: 50 });
  assert.equal(searched[1], searched[0], 'the same word again');
  assert.equal(second.reason, 'search_day_limit');
  assert.equal(searched.length, WAVE_SEARCH_PER_DAY, 'the failed search also counts (review fix #119)');
  assert.equal(second.stage.done, false, 'continue tomorrow');
});

test('waves: the admin endpoint shows the directions and passes the chosen one', async (t) => {
  const store = createMemorySyncStore();
  await usedUp(store);
  const searched = [];
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async (q, o) => { searched.push([q, o]); return []; } });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  const before = await (await fetch(base + '/api/admin/trends/seed', { headers: auth })).json();
  assert.equal(before.queriesLeft, 0);
  assert.deepEqual([before.waves.trendReady, before.waves.classicLeft], [WAVE_TREND_WORDS.length, WAVE_CLASSIC_DISHES.length]);
  assert.ok(before.queries.every((q) => q.status === 'done'));
  const r = await (await fetch(base + '/api/admin/trends/seed', { method: 'POST', headers: auth, body: JSON.stringify({ yen: 10, axis: 'classic' }) })).json();
  assert.equal(r.axis, 'classic');
  assert.ok(searched.length > 0 && searched.every(([, o]) => o.publishedBefore && !o.publishedAfter), 'only classic searches');
});

test('review fix (#119): a failed search (or a failed description check after it) still counts toward the 30 searches a day, while the same word is retried', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await usedUp(store);
  const catalog = fakeCatalog();
  const searched = [];
  let searchOk = false;
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000,
    videoDetails: async () => { throw new Error('quota'); },
    search: async (q) => { searched.push(q); if (!searchOk) throw new Error('quota'); return [{ videoId: id(1), channelId: 'c1', title: '料理' }]; } });
  for (let i = 0; i < WAVE_SEARCH_PER_DAY + 1; i++) {
    if (i === 10) searchOk = true; // 後半は検索は通るが、説明欄の確認で失敗する
    const r = await book.seed({ yen: 50 });
    assert.equal(r.reason, i < WAVE_SEARCH_PER_DAY ? 'search_failed' : 'search_day_limit');
  }
  assert.equal(searched.length, WAVE_SEARCH_PER_DAY, 'never more than 30 searches a day');
  assert.ok(searched.every((q) => q === WAVE_TREND_WORDS[0]), 'the same word is retried each time');
  assert.equal((await store.get('trends/seed')).envelope.waves.day.n, WAVE_SEARCH_PER_DAY);
});
