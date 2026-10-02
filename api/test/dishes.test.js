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

test('review fix (#124): every adoption count reaches the new dishes (beyond 500), and the admin reads never promote the dictionary', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const titles = { c0000000001: 'ふわふわ豆腐焼き', c0000000002: '絶品 ふわふわ豆腐焼き', c0000000003: 'ふわふわ豆腐焼き｜簡単' };
  const recipe = (v) => ({ title: titles[v], videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: v.endsWith('1') ? 'ca' : 'cb', channelTitle: 'ch', ingredients: [{ name: '豆腐' }, { name: '卵' }, { name: '塩' }], steps: ['混ぜる', '焼く'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } });
  for (const v of Object.keys(titles)) await store.put(`youtube-${v}`, { status: 'ready', result: recipe(v) }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: Object.keys(titles).map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const many = Object.fromEntries(Array.from({ length: 520 }, (_, i) => [`z${String(i).padStart(10, '0')}`, { shown: 20, planned: 10, cooked: 0, all: 10 }]));
  await store.put('popular/2026-10', { recipes: { ...many, c0000000001: { shown: 4, planned: 1, cooked: 0, all: 1 } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = { Authorization: 'Bearer admin-test-token' };
  const { recipes } = await (await fetch(base + '/api/admin/recipes', { headers: auth })).json();
  const mine = recipes.find((r) => r.videoId === 'c0000000001');
  assert.deepEqual([mine.shown, mine.planned, mine.rate], [4, 1, 25], 'the 521st count still reaches the new dish');
  await fetch(base + '/api/admin/dishes', { headers: auth });
  assert.equal(Object.keys((await store.get('dishes/book'))?.envelope?.promoted || {}).length, 0, 'admin reads do not promote');
  // 公開の一覧では格上げされる
  await fetch(base + '/api/trends');
  assert.ok((await store.get('dishes/book')).envelope.promoted[dishKey('ふわふわ豆腐焼き')]);
});

test('review fix (#124 r2): stopped channels and stopped videos do not come back into the admin list through the adoption counts', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const chStop = 'UC' + 'x'.repeat(22);
  const titles = { d0000000001: '王将風 八宝菜', d0000000002: '陳健一さんの八宝菜', d0000000003: 'プロが作る八宝菜' };
  const ch = { d0000000001: chStop, d0000000002: 'UC' + 'y'.repeat(22), d0000000003: 'UC' + 'z'.repeat(22) };
  const recipe = (v) => ({ title: titles[v], videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: ch[v], channelTitle: 'ch', ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } });
  for (const v of Object.keys(titles)) await store.put(`youtube-${v}`, { status: 'ready', result: recipe(v) }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: 'd0000000001' }], skipped: {} }] }, { ifGeneration: 0 });
  await store.put('popular/2026-10', { recipes: { d0000000001: { shown: 3, planned: 1, cooked: 0, all: 1 }, d0000000002: { shown: 3, planned: 2, cooked: 0, all: 2 }, d0000000003: { shown: 1, planned: 1, cooked: 0, all: 1 } } }, { ifGeneration: 0 });
  // 1 は投稿者ごと停止（新着・採用の両方にある）、2 は動画単位で停止、3 はそのまま
  await store.put('creators/optout', { channels: { [chStop]: { title: '止めた投稿者', at: '2026-09-01T00:00:00Z' } }, videos: { d0000000002: { at: '2026-09-02T00:00:00Z' } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const { recipes } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/admin/recipes`, { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.deepEqual(recipes.map((r) => r.videoId), ['d0000000003']);
});

test('review fix (#124 r3): a channel stopped after the new-dish list was cached is still left out of the admin list', async (t) => {
  let now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const chStop = 'UC' + 'q'.repeat(22);
  const recipe = { title: '王将風 八宝菜', videoUrl: 'https://www.youtube.com/watch?v=e0000000001', channelId: chStop, channelTitle: 'ch', ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } };
  await store.put('youtube-e0000000001', { status: 'ready', result: recipe }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: 'e0000000001' }], skipped: {} }] }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await (await fetch(base + '/api/trends')).json()).items.length, 1, 'the public list is cached while it is still shown');
  await store.put('creators/optout', { channels: { [chStop]: { title: '止めた投稿者', at: '2026-10-05T00:00:00Z' } }, videos: {} }, { ifGeneration: 0 });
  now += 6 * 60_000; // 停止の一覧（5分）は読み直す時刻・新着の一覧（10分）はまだキャッシュの時刻
  const { recipes } = await (await fetch(base + '/api/admin/recipes', { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.deepEqual(recipes, []);
});

test('small fix (2026-10-02): a dish followed by 丼 is a donburi, not that dish', () => {
  const p = (t) => parentOf(t)?.name || null;
  assert.equal(p('ハンバーグそぼろ丼'), 'そぼろ丼');
  assert.equal(p('鶏の照り焼き丼'), null, 'not 鶏の照り焼き');
  assert.equal(p('麻婆豆腐丼'), null);
  assert.equal(p('秋の和風ハンバーグ'), 'ハンバーグ');
  assert.equal(p('親子丼'), '親子丼');
  // review fix (#126)：補足の中の「丼」は見ない
  assert.equal(p('基本のハンバーグ｜丼にもおすすめ'), 'ハンバーグ');
  assert.equal(p('麻婆豆腐（丼にもおすすめ）'), '麻婆豆腐');
  assert.equal(p('親子丼の素で作る親子丼ぶり'), '親子丼');
  // review fix (#126 r2)：句点・コロン・ハイフンの補足も見ない／補足の中の別の料理名に引っぱられない
  assert.equal(p('基本のハンバーグ。丼にもおすすめ'), 'ハンバーグ');
  assert.equal(p('基本のハンバーグ：丼にもおすすめ'), 'ハンバーグ');
  assert.equal(p('基本のハンバーグ - 丼にもおすすめ'), 'ハンバーグ');
  assert.equal(p('八宝菜｜中華丼の具にも'), '八宝菜');
  assert.equal(p('【ハンバーグの次に】豆腐ハンバーグ'), '豆腐ハンバーグ', 'the bracketed hook is looked at last');
  // review fix (#126 r3)：比べるための料理名（〜より・〜を超えた・〜の次に）は親にしない
  assert.equal(p('ハンバーグより簡単！本格ロールキャベツ'), 'ロールキャベツ');
  assert.equal(p('親子丼より手軽｜本格他人丼'), '他人丼');
  assert.equal(p('八宝菜を超えた？本格回鍋肉'), '回鍋肉');
  assert.equal(p('ハンバーグより簡単な本格ロールキャベツ'), 'ロールキャベツ', 'within one phrase too');
  assert.equal(p('プロが教える｜本格麻婆豆腐'), '麻婆豆腐');
  assert.equal(p('ハンバーグの作り方'), 'ハンバーグ', 'ordinary words after the dish are fine');
  // review fix (#126 r4)：「飽きない」は比べる言い方ではない／「飽きたら」は比べる言い方
  assert.equal(p('ハンバーグに飽きない定番アレンジ'), 'ハンバーグ');
  assert.equal(p('ハンバーグに飽きたら｜豆腐ステーキ'), null);
  assert.equal(p('ハンバーグに飽きた人へ！本格ロールキャベツ'), 'ロールキャベツ');
  // review fix (#126 r5)：「飽きたくない」も比べる言い方ではない
  assert.equal(p('ハンバーグに飽きたくない人の定番アレンジ'), 'ハンバーグ');
  assert.equal(p('ハンバーグにあきたくない人へ'), 'ハンバーグ');
});

test('AI dish name (2026-10-02): the AI writes a general dish name; the parent is decided from it first, then from the title; promotion uses it too', async () => {
  const { buildPrompt, buildVideoPrompt } = await import('../src/analyzer.js');
  const { normalizeImportResult } = await import('../src/importRecipe.js');
  assert.match(buildPrompt({ title: 't', description: 'd' }), /dishName/);
  assert.match(buildVideoPrompt({ title: 't', description: 'd' }, null), /dishName/);
  assert.equal(normalizeImportResult({ title: 'x', dishName: '  八宝菜 ' }).dishName, '八宝菜');
  assert.equal(normalizeImportResult({ title: 'x' }).dishName, undefined);
  // AI の料理名が先
  assert.equal(parentOf('キャベツ巻き 和風だし', {}, 'ロールキャベツ').name, 'ロールキャベツ', 'the title alone would give nothing');
  assert.equal(parentOf('ハンバーグ好きにも！和風キャベツ巻き', {}, 'ロールキャベツ').name, 'ロールキャベツ');
  // AI の料理名が辞書にない時は題名で
  assert.equal(parentOf('王将風 八宝菜', {}, '中華うま煮').name, '八宝菜');
  // 格上げは AI の料理名で数える（題名がばらばらでも）
  const store = createMemorySyncStore();
  const book = createDishBook(store, { now: () => Date.parse('2026-10-05T00:00:00Z') });
  const items = [{ videoId: 'g1', title: 'ふわっふわ！絶品豆腐焼き', channelId: 'a', dishName: '豆腐のふわふわ焼き' }, { videoId: 'g2', title: '子どもが喜ぶお豆腐おやき', channelId: 'b', dishName: '豆腐のふわふわ焼き' }, { videoId: 'g3', title: '節約！豆腐で一品', channelId: 'b', dishName: '豆腐のふわふわ焼き' }];
  const got = await book.classify(items, { promote: true });
  assert.deepEqual(Object.values(got).map((p) => p.name), ['豆腐のふわふわ焼き', '豆腐のふわふわ焼き', '豆腐のふわふわ焼き']);
});

test('review fix (#127): the video dish name is kept; broken, too long or conflicting AI names fall back to the title and never get promoted', async () => {
  const { importYouTubeRecipe, normalizeImportResult, cleanDishName } = await import('../src/importRecipe.js');
  // 説明欄が空の動画を動画から読む → 動画の料理名が残る
  const snippet = { title: 'キャベツ巻き', description: '', channelTitle: 'ch', channelId: 'UC' + 'k'.repeat(22), durationSeconds: 300 };
  const r = await importYouTubeRecipe('https://www.youtube.com/watch?v=abcdefghijk', {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({ title: '', ingredients: [], steps: [], stepsInDescription: false }),
    analyzeRecipeVideo: async () => ({ title: 'ロールキャベツ', dishName: 'ロールキャベツ', ingredients: [{ name: 'キャベツ', amount: '1/2個' }, { name: 'ひき肉', amount: '200g' }], steps: ['包む', '煮る'], stepsComplete: true }),
  }, { forceVideo: true, maxSeconds: 600 }).catch((e) => ({ error: e }));
  assert.equal(r.error, undefined, String(r.error));
  assert.equal(r.dishName, 'ロールキャベツ');
  // 壊れた値・長すぎる値は捨てる
  assert.equal(cleanDishName({ bad: true }), '');
  assert.equal(cleanDishName('   '), '');
  assert.equal(cleanDishName('あ'.repeat(21)), '');
  assert.equal(normalizeImportResult({ title: 'x', dishName: { bad: true } }).dishName, undefined);
  assert.equal(parentOf('王将風 八宝菜', {}, '[object Object]').name, '八宝菜');
  // 題名にはっきり別の料理名がある時は題名
  assert.equal(parentOf('王将風 八宝菜', {}, 'ハンバーグ').name, '八宝菜');
  // 壊れた料理名は格上げされない
  const store = createMemorySyncStore();
  const book = createDishBook(store, { now: () => Date.parse('2026-10-05T00:00:00Z') });
  const items = ['h1', 'h2', 'h3'].map((videoId, i) => ({ videoId, title: `謎の一品${i}`, channelId: i ? 'b' : 'a', dishName: '[object Object]' }));
  await book.classify(items, { promote: true });
  assert.equal(Object.values((await book.book()).promoted || {}).some((p) => /object/i.test(p.name)), false);
});
