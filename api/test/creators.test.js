import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createCreatorDesk } from '../src/creators.js';
import { once } from 'node:events';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

const chA = 'UC' + 'a'.repeat(22), chB = 'UC' + 'b'.repeat(22);
const resolveChannel = async (x) => (x.includes('@a') ? { channelId: chA, title: 'Aの台所' } : x.includes('@b') ? { channelId: chB, title: 'Bの台所' } : null);

test('creators: an unverified request only hides the channel for now; the admin confirms or restores it', async () => {
  let now = Date.parse('2026-09-29T00:00:00Z');
  const store = createMemorySyncStore();
  const desk = createCreatorDesk(store, { resolveChannel, now: () => now });
  const first = await desk.request({ channel: 'https://www.youtube.com/@a', message: '止めてください', contact: 'a@example.com' });
  assert.deepEqual([first.status, first.removed], ['pending', true]);
  assert.ok((await desk.optedOut()).has(chA), 'hidden while it is checked (temporary)');
  await desk.request({ channel: '@a' });
  let list = await desk.list();
  assert.equal(list.pending.length, 1); assert.equal(list.pending[0].requests, 2); assert.equal(list.confirmed.length, 0, 'a request alone never confirms a stop');
  // 運営が確かめて、持ち主でない申し込みだった → 掲載に戻す。
  assert.deepEqual(await desk.decide(chA, { decision: 'restore', note: '持ち主ではなかった' }), { channelId: chA, status: 'restored' });
  now += 10 * 60_000;
  assert.equal((await desk.optedOut()).has(chA), false, 'back in the list');
  // 戻したあとの、確かめていない申し込みは記録だけ（自動では外さない）。
  const again = await desk.request({ channel: '@a' });
  assert.deepEqual([again.status, again.removed], ['review', false]);
  assert.equal((await desk.optedOut()).has(chA), false);
  list = await desk.list();
  assert.equal(list.restored[0].requests, 1);
  // 確かめて停止を確定。
  await desk.decide(chA, { decision: 'confirm' });
  assert.ok((await desk.optedOut()).has(chA));
  assert.deepEqual((await desk.request({ channel: '@a' })).status, 'confirmed');
  assert.equal((await desk.list()).confirmed[0].channelId, chA);
});

test('creators: channels stopped by the old version stay stopped; bad decisions are refused', async () => {
  const store = createMemorySyncStore();
  await store.put('creators/optout', { channels: { [chB]: { title: 'Bの台所', at: '2026-09-01T00:00:00Z' } } }, { ifGeneration: 0 });
  const desk = createCreatorDesk(store, { resolveChannel });
  assert.ok((await desk.optedOut()).has(chB));
  assert.equal((await desk.list()).confirmed[0].channelId, chB);
  await assert.rejects(desk.decide(chA, { decision: 'confirm' }), { code: 'channel_not_requested' });
  await assert.rejects(desk.decide(chB, { decision: 'delete' }), { code: 'invalid_decision' });
  await assert.rejects(desk.decide('not-a-channel', { decision: 'restore' }), { code: 'invalid_decision' });
  await assert.rejects(desk.request({ channel: 'https://example.com' }), { code: 'channel_not_found' });
});

test('creators: two requests at the same time are both kept', async () => {
  const store = createMemorySyncStore();
  const desk = createCreatorDesk(store, { resolveChannel });
  await Promise.all([desk.request({ channel: '@a' }), desk.request({ channel: '@b' })]);
  assert.deepEqual((await desk.list()).pending.map((x) => x.channelId).sort(), [chA, chB]);
});

test('creators admin routes need the admin token; the public request route cannot confirm or restore', async (t) => {
  const store = createMemorySyncStore();
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', ALLOWED_ORIGINS: '' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  {
    const sent = await (await fetch(`${base}/api/creators/request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: '@a', status: 'confirmed', decision: 'confirm' }) })).json();
    assert.equal(sent.status, 'pending', 'extra fields from the public form are ignored');
    assert.equal((await fetch(`${base}/api/admin/creators`)).status, 403);
    assert.equal((await fetch(`${base}/api/admin/creators/${chA}/decide`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token-xxxx' }, body: JSON.stringify({ decision: 'restore' }) })).status, 403);
    const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer admin-test-token' };
    assert.equal((await (await fetch(`${base}/api/admin/creators`, { headers: auth })).json()).pending[0].channelId, chA);
    assert.equal((await (await fetch(`${base}/api/admin/creators/${chA}/decide`, { method: 'POST', headers: auth, body: JSON.stringify({ decision: 'restore' }) })).json()).status, 'restored');
  }
});
