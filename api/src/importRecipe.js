import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId, fetchYouTubeSnippet } from "./youtube.js";

const DEFAULT_CATEGORY = "その他";
const NUTRITION = /kcal|キロカロリー|カロリー|糖質|たんぱく質|タンパク質|脂質|炭水化物|食物繊維|塩分|PFC|1人前あたり|1人分あたり/i;

const VIDEO_MAX_SECONDS = 600;

// まず説明文（安い）。作り方か材料が取れない時だけ、短い動画を映像ごと読む。
export async function importYouTubeRecipe(rawUrl, deps = {}, options = {}) {
  const videoId = extractYouTubeVideoId(rawUrl);
  const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId);
  const videoUrl = canonicalYouTubeUrl(videoId, rawUrl);
  const hasDescription = !!String(snippet.description || "").trim();
  let analysis = hasDescription ? await deps.analyzeRecipeDescription(snippet) : {};
  let analyzedFrom = "description";
  // 説明文に本当の手順がない（AIの判定・手順が1つ以下）なら、説明文の「手順」は使わず動画を読む。
  if (analysis.stepsInDescription === false || normalizeSteps(analysis.steps).length < 2) analysis = { ...analysis, steps: [] };
  const weak = !normalizeSteps(analysis.steps).length || !normalizeIngredients(analysis.ingredients).length;
  const maxSeconds = Number(options.videoMaxSeconds ?? VIDEO_MAX_SECONDS);
  const duration = Number.isFinite(snippet.durationSeconds) && snippet.durationSeconds > 0 ? snippet.durationSeconds : null;
  // 長い動画（や長さ不明）は頭から maxSeconds だけを見る。作り方がその中で完結した時だけ使う。
  const clipSeconds = !duration || duration > maxSeconds ? maxSeconds : null;
  if (weak && maxSeconds > 0 && typeof deps.analyzeRecipeVideo === "function") {
    try {
      await options.reserveBudget?.();
      const video = await deps.analyzeRecipeVideo(`https://www.youtube.com/watch?v=${videoId}`, snippet, { clipSeconds });
      const complete = video.stepsComplete !== false;
      const videoSteps = complete ? normalizeSteps(video.steps) : [];
      const videoIngredients = normalizeIngredients(video.ingredients);
      analysis = {
        ...analysis,
        title: analysis.title || video.title,
        sourceServings: Number.isInteger(analysis.sourceServings) ? analysis.sourceServings : video.sourceServings,
        ingredients: normalizeIngredients(analysis.ingredients).length ? analysis.ingredients : videoIngredients,
        steps: videoSteps.length ? videoSteps : analysis.steps,
        tags: analysis.tags?.length ? analysis.tags : video.tags
      };
      if (videoSteps.length) analyzedFrom = clipSeconds ? "video-clip" : "video";
    } catch (error) {
      if (!hasDescription) throw error;
    }
  }
  if (!hasDescription && !analyzedFrom.startsWith("video")) throw new ApiError(422, "empty_description", "この動画には解析できる説明文がありません。");

  return {
    ...normalizeImportResult({
      ...analysis,
      caption: buildCaption(snippet),
      source: /youtube\.com\/shorts\//i.test(rawUrl) ? "YouTube Shorts" : "YouTube",
      title: analysis.title || snippet.title,
      videoId,
      videoUrl,
      channelTitle: snippet.channelTitle
    }),
    analyzedFrom
  };
}

export function normalizeImportResult(result) {
  return {
    title: cleanText(result.title),
    sourceServings: Number.isInteger(result.sourceServings) && result.sourceServings > 0 && result.sourceServings <= 100 ? result.sourceServings : null,
    source: cleanText(result.source || "YouTube"),
    caption: cleanText(result.caption),
    ingredients: normalizeIngredients(result.ingredients),
    steps: normalizeSteps(result.steps),
    tags: normalizeTags(result.tags),
    note: cleanText(result.note),
    videoId: cleanText(result.videoId),
    videoUrl: cleanText(result.videoUrl),
    channelTitle: cleanText(result.channelTitle)
  };
}

export function buildCaption(snippet) {
  return [
    snippet.title ? `タイトル: ${snippet.title}` : "",
    snippet.channelTitle ? `チャンネル: ${snippet.channelTitle}` : "",
    "説明文:",
    snippet.description || ""
  ].filter(Boolean).join("\n");
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: cleanText(item?.name),
      amount: cleanText(item?.amount || "適量"),
      category: cleanText(item?.category || DEFAULT_CATEGORY)
    }))
    .filter((item) => item.name && !NUTRITION.test(`${item.name} ${item.amount}`))
    .slice(0, 20);
}

function normalizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 10);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 8);
}

function cleanText(value) {
  return String(value || "").trim();
}

export function requireAnalyzer(analyzer) {
  if (typeof analyzer !== "function") {
    throw new ApiError(500, "missing_analyzer", "Gemini解析処理が設定されていません。");
  }
  return analyzer;
}
