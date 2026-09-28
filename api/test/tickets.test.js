import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';

const DAY = 86_400_000;
const d = (t) => new Date(t).toISOString().slice(0, 10);

test('10 to start; the first 4 weeks give 1 per cooked dinner, 5 a week and 20 in all; then 1 per 3 cooks', async () => {
  let now = Date.parse('2026-10-05T03:00:00Z');
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  const start = await book.get('home-0001');
  assert.equal(start.balance, 10);
  assert.equal(start.challengeEndsAt, '2026-11-02T03:00:00.000Z');
  // 1週目：6日作っても5枚まで
  const week1 = [];
  for (let i = 0; i < 6; i++) { now = Date.parse('2026-10-05T12:00:00Z') + i * DAY; week1.push((await book.claim('home-0001', [`cook-${d(now)}`])).granted.length); }
  assert.deepEqual(week1, [1, 1, 1, 1, 1, 0], '5 a week');
  assert.deepEqual((await book.claim('home-0001', [`cook-${d(now)}`])).granted, [], 'each day once');
  // 2〜4週目：毎日作っても、合計20枚まで
  let got = 5;
  for (let i = 7; i < 28; i++) { now = Date.parse('2026-10-05T12:00:00Z') + i * DAY; got += (await book.claim('home-0001', [`cook-${d(now)}`])).granted.length; }
  assert.equal(got, 20, '20 in the first 4 weeks');
  let view = await book.get('home-0001');
  assert.equal(view.balance, 30);
  assert.equal(view.cook.total, 20);
  // 5週目から：3回ごとに1枚
  const later = [];
  for (let i = 28; i < 34; i++) { now = Date.parse('2026-10-05T12:00:00Z') + i * DAY; later.push((await book.claim('home-0001', [`cook-${d(now)}`])).granted.length); }
  assert.deepEqual(later, [0, 0, 1, 0, 0, 1]);
  view = await book.get('home-0001');
  assert.equal(view.cook.challenge, false);
  assert.equal(view.cook.towardNext, 0);
  assert.equal(view.rewards.length, 22);
});

test('cooking claims must be recent and not in the future; old claim formats are ignored', async () => {
  const now = Date.parse('2026-10-20T03:00:00Z');
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  await book.get('home-0002');
  const r = await book.claim('home-0002', ['cook-2026-10-25', 'cook-2026-10-01', 'cook-2026-10-19', 'w0-plan-1', 'cook-2026-99-99', 'cook-2026-10-21']);
  assert.deepEqual(r.granted, ['cook-2026-10-19', 'cook-2026-10-21'], 'yesterday, and tomorrow for time zones');
});

test('importing 3 saved videos in the first 3 days gives +5 once', async () => {
  let now = Date.parse('2026-10-05T03:00:00Z');
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  await book.get('home-0003');
  await book.noteImport('home-0003', 'aaaaaaaaaaa');
  await book.noteImport('home-0003', 'aaaaaaaaaaa');
  await book.noteImport('home-0003', 'bbbbbbbbbbb');
  assert.deepEqual((await book.claim('home-0003', ['import'])).granted, [], 'two videos are not enough');
  assert.equal((await book.get('home-0003')).importBonus.have, 2);
  await book.noteImport('home-0003', 'ccccccccccc');
  assert.deepEqual((await book.claim('home-0003', ['import'])).granted, ['import']);
  assert.deepEqual((await book.claim('home-0003', ['import'])).granted, [], 'once');
  const v = await book.get('home-0003');
  assert.equal(v.balance, 15);
  assert.equal(v.importBonus.got, true);
  // 4日目以降は数えない
  const late = createTicketBook(createMemorySyncStore(), { now: () => now });
  await late.get('home-0004');
  now += 4 * DAY;
  for (const id of ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc']) await late.noteImport('home-0004', id);
  assert.deepEqual((await late.claim('home-0004', ['import'])).granted, []);
  assert.equal((await late.get('home-0004')).importBonus.open, false);
});

test('plus gives 30 every 4 weeks up to 60; bought and plus tickets expire after 6 months and are spent first', async () => {
  let now = Date.parse('2026-10-05T03:00:00Z');
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  await book.get('home-0005');
  await book.grantPlus('home-0005', 'p1');
  assert.equal((await book.get('home-0005')).balance, 40);
  await book.grantPlus('home-0005', 'p1');
  assert.equal((await book.get('home-0005')).balance, 40, 'the same period once');
  await book.grantPlus('home-0005', 'p2');
  assert.equal((await book.get('home-0005')).balance, 60, 'only up to 60');
  await book.grantPlus('home-0005', 'p3');
  assert.equal((await book.get('home-0005')).balance, 60);
  let v = await book.get('home-0005');
  assert.equal(v.expiring.total, 50);
  await book.spend('home-0005', { count: 3 });
  v = await book.get('home-0005');
  assert.equal(v.expiring.total, 47, 'expiring tickets are spent first');
  await book.grantPurchase('home-0005', 'pay_1');
  await book.grantPurchase('home-0005', 'pay_1');
  assert.equal((await book.get('home-0005')).balance, 67, 'a purchase counts once');
  now += 184 * DAY;
  v = await book.get('home-0005');
  assert.equal(v.balance, 10, 'after 6 months only the free tickets are left');
  assert.equal(v.expiring, null);
});

test('spending needs a whole ticket and a wallet; old half tickets still count', async () => {
  const store = createMemorySyncStore();
  const book = createTicketBook(store, { startTickets: 1 });
  await assert.rejects(book.spend('nobody-01'), { code: 'wallet_limit' });
  await book.get('home-0001');
  await book.spend('home-0001');
  await assert.rejects(book.spend('home-0001'), { code: 'no_tickets' });
  await book.refund('home-0001');
  assert.equal((await book.get('home-0001')).balance, 1);
  await store.put('tickets/home-old1', { halves: 55, startedAt: '2026-09-01T00:00:00.000Z', claims: { 'w0-plan-1': '2026-09-02T00:00:00.000Z' }, spent: 0 }, { ifGeneration: 0 });
  const old = await book.get('home-old1');
  assert.equal(old.balance, 27.5, 'a beta wallet keeps its tickets');
});
