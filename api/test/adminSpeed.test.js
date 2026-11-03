import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createCreatorDesk } from '../src/creators.js';
import { createTrendBook } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');
const { mapLimit } = await import('../src/mapLimit.js');

// 管理画面の読み込みを速くする（2026-11-03）：保存場所から1件ずつではなく20件ずつ同時に読む・同意のファイルは1回だけ。
// 一覧の中身と順番は前と同じであること。

test('mapLimit keeps the order of the results and never runs more than the limit at once', async () => {
  let running = 0, peak = 0;
  const out = await mapLimit(Array.from({ length: 50 }, (_, i) => i), 7, async (n) => {
    running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, (n * 7) % 5));
    running -= 1;
    return n * 2;
  });
  assert.deepEqual(out, Array.from({ length: 50 }, (_, i) => i * 2));
  assert.equal(peak, 7);
  assert.deepEqual(await mapLimit([], 20, async () => 1), []);
});

test('consentsForMany reads the applications once and matches consentsFor for each channel', async () => {
  const store = createMemorySyncStore();
  const desk = createCreatorDesk(store, { resolveChannel: async () => null });
  const ids = ['UC' + 'a'.repeat(22), 'UC' + 'b'.repeat(22)];
  let reads = 0;
  const get = store.get.bind(store);
  store.get = async (k, ...rest) => { if (k === 'creators/applications') reads += 1; return get(k, ...rest); };
  const many = await desk.consentsForMany([...ids, ids[0]]);
  assert.equal(reads, 1);
  assert.deepEqual(Object.keys(many).sort(), ids);
  for (const id of ids) assert.deepEqual(many[id], await desk.consentsFor(id));
  assert.deepEqual(await createCreatorDesk(null, {}).consentsForMany(ids), Object.fromEntries(ids.map((id) => [id, { aiExtract: false, store: false, summary: false, scale: false, publicCatalog: false }])));
});

test('admin recipes and catalog lists read in parallel but keep the same order and content', async (t) => {
  const store = createMemorySyncStore();
  const now = Date.now();
  const month = new Date(now + 9 * 3_600_000).toISOString().slice(0, 7);
  const ids = Array.from({ length: 40 }, (_, i) => `vid${String(i).padStart(8, '0')}`);
  // 献立に入れた回数が多い順＝ ids の順。偶数番だけ読み取り済み（奇数番は読み出せないので一覧に出ない）。
  await store.put(`popular/${month}`, { recipes: Object.fromEntries(ids.map((id, i) => [id, { shown: 100, planned: 100 - i, cooked: 0 }])) }, { ifGeneration: 0 });
  const at = new Date(now).toISOString();
  for (const [i, id] of ids.entries()) if (i % 2 === 0) await store.put(`youtube-${id}`, { status: 'ready', result: { title: `料理${i}`, videoUrl: `https://www.youtube.com/watch?v=${id}`, channelTitle: 'ch', channelId: 'UC' + 'c'.repeat(22), ingredients: [{ name: '卵', amount: '1個' }], steps: ['焼く'], snippetFetchedAt: at, catalog: { analyzedAt: at } } }, { ifGeneration: 0 });
  let running = 0, peak = 0, appsReads = 0;
  const get = store.get.bind(store);
  store.get = async (k, ...rest) => {
    if (k === 'creators/applications') appsReads += 1;
    if (!String(k).startsWith('youtube-')) return get(k, ...rest);
    running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return get(k, ...rest);
  };
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { Authorization: 'Bearer admin-test-token' };

  const { recipes } = await (await fetch(`${base}/api/admin/recipes`, { headers })).json();
  const ready = ids.filter((_, i) => i % 2 === 0);
  assert.deepEqual(recipes.map((r) => r.videoId), ready, 'same order as before (most planned first)');
  assert.deepEqual(recipes.map((r) => r.title), ready.map((id) => `料理${ids.indexOf(id)}`));
  assert.ok(peak > 1 && peak <= 20, `reads ran in parallel (peak ${peak})`);

  peak = 0; appsReads = 0;
  const cat = await (await fetch(`${base}/api/admin/catalog`, { headers })).json();
  assert.deepEqual(cat.items.map((x) => x.videoId), ids);
  assert.deepEqual(cat.items.map((x) => x.available), ids.map((_, i) => i % 2 === 0));
  assert.equal(cat.items[0].title, '料理0');
  assert.equal(cat.items[0].publicConsent, false);
  assert.ok(peak > 1 && peak <= 20, `reads ran in parallel (peak ${peak})`);
  assert.equal(appsReads, 1, 'the consent file is read once per request, not once per recipe');
});

