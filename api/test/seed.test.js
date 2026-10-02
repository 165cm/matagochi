import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, SEED_QUERIES, looksLikeRecipe, TREND_YEN_PER_AI, SEED_PARALLEL } from '../src/trends.js';
import { recordUsage, usage, usageYen, liteMode } from '../src/aiUsage.js';
import { descriptionConfig } from '../src/analyzer.js';
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
  assert.equal(r2.queriesLeft, 0, 'all the fixed search words used');
  assert.equal(r2.reason, 'search_day_limit', 'then it widens (trend / classic) until the daily search cap (seedWaves.test.js)');
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
  assert.equal(usageYen(c, {}), 48, '0.30 USD × 160 (2026-10-02)');
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

test('review fix (#117): the stage reserves its calls in trends/seed before any AI call; if that cannot be saved no AI is called, and a failed final save is not reported as success', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const put = store.put.bind(store);
  let failSeed = true;
  store.put = async (key, ...rest) => (failSeed && key === 'trends/seed' ? false : put(key, ...rest));
  const catalog = fakeCatalog();
  const make = () => createTrendBook(store, { catalog, now: () => now, yenPerAi: 5, yenPerMonth: 1000,
    search: async () => [1, 2, 3].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  for (let i = 0; i < 2; i++) await assert.rejects(make().seed({ yen: 5 }), (e) => e.code === 'seed_not_saved' && /AI は使っていません/.test(e.message), 'never reported as success');
  assert.equal(catalog.calls.length, 0, 'no stage record → no AI');
  assert.equal((await store.get('trends/cost'))?.envelope.months['2026-10'].ai || 0, 0, 'the monthly reservation is returned');
  // 予約は保存でき、最後の保存だけ失敗 → 成功として返さない。次は同じ段階の金額を超えない
  failSeed = false;
  let writes = 0;
  store.put = async (key, ...rest) => (key === 'trends/seed' && ++writes >= 2 ? false : put(key, ...rest)); // 予約の保存だけ通り、最後の保存（やり直しも）は断られる
  await assert.rejects(make().seed({ yen: 5 }), { code: 'seed_not_saved' });
  assert.equal(catalog.calls.length, 1);
  assert.equal((await store.get('trends/seed')).envelope.stages[0].ai, 1, 'the reserved count stays');
  store.put = put;
  const again = await make().seed({ yen: 5 });
  assert.equal(catalog.calls.length, 1, 'the 5円 stage does not spend again');
  assert.equal(again.stage.n, 1);
  assert.equal(again.reason, 'stage_budget');
});

test('review fix (#117): a carried-over candidate stopped later (video or channel) is skipped before any AI read', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  let excluded = new Set();
  const make = () => createTrendBook(store, { catalog, now: () => now, yenPerAi: 5, yenPerMonth: 1000, optedOut: async () => excluded,
    search: async () => [1, 2, 3].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  const r1 = await make().seed({ yen: 5 }); // 1本だけ読んで、2本を持ち越す
  assert.deepEqual(r1.stage.added.map((a) => a.videoId), [id(1)]);
  excluded = new Set([id(2), 'c3']); // あとから動画Bとチャンネルを止める
  const r2 = await make().seed({ yen: 10 });
  assert.equal(catalog.calls.length, 1, 'no AI on stopped videos');
  assert.deepEqual(r2.stage.added, []);
  assert.equal(r2.stage.skipped.opted_out, 2);
});

// ── 改善（2026-10-01 の第1段階の結果から）：①説明欄のふるい ②考える部分を使わない ③3本ずつ ④目安の単価1円 ──

test('improve ①: a description with amounts and steps looks like a recipe; one with only a shop link or only ingredients does not', () => {
  assert.equal(looksLikeRecipe('【材料】2人分\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1\n【作り方】\n1. 切る\n2. 炒める'), true);
  assert.equal(looksLikeRecipe('材料\n鶏もも肉 300ｇ\n塩 少々\n酒 大さじ２\n①鶏肉を切る\n②焼く'), true, 'full-width numbers and ① steps');
  assert.equal(looksLikeRecipe('今日は簡単な晩ごはん！\n詳しいレシピはブログへ https://example.com\n#料理'), false);
  assert.equal(looksLikeRecipe('材料\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1'), false, 'ingredients only (steps are in the video)');
  assert.equal(looksLikeRecipe(''), false);
});

test('improve ①: candidates whose description has no recipe (or are not public) are dropped before any AI; already-read ones skip the check; a failed check retries the same search later', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  catalog.ready.set(id(4), recipe(id(4)));
  const recipeText = '材料\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1\n作り方\n1. 切る\n2. 炒める';
  let fail = true, asked = [];
  const videoDetails = async (ids) => {
    asked.push(...ids);
    if (fail) throw new Error('quota');
    return { [id(1)]: { status: 'public', snippet: { description: recipeText } }, [id(2)]: { status: 'public', snippet: { description: '詳しくはブログで' } }, [id(3)]: { status: 'non_public' } };
  };
  const make = () => createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000, videoDetails,
    search: async () => [1, 2, 3, 4].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  const first = await make().seed({ yen: 10 });
  assert.equal(first.reason, 'search_failed');
  assert.equal(catalog.calls.length, 0);
  assert.equal(first.queriesLeft, SEED_QUERIES.length, 'the same search runs again next time');
  fail = false; asked = [];
  const r = await make().seed({ yen: 10 });
  assert.deepEqual(asked.sort(), [id(1), id(2), id(3)], 'the already-read video is not checked');
  assert.deepEqual(catalog.calls.map(([v]) => v), [id(1)], 'only the recipe-looking one is read by the AI');
  assert.deepEqual(r.stage.added.map((a) => [a.videoId, a.free]), [[id(1), false], [id(4), true]]);
  assert.equal(r.stage.skipped.description_not_recipe, 1);
  assert.equal(r.stage.skipped.not_public, 1);
});

test('improve ③: three are read at once, and the AI count never goes over the reservation even in parallel', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  let running = 0, peak = 0;
  const slowImport = catalog.import.bind(catalog);
  catalog.import = async (...a) => { running += 1; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 20)); try { return await slowImport(...a); } finally { running -= 1; } };
  const book = createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => [1, 2, 3, 4, 5, 6, 7].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  const r = await book.seed({ yen: 5 });
  assert.equal(SEED_PARALLEL, 3);
  assert.equal(peak, 3);
  assert.equal(catalog.calls.length, 5, '5円 ÷ 1円 = 5 calls, never more');
  assert.equal(r.stage.ai, 5);
  assert.equal(r.reason, 'stage_budget');
  assert.equal(r.candidatesLeft, 2, 'the unread ones wait for the next stage');
  assert.equal((await store.get('trends/cost')).envelope.months['2026-10'].ai, 5);
});

