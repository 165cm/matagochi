import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createFeedbackDesk, FEEDBACK_PER_DAY } from '../src/feedback.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

test('feedback is kept by day, with an optional contact, bounded per household', async () => {
  const desk = createFeedbackDesk(createMemorySyncStore(), { now: () => Date.parse('2026-10-06T03:00:00Z') });
  const r = await desk.send({ message: '買い物リストを家族で分けたい', contact: 'a@example.com', where: 'shop', version: 'v1' }, 'home-1');
  assert.equal(r.ok, true); assert.match(r.id, /^[0-9a-f]{8}$/);
  await assert.rejects(desk.send({ message: ' ' }, 'home-1'), { code: 'feedback_empty' });
  await assert.rejects(desk.send({ message: 'ok', contact: 'not-an-email' }, 'home-1'), { code: 'invalid_email' });
  for (let i = 1; i < FEEDBACK_PER_DAY; i++) await desk.send({ message: `意見${i}` }, 'home-1');
  await assert.rejects(desk.send({ message: 'もう1件' }, 'home-1'), { code: 'feedback_limit' });
  const day = await desk.list('2026-10-06');
  assert.equal(day.items.length, FEEDBACK_PER_DAY);
  assert.deepEqual([day.items[0].contact, day.items[0].household, day.items[0].where], ['a@example.com', 'home-1', 'shop']);
  assert.deepEqual((await desk.list()).days, ['2026-10-06']);
});

test('feedback route: anyone can send; only the admin can read', async (t) => {
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'secret-token' }, { recipeStore: createMemorySyncStore(), syncStore: null });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sent = await fetch(`${base}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Household': 'house-fb-01' }, body: JSON.stringify({ message: 'すごく便利です' }) });
  assert.equal(sent.status, 200);
  assert.equal((await fetch(`${base}/api/admin/feedback`)).status, 403);
  const days = await fetch(`${base}/api/admin/feedback`, { headers: { Authorization: 'Bearer secret-token' } }).then((r) => r.json());
  assert.equal(days.days.length, 1);
  const list = await fetch(`${base}/api/admin/feedback?day=${days.days[0]}`, { headers: { Authorization: 'Bearer secret-token' } }).then((r) => r.json());
  assert.equal(list.items[0].message, 'すごく便利です');
  assert.equal(list.items[0].household, 'house-fb-01');
});
