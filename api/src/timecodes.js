import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId } from "./youtube.js";
import { parseChapters, timesFromChapterIndexes, parseTimeValue } from "./chapters.js";
import { refineStepTimes } from "./timecodeCheck.js";
import { formatTranscriptForPrompt, resolveTranscriptTimes } from "./transcript.js";
import { VIDEO_TIMEOUT_MS, VIDEO_CLIENTS_MAX } from "./analyzer.js";

// レシピの手順に「▶ 2:15」を付ける。動画と手順の組ごとに保存して全員で使い回す。
// 確かさの順：① だれかが直した時刻（fix）→ ② YouTubeの字幕（transcript）→ ③ 説明欄の投稿者のタイムスタンプ（chapters）→ ④ AIが動画から探した時刻（video）。
// AIの1日の上限（全体）の中で動き、1家庭1日20本まで。利用者の1日の上限（tickets.js）は使わない。
export const TIMECODES_PER_DAY = 20;
const TRUSTED = new Set(["fix", "transcript", "chapters"]);
// 管理の探し直しの鍵の長さ：3つの接続先がそれぞれ時間切れまでかかっても切れない長さ＋余裕5分（これより古い鍵は止まったもの。review fix #138 r2）。
export const REANALYZE_LOCK_MS = VIDEO_TIMEOUT_MS * VIDEO_CLIENTS_MAX + 5 * 60_000;
// 手順の並びはそのまま（空の手順も位置を保つ）。返す時刻は手順と同じ数・同じ順。
const normalize = (steps) => (Array.isArray(steps) ? steps.map((s) => String(s || "").trim()).slice(0, 30) : []);
const found = (times) => Array.isArray(times) && times.some((t) => Number.isFinite(t));
const cleanTimes = (raw, list) => {
  const times = Array.isArray(raw) ? raw.slice(0, list.length) : [];
  return list.map((step, i) => (!step ? null : parseTimeValue(times[i])));
};

// 字幕で確かめた時刻：動画の長さを超える・順番が逆の時刻は null（不明）のままにする。補間はしない。
function verifyTranscriptTimes(rawTimes, count, duration) {
  const out = Array.from({ length: count }, (_, idx) => {
    const t = rawTimes?.[idx];
    if (!Number.isFinite(t)) return null;
    if (duration !== null && t >= duration) return null;
    return t;
  });
  let lastValid = -1;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === null) continue;
    if (lastValid >= 0 && out[i] < out[lastValid]) out[i] = null;
    else lastValid = i;
  }
  return out;
}

