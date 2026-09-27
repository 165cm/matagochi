import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createVariantSearch, VARIANT_SEARCHES_PER_DAY } from '../src/variants.js';

test('variant search: dish name to YouTube, cached for days, opted-out channels hidden, a daily limit', async () => {
  let calls = 0, lastQ = '';
  const store = createMemorySyncStore();
  const s = createVariantSearch(store, {
    optedOut: async () => new Set(['UCblocked']),
    search: async (q) => { calls++; lastQ = q; return [{ videoId: 'aaaaaaaaaaa', channelId: 'UCx', channelTitle: 'リュウジ&amp;', title: '明太子パスタ &quot;至高&quot;' }, { videoId: 'bbbbbbbbbbb', channelId: 'UCblocked', channelTitle: 'x', title: 'y' }]; },
  });
  const r = await s.find({ q: ' 明太子パスタ ' }, 'home-1');
  assert.deepEqual(r.items, [{ videoId: 'aaaaaaaaaaa', channelId: 'UCx', channelTitle: 'リュウジ&', title: '明太子パスタ "至高"' }]);
  assert.equal(lastQ, '明太子パスタ 作り方');
  await s.find({ q: '明太子パスタ' }, 'home-2');
  assert.equal(calls, 1, 'the same dish is served from the cache');
  await assert.rejects(s.find({ q: 'x' }, 'home-1'), { code: 'query_required' });
  for (let i = 0; i < VARIANT_SEARCHES_PER_DAY; i++) await s.find({ q: `料理${i}` }, 'home-3');
  await assert.rejects(s.find({ q: '別の料理' }, 'home-3'), { code: 'search_quota' });
});
