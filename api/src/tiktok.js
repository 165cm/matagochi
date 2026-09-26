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
  const target = await resolveShortLink(url, fetchImpl);
  let response;
  try {
    response = await fetchImpl(`${TIKTOK_OEMBED_ENDPOINT}?url=${encodeURIComponent(target)}`);
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
    videoUrl: target
  };
}

// Android/iPhoneのTikTokアプリは vt.tiktok.com の短縮URLで共有する。oEmbedは通常の動画URLしか受け付けない。
async function resolveShortLink(url, fetchImpl) {
  if (!/^https?:\/\/(vm|vt)\.tiktok\.com\//i.test(url)) return url;
  try {
    const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(8_000) });
    const finalUrl = String(response.url || "");
    return /tiktok\.com\/@[^/]+\/video\/\d+/.test(finalUrl) ? finalUrl.split("?")[0] : url;
  } catch {
    return url;
  }
}

function cleanText(value) {
  return String(value || "").trim();
}
