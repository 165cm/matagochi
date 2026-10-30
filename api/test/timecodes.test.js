import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTimecodeBook, TIMECODES_PER_DAY } from '../src/timecodes.js';

test('step times for older recipes: found once, shared from the cache, limited per household', async () => {
  let calls = 0, budget = 0, clip = 'unset';
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => { budget++; }, snippet: async () => ({ durationSeconds: 900 }),
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
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 300 }),
    analyze: async (url, steps) => { asked = steps; return { stepTimes: steps.map((_, i) => i * 10) }; } });
  const steps = ['切る', '', ...Array.from({ length: 10 }, (_, i) => `手順${i}`)];
  const { stepTimes } = await book.find({ url: 'https://www.youtube.com/watch?v=abcdefghijk', steps }, 'home-0002');
  assert.equal(stepTimes.length, 12); assert.equal(asked.length, 12);
  assert.equal(stepTimes[0], 0); assert.equal(stepTimes[1], null); assert.equal(stepTimes[11], 110);
});

test('step times: a miss is not kept, so the next open tries again; only finds count toward the day', async () => {
  let calls = 0, answer = { stepTimes: [null, null] };
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, { reserveBudget: async () => {}, snippet: async () => ({ durationSeconds: 300 }), analyze: async () => { calls++; return answer; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['焼く', '煮る'] };
  await assert.rejects(book.find(ask, 'home-0003'), { code: 'timecodes_not_found' });
  answer = { stepTimes: [12, 40] };
  assert.deepEqual((await book.find(ask, 'home-0003')).stepTimes, [12, 40]);
  assert.equal((await book.find(ask, 'home-0003')).cacheHit, true); assert.equal(calls, 2);
  const day = await store.get(`timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-0003`);
  assert.equal(day.envelope.used, 1); assert.equal(day.envelope.tries, 2);
});

test('description timestamps win over the video, and a shared fix wins over both', async () => {
  const { parseChapters } = await import('../src/chapters.js');
  const description = '材料\n鶏もも肉 300g\n\n0:00 オープニング\n0:42 鶏肉を切る\n1:30 焼く（皮目から）\n12:05 タレを絡める\n👉 https://example.com';
  const chapters = parseChapters(description);
  assert.deepEqual(chapters.map((c) => c.seconds), [0, 42, 90, 725]);
  assert.equal(chapters[2].label, '焼く（皮目から）');
  assert.deepEqual(parseChapters('1:30 だけ'), []);
  let videoCalls = 0, matchCalls = 0;
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => {}, snippet: async () => ({ description, durationSeconds: 900 }),
    matchChapters: async (steps, ch) => { matchCalls++; assert.equal(ch.length, 4); return { chapterIndex: [2, 3, 4, 99] }; },
    analyze: async () => { videoCalls++; return { stepTimes: [1, 2, 3, 4] }; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['鶏肉を切る', '焼く', 'タレを絡める', '盛る'] };
  const first = await book.find({ ...ask, peek: true }, 'home-0004');
  assert.deepEqual(first.stepTimes, [42, 90, 725, null]); assert.equal(first.source, 'chapters'); assert.equal(videoCalls, 0, 'the video is not watched');
  assert.equal((await book.find(ask, 'home-0005')).cacheHit, true); assert.equal(matchCalls, 1);
  const fixed = await book.fix({ ...ask, stepTimes: [40, 95, 700, 800] }, 'home-0005');
  assert.equal(fixed.source, 'fix');
  const shared = await book.find({ ...ask, peek: true }, 'someone-else');
  assert.deepEqual(shared.stepTimes, [40, 95, 700, 800]); assert.equal(shared.source, 'fix');
  await assert.rejects(book.fix({ ...ask, stepTimes: [null, null] }, 'x'), { code: 'times_required' });
});

test('peek never watches the video; without chapters the full request still does', async () => {
  let videoCalls = 0;
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => {}, snippet: async () => ({ description: '説明だけ', durationSeconds: 200 }),
    matchChapters: async () => { throw new Error('no chapters to match'); }, analyze: async () => { videoCalls++; return { stepTimes: [3, 9] }; } });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['焼く', '煮る'] };
  assert.deepEqual((await book.find({ ...ask, peek: true }, 'h')).stepTimes, []); assert.equal(videoCalls, 0);
  const full = await book.find(ask, 'h');
  assert.deepEqual(full.stepTimes, [3, 9]); assert.equal(full.source, 'video'); assert.equal(videoCalls, 1);
});

