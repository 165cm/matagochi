import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { parseJsonResponse } from '../src/analyzer.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 管理画面の改善：AI の答えの前後の文を外して読む／読み取り済みのレシピを見る・手順の時刻を直す／検索語の進み具合。
const V = 'abcdefghijk';
const recipe = { title: '豚こまキャベツ', videoUrl: `https://www.youtube.com/watch?v=${V}`, channelTitle: 'ちゃんねる', channelId: 'UCx', ingredients: [{ name: '豚こま', amount: '200g' }], steps: ['切る', '炒める', '味をつける'], stepTimes: [10, null, 95], planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } };

test('AI answers with extra text around the JSON are still read (no second AI call)', () => {
  assert.deepEqual(parseJsonResponse('はい、こちらです。\n{"title":"豚こま"}\n以上です'), { title: '豚こま' });
  assert.deepEqual(parseJsonResponse('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonResponse('読めませんでした'), { code: 'gemini_invalid_json' });
});

async function serve(t) {
  const store = createMemorySyncStore();
  await store.put(`youtube-${V}`, { status: 'ready', result: recipe }, { ifGeneration: 0 });
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [] });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  return { store, base: `http://127.0.0.1:${server.address().port}` };
}
const admin = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };

test('admin: read a collected recipe and fix its step times (saved to the recipe and to the shared ▶ times); needs the token', async (t) => {
  const { store, base } = await serve(t);
  assert.equal((await fetch(`${base}/api/admin/recipes/${V}`)).status, 403);
  assert.equal((await fetch(`${base}/api/admin/recipes/bad`, { headers: admin })).status, 400);
  assert.equal((await fetch(`${base}/api/admin/recipes/zzzzzzzzzzz`, { headers: admin })).status, 404);
  const got = await (await fetch(`${base}/api/admin/recipes/${V}`, { headers: admin })).json();
  assert.equal(got.title, '豚こまキャベツ');
  assert.deepEqual(got.stepTimes, [10, null, 95]);
  assert.equal((await fetch(`${base}/api/admin/recipes/${V}/step-times`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"stepTimes":[1,2,3]}' })).status, 403);
  const r = await fetch(`${base}/api/admin/recipes/${V}/step-times`, { method: 'PUT', headers: admin, body: JSON.stringify({ stepTimes: [12, '45', -3, 99] }) });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).stepTimes, [12, 45, null], 'one per step; negative or extra values are dropped');
  const saved = (await store.get(`youtube-${V}`)).envelope.result;
  assert.deepEqual([saved.stepTimes, saved.stepTimesFrom, saved.title], [[12, 45, null], 'admin', '豚こまキャベツ']);
  // 作る画面の「▶」で使う時刻（timecodes）にも、運営が直したものとして入る（1日の回数の上限は使わない）
  const { names } = await store.list('timecodes/');
  const fixes = [];
  for (const k of names) { const e = await store.get(k); if (e?.envelope?.source === 'fix') fixes.push(e.envelope); }
  assert.ok(fixes.some((f) => f.by === 'admin' && f.stepTimes[0] === 12), JSON.stringify(names));
});

test('admin: the seed status lists the search words with their progress', async (t) => {
  const { store, base } = await serve(t);
  await store.put('trends/seed', { stages: [], q: 3, candidates: [{ videoId: V, label: 'x' }], tried: [] }, { ifGeneration: 0 });
  const s = await (await fetch(`${base}/api/admin/trends/seed`, { headers: admin })).json();
  assert.deepEqual(s.queries.slice(0, 4).map((q) => q.status), ['done', 'done', 'current', 'todo']);
  assert.ok(s.queries[0].q && s.queries[0].label);
  assert.equal(s.yenPerAi, 1);
});

test('review fix (#119): clearing all step times also clears the shared ▶ times (no stale times, no AI search again); users still cannot clear', async (t) => {
  const { base } = await serve(t);
  const put = (stepTimes) => fetch(`${base}/api/admin/recipes/${V}/step-times`, { method: 'PUT', headers: admin, body: JSON.stringify({ stepTimes }) });
  const shared = async () => (await (await fetch(`${base}/api/import/youtube/timecodes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: recipe.videoUrl, steps: recipe.steps, peek: true }) })).json());
  assert.equal((await put([10, 20, null])).status, 200);
  assert.deepEqual((await shared()).stepTimes, [10, 20, null]);
  assert.equal((await put([null, null, null])).status, 200);
  const after = await shared();
  assert.deepEqual(after.stepTimes, [null, null, null], 'the cooking screen matches the admin screen');
  assert.equal(after.source, 'fix');
  const user = await fetch(`${base}/api/import/youtube/timecodes`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: recipe.videoUrl, steps: recipe.steps, stepTimes: [null, null, null] }) });
  assert.equal(user.status, 400, 'a user fix still needs at least one time');
});