test('improve ② ④: collection reads descriptions without thinking (users\' imports unchanged); the default unit price is 1円', async () => {
  assert.equal(TREND_YEN_PER_AI, 1);
  assert.equal(descriptionConfig('gemini-2.5-flash').thinkingConfig, undefined, 'a user import thinks as before');
  await usage.run({ lite: true }, async () => {
    assert.equal(liteMode(), true);
    assert.deepEqual(descriptionConfig('gemini-2.5-flash').thinkingConfig, { thinkingBudget: 0 });
    assert.equal(descriptionConfig('gemini-2.5-pro').thinkingConfig, undefined, 'only flash accepts 0');
  });
  // 毎日の新着集めと一括収集の取り込みは lite で呼ばれる
  const now = Date.parse('2026-10-05T01:00:00Z');
  const seenLite = [];
  const catalog = fakeCatalog();
  const orig = catalog.import.bind(catalog);
  catalog.import = async (...a) => { seenLite.push(liteMode()); return orig(...a); };
  await createTrendBook(createMemorySyncStore(), { catalog, now: () => now, yenPerAi: 1, search: async () => [{ videoId: id(1), channelId: 'c1', title: '料理' }] }).seed({ yen: 3 });
  await createTrendBook(createMemorySyncStore(), { catalog, now: () => now, perDay: 1, aiPerDay: 9, aiPerWeek: 9, search: async () => [{ videoId: id(2), channelId: 'c2', title: '料理' }] }).step();
  assert.deepEqual(seenLite, [true, true]);
});

