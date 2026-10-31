import { randomUUID } from "node:crypto";
import { cleanDishName } from "./dishes.js";
import { ApiError } from "./errors.js";
import { createGcsSyncStore, createMemorySyncStore } from "./syncStore.js";
import { extractYouTubeVideoId, canonicalYouTubeUrl } from "./youtube.js";
import { normalizeImportResult } from "./importRecipe.js";
import { localizeRecipe } from "./units.js";
import { stepsKey } from "./rewrite.js";
import { VIDEO_TIMEOUT_MS, VIDEO_CLIENTS_MAX } from "./analyzer.js";

export function createRecipeStore(env) {
  const bucket = env.RECIPE_BUCKET || env.SYNC_BUCKET;
  if (bucket) return createGcsSyncStore(bucket, { prefix: "recipe-catalog" });
  if (env.RECIPE_STORE === "memory") return createMemorySyncStore();
  return null;
}

const STALE_PENDING_MS = 10 * 60_000;
const EXTRACTOR_VERSION = 3;
// A durable conditional claim precedes all paid work, including across instances.
// Pending claims are deliberately not stolen: an expired request may still incur AI cost.
const SNIPPET_MAX_AGE_MS = 30 * 86_400_000;
// 定期の後片付け（sweep）：YouTube API で取った情報は、30日を超える前（25日）に取り直す。
// 見られなくなった動画（削除・非公開）は、すぐに一覧から外し、30日たっても戻らなければ、読み取った結果ごと消す。
const RECHECK_AFTER_MS = 25 * 86_400_000;
const GONE_AFTER_MS = 30 * 86_400_000;
// 管理のレシピの候補（作る → 見比べる → 採用。2026-10-31 のユーザーの判断）。
// 候補は24時間だけ置く。候補づくりの鍵：説明欄・字幕の AI に加え、動画の読み取りが3つの接続先で時間切れまでかかっても切れない長さ＋余裕。
const CANDIDATE_TTL_MS = 24 * 3600_000;
const CANDIDATE_LOCK_MS = VIDEO_TIMEOUT_MS * VIDEO_CLIENTS_MAX + 10 * 60_000;
// 1つの候補で AI を呼ぶ回数の上限（説明欄1・字幕1・章1・動画は接続先を切り替えて3まで）。
const CANDIDATE_MAX_AI_CALLS = 6;
// 候補の時刻：動画の長さの外・手順の順番より前に戻る時刻は「不明（null）」。補間はしない。
// 前に戻る時刻があった時は、残した側（その前の時刻）も正しいとは限らないので「要確認」（suspects：手順の番号）にする。
// 前と同じ時刻（章がおおまか・同じ発話など）の手順も「要確認」にする（duplicates。料理モードで同じ区間をくり返さない。2026-10-31・review）。
export function cleanCandidateTimes(times, count, limit = null) {
  let dropped = 0, last = -1, lastIndex = -1;
  const suspects = new Set(), duplicates = new Set();
  const out = Array.from({ length: count }, (_, i) => {
    const raw = Array.isArray(times) ? times[i] : null;
    if (raw === null || raw === undefined || raw === "") return null;
    const t = Number(raw);
    if (Number.isFinite(t) && t >= 0 && (limit === null || t < limit) && t < last) { dropped += 1; suspects.add(lastIndex); return null; }
    if (!Number.isFinite(t) || t < 0 || (limit !== null && t >= limit)) { dropped += 1; return null; }
    if (lastIndex >= 0 && t === last) { duplicates.add(i); suspects.add(i); return Math.round(t * 10) / 10; }
    last = t; lastIndex = i;
    return Math.round(t * 10) / 10;
  });
  return { stepTimes: out, dropped, suspects: [...suspects].sort((a, b) => a - b), duplicates: [...duplicates].sort((a, b) => a - b) };
}
const UNAVAILABLE = { not_found: ["video_not_found", 404, "YouTube動画が見つかりませんでした。"], non_public: ["non_public_video", 422, "この動画はいま公開されていません。"] };
export function createRecipeCatalog(store, analyze, { model = "unknown", now = Date.now, dailyLimit = 100, monthlyLimit = 1000, enabled = true, tickets = null, refreshSnippet = null, checkVideos = null, candidateMaxSeconds = 1800, candidateVideoPerDay = 10 } = {}) {
  const inFlight = new Map();
  const required = () => {
    if (!store) throw new ApiError(503, "catalog_not_configured", "分析結果の保存先が未設定です。手動入力をご利用ください。");
  };
  async function reserveBudget() {
    if (!enabled) throw new ApiError(503, "analysis_disabled", "新しいAI分析は一時停止中です。保存済みの取り込み・手動入力は利用できます。");
    const day = new Date(now()).toISOString().slice(0, 10);
    for (const [period, limit] of [[day, dailyLimit], [day.slice(0, 7), monthlyLimit]]) {
      if (!Number.isInteger(limit) || limit < 1) throw new ApiError(503, "invalid_budget", "AI利用上限の設定を確認してください。");
      let reserved = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const key = `usage/${period}`;
        const entry = await store.get(key);
        const used = entry?.envelope.used || 0;
        if (used >= limit) throw new ApiError(429, "analysis_budget_exceeded", "AI分析の利用上限に達しました。手動入力をご利用ください。");
        if (await store.put(key, { used: used + 1 }, { ifGeneration: entry?.generation ?? 0 })) { reserved = true; break; }
      }
      if (!reserved) throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
    }
  }
  // YouTube APIで取得した説明文などは30日を超えて持たない：古ければ取り直し、取れなければ消す。
  async function refreshed(key, current) {
    const result = current.envelope.result;
    const fetchedAt = Date.parse(result.snippetFetchedAt || result.catalog?.analyzedAt || 0);
    if (now() - fetchedAt <= SNIPPET_MAX_AGE_MS) return result;
    // 取り直せなかった時も、古い説明文・チャンネル名は外す。日付は進めない（次の読み出し・定期の後片付けでまた取り直す）。
    let next = { ...result, caption: "", channelTitle: "" };
    try {
      const fresh = await refreshSnippet?.(result.videoId || key.replace(/^youtube-/, ""));
      if (fresh) { next = { ...next, caption: fresh.caption || "", channelTitle: fresh.channelTitle || "", snippetFetchedAt: new Date(now()).toISOString() }; delete next.unavailable; }
    } catch (error) {
      const reason = error?.code === "video_not_found" ? "not_found" : error?.code === "non_public_video" ? "non_public" : "";
      if (reason) next = { ...next, snippetFetchedAt: new Date(now()).toISOString(), unavailable: { reason, since: result.unavailable?.since || new Date(now()).toISOString() } };
    }
    await store.put(key, { status: "ready", result: next }, { ifGeneration: current.generation }).catch(() => {});
    return next;
  }
  // 見られなくなった動画（削除・非公開）の結果は、一覧にも取り込みにも出さない（AI も呼ばない）。
  const unavailableError = (result) => { const [code, status, message] = UNAVAILABLE[result.unavailable.reason] || UNAVAILABLE.not_found; return new ApiError(status, code, message); };
  // aiGate：呼び出し元ごとの AI 回数の上限（新着集めが使う）。{ allow(): 残りがあるか, used(): 1回使った } を、AI を呼ぶ直前ごとに通す。
  // reread：説明欄から読み直す（運営。以前の上限で手順が10個で切れたレシピを直す。2026-10-04）。説明欄から読んだレシピだけ。
  async function run(id, { forceVideo = false, household = "", unlimited = false, aiGate = null, reread = false } = {}) {
    const gate = async () => {
      if (aiGate && !aiGate.allow()) throw new ApiError(429, "trend_ai_budget", "新着集めの AI の回数の上限に達しました。");
      await reserveBudget();
      aiGate?.used();
    };
    required();
    const key = `youtube-${id}`;
    const current = await store.get(key);
    // 古い抽出方式の結果は、作り方の質が低いことがあるので一度だけ読み直す。
    const fresh = (current?.envelope.result?.catalog?.extractorVersion || 1) >= EXTRACTOR_VERSION;
    // 「動画から読み直す」：すでに動画から読んだ結果があれば、同じ結果になるので再解析しない（費用をかけない）。
    const fromVideo = String(current?.envelope.result?.analyzedFrom || "").startsWith("video");
    if (current?.envelope.status === "ready" && current.envelope.result?.unavailable) throw unavailableError(current.envelope.result);
    if (reread && current?.envelope.status !== "ready") throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
    // 動画から読んだレシピも、運営は「説明欄＋字幕」で読み直せる（説明欄がなければ下の読み取りが失敗し、前の結果が残る）。
    if (current?.envelope.status === "ready" && fresh && (!forceVideo || fromVideo) && !reread) {
      const result = await refreshed(key, current);
      if (result.unavailable) throw unavailableError(result);
      return { ...localizeRecipe(structuredClone(result)), cacheHit: true };
    }
    // 動画の読み取りは、ボタンを押した時だけ。1日の上限の回数を先に1回使う（上限なら保存済みの結果には触れない）。
    // 誰かがもう動画から読んだ動画なら、上で保存済みの結果を返すので回数は使わない。
    let spent = false;
    if (forceVideo) { if (!tickets) throw new ApiError(503, "catalog_not_configured", "回数の保存先が未設定です。"); await tickets.spend(household, { unlimited }); spent = !unlimited; }
    const refund = async () => { if (spent) { spent = false; await tickets.refund(household, { unlimited }).catch(() => {}); } };
    // A claim older than STALE_PENDING_MS cannot still be waiting on the AI (timeout is 60s), so it may be retried.
    const stale = current?.envelope.status === "pending" && now() - Date.parse(current.envelope.startedAt || 0) > STALE_PENDING_MS;
    if (current?.envelope.status === "pending" && !stale) { await refund(); throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。"); }
    // 説明文で失敗した直後でも、動画から読むのは待たせない（1日の上限がある操作なので連打にはならない）。
    if (!forceVideo && current?.envelope.retryAt > now()) { await refund(); throw new ApiError(429, "analysis_cooldown", "分析に失敗したため、1分ほど待ってから再試行してください。"); }
    // 読み直しは、保存済みのレシピを「分析中」で置き換えない（途中で失敗・停止しても、前のレシピを読める）。
    // 別の鍵で同時の読み直しを止め（世代つきの書き込みで1つだけ）、最後に保存済みの版が変わっていない時だけ書く（review fix #138）。
    const lock = reread ? await claimRereadLock(id) : null;
    const tracker = reread ? createProgress(id) : null;
    const claim = reread ? { generation: current.generation } : await store.put(key, { status: "pending", startedAt: new Date(now()).toISOString() }, { ifGeneration: current?.generation ?? 0 });
    if (!claim) { await refund(); throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。"); }
    try {
      // 説明欄の読み取り・動画の読み取り・チャプターとの対応付けの、それぞれの直前に gate を通す。
      await gate();
      const raw = await analyze(canonicalYouTubeUrl(id), { reserveBudget: gate, forceVideo, reread, ...(tracker ? { onProgress: tracker.update } : {}) });
      tracker?.update({ stage: 4, detail: "手順・時刻・材料を確認中" });
      const validAnalyzedFrom = ["video", "video-clip", "description+transcript"].includes(raw?.analyzedFrom) ? raw.analyzedFrom : "description";
      const result = { ...normalizeImportResult(raw), analyzedFrom: validAnalyzedFrom };
      // 時刻の出どころ（説明欄の章・YouTube字幕）も残す（管理の点検で、AI が動画から探した時刻と分ける。review fix #136）。
      if (["chapters", "transcript"].includes(raw?.stepTimesFrom) && (result.stepTimes || []).some((t) => Number.isFinite(t))) {
        result.stepTimesFrom = raw.stepTimesFrom;
      }
      // 運営が直した料理名は、読み直しても引き継ぐ（AI の新しい料理名で上書きしない。空＝題名で決める、も含めて）。
      const before = current?.envelope.status === "ready" ? current.envelope.result : null;
      if (before?.dishNameFrom === "admin") { if (before.dishName) result.dishName = before.dishName; else delete result.dishName; result.dishNameFrom = "admin"; }
      // 読み直しで手順が減る（説明欄が変わった・読めなかった）時は、前の結果を残す。
      // 字幕と照合して作り直した時（description+transcript）は「作業のまとまり」に整理するので、工程数が減っても採用する。
      if (reread && before && result.analyzedFrom !== "description+transcript" && (result.steps || []).length < (before.steps || []).length) throw new ApiError(422, "reread_worse", "読み直すと手順が減るので、前の結果を残しました。");

      // 字幕ハイブリッド（description+transcript）で再生成した際に、既存レシピにあった多くの有効時刻が全損（0件）してしまう場合は採用を見送る
      const duration = before?.durationSeconds || result?.durationSeconds || null;
      const beforeValidTimes = (before?.stepTimes || []).filter((t) => Number.isFinite(t) && (duration === null || t < duration)).length;
      const newValidTimes = (result?.stepTimes || []).filter((t) => Number.isFinite(t) && (duration === null || t < duration)).length;
      if (reread && result.analyzedFrom === "description+transcript" && beforeValidTimes >= 3 && newValidTimes === 0) {
        throw new ApiError(422, "reread_lost_timecodes", "読み直すと有効な時刻が失われるため、前の結果を残しました。");
      }
      if (reread) result.rereadAt = new Date(now()).toISOString();
      // 動画から作り方を読めなかったら、回数は戻す。
      if (!result.analyzedFrom.startsWith("video")) await refund();
      // 取り込みは説明文だけで読む。作り方がなくても材料があれば保存し、動画はボタンで読む。
      if (!result.title || !result.ingredients.length || (!result.steps.length && (forceVideo || !raw?.videoSkipped))) {
        const error = new ApiError(422, "incomplete_recipe", "材料や手順を読み取れませんでした。手動入力をご利用ください。");
        throw error;
      }
      tracker?.update({ stage: 5, detail: "保存中" });
      result.catalog = { id: key, revision: randomUUID(), analyzedAt: new Date(now()).toISOString(), model, extractorVersion: EXTRACTOR_VERSION };
      result.snippetFetchedAt = result.catalog.analyzedAt;
      // 履歴には説明文の原文を残さない（30日ルール）。
      const revision = await store.put(`versions/${result.catalog.revision}`, { ...result, caption: "", channelTitle: "" }, { ifGeneration: 0 });
      if (!revision) throw new Error("Revision collision");
      const written = await store.put(key, { status: "ready", result }, { ifGeneration: claim.generation });
      if (!written) throw new ApiError(409, "catalog_conflict", "分析結果が更新されました。再取得してください。");
      await tracker?.finish("updated", `手順 ${(before?.steps || []).length} → ${(result.steps || []).length} に更新しました`);
      return { ...structuredClone(result), cacheHit: false, videoSkipped: !!raw?.videoSkipped, ticketUsed: spent };
    } catch (error) {
      await tracker?.finish(error.code === "catalog_conflict" ? "conflict" : ["reread_worse", "reread_lost_timecodes", "incomplete_recipe", "analysis_uncertain"].includes(error.code) ? "kept_old" : "failed", error.message || "失敗しました");
      await refund();
      // 読み直して手順が減る・読めない・レシピでないと言われた時は、前の結果に「読み直した」印だけ付ける（一括の読み直しで同じ品を何度も呼ばない）。
      // 読み直しでは保存済みのレシピを置き換えていないので、ほかの失敗では何も書かない。
      if (reread) {
        if (["reread_worse", "reread_lost_timecodes", "incomplete_recipe", "analysis_uncertain"].includes(error.code)) await store.put(key, { ...current.envelope, result: { ...current.envelope.result, rereadAt: new Date(now()).toISOString() } }, { ifGeneration: claim.generation }).catch(() => {});
        throw error;
      }
      // 読み直しに失敗しても、保存済みの結果は消さない（レシピでないと言われた時も。review fix #138）。
      if (current?.envelope.status === "ready") await store.put(key, current.envelope, { ifGeneration: claim.generation }).catch(() => {});
      else if (error.code !== "analysis_uncertain") await store.put(key, { status: "failed", retryAt: now() + 60_000 }, { ifGeneration: claim.generation }).catch(() => {});
      throw error;
    } finally {
      if (lock) await store.remove(lock.key, { ifGeneration: lock.generation }).catch(() => {});
    }
  }
  // 管理画面に見せる読み直しの処理段階を、保存先に残す（複数のサーバーでも追える。表示だけなので、保存に失敗しても読み直しは止めない）。
  const PROGRESS_LABEL = { 1: "素材を取得", 2: "調理ブロックを整理", 3: "字幕・章と照合", 4: "品質を確認", 5: "保存" };
  function createProgress(id) {
    const key = `reread-progress/${id}`;
    const startedAt = new Date(now()).toISOString();
    let chain = Promise.resolve();
    const logs = [];
    let state = { status: "running", stage: 1, total: 5, label: PROGRESS_LABEL[1], detail: "開始しました", startedAt, logs };
    const write = () => {
      const snapshot = { ...state, logs: [...logs], updatedAt: new Date(now()).toISOString() };
      const task = async () => {
        let timedOut = false;
        try {
          const timer = new Promise((_, reject) => setTimeout(() => { timedOut = true; reject(new Error("timeout")); }, 1500));
          await Promise.race([
            (async () => {
              const cur = await store.get(key);
              // タイムアウトしていた場合や、既に done/failed で完了している場合は古い進捗で上書きしない
              if (timedOut) return;
              // 同じ実行回（startedAt が同一）で、既に完了（done/failed）している場合は古い途中の進捗で上書きしない
              if (cur?.envelope?.startedAt === snapshot.startedAt && cur?.envelope?.status === "done" && snapshot.status !== "done") return;
              await store.put(key, snapshot, { ifGeneration: cur?.generation ?? 0 });
            })(),
            timer
          ]);
        } catch { /* 表示用の保存失敗・遅延は無視 */ }
      };
      chain = chain.then(task);
      return chain;
    };
    write();
    return {
      update({ stage, detail = "" }) {
        const curStage = Math.max(state.stage, stage);
        if (detail && !logs.includes(detail)) logs.push(`${curStage}/5 ${detail}`);
        state = { ...state, stage: curStage, label: PROGRESS_LABEL[curStage], detail: detail || state.detail };
        write();
      },
      finish(outcome, message) {
        if (message && !logs.includes(message)) logs.push(message);
        const ok = outcome === "updated" || outcome === "candidate";
        state = {
          ...state,
          status: ok ? "done" : "failed",
          outcome,
          detail: message,
          label: outcome === "updated" ? "完了" : outcome === "candidate" ? "候補ができました" : PROGRESS_LABEL[state.stage]
        };
        return write();
      }
    };
  }
  // 読み直しの鍵：10分より古い鍵は止まった読み直しのものなので取り直してよい。
  async function claimRereadLock(id) {
    const lockKey = `reread-lock/${id}`;
    const held = await store.get(lockKey);
    if (held && now() - Date.parse(held.envelope.at || 0) <= STALE_PENDING_MS) throw new ApiError(409, "analysis_pending", "このレシピは読み直している途中です。");
    const put = await store.put(lockKey, { at: new Date(now()).toISOString() }, { ifGeneration: held?.generation ?? 0 });
    if (!put) throw new ApiError(409, "analysis_pending", "このレシピは読み直している途中です。");
    return { key: lockKey, generation: put.generation };
  }
  // 置き換える前の版を履歴に残す（説明文の原文は残さない）。残せなかったら止める（「前の版は履歴に残る」を守る）。
  async function keepVersion(before, at, replacedBy) {
    let saved = null;
    try { saved = await store.put(`versions/${randomUUID()}`, { ...before, caption: "", channelTitle: "", replacedAt: at, replacedBy }, { ifGeneration: 0 }); } catch { saved = null; }
    if (!saved) throw new ApiError(503, "history_failed", "前の版を履歴に残せなかったため、保存を止めました。もう一度お試しください。");
  }
  // 世代つきの書き込みで取る鍵（複数のサーバーでも1つだけ）。maxAge より古い鍵は止まったものなので取り直してよい。
  async function claimLock(lockKey, maxAge, message) {
    const held = await store.get(lockKey);
    if (held && now() - Date.parse(held.envelope.at || 0) <= maxAge) throw new ApiError(409, "candidate_pending", message);
    const put = await store.put(lockKey, { at: new Date(now()).toISOString() }, { ifGeneration: held?.generation ?? 0 });
    if (!put) throw new ApiError(409, "candidate_pending", message);
    return { key: lockKey, generation: put.generation };
  }
  // 管理の候補づくりで動画を読む回数（1日 candidateVideoPerDay 回まで。試した回数で数える）。
  async function spendCandidateVideo() {
    const key = `candidate-video/${new Date(now()).toISOString().slice(0, 10)}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const entry = await store.get(key);
      const used = entry?.envelope.used || 0;
      if (used >= candidateVideoPerDay) throw new ApiError(429, "candidate_video_limit", `動画から候補を作るのは1日${candidateVideoPerDay}回までです。明日またお試しください。`);
      if (await store.put(key, { used: used + 1 }, { ifGeneration: entry?.generation ?? 0 })) return;
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  // 候補の中身の検査（採用する時も、もう一度通す）。前の結果との比べはしない（運営が見て選ぶので）。
  function checkCandidate(result, durationSeconds) {
    if (!result?.title || !(result.ingredients || []).length || (result.steps || []).length < 2) throw new ApiError(422, "incomplete_recipe", "材料や手順（2つ以上）を読み取れませんでした。");
    const limit = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null;
    return cleanCandidateTimes(result.stepTimes, result.steps.length, limit);
  }
  // 候補の見立て（管理画面で「このまま保存」か「次の作り方」を勧める）：時刻が半分に足りない・重なる・前に戻る、のどれもなければ ok。
  const candidateCheck = (c) => {
    const n = c.result.steps.length, times = (c.result.stepTimes || []).filter(Number.isFinite).length;
    const dups = c.duplicateTimes || [], back = (c.suspectTimes || []).filter((i) => !dups.includes(i));
    const reasons = [...(times < Math.ceil(n / 2) ? ["times_few"] : []), ...(dups.length ? ["duplicates"] : []), ...(back.length ? ["goes_back"] : [])];
    return { ok: !reasons.length, reasons };
  };
  const candidateView = (c) => c && { check: candidateCheck(c), candidateId: c.candidateId, mode: c.mode, createdAt: c.createdAt, expiresAt: c.expiresAt, analyzedFrom: c.result.analyzedFrom, stepTimesFrom: c.result.stepTimesFrom || "",
    title: c.result.title, dishName: c.result.dishName || "", ingredients: c.result.ingredients, steps: c.result.steps, stepTimes: c.result.stepTimes || [], durationSeconds: c.durationSeconds ?? null,
    droppedTimes: c.droppedTimes || 0, suspectTimes: c.suspectTimes || [], duplicateTimes: c.duplicateTimes || [], timesFrom: c.timesFrom || "", carriedAdminTimes: c.carriedAdminTimes || 0, aiCalls: c.aiCalls || 0, yen: c.yen ?? null, yenUnknown: !!c.yenUnknown, logs: c.logs || [] };
  return {
    async reserveAnalysisBudget() { required(); await reserveBudget(); },
    // 運営がレシピを変えた時刻（複数のサーバーで一覧の作り置きを捨てるため。APP_MAP §52-9）。保存先がない時は 0。
    async markChanged() { if (!store) return; const cur = await store.get("catalog-changed").catch(() => null); await store.put("catalog-changed", { at: new Date(now()).toISOString() }, { ifGeneration: cur?.generation ?? 0 }).catch(() => null); },
    async changedAt() { if (!store) return 0; return Date.parse((await store.get("catalog-changed").catch(() => null))?.envelope?.at || 0) || 0; },
    // 管理：レシピの候補を作る（保存済みのレシピは上書きしない）。mode：
    // "basic"＝説明欄＋字幕＋章（動画は読まない。管理画面の「作り直す」の1段目）／"auto"＝説明欄＋字幕 → だめなら動画／
    // "video"＝動画から／"transcript"＝運営が貼り付けた字幕（transcriptItems）で作る。
    // cost()：AI の費用（円。分からなければ null）を、保存の直前に聞く。
    async makeCandidate(rawUrl, { mode = "auto", cost = null, transcriptItems = null } = {}) {
      required();
      if (!["basic", "auto", "video", "transcript"].includes(mode)) throw new ApiError(400, "invalid_mode", "作り方の指定が正しくありません。");
      if (mode === "transcript" && !(Array.isArray(transcriptItems) && transcriptItems.length >= 3)) throw new ApiError(400, "transcript_unreadable", "貼り付けた字幕から、時刻つきの行を読み取れませんでした（「0:16」のような時刻の行が3つ以上いります）。");
      const id = extractYouTubeVideoId(rawUrl);
      const key = `youtube-${id}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      const lock = await claimLock(`candidate-lock/${id}`, CANDIDATE_LOCK_MS, "この料理は候補を作っている途中です。");
      const tracker = createProgress(id);
      let aiCalls = 0;
      const gate = async () => {
        if (aiCalls >= CANDIDATE_MAX_AI_CALLS) throw new ApiError(429, "candidate_ai_limit", `1つの候補で AI を呼べる回数（${CANDIDATE_MAX_AI_CALLS}回）を超えました。`);
        await reserveBudget();
        aiCalls += 1;
      };
      try {
        await gate();
        // videoFullOnly：最後まで見られる動画だけ読む。時刻も補正せずに渡してもらう（下の checkCandidate で検査を一本にする）。
        const raw = await analyze(canonicalYouTubeUrl(id), { reserveBudget: gate, reread: true, forceVideo: mode === "video", videoIfNeeded: mode === "auto", videoFullOnly: true,
          videoMaxSeconds: candidateMaxSeconds, reserveVideo: spendCandidateVideo, onProgress: tracker.update, ...(mode === "transcript" ? { transcriptItems } : {}) });
        tracker.update({ stage: 4, detail: "手順・時刻・材料を確認中" });
        const analyzedFrom = ["video", "video-clip", "description+transcript"].includes(raw?.analyzedFrom) ? raw.analyzedFrom : "description";
        if (mode === "video" && !analyzedFrom.startsWith("video")) throw new ApiError(422, "video_analysis_failed", "動画から作り方を読み取れませんでした。");
        if (mode === "transcript" && analyzedFrom !== "description+transcript") throw new ApiError(422, "transcript_unused", "貼り付けた字幕で手順を作れませんでした（処理の履歴に理由があります）。");
        const result = { ...normalizeImportResult(raw), analyzedFrom };
        if (["chapters", "transcript"].includes(raw?.stepTimesFrom)) result.stepTimesFrom = raw.stepTimesFrom;
        const before = current.envelope.result;
        const durationSeconds = Number.isFinite(raw?.durationSeconds) ? raw.durationSeconds : null;
        let { stepTimes, dropped, suspects, duplicates } = checkCandidate(result, durationSeconds);
        result.stepTimes = stepTimes;
        if (!stepTimes.some(Number.isFinite)) delete result.stepTimesFrom;
        // 時刻の出どころ（候補の画面に出す）：説明欄の章・字幕・動画・説明欄の読み取り。
        const timesFrom = !stepTimes.some(Number.isFinite) ? "" : ["chapters", "transcript"].includes(raw?.stepTimesFrom) ? raw.stepTimesFrom : analyzedFrom.startsWith("video") ? "video" : analyzedFrom === "description+transcript" ? "transcript" : "description";
        // 運営が直した料理名は引き継ぐ。運営が直した時刻は、文がまったく同じ手順（前にも候補にも1つだけ）の分だけ引き継ぐ（別の作業に時刻を付けない）。
        if (before.dishNameFrom === "admin") { if (before.dishName) result.dishName = before.dishName; else delete result.dishName; result.dishNameFrom = "admin"; }
        let carried = 0;
        const carriedAt = new Set();
        if (before.stepTimesFrom === "admin") {
          const count = (list) => list.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
          const oldCount = count(before.steps || []), newCount = count(result.steps);
          result.steps.forEach((step, i) => {
            const j = (before.steps || []).indexOf(step);
            const t = before.stepTimes?.[j];
            if (j >= 0 && oldCount.get(step) === 1 && newCount.get(step) === 1 && Number.isFinite(t) && (durationSeconds === null || t < durationSeconds)) { result.stepTimes[i] = t; carried += 1; carriedAt.add(i); }
          });
          // 引き継いだ時刻で、もう一度確かめる。重なりは最後の時刻で数え直し（引き継ぎで解けた重なりを残さない）、
          // 運営が直した時刻は要確認にしない。前に戻る時刻の手前の要確認は、引き継がなかった手順の分だけ残す（Codex review #210）。
          if (carried) {
            const again = cleanCandidateTimes(result.stepTimes, result.steps.length, durationSeconds);
            result.stepTimes = again.stepTimes;
            suspects = [...suspects.filter((i) => !duplicates.includes(i) && !carriedAt.has(i)), ...again.suspects];
            duplicates = again.duplicates;
          }
        }
        const yen = typeof cost === "function" ? cost() : null;
        const createdAt = new Date(now()).toISOString();
        const record = { candidateId: randomUUID(), videoId: id, mode, createdAt, expiresAt: new Date(now() + CANDIDATE_TTL_MS).toISOString(),
          base: { generation: current.generation, revision: before.catalog?.revision || "" }, result, durationSeconds, droppedTimes: dropped, suspectTimes: [...new Set(suspects)].sort((a, b) => a - b), duplicateTimes: [...new Set(duplicates)].sort((a, b) => a - b), timesFrom, carriedAdminTimes: carried, aiCalls,
          yen: Number.isFinite(yen) ? Math.round(yen * 100) / 100 : null, yenUnknown: !Number.isFinite(yen) };
        const candKey = `reread-candidate/${id}`;
        const old = await store.get(candKey);
        if (!(await store.put(candKey, record, { ifGeneration: old?.generation ?? 0 }))) throw new ApiError(409, "candidate_pending", "ほかの候補づくりと重なりました。開き直してください。");
        const message = `候補ができました（手順 ${(before.steps || []).length} → ${result.steps.length}・時刻 ${result.stepTimes.filter(Number.isFinite).length}個）。見比べて「この候補で保存」を押すまで、保存済みのレシピは変わりません`;
        await tracker.finish("candidate", message);
        return candidateView(record);
      } catch (error) {
        await tracker.finish("failed", error?.message || "失敗しました");
        throw error;
      } finally {
        await store.remove(lock.key, { ifGeneration: lock.generation }).catch(() => {});
      }
    },
    // 管理：候補を捨てる（「やめる」。開き直しても出ない）。見ている候補（candidateId）が作り直されていたら捨てない。
    async discardCandidate(rawUrl, { candidateId } = {}) {
      required();
      const candKey = `reread-candidate/${extractYouTubeVideoId(rawUrl)}`;
      const cand = await store.get(candKey);
      if (!cand) return { discarded: false };
      if (!candidateId || cand.envelope.candidateId !== candidateId) throw new ApiError(409, "candidate_changed", "見ている候補は作り直されました。開き直してください。");
      return { discarded: !!(await store.remove(candKey, { ifGeneration: cand.generation })) };
    },
    // 管理：今日、動画から候補を作れる残りの回数。
    async candidateVideoLeft() {
      required();
      const used = (await store.get(`candidate-video/${new Date(now()).toISOString().slice(0, 10)}`))?.envelope.used || 0;
      return Math.max(0, candidateVideoPerDay - used);
    },
    // 管理：いまの候補（期限切れ・なしは null）。
    async candidate(rawUrl) {
      required();
      const entry = await store.get(`reread-candidate/${extractYouTubeVideoId(rawUrl)}`);
      if (!entry || Date.parse(entry.envelope.expiresAt || 0) <= now()) return null;
      return candidateView(entry.envelope);
    },
    // 管理：見比べた候補を採用する。候補ID・期限・候補を作った時からレシピが変わっていないことを確かめる。
    // 外すのは「前の結果と比べて断る」判定だけ（運営が見て選ぶので）。候補の中身の検査はもう一度通す。
    async adoptCandidate(rawUrl, { candidateId } = {}) {
      required();
      const id = extractYouTubeVideoId(rawUrl);
      const key = `youtube-${id}`;
      const candKey = `reread-candidate/${id}`;
      const cand = await store.get(candKey);
      if (!cand || !candidateId || cand.envelope.candidateId !== candidateId) throw new ApiError(409, "candidate_changed", "見ている候補は作り直されたか、なくなりました。開き直してください。");
      if (Date.parse(cand.envelope.expiresAt || 0) <= now()) throw new ApiError(410, "candidate_expired", "候補の期限（24時間）が切れました。もう一度作ってください。");
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      // 手順・時刻の版（catalog.revision。読み直し・手順の編集・時刻の保存で変わる）が同じかで確かめる。
      // 料理名の手直しなど手順・時刻に関わらない保存では断らず、その時点の運営の料理名を引き継ぎ直す。
      const before = current.envelope.result;
      if (String(before.catalog?.revision || "") !== String(cand.envelope.base.revision || "")) throw new ApiError(409, "catalog_conflict", "候補を作った後に、レシピの手順か時刻が変わりました。候補を作り直してください。");
      const c = cand.envelope;
      const { stepTimes } = checkCandidate(c.result, c.durationSeconds);
      const at = new Date(now()).toISOString();
      const result = { ...structuredClone(c.result), stepTimes, rereadAt: at, adoptedFrom: { candidateId, mode: c.mode, at } };
      delete result.guide;
      delete result.stepTimesPending;
      if (before.dishNameFrom === "admin") { if (before.dishName) result.dishName = before.dishName; else delete result.dishName; result.dishNameFrom = "admin"; }
      // 前に戻る時刻の手前の時刻（要確認）は、確かめるまでアプリで使わない。
      const suspects = (c.suspectTimes || []).filter((i) => Number.isFinite(result.stepTimes[i]));
      if (suspects.length) {
        result.stepTimesPending = result.stepTimes.map((t, i) => (suspects.includes(i) ? t : null));
        suspects.forEach((i) => { result.stepTimes[i] = null; });
      }
      result.catalog = { id: key, revision: randomUUID(), analyzedAt: at, model, extractorVersion: EXTRACTOR_VERSION };
      result.snippetFetchedAt = c.createdAt;
      // 前の版（運営が直した時刻も含めて）と新しい版を、履歴に残す（説明文の原文は残さない）。残せなければ置き換えない。
      await keepVersion(before, at, result.catalog.revision);
      if (!(await store.put(`versions/${result.catalog.revision}`, { ...result, caption: "", channelTitle: "" }, { ifGeneration: 0 }))) throw new Error("Revision collision");
      if (!(await store.put(key, { status: "ready", result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。もう一度お試しください。");
      await store.remove(candKey, { ifGeneration: cand.generation }).catch(() => {});
      return { before: (before.steps || []).length, after: result.steps.length, analyzedFrom: result.analyzedFrom, guideRemoved: !!before.guide, times: result.stepTimes.filter(Number.isFinite).length,
        steps: result.steps, stepTimes: result.stepTimes, stepTimesPending: result.stepTimesPending || [], stepTimesFrom: result.stepTimesFrom || "", durationSeconds: c.durationSeconds ?? null, revision: result.catalog.revision };
    },
    // 管理：読み直しの処理段階（なければ null）。
    async rereadProgress(rawUrl) { required(); return (await store.get(`reread-progress/${extractYouTubeVideoId(rawUrl)}`))?.envelope || null; },
    async import(rawUrl, { forceVideo = false, household = "", unlimited = false, aiGate = null, reread = false } = {}) {
      const id = extractYouTubeVideoId(rawUrl);
      const key = forceVideo ? `${id}:video:${household}` : reread ? `${id}:reread` : id;
      if (!inFlight.has(key)) inFlight.set(key, run(id, { forceVideo, household, unlimited, aiGate, reread }).finally(() => inFlight.delete(key)));
      return structuredClone(await inFlight.get(key));
    },
    // 表示用の読み出し（一覧の GET から使う）：保存済みの読み取り結果を返すだけ。AIも YouTube API も呼ばない。
    // まだ読んでいない動画は null。説明文・チャンネル名が30日より古ければ、取り直さずに外して返す（取り直しは refresh で定期実行から）。
    async peek(rawUrl) {
      required();
      const current = await store.get(`youtube-${extractYouTubeVideoId(rawUrl)}`);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) return null;
      const result = structuredClone(current.envelope.result);
      const fetchedAt = Date.parse(result.snippetFetchedAt || result.catalog?.analyzedAt || 0);
      if (now() - fetchedAt > SNIPPET_MAX_AGE_MS) Object.assign(result, { caption: "", channelTitle: "" });
      return { ...localizeRecipe(result), cacheHit: true };
    },
    // 管理：保存済みの読み取り結果の、手順の時刻（stepTimes）を運営が直す（新着・みんなの定番の一覧に出る時刻）。AI は呼ばない。
    // 料理名（dishName）を付ける・直す（APP_MAP §48）。from："ai"（あとから AI で付ける。運営が直した料理は上書きしない）／"admin"（運営が直す。空なら題名で決める印）。
    async setDishName(rawUrl, dishName, { from = "admin" } = {}) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      const result = structuredClone(current.envelope.result);
      if (from === "ai" && result.dishNameFrom === "admin") return { dishName: result.dishName || "", dishNameFrom: "admin", skipped: true };
      const name = cleanDishName(dishName);
      if (from === "ai" && !name) return { dishName: result.dishName || "", skipped: true };
      if (name) result.dishName = name; else delete result.dishName;
      result.dishNameFrom = from === "ai" ? "ai-backfill" : "admin";
      if (!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。もう一度保存してください。");
      return { dishName: result.dishName || "", dishNameFrom: result.dishNameFrom };
    },
    // あとから AI で料理名を付けようとしたが名前が返らなかった印（同じ料理に何度も費用を使わない）。
    async markDishNameTried(rawUrl) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      // もう名前や印がある時だけ "skip"。読み直しの最中（pending）など、いま保存できない時は false（済みに数えない）。
      if (current?.envelope.status !== "ready") return false;
      if (current.envelope.result?.dishName || current.envelope.result?.dishNameFrom) return "skip";
      const result = { ...current.envelope.result, dishNameFrom: "ai-backfill" };
      return !!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }));
    },
    // 管理：書き直した手順（guide。APP_MAP §49）を付ける・外す（null）。元の手順・時刻には触らない。
    // 読み直し（取り込み・reread）では結果を作り直すので、書き直しは消える（元の手順が変わるので）。
    async setGuide(rawUrl, guide) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      const result = structuredClone(current.envelope.result);
      // 書き直しを頼んだ時の元の手順（guide.of）と、いまの元の手順（一覧と同じく単位をそろえた形）が違えば保存しない（AI の間に読み直された。review fix #139）。
      const seen = stepsKey(localizeRecipe(result).steps);
      if (guide && guide.of !== seen) throw new ApiError(409, "catalog_conflict", "書き直している間に元の手順が変わりました。もう一度書き直してください。");
      if (guide) result.guide = { steps: guide.steps.map((g) => ({ text: g.text, from: g.from })), limit: guide.limit, of: seen, at: new Date(now()).toISOString(), ...(guide.model ? { model: guide.model } : {}) };
      else delete result.guide;
      if (!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。もう一度保存してください。");
      return { guide: result.guide || null };
    },
    // 管理：手順の文を直す・足す・消す・並べ替える（APP_MAP §52-7）。1行＝「手順の文＋時刻＋要確認」の1組で受け取り、まとめて1回で保存する（途中で食い違わない）。
    // 要確認（pending）の時刻は stepTimesPending に置き、stepTimes は null（確かめるまでアプリの ▶・繰り返しに使わない）。
    // baseRevision：編集を始めた時のレシピの版（違えば断る）。書き直し（guide）は元の手順が変わるので外す。前の版は履歴に残す。
    async setSteps(rawUrl, { rows, baseRevision = "", durationSeconds = null } = {}) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      const before = current.envelope.result;
      if (String(baseRevision || "") !== String(before.catalog?.revision || "")) throw new ApiError(409, "catalog_conflict", "編集を始めた後にレシピが変わりました。開き直してください。");
      const list = Array.isArray(rows) ? rows : [];
      if (list.length < 2 || list.length > 30) throw new ApiError(400, "invalid_steps", "手順は2〜30個にしてください。");
      const limit = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 36_000;
      const clean = list.map((row, i) => {
        const text = String(row?.text ?? "").replace(/\s+/g, " ").trim();
        if (!text || text.length > 300) throw new ApiError(400, "invalid_steps", `手順${i + 1}の文を1〜300字にしてください。`);
        const raw = row?.time;
        const time = raw === null || raw === undefined || raw === "" ? null : Number(raw);
        if (time !== null && (!Number.isFinite(time) || time < 0 || time >= limit)) throw new ApiError(400, "invalid_steps", `手順${i + 1}の時刻が動画の外です。`);
        return { text, time: time === null ? null : Math.floor(time), pending: row?.pending === true && time !== null };
      });
      const at = new Date(now()).toISOString();
      const result = structuredClone(before);
      result.steps = clean.map((x) => x.text);
      result.stepTimes = clean.map((x) => (x.pending ? null : x.time));
      if (clean.some((x) => x.pending)) result.stepTimesPending = clean.map((x) => (x.pending ? x.time : null)); else delete result.stepTimesPending;
      result.stepTimesFrom = "admin";
      result.stepsEditedAt = at;
      delete result.guide;
      result.catalog = { ...(before.catalog || {}), revision: randomUUID() };
      await keepVersion(before, at, result.catalog.revision);
      if (!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。開き直してください。");
      return { steps: result.steps, stepTimes: result.stepTimes, stepTimesPending: result.stepTimesPending || [], revision: result.catalog.revision, guideRemoved: !!before.guide };
    },
    // baseRevision：管理画面が開いた時の版（渡された時は、違えば断る）。時刻を変えたら版を新しくする（古い編集画面・候補で上書きしない）。
    async setStepTimes(rawUrl, stepTimes, { from = "admin", baseRevision } = {}) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      if (baseRevision !== undefined && String(baseRevision || "") !== String(current.envelope.result.catalog?.revision || "")) throw new ApiError(409, "catalog_conflict", "開いた後にレシピが変わりました。開き直してください。");
      const result = structuredClone(current.envelope.result);
      result.catalog = { ...(result.catalog || {}), revision: randomUUID() };
      const count = (result.steps || []).length;
      const raw = Array.isArray(stepTimes) ? stepTimes : [];
      result.stepTimes = Array.from({ length: count }, (_, i) => { const t = raw[i]; return t === null || t === undefined || t === "" || !Number.isFinite(Number(t)) || Number(t) < 0 || Number(t) >= 36_000 ? null : Math.floor(Number(t)); });
      if (from) result.stepTimesFrom = from;
      // 運営が時刻を保存した＝要確認だった時刻も確かめた（▶ で見て保存した）。0円の一括補正では確かめていないので残す。
      if (from === "admin") delete result.stepTimesPending;
      if (!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。もう一度保存してください。");
      return { stepTimes: result.stepTimes, revision: result.catalog.revision };
    },
    // 定期実行用：保存済みの結果の説明文・チャンネル名を、30日ルールに沿って取り直す（AIでの読み直しはしない）。
    async refresh(rawUrl) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready") return false;
      await refreshed(key, current);
      return true;
    },
    // 定期の後片付け：保存済みの読み取り結果を名前の順に max 件見て、25日より前に確かめたものを YouTube に確かめ直す（50本ずつ）。
    // 公開 → 説明文・チャンネル名を取り直す。削除・非公開 → 一覧から外す（30日たっても戻らなければ消す）。
    // 確かめられない（通信・枠）時は、30日を過ぎた説明文だけ外して、日付は進めない（次の回にまた）。
    // 返す next を次の回に渡すと続きから。"" なら最初から。
    async sweep({ cursor = "", max = 200 } = {}) {
      required();
      if (typeof store.list !== "function" || typeof checkVideos !== "function") return { skipped: true, next: "" };
      const page = await store.list("youtube-", { pageToken: cursor, max });
      const due = [];
      const out = { seen: 0, checked: 0, refreshed: 0, unavailable: 0, removed: 0, stripped: 0, errors: 0, next: page.next };
      for (const key of page.names) {
        const entry = await store.get(key).catch(() => null);
        if (entry?.envelope.status !== "ready") continue;
        out.seen += 1;
        const r = entry.envelope.result;
        const checkedAt = Date.parse(r.snippetFetchedAt || r.catalog?.analyzedAt || 0) || 0;
        // 見られなくなってから30日たったものは、前に確かめた日にかかわらず確かめる（戻っていなければ消す）。
        const goneDue = r.unavailable && now() - (Date.parse(r.unavailable.since || 0) || 0) >= GONE_AFTER_MS;
        if (goneDue || now() - checkedAt >= RECHECK_AFTER_MS) due.push({ key, entry, id: r.videoId || key.replace(/^youtube-/, "") });
      }
      const write = (d, result) => store.put(d.key, { status: "ready", result }, { ifGeneration: d.entry.generation }).catch(() => null);
      for (let i = 0; i < due.length; i += 50) {
        const batch = due.slice(i, i + 50);
        let statuses = null;
        try { statuses = await checkVideos(batch.map((d) => d.id)); } catch { out.errors += 1; }
        for (const d of batch) {
          const r = d.entry.envelope.result;
          const at = new Date(now()).toISOString();
          const s = statuses?.[d.id];
          if (!s) {
            // 確かめられなかった：30日を過ぎた説明文・チャンネル名は外す（日付は進めない）。
            const old = now() - (Date.parse(r.snippetFetchedAt || r.catalog?.analyzedAt || 0) || 0) > SNIPPET_MAX_AGE_MS;
            if (old && (r.caption || r.channelTitle) && await write(d, { ...r, caption: "", channelTitle: "" })) out.stripped += 1;
            continue;
          }
          out.checked += 1;
          if (s.status === "public") {
            const next = { ...r, caption: s.caption || "", channelTitle: s.channelTitle || "", snippetFetchedAt: at };
            delete next.unavailable;
            if (await write(d, next)) out.refreshed += 1;
          } else if (r.unavailable && now() - Date.parse(r.unavailable.since || at) >= GONE_AFTER_MS) {
            if (await store.remove(d.key, { ifGeneration: d.entry.generation }).catch(() => false)) out.removed += 1;
          } else if (await write(d, { ...r, caption: "", channelTitle: "", snippetFetchedAt: at, unavailable: { reason: s.status, since: r.unavailable?.since || at } })) out.unavailable += 1;
        }
      }
      return out;
    },
    // 動画から読んだ結果がもうあるか（あれば回数を使わずに返せる）。ボタンを押す前の確認用。
    async videoRead(rawUrl) {
      required();
      const current = await store.get(`youtube-${extractYouTubeVideoId(rawUrl)}`);
      const result = current?.envelope.status === "ready" ? current.envelope.result : null;
      return !!result && (result.catalog?.extractorVersion || 1) >= EXTRACTOR_VERSION && String(result.analyzedFrom || "").startsWith("video");
    },
    async get(id) {
      required();
      if (!/^youtube-[\w-]{11}$/.test(id)) throw new ApiError(400, "invalid_catalog_id", "レシピIDが正しくありません。");
      const entry = await store.get(id);
      if (entry?.envelope.status !== "ready" || entry.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "分析済みレシピがありません。");
      const result = structuredClone(entry.envelope.result);
      if (now() - Date.parse(result.snippetFetchedAt || result.catalog?.analyzedAt || 0) > SNIPPET_MAX_AGE_MS) Object.assign(result, { caption: "", channelTitle: "" });
      return result;
    },
    async propose(body) {
      required();
      const id = String(body?.catalogId || "");
      if (!/^youtube-[\w-]{11}$/.test(id)) throw new ApiError(400, "invalid_catalog_id", "修正対象が正しくありません。");
      const entry = await store.get(id);
      if (entry?.envelope.status !== "ready" || entry.envelope.result.catalog.revision !== body.baseRevision) throw new ApiError(409, "stale_revision", "共通レシピが更新されています。取り込み直して比較してください。");
      const reason = String(body.reason || "").trim().slice(0, 1000);
      const candidate = normalizeImportResult(body.recipe || {});
      if (!reason || !candidate.title || !candidate.ingredients.length || !candidate.steps.length) throw new ApiError(400, "invalid_correction", "修正理由・レシピ名・材料・手順が必要です。");
      const proposalId = randomUUID();
      // Never share captions, personal notes, images, tags or household data.
      const changes = { title: candidate.title, ingredients: candidate.ingredients, steps: candidate.steps, sourceServings: candidate.sourceServings };
      const written = await store.put(`proposals/${proposalId}`, { status: "pending", catalogId: id, baseRevision: body.baseRevision, reason, changes, createdAt: new Date(now()).toISOString() }, { ifGeneration: 0 });
      if (!written) throw new ApiError(409, "proposal_conflict", "提案を保存できませんでした。再試行してください。");
      return { proposalId, status: "pending" };
    },
    async review(proposalId, decision) {
      required();
      if (!/^[a-f0-9-]{36}$/.test(proposalId) || !["approve", "reject"].includes(decision)) throw new ApiError(400, "invalid_review", "審査内容が正しくありません。");
      const key = `proposals/${proposalId}`;
      const proposal = await store.get(key);
      if (!proposal) throw new ApiError(404, "proposal_not_found", "修正提案がありません。");
      if (proposal.envelope.status !== "pending") return { status: proposal.envelope.status };
      const p = proposal.envelope;
      const reviewClaim = await store.put(key, { ...p, status: "reviewing", decision }, { ifGeneration: proposal.generation });
      if (!reviewClaim) throw new ApiError(409, "review_conflict", "別の審査が進行中です。");
      if (decision === "approve") {
        const current = await store.get(p.catalogId);
        if (current?.envelope.result?.catalog.revision !== p.baseRevision) {
          await store.put(key, p, { ifGeneration: reviewClaim.generation });
          throw new ApiError(409, "stale_revision", "元の版が変更されています。再確認してください。");
        }
        const result = { ...current.envelope.result, ...p.changes, catalog: { ...current.envelope.result.catalog, revision: randomUUID(), previousRevision: p.baseRevision, correctedAt: new Date(now()).toISOString(), proposalId } };
        if (!await store.put(`versions/${result.catalog.revision}`, result, { ifGeneration: 0 })) throw new Error("Revision collision");
        if (!await store.put(p.catalogId, { status: "ready", result }, { ifGeneration: current.generation })) {
          await store.put(key, p, { ifGeneration: reviewClaim.generation });
          throw new ApiError(409, "catalog_conflict", "他の修正が先に反映されました。");
        }
      }
      const status = decision === "approve" ? "approved" : "rejected";
      if (!await store.put(key, { ...p, status, reviewedAt: new Date(now()).toISOString() }, { ifGeneration: reviewClaim.generation })) throw new ApiError(409, "review_conflict", "審査状態を再確認してください。");
      return { status };
    }
  };
}
