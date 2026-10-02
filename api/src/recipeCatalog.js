import { randomUUID } from "node:crypto";
import { cleanDishName } from "./dishes.js";
import { ApiError } from "./errors.js";
import { createGcsSyncStore, createMemorySyncStore } from "./syncStore.js";
import { extractYouTubeVideoId, canonicalYouTubeUrl } from "./youtube.js";
import { normalizeImportResult } from "./importRecipe.js";
import { localizeRecipe } from "./units.js";

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
const UNAVAILABLE = { not_found: ["video_not_found", 404, "YouTube動画が見つかりませんでした。"], non_public: ["non_public_video", 422, "この動画はいま公開されていません。"] };
export function createRecipeCatalog(store, analyze, { model = "unknown", now = Date.now, dailyLimit = 100, monthlyLimit = 1000, enabled = true, tickets = null, refreshSnippet = null, checkVideos = null } = {}) {
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
  async function run(id, { forceVideo = false, household = "", unlimited = false, aiGate = null } = {}) {
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
    if (current?.envelope.status === "ready" && fresh && (!forceVideo || fromVideo)) {
      const result = await refreshed(key, current);
      if (result.unavailable) throw unavailableError(result);
      return { ...localizeRecipe(structuredClone(result)), cacheHit: true };
    }
    // 動画の読み取りは、ボタンを押した時だけ。チケットを先に1枚使う（なければ保存済みの結果には触れない）。
    // 誰かがもう動画から読んだ動画なら、上で保存済みの結果を返すのでチケットは使わない。
    let spent = false;
    if (forceVideo) { if (!tickets) throw new ApiError(503, "catalog_not_configured", "チケットの保存先が未設定です。"); await tickets.spend(household, { unlimited }); spent = !unlimited; }
    const refund = async () => { if (spent) { spent = false; await tickets.refund(household, { unlimited }).catch(() => {}); } };
    // A claim older than STALE_PENDING_MS cannot still be waiting on the AI (timeout is 60s), so it may be retried.
    const stale = current?.envelope.status === "pending" && now() - Date.parse(current.envelope.startedAt || 0) > STALE_PENDING_MS;
    if (current?.envelope.status === "pending" && !stale) { await refund(); throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。"); }
    // 説明文で失敗した直後でも、動画から読むのは待たせない（チケットを使う操作なので連打にはならない）。
    if (!forceVideo && current?.envelope.retryAt > now()) { await refund(); throw new ApiError(429, "analysis_cooldown", "分析に失敗したため、1分ほど待ってから再試行してください。"); }
    const claim = await store.put(key, { status: "pending", startedAt: new Date(now()).toISOString() }, { ifGeneration: current?.generation ?? 0 });
    if (!claim) { await refund(); throw new ApiError(409, "analysis_pending", "このURLは分析中です。しばらくしてから再取得してください。"); }
    try {
      // 説明欄の読み取り・動画の読み取り・チャプターとの対応付けの、それぞれの直前に gate を通す。
      await gate();
      const raw = await analyze(canonicalYouTubeUrl(id), { reserveBudget: gate, forceVideo });
      const result = { ...normalizeImportResult(raw), analyzedFrom: ["video", "video-clip"].includes(raw?.analyzedFrom) ? raw.analyzedFrom : "description" };
      // 運営が直した料理名は、読み直しても引き継ぐ（AI の新しい料理名で上書きしない。空＝題名で決める、も含めて）。
      const before = current?.envelope.status === "ready" ? current.envelope.result : null;
      if (before?.dishNameFrom === "admin") { if (before.dishName) result.dishName = before.dishName; else delete result.dishName; result.dishNameFrom = "admin"; }
      // 動画から作り方を読めなかったら、チケットは戻す。
      if (!result.analyzedFrom.startsWith("video")) await refund();
      // 取り込みは説明文だけで読む。作り方がなくても材料があれば保存し、動画はボタンで読む。
      if (!result.title || !result.ingredients.length || (!result.steps.length && (forceVideo || !raw?.videoSkipped))) {
        const error = new ApiError(422, "incomplete_recipe", "材料や手順を読み取れませんでした。手動入力をご利用ください。");
        throw error;
      }
      result.catalog = { id: key, revision: randomUUID(), analyzedAt: new Date(now()).toISOString(), model, extractorVersion: EXTRACTOR_VERSION };
      result.snippetFetchedAt = result.catalog.analyzedAt;
      // 履歴には説明文の原文を残さない（30日ルール）。
      const revision = await store.put(`versions/${result.catalog.revision}`, { ...result, caption: "", channelTitle: "" }, { ifGeneration: 0 });
      if (!revision) throw new Error("Revision collision");
      const written = await store.put(key, { status: "ready", result }, { ifGeneration: claim.generation });
      if (!written) throw new ApiError(409, "catalog_conflict", "分析結果が更新されました。再取得してください。");
      return { ...structuredClone(result), cacheHit: false, videoSkipped: !!raw?.videoSkipped, ticketUsed: spent };
    } catch (error) {
      await refund();
      if (error.code === "analysis_uncertain") throw error;
      // 読み直しに失敗しても、保存済みの結果は消さない。
      if (current?.envelope.status === "ready") await store.put(key, current.envelope, { ifGeneration: claim.generation }).catch(() => {});
      else await store.put(key, { status: "failed", retryAt: now() + 60_000 }, { ifGeneration: claim.generation }).catch(() => {});
      throw error;
    }
  }
  return {
    async reserveAnalysisBudget() { required(); await reserveBudget(); },
    async import(rawUrl, { forceVideo = false, household = "", unlimited = false, aiGate = null } = {}) {
      const id = extractYouTubeVideoId(rawUrl);
      const key = forceVideo ? `${id}:video:${household}` : id;
      if (!inFlight.has(key)) inFlight.set(key, run(id, { forceVideo, household, unlimited, aiGate }).finally(() => inFlight.delete(key)));
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
    async setStepTimes(rawUrl, stepTimes) {
      required();
      const key = `youtube-${extractYouTubeVideoId(rawUrl)}`;
      const current = await store.get(key);
      if (current?.envelope.status !== "ready" || current.envelope.result?.unavailable) throw new ApiError(404, "recipe_not_found", "読み取り済みのレシピが見つかりません。");
      const result = structuredClone(current.envelope.result);
      const count = (result.steps || []).length;
      const raw = Array.isArray(stepTimes) ? stepTimes : [];
      result.stepTimes = Array.from({ length: count }, (_, i) => { const t = raw[i]; return t === null || t === undefined || t === "" || !Number.isFinite(Number(t)) || Number(t) < 0 || Number(t) >= 36_000 ? null : Math.floor(Number(t)); });
      result.stepTimesFrom = "admin";
      if (!(await store.put(key, { ...current.envelope, result }, { ifGeneration: current.generation }))) throw new ApiError(409, "catalog_conflict", "ほかの更新と重なりました。もう一度保存してください。");
      return { stepTimes: result.stepTimes };
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
    // 動画から読んだ結果がもうあるか（あればチケットなしで返せる）。ボタンを押す前の確認用。
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
