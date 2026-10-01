import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { parentOf, dishKey, createDishBook, DISH_PROMOTE_VIDEOS } from '../src/dishes.js';
import { createTrendBook, weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 親の料理名（APP_MAP §48・2026-10-01）：料理名ごとにまとめる。アレンジも同じ親。辞書は格上げで育つ。
test('parents: a dictionary dish in the title is the parent (arrangements too, the last one wins, spelling variants match)', () => {
  const p = (t) => parentOf(t)?.name || null;
  assert.equal(p('王将風 八宝菜'), '八宝菜');
  assert.equal(p('陳健一さんの八宝菜'), '八宝菜');
  assert.equal(p('塩こんぶ肉じゃが'), '肉じゃが', 'an arrangement belongs to the same parent');
  assert.equal(p('揚げ出し豆腐 なめこおろし餡'), '揚げ出し豆腐');
  assert.equal(p('カレー風味のチキン南蛮'), 'チキン南蛮', 'the dish at the end of the title is the main one');
  assert.equal(p('【簡単】絶品からあげ'), '唐揚げ', 'kana spelling of a dish');
  assert.equal(p('鯖の味噌煮'), 'さばの味噌煮');
  assert.equal(p('ぶりの照り焼き'), 'ぶりの照り焼き', 'cooking-method-only names are not parents (ぶり and 鶏 stay apart)');
  assert.equal(p('鶏の照り焼き'), '鶏の照り焼き');
  assert.equal(p('お豆腐ふわふわ焼き'), null);
});

test('parents: a new dish name is promoted once 3 videos from 2+ channels share it; a removed one is not; aliases merge', async () => {
  const store = createMemorySyncStore();
  const book = createDishBook(store, { now: () => Date.parse('2026-10-05T00:00:00Z') });
  const v = (n, title, ch) => ({ videoId: `v${n}`, title, channelId: ch });
  const oneChannel = [v(1, 'ふわふわ豆腐焼き', 'a'), v(2, '絶品 ふわふわ豆腐焼き', 'a'), v(3, 'ふわふわ豆腐焼き【簡単】', 'a')];
  assert.deepEqual(await book.classify(oneChannel, { promote: true }), {}, 'one channel only → not yet');
  const two = [...oneChannel.slice(0, 2), v(3, 'ふわふわ豆腐焼き｜みんなの', 'b')];
  assert.equal(DISH_PROMOTE_VIDEOS, 3);
  const got = await book.classify(two, { promote: true });
  assert.deepEqual(Object.keys(got).sort(), ['v1', 'v2', 'v3']);
  assert.equal(got.v1.name, 'ふわふわ豆腐焼き');
  assert.ok((await book.book()).promoted[dishKey('ふわふわ豆腐焼き')].since);
  // 外すと、親にならない・格上げもしない
  await book.edit({ op: 'remove', key: 'ふわふわ豆腐焼き' });
  assert.deepEqual(await book.classify(two, { promote: true }), {});
  await book.edit({ op: 'remove', key: '八宝菜' });
  assert.equal(parentOf('王将風 八宝菜', await book.book()), null, 'a seed dish can be removed too');
  await book.edit({ op: 'restore', key: '八宝菜' });
  // 別名：「ちゃんぽん麺」を「ちゃんぽん」にまとめる（手で親にしてから）
  await book.edit({ op: 'promote', name: 'ちゃんぽん' });
  await book.edit({ op: 'alias', from: '長崎皿うどん', to: 'ちゃんぽん' });
  assert.equal(parentOf('本場の長崎皿うどん', await book.book()).name, 'ちゃんぽん');
  await assert.rejects(book.edit({ op: 'nope' }), { code: 'op_invalid' });
});

test('parents: GET /api/trends gives each item its parent; the admin endpoints need the token', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const titles = { a0000000001: '王将風 八宝菜', a0000000002: '陳健一さんの八宝菜', a0000000003: 'お豆腐ふわふわ焼き' };
  const recipe = (v) => ({ title: titles[v], videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'c' + v.slice(-1), ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [] });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: Object.keys(titles).map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const catalog = { async peek(url) { const v = url.match(/v=([\w-]{11})/)[1]; return titles[v] ? recipe(v) : null; } };
  const book = createTrendBook(store, { catalog, now: () => now });
  const items = (await book.list()).items;
  const byId = Object.fromEntries(items.map((i) => [i.videoId, i.dish?.name || null]));
  assert.deepEqual(byId, { a0000000001: '八宝菜', a0000000002: '八宝菜', a0000000003: null });

  for (const v of Object.keys(titles)) await store.put(`youtube-${v}`, { status: 'ready', result: { ...recipe(v), snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/admin/dishes')).status, 403);
  assert.equal((await fetch(base + '/api/admin/dishes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"op":"remove","key":"八宝菜"}' })).status, 403);
  const auth = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  const o = await (await fetch(base + '/api/admin/dishes', { headers: auth })).json();
  assert.equal(o.rule.videos, 3);
  assert.deepEqual(o.parents.map((p) => [p.name, p.videos, p.source]), [['八宝菜', 2, 'seed']]);
  assert.equal((await fetch(base + '/api/admin/dishes', { method: 'POST', headers: auth, body: '{"op":"remove","key":"八宝菜"}' })).status, 200);
  const o2 = await (await fetch(base + '/api/admin/dishes', { headers: auth })).json();
  assert.deepEqual(o2.parents, []);
  assert.deepEqual(o2.removed.map((r) => r.name), ['八宝菜']);
  assert.equal((await fetch(base + '/api/admin/dishes', { method: 'POST', headers: auth, body: '{"op":"bad"}' })).status, 400);
});

test('admin recipe list: new dishes and planned/kept ones, each with its parent and adoption numbers; the token is needed', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const titles = { b0000000001: '王将風 八宝菜', b0000000002: '陳健一さんの八宝菜', b0000000003: 'お豆腐ふわふわ焼き', b0000000004: '塩こんぶ肉じゃが' };
  const recipe = (v) => ({ title: titles[v], videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: 'c' + v.slice(-1), channelTitle: 'ch' + v.slice(-1), ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [], planning: { minutes: 15 }, snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } });
  for (const v of Object.keys(titles)) await store.put(`youtube-${v}`, { status: 'ready', result: recipe(v) }, { ifGeneration: 0 });
  // 新着は1〜3、4は新着ではないが献立に入って残した料理
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: ['b0000000001', 'b0000000002', 'b0000000003'].map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  await store.put('popular/2026-10', { recipes: { b0000000001: { shown: 4, planned: 1, cooked: 0, all: 1 }, b0000000004: { shown: 2, planned: 2, cooked: 1, all: 2 } } }, { ifGeneration: 0 });
  await store.put('popular/kept', { videos: { b0000000004: { at: '2026-10-04' } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/admin/recipes')).status, 403);
  const auth = { Authorization: 'Bearer admin-test-token' };
  const { recipes } = await (await fetch(base + '/api/admin/recipes', { headers: auth })).json();
  const by = Object.fromEntries(recipes.map((r) => [r.videoId, r]));
  assert.deepEqual(Object.keys(by).sort(), Object.keys(titles).sort());
  assert.equal(by.b0000000001.dish.name, '八宝菜');
  assert.equal(by.b0000000002.dish.name, '八宝菜');
  assert.equal(by.b0000000003.dish, null);
  assert.equal(by.b0000000004.dish.name, '肉じゃが');
  assert.deepEqual([by.b0000000001.trend, by.b0000000001.shown, by.b0000000001.planned, by.b0000000001.rate], [true, 4, 1, 25]);
  assert.deepEqual([by.b0000000004.trend, by.b0000000004.kept, by.b0000000004.minutes], [false, true, 15]);
  const one = await (await fetch(base + '/api/admin/recipes/b0000000002', { headers: auth })).json();
  assert.equal(one.dish.name, '八宝菜');
});