test('step times: switching the AI endpoint is counted against the AI budget, and a refusal stops without trying the next one', async () => {
  const { analyzeStepTimes } = await import('../src/analyzer.js');
  const client = (name, fn) => ({ name, ai: () => ({ models: { generateContent: fn } }) });
  const seen = [];
  let budget = 0;
  const book = createTimecodeBook(createMemorySyncStore(), { reserveBudget: async () => { budget++; if (budget > 3) throw Object.assign(new Error('budget'), { code: 'ai_budget', status: 429 }); }, snippet: async () => ({ durationSeconds: 120 }),
    analyze: (url, steps, o) => analyzeStepTimes(url, steps, {}, { ...o, clients: [
      client('a', async () => { seen.push('a'); throw new Error('down'); }),
      client('b', async () => { seen.push('b'); return { text: JSON.stringify({ stepTimes: steps.map((_, i) => i * 10 + 1) }) }; })
    ] }) });
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  const out = await book.find({ url, steps: ['切る', '焼く'] }, 'home-0001');
  assert.deepEqual(out.stepTimes, [1, 11]);
  assert.equal(seen.join(''), 'ab');
  assert.equal(budget, 2, 'the first call and the switch to the second endpoint');
  // 2本目：最初の1回は通るが、切り替えの直前で予算が尽きる → 次の接続先へ進まずに止める（読み取りの失敗ではなく、予算の理由のまま）
  seen.length = 0;
  await assert.rejects(book.find({ url, steps: ['混ぜる', '煮る'] }, 'home-0001'), (e) => e.code === 'ai_budget');
  assert.equal(seen.join(''), 'a');
});

test('transcript wins over chapters and video, with fallback when missing', async () => {
  let transcriptCalls = 0, chapterCalls = 0, videoCalls = 0;
  const mockItems = [
    { start: 10, duration: 3, text: '玉ねぎを薄切りにします' },
    { start: 45, duration: 4, text: 'フライパンで強火で炒めます' }
  ];
  const book = createTimecodeBook(createMemorySyncStore(), {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '0:00 OP\n1:00 チャプター炒める', durationSeconds: 300 }),
    fetchTranscript: async () => { transcriptCalls++; return mockItems; },
    matchTranscript: async (steps, text) => {
      assert.ok(text.includes('玉ねぎ'));
      return { stepTimes: ['00:10', '00:45'], stepCues: ['玉ねぎ', '炒め'] };
    },
    matchChapters: async () => { chapterCalls++; return { chapterIndex: [1, 2] }; },
    analyze: async () => { videoCalls++; return { stepTimes: [1, 2] }; }
  });

  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['玉ねぎを切る', '炒める'] };
  const first = await book.find(ask, 'home-tc-1');
  assert.deepEqual(first.stepTimes, [10, 45]);
  assert.equal(first.source, 'transcript');
  assert.equal(transcriptCalls, 1);
  assert.equal(chapterCalls, 0);
  assert.equal(videoCalls, 0);

  // 再度呼び出すとキャッシュが使われる
  const again = await book.find(ask, 'home-tc-2');
  assert.equal(again.cacheHit, true);
  assert.equal(again.source, 'transcript');
  assert.deepEqual(again.stepTimes, [10, 45]);

  // 字幕がない場合は chapters にフォールバック
  const noTranscriptBook = createTimecodeBook(createMemorySyncStore(), {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '0:00 OP\n0:30 焼く', durationSeconds: 200 }),
    fetchTranscript: async () => null,
    matchTranscript: async () => { throw new Error('should not be called'); },
    matchChapters: async () => { chapterCalls++; return { chapterIndex: [1, 2] }; },
    analyze: async () => { videoCalls++; return { stepTimes: [5, 10] }; }
  });
  const fallbackAsk = { url: 'https://www.youtube.com/watch?v=fallback123', steps: ['切る', '焼く'] };
  const fallbackResult = await noTranscriptBook.find(fallbackAsk, 'home-tc-3');
  assert.equal(fallbackResult.source, 'chapters');
  assert.equal(chapterCalls, 1);
});

