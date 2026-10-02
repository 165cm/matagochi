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
