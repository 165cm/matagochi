import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTicketBook } from '../src/tickets.js';
import { createWeeklyMenu, MENUS_PER_DAY, boardTexts, boardMatches } from '../src/weeklyMenu.js';
import { menuBoardPrompt } from '../src/analyzer.js';

const png = async (w = 1200, h = 1500) => (await sharp({ create: { width: w, height: h, channels: 3, background: '#223' } }).png().toBuffer()).toString('base64');
const DISHES = ['肉じゃが', '豚こまキャベツ丼', 'レンジ釜玉うどん', '鮭のバター蒸し', 'ツナマヨのり丼'];
const EN = ['Nikujaga', 'Pork & Cabbage Bowl', 'Kamatama Udon', 'Butter Steamed Salmon', 'Tuna Mayo Rice Bowl'];

test('the words to write are decided up front: weekday of each photo, English or Japanese names, optional notes', () => {
  const photos = DISHES.slice(0, 3).map((dish, i) => ({ dish, day: [0, 2, 6][i] }));
  const notes = [{ en: 'Nikujaga', kcal: 520, yen: 380 }, { en: 'Pork Bowl', kcal: 610, yen: null }, { en: 'Udon', kcal: null, yen: 200 }];
  const en = boardTexts({ photos, notes, lang: 'en', info: 'kcal_yen', range: '9/28 - 10/4' });
  assert.equal(en.title, 'WEEKLY MENU');
  assert.deepEqual(en.items.map((x) => x.day), ['MON', 'WED', 'SUN']);
  assert.deepEqual(en.items.map((x) => x.extra), ['520kcal · ¥380', '610kcal', '¥200']);
  const ja = boardTexts({ photos, notes, lang: 'ja', info: 'none', range: '' });
  assert.equal(ja.title, '今週の献立');
  assert.deepEqual(ja.items.map((x) => [x.day, x.name, x.extra]), [['月曜日', '肉じゃが', ''], ['水曜日', '豚こまキャベツ丼', ''], ['日曜日', 'レンジ釜玉うどん', '']]);
});

test('the prompt pins the count, the layout and every word', () => {
  const texts = boardTexts({ photos: DISHES.map((dish, day) => ({ dish, day })), notes: EN.map((en) => ({ en, kcal: 500 })), lang: 'en', info: 'kcal', range: '9/28 - 10/4' });
  const p = menuBoardPrompt(5, { style: 'chalk', lang: 'en', prompt: '秋っぽく', texts });
  assert.match(p, /ちょうど5品/);
  assert.match(p, /上段に2品、下段に3品/);
  for (const w of ['「WEEKLY MENU」', '「9/28 - 10/4」', '「MON」', '「Pork & Cabbage Bowl」', '「500kcal」']) assert.ok(p.includes(w), w);
  assert.match(p, /黒板/);
  assert.match(p, /秋っぽく/);
});

test('reading back: the count and every word must be there (case, spaces and marks do not matter)', () => {
  const texts = boardTexts({ photos: DISHES.slice(0, 3).map((dish, day) => ({ dish, day })), notes: EN.map((en) => ({ en })), lang: 'en', info: 'none', range: '' });
  const good = { dishCount: 3, texts: ['Weekly Menu', 'MON', 'NIKUJAGA', 'TUE', 'Pork and Cabbage Bowl', 'WED', 'Kamatama  Udon'] };
  assert.equal(boardMatches(texts, { ...good, texts: good.texts.map((t) => t.replace('and', '&')) }), true);
  assert.equal(boardMatches(texts, { ...good, dishCount: 4 }), false, 'an extra dish');
  assert.equal(boardMatches(texts, { ...good, texts: good.texts.filter((t) => t !== 'WED') }), false, 'a missing word');
  assert.equal(boardMatches(texts, { ...good, texts: ['Weekly Menu', 'MON', 'Nikujaga', 'TUE', 'Pork & Cabage Bowl', 'WED', 'Kamatama Udon'] }), false, 'a misspelling');
});

test('weekly menu: one drawing with the words, read back and redrawn once, 3 tickets, refunded on failure, bounded', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 30 });
  await tickets.get('home-1');
  const jpeg = (await sharp({ create: { width: 60, height: 60, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64');
  let fail = false, draws = [], checks = 0, wrongFirst = false, describeFails = false;
  const menu = createWeeklyMenu(store, { tickets, reserveBudget: async () => {},
    drawBoard: async (images, spec) => { draws.push({ n: images.length, ...spec }); if (fail) throw new Error('x'); return { mimeType: 'image/png', data: await png() }; },
    check: async (image, texts) => { checks++; const all = [texts.title, ...texts.items.flatMap((x) => [x.day, x.name])]; return wrongFirst && checks === 1 ? { dishCount: texts.items.length + 1, texts: all } : { dishCount: texts.items.length, texts: all }; },
    describe: async (dishes) => { if (describeFails) throw new Error('down'); return dishes.map((d, i) => ({ kcal: i === 1 ? 99999 : 520, yen: 380, copy: 'ふわとろ卵', en: EN[i] })); } });
  const photos = DISHES.map((dish, i) => ({ mimeType: 'image/jpeg', data: jpeg, dish, ingredients: ['豚こま 200g'], servings: 2, day: i }));
  const out = await menu.make({ photos, style: 'chalk', lang: 'en', info: 'kcal', prompt: '秋っぽく\n夜', range: '9/28 - 10/4' }, 'home-1');
  assert.equal(draws.length, 1, 'one drawing for the whole week');
  assert.deepEqual([draws[0].n, draws[0].style, draws[0].lang, draws[0].prompt, draws[0].model], [5, 'chalk', 'en', '秋っぽく 夜', 'standard']);
  assert.deepEqual(draws[0].texts.items.map((x) => x.name), EN);
  assert.equal(draws[0].texts.items[1].extra, '', 'an odd kcal is not written');
  assert.equal(out.checked, true);
  const meta = await sharp(Buffer.from(out.image.data, 'base64')).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['webp', 1200, 1500]);
  assert.deepEqual(out.notes[0], { kcal: 520, yen: 380, copy: 'ふわとろ卵', en: 'Nikujaga' });
  assert.equal(out.wallet.halves / 2, 27, '3 tickets');
  // 読み返しで品数が違ったら、1回だけ描き直す
  draws = []; checks = 0; wrongFirst = true;
  const again = await menu.make({ photos, model: 'lite' }, 'home-1');
  assert.deepEqual([draws.length, again.checked, again.model], [2, true, 'standard'], 'redrawn once; lite only with the dev code');
  wrongFirst = false;
  fail = true;
  await assert.rejects(menu.make({ photos }, 'home-1'), { code: 'menu_failed' });
  assert.equal((await tickets.get('home-1')).balance, 24, 'refunded after a failure');
  fail = false;
  await assert.rejects(menu.make({ photos }, 'home-1'), { code: 'menu_quota' }, `${MENUS_PER_DAY} a day`);
  // 英語の名前が取れなければ日本語で書く
  describeFails = true;
  const ja = await menu.make({ photos, lang: 'en' }, 'home-1', { unlimited: true });
  assert.equal(ja.lang, 'ja');
  assert.equal(ja.texts.items[0].name, '肉じゃが');
  describeFails = false;
  assert.equal((await menu.make({ photos, model: 'lite' }, 'home-1', { unlimited: true })).model, 'lite');
  await assert.rejects(menu.make({ photos: photos.slice(0, 2) }, 'home-2'), { code: 'invalid_photo_count' });
  await assert.rejects(menu.make({ photos }, ''), { code: 'household_required' });
});
