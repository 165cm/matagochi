import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createRecipeCatalog, createRecipeStore } from "./recipeCatalog.js";
import { createImageImporter } from "./imageImport.js";
import { analyzeRecipeDescription, analyzeRecipeImages } from "./analyzer.js";
import { isOriginAllowed, parseAllowedOrigins } from "./cors.js";
import { toErrorResponse } from "./errors.js";
import { importYouTubeRecipe, requireAnalyzer } from "./importRecipe.js";
import { getSyncRoom, putSyncRoom } from "./sync.js";
import { createSyncStore } from "./syncStore.js";
import { fetchTikTokOEmbed } from "./tiktok.js";
import { extractYouTubePlaylistId, fetchYouTubePlaylist } from "./youtube.js";

export function createApp(env = process.env, deps = {}) {
  const app = express();
  const syncStore = "syncStore" in deps ? deps.syncStore : createSyncStore(env);
  const recipeStore = deps.recipeStore ?? createRecipeStore(env);
  const catalog = createRecipeCatalog(recipeStore,
    deps.importRecipe || ((url) => importYouTubeRecipe(url, {
      analyzeRecipeDescription: requireAnalyzer((snippet) => analyzeRecipeDescription(snippet, env))
    })), { model: env.GEMINI_MODEL || "gemini-2.5-flash",
      dailyLimit: Number(env.AI_DAILY_LIMIT || 100), monthlyLimit: Number(env.AI_MONTHLY_LIMIT || 1000),
      enabled: env.AI_IMPORT_ENABLED !== "false" });
  const importImages = createImageImporter({ store: recipeStore, analyze: deps.analyzeImages || ((images) => analyzeRecipeImages(images, env)), reserveBudget: () => catalog.reserveAnalysisBudget() });
  // Bounded per-instance abuse guard; the catalog additionally enforces shared AI budgets.
  app.use(createCorsMiddleware(env));
  const requestWindows = new Map();
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api/")) return next();
    const now = Date.now();
    for (const [ip, entry] of requestWindows) if (entry.resetAt <= now) requestWindows.delete(ip);
    const ip = req.ip;
    const entry = requestWindows.get(ip) || { count: 0, resetAt: now + 60_000 };
    if ((!requestWindows.has(ip) && requestWindows.size >= 10_000) || ++entry.count > 60) {
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
    res.json({ ok: true });
  });

  app.post("/api/import/youtube", async (req, res) => {
    try {
      const result = await catalog.import(req.body?.url);
      res.json(result);
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json(body);
    }
  });

  // AI解析は行わず、再生リスト内の動画情報だけを返す（解析は1品ずつ既存の取り込みで行う）
  app.post("/api/import/youtube/playlist", async (req, res) => {
    try {
      const playlistId = extractYouTubePlaylistId(req.body?.url);
      res.json(await (deps.fetchPlaylist || ((id) => fetchYouTubePlaylist(id, env)))(playlistId));
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
