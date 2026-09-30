import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId } from "./youtube.js";
import { parseChapters, timesFromChapterIndexes } from "./chapters.js";

// レシピの手順に「▶ 2:15」を付ける。動画と手順の組ごとに保存して全員で使い回す。
// 確かさの順：① だれかが直した時刻（fix）→ ② 説明欄の投稿者のタイムスタンプ（chapters）→ ③ AIが動画から探した時刻（video）。
// AIの1日の上限（全体）の中で動き、1家庭1日20本まで。チケットは使わない。
export const TIMECODES_PER_DAY = 20;
const TRUSTED = new Set(["fix", "chapters"]);
// 手順の並びはそのまま（空の手順も位置を保つ）。返す時刻は手順と同じ数・同じ順。
const normalize = (steps) => (Array.isArray(steps) ? steps.map((s) => String(s || "").trim()).slice(0, 15) : []);
const found = (times) => Array.isArray(times) && times.some((t) => Number.isFinite(t));
const cleanTimes = (raw, list) => {
  const times = Array.isArray(raw) ? raw.slice(0, list.length) : [];
  return list.map((step, i) => (!step || times[i] === null || times[i] === undefined || !Number.isFinite(Number(times[i])) || Number(times[i]) < 0 || Number(times[i]) >= 36_000 ? null : Math.floor(Number(times[i]))));
};

export function createTimecodeBook(store, { analyze, matchChapters, snippet = async () => null, reserveBudget, maxSeconds = 600, now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  const inFlight = new Map();
  const keyOf = (videoId, list) => `timecodes/${videoId}-${createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 16)}`;
  const dayKeyOf = (household) => `timecodes-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
  const answer = (entry, cacheHit) => ({ stepTimes: entry.stepTimes, source: entry.source || "video", cacheHit });
  // 1家庭1日：見つかった本数は20まで、失敗も含めた試しは40まで（AIの枠を失敗で使い切らないように）。
  async function countTry(household) {
    const dayKey = dayKeyOf(household);
    const quota = await store.get(dayKey);
    const used = quota?.envelope.used || 0, tries = quota?.envelope.tries || 0;
    if (used >= TIMECODES_PER_DAY || tries >= TIMECODES_PER_DAY * 2) throw new ApiError(429, "timecode_quota", "今日はここまでです。明日また探します。");
    const counted = await store.put(dayKey, { used, tries: tries + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => null);
    return async () => { if (counted) await store.put(dayKey, { used: used + 1, tries: tries + 1 }, { ifGeneration: counted.generation }).catch(() => {}); };
  }
  async function save(key, entry, cached) {
    await store.put(key, { ...entry, at: new Date(now()).toISOString() }, { ifGeneration: cached?.generation ?? 0 }).catch(() => {});
  }
  // 説明欄のタイムスタンプから（1つの組につき1回だけ調べる）。
  async function fromChapters(key, videoId, list, cached, household, info) {
    if (cached?.envelope.chaptersChecked || typeof matchChapters !== "function") return null;
    const chapters = parseChapters(info?.description);
    if (!chapters.length) { await save(key, { ...(cached?.envelope || {}), chaptersChecked: true }, cached); return null; }
    const done = await countTry(household);
    await reserveBudget();
    const raw = await matchChapters(list, chapters).catch(() => null);
    const stepTimes = cleanTimes(timesFromChapterIndexes(raw?.chapterIndex, chapters, list.length), list);
    if (!found(stepTimes)) { await save(key, { ...(cached?.envelope || {}), chaptersChecked: true }, cached); return null; }
    await save(key, { stepTimes, source: "chapters", chaptersChecked: true }, cached);
    await done();
    return { stepTimes, source: "chapters", cacheHit: false };
  }
  return {
    // peek: 動画はAIに見せない（説明欄と、だれかが直した時刻だけ）。自分のレシピに時刻がもうある時に使う。
    async find({ url, steps, peek = false }, household = "") {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) throw new ApiError(400, "steps_required", "手順が2つ以上いります。");
      const key = keyOf(videoId, list);
      const flight = `${key}:${peek ? "peek" : "full"}`;
      if (inFlight.has(flight)) return inFlight.get(flight);
      const work = (async () => {
        const cached = await store.get(key);
        const entry = cached?.envelope;
        if (found(entry?.stepTimes) && TRUSTED.has(entry.source)) return answer(entry, true);
        if (!entry?.chaptersChecked) {
          const info = await snippet(videoId).catch(() => null);
          const chapters = await fromChapters(key, videoId, list, cached, household, info);
          if (chapters) return chapters;
          const latest = await store.get(key);
          return findFromVideo(key, videoId, list, latest, household, info);
        }
        return findFromVideo(key, videoId, list, cached, household, null);
      })().finally(() => inFlight.delete(flight));
      inFlight.set(flight, work);
      return work;

      async function findFromVideo(key, videoId, list, cached, household, info) {
        if (found(cached?.envelope.stepTimes)) return peek ? { stepTimes: [], source: "none", cacheHit: true } : answer(cached.envelope, true);
        if (peek) return { stepTimes: [], source: "none", cacheHit: false };
        const done = await countTry(household);
        await reserveBudget();
        const seconds = info?.durationSeconds ?? (await snippet(videoId).catch(() => null))?.durationSeconds;
        const clipSeconds = !seconds || seconds > maxSeconds ? maxSeconds : null;
        // 接続先を切り替える時も、切り替えの直前ごとに AI の予算を通す（最初の1回は上の reserveBudget）。
        const raw = await analyze(canonicalYouTubeUrl(videoId), list, { clipSeconds, beforeRetry: reserveBudget });
        const stepTimes = cleanTimes(raw?.stepTimes, list);
        if (!found(stepTimes)) throw new ApiError(404, "timecodes_not_found", "動画の中に場面が見つかりませんでした。");
        await save(key, { stepTimes, source: "video", chaptersChecked: true }, cached);
        await done();
        return { stepTimes, source: "video", cacheHit: false };
      }
    },
    // だれかが直した時刻を保存して、同じ動画・同じ手順を見る全員で使う（最後に直したものが使われる）。
    async fix({ url, steps, stepTimes }, household = "") {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) throw new ApiError(400, "steps_required", "手順が2つ以上いります。");
      const times = cleanTimes(stepTimes, list);
      if (!found(times)) throw new ApiError(400, "times_required", "直した時刻がありません。");
      const dayKey = `${dayKeyOf(household)}-fix`;
      const quota = await store.get(dayKey);
      if ((quota?.envelope.used || 0) >= 30) throw new ApiError(429, "timecode_fix_quota", "今日はここまでです。");
      await store.put(dayKey, { used: (quota?.envelope.used || 0) + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
      const key = keyOf(videoId, list);
      const cached = await store.get(key);
      await store.put(key, { stepTimes: times, source: "fix", chaptersChecked: true, by: createHash("sha256").update(String(household)).digest("hex").slice(0, 12), at: new Date(now()).toISOString() }, { ifGeneration: cached?.generation ?? 0 });
      return { stepTimes: times, source: "fix" };
    }
  };
}
