import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId, fetchYouTubeSnippet } from "./youtube.js";

const DEFAULT_CATEGORY = "その他";

export async function importYouTubeRecipe(rawUrl, deps = {}) {
  const videoId = extractYouTubeVideoId(rawUrl);
  const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId);
  const analysis = await deps.analyzeRecipeDescription(snippet);
  const videoUrl = canonicalYouTubeUrl(videoId, rawUrl);

  return normalizeImportResult({
    ...analysis,
    caption: buildCaption(snippet),
    source: /youtube\.com\/shorts\//i.test(rawUrl) ? "YouTube Shorts" : "YouTube",
    title: analysis.title || snippet.title,
    videoId,
    videoUrl,
    channelTitle: snippet.channelTitle
  });
}

export function normalizeImportResult(result) {
  return {
    title: cleanText(result.title),
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
    .filter((item) => item.name)
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
