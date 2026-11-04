import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
import { sampleRecipes } from './timecodeSample.js';
import { timedCount } from './timecodeCompletion.js';

// 1要求1品。全インスタンス共通の排他、呼ぶ前の予算予約、再試行の打ち切り。
export function createTimecodeBackfill(store, deps, { enabled = false, monthlyYen = 500, totalYen = 500, dailyRecipes = 10, pilot = true, now = Date.now } = {}) {
  const stateKey = 'timecode-backfill/state';
  async function readState() { return (await store.get(stateKey))?.envelope || {}; }
  return {
    async report() {
      if (!store) return { disabled: true };
      const state = await readState();
      const page = await store.list('timecode-backfill/attempts/', { max: 1000 });
      const attempts = [];
      for (const key of page.names) attempts.push((await store.get(key))?.envelope);
      return { ...state, enabled, monthlyYen, totalYen, dailyRecipes, pilot, attempts, next: page.next };
    },
    async run() {
      if (!enabled || !store || !Number.isFinite(monthlyYen) || monthlyYen <= 0 || !Number.isFinite(totalYen) || totalYen <= 0 || !Number.isFinite(dailyRecipes) || dailyRecipes <= 0) return { done: true, reason: 'disabled' };
      const lockKey = 'timecode-backfill/lock';
      const held = await store.get(lockKey);
      if (held && now() - held.envelope.at < 15 * 60000) return { done: true, reason: 'busy' };
      const lock = await store.put(lockKey, { at: now() }, { ifGeneration: held?.generation ?? 0 });
      if (!lock) return { done: true, reason: 'busy' };
      try {
        const day = new Date(now() + 9 * 3600000).toISOString().slice(0,10), month = day.slice(0,7);
        const state = await readState();
        if (state.month !== month) { state.month = month; state.reservedYen = 0; state.measuredYen = 0; }
        if (state.day !== day) { state.day = day; state.recipesToday = 0; }
        if (state.recipesToday >= dailyRecipes) return { done: true, reason: 'daily_limit' };
        async function persist() {
          // ロックが失効して別の実行に渡っていたら、有料処理を続けない。
          if ((await store.get(lockKey))?.generation !== lock.generation) throw new ApiError(409, 'backfill_lock_lost', '実行の鍵が変わりました。');
          const old = await store.get(stateKey);
          if (!await store.put(stateKey, state, { ifGeneration: old?.generation ?? 0 })) throw new ApiError(409, 'backfill_state_conflict', '進捗を保存できません。');
        }
        let rows = await deps.list();
        // 試験は固定50本。完全な5本は対照群として課金せず、欠損の45本を試す。
        if (pilot && !state.sampleIds) {
          state.sampleIds = sampleRecipes(rows).map(r => r.videoId);
          await persist();
        }
        if (pilot) rows = rows.filter(r => state.sampleIds.includes(r.videoId));
        // 一部ありを先に。その後は動画IDの固定順。次回時刻のある品は飛ばすので先頭の失敗に張り付かない。
        rows.sort((a,b) => Number(!!timedCount(b.steps || [],b.stepTimes)) - Number(!!timedCount(a.steps || [],a.stepTimes)) || a.videoId.localeCompare(b.videoId));
        for (const row of rows) {
          const r = await deps.load(row);
          if (!r || r.protected || r.steps.length < 2 || r.steps.length > 30 || timedCount(r.steps,r.stepTimes) === r.steps.filter(Boolean).length) continue;
          const fingerprint = createHash('sha256').update(JSON.stringify([row.videoId,r.revision,r.steps])).digest('hex').slice(0,24);
          const key = `timecode-backfill/attempts/${fingerprint}`;
          const previous = await store.get(key), attempt = previous?.envelope || {};
          if (attempt.finished || attempt.tries >= 3 || attempt.retryAt > now()) continue;
          // 動画を含む最大3回分の保守的予約が残らない時は新しい品を始めない。
          if ((state.reservedYen || 0) + 150 > monthlyYen || (state.totalReservedYen || 0) + 150 > totalYen) return { done: true, reason: 'monthly_limit', reservedYen: state.reservedYen || 0 };
          const claim = { videoId: row.videoId, tries: (attempt.tries || 0) + 1, retryAt: now() + 86400000, reason: 'running', at: new Date(now()).toISOString() };
          const claimed = await store.put(key, claim, { ifGeneration: previous?.generation ?? 0 });
          if (!claimed) continue;
          state.recipesToday++; await persist();
          const paid = async (stage, fn) => {
            // 失敗・応答不明も予約を残す。月500円の試験枠を別用途と共有しない。
            if ((state.reservedYen || 0) + 50 > monthlyYen || (state.totalReservedYen || 0) + 50 > totalYen) throw new ApiError(429, 'backfill_budget', '補完の予算に達しました。');
            state.reservedYen = (state.reservedYen || 0) + 50; state.totalReservedYen = (state.totalReservedYen || 0) + 50; await persist();
            try { await deps.reserveGlobal(); }
            catch (error) {
              state.reservedYen -= 50; state.totalReservedYen -= 50; await persist();
              throw error;
            }
            const { result, yen } = await deps.measure(fn);
            if (Number.isFinite(yen) && yen >= 0) {
              state.reservedYen += yen - 50;
              state.totalReservedYen += yen - 50;
              state.measuredYen = (state.measuredYen || 0) + yen;
              await persist();
            }
            return result;
          };
          let outcome;
          try {
            const result = await deps.complete(r, paid);
            const improved = timedCount(r.steps,result.stepTimes) > timedCount(r.steps,r.stepTimes);
            if (improved) await deps.save(r,result);
            outcome = { ...claim, reason: result.reason, stages: result.stages, before: timedCount(r.steps,r.stepTimes), after: timedCount(r.steps,result.stepTimes), improved,
              finished: result.reason === 'complete' || result.reason === 'duration_unsupported', retryAt: now() + (result.reason === 'partial_or_no_match' ? 7 : 1) * 86400000 };
          } catch (error) { outcome = { ...claim, reason: error?.code || 'temporary_error' }; }
          if (!await store.put(key,outcome,{ ifGeneration: claimed.generation })) throw new ApiError(409,'backfill_result_not_saved','結果を保存できません。');
          state.last = { videoId: row.videoId, ...outcome }; await persist();
          return { done: false, ...state.last, reservedYen: state.reservedYen, measuredYen: state.measuredYen || 0 };
        }
        return { done: true, reason: 'no_eligible_recipes' };
      } finally { await store.remove(lockKey, { ifGeneration: lock.generation }); }
    }
  };
}
