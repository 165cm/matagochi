import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createRecipeCatalog, createRecipeStore } from "./recipeCatalog.js";
import { createTicketBook } from "./tickets.js";
import { createImageImporter } from "./imageImport.js";
import { analyzeRecipeDescription, analyzeRecipeImages, analyzeRecipeVideo } from "./analyzer.js";
import { isOriginAllowed, parseAllowedOrigins } from "./cors.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { buildCaption, importYouTubeRecipe, normalizeImportResult, requireAnalyzer } from "./importRecipe.js";
import { getSyncRoom, putSyncRoom } from "./sync.js";
import { createSyncStore } from "./syncStore.js";
import { fetchTikTokOEmbed } from "./tiktok.js";
import { canonicalYouTubeUrl, extractYouTubePlaylistId, extractYouTubeVideoId, fetchYouTubePlaylist, fetchYouTubeSnippet } from "./youtube.js";

export function createApp(env = process.env, deps = {}) {
  const app = express();
  const syncStore = "syncStore" in deps ? deps.syncStore : createSyncStore(env);
  const recipeStore = deps.recipeStore ?? createRecipeStore(env);
  const tickets = recipeStore ? createTicketBook(recipeStore, { now: deps.now || Date.now, startTickets: Number(env.START_TICKETS || 25) }) : null;
  const catalog = createRecipeCatalog(recipeStore,
    deps.importRecipe || ((url, options = {}) => importYouTubeRecipe(url, {
      analyzeRecipeVideo: env.VIDEO_ANALYSIS_ENABLED === "false" ? undefined : (videoUrl, snippet, videoOptions) => analyzeRecipeVideo(videoUrl, snippet, env, videoOptions),
      analyzeRecipeDescription: requireAnalyzer((snippet) => analyzeRecipeDescription(snippet, env))
    }, { ...options, videoMaxSeconds: Number(env.VIDEO_MAX_SECONDS || 600) })), { model: env.GEMINI_MODEL || "gemini-2.5-flash",
      dailyLimit: Number(env.AI_DAILY_LIMIT || 100), monthlyLimit: Number(env.AI_MONTHLY_LIMIT || 1000),
      enabled: env.AI_IMPORT_ENABLED !== "false",
      tickets,
      refreshSnippet: async (videoId) => { const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId, env); return { caption: buildCaption(snippet), channelTitle: snippet.channelTitle }; } });
  const importImages = createImageImporter({ store: recipeStore, analyze: deps.analyzeImages || ((images) => analyzeRecipeImages(images, env)), reserveBudget: () => catalog.reserveAnalysisBudget() });
  // Bounded per-instance abuse guard; the catalog additionally enforces shared AI budgets.
  app.use(createCorsMiddleware(env));
  const requestWindows = new Map();
  const playlistRequests = new Map();
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const now = Date.now();
    for (const [ip, entry] of requestWindows) if (entry.resetAt <= now) requestWindows.delete(ip);
    const ip = req.ip;
    const entry = requestWindows.get(ip) || { count: 0, resetAt: now + 60_000 };
    if (req.path === "/api/import/youtube/playlist") entry.playlists = (entry.playlists || 0) + 1;
    if ((req.path === "/api/import/youtube/playlist" && (entry.playlists || 0) > 6) || (!requestWindows.has(ip) && requestWindows.size >= 10_000) || ++entry.count > 60) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: { code: "rate_limit", message: "アクセスが集中しています。1分後にお試しください。" } });
    }
    requestWindows.set(ip, entry);
    next();
  });
  const defaultJson = express.json({ limit: "64kb" });
  // 同期データは料理写真(data URL)を含むため、同期ルートだけ上限を広げる
  const syncJson = express.json({ limit: "24mb" });
  const imageJson = express.json({ limit: "7mb" });
  app.use((req, res, next) => {
    const parser = req.path === "/api/import/images" ? imageJson : req.path.startsWith("/api/sync/") ? syncJson : defaultJson;
    parser(req, res, next);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, capabilities: { playlistImport: true, videoAnalysis: env.VIDEO_ANALYSIS_ENABLED !== "false" },
      models: { text: env.GEMINI_MODEL || "gemini-2.5-flash", video: env.GEMINI_VIDEO_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash" } });
  });

  // 家庭の識別子（同期ルームIDか端末ID）と、開発用コード。動画読み取りのチケットに使う。
  const devCode = String(env.DEV_UNLOCK_CODE || "886");
  const idOf = (value) => { const h = String(value || ""); return /^[\w-]{8,80}$/.test(h) ? h : ""; };
  const householdOf = (req) => idOf(req.get("x-household"));
  const unlimitedOf = (req) => !!devCode && String(req.get("x-dev-code") || "") === devCode;
  // 新しい財布（25枚）を作れるのは、1つの接続元から1日10個まで。
  const walletCreations = new Map();
  const walletFor = async (req) => {
    const household = householdOf(req), unlimited = unlimitedOf(req);
    if (!tickets || !household) return null;
    const day = new Date().toISOString().slice(0, 10);
    const made = walletCreations.get(req.ip);
    const count = made?.day === day ? made.count : 0;
    const view = await tickets.get(household, { prev: idOf(req.get("x-household-prev")), unlimited, create: count < 10 });
    if (view.created) { if (walletCreations.size > 10_000) walletCreations.clear(); walletCreations.set(req.ip, { day, count: count + 1 }); }
    return view;
  };
  const ticketsView = async (req) => walletFor(req).catch(() => null);
  app.get("/api/tickets", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const view = await walletFor(req);
      if (!view) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      res.json({ tickets: view });
    } catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });
  app.post("/api/tickets/claim", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const household = householdOf(req);
      if (!tickets || !household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      const { granted, wallet } = await tickets.claim(household, req.body?.claims);
      res.json({ granted, tickets: tickets.view(wallet, unlimitedOf(req)) });
    } catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });
  app.post("/api/import/youtube", async (req, res) => {
    const household = householdOf(req), unlimited = unlimitedOf(req);
    const quota = () => ticketsView(req);
    try {
      const result = await catalog.import(req.body?.url, { forceVideo: req.body?.mode === "video", household, unlimited });
      res.json({ ...result, tickets: await quota() });
    } catch (error) {
      // AI分析が失敗・上限・停止中でも、動画のタイトルと説明文は返す。材料はアプリ側で説明文から読み取る。
      // チケットがない時は、そのことを知らせる（保存済みの結果には触れていない）。
      if (!["invalid_url", "unsupported_url", "no_tickets"].includes(error.code)) {
        console.error(JSON.stringify({ event: "youtube_import_failed", code: error.code || "unknown", message: String(error.message || "").slice(0, 200) }));
        try {
          const videoId = extractYouTubeVideoId(req.body?.url);
          const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId, env);
          return res.json({ ...normalizeImportResult({ title: snippet.title, caption: buildCaption(snippet), source: /youtube\.com\/shorts\//i.test(req.body?.url || "") ? "YouTube Shorts" : "YouTube", videoId, videoUrl: canonicalYouTubeUrl(videoId, req.body?.url || ""), channelTitle: snippet.channelTitle, channelId: snippet.channelId }), analysis: { ok: false, code: error.code || "unknown" }, videoSkipped: req.body?.mode !== "video", tickets: await quota() });
        } catch (fallbackError) {
          console.error(JSON.stringify({ event: "youtube_snippet_failed", code: fallbackError.code || "unknown", message: String(fallbackError.message || "").slice(0, 200) }));
        }
      }
      const { status, body } = toErrorResponse(error);
      res.status(status).json(error.code === "no_tickets" ? { ...body, tickets: await quota() } : body);
    }
  });

  // AI解析は行わず、再生リスト内の動画情報だけを返す（解析は1品ずつ既存の取り込みで行う）
  app.post("/api/import/youtube/playlist", async (req, res) => {
    try {
      const playlistId = extractYouTubePlaylistId(req.body?.url);
      res.setHeader("Cache-Control", "no-store");
      const now = Date.now();
      for (const [id, entry] of playlistRequests) if (entry.expires <= now) playlistRequests.delete(id);
      let entry = playlistRequests.get(playlistId);
      if (!entry) {
        if (playlistRequests.size >= 100) throw new ApiError(429,"playlist_busy","再生リストの読み込みが混み合っています。少し待ってお試しください。");
        entry = {expires:now+300_000};
        entry.promise = Promise.resolve().then(()=> (deps.fetchPlaylist || ((id)=>fetchYouTubePlaylist(id,env)))(playlistId));
        playlistRequests.set(playlistId,entry);
        entry.promise.catch(()=>{ if (playlistRequests.get(playlistId) === entry) playlistRequests.delete(playlistId); });
      }
      res.json(await entry.promise);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.post("/api/import/images", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json(await importImages(req.body)); }
    catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try { res.json(await catalog.get(req.params.id)); }
    catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });

  app.post("/api/recipes/corrections", async (req, res) => {
    try {
      res.status(201).json(await catalog.propose(req.body));
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.post("/api/admin/corrections/:id/review", async (req, res) => {
    const expected = Buffer.from(env.RECIPE_ADMIN_TOKEN || "");
    const supplied = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    if (!expected.length || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    }
    try {
      res.json(await catalog.review(req.params.id, req.body?.decision));
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.get("/api/oembed/tiktok", async (req, res) => {
    try {
      const result = await fetchTikTokOEmbed(req.query?.url);
      res.json(result);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.get("/api/sync/rooms/:roomId", async (req, res) => {
    try {
      const result = await getSyncRoom(syncStore, req.params.roomId);
      res.json(result);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.put("/api/sync/rooms/:roomId", async (req, res) => {
    try {
      const result = await putSyncRoom(syncStore, req.params.roomId, req.body);
      res.json(result);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  app.use((error, req, res, next) => {
    if (error.type === "entity.too.large") return res.status(413).json({ error: { code: "request_too_large", message: "送信データが大きすぎます。" } });
    if (error instanceof SyntaxError) return res.status(400).json({ error: { code: "invalid_json", message: "JSONの形式が正しくありません。" } });
    const { status, body } = toErrorResponse(error);
    res.status(status).json(body);
  });
  return app;
}

function createCorsMiddleware(env) {
  const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);

  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, allowedOrigins)) {
      res.status(403).json({ error: { code: "origin_not_allowed", message: "許可されていないOriginです。" } });
      return;
    }

    if (origin && (!allowedOrigins.size || allowedOrigins.has(origin))) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Household, X-Household-Prev, X-Dev-Code");

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  };
}

const port = Number(process.env.PORT || 8080);
if (process.env.NODE_ENV !== "test") {
  createApp().listen(port, () => {
    console.log(`matagochi-api listening on ${port}`);
  });
}
