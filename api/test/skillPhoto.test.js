import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createSkillJudge, normalizeJudgement, PHOTO_JUDGES_PER_DAY } from '../src/skillPhoto.js';

test('a cooked-dish photo gets a 1-5 skill level; not stored; limited per household a day', async () => {
  const jpeg = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#c86' } }).jpeg().toBuffer();
  let seen = null, budget = 0;
  const book = createSkillJudge(createMemorySyncStore(), { reserveBudget: async () => { budget++; }, judge: async (image) => { seen = image; return { isFood: true, dish: '鶏の照り焼き', level: 3.4, techniques: ['焼き色', '煮からめ'], comment: '照りがきれい！' }; } });
  const r = await book.judge({ image: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }, 'home-1');
  assert.deepEqual(r, { dish: '鶏の照り焼き', level: 3, techniques: ['焼き色', '煮からめ'], comment: '照りがきれい！' });
  assert.equal(seen.mimeType, 'image/jpeg'); assert.equal(budget, 1);
  for (let i = 1; i < PHOTO_JUDGES_PER_DAY; i++) await book.judge({ image: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }, 'home-1');
  await assert.rejects(book.judge({ image: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } }, 'home-1'), { code: 'photo_quota' });
  await assert.rejects(book.judge({ image: { mimeType: 'image/gif', data: 'AAAA' } }, 'home-2'), { code: 'invalid_image' });
  assert.throws(() => normalizeJudgement({ isFood: false }), { code: 'not_food' });
});