test('review fix: after falling back to video, transcriptChecked is preserved so transcript is not re-checked', async () => {
  let transcriptCalls = 0, videoCalls = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明文', durationSeconds: 120 }),
    fetchTranscript: async () => { transcriptCalls++; return [{ start: 5, duration: 2, text: '無関係な発話' }]; },
    matchTranscript: async () => ({ stepTimes: [null, null] }), // マッチせずフォールバック
    analyze: async () => { videoCalls++; return { stepTimes: [10, 50] }; }
  });

  const ask = { url: 'https://www.youtube.com/watch?v=fallbackvid', steps: ['切る', '焼く'] };
  const first = await book.find(ask, 'home-tc-4');
  assert.equal(first.source, 'video');
  assert.deepEqual(first.stepTimes, [10, 50]);
  assert.equal(transcriptCalls, 1);
  assert.equal(videoCalls, 1);

  // 2回目：保存された video の結果を返す際、再度字幕照合をしない
  const second = await book.find(ask, 'home-tc-4');
  assert.equal(second.source, 'video');
  assert.equal(transcriptCalls, 1, 'transcript must not be re-checked');
});

test('review fix: returns older video stepTimes without crashing when transcript check has no budget', async () => {
  const { createHash } = await import('node:crypto');
  const store = createMemorySyncStore();
  // 変更前の古い形式で保存されている（source: "video", chaptersChecked: true, transcriptChecked なし）
  const steps = ['切る', '焼く'];
  const key = `timecodes/oldvideo123-${createHash('sha256').update(steps.join('\n')).digest('hex').slice(0, 16)}`;
  await store.put(key, { stepTimes: [10, 50], source: 'video', chaptersChecked: true, seenSeconds: 120 });

  const book = createTimecodeBook(store, {
    reserveBudget: async () => { throw Object.assign(new Error('budget'), { code: 'ai_budget', status: 429 }); },
    snippet: async () => ({ description: '説明', durationSeconds: 120 }),
    fetchTranscript: async () => [{ start: 5, duration: 2, text: '発話' }],
    matchTranscript: async () => ({ stepTimes: [5, 45] }),
    analyze: async () => { throw new Error('should not analyze'); }
  });

  const ask = { url: 'https://www.youtube.com/watch?v=oldvideo123', steps };
  const res = await book.find(ask, 'home-budget-test');
  assert.equal(res.source, 'video');
  assert.deepEqual(res.stepTimes, [10, 50]);
  assert.equal(res.cacheHit, true);
});

test('P1 fix: out-of-range AI answer does not invent interpolated fake times for transcript', async () => {
  let videoCalls = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [
      { start: 10, duration: 5, text: '材料を用意します' },
      { start: 50, duration: 5, text: '炒めます' }
    ],
    // 300秒の動画に対して [999, 999, 999, 999] という範囲外の回答
    matchTranscript: async () => ({ cueIds: [999, 999, 999, 999], stepTimes: [999, 999, 999, 999] }),
    matchChapters: async () => ({ chapterIndex: [] }),
    analyze: async () => { videoCalls++; return { stepTimes: [10, 80, 150, 220] }; }
  });

  const steps = ['準備', '切る', '炒める', '盛り付け'];
  const res = await book.find({ url: 'https://www.youtube.com/watch?v=faketime123', steps }, 'home-p1-1');
  // 架空の按分時刻が transcript として保存されるのではなく、video 探索へフォールバックされる
  assert.equal(res.source, 'video');
  assert.equal(videoCalls, 1);
});

