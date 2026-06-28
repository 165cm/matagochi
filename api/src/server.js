import express from "express";
import { analyzeRecipeDescription } from "./analyzer.js";
import { isOriginAllowed, parseAllowedOrigins } from "./cors.js";
import { toErrorResponse } from "./errors.js";
import { importYouTubeRecipe, requireAnalyzer } from "./importRecipe.js";

export function createApp(env = process.env) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));
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
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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
