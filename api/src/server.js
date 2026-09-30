import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createRecipeCatalog, createRecipeStore } from "./recipeCatalog.js";
import { createTicketBook, START_TICKETS } from "./tickets.js";
import { createAuth } from "./auth.js";
import { createTrendBook } from "./trends.js";
import { createPopularBook } from "./popular.js";
import { createCreatorDesk } from "./creators.js";
import { createCreatorAuth } from "./creatorAuth.js";
import { createTimecodeBook } from "./timecodes.js";
import { createImageImporter } from "./imageImport.js";
import { analyzeRecipeDescription, analyzeRecipeImages, analyzeRecipeVideo, analyzeStepTimes, matchStepsToChapters, writeCatchCopies, judgeDishPhoto, drawMenuBoard, checkMenuBoard, describeMenu } from "./analyzer.js";
import { createSkillJudge } from "./skillPhoto.js";
import { createVariantSearch } from "./variants.js";
import { createPushDesk } from "./push.js";
import { createWeeklyMenu } from "./weeklyMenu.js";
import { createFeedbackDesk } from "./feedback.js";
import { createUsageBook } from "./usage.js";
import { isOriginAllowed, parseAllowedOrigins } from "./cors.js";
import { ApiError, toErrorResponse } from "./errors.js";
import { buildCaption, importYouTubeRecipe, normalizeImportResult, requireAnalyzer } from "./importRecipe.js";
import { getSyncPhoto, getSyncRoom, putSyncPhoto, putSyncRoom } from "./sync.js";
import { gzipSync } from "node:zlib";
import { createPhotoStore, createSyncStore } from "./syncStore.js";
import { fetchTikTokOEmbed } from "./tiktok.js";
import { canonicalYouTubeUrl, extractYouTubePlaylistId, extractYouTubeVideoId, fetchYouTubePlaylist, fetchYouTubeSnippet, searchYouTubeRecipes, searchYouTubeChannels, fetchChannelUploads, fetchChannelIcons, resolveYouTubeChannel, fetchYouTubeStatuses } from "./youtube.js";
import { createHousekeeping } from "./housekeeping.js";

