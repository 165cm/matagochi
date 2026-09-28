import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';
import { createWeeklyMenu, MENUS_PER_DAY } from '../src/weeklyMenu.js';

test('weekly menu: one picture or one per dish, 3 tickets, refunded on failure, bounded', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 20 });
  await tickets.get('home-1');
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  const png = (await sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#fed' } }).png().toBuffer()).toString('base64');
  const calls = { one: 0, each: 0 };
  let fail = false, seenDishes = [];
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {},
    drawOne: async (images, dishes) => { calls.one++; seenDishes = dishes; if (fail) throw new Error('x'); return { mimeType: 'image/png', data: png }; },
    drawEach: async () => { calls.each++; return { mimeType: 'image/png', data: png }; } });
  const photos = ['肉じゃが', '豚こまキャベツ丼', 'レンジ釜玉うどん', '鮭のバター蒸し', 'ツナマヨのり丼'].map((dish) => ({ mimeType: 'image/jpeg', data: jpeg, dish }));
  const one = await menu.make({ photos, mode: 'one' }, 'home-1');
  assert.equal(one.images.length, 1);
  const meta = await sharp(Buffer.from(one.images[0].data, 'base64')).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1024, 1280], 'shrunk to 1024x1280 webp');
  assert.deepEqual(seenDishes, photos.map((p) => p.dish));
  assert.equal(one.wallet.halves / 2, 17, '3 tickets');
  const each = await menu.make({ photos, mode: 'each' }, 'home-1');
  assert.deepEqual([each.images.length, calls.each], [5, 5], 'one picture per dish');
  fail = true;
  await assert.rejects(menu.make({ photos, mode: 'one' }, 'home-1'), { code: 'menu_failed' });
  assert.equal((await tickets.get('home-1')).balance, 14, 'refunded after a failure');
  fail = false;
  await assert.rejects(menu.make({ photos, mode: 'one' }, 'home-1'), { code: 'menu_quota' }, `${MENUS_PER_DAY} a day`);
  assert.equal((await menu.make({ photos, mode: 'one' }, 'home-1', { unlimited: true })).images.length, 1, 'the dev code is not limited');
  await assert.rejects(menu.make({ photos: photos.slice(0, 2) }, 'home-2'), { code: 'invalid_photo_count' });
  await assert.rejects(menu.make({ photos }, ''), { code: 'household_required' });
});
