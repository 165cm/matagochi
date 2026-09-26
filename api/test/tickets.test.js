import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';

const DAY = 86_400_000;
test('challenge rewards: 2.5 each, plans a week ahead, cooking only after the days pass, nothing after the month', async () => {
  let now = Date.parse('2026-10-01T03:00:00Z');
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  const start = await book.get('home-0001');
  assert.equal(start.balance, 25); assert.equal(start.challengeEndsAt, '2026-10-29T03:00:00.000Z');
  let r = await book.claim('home-0001', ['w0-plan-1', 'w1-plan-1', 'w2-plan-1', 'w0-cook-1']);
  assert.deepEqual(r.granted, ['w0-plan-1', 'w1-plan-1']);
  now += 2 * DAY;
  r = await book.claim('home-0001', [{ week: 0, kind: 'cook', step: 1 }, { week: 0, kind: 'cook', step: 2 }]);
  assert.deepEqual(r.granted, ['w0-cook-1']);
  now += 4 * DAY;
  assert.deepEqual((await book.claim('home-0001', ['w0-cook-2'])).granted, ['w0-cook-2']);
  assert.equal((await book.get('home-0001')).balance, 35);
  now = Date.parse('2026-11-05T00:00:00Z');
  assert.deepEqual((await book.claim('home-0001', ['w3-plan-1'])).granted, [], 'the challenge is over');
  assert.equal((await book.get('home-0001')).earned, 10);
});
test('spending needs a whole ticket and a wallet', async () => {
  const book = createTicketBook(createMemorySyncStore(), { startTickets: 1 });
  await assert.rejects(book.spend('nobody-01'), { code: 'wallet_limit' });
  await book.get('home-0001');
  await book.spend('home-0001');
  await assert.rejects(book.spend('home-0001'), { code: 'no_tickets' });
  await book.refund('home-0001');
  assert.equal((await book.get('home-0001')).balance, 1);
});
