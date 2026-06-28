import { ApiError } from "./errors.js";

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

export function extractYouTubeVideoId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new ApiError(400, "invalid_url", "YouTube URLを入力してください。");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ApiError(400, "invalid_url", "YouTube URLとして読み取れませんでした。");
  }

  const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
  let videoId = "";

  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts[0] === "shorts" || pathParts[0] === "embed") {
      videoId = pathParts[1] || "";
    } else if (pathParts[0] === "watch" || parsed.pathname === "/watch") {
      videoId = parsed.searchParams.get("v") || "";
    }
  }

  if (!YOUTUBE_ID_PATTERN.test(videoId)) {
    throw new ApiError(400, "unsupported_url", "YouTube Shorts / YouTube動画URLを入力してください。");
  }

  return videoId;
}

export function canonicalYouTubeUrl(videoId, rawUrl = "") {
  if (/youtube\.com\/shorts\//i.test(rawUrl)) {
    return `https://www.youtube.com/shorts/${videoId}`;
  }
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export async function fetchYouTubeSnippet(videoId, env = process.env, fetchImpl = fetch) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "missing_youtube_api_key", "YouTube APIキーが設定されていません。");
  }

  const params = new URLSearchParams({
    part: "snippet",
    id: videoId,
    key: apiKey
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`);

  if (!response.ok) {
    throw new ApiError(502, "youtube_api_error", "YouTubeの動画情報を取得できませんでした。");
  }

  const data = await response.json();
  const item = data.items?.[0];
  if (!item?.snippet) {
    throw new ApiError(404, "video_not_found", "YouTube動画が見つかりませんでした。");
  }

  const snippet = item.snippet;
  if (!String(snippet.description || "").trim()) {
    throw new ApiError(422, "empty_description", "この動画には解析できる説明文がありません。");
  }

  return {
    title: snippet.title || "",
    description: snippet.description || "",
    channelTitle: snippet.channelTitle || "",
    publishedAt: snippet.publishedAt || "",
    thumbnails: snippet.thumbnails || {}
  };
}
