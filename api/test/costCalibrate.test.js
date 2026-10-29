import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, calibratedYenPerAi, weekOf, TREND_COST_MIN_SAMPLES } from '../src/trends.js';
import { recordUsage, usageYen } from '../src/aiUsage.js';

// 1回の単価を実測のトークン数から合わせる（2026-10-29：管理画面の目安 985円・Google Cloud の請求は全体で 634円だった）。
test('calibratedYenPerAi: needs enough measured calls; uses measured yen per counted call with a margin; zero-token entries are ignored', () => {
  assert.deepEqual(calibratedYenPerAi([{ ai: 10, input: 10_000, output: 1_000 }], 1), { yenPerAi: 1, calibrated: false, samples: 10 });
  // 40回で 読んだ 400,000・書いた 40,000 トークン → (0.12 + 0.1) ドル × 160 = 35.2円 → 1回 0.88円 × 1.2
  const r = calibratedYenPerAi([{ ai: 40, input: 400_000, output: 40_000 }, { ai: 3, input: 0, output: 0 }, null], 1);
  assert.equal(r.calibrated, true);
  assert.equal(r.samples, 40, 'a stage without tokens (nothing measured) is not a sample');
  assert.equal(r.measuredPerAi, 0.88);
  assert.equal(r.yenPerAi, 1.056);
  // とても安い・とても高い時も、0.1〜10円の間
  assert.equal(calibratedYenPerAi([{ ai: 100, input: 1, output: 0 }]).yenPerAi, 0.1);
  assert.equal(calibratedYenPerAi([{ ai: 30, input: 0, output: 100_000_000 }]).yenPerAi, 10);
});

test('cost(): this month is re-priced with the measured unit (seed stages within 35 days); older months keep their stored unit', async () => {
  const now = Date.parse('2026-10-29T03:00:00Z');
  const store = createMemorySyncStore();
  await store.put('trends/cost', { months: { '2026-10': { ai: 985, yenPerAi: 1, cap: 1000 }, '2026-09': { ai: 500, yenPerAi: 1, cap: 1000 } } }, { ifGeneration: 0 });
  // 一括収集の段階：100回で 読んだ 1,000,000・書いた 100,000 トークン = (0.3 + 0.25) × 160 = 88円 → 1回 0.88円。古い段階（40日前）は使わない
  await store.put('trends/seed', { stages: [
    { n: 1, startedAt: new Date(now - 40 * 86_400_000).toISOString(), ai: 100, input: 100_000_000, output: 0, done: true },
    { n: 2, startedAt: new Date(now - 5 * 86_400_000).toISOString(), ai: 100, input: 1_000_000, output: 100_000, done: true }
  ] }, { ifGeneration: 0 });
  const book = createTrendBook(store, { catalog: { import: async () => ({}) }, search: async () => [], now: () => now });
  const [oct, sep] = await book.cost();
  assert.equal(oct.month, '2026-10');
  assert.equal(oct.calibrated, true);
  assert.equal(oct.yenPerAi, 1.056);
  assert.equal(oct.yen, Math.round(985 * 1.056));
  assert.equal(sep.yen, 500, 'last month keeps the unit it was counted with');
  // 単価を合わせない設定・実測が少ない間は、今までどおり
  const fixed = createTrendBook(store, { catalog: { import: async () => ({}) }, search: async () => [], now: () => now, calibrate: false });
  assert.equal((await fixed.cost())[0].yen, 985);
  assert.equal((await fixed.unitYen()).calibrated, false);
});

test('the measured tokens of AI calls outside the seed stages are added to trends/cost (and kept when the count changes)', async () => {
  const now = Date.parse('2026-10-29T03:00:00Z');
  const store = createMemorySyncStore();
  for (const v of ['m0000000001', 'm0000000002']) await store.put(`youtube-${v}`, { status: 'ready', result: { title: '肉じゃが', videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'c1', ingredients: [{ name: '豚' }, { name: 'じゃがいも' }, { name: '玉ねぎ' }], steps: ['切る', '煮る'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: 'm0000000001' }, { videoId: 'm0000000002' }], skipped: {} }] }, { ifGeneration: 0 });
  const nameDishes = async () => { recordUsage('gemini-2.5-flash', { usageMetadata: { promptTokenCount: 2000, candidatesTokenCount: 300 } }); return { m0000000001: '肉じゃが' }; };
  const catalog = { import: async () => ({}), peek: async (url) => (await store.get(`youtube-${url.split('v=')[1]}`))?.envelope.result || null, setDishName: async () => ({ dishName: '肉じゃが' }), markDishNameTried: async () => true };
  const book = createTrendBook(store, { catalog, search: async () => [], now: () => now, nameDishes });
  const r = await book.backfillDishNames({ maxCalls: 1 });
  assert.equal(r.calls, 1);
  const m = (await store.get('trends/cost')).envelope.months['2026-10'];
  assert.equal(m.ai, 1);
  assert.deepEqual(m.measured, { ai: 1, input: 2000, output: 300 });
  const [oct] = await book.cost();
  assert.equal(oct.measuredYen, Math.round(usageYen(m.measured) * 100) / 100);
  assert.equal(oct.calibrated, false, `fewer than ${TREND_COST_MIN_SAMPLES} measured calls: the default unit stays`);
});
