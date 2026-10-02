import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 集めた料理に、あとから AI の料理名を付ける・手で直す（APP_MAP §48-3・2026-10-02）。
test('backfill: names are added to collected dishes in batches of 20 (counted in the monthly cap); an admin-edited name is never overwritten; manual edits are validated', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const titles = { k0000000001: '王将風の中華うま煮', k0000000002: 'キャベツ巻き 和風', k0000000003: '謎の一品' };
  for (const v of Object.keys(titles)) await store.put(`youtube-${v}`, { status: 'ready', result: { title: titles[v], videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'c' + v.slice(-1), ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: Object.keys(titles).map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const asked = [];
  const nameDishes = async (items) => { asked.push(items.map((i) => i.videoId)); return { k0000000001: '八宝菜', k0000000002: 'ロールキャベツ' }; };
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now, nameDishes });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  assert.equal((await fetch(base + '/api/admin/backfill/dish-names', { method: 'POST' })).status, 403);
  assert.equal((await fetch(base + '/api/admin/recipes/k0000000001/dish-name', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"dishName":"x"}' })).status, 403);
  assert.deepEqual(await (await fetch(base + '/api/admin/backfill/dish-names', { headers: auth })).json(), { total: 3, calls: 1, yenPerAi: 1 });
  const r = await (await fetch(base + '/api/admin/backfill/dish-names', { method: 'POST', headers: auth })).json();
  assert.deepEqual([r.named, r.calls, r.left, r.reason], [2, 1, 0, 'done']);
  assert.deepEqual(asked, [['k0000000001', 'k0000000002', 'k0000000003']]);
  assert.equal((await store.get('trends/cost')).envelope.months['2026-10'].ai, 1, 'counted in the monthly cap');
  // 付いた料理名で親が決まる（題名だけでは決まらない料理も）
  const items = (await (await fetch(base + '/api/trends')).json()).items;
  const dish = Object.fromEntries(items.map((i) => [i.videoId, i.dish?.name || null]));
  assert.deepEqual(dish, { k0000000001: '八宝菜', k0000000002: 'ロールキャベツ', k0000000003: null });
  // 名前が返らなかった料理も試した印 → もう一度押しても費用を使わない
  assert.deepEqual(await (await fetch(base + '/api/admin/backfill/dish-names', { headers: auth })).json(), { total: 0, calls: 0, yenPerAi: 1 });
  // 手で直す（改行・長すぎは断る／空にすると題名で決める／AI で上書きしない）
  const put = (v, dishName) => fetch(`${base}/api/admin/recipes/${v}/dish-name`, { method: 'PUT', headers: auth, body: JSON.stringify({ dishName }) });
  assert.equal((await put('k0000000003', '八宝菜\nハンバーグ')).status, 400);
  assert.equal((await put('k0000000003', 'あ'.repeat(21))).status, 400);
  assert.deepEqual(await (await put('k0000000003', '回鍋肉')).json(), { dishName: '回鍋肉', dishNameFrom: 'admin' });
  const one = await (await fetch(base + '/api/admin/recipes/k0000000003', { headers: auth })).json();
  assert.deepEqual([one.dishName, one.dishNameFrom, one.dish.name], ['回鍋肉', 'admin', '回鍋肉']);
  assert.equal((await (await fetch(base + '/api/trends')).json()).items.find((i) => i.videoId === 'k0000000003').dish.name, '回鍋肉', 'the public list is refreshed right away');
  assert.deepEqual(await (await put('k0000000001', '')).json(), { dishName: '', dishNameFrom: 'admin' });
  assert.equal((await (await fetch(base + '/api/admin/recipes/k0000000001', { headers: auth })).json()).dish, null, 'cleared → decided from the title (王将風の中華うま煮 → none)');
});

test('review fix (#128): an admin name survives a full re-read; a failed save is not counted as done (no double charge); only string dish names are accepted', async () => {
  const { createRecipeCatalog } = await import('../src/recipeCatalog.js');
  const { createTrendBook } = await import('../src/trends.js');
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const v = 'm0000000001', url = `https://www.youtube.com/watch?v=${v}`;
  let aiName = '八宝菜';
  let analyzed = 0; const from = 'description';
  const analyze = async () => { analyzed += 1; return { title: '中華うま煮', dishName: aiName, ingredients: [{ name: '白菜', amount: '1/4個' }, { name: '豚', amount: '100g' }], steps: ['切る', '炒める'], videoId: v, videoUrl: url, analyzedFrom: from }; };
  const catalog = createRecipeCatalog(store, analyze, { now: () => now, model: 'm' });
  await catalog.import(url);
  // 古い読み方の保存データにして、読み直させる（動画から読む時と同じ保存の経路）
  const makeStale = async () => { const saved = await store.get(`youtube-${v}`); await store.put(`youtube-${v}`, { ...saved.envelope, result: { ...saved.envelope.result, catalog: { ...saved.envelope.result.catalog, extractorVersion: 1 } } }, { ifGeneration: saved.generation }); };
  await catalog.setDishName(url, '回鍋肉', { from: 'admin' });
  aiName = 'ハンバーグ';
  await makeStale();
  const again = await catalog.import(url);
  assert.equal(analyzed, 2, 'the recipe was really read again (review fix #128 r2)');
  assert.deepEqual([again.dishName, again.dishNameFrom], ['回鍋肉', 'admin'], 'a re-read keeps the admin name');
  await catalog.setDishName(url, '', { from: 'admin' });
  await makeStale();
  const cleared = await catalog.import(url);
  assert.equal(analyzed, 3);
  assert.deepEqual([cleared.dishName, cleared.dishNameFrom], [undefined, 'admin'], 'an admin "use the title" also survives');

  // 保存に失敗したら「済み」にしない（残りに入れ、done にしない）。次に押した時に同じ料理をもう一度読むのは、保存できなかった時だけ
  const store2 = createMemorySyncStore();
  const ids = ['n0000000001', 'n0000000002'];
  for (const id of ids) await store2.put(`youtube-${id}`, { status: 'ready', result: { title: `料理${id}`, ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'] } }, { ifGeneration: 0 });
  await store2.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: ids.map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const realCatalog = createRecipeCatalog(store2, async () => ({}), { now: () => now });
  let failSave = true;
  const flaky = { ...realCatalog, peek: (u) => realCatalog.peek(u), setDishName: async (...a) => { if (failSave && a[0].includes(ids[0])) throw new Error('conflict'); return realCatalog.setDishName(...a); }, markDishNameTried: (u) => realCatalog.markDishNameTried(u) };
  const book = createTrendBook(store2, { catalog: flaky, now: () => now, nameDishes: async () => ({ [ids[0]]: '八宝菜' }) });
  const r1 = await book.backfillDishNames();
  assert.deepEqual([r1.named, r1.failed, r1.left, r1.reason], [0, 1, 1, 'save_failed']);
  assert.equal((await book.backfillDishNames({ dryRun: true })).total, 1, 'only the unsaved one is left (the other got the tried mark)');
  failSave = false;
  const r2 = await book.backfillDishNames();
  assert.deepEqual([r2.named, r2.left, r2.reason], [1, 0, 'done']);
  assert.equal((await store2.get('trends/cost')).envelope.months['2026-10'].ai, 2);
});

test('review fix (#128): the admin edit takes only strings ("" clears)', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  await store.put('youtube-p0000000001', { status: 'ready', result: { title: '王将風 八宝菜', ingredients: [{ name: '豚' }], steps: ['切る'], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const put = (body) => fetch(`http://127.0.0.1:${server.address().port}/api/admin/recipes/p0000000001/dish-name`, { method: 'PUT', headers: { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' }, body });
  for (const body of ['{}', '{"dishName":null}', '{"dishName":3}', '{"dishName":{}}']) assert.equal((await put(body)).status, 400, body);
  assert.equal((await put('{"dishName":""}')).status, 200);
});

test('review fix (#128 r2): a recipe being re-read (pending) is not counted as done when the tried mark cannot be saved', async () => {
  const { createRecipeCatalog } = await import('../src/recipeCatalog.js');
  const { createTrendBook } = await import('../src/trends.js');
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const id = 'q0000000001';
  await store.put(`youtube-${id}`, { status: 'ready', result: { title: '謎の一品', ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'] } }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: id }], skipped: {} }] }, { ifGeneration: 0 });
  const real = createRecipeCatalog(store, async () => ({}), { now: () => now });
  assert.equal(await real.markDishNameTried(`https://www.youtube.com/watch?v=${id}`), true);
  await store.put(`youtube-${id}`, { status: 'ready', result: { title: '謎の一品', ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'] } }, { ifGeneration: (await store.get(`youtube-${id}`)).generation });
  // AI が名前を返さず、印を付ける直前に利用者が読み直しを始めた（pending）
  const wrapped = { ...real, peek: (u) => real.peek(u), setDishName: (...a) => real.setDishName(...a), markDishNameTried: async (u) => { const cur = await store.get(`youtube-${id}`); if (cur.envelope.status === 'ready') await store.put(`youtube-${id}`, { status: 'pending', startedAt: new Date(now).toISOString() }, { ifGeneration: cur.generation }); return real.markDishNameTried(u); } };
  const book = createTrendBook(store, { catalog: wrapped, now: () => now, nameDishes: async () => ({}) });
  const r = await book.backfillDishNames();
  assert.deepEqual([r.failed, r.left, r.reason], [1, 1, 'save_failed'], 'not reported as done');
});