test('P1 fix: partial transcript result does not overwrite existing complete timecodes', async () => {
  const store = createMemorySyncStore();
  const steps = ['準備', '切る', '炒める', '盛り付け'];
  const { createHash } = await import('node:crypto');
  const key = `timecodes/partover123-${createHash('sha256').update(steps.join('\n')).digest('hex').slice(0, 16)}`;
  // 既存の動画由来の完全な時刻（4手順すべて有効）
  await store.put(key, { stepTimes: [10, 50, 100, 200], source: 'video', seenSeconds: 300 });

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [
      { start: 10, duration: 5, text: '材料を用意します' }
    ],
    // 字幕では 1 手順のみ一致
    matchTranscript: async () => ({ cueIds: [1, null, null, null], stepTimes: [10, null, null, null] }),
    analyze: async () => { throw new Error('should not analyze'); }
  });

  const res = await book.find({ url: 'https://www.youtube.com/watch?v=partover123', steps }, 'home-p1-2');
  // 網羅率が下がる上書きは行われず、既存の完全な時刻が維持される
  assert.equal(res.source, 'video');
  assert.deepEqual(res.stepTimes, [10, 50, 100, 200]);

  const saved = await store.get(key);
  assert.equal(saved.envelope.source, 'video');
  assert.deepEqual(saved.envelope.stepTimes, [10, 50, 100, 200]);
});

test('P2 fix: retryable error does not set permanent transcriptChecked: true', async () => {
  let attempts = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '0:00 OP\n1:00 チャプター炒める', durationSeconds: 300 }),
    fetchTranscript: async () => {
      attempts++;
      if (attempts === 1) {
        // 初回は一時的エラー（429など）
        return { status: 'retryable_error', error: 'http_429' };
      }
      return {
        status: 'ok',
        items: [
          { start: 15, duration: 3, text: '準備します' },
          { start: 60, duration: 3, text: '炒めます' }
        ]
      };
    },
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [15, 60] }),
    matchChapters: async () => ({ chapterIndex: [1, 2] }),
    analyze: async () => ({ stepTimes: [10, 50] })
  });

  const ask = { url: 'https://www.youtube.com/watch?v=retryable12', steps: ['準備', '炒める'] };
  // 1回目：一時エラーのため transcript はスキップされ、チャプターへフォールバックされる
  const first = await book.find(ask, 'home-p2-1');
  assert.equal(first.source, 'chapters');
  assert.equal(attempts, 1);

  // 2回目：transcriptChecked が永続保存されていないため、再度字幕取得を試みる
  const second = await book.find(ask, 'home-p2-1');
  assert.equal(second.source, 'transcript');
  assert.deepEqual(second.stepTimes, [15, 60]);
  assert.equal(attempts, 2);
});

test('P2 fix: concurrent manual fix wins over in-flight transcript matching response', async () => {
  const store = createMemorySyncStore();
  let bookRef = null;
  const steps = ['準備', '炒める'];
  const ask = { url: 'https://www.youtube.com/watch?v=concurrent1', steps };

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => {
      // 照合中にユーザーが手動修正を実行するシミュレーション
      await bookRef.fix({ ...ask, stepTimes: [15, 60] }, 'user-editor');
      return { cueIds: [1, 2], stepTimes: [10, 50] };
    },
    analyze: async () => { throw new Error('should not analyze'); }
  });
  bookRef = book;

  // 字幕照合の結果ではなく、競合して先行保存された手動修正 fix が返却される
  const res = await book.find(ask, 'user-viewer');
  assert.equal(res.source, 'fix');
  assert.deepEqual(res.stepTimes, [15, 60]);
});

test('P2 fix: countTry retries on CAS race when updating household quota', async () => {
  const store = createMemorySyncStore();
  let putAttempts = 0;
  const originalPut = store.put.bind(store);
  // 初回の put で一度だけ CAS 競合をシミュレート
  store.put = async (key, val, opts) => {
    if (key.startsWith('timecodes-quota/')) {
      putAttempts++;
      if (putAttempts === 1) {
        // 競合発生
        return false;
      }
    }
    return originalPut(key, val, opts);
  };

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [10, 50] }),
    analyze: async () => { throw new Error('should not analyze'); }
  });

  const res = await book.find({ url: 'https://www.youtube.com/watch?v=concurrent2', steps: ['準備', '炒める'] }, 'home-cas-retry');
  assert.equal(res.source, 'transcript');
  // 初回競合後にリトライして成功したため、2回以上の put 試行が行われている
  assert.ok(putAttempts >= 2);
});

