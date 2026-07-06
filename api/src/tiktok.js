import { ApiError } from "./errors.js";

const TIKTOK_OEMBED_ENDPOINT = "https://www.tiktok.com/oembed";

export function isTikTokUrl(rawUrl) {
  const value = String(rawUrl || "").toLowerCase();
  return /tiktok\.com\/@.+\/video|vm\.tiktok\.com|vt\.tiktok\.com/.test(value);
}

export async function fetchTikTokOEmbed(rawUrl, deps = {}) {
  const url = String(rawUrl || "").trim();
  if (!isTikTokUrl(url)) {
    throw new ApiError(400, "invalid_url", "TikTokの動画URLを指定してください。");
  }

  const fetchImpl = deps.fetch || fetch;
  let response;
  try {
    response = await fetchImpl(`${TIKTOK_OEMBED_ENDPOINT}?url=${encodeURIComponent(url)}`);
  } catch {
    throw new ApiError(502, "tiktok_unreachable", "TikTokに接続できませんでした。");
  }
  if (!response.ok) {
    throw new ApiError(502, "tiktok_oembed_failed", "TikTokの動画情報を取得できませんでした。");
  }

  const data = await response.json().catch(() => ({}));
  return {
    title: cleanText(data.title),
    author: cleanText(data.author_name),
    thumbnailUrl: cleanText(data.thumbnail_url),
    videoUrl: url
  };
}

function cleanText(value) {
  return String(value || "").trim();
}
