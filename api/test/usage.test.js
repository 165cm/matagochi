import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createUsageBook } from '../src/usage.js';

test('usage: one anonymous row a day per device, merged, only known events; the report shows who comes back and what they do', async () => {
  const now = Date.parse('2026-10-08T03:00:00Z');
  const book = createUsageBook(createMemorySyncStore(), { now: () => now });
  await book.record({ anon: 'aaaaaaaa1', day: '2026-10-08', n: 0, events: { plan_confirmed: 1, secret: 5 }, members: 2, recipes: 3 });
  await book.record({ anon: 'aaaaaaaa1', day: '2026-10-08', n: 0, events: { meal_cooked: 1, plan_confirmed: 1 } });
  await book.record({ anon: 'bbbbbbbb2', day: '2026-10-08', n: 7, events: { meal_cooked: 1, meal_rated: 2 }, synced: true });
  await assert.rejects(book.record({ anon: 'Bad Id', day: '2026-10-08' }), { code: 'invalid_usage' });
  await assert.rejects(book.record({ anon: 'cccccccc3', day: '2026-01-01' }), { code: 'invalid_usage' });
  const r = await book.report('2026-10-08', '2026-10-08');
  assert.deepEqual(r.byDay[0], { day: '2026-10-08', users: 2, synced: 1, cooked: 100, rated: 50, decided: 50 });
  assert.deepEqual(r.byAge.d0, { users: 1, cooked: 1, rated: 0, decided: 1 }, 'events of the day are merged');
  assert.deepEqual(r.byAge['d7-13'], { users: 1, cooked: 1, rated: 1, decided: 0 });
  await assert.rejects(book.report('2026-10-09', '2026-10-08'), { code: 'invalid_range' });
});

test('usage: the dining-policy talk is counted by number only (started / follow-up / fixed / saved)', async () => {
  const now = Date.parse('2026-10-08T03:00:00Z');
  const store = createMemorySyncStore();
  const book = createUsageBook(store, { now: () => now });
  await book.record({ anon: 'dddddddd4', day: '2026-10-08', n: 0, events: { talk_started: 1, talk_followup: 2, talk_fixed: 1, talk_saved: 1, talk_text: 3 } });
  const row = (await store.get('usage/2026-10-08')).envelope.users.dddddddd4;
  assert.deepEqual(row.e, { talk_started: 1, talk_followup: 2, talk_fixed: 1, talk_saved: 1 }, 'unknown keys (and any text) are dropped');
});