test('P2 fix: fallback to video after 429 still allows transcript retry next time', async () => {
  let attempts = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明なし（チャプターなし）', durationSeconds: 300 }),
    fetchTranscript: async () => {
      attempts++;
      if (attempts === 1) return { status: 'retryable_error', error: 'http_429' };
      return {
        status: 'ok',
        items: [{ start: 20.5, duration: 3, text: '準備' }, { start: 80.5, duration: 3, text: '炒める' }]
      };
    },
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [20.5, 80.5] }),
    matchChapters: async () => ({ chapterIndex: [] }),
    analyze: async () => ({ stepTimes: [10, 50] })
  });

  const ask = { url: 'https://www.youtube.com/watch?v=fallvideo12', steps: ['準備', '炒める'] };
  // 1回目：字幕429 → チャプターなし → 動画解析で成功して保存
  const first = await book.find(ask, 'home-p2-video');
  assert.equal(first.source, 'video');
  assert.equal(attempts, 1);

  // 2回目：transcriptChecked が永続保存されていないため、再度字幕取得を試みて transcript に昇格
  const second = await book.find(ask, 'home-p2-video');
  assert.equal(second.source, 'transcript');
  assert.deepEqual(second.stepTimes, [20.5, 80.5]);
  assert.equal(attempts, 2);
});

test('P2 fix: matchTranscript exception does not permanently save transcriptChecked: true', async () => {
  let attempts = 0;
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '0:00 OP\n1:00 炒める', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 20, duration: 3, text: '準備' }, { start: 80, duration: 3, text: '炒める' }],
    matchTranscript: async () => {
      attempts++;
      if (attempts === 1) throw new Error('AI endpoint 503 unavailable');
      return { cueIds: [1, 2], stepTimes: [20, 80] };
    },
    matchChapters: async () => ({ chapterIndex: [1, 2] }),
    analyze: async () => ({ stepTimes: [10, 50] })
  });

  const ask = { url: 'https://www.youtube.com/watch?v=matcherr123', steps: ['準備', '炒める'] };
  // 1回目：AI照合が例外 → チャプターへフォールバック
  const first = await book.find(ask, 'home-match-err');
  assert.equal(first.source, 'chapters');
  assert.equal(attempts, 1);

  // 2回目：transcriptChecked が保存されていないため再試行され、字幕で成功
  const second = await book.find(ask, 'home-match-err');
  assert.equal(second.source, 'transcript');
  assert.deepEqual(second.stepTimes, [20, 80]);
  assert.equal(attempts, 2);
});

test('P2 fix: concurrent cleared: true wins over in-flight transcript response', async () => {
  const store = createMemorySyncStore();
  const { createHash } = await import('node:crypto');
  const steps = ['準備', '炒める'];
  const ask = { url: 'https://www.youtube.com/watch?v=concurrent3', steps };
  const key = `timecodes/concurrent3-${createHash('sha256').update(steps.join('\n')).digest('hex').slice(0, 16)}`;

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => {
      // 照合中に管理者が「すべて消去」を実行して保存
      await store.put(key, { cleared: true, source: 'fix', stepTimes: [null, null] });
      return { cueIds: [1, 2], stepTimes: [10, 50] };
    },
    analyze: async () => { throw new Error('should not analyze'); }
  });

  const res = await book.find(ask, 'user-viewer');
  assert.equal(res.source, 'fix');
  assert.equal(res.cleared, true);
  assert.deepEqual(res.stepTimes, [null, null]);
});

test('P2 fix: reservation blocks concurrent requests exceeding TIMECODES_PER_DAY', async () => {
  const store = createMemorySyncStore();
  const dayKey = `timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-race-quota`;
  // used: 19 の状態（残り1本）
  await store.put(dayKey, { used: TIMECODES_PER_DAY - 1, tries: 19 });

  let releaseFirst = null;
  const waitFirst = new Promise((resolve) => { releaseFirst = resolve; });

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async (steps) => {
      if (steps[0] === '先行処理') {
        await waitFirst; // 1本目を処理中に保持
      }
      return { cueIds: [1, 2], stepTimes: [10, 50] };
    },
    analyze: async () => ({ stepTimes: [10, 50] })
  });

  // 1本目を開始（used: 19, reserved: 1 になる）
  const p1 = book.find({ url: 'https://www.youtube.com/watch?v=racequota11', steps: ['先行処理', '炒める'] }, 'home-race-quota');

  // 2本目をほぼ同時に開始 → used(19) + reserved(1) >= 20 のため 429 で拒否されるはず
  await assert.rejects(
    book.find({ url: 'https://www.youtube.com/watch?v=racequota22', steps: ['後続処理', '炒める'] }, 'home-race-quota'),
    { code: 'timecode_quota' }
  );

  // 1本目を完了させる
  releaseFirst();
  const res1 = await p1;
  assert.equal(res1.source, 'transcript');

  const finalDay = await store.get(dayKey);
  // used はちょうど 20（TIMECODES_PER_DAY）であり、21に超過していない
  assert.equal(finalDay.envelope.used, TIMECODES_PER_DAY);
});

