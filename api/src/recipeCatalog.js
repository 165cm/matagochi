import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { createGcsSyncStore, createMemorySyncStore } from "./syncStore.js";
import { extractYouTubeVideoId, canonicalYouTubeUrl } from "./youtube.js";
import { normalizeImportResult } from "./importRecipe.js";

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
export function createRecipeCatalog(store, analyze, { model = "unknown", now = Date.now, dailyLimit = 100, monthlyLimit = 1000, enabled = true, videoDailyLimit = 3, refreshSnippet = null } = {}) {
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
  // 動画の読み取りは家庭ごとに1日 videoDailyLimit 本まで（開発用コードで解除）。
  async function reserveVideo(household, unlimited) {
    if (unlimited) return;
    if (!household) throw new ApiError(429, "video_quota", `今日の動画読み取り（${videoDailyLimit}本）を使い切りました。`);
    const key = `video-quota/${new Date(now()).toISOString().slice(0, 10)}/${household}`;
    for (let attempt = 0; attempt < 8; attempt++) {
      const entry = await store.get(key);
      const used = entry?.envelope.used || 0;
      if (used >= videoDailyLimit) throw new ApiError(429, "video_quota", `今日の動画読み取り（${videoDailyLimit}本）を使い切りました。明日また使えます。`);
      if (await store.put(key, { used: used + 1 }, { ifGeneration: entry?.generation ?? 0 })) return;
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  async function videoQuota(household, unlimited) {
    if (!store) return null;
    if (unlimited) return { used: 0, limit: videoDailyLimit, unlimited: true };
    const entry = household ? await store.get(`video-quota/${new Date(now()).toISOString().slice(0, 10)}/${household}`) : null;
    return { used: entry?.envelope.used || 0, limit: videoDailyLimit, unlimited: false };
  }
  // YouTube APIで取得した説明文などは30日を超えて持たない：古ければ取り直し、取れなければ消す。
  async function refreshed(key, current) {
    const result = current.envelope.result;
    const fetchedAt = Date.parse(result.snippetFetchedAt || result.catalog?.analyzedAt || 0);
    if (now() - fetchedAt <= SNIPPET_MAX_AGE_MS) return result;
    let next = { ...result, caption: "", channelTitle: "", snippetFetchedAt: new Date(now()).toISOString() };
    try {
      const fresh = await refreshSnippet?.(result.videoId || key.replace(/^youtube-/, ""));
      if (fresh) next = { ...next, caption: fresh.caption || "", channelTitle: fresh.channelTitle || "" };
    } catch {}
    await store.put(key, { status: "ready", result: next }, { ifGeneration: current.generation }).catch(() => {});
    return next;
  }
  async function run(id, { forceVideo = false, household = "", unlimited = false } = {}) {
    required();
    const key = `youtube-${id}`;
    const current = await store.get(key);
    // 古い抽出方式の結果は、作り方の質が低いことがあるので一度だけ読み直す。
    const fresh = (current?.envelope.result?.catalog?.extractorVersion || 1) >= EXTRACTOR_VERSION;
    // 「動画から読み直す」：すでに動画から読んだ結果があれば、同じ結果になるので再解析しない（費用をかけない）。
    const fromVideo = String(current?.envelope.result?.analyzedFrom || "").startsWith("video");
    if (current?.envelope.status === "ready" && fresh && (!forceVideo || fromVideo)) return { ...structuredClone(await refreshed(key, current)), cacheHit: true };
    // 読み直しは、枠を先に確かめる（枠がなければ保存済みの結果には触れない）。
    if (forceVideo) await reserveVideo(household, unlimited);
    // A claim older than STALE_PENDING_MS cannot still be waiting on the AI (timeout is 60s), so it may be retried.
    const stale = current?.envelope.status === "pending" && now() - Date.parse(current.envelope.startedAt || 0) > STALE_PENDING_MS;
    if (current?.envelope.status === "pending" && !stale) throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。");
    if (current?.envelope.retryAt > now()) throw new ApiError(429, "analysis_cooldown", "分析に失敗したため、1分ほど待ってから再試行してください。");
    const claim = await store.put(key, { status: "pending", startedAt: new Date(now()).toISOString() }, { ifGeneration: current?.generation ?? 0 });
    if (!claim) throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。");
    try {
      await reserveBudget();
      const raw = await analyze(canonicalYouTubeUrl(id), { reserveBudget, forceVideo, reserveVideo: forceVideo ? null : () => reserveVideo(household, unlimited) });
      const result = { ...normalizeImportResult(raw), analyzedFrom: ["video", "video-clip"].includes(raw?.analyzedFrom) ? raw.analyzedFrom : "description" };
      if (!result.title || !result.ingredients.length || !result.steps.length) {
        const error = new ApiError(422, "incomplete_recipe", "材料や手順を読み取れませんでした。手動入力をご利用ください。");
        error.videoLimited = !!raw?.videoLimited;
        throw error;
      }
      result.catalog = { id: key, revision: randomUUID(), analyzedAt: new Date(now()).toISOString(), model, extractorVersion: EXTRACTOR_VERSION };
      result.snippetFetchedAt = result.catalog.analyzedAt;
      // 履歴には説明文の原文を残さない（30日ルール）。
      const revision = await store.put(`versions/${result.catalog.revision}`, { ...result, caption: "", channelTitle: "" }, { ifGeneration: 0 });
      if (!revision) throw new Error("Revision collision");
      const written = await store.put(key, { status: "ready", result }, { ifGeneration: claim.generation });
      if (!written) throw new ApiError(409, "catalog_conflict", "分析結果が更新されました。再取得してください。");
      return { ...structuredClone(result), cacheHit: false, videoLimited: !!raw?.videoLimited };
    } catch (error) {
      if (error.code === "analysis_uncertain") throw error;
      // 読み直しに失敗しても、保存済みの結果は消さない。
      if (current?.envelope.status === "ready") await store.put(key, current.envelope, { ifGeneration: claim.generation }).catch(() => {});
      else await store.put(key, { status: "failed", retryAt: now() + 60_000 }, { ifGeneration: claim.generation }).catch(() => {});
      throw error;
    }
  }
  return {
    async reserveAnalysisBudget() { required(); await reserveBudget(); },
    videoQuota,
    async import(rawUrl, { forceVideo = false, household = "", unlimited = false } = {}) {
      const id = extractYouTubeVideoId(rawUrl);
      const key = forceVideo ? `${id}:video:${household}` : id;
      if (!inFlight.has(key)) inFlight.set(key, run(id, { forceVideo, household, unlimited }).finally(() => inFlight.delete(key)));
      return structuredClone(await inFlight.get(key));
    },
    async get(id) {
      required();
      if (!/^youtube-[\w-]{11}$/.test(id)) throw new ApiError(400, "invalid_catalog_id", "レシピIDが正しくありません。");
      const entry = await store.get(id);
      if (entry?.envelope.status !== "ready") throw new ApiError(404, "recipe_not_found", "分析済みレシピがありません。");
      return structuredClone(entry.envelope.result);
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