export function createApp(env = process.env, deps = {}) {
  const app = express();
  const syncStore = "syncStore" in deps ? deps.syncStore : createSyncStore(env);
  const photoStore = "photoStore" in deps ? deps.photoStore : createPhotoStore(env);
  const recipeStore = deps.recipeStore ?? createRecipeStore(env);
  const auth = createAuth(recipeStore, env, { sendMail: deps.sendMail, fetch: deps.fetch || globalThis.fetch, now: deps.now || Date.now });
  const tickets = recipeStore ? createTicketBook(recipeStore, { now: deps.now || Date.now, startTickets: Number(env.START_TICKETS || START_TICKETS) }) : null;
  const catalog = createRecipeCatalog(recipeStore,
    deps.importRecipe || ((url, options = {}) => importYouTubeRecipe(url, {
      analyzeRecipeVideo: env.VIDEO_ANALYSIS_ENABLED === "false" ? undefined : (videoUrl, snippet, videoOptions) => analyzeRecipeVideo(videoUrl, snippet, env, videoOptions),
      analyzeRecipeDescription: requireAnalyzer((snippet) => analyzeRecipeDescription(snippet, env)),
      matchStepsToChapters: env.GOOGLE_CLOUD_PROJECT ? (steps, chapters) => matchStepsToChapters(steps, chapters, env) : undefined
    }, { ...options, videoMaxSeconds: Number(env.VIDEO_MAX_SECONDS || 600) })), { model: env.GEMINI_MODEL || "gemini-2.5-flash",
      dailyLimit: Number(env.AI_DAILY_LIMIT || 100), monthlyLimit: Number(env.AI_MONTHLY_LIMIT || 1000),
      enabled: env.AI_IMPORT_ENABLED !== "false",
      tickets,
      refreshSnippet: async (videoId) => { const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId, env); return { caption: buildCaption(snippet), channelTitle: snippet.channelTitle }; },
      // 定期の後片付け：保存済みの動画が、いまも公開されているかをまとめて確かめる（50本で1回）。
      checkVideos: async (ids) => Object.fromEntries(Object.entries(await (deps.fetchYouTubeStatuses || fetchYouTubeStatuses)(ids, env)).map(([id, v]) => [id, v.status === "public" ? { status: "public", caption: buildCaption(v.snippet), channelTitle: v.snippet.channelTitle } : { status: v.status }])) });
  const timecodeBook = createTimecodeBook(recipeStore, { analyze: deps.analyzeStepTimes || ((url, steps, o) => analyzeStepTimes(url, steps, env, o)), reserveBudget: () => catalog.reserveAnalysisBudget(),
    matchChapters: deps.matchStepsToChapters || ((steps, chapters) => matchStepsToChapters(steps, chapters, env)),
    snippet: async (id) => (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(id, env), maxSeconds: Number(env.VIDEO_MAX_SECONDS || 600), now: deps.now || Date.now });
  const creatorAuth = createCreatorAuth(recipeStore, { clientId: env.GOOGLE_CLIENT_ID || "", fetch: deps.fetch || globalThis.fetch, now: deps.now || Date.now });
  const creatorDesk = createCreatorDesk(recipeStore, { resolveChannel: deps.resolveChannel || ((x) => resolveYouTubeChannel(x, env)), now: deps.now || Date.now });
  const trendBook = createTrendBook(recipeStore, { catalog, optedOut: () => creatorDesk.optedOut(), search: deps.searchRecipes || ((q, o) => searchYouTubeRecipes(q, o, env)),
    searchChannels: deps.searchChannels || ((q) => searchYouTubeChannels(q, env)), channelUploads: deps.channelUploads || ((id, o) => fetchChannelUploads(id, o, env)), channelIcons: deps.channelIcons || ((ids) => fetchChannelIcons(ids, env)), writeCatches: deps.writeCatches || (env.GOOGLE_CLOUD_PROJECT ? (items) => writeCatchCopies(items, env) : undefined), reserveBudget: () => catalog.reserveAnalysisBudget(), now: deps.now || Date.now, dailyLimit: Number(env.AI_DAILY_LIMIT || 100),
    ...(Number(env.TREND_PER_DAY) > 0 ? { perDay: Number(env.TREND_PER_DAY) } : {}), ...(Number(env.TREND_WEEK_MAX) > 0 ? { weekMax: Number(env.TREND_WEEK_MAX) } : {}),
    ...(Number(env.TREND_AI_PER_DAY) > 0 ? { aiPerDay: Number(env.TREND_AI_PER_DAY) } : {}), ...(Number(env.TREND_AI_PER_WEEK) > 0 ? { aiPerWeek: Number(env.TREND_AI_PER_WEEK) } : {}) });
  const housekeeping = createHousekeeping(recipeStore, { catalog, now: deps.now || Date.now });
  const popularBook = createPopularBook(recipeStore, { catalog, now: deps.now || Date.now, optedOut: () => creatorDesk.optedOut() });
  const skillJudge = createSkillJudge(recipeStore, { judge: deps.judgeDishPhoto || ((image) => judgeDishPhoto(image, env)), reserveBudget: () => catalog.reserveAnalysisBudget(), now: deps.now || Date.now });
  const variantSearch = createVariantSearch(recipeStore, { search: deps.searchRecipes || ((q, o) => searchYouTubeRecipes(q, o, env)), optedOut: () => creatorDesk.optedOut(), now: deps.now || Date.now });
  const pushDesk = createPushDesk(recipeStore, { send: deps.sendPush, subject: env.PUSH_SUBJECT || "https://165cm.github.io/matagochi/", now: deps.now || Date.now });
  const feedbackDesk = createFeedbackDesk(recipeStore, { now: deps.now || Date.now });
  const usageBook = createUsageBook(recipeStore, { now: deps.now || Date.now });
  const weeklyMenu = createWeeklyMenu(recipeStore, { drawBoard: deps.drawMenuBoard || ((images, spec) => drawMenuBoard(images, spec, env)), check: deps.checkMenuBoard !== undefined ? deps.checkMenuBoard : ((image) => checkMenuBoard(image, env)), describe: deps.describeMenu || ((dishes) => describeMenu(dishes, env)), tickets, reserveBudget: () => catalog.reserveAnalysisBudget(), now: deps.now || Date.now });
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
  const menuJson = express.json({ limit: "10mb" });
  app.use((req, res, next) => {
    const parser = req.path === "/api/weekly/menu" ? menuJson : ["/api/import/images", "/api/skill/photo"].includes(req.path) ? imageJson : req.path.startsWith("/api/sync/") ? syncJson : defaultJson;
    parser(req, res, next);
  });

  app.get("/health", (req, res) => {
    res.json({ ok: true, capabilities: { playlistImport: true, videoAnalysis: env.VIDEO_ANALYSIS_ENABLED !== "false" },
      models: { text: env.GEMINI_MODEL || "gemini-2.5-flash", video: env.GEMINI_VIDEO_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash", menu: env.GEMINI_MENU_MODEL || "gemini-3.1-flash-image" } });
  });

  // 家庭の識別子（同期ルームIDか端末ID）と、開発用コード。動画読み取りのチケットに使う。
  const devCode = String(env.DEV_UNLOCK_CODE || "886");
  const idOf = (value) => { const h = String(value || ""); return /^[\w-]{8,80}$/.test(h) ? h : ""; };
  const householdOf = (req) => idOf(req.get("x-household"));
  const unlimitedOf = (req) => !!devCode && String(req.get("x-dev-code") || "") === devCode;
  // 新しい財布（10枚）を作れるのは、1つの接続元から1日10個まで。
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
  // ログイン
  const send = (res, work) => work.then((body) => res.json(body)).catch((error) => { const { status, body } = toErrorResponse(error); res.status(status).json(body); });
  const signedIn = async (req) => {
    const uid = await auth.verifySession(String(req.get("authorization") || "").replace(/^Bearer /, ""));
    if (!uid) throw new ApiError(401, "signed_out", "ログインし直してください。");
    return uid;
  };
  app.get("/api/auth/config", (req, res) => res.json(auth.config()));
  app.post("/api/auth/google", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, auth.google(req.body?.credential)); });
  app.post("/api/auth/email/start", (req, res) => send(res, auth.emailStart(req.body?.email)));
  app.post("/api/auth/email/verify", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, auth.emailVerify(req.body?.email, req.body?.code)); });
  app.get("/api/auth/me", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, signedIn(req).then((uid) => auth.me(uid))); });
  app.put("/api/auth/me", (req, res) => send(res, signedIn(req).then((uid) => auth.link(uid, req.body))));
  // 新着レシピ：集める（GitHubの定期実行が毎日ノックする。1日・1週の上限を超えては動かない）と、見せる（読み出すだけ）。みんなの定番も読み出すだけ。
  app.get("/api/trends", (req, res) => { res.setHeader("Cache-Control", "public, max-age=600"); send(res, trendBook.list()); });
  // 新着集めのあとに、1日1回の後片付け（YouTube API の情報を決めた期間を超えて持たない。§41）。
  app.post("/api/trends/refresh", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, trendBook.step().then(async (result) => ({ ...result, housekeeping: await housekeeping.run().catch((error) => ({ error: error?.code || "failed" })) }))); });
  app.post("/api/skill/photo", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, skillJudge.judge(req.body || {}, householdOf(req))); });
  // 通知：鍵・登録（この先のお知らせも一緒に）・解除・テスト・定期実行（GitHub Actions が15分ごとに呼ぶ）
  app.get("/api/push/key", (req, res) => { res.setHeader("Cache-Control", "public, max-age=3600"); send(res, pushDesk.publicKey()); });
  app.post("/api/push/subscribe", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, pushDesk.subscribe(req.body || {}, householdOf(req))); });
  app.post("/api/push/unsubscribe", (req, res) => send(res, pushDesk.unsubscribe(req.body || {})));
  app.post("/api/push/test", (req, res) => send(res, pushDesk.test(req.body || {})));
  app.post("/api/push/tick", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, pushDesk.tick()); });
  app.post("/api/search/variants", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, variantSearch.find(req.body || {}, householdOf(req))); });
  app.post("/api/weekly/menu", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    // 献立表の生成は止めている（WEEKLY_MENU=on のときだけ動く）。
    if (env.WEEKLY_MENU !== "on") return res.status(404).json({ error: { code: "feature_off", message: "この機能はお休み中です。" } });
    const unlimited = unlimitedOf(req);
    try {
      const { wallet, ...menu } = await weeklyMenu.make(req.body || {}, householdOf(req), { unlimited });
      res.json({ ...menu, tickets: wallet ? tickets.view(wallet, unlimited) : await ticketsView(req) });
    } catch (error) {
      const { status, body } = toErrorResponse(error);
      res.status(status).json({ ...body, ...(error.wallet ? { tickets: tickets.view(error.wallet, unlimited) } : {}) });
    }
  });
  app.post("/api/import/youtube/timecodes", (req, res) => send(res, timecodeBook.find(req.body || {}, householdOf(req))));
  app.put("/api/import/youtube/timecodes", (req, res) => send(res, timecodeBook.fix(req.body || {}, householdOf(req))));
  app.post("/api/creators/request", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, creatorDesk.request(req.body || {})); });
  // 投稿者ご本人（YouTubeでログイン）：本人確認 → 自分のチャンネルだけ、停止・再開・参加申請・参加をやめる。APP_MAP §40。
  const ownedBy = (req) => creatorAuth.channelsOf(req.get("authorization"));
  app.post("/api/creators/verify", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, creatorAuth.verify(req.body?.accessToken)); });
  app.get("/api/creators/me", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, ownedBy(req).then((owned) => creatorDesk.mine(owned))); });
  const ownerAction = { stop: (id, owned, body) => creatorDesk.ownerStop(id, owned, body), resume: (id, owned) => creatorDesk.ownerResume(id, owned), apply: (id, owned, body) => creatorDesk.apply(id, owned, body), withdraw: (id, owned) => creatorDesk.withdraw(id, owned) };
  app.post("/api/creators/me/:channelId/:action", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const act = Object.prototype.hasOwnProperty.call(ownerAction, req.params.action) ? ownerAction[req.params.action] : null;
    if (!act) return res.status(404).json({ error: { code: "not_found", message: "見つかりません。" } });
    send(res, ownedBy(req).then((owned) => act(req.params.channelId, owned, req.body || {})));
  });
  app.get("/api/popular", (req, res) => { res.setHeader("Cache-Control", "public, max-age=600"); send(res, popularBook.top(String(req.query?.segment || "any-0"))); });
  app.post("/api/popular/event", (req, res) => send(res, popularBook.record(req.body || {}, req.ip)));
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
  app.get("/api/import/youtube/status", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try { res.json({ videoRead: await catalog.videoRead(req.query?.url) }); }
    catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });
  app.post("/api/import/youtube", async (req, res) => {
    const household = householdOf(req), unlimited = unlimitedOf(req);
    const quota = () => ticketsView(req);
    try {
      const result = await catalog.import(req.body?.url, { forceVideo: req.body?.mode === "video", household, unlimited });
      // はじめの3日の取り込みボーナスのために、取り込んだ動画を数える。
      if (tickets && household) await tickets.noteImport(household, result.videoId || (() => { try { return extractYouTubeVideoId(req.body?.url); } catch { return ""; } })());
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

  const isAdmin = (req) => {
    const expected = Buffer.from(env.RECIPE_ADMIN_TOKEN || "");
    const supplied = Buffer.from(String(req.headers.authorization || "").replace(/^Bearer /, ""));
    return expected.length > 0 && expected.length === supplied.length && timingSafeEqual(expected, supplied);
  };
  // ご意見・お問い合わせ（β版の「お気持ち」から。招待コードは正式版で）
  app.post("/api/feedback", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, feedbackDesk.send(req.body || {}, householdOf(req))); });
  app.post("/api/usage", (req, res) => { res.setHeader("Cache-Control", "no-store"); send(res, usageBook.record(req.body || {})); });
  app.get("/api/admin/usage", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, usageBook.report(String(req.query?.from || ""), String(req.query?.to || "")));
  });
  app.get("/api/admin/feedback", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, feedbackDesk.list(String(req.query?.day || "")));
  });
  // 掲載停止の申し込み：確認待ち（一時的に外している）・確定・戻したチャンネルの一覧と、確かめた結果の登録。
  app.get("/api/admin/creators", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, creatorDesk.list());
  });
  app.get("/api/admin/creators/applications", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, creatorDesk.applications());
  });
  app.post("/api/admin/creators/applications/:channelId/decide", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, creatorDesk.decideApplication(req.params.channelId, req.body || {}));
  });
  app.post("/api/admin/creators/:channelId/decide", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isAdmin(req)) return res.status(403).json({ error: { code: "forbidden", message: "管理者認証が必要です。" } });
    send(res, creatorDesk.decide(req.params.channelId, req.body || {}));
  });
  app.post("/api/admin/corrections/:id/review", async (req, res) => {
    if (!isAdmin(req)) {
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

  app.get("/api/sync/rooms/:roomId/photos/:hash", async (req, res) => {
    try {
      const result = await getSyncPhoto(photoStore, req.params.roomId, req.params.hash);
      // 中身は名前（ハッシュ）で決まるので、端末側で長く持ってよい。
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.json(result);
    } catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });
  app.put("/api/sync/rooms/:roomId/photos/:hash", async (req, res) => {
    try { res.json(await putSyncPhoto(photoStore, req.params.roomId, req.params.hash, req.body)); }
    catch (error) { const { status, body } = toErrorResponse(error); res.status(status).json(body); }
  });
  app.get("/api/sync/rooms/:roomId", async (req, res) => {
    try {
      const result = await getSyncRoom(syncStore, req.params.roomId, { since: String(req.query?.since || "") });
      res.setHeader("Cache-Control", "no-store");
      // 同期データは文字が多いので、圧縮して送る（通信量が数分の1になる）。
      const json = JSON.stringify(result);
      if (json.length > 1024 && /\bgzip\b/.test(String(req.get("accept-encoding") || ""))) {
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        return res.end(gzipSync(json));
      }
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Content-Encoding, Authorization, X-Household, X-Household-Prev, X-Dev-Code");

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