export function createTimecodeBook(store, { analyze, matchChapters, matchTranscript = null, fetchTranscript = async () => null, snippet = async () => null, reserveBudget, maxSeconds = 600, now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  const inFlight = new Map();
  const keyOf = (videoId, list) => `timecodes/${videoId}-${createHash("sha256").update(list.join("\n")).digest("hex").slice(0, 16)}`;
  const dayKeyOf = (household) => `timecodes-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
  const answer = (entry, cacheHit) => ({ stepTimes: entry.stepTimes, source: entry.source || "video", cacheHit });
  // 1家庭1日：見つかった本数は20まで、失敗も含めた試しは40まで（同時実行の枠予約・競合再試行で上限を厳格に保護）。
  // 予約枠（reserved）のセルフヒーリングは、動画解析の全接続先の最長待機時間（REANALYZE_LOCK_MS）を超えた孤立枠のみを対象とする。
  async function countTry(household) {
    const dayKey = dayKeyOf(household);
    for (let attempt = 0; attempt < 3; attempt++) {
      const quota = await store.get(dayKey);
      const used = quota?.envelope.used || 0, tries = quota?.envelope.tries || 0;
      const lastAt = quota?.envelope.at ? Date.parse(quota.envelope.at) : 0;
      const isStale = lastAt > 0 && now() - lastAt > REANALYZE_LOCK_MS;
      const reserved = isStale ? 0 : (quota?.envelope.reserved || 0);
      if (used + reserved >= TIMECODES_PER_DAY || tries >= TIMECODES_PER_DAY * 2) {
        throw new ApiError(429, "timecode_quota", "今日はここまでです。明日また探します。");
      }
      const counted = await store.put(dayKey, { used, tries: tries + 1, reserved: reserved + 1, at: new Date(now()).toISOString() }, { ifGeneration: quota?.generation ?? 0 }).catch(() => null);
      if (counted) {
        let finished = false;
        return async (success = true) => {
          if (finished) return;
          for (let r = 0; r < 10; r++) {
            const cur = await store.get(dayKey);
            const u = cur?.envelope.used || 0, tr = cur?.envelope.tries || 0;
            const res = Math.max(0, (cur?.envelope.reserved || 1) - 1);
            const next = { used: success ? u + 1 : u, tries: tr, at: new Date(now()).toISOString() };
            if (res > 0) next.reserved = res;
            const ok = await store.put(dayKey, next, { ifGeneration: cur?.generation ?? 0 }).catch(() => null);
            if (ok) {
              finished = true;
              break;
            }
            if (r < 9) await new Promise((resolve) => setTimeout(resolve, 10 * (r + 1)));
          }
        };
      }
    }
    throw new ApiError(429, "timecode_quota", "混み合っています。少し待ってからお試しください。");
  }
  async function save(key, entry, cached) {
    return await store.put(key, { ...entry, at: new Date(now()).toISOString() }, { ifGeneration: cached?.generation ?? 0 }).catch(() => null);
  }
  // 保存はせず、字幕と照合した時刻だけを返す（管理の探し直し用）。字幕なし・照合失敗・時刻なしなら null。
  // 戻り値：{ result, usedAi }。usedAi は字幕照合で AI を呼んだ印（呼んだ後に動画解析へ進む時は、予算をもう1回通す）。
  async function transcriptTimesOnly(videoId, list, duration) {
    if (typeof matchTranscript !== "function" || typeof fetchTranscript !== "function") return { result: null, usedAi: false };
    const res = await fetchTranscript(videoId).catch(() => null);
    const items = res?.status === "ok" && Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : null);
    if (!items || !items.length) return { result: null, usedAi: false };
    const { text, cues } = formatTranscriptForPrompt(items, { maxSeconds: duration || maxSeconds });
    let raw;
    try { raw = await matchTranscript(list, text); } catch { return { result: null, usedAi: true }; }
    const { stepTimes: rawTimes, stepCues } = resolveTranscriptTimes(cues, raw);
    const stepTimes = verifyTranscriptTimes(rawTimes, list.length, duration);
    return { result: found(stepTimes) ? { stepTimes, stepCues } : null, usedAi: true };
  }
  // YouTubeのタイムスタンプ付き字幕から（高精度・低コスト）。実在する字幕発話と照合し、架空の補間は行わない。
  async function fromTranscript(key, videoId, list, cached, household, info) {
    if (cached?.envelope.transcriptChecked || typeof matchTranscript !== "function" || typeof fetchTranscript !== "function") return null;
    const res = await fetchTranscript(videoId).catch(() => null);
    // 一時エラー（429やタイムアウト等）は transcriptChecked: true を保存せず、次回再試行可能にする
    if (res?.status === "retryable_error") return null;
    const items = res?.status === "ok" && Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : null);
    if (!items || !items.length) {
      await save(key, { ...(cached?.envelope || {}), transcriptChecked: true }, cached);
      return null;
    }
    let done = null;
    try {
      done = await countTry(household);
      await reserveBudget();
    } catch (err) {
      if (done) await done(false);
      // 既存の保存済み時刻がある場合は、AIの枠や予算が尽きていても既存の時刻を返し、利用を止めない
      if (found(cached?.envelope.stepTimes)) return null;
      throw err;
    }
    const { text, cues } = formatTranscriptForPrompt(items, { maxSeconds: info?.durationSeconds || maxSeconds });
    let raw = null;
    try {
      raw = await matchTranscript(list, text);
    } catch {
      // AI照合の例外（503や一時障害）は retryable として扱い、transcriptChecked を保存せず次回再試行可能にする
      await done(false);
      return null;
    }
    const { stepTimes: rawTimes, stepCues } = resolveTranscriptTimes(cues, raw);

    // 順序の逆転や動画尺超過の不正値は null にする（実字幕の根拠がないものは null のまま残す。架空の按分補間は行わない）
    const duration = info?.durationSeconds && info.durationSeconds > 0 ? info.durationSeconds : null;
    const verifiedTimes = verifyTranscriptTimes(rawTimes, list.length, duration);

    // 既存の完全な時刻を欠損結果（1手順のみ等）で上書きしないよう、網羅率を比較
    const existingTimes = cached?.envelope.stepTimes || [];
    // 動画の長さを超える時刻は「有効」に数えない（誤った時刻が多いほど、正しい字幕の結果が拒否されるのを防ぐ）
    const existingValidCount = existingTimes.filter((t) => Number.isFinite(t) && (duration === null || t < duration)).length;
    const newValidCount = verifiedTimes.filter(Number.isFinite).length;

    if (newValidCount === 0 || (existingValidCount > 0 && newValidCount < existingValidCount)) {
      await save(key, { ...(cached?.envelope || {}), transcriptChecked: true }, cached);
      await done(false);
      return null;
    }

    const saved = await save(key, { stepTimes: verifiedTimes, stepCues, source: "transcript", transcriptChecked: true, chaptersChecked: true }, cached);
    await done(true);

    // 保存競合時（手動修正 fix や全消去 cleared などが先行して入った場合）、最新の保存レコードを優先して返す
    if (!saved) {
      const latest = await store.get(key);
      if (latest?.envelope?.cleared) {
        return { stepTimes: list.map(() => null), source: "fix", cleared: true, cacheHit: false };
      }
      if (found(latest?.envelope.stepTimes) && latest?.envelope.source === "fix") {
        return answer(latest.envelope, false);
      }
    }

    return { stepTimes: verifiedTimes, stepCues, source: "transcript", cacheHit: false };
  }
  // 説明欄のタイムスタンプから（1つの組につき1回だけ調べる）。
  async function fromChapters(key, videoId, list, cached, household, info) {
    if (cached?.envelope.chaptersChecked || typeof matchChapters !== "function") return null;
    const chapters = parseChapters(info?.description);
    const transcriptChecked = Boolean(cached?.envelope?.transcriptChecked);
    if (!chapters.length) { await save(key, { ...(cached?.envelope || {}), transcriptChecked, chaptersChecked: true }, cached); return null; }
    let done = null;
    try {
      done = await countTry(household);
      await reserveBudget();
    } catch (err) {
      if (done) await done(false);
      // 既存の保存済み時刻がある場合は、AIの枠や予算が尽きていても既存の時刻を返し、利用を止めない
      if (found(cached?.envelope.stepTimes)) return null;
      throw err;
    }
    const raw = await matchChapters(list, chapters).catch(() => null);
    const stepTimes = refineStepTimes(list, cleanTimes(timesFromChapterIndexes(raw?.chapterIndex, chapters, list.length), list), { durationSeconds: info?.durationSeconds });
    if (!found(stepTimes)) {
      await save(key, { ...(cached?.envelope || {}), transcriptChecked, chaptersChecked: true }, cached);
      await done(false);
      return null;
    }
    await save(key, { stepTimes, source: "chapters", transcriptChecked, chaptersChecked: true }, cached);
    await done(true);
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
        // fix または transcript、もしくは字幕確認済みの chapters は最優先キャッシュとして即座に返す
        const isFullyChecked = entry?.source === "fix" || entry?.source === "transcript" || (entry?.source === "chapters" && entry?.transcriptChecked);
        if (found(entry?.stepTimes) && isFullyChecked) return answer(entry, true);
        if (entry?.cleared) return { stepTimes: list.map(() => null), source: "fix", cleared: true, cacheHit: true };
        let info = null;
        if (!entry?.transcriptChecked) {
          info = await snippet(videoId).catch(() => null);
          const transcriptRes = await fromTranscript(key, videoId, list, cached, household, info);
          if (transcriptRes) return transcriptRes;
          if (found(entry?.stepTimes)) return answer(entry, true);
        }
        const afterTranscript = await store.get(key);
        if (!afterTranscript?.envelope?.chaptersChecked) {
          if (!info) info = await snippet(videoId).catch(() => null);
          const chapters = await fromChapters(key, videoId, list, afterTranscript, household, info);
          if (chapters) return chapters;
          const latest = await store.get(key);
          return findFromVideo(key, videoId, list, latest, household, info);
        }
        return findFromVideo(key, videoId, list, afterTranscript, household, null);
      })().finally(() => inFlight.delete(flight));
      inFlight.set(flight, work);
      return work;

      async function findFromVideo(key, videoId, list, cached, household, info) {
        if (found(cached?.envelope.stepTimes)) return peek ? { stepTimes: [], source: "none", cacheHit: true } : answer(cached.envelope, true);
        if (peek) return { stepTimes: [], source: "none", cacheHit: false };
        const done = await countTry(household);
        try {
          await reserveBudget();
        } catch (err) {
          await done(false);
          throw err;
        }
        const seconds = info?.durationSeconds ?? (await snippet(videoId).catch(() => null))?.durationSeconds;
        const clipSeconds = !seconds || seconds > maxSeconds ? maxSeconds : null;
        let raw = null;
        try {
          // 接続先を切り替える時も、切り替えの直前ごとに AI の予算を通す（最初の1回は上の reserveBudget）。
          raw = await analyze(canonicalYouTubeUrl(videoId), list, { clipSeconds, durationSeconds: seconds, beforeRetry: reserveBudget });
        } catch (err) {
          await done(false);
          throw err;
        }
        const stepTimes = refineStepTimes(list, cleanTimes(raw?.stepTimes, list), { durationSeconds: seconds });
        if (!found(stepTimes)) {
          await done(false);
          throw new ApiError(404, "timecodes_not_found", "動画の中に場面が見つかりませんでした。");
        }
        const transcriptChecked = Boolean(cached?.envelope?.transcriptChecked);
        // seenSeconds：AI が見た長さ（点検で「見ていない後半に時刻がない」を見分ける）。
        await save(key, { stepTimes, source: "video", transcriptChecked, chaptersChecked: true, seenSeconds: clipSeconds || seconds || null }, cached);
        await done(true);
        return { stepTimes, source: "video", cacheHit: false };
      }
    },
    // 管理：動画から探し直す（保存はしない＝運営が見比べて「時刻を保存」する。1家庭の回数の上限は使わない・AI の予算は通す）。
    async reanalyze({ url, steps }) {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) throw new ApiError(400, "steps_required", "手順が2つ以上いります。");
      // 同じ動画・同じ手順を同時に2回 AI に見せない（別のタブ・再送・複数の台でも、世代つきの書き込みで1つだけ。review fix #138）。
      const lockKey = `timecodes-reanalyze/${keyOf(videoId, list).slice("timecodes/".length)}`;
      const held = await store.get(lockKey);
      if (held && now() - Date.parse(held.envelope.at || 0) <= REANALYZE_LOCK_MS) throw new ApiError(409, "reanalyze_pending", "この動画は探し直している途中です。");
      const lock = await store.put(lockKey, { at: new Date(now()).toISOString() }, { ifGeneration: held?.generation ?? 0 });
      if (!lock) throw new ApiError(409, "reanalyze_pending", "この動画は探し直している途中です。");
      try {
        await reserveBudget();
        const info = await snippet(videoId).catch(() => null);
        const seconds = info?.durationSeconds;
        // まず字幕と照合する（実在する発話に根拠のある時刻だけを採用。見つからない・字幕がない時は動画から探す）。
        const subs = await transcriptTimesOnly(videoId, list, seconds && seconds > 0 ? seconds : null);
        if (subs.result) return { ...subs.result, source: "transcript", seenSeconds: null };
        // 字幕照合で AI を1回使った後に動画解析へ進む時は、動画解析の分の予算も別に通す（上限なら、ここで止める）。
        if (subs.usedAi) await reserveBudget();
        const clipSeconds = !seconds || seconds > maxSeconds ? maxSeconds : null;
        const raw = await analyze(canonicalYouTubeUrl(videoId), list, { clipSeconds, durationSeconds: seconds, beforeRetry: reserveBudget });
        const stepTimes = refineStepTimes(list, cleanTimes(raw?.stepTimes, list), { durationSeconds: seconds });
        if (!found(stepTimes)) throw new ApiError(404, "timecodes_not_found", "動画の中に場面が見つかりませんでした。");
        return { stepTimes, source: "video", seenSeconds: clipSeconds || seconds || null };
      } finally {
        await store.remove(lockKey, { ifGeneration: lock.generation }).catch(() => {});
      }
    },
    // 管理の点検用：保存済みの時刻を読むだけ（AI も YouTube も呼ばない）。なければ null。
    async stored({ url, steps }) {
      required();
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) return null;
      const entry = (await store.get(keyOf(extractYouTubeVideoId(url), list)))?.envelope;
      return entry ? { stepTimes: entry.cleared ? list.map(() => null) : cleanTimes(entry.stepTimes, list), source: entry.source || "", cleared: !!entry.cleared, ...(Number.isFinite(entry.seenSeconds) ? { seenSeconds: entry.seenSeconds } : {}) } : null;
    },
    // すでに保存済みの時刻（AI・章）を0円で補正して保存し直す（だれかが直した時刻 fix や消した時刻 cleared は触らない）。
    async repair({ url, steps, stepTimes, source = "video", durationSeconds = null, fillGaps = true, allowEmpty = false }) {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) return null;
      const key = keyOf(videoId, list);
      const cached = await store.get(key);
      const entry = cached?.envelope;
      if (entry?.cleared || entry?.source === "fix") return { stepTimes: cleanTimes(entry.stepTimes, list), source: "fix", skipped: true };
      const baseTimes = cleanTimes(stepTimes ?? entry?.stepTimes, list);
      // allowEmpty：補正で全部が「不明」になった結果も保存する（根拠のない誤時刻を残さない）。
      if (!found(baseTimes) && !allowEmpty) return null;
      const refined = refineStepTimes(list, baseTimes, { durationSeconds, fillGaps });
      const effectiveSource = entry?.source || (source === "chapters" ? "chapters" : "video");
      const saved = await store.put(key, {
        ...(entry || {}),
        stepTimes: refined,
        source: effectiveSource,
        chaptersChecked: true,
        repairedAt: new Date(now()).toISOString(),
        at: new Date(now()).toISOString(),
      }, { ifGeneration: cached?.generation ?? 0 });
      if (!saved) throw new ApiError(409, "timecode_conflict", "ほかの更新と重なりました。もう一度補正してください。");
      return { stepTimes: refined, source: effectiveSource };
    },
    // だれかが直した時刻を保存して、同じ動画・同じ手順を見る全員で使う（最後に直したものが使われる）。
    async fix({ url, steps, stepTimes }, household = "", { admin = false } = {}) {
      required();
      const videoId = extractYouTubeVideoId(url);
      const list = normalize(steps);
      if (list.filter(Boolean).length < 2) throw new ApiError(400, "steps_required", "手順が2つ以上いります。");
      const times = cleanTimes(stepTimes, list);
      // 運営は「時刻をすべて消す」もできる（作る画面でも ▶ を出さない。AI で探し直さない）。
      if (!found(times) && !admin) throw new ApiError(400, "times_required", "直した時刻がありません。");
      // 運営（管理画面）が直す時は、1日の回数の上限を使わない。
      if (!admin) {
        const dayKey = `${dayKeyOf(household)}-fix`;
        const quota = await store.get(dayKey);
        if ((quota?.envelope.used || 0) >= 30) throw new ApiError(429, "timecode_fix_quota", "今日はここまでです。");
        await store.put(dayKey, { used: (quota?.envelope.used || 0) + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
      }
      const key = keyOf(videoId, list);
      const cached = await store.get(key);
      await store.put(key, { stepTimes: times, source: "fix", chaptersChecked: true, ...(found(times) ? {} : { cleared: true }), by: admin ? "admin" : createHash("sha256").update(String(household)).digest("hex").slice(0, 12), at: new Date(now()).toISOString() }, { ifGeneration: cached?.generation ?? 0 });
      return { stepTimes: times, source: "fix" };
    }
  };
}
