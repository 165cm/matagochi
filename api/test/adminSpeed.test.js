import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createCreatorDesk } from '../src/creators.js';
process.env.NODE_ENV = 'test';
const { createApp, mapLimit } = await import('../src/server.js');

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
  assert.ok(appsReads <= 2, `the consent file is not read once per recipe (${appsReads})`);
});

test('admin page starts loading the recipe list without waiting for the seed and catalog data', async () => {
  const html = (await import('node:fs')).readFileSync(new URL('../../admin/catalog.html', import.meta.url), 'utf8');
  const load = html.slice(html.indexOf('async function load()'), html.indexOf('document.getElementById("reload")'));
  assert.ok(load.indexOf('loadRecipes()') > 0 && load.indexOf('loadRecipes()') < load.indexOf('await Promise.all'), 'loadRecipes() is called before awaiting seed/catalog');
});