test('P2 fix: fractional seconds (0.1s) are preserved in stored() and parseTimeValue()', async () => {
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10.5, duration: 3, text: '準備' }, { start: 50.8, duration: 3, text: '炒める' }],
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [10.5, 50.8] }),
    analyze: async () => { throw new Error('should not analyze'); }
  });

  const ask = { url: 'https://www.youtube.com/watch?v=fractional1', steps: ['準備', '炒める'] };
  const first = await book.find(ask, 'home-frac');
  assert.deepEqual(first.stepTimes, [10.5, 50.8]);

  // 保存後の stored() 読み出しでも小数第1位が切り捨てられず保持される
  const storedResult = await book.stored(ask);
  assert.deepEqual(storedResult.stepTimes, [10.5, 50.8]);
});

test('review fix: reserveBudget failure immediately releases household reserved quota', async () => {
  const store = createMemorySyncStore();
  const dayKey = `timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-budget-fail`;
  let shouldFailBudget = true;

  const book = createTimecodeBook(store, {
    reserveBudget: async () => {
      if (shouldFailBudget) {
        throw Object.assign(new Error('AI budget full'), { code: 'analysis_busy', status: 429 });
      }
    },
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [10, 50] }),
    analyze: async () => ({ stepTimes: [10, 50] })
  });

  const ask = { url: 'https://www.youtube.com/watch?v=budgetfail1', steps: ['準備', '炒める'] };

  // 初回：reserveBudget で失敗
  await assert.rejects(book.find(ask, 'home-budget-fail'), { code: 'analysis_busy' });

  // 予約枠（reserved）が残っておらず解放されていること
  const quotaAfterFail = await store.get(dayKey);
  assert.equal(quotaAfterFail.envelope.reserved ?? 0, 0, 'reserved must be released upon reserveBudget failure');
  assert.equal(quotaAfterFail.envelope.used, 0);

  // 混雑解消後、直ちに正常に利用できること
  shouldFailBudget = false;
  const res = await book.find(ask, 'home-budget-fail');
  assert.equal(res.source, 'transcript');
  assert.deepEqual(res.stepTimes, [10, 50]);

  const finalQuota = await store.get(dayKey);
  assert.equal(finalQuota.envelope.used, 1);
  assert.equal(finalQuota.envelope.reserved ?? 0, 0);
});

test('review fix: concurrent release conflicts are retried until reserved is 0, and stale reserved self-heals', async () => {
  const store = createMemorySyncStore();
  const dayKey = `timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-multi-release`;

  // 1. 4件の並行リクエストが同時に失敗しても、リトライによって reserved が確実に 0 に戻ること
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => { throw new Error('AI fail'); },
    matchChapters: async () => ({ chapterIndex: [] }),
    analyze: async () => { throw new Error('video fail'); }
  });

  const urls = [1, 2, 3, 4].map((i) => `https://www.youtube.com/watch?v=multirel00${i}`);
  await Promise.all(
    urls.map((url) => book.find({ url, steps: ['準備', '炒める'] }, 'home-multi-release').catch(() => null))
  );

  const quota = await store.get(dayKey);
  assert.ok(quota, 'day quota must exist after requests');
  assert.equal(quota.envelope.reserved ?? 0, 0, 'all reserved quota must be released even under concurrent completion conflicts');
  assert.equal(quota.envelope.used, 0);

  // 2. 過去の更新から REANALYZE_LOCK_MS 以上経過した孤立 reserved がセルフヒーリングされること
  const { REANALYZE_LOCK_MS } = await import('../src/timecodes.js');
  let mockTime = Date.now();
  const staleBook = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '説明', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '準備' }, { start: 50, duration: 3, text: '炒める' }],
    matchTranscript: async () => ({ cueIds: [1, 2], stepTimes: [10, 50] }),
    now: () => mockTime
  });

  const staleKey = `timecodes-quota/${new Date().toISOString().slice(0, 10)}/home-stale-heal`;
  // クラッシュ等で reserved: 1 が残った古い状態（REANALYZE_LOCK_MS + 10秒前）
  await store.put(staleKey, {
    used: 19,
    tries: 20,
    reserved: 1,
    at: new Date(mockTime - (REANALYZE_LOCK_MS + 10_000)).toISOString()
  });

  // 解析最長時間を経過しているため、reserved はセルフヒーリングで 0 と判定され、残り1本（used: 19）の枠が使える
  const healRes = await staleBook.find({ url: 'https://www.youtube.com/watch?v=staleheal11', steps: ['準備', '炒める'] }, 'home-stale-heal');
  assert.equal(healRes.source, 'transcript');
  assert.deepEqual(healRes.stepTimes, [10, 50]);

  const healedQuota = await store.get(staleKey);
  assert.equal(healedQuota.envelope.used, 20);
  assert.equal(healedQuota.envelope.reserved ?? 0, 0);
});

