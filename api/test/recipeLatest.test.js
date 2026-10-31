import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-31：運営が直したレシピを、新着の一覧と端末の写しに届ける（APP_MAP §52-9）。
const V = 'oWLCye3SXu4';
const recipe = { title: '鶏むね肉のクリームソース', videoId: V, videoUrl: `https://www.youtube.com/watch?v=${V}`, ingredients: [{ name: '鶏むね肉', amount: '1枚' }, { name: '生クリーム', amount: '150ml' }, { name: 'マッシュルーム', amount: '150g' }],
  steps: ['開く', '刻む', '焼く'], stepTimes: [16, 16, 121], tags: [], snippetFetchedAt: new Date().toISOString(), catalog: { id: `youtube-${V}`, revision: 'r1', analyzedAt: new Date().toISOString(), extractorVersion: 99 } };

async function serveOn(t, store) {
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    fetchYouTubeTranscript: async () => ({ status: 'not_available', reason: 'unplayable' }), fetchYouTubeSnippet: async () => ({ title: 't', description: '', durationSeconds: 400 }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, body, method) => { const r = await fetch(`${base}${path}`, { method: method || (body ? 'POST' : 'GET'), headers: { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() }; };
}
async function world() {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: recipe }, { ifGeneration: 0 });
  const now = Date.now();
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), rounds: 4, candidates: [], tried: [], items: [{ videoId: V }], skipped: {} }] }, { ifGeneration: 0 });
  return store;
}

test('latest recipes: the newest version of saved videos, read only; unknown and malformed ids are skipped', async (t) => {
  const call = await serveOn(t, await world());
  const r = await call('/api/recipes/latest', { videoIds: [V, 'zzzzzzzzzzz', 'bad id', V] });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.items), [V]);
  assert.equal(r.body.items[V].revision, 'r1');
  assert.deepEqual(r.body.items[V].steps, recipe.steps);
  assert.deepEqual(r.body.items[V].stepTimes, recipe.stepTimes);
  assert.equal((await call('/api/recipes/latest', {})).body.items && true, true);
});

test('the new-arrivals list carries the recipe version, and a change saved on one server reaches the list on another server right away', async (t) => {
  const store = await world();
  const a = await serveOn(t, store), b = await serveOn(t, store);
  const first = (await b('/api/trends')).body.items[0];
  assert.equal(first.revision, 'r1');
  assert.deepEqual(first.stepTimes, [16, 16, 121]);
  // サーバー A で時刻を保存（版が変わる）→ サーバー B の作り置き（10分）を待たずに新しい一覧
  const opened = (await a(`/api/admin/recipes/${V}`)).body;
  const saved = await a(`/api/admin/recipes/${V}/step-times`, { stepTimes: [16, 48, 120], baseRevision: opened.revision }, 'PUT');
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const after = (await b('/api/trends')).body.items[0];
  assert.deepEqual(after.stepTimes, [16, 48, 120]);
  assert.equal(after.revision, saved.body.revision);
  assert.notEqual(after.revision, 'r1');
});

test('latest recipes say when the admin last changed the recipe (newest of adopt / step edit / time save / reread / analysis)', async (t) => {
  const store = await world();
  const cur = await store.get(`youtube-${V}`);
  await store.put(`youtube-${V}`, { ...cur.envelope, result: { ...cur.envelope.result, catalog: { ...recipe.catalog, analyzedAt: '2026-10-01T00:00:00Z' }, adoptedFrom: { at: '2026-10-31T11:20:00Z' }, rereadAt: '2026-10-20T00:00:00Z' } }, { ifGeneration: cur.generation });
  const call = await serveOn(t, store);
  assert.equal((await call('/api/recipes/latest', { videoIds: [V] })).body.items[V].changedAt, '2026-10-31T11:20:00.000Z');
  // 時刻を保存すると、その日時になる
  const opened = (await call(`/api/admin/recipes/${V}`)).body;
  await call(`/api/admin/recipes/${V}/step-times`, { stepTimes: [16, 48, 120], baseRevision: opened.revision }, 'PUT');
  assert.ok(Date.parse((await call('/api/recipes/latest', { videoIds: [V] })).body.items[V].changedAt) > Date.parse('2026-10-31T11:20:00Z'));
});