test('review fix (#118): amounts at the start of a line are not steps, and "作り方は動画で" alone is not a recipe', () => {
  assert.equal(looksLikeRecipe('材料\n100g 豚肉\n1個 玉ねぎ\n大さじ1 しょうゆ'), false);
  assert.equal(looksLikeRecipe('材料\n豚肉 100g\n玉ねぎ 1個\nしょうゆ 大さじ1\n作り方は動画をご覧ください'), false);
  assert.equal(looksLikeRecipe('材料\n豚肉 100g\n玉ねぎ 1個\nしょうゆ 大さじ1\n作り方\n詳しくは動画で！\nhttps://example.com'), false);
  assert.equal(looksLikeRecipe('材料\n豚肉 100g\n玉ねぎ 1個\n醤油 大さじ1\n作り方\n玉ねぎを切る\nフライパンで炒める'), true, 'steps without numbers after the heading');
  assert.equal(looksLikeRecipe('材料\n豚肉 1.5kg\n玉ねぎ 1個\n塩 少々\n(1) 切る\n(2) 煮る'), true);
  assert.equal(looksLikeRecipe('材料\n豚肉 100g\n玉ねぎ 1個\n塩 少々\n①切る\n②煮る'), true, 'circled numbers (NFKC turns them into digits)');
});

test('review fix (#118): a candidate in the 1-minute cooldown (or being read elsewhere) goes back to the list instead of being dropped', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  const cooling = new Set();
  const orig = catalog.import.bind(catalog);
  catalog.import = async (url, o) => {
    const v = url.match(/v=([\w-]{11})/)[1];
    if (cooling.has(v)) throw Object.assign(new Error('cooldown'), { code: 'analysis_cooldown', status: 429 });
    return orig(url, o);
  };
  const make = () => createTrendBook(store, { catalog, now: () => now, yenPerAi: 1, yenPerMonth: 1000,
    search: async () => [1, 2, 3].map((n) => ({ videoId: id(n), channelId: `c${n}`, title: `料理${n}` })) });
  const first = await make().seed({ yen: 1 }); // 予算1回：1本読んで、2本が戻る
  assert.equal(catalog.calls.length, 1);
  assert.equal(first.candidatesLeft, 2);
  // 本物のカタログは、予算で断った動画に1分の待ちを残す。すぐ次の段階を押す
  cooling.add(id(2)); cooling.add(id(3));
  const second = await make().seed({ yen: 5 });
  assert.equal(second.reason, 'wait');
  assert.equal(second.stage.done, false);
  assert.equal(second.candidatesLeft, 2, 'not dropped');
  assert.equal((await store.get('trends/seed')).envelope.tried.includes(id(2)), false);
  // 1分後：読める
  cooling.clear();
  const third = await make().seed({ yen: 5 });
  assert.deepEqual(third.stage.added.map((a) => a.videoId).sort(), [id(2), id(3)]);
});

test('small fix (2026-10-02): a numbered list of ingredients with amounts is not counted as steps; numbered steps with cooking still are; 1 USD = 160 yen and past stages are re-priced from their tokens', async () => {
  const ingredientsOnly = '材料\n1. 豚こま 200g\n2. キャベツ 1/4個\n3. しょうゆ 大さじ1\n4. 砂糖 小さじ1';
  assert.equal(looksLikeRecipe(ingredientsOnly), false, 'numbered ingredients are not steps');
  const steps = '材料\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1\n1. キャベツをざく切りにする\n2. 豚こまを炒めて味をつける';
  assert.equal(looksLikeRecipe(steps), true);
  const longSteps = '材料\n豚こま 200g\nキャベツ 1/4個\nしょうゆ 大さじ1\n① 全部をボウルでよくなじませておきます\n② フライパンで火が通るまで\n';
  assert.equal(looksLikeRecipe(longSteps), true);
  // review fix (#126)：短い手順でも、分量がなければ手順（動きの言葉が辞書になくても）
  assert.equal(looksLikeRecipe('材料\n卵 2個\nご飯 200g\nケチャップ 大さじ2\n作り方\n1. 卵を割る\n2. ご飯とケチャップを合わせる\n3. 半熟になったら器に移す'), true);
  assert.equal(usageYen({ input: 1_000_000, output: 0 }, {}), 48, '0.30 USD × 160');
  const store = createMemorySyncStore();
  await store.put('trends/seed', { stages: [{ n: 1, yen: 100, startedAt: '2026-10-01T00:00:00Z', ai: 1, input: 1_000_000, output: 0, yenMeasured: 45, added: [], skipped: {}, byQuery: {}, done: true }], q: 0, candidates: [], tried: [] }, { ifGeneration: 0 });
  const book = createTrendBook(store, { catalog: fakeCatalog(), now: () => Date.parse('2026-10-05T00:00:00Z'), search: async () => [] });
  assert.equal((await book.seedStatus()).stages[0].yenMeasured, 48, 'a stage saved at 150 is shown at today\'s 160');
});
