import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTrendBook, weekOf, SEED_QUERIES, refillParents, nextParentWave, stockOf, parentRoom, LONG_PARENTS, REFILL_PARENTS_MAX, REFILL_TARGET, REFILL_DISH_PER_DAY, REFILL_AI_PER_DAY, PARENT_FLAVORS, PARENT_REUSE_DAYS } from '../src/trends.js';

// 2026-10-03：親料理ごとの補充（親80 × 子5・20分以内4：30分以上1・親1つ6品まで・毎日自動）。
const DAY = 86_400_000;
const NOW = Date.parse('2026-10-05T01:00:00Z');
let seq = 0;
const vid = () => `rf${String(++seq).padStart(9, '0')}`;
const recipe = (v, title, minutes = 10) => ({ title, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: `ch-${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: 'しょうゆ' }], steps: ['切る', '炒める'], tags: [], planning: { minutes } });
function fakeCatalog() {
  const ready = new Map(), calls = [], make = new Map();
  return { ready, calls, make,
    async peek(url) { return ready.get(url.match(/v=([\w-]{11})/)[1]) || null; }, async refresh() { return true; },
    async import(url, o = {}) {
      const v = url.match(/v=([\w-]{11})/)[1];
      if (o.aiGate && !o.aiGate.allow()) throw Object.assign(new Error('budget'), { code: 'trend_ai_budget', status: 429 });
      o.aiGate?.used(); calls.push(v);
      const r = make.get(v); ready.set(v, r); return r;
    } };
}
// 新着に、親料理の子を入れる（[料理名, 分] の並び）。
async function withList(store, catalog, dishes) {
  const items = dishes.map(([title, minutes]) => { const v = vid(); catalog.ready.set(v, recipe(v, title, minutes)); return { videoId: v }; });
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW - DAY).toISOString(), candidates: [], tried: [], items, skipped: {} }] }, { ifGeneration: 0 });
}
const start = (store, extra = {}) => store.put('trends/seed', { stages: [], q: SEED_QUERIES.length, candidates: [], tried: [], ...extra }, { ifGeneration: 0 });
const times = (n, x) => Array.from({ length: n }, () => x);

test('refill: 80 parents from the dictionary, quick-friendly dishes first, removed names left out, promoted names included', () => {
  const ps = refillParents({ removed: ['八宝菜'], promoted: { 'てりやきちくわ': { name: 'てりやきちくわ' } } });
  assert.equal(ps.length, REFILL_PARENTS_MAX);
  assert.equal(REFILL_TARGET, 400);
  assert.ok(!ps.some((p) => p.name === '八宝菜'));
  const firstLong = ps.findIndex((p) => LONG_PARENTS.has(p.name));
  assert.ok(firstLong > 0 && ps.slice(firstLong).every((p) => LONG_PARENTS.has(p.name)), 'quick-friendly first, long ones last');
  const all = refillParents({ promoted: { 'てりやきちくわ': { name: 'てりやきちくわ' } } });
  assert.equal(new Set(all.map((p) => p.key)).size, all.length);
});

test('refill: the parent missing most children is searched first with a quick word; one search per parent a day; words rotate and wait 28 days', () => {
  const parents = [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }, { key: 'c', name: 'C' }];
  const stock = { a: { quick: 4, long: 1, total: 5 }, b: { quick: 0, long: 0, total: 0 }, c: { quick: 3, long: 0, total: 3 } };
  const doc = {};
  let now = NOW;
  const w1 = nextParentWave(doc, parents, stock, now);
  assert.deepEqual([w1.word, w1.q, w1.quick], ['B', `B ${PARENT_FLAVORS.quick[0]} レシピ 材料`, true]);
  const w2 = nextParentWave(doc, parents, stock, now);
  assert.equal(w2.word, 'C', 'B already searched today');
  assert.equal(nextParentWave(doc, parents, stock, now), null, 'A is full; B and C wait until tomorrow');
  now += DAY;
  assert.equal(nextParentWave(doc, parents, stock, now).q, `B ${PARENT_FLAVORS.quick[1]} レシピ 材料`);
  // 20分以内がそろって30分以上だけ足りない親は、ふつうの言葉で
  const d2 = {};
  const w3 = nextParentWave(d2, [{ key: 'x', name: 'X' }], { x: { quick: 4, long: 0, total: 4 } }, NOW);
  assert.deepEqual([w3.q, w3.quick], [`X ${PARENT_FLAVORS.long[0]} レシピ 材料`, false]);
  // 言葉を使い切ったら28日待つ
  const d3 = {};
  let t = NOW;
  for (let i = 0; i < PARENT_FLAVORS.quick.length + PARENT_FLAVORS.long.length; i++) { assert.ok(nextParentWave(d3, [{ key: 'y', name: 'Y' }], { y: { quick: 0, long: 0, total: 0 } }, t)); t += DAY; }
  assert.equal(nextParentWave(d3, [{ key: 'y', name: 'Y' }], { y: { quick: 0, long: 0, total: 0 } }, t), null);
  assert.ok(nextParentWave(d3, [{ key: 'y', name: 'Y' }], { y: { quick: 0, long: 0, total: 0 } }, t + PARENT_REUSE_DAYS * DAY), '28 days after the last word');
});

test('refill: children per parent — at most 6, and at most 1 dish of 30 minutes or more', () => {
  assert.equal(parentRoom({ quick: 4, long: 1, total: 5 }, true), true);
  assert.equal(parentRoom({ quick: 5, long: 1, total: 6 }, true), false);
  assert.equal(parentRoom({ quick: 3, long: 1, total: 4 }, false), false);
  assert.equal(parentRoom({ quick: 3, long: 0, total: 3 }, false), true);
  assert.deepEqual(stockOf([{ dish: { key: 'a' }, planning: { minutes: 10 } }, { dish: { key: 'a' }, planning: { minutes: 45 } }, { planning: { minutes: 10 } }]), { a: { quick: 1, long: 1, total: 2 } });
});

test('refill: a full parent is skipped before the AI, a second long child is not added, a quick child is', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  // 八宝菜は20分以内3・30分以上1、生姜焼きは6品そろっている
  await withList(store, catalog, [...times(3, ['八宝菜', 10]), ['八宝菜', 45], ...times(6, ['生姜焼き', 10]), ...times(40, ['ほかの料理', 10])]);
  // 段階には20分以内が4品（段階全体の「30分以上は2割まで」には余裕がある＝親の決まりだけを確かめる）
  await start(store, { stages: [{ n: 1, yen: 100, startedAt: new Date(NOW).toISOString(), ai: 0, input: 0, output: 0, added: times(4, { videoId: 'q', minutes: 10 }), skipped: {}, byQuery: {}, done: false }] });
  const [v1, v2, v3] = [vid(), vid(), vid()];
  catalog.make.set(v1, recipe(v1, '最高の生姜焼き', 10)); catalog.make.set(v2, recipe(v2, '本格八宝菜', 45)); catalog.make.set(v3, recipe(v3, '時短八宝菜', 10));
  const searched = [];
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async (q) => { searched.push(q); return searched.length > 1 ? [] : [{ videoId: v1, channelId: 'c1', title: '最高の生姜焼き' }, { videoId: v2, channelId: 'c2', title: '本格八宝菜' }, { videoId: v3, channelId: 'c3', title: '時短八宝菜' }]; } });
  const r = await book.seed({ yen: 10, axis: 'parent', maxAdd: 1 });
  assert.match(searched[0], new RegExp(`^.+ ${PARENT_FLAVORS.quick[0]} レシピ 材料$`), 'a parent with no child yet comes first (biggest gap)');
  assert.ok(!searched[0].startsWith('八宝菜') && !searched[0].startsWith('生姜焼き'));
  assert.ok(!catalog.calls.includes(v1), 'the full parent is not read');
  assert.equal(r.stage.skipped.parent_full, 1);
  assert.equal(r.stage.skipped.parent_long, 1);
  assert.deepEqual(r.stage.added.slice(4).map((a) => a.videoId), [v3]);
  assert.equal(r.reason, 'refill_day');
  assert.deepEqual(r.ran, { ai: 2, added: 1 });
});

test('refill: runs automatically up to 15 dishes and 25 AI calls a day, and does nothing once all 80 parents have 5', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  await withList(store, catalog, times(60, ['ほかの料理', 10]));
  await start(store);
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async (q) => { const name = q.split(' ')[0]; return [1, 2, 3].map(() => { const v = vid(); catalog.make.set(v, recipe(v, `かんたん${name}`, 10)); return { videoId: v, channelId: `c-${v}`, title: `かんたん${name}` }; }); } });
  const r = await book.refill();
  assert.equal(r.added, REFILL_DISH_PER_DAY);
  assert.ok(r.ai <= REFILL_AI_PER_DAY);
  assert.equal((await store.get('trends/refill')).envelope.added, REFILL_DISH_PER_DAY);
  const again = await book.refill();
  assert.equal(again.skipped, 'today_done');
  const st = await book.parentStock();
  assert.equal(st.target, 400);
  assert.ok(st.parents.filter((p) => p.total > 0).length >= 5);
  // 80の親がすべて5品 → 何もしない
  const full = createMemorySyncStore();
  const cat2 = fakeCatalog();
  await withList(full, cat2, refillParents({}).flatMap((p) => [...times(4, [`かんたん${p.name}`, 10]), [`本格${p.name}`, 45]]));
  await start(full);
  let searched = 0;
  const b2 = createTrendBook(full, { catalog: cat2, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => { searched += 1; return []; } });
  const s2 = await b2.parentStock();
  assert.equal(s2.filled, 80);
  assert.equal((await b2.refill()).skipped, 'stocked');
  assert.equal(searched, 0);
});

test('review fix (#135): the daily share is reserved before collecting; a second call at the same time does not collect; unused share is given back', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  await withList(store, catalog, times(60, ['ほかの料理', 10]));
  await start(store);
  let searches = 0;
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async (q) => { searches += 1; if (searches > 2) return []; const name = q.split(' ')[0]; return [1, 2].map(() => { const v = vid(); catalog.make.set(v, recipe(v, `かんたん${name}`, 10)); return { videoId: v, channelId: `c-${v}`, title: `かんたん${name}` }; }); } });
  const [a, b] = await Promise.all([book.refill(), book.refill()]);
  const ran = (a.ran?.added || 0) + (b.ran?.added || 0);
  assert.ok([a.skipped, b.skipped].includes('busy'), 'only one collects');
  const saved = (await store.get('trends/refill')).envelope;
  assert.equal(saved.added, ran, 'unused share given back');
  assert.ok(saved.ai <= REFILL_AI_PER_DAY && saved.added <= REFILL_DISH_PER_DAY);
});

test('review fix (#135): if giving back the unused share fails, the day stays counted in full (never over the limit)', async () => {
  const base = createMemorySyncStore();
  const catalog = fakeCatalog();
  await withList(base, catalog, times(60, ['ほかの料理', 10]));
  await start(base);
  let refillPuts = 0;
  const store = { ...base, get: base.get.bind(base), list: base.list?.bind(base), remove: base.remove?.bind(base),
    put: async (k, v, o) => { if (k === 'trends/refill' && ++refillPuts > 1) throw new Error('down'); return base.put(k, v, o); } };
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => [] });
  const r = await book.refill();
  assert.equal(r.ran.added, 0);
  const saved = (await base.get('trends/refill')).envelope;
  assert.deepEqual([saved.ai, saved.added], [REFILL_AI_PER_DAY, REFILL_DISH_PER_DAY]);
  assert.equal((await book.refill()).skipped, 'today_done');
});

test('review fix (#135): a parent with 5 quick children and no long one is not done; a long child is searched and becomes the 6th', async () => {
  const parents = [{ key: 'x', name: 'X' }];
  const st = { x: { quick: 5, long: 0, total: 5 } };
  const w = nextParentWave({}, parents, st, NOW);
  assert.deepEqual([w.q, w.quick], [`X ${PARENT_FLAVORS.long[0]} レシピ 材料`, false]);
  assert.equal(parentRoom(st.x, true), false, 'no 6th quick child (the seat is for a long one)');
  assert.equal(parentRoom(st.x, false), true);
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  // 八宝菜：20分以内5・30分以上0
  await withList(store, catalog, [...times(5, ['八宝菜', 10]), ...times(40, ['ほかの料理', 10])]);
  await start(store, { stages: [{ n: 1, yen: 100, startedAt: new Date(NOW).toISOString(), ai: 0, input: 0, output: 0, added: times(8, { videoId: 'q', minutes: 10 }), skipped: {}, byQuery: {}, done: false }] });
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000, search: async () => [] });
  const stock = await book.parentStock();
  assert.equal(stock.parents.find((p) => p.name === '八宝菜').total, 5);
  const filledBefore = stock.filled;
  const v = vid(); catalog.make.set(v, recipe(v, '本格八宝菜', 45));
  const b2 = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async (q) => (q.startsWith('八宝菜 本格') ? [{ videoId: v, channelId: 'cv', title: '本格八宝菜' }] : []) });
  // 八宝菜まで検索が回るように、ほかの親は1日1回の印を付けておく
  const seedDoc = (await store.get('trends/seed'));
  const parentsAll = refillParents({});
  const today = new Date(NOW + 9 * 3_600_000).toISOString().slice(0, 10);
  seedDoc.envelope.waves = { turn: 0, trend: 0, trendAt: {}, classic: 0, log: [], n: 0, parents: Object.fromEntries(parentsAll.filter((p) => p.name !== '八宝菜').map((p) => [p.key, { quick: 0, long: 0, at: {}, day: today }])) };
  await store.put('trends/seed', seedDoc.envelope, { ifGeneration: seedDoc.generation });
  const r = await b2.seed({ yen: 5, axis: 'parent' });
  assert.ok(r.stage.added.some((a) => a.videoId === v), 'the long child is added as the 6th');
  const after = await b2.parentStock();
  assert.equal(after.parents.find((p) => p.name === '八宝菜').total, 6);
  assert.equal(after.filled, filledBefore + 1);
});

test('review fix (#135): the stock check reads the list fresh, not the 10-minute display cache', async () => {
  const store = createMemorySyncStore();
  const catalog = fakeCatalog();
  await withList(store, catalog, [...times(3, ['八宝菜', 10]), ...times(30, ['ほかの料理', 10])]);
  const book = createTrendBook(store, { catalog, now: () => NOW, search: async () => [] });
  await book.list(); // 表示用のキャッシュを作る
  const ix = await store.get('trends/index');
  for (let i = 0; i < 3; i++) { const v = vid(); catalog.ready.set(v, recipe(v, '八宝菜', 10)); ix.envelope.weeks[0].items.push({ videoId: v }); }
  await store.put('trends/index', ix.envelope, { ifGeneration: ix.generation }); // ほかのインスタンスが子を足した
  const st = await book.parentStock();
  assert.equal(st.parents.find((p) => p.name === '八宝菜').total, 6);
});

test('review fix (#135): the daily refresh no longer runs the refill; the refill has its own request', async (t) => {
  const { once } = await import('node:events');
  process.env.NODE_ENV = 'test';
  const { createApp } = await import('../src/server.js');
  const store = createMemorySyncStore();
  const app = createApp({}, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const refresh = await (await fetch(base + '/api/trends/refresh', { method: 'POST' })).json();
  assert.equal(refresh.refill, undefined);
  const res = await fetch(base + '/api/trends/refill', { method: 'POST' });
  assert.notEqual(res.status, 404);
});

test('review fix (#135 r2): if the collection throws (e.g. its record could not be saved after using the AI), the daily share is not given back', async () => {
  const base = createMemorySyncStore();
  const catalog = fakeCatalog();
  await withList(base, catalog, times(60, ['ほかの料理', 10]));
  await start(base);
  let seedPuts = 0;
  // 段階の予約の保存は通し、最後の記録の保存だけ失敗させる（AI は使った後）
  const store = { ...base, get: base.get.bind(base), list: base.list?.bind(base), remove: base.remove?.bind(base),
    put: async (k, v, o) => { if (k === 'trends/seed' && ++seedPuts > 1 && v?.stages?.at?.(-1)?.added?.length) return false; return base.put(k, v, o); } };
  const book = createTrendBook(store, { catalog, now: () => NOW, yenPerAi: 1, yenPerMonth: 1000,
    search: async (q) => { const name = q.split(' ')[0]; return [1, 2].map(() => { const v = vid(); catalog.make.set(v, recipe(v, `かんたん${name}`, 10)); return { videoId: v, channelId: `c-${v}`, title: `かんたん${name}` }; }); } });
  await assert.rejects(book.refill(), (e) => e.code === 'seed_not_saved');
  assert.ok(catalog.calls.length > 0, 'the AI was used');
  const saved = (await base.get('trends/refill')).envelope;
  assert.deepEqual([saved.ai, saved.added], [REFILL_AI_PER_DAY, REFILL_DISH_PER_DAY], 'kept in full');
  assert.equal((await book.refill()).skipped, 'today_done');
});

test('review fix (#135 r2): the workflow refills only after the daily collection said done:true', async () => {
  const { readFileSync } = await import('node:fs');
  const yml = readFileSync(new URL('../../.github/workflows/trends.yml', import.meta.url), 'utf8');
  assert.match(yml, /id: refresh/);
  assert.match(yml, /grep -q '"done":true' && \{ echo "done=true" >> "\$GITHUB_OUTPUT"; exit 0; \}/);
  assert.match(yml, /if: steps\.refresh\.outputs\.done == 'true'\n\s+run: \|\n[\s\S]*\/api\/trends\/refill/);
  assert.ok(!/ai_budget"' && \{[^}]*GITHUB_OUTPUT/.test(yml), 'the AI-budget stop does not mark done');
});