test('admin page starts loading the recipe list without waiting for the seed and catalog data', async () => {
  const html = (await import('node:fs')).readFileSync(new URL('../../admin/catalog.html', import.meta.url), 'utf8');
  const load = html.slice(html.indexOf('async function load()'), html.indexOf('document.getElementById("reload")'));
  assert.ok(load.indexOf('loadRecipes()') > 0 && load.indexOf('loadRecipes()') < load.indexOf('await Promise.all'), 'loadRecipes() is called before awaiting seed/catalog');
});

test('admin recipes: opted-out videos are skipped before the 500 cap and opted-out channels are dropped after reading', async (t) => {
  const store = createMemorySyncStore();
  const now = Date.now();
  const month = new Date(now + 9 * 3_600_000).toISOString().slice(0, 7);
  const ids = Array.from({ length: 505 }, (_, i) => `x${String(i).padStart(10, '0')}`);
  const stop = 'UC' + 's'.repeat(22), ok = 'UC' + 'o'.repeat(22);
  await store.put(`popular/${month}`, { recipes: Object.fromEntries(ids.map((id, i) => [id, { shown: 1000, planned: 1000 - i, cooked: 0 }])) }, { ifGeneration: 0 });
  const at = new Date(now).toISOString();
  for (const [i, id] of ids.entries()) await store.put(`youtube-${id}`, { status: 'ready', result: { title: `料理${i}`, videoUrl: `https://www.youtube.com/watch?v=${id}`, channelTitle: 'ch', channelId: i === 1 ? stop : ok, ingredients: [{ name: '卵', amount: '1個' }], steps: ['焼く'], snippetFetchedAt: at, catalog: { analyzedAt: at } } }, { ifGeneration: 0 });
  // ids[0] は動画ごと掲載停止（読まない・500件に数えない）。ids[1] は投稿者が掲載停止（読むが一覧に出さない）。
  await store.put('creators/optout', { channels: { [stop]: { title: '止めた', at } }, videos: { [ids[0]]: { at } } }, { ifGeneration: 0 });
  const peeked = new Set();
  const get = store.get.bind(store);
  store.get = async (k, ...rest) => { if (String(k).startsWith('youtube-')) peeked.add(k.slice(8)); return get(k, ...rest); };
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const { recipes } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/admin/recipes`, { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  assert.deepEqual(recipes.map((r) => r.videoId), ids.slice(2, 501));
  assert.equal(peeked.has(ids[0]), false, 'an opted-out video is not read');
  assert.equal(peeked.has(ids[501]), false, 'only the first 500 (after skipping opted-out videos) are read');
});

test('trend list reads the new items in parallel, keeps the same items, and admin callers share one build in flight', async () => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const ids = Array.from({ length: 30 }, (_, i) => `t${String(i).padStart(10, '0')}`);
  await store.put('trends/index', { weeks: [{ week: '2026-W41', startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: ids.map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  let running = 0, peak = 0, calls = 0;
  const catalog = { async peek(url) {
    const v = url.match(/v=([\w-]{11})/)[1];
    calls += 1; running += 1; peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 3));
    running -= 1;
    if (v === ids[5]) throw new Error('broken');
    if (v === ids[6]) return null;
    return { title: `豚こま炒め${v}`, videoUrl: url, channelId: 'UC' + 'k'.repeat(22), ingredients: [{ name: '豚' }, { name: 'キャベツ' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [] };
  } };
  const book = createTrendBook(store, { catalog, now: () => now });
  const list = await book.list({ promote: false });
  assert.deepEqual(list.items.map((i) => i.videoId).sort(), ids.filter((_, i) => i !== 5 && i !== 6).sort(), 'a failed or missing read is skipped, the rest are listed');
  assert.ok(peak > 1 && peak <= 20, `reads ran in parallel (peak ${peak})`);
  // 管理の画面の3か所（share）は、同じ時に作っている一覧を分けてもらう。作り終わったら残さない。
  calls = 0;
  const [a, b] = await Promise.all([book.list({ promote: false, share: true }), book.list({ promote: false, share: true })]);
  assert.equal(a, b);
  assert.equal(calls, ids.length, 'one build for both');
  calls = 0;
  await book.list({ promote: false, share: true });
  assert.equal(calls, ids.length, 'a finished build is not kept (read again next time)');
  calls = 0;
  await Promise.all([book.list({ promote: false }), book.list({ promote: false })]);
  assert.equal(calls, ids.length * 2, 'callers without share (daily refill) always read for themselves');
});

test('admin page shows a loading and an error message in the recipe list', async () => {
  const html = (await import('node:fs')).readFileSync(new URL('../../admin/catalog.html', import.meta.url), 'utf8');
  const fn = html.slice(html.indexOf('async function loadRecipes()'), html.indexOf('function showParent('));
  assert.match(fn, /レシピ一覧を読み込んでいます…/);
  assert.match(fn, /レシピ一覧を読み込めませんでした/);
  assert.match(fn, /throw error/, 'callers still see the error');
});

test('admin recipes: each recipe carries its timecode level (steps, steps with a time, source) read the same way as the cooking screen', async (t) => {
  const store = createMemorySyncStore();
  const now = Date.now();
  const month = new Date(now + 9 * 3_600_000).toISOString().slice(0, 7);
  const at = new Date(now).toISOString();
  const ids = ['tcaaaaaaaaa', 'tcbbbbbbbbb', 'tcccccccccc'];
  await store.put(`popular/${month}`, { recipes: Object.fromEntries(ids.map((id, i) => [id, { shown: 10, planned: 10 - i, cooked: 0 }])) }, { ifGeneration: 0 });
  const base = { videoUrl: '', channelTitle: 'ch', channelId: 'UC' + 'q'.repeat(22), ingredients: [{ name: '卵', amount: '1個' }], snippetFetchedAt: at, catalog: { analyzedAt: at } };
  await store.put(`youtube-${ids[0]}`, { status: 'ready', result: { ...base, title: 'すべて', steps: ['切る', '焼く', '盛る'], stepTimes: [5, 30, 60], stepTimesFrom: 'transcript' } }, { ifGeneration: 0 });
  await store.put(`youtube-${ids[1]}`, { status: 'ready', result: { ...base, title: '一部', steps: ['切る', '焼く', '盛る'], stepTimes: [5, null, null], analyzedFrom: 'video' } }, { ifGeneration: 0 });
  await store.put(`youtube-${ids[2]}`, { status: 'ready', result: { ...base, title: 'なし', steps: ['切る', '焼く'], stepTimes: [] } }, { ifGeneration: 0 });
  // 空の手順があっても、時刻は手順の位置ごと（空の手順は数えない）。review fix (#225)
  await store.put(`popular/${month}`, { recipes: Object.fromEntries([...ids, 'tcddddddddd'].map((id, i) => [id, { shown: 10, planned: 10 - i, cooked: 0 }])) }, { ifGeneration: 1 });
  await store.put('youtube-tcddddddddd', { status: 'ready', result: { ...base, title: '空の手順', steps: ['切る', '', '焼く', '盛る'], stepTimes: [5, null, 30, 60], stepTimesFrom: 'transcript' } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const { recipes } = await (await fetch(`http://127.0.0.1:${server.address().port}/api/admin/recipes`, { headers: { Authorization: 'Bearer admin-test-token' } })).json();
  const tc = Object.fromEntries(recipes.map((r) => [r.title, r.tc]));
  assert.deepEqual(tc['すべて'], { n: 3, k: 3, source: 'transcript' });
  assert.deepEqual(tc['一部'], { n: 3, k: 1, source: 'video' });
  assert.deepEqual(tc['なし'], { n: 2, k: 0, source: '' });
  assert.deepEqual(tc['空の手順'], { n: 3, k: 3, source: 'transcript' });
  assert.ok(recipes.every((r) => !('src' in r)), 'the raw steps are not sent');
});
