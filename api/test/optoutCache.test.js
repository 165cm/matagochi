import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 掲載停止・再開をしたら、新着・みんなの定番の表示キャッシュ（10分）をすぐ捨てる（#124 のレビューで見つかった既存の課題）。
const chA = 'UC' + 'a'.repeat(22);
const resolveChannel = async (x) => (x.includes('@a') ? { channelId: chA, title: 'Aの台所' } : null);

test('stopping or restoring a channel takes effect on /api/trends and /api/popular right away (no 10-minute leftover)', async (t) => {
  const now = Date.parse('2026-10-05T01:00:00Z');
  const store = createMemorySyncStore();
  const recipe = (v, title) => ({ title, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelId: chA, channelTitle: 'Aの台所', ingredients: [{ name: '豚' }, { name: '白菜' }, { name: '塩' }], steps: ['切る', '炒める'], tags: [], snippetFetchedAt: new Date(now).toISOString(), catalog: { analyzedAt: new Date(now).toISOString(), extractorVersion: 99 } });
  await store.put('youtube-f0000000001', { status: 'ready', result: recipe('f0000000001', '八宝菜') }, { ifGeneration: 0 });
  await store.put('youtube-f0000000002', { status: 'ready', result: recipe('f0000000002', '肉じゃが') }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(now), startedAt: new Date(now).toISOString(), candidates: [], tried: [], items: [{ videoId: 'f0000000001' }], skipped: {} }] }, { ifGeneration: 0 });
  await store.put('popular/kept', { videos: { f0000000002: { at: '2026-10-04' } } }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', ALLOWED_ORIGINS: '' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel, searchRecipes: async () => [], now: () => now });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ids = async (path) => (await (await fetch(base + path)).json()).items.map((i) => i.videoId);
  const trends = await fetch(base + '/api/trends');
  assert.equal(trends.headers.get('cache-control'), 'public, max-age=60', 'browsers keep it for a minute only');
  assert.deepEqual((await trends.json()).items.map((i) => i.videoId), ['f0000000001']);
  assert.deepEqual(await ids('/api/popular'), ['f0000000002']);
  // 停止の申し込み（確認待ちの一時対応）→ すぐに両方から外れる
  assert.equal((await (await fetch(`${base}/api/creators/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: '@a' }) })).json()).status, 'pending');
  assert.deepEqual(await ids('/api/trends'), []);
  assert.deepEqual(await ids('/api/popular'), []);
  // 運営が確かめて掲載に戻す → すぐに戻る
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer admin-test-token' };
  assert.equal((await (await fetch(`${base}/api/admin/creators/${chA}/decide`, { method: 'POST', headers: auth, body: JSON.stringify({ decision: 'restore' }) })).json()).status, 'restored');
  assert.deepEqual(await ids('/api/trends'), ['f0000000001']);
  assert.deepEqual(await ids('/api/popular'), ['f0000000002']);
});

test('review fix (#125): a repeated request that does not change what is stopped does not drop the caches', async () => {
  const { createCreatorDesk } = await import('../src/creators.js');
  const store = createMemorySyncStore();
  let changed = 0;
  const desk = createCreatorDesk(store, { resolveChannel, onChange: () => { changed += 1; } });
  await desk.request({ channel: '@a' });
  assert.equal(changed, 1, 'a new pending stop drops the caches');
  await desk.request({ channel: '@a' });
  assert.equal(changed, 1, 'the same request again changes nothing');
  await desk.decide(chA, { decision: 'restore' });
  assert.equal(changed, 2, 'restoring drops the caches');
  await desk.request({ channel: '@a' });
  assert.equal(changed, 2, 'a request after restore is only recorded (not stopped) → no drop');
  assert.deepEqual([...(await desk.optedOut())], []);
});
