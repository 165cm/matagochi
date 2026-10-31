import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTimecodeBook, transcriptDone } from '../src/timecodes.js';
import { fetchYouTubeTranscript } from '../src/transcript.js';

// 2026-10-31：本番のサーバーからは字幕が断られることがある。「取れなかった」を永久の「字幕なし」にしない。
const reply = (body) => async () => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });

test('transcript: an empty caption list is told apart by the playability status (unplayable vs no_captions), with the raw reason kept', async () => {
  const quiet = console.error; console.error = () => {};
  try {
    const blocked = await fetchYouTubeTranscript('UsOqhEG-7hY', { fetchImpl: reply({ playabilityStatus: { status: 'LOGIN_REQUIRED', reason: 'Sign in to confirm you’re not a bot' } }) });
    assert.equal(blocked.status, 'not_available');
    assert.equal(blocked.reason, 'unplayable');
    assert.equal(blocked.diag.playability, 'LOGIN_REQUIRED');
    assert.match(blocked.diag.playabilityReason, /bot/);
    assert.equal(blocked.diag.client, 'ANDROID');
    assert.equal(blocked.diag.trackCount, 0);
    const none = await fetchYouTubeTranscript('UsOqhEG-7hY', { fetchImpl: reply({ playabilityStatus: { status: 'OK' } }) });
    assert.equal(none.reason, 'no_captions');
    assert.equal(none.diag.playability, 'OK');
  } finally { console.error = quiet; }
});

test('transcriptDone: a match is final; a miss lasts until its retry time; an old mark without a time is tried again', () => {
  const now = Date.parse('2026-10-31T00:00:00Z');
  assert.equal(transcriptDone(null, now), false);
  assert.equal(transcriptDone({ transcriptChecked: true, transcriptMatched: true }, now), true);
  assert.equal(transcriptDone({ transcriptChecked: true, transcriptRetryAt: '2026-11-01T00:00:00Z' }, now), true);
  assert.equal(transcriptDone({ transcriptChecked: true, transcriptRetryAt: '2026-10-30T00:00:00Z' }, now), false);
  assert.equal(transcriptDone({ transcriptChecked: true }, now), false, 'legacy mark (before 2026-10-31) is re-evaluated');
});

test('step times: a refused transcript is retried after a day, an empty list after 7 days, and the later success wins', async () => {
  let t = Date.parse('2026-10-31T00:00:00Z');
  let answer = { status: 'not_available', reason: 'unplayable' };
  let fetches = 0, videoCalls = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    now: () => t, reserveBudget: async () => {},
    snippet: async () => ({ description: '', durationSeconds: 300 }),
    fetchTranscript: async () => { fetches++; return answer; },
    matchTranscript: async () => ({ stepTimes: ['00:10', '00:50'] }),
    matchChapters: async () => null,
    analyze: async () => { videoCalls++; return { stepTimes: [12, 60] }; }
  });
  const ask = { url: 'https://www.youtube.com/watch?v=UsOqhEG-7hY', steps: ['切る', '焼く'] };
  assert.equal((await book.find(ask, 'home-retry-1')).source, 'video');
  assert.equal(fetches, 1);
  // 同じ日のうちは、字幕を試し直さない（毎回 YouTube に聞かない）
  await book.find(ask, 'home-retry-1');
  assert.equal(fetches, 1);
  // 1日たつと、もう一度試す（まだ断られる → 一覧が空、の順）
  t += 86_400_000 + 1000;
  answer = { status: 'not_available', reason: 'no_captions' };
  await book.find(ask, 'home-retry-1');
  assert.equal(fetches, 2);
  t += 6 * 86_400_000;
  await book.find(ask, 'home-retry-1');
  assert.equal(fetches, 2, 'an empty list waits 7 days');
  // 7日たって字幕が取れたら、字幕の時刻に入れ替わる
  t += 86_400_000 + 1000;
  answer = { status: 'ok', items: [{ start: 10, duration: 3, text: '切ります' }, { start: 50, duration: 3, text: '焼きます' }] };
  const later = await book.find(ask, 'home-retry-1');
  assert.equal(later.source, 'transcript');
  assert.deepEqual(later.stepTimes, [10, 50]);
  assert.equal(fetches, 3);
  assert.equal(videoCalls, 1);
});

test('step times: a transcript that was fetched and matched but gave nothing is final (no AI spent again)', async () => {
  let matches = 0;
  const book = createTimecodeBook(createMemorySyncStore(), {
    now: () => Date.parse('2026-10-31T00:00:00Z'), reserveBudget: async () => {},
    snippet: async () => ({ durationSeconds: 300 }),
    fetchTranscript: async () => ({ status: 'ok', items: [{ start: 5, duration: 2, text: '無関係' }] }),
    matchTranscript: async () => { matches++; return { stepTimes: [null, null] }; },
    analyze: async () => ({ stepTimes: [10, 50] })
  });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['切る', '焼く'] };
  await book.find(ask, 'home-retry-2');
  await book.find(ask, 'home-retry-2');
  assert.equal(matches, 1);
});

test('review fix: a miss is remembered per video, so other step lists of the same video do not ask YouTube again until the retry time', async () => {
  let t = Date.parse('2026-10-31T00:00:00Z'), fetches = 0;
  const book = createTimecodeBook(createMemorySyncStore(), {
    now: () => t, reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 300 }),
    fetchTranscript: async () => { fetches++; return { status: 'not_available', reason: 'unplayable' }; },
    matchTranscript: async () => ({ stepTimes: [] }), analyze: async () => ({ stepTimes: [10, 50] })
  });
  const url = 'https://www.youtube.com/watch?v=UsOqhEG-7hY';
  await book.find({ url, steps: ['切る', '焼く'] }, 'home-miss-1');
  await book.find({ url, steps: ['刻む', '炒める'] }, 'home-miss-1');
  assert.equal(fetches, 1);
  t += 86_400_000 + 1000;
  await book.find({ url, steps: ['刻む', '盛る'] }, 'home-miss-1');
  assert.equal(fetches, 2);
});
