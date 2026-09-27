import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId } from "./youtube.js";

// 以前に読み取ったレシピにも「▶ 2:15」を付ける：手順ごとの動画の時刻を探して、動画と手順の組ごとに保存して全員で使い回す。
// AIの1日の上限（全体）の中で動き、1家庭1日20本まで。チケットは使わない。
export const TIMECODES_PER_DAY = 20;
// 手順の並びはそのまま（空の手順も位置を保つ）。返す時刻は手順と同じ数・同じ順。
const normalize = (steps) => (Array.isArray(steps) ? steps.map((s) => String(s || "").trim()).slice(0, 15) : []);
export function createTimecodeBook(store, { analyze, reserveBudget, snippetSeconds = async () => null, maxSeconds = 600, now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  const inFlight = new Map();
  return {
    async find({ url, steps }, household = "") {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) throw new ApiError(400, "steps_required", "手順が2つ以上いります。");
      const key = `timecodes/${videoId}-${createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 16)}`;
      const cached = await store.get(key);
      if (cached) return { stepTimes: cached.envelope.stepTimes, cacheHit: true };
      if (inFlight.has(key)) return inFlight.get(key);
      const work = (async () => {
        // 1家庭1日の本数。
        const dayKey = `timecodes-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
        const quota = await store.get(dayKey);
        if ((quota?.envelope.used || 0) >= TIMECODES_PER_DAY) throw new ApiError(429, "timecode_quota", "今日はここまでです。明日また探します。");
        await store.put(dayKey, { used: (quota?.envelope.used || 0) + 1 }, { ifGeneration: quota?.generation ?? 0 });
        await reserveBudget();
        const seconds = await snippetSeconds(videoId).catch(() => null);
        const clipSeconds = !seconds || seconds > maxSeconds ? maxSeconds : null;
        const raw = await analyze(canonicalYouTubeUrl(videoId), list, { clipSeconds });
        const times = Array.isArray(raw?.stepTimes) ? raw.stepTimes.slice(0, list.length) : [];
        const stepTimes = list.map((step, i) => (!step ? null : Number.isFinite(Number(times[i])) && times[i] !== null && Number(times[i]) >= 0 && Number(times[i]) < 36_000 ? Math.floor(Number(times[i])) : null));
        await store.put(key, { stepTimes, at: new Date(now()).toISOString() }, { ifGeneration: 0 }).catch(() => {});
        return { stepTimes, cacheHit: false };
      })().finally(() => inFlight.delete(key));
      inFlight.set(key, work);
      return work;
    }
  };
}
