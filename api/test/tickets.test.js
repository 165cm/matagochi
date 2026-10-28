import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook, DAILY_USES } from '../src/tickets.js';

// 2026-10-28：チケットをやめて、1日の上限（家庭ごと・日本時間の0時で戻る）に置き換えた。
test('daily limit: 10 a day per household, counted in Japan time, nothing used when it would go over', async () => {
  let now = Date.parse('2026-10-28T14:00:00Z'); // 日本時間 10/28 23:00
  const book = createTicketBook(createMemorySyncStore(), { now: () => now });
  assert.equal(DAILY_USES, 10);
  const first = await book.get('home-0001');
  assert.deepEqual([first.used, first.limit, first.left, first.day, first.created], [0, 10, 10, '2026-10-28', true]);
  assert.equal(first.resetsAt, '2026-10-28T15:00:00.000Z', 'midnight in Japan');
  for (let i = 0; i < 9; i++) await book.spend('home-0001');
  await assert.rejects(book.spend('home-0001', { count: 2 }), (e) => e.code === 'daily_limit' && e.status === 429, 'two would go over: none used');
  assert.equal((await book.get('home-0001')).left, 1);
  await book.spend('home-0001');
  await assert.rejects(book.spend('home-0001'), (e) => e.code === 'daily_limit' && /今日の上限（10回）/.test(e.message));
  // 失敗した操作は戻す
  await book.refund('home-0001');
  assert.equal((await book.get('home-0001')).left, 1);
  // 日本時間の0時で戻る
  now = Date.parse('2026-10-28T15:00:00Z');
  const next = await book.get('home-0001');
  assert.deepEqual([next.used, next.left, next.day, next.created], [0, 10, '2026-10-29', false]);
  // 開発コードは数えない
  assert.equal(await book.spend('home-0001', { unlimited: true }), null);
  assert.equal((await book.get('home-0001')).used, 0);
});

test('daily limit: only registered households can spend, old ticket wallets read as a fresh day, old claims do nothing', async () => {
  const now = Date.parse('2026-10-28T03:00:00Z');
  const store = createMemorySyncStore();
  const book = createTicketBook(store, { now: () => now, limit: 3 });
  await assert.rejects(book.spend('home-new1'), (e) => e.code === 'wallet_limit', 'a made-up household id cannot spend');
  await assert.rejects(book.get('home-new2', { create: false }), (e) => e.code === 'wallet_limit');
  await store.put('tickets/home-old1', { halves: 40, lots: [], startedAt: '2026-09-01T00:00:00Z', claims: {} }, { ifGeneration: 0 });
  const old = await book.get('home-old1');
  assert.deepEqual([old.used, old.left, old.created], [0, 3, false]);
  await book.spend('home-old1');
  assert.equal((await book.get('home-old1')).used, 1);
  assert.deepEqual((await book.claim('home-old1', ['cook-2026-10-28', 'import'])).granted, []);
  assert.equal((await book.get('home-old1')).used, 1);
});
