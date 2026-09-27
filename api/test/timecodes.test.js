import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTimecodeBook, TIMECODES_PER_DAY } from '../src/timecodes.js';

test('step times for older recipes: found once, shared from the cache, limited per household', async () => {
  let calls = 0, budget = 0, clip = 'unset';
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => { budget++; }, snippetSeconds: async () => 900,
    analyze: async (url, steps, o) => { calls++; clip = o.clipSeconds; return { stepTimes: [5, 'x', 130, 99] }; } });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  const first = await book.find({ url, steps: ['焼く', '炒める', '煮る'] }, 'home-0001');
  assert.deepEqual(first.stepTimes, [5, null, 130]); assert.equal(first.cacheHit, false); assert.equal(clip, 600, 'long videos: the first 10 minutes');
  const again = await book.find({ url: 'https://youtu.be/abcdefghijk', steps: ['焼く', '炒める', '煮る'] }, 'someone-else');
  assert.equal(again.cacheHit, true); assert.equal(calls, 1); assert.equal(budget, 1);
  await assert.rejects(book.find({ url, steps: ['一つだけ'] }), { code: 'steps_required' });
  for (let i = 0; i < TIMECODES_PER_DAY - 1; i++) await book.find({ url, steps: ['焼く', `手順${i}`] }, 'home-0001');
  await assert.rejects(book.find({ url, steps: ['焼く', 'もう一つ'] }, 'home-0001'), { code: 'timecode_quota' });
});

test('step times keep the recipe order: long recipes and empty steps still line up', async () => {
  let asked = null;
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => {}, snippetSeconds: async () => 300,
    analyze: async (url, steps) => { asked = steps; return { stepTimes: steps.map((_, i) => i * 10) }; } });
  const steps = ['切る', '', ...Array.from({ length: 10 }, (_, i) => `手順${i}`)];
  const { stepTimes } = await book.find({ url: 'https://www.youtube.com/watch?v=abcdefghijk', steps }, 'home-0002');
  assert.equal(stepTimes.length, 12); assert.equal(asked.length, 12);
  assert.equal(stepTimes[0], 0); assert.equal(stepTimes[1], null); assert.equal(stepTimes[11], 110);
});

test('step times: a miss is not kept, so the next open tries again; only finds count toward the day', async () => {
  let calls = 0, answer = { stepTimes: [null, null] };
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, { reserveBudget: async () => {}, snippetSeconds: async () => 300, analyze: async () => { calls++; return answer; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['焼く', '煮る'] };
  await assert.rejects(book.find(ask, 'home-0003'), { code: 'timecodes_not_found' });
  answer = { stepTimes: [12, 40] };
  assert.deepEqual((await book.find(ask, 'home-0003')).stepTimes, [12, 40]);
  assert.equal((await book.find(ask, 'home-0003')).cacheHit, true); assert.equal(calls, 2);
  const day = await store.get(`timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-0003`);
  assert.equal(day.envelope.used, 1); assert.equal(day.envelope.tries, 2);
});
