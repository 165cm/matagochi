import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';
import { createWeeklyMenu, MENUS_PER_DAY } from '../src/weeklyMenu.js';

test('weekly menu: one picture per dish in the chosen style, notes, 3 tickets, refunded on failure, bounded', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 20 });
  await tickets.get('home-1');
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  const png = (await sharp({ create: { width: 1600, height: 1600, channels: 3, background: '#fed' } }).png().toBuffer()).toString('base64');
  let fail = false, flaky = 0, seen = [], described = null;
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {},
    drawDish: async (image, dish, opts) => { seen.push([dish, opts.style, opts.prompt]); if (fail) throw new Error('x'); if (flaky > 0) { flaky--; throw new Error('once'); } return { mimeType: 'image/png', data: png }; },
    describe: async (dishes) => { described = dishes; return dishes.map((d, i) => (i === 1 ? { kcal: 99999, yen: -1, copy: 'x'.repeat(40) } : { kcal: 520, yen: 380, copy: 'ふわとろ卵' })); } });
  const photos = ['肉じゃが', '豚こまキャベツ丼', 'レンジ釜玉うどん', '鮭のバター蒸し', 'ツナマヨのり丼'].map((dish) => ({ mimeType: 'image/jpeg', data: jpeg, dish, ingredients: ['豚こま 200g', 'キャベツ'], servings: 2 }));
  const out = await menu.make({ photos, style: 'anime', prompt: '秋っぽく\n木のテーブル' }, 'home-1');
  assert.equal(out.style, 'anime');
  assert.equal(out.images.length, 5, 'one picture per dish');
  const meta = await sharp(Buffer.from(out.images[0].data, 'base64')).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 768, 768], 'shrunk to 768 webp');
  assert.deepEqual(seen.map((x) => x[0]), photos.map((p) => p.dish));
  assert.equal(seen[0][1], 'anime');
  assert.equal(seen[0][2], '秋っぽく 木のテーブル', 'the wish is one line');
  assert.deepEqual(described[0], { dish: '肉じゃが', ingredients: ['豚こま 200g', 'キャベツ'], servings: 2 });
  assert.deepEqual(out.notes[0], { kcal: 520, yen: 380, copy: 'ふわとろ卵' });
  assert.deepEqual(out.notes[1], { kcal: null, yen: null, copy: 'x'.repeat(24) }, 'odd numbers are dropped');
  assert.equal(out.wallet.halves / 2, 17, '3 tickets');
  flaky = 1;
  assert.equal((await menu.make({ photos, style: 'nope' }, 'home-1')).style, 'watercolor', 'unknown style falls back; one retry per dish');
  fail = true;
  await assert.rejects(menu.make({ photos }, 'home-1'), { code: 'menu_failed' });
  await assert.rejects(menu.make({ photos }, 'home-1', { unlimited: true }), { code: 'menu_failed' });
  assert.equal((await tickets.get('home-1')).balance, 14, 'refunded after a failure');
  fail = false;
  await assert.rejects(menu.make({ photos }, 'home-1'), { code: 'menu_quota' }, `${MENUS_PER_DAY} a day`);
  assert.equal((await menu.make({ photos }, 'home-1', { unlimited: true })).images.length, 5, 'the dev code is not limited');
  await assert.rejects(menu.make({ photos: photos.slice(0, 2) }, 'home-2'), { code: 'invalid_photo_count' });
  await assert.rejects(menu.make({ photos }, ''), { code: 'household_required' });
});

test('weekly menu: notes are optional', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 20 });
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  await tickets.get('home-1');
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {}, drawDish: async () => ({ mimeType: 'image/jpeg', data: jpeg }), describe: async () => { throw new Error('down'); } });
  const out = await menu.make({ photos: [1, 2, 3].map(() => ({ mimeType: 'image/jpeg', data: jpeg, dish: 'カレー' })) }, 'home-1');
  assert.deepEqual(out.notes, [1, 2, 3].map(() => ({ kcal: null, yen: null, copy: '' })));
});