test('admin reanalyze uses the subtitles first (no video AI call), and falls back to the video when there are none', async () => {
  let videoCalls = 0;
  const mk = (items) => createTimecodeBook(createMemorySyncStore(), {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '', durationSeconds: 300 }),
    fetchTranscript: async () => items,
    matchTranscript: async () => ({ stepTimes: ['00:10', '00:45'], stepCues: ['玉ねぎ', '炒め'] }),
    matchChapters: async () => null,
    analyze: async () => { videoCalls++; return { stepTimes: [100, 200] }; }
  });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['玉ねぎを切る', '炒める'] };
  const subs = [{ start: 10, duration: 3, text: '玉ねぎを薄切りにします' }, { start: 45, duration: 4, text: 'フライパンで強火で炒めます' }];
  const a = await mk(subs).reanalyze(ask);
  assert.equal(a.source, 'transcript'); assert.deepEqual(a.stepTimes, [10, 45]); assert.equal(videoCalls, 0);
  const b = await mk(null).reanalyze(ask);
  assert.equal(b.source, 'video'); assert.equal(videoCalls, 1);
});

test('a transcript result is not rejected because the old times were beyond the video (they are not counted as valid)', async () => {
  const store = createMemorySyncStore();
  const book = createTimecodeBook(store, {
    reserveBudget: async () => {},
    snippet: async () => ({ description: '', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '玉ねぎを薄切りにします' }],
    matchTranscript: async () => ({ stepTimes: ['00:10', null], stepCues: ['玉ねぎ', ''] }),
    matchChapters: async () => null,
    analyze: async () => ({ stepTimes: [] })
  });
  const ask = { url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['玉ねぎを切る', '炒める'] };
  await book.repair({ url: ask.url, steps: ask.steps, stepTimes: [500, 600], durationSeconds: null }).catch(() => null);
  const r = await book.find(ask, 'home-x');
  assert.equal(r.source, 'transcript');
  assert.deepEqual(r.stepTimes, [10, null]);
});

test('admin reanalyze reserves the AI budget again before the video call that follows a subtitle match', async () => {
  let reserved = 0, videoCalls = 0;
  const book = createTimecodeBook(createMemorySyncStore(), {
    reserveBudget: async () => { reserved++; if (reserved > 1) throw new Error('budget'); },
    snippet: async () => ({ description: '', durationSeconds: 300 }),
    fetchTranscript: async () => [{ start: 10, duration: 3, text: '玉ねぎ' }],
    matchTranscript: async () => ({ stepTimes: [null, null], stepCues: ['', ''] }),
    matchChapters: async () => null,
    analyze: async () => { videoCalls++; return { stepTimes: [1, 2] }; }
  });
  await assert.rejects(book.reanalyze({ url: 'https://www.youtube.com/watch?v=abcdefghijk', steps: ['玉ねぎを切る', '炒める'] }), /budget/);
  assert.equal(reserved, 2); assert.equal(videoCalls, 0);
});
