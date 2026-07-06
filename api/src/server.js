import express from "express";
import { analyzeRecipeDescription } from "./analyzer.js";
import { isOriginAllowed, parseAllowedOrigins } from "./cors.js";
import { toErrorResponse } from "./errors.js";
import { importYouTubeRecipe, requireAnalyzer } from "./importRecipe.js";
import { getSyncRoom, putSyncRoom } from "./sync.js";
import { createSyncStore } from "./syncStore.js";
import { fetchTikTokOEmbed } from "./tiktok.js";

export function createApp(env = process.env, deps = {}) {
  const app = express();
  const syncStore = "syncStore" in deps ? deps.syncStore : createSyncStore(env);
  const defaultJson = express.json({ limit: "64kb" });
  // 同期データは料理写真(data URL)を含むため、同期ルートだけ上限を広げる
  const syncJson = express.json({ limit: "24mb" });
  app.use((req, res, next) => {
    const parser = req.path.startsWith("/api/sync/") ? syncJson : defaultJson;
    parser(req, res, next);
  });
  app.use(createCorsMiddleware(env));

  app.get("/health", (req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/import/youtube", async (req, res) => {
    try {
      const analyzer = requireAnalyzer((snippet) => analyzeRecipeDescription(snippet, env));
      const result = await importYouTubeRecipe(req.body?.url, { analyzeRecipeDescription: analyzer });
      res.json(result);
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
