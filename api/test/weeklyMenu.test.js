import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';
import { createWeeklyMenu, MENUS_PER_DAY, sheetGrid, cutSheet } from '../src/weeklyMenu.js';

const COLORS = ['#d23', '#2a4', '#24d', '#d90', '#909', '#0aa', '#555'];
// 白地に、格子の各マスへ色の皿（円）を少しずらして描いた「素材シート」。
async function fakeSheet(n, { W = 1536, H = 1024, jitter = 0.08 } = {}) {
  const grid = sheetGrid(n), cw = W / grid.cols, ch = H / grid.rows, r = Math.min(cw, ch) * 0.36;
  const circles = Array.from({ length: n }, (_, i) => {
    const dx = ((i % 2) ? 1 : -1) * cw * jitter, dy = ((i % 3) - 1) * ch * jitter;
    const cx = (i % grid.cols) * cw + cw / 2 + dx, cy = Math.floor(i / grid.cols) * ch + ch / 2 + dy;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${COLORS[i]}"/><circle cx="${cx + r * 0.9}" cy="${cy - r * 0.9}" r="${r * 0.12}" fill="${COLORS[i]}"/>`;
  }).join('');
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>${circles}</svg>`)).png().toBuffer();
}
async function centerColor(piece) {
  const { data } = await sharp(Buffer.from(piece.data, 'base64')).extract({ left: 310, top: 310, width: 20, height: 20 }).raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}
const hex = (h) => h.slice(1).split('').map((c) => parseInt(c + c, 16));
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 40);

test('sheet grid: rows and columns by count, with a supported aspect ratio', () => {
  assert.deepEqual(sheetGrid(3), { cols: 3, rows: 1, aspect: '21:9' });
  assert.deepEqual(sheetGrid(4), { cols: 2, rows: 2, aspect: '1:1' });
  assert.deepEqual(sheetGrid(5), { cols: 3, rows: 2, aspect: '3:2' });
  assert.deepEqual(sheetGrid(6), { cols: 3, rows: 2, aspect: '3:2' });
  assert.deepEqual(sheetGrid(7), { cols: 4, rows: 2, aspect: '16:9' });
});

test('cutting the sheet finds each dish in reading order, even a little off the grid', async () => {
  for (const [n, W, H] of [[3, 1584, 672], [4, 1024, 1024], [5, 1536, 1024], [6, 1536, 1024], [7, 1376, 768]]) {
    const pieces = await cutSheet(await fakeSheet(n, { W, H }), n, sheetGrid(n));
    assert.equal(pieces.length, n);
    for (let i = 0; i < n; i += 1) {
      const meta = await sharp(Buffer.from(pieces[i].data, 'base64')).metadata();
      assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 640, 640]);
      assert.ok(near(await centerColor(pieces[i]), hex(COLORS[i])), `dish ${i + 1} of ${n} is centered in its piece`);
    }
  }
});

test('an empty cell falls back to the cell itself', async () => {
  const blank = await sharp({ create: { width: 1536, height: 1024, channels: 3, background: '#fff' } }).png().toBuffer();
  const pieces = await cutSheet(blank, 6, sheetGrid(6));
  assert.equal(pieces.length, 6);
});

test('weekly menu: all photos in one drawing, cut per dish, notes, 3 tickets, refunded on failure, bounded', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 20 });
  await tickets.get('home-1');
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  let fail = false, flaky = 0, calls = [], described = null;
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {},
    drawSheet: async (images, dishes, opts) => {
      calls.push({ n: images.length, dishes, ...opts });
      if (fail) throw new Error('x');
      if (flaky > 0) { flaky--; throw new Error('once'); }
      return { mimeType: 'image/png', data: (await fakeSheet(images.length)).toString('base64') };
    },
    describe: async (dishes) => { described = dishes; return dishes.map((d, i) => (i === 1 ? { kcal: 99999, yen: -1, copy: 'x'.repeat(40) } : { kcal: 520, yen: 380, copy: 'ふわとろ卵' })); } });
  const photos = ['肉じゃが', '豚こまキャベツ丼', 'レンジ釜玉うどん', '鮭のバター蒸し', 'ツナマヨのり丼'].map((dish) => ({ mimeType: 'image/jpeg', data: jpeg, dish, ingredients: ['豚こま 200g', 'キャベツ'], servings: 2 }));
  const out = await menu.make({ photos, style: 'anime', prompt: '秋っぽく\n木のテーブル' }, 'home-1');
  assert.equal(calls.length, 1, 'one drawing for the whole week');
  assert.deepEqual([calls[0].n, calls[0].style, calls[0].prompt], [5, 'anime', '秋っぽく 木のテーブル']);
  assert.deepEqual(calls[0].dishes, photos.map((p) => p.dish));
  assert.deepEqual(calls[0].grid, sheetGrid(5));
  assert.equal(out.style, 'anime');
  assert.equal(out.images.length, 5, 'one piece per dish');
  assert.ok(near(await centerColor(out.images[3]), hex(COLORS[3])));
  assert.deepEqual(described[0], { dish: '肉じゃが', ingredients: ['豚こま 200g', 'キャベツ'], servings: 2 });
  assert.deepEqual(out.notes[0], { kcal: 520, yen: 380, copy: 'ふわとろ卵' });
  assert.deepEqual(out.notes[1], { kcal: null, yen: null, copy: 'x'.repeat(24) }, 'odd numbers are dropped');
  assert.equal(out.wallet.halves / 2, 17, '3 tickets');
  flaky = 1;
  assert.equal((await menu.make({ photos, style: 'nope' }, 'home-1')).style, 'watercolor', 'unknown style falls back; the drawing is retried once');
  fail = true;
  await assert.rejects(menu.make({ photos }, 'home-1'), { code: 'menu_failed' });
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
  await tickets.get('home-1');
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {}, drawSheet: async () => ({ mimeType: 'image/png', data: (await fakeSheet(3, { W: 1584, H: 672 })).toString('base64') }), describe: async () => { throw new Error('down'); } });
  const out = await menu.make({ photos: [1, 2, 3].map(() => ({ mimeType: 'image/jpeg', data: jpeg, dish: 'カレー' })) }, 'home-1');
  assert.equal(out.images.length, 3);
  assert.deepEqual(out.notes, [1, 2, 3].map(() => ({ kcal: null, yen: null, copy: '' })));
});
