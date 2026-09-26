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

  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ApiError(400, "invalid_url", "HTTPまたはHTTPSのYouTube URLを入力してください。");
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
    part: "snippet,status,contentDetails",
    id: videoId,
    key: apiKey
  });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`, { signal: AbortSignal.timeout(15_000) });

  if (!response.ok) {
    throw new ApiError(502, "youtube_api_error", "YouTubeの動画情報を取得できませんでした。");
  }

  const data = await response.json();
  const item = data.items?.[0];
  if (!item?.snippet) {
    throw new ApiError(404, "video_not_found", "YouTube動画が見つかりませんでした。");
  }

  if (item.status?.privacyStatus !== "public") {
    throw new ApiError(422, "non_public_video", "共通レシピへの取り込みは公開動画のみ対応しています。手動入力をご利用ください。");
  }
  const snippet = item.snippet;

  return {
    title: snippet.title || "",
    description: snippet.description || "",
    channelTitle: snippet.channelTitle || "",
    publishedAt: snippet.publishedAt || "",
    thumbnails: snippet.thumbnails || {},
    durationSeconds: parseIsoDuration(item.contentDetails?.duration)
  };
}

// "PT1M5S" → 65。読めなければ null。
export function parseIsoDuration(value) {
  const m = String(value || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m || !value || value === "P" || value === "PT") return null;
  const [, d = 0, h = 0, min = 0, sec = 0] = m.map((x) => Number(x || 0));
  return d * 86400 + h * 3600 + min * 60 + sec;
}

const PLAYLIST_ID_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
// 「後で見る」「高評価」はAPIで取得できない
const PRIVATE_SYSTEM_PLAYLISTS = ["WL", "LL", "LM"];
export const PLAYLIST_MAX_ITEMS = 200;
const PLAYLIST_DESCRIPTION_LIMIT = 3000;

export function extractYouTubePlaylistId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    throw new ApiError(400, "invalid_url", "YouTubeの再生リストURLを入力してください。");
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new ApiError(400, "invalid_url", "再生リストのURLとして読み取れませんでした。");
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, "");
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || !["youtube.com", "youtu.be"].includes(host)) {
    throw new ApiError(400, "invalid_url", "YouTubeの再生リストURLを入力してください。");
  }
  const listId = parsed.searchParams.get("list") || "";
  if (PRIVATE_SYSTEM_PLAYLISTS.includes(listId)) {
    throw new ApiError(422, "unsupported_playlist", "「後で見る」「高評価」はYouTubeの仕様で読み込めません。動画を公開または限定公開の再生リストに移してください。");
  }
  if (/^(RD|UL)/.test(listId)) {
    throw new ApiError(422, "unsupported_playlist", "自動生成のミックスは読み込めません。自分で作った再生リストのURLを入力してください。");
  }
  if (!PLAYLIST_ID_PATTERN.test(listId)) {
    throw new ApiError(400, "unsupported_url", "URLに再生リストが含まれていません。再生リストの「共有」からURLをコピーしてください。");
  }
  return listId;
}

async function youtubeGet(path, params, env, fetchImpl, deadline) {
  const apiKey = env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, "missing_youtube_api_key", "YouTube APIキーが設定されていません。");
  }
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetchImpl(`https://www.googleapis.com/youtube/v3/${path}?${query.toString()}`, { signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }).catch(() => { throw new ApiError(504,"youtube_timeout","YouTubeからの取得に時間がかかっています。時間をおいてお試しください。"); });
  if (response.status === 404) {
    throw new ApiError(404, "playlist_not_found", "再生リストが見つかりません。非公開の場合は、公開または限定公開に変更してください。");
  }
  if (!response.ok) {
    throw new ApiError(502, "youtube_api_error", "YouTubeから再生リストを取得できませんでした。");
  }
  return response.json();
}

function bestThumbnail(thumbnails = {}) {
  return thumbnails.high?.url || thumbnails.medium?.url || thumbnails.default?.url || "";
}

// At most 1 metadata + 4 playlist pages + 4 video batches (9 quota units).
export async function fetchYouTubePlaylist(playlistId, env = process.env, fetchImpl = fetch, maxItems = PLAYLIST_MAX_ITEMS) {
  maxItems = Math.max(1, Math.min(PLAYLIST_MAX_ITEMS, Math.floor(Number(maxItems)) || PLAYLIST_MAX_ITEMS));
  const deadline = AbortSignal.timeout(45_000);
  const meta = await youtubeGet("playlists", { part: "snippet", id: playlistId }, env, fetchImpl, deadline);
  const playlist = meta.items?.[0];
  if (!playlist?.snippet) {
    throw new ApiError(404, "playlist_not_found", "再生リストが見つかりません。非公開の場合は、公開または限定公開に変更してください。");
  }

  const videoIds = [];
  let pageToken = "";
  let truncated = false;
  let scanned = 0, pages = 0;
  const seenTokens = new Set();
  do {
    pages++;
    seenTokens.add(pageToken);
    const page = await youtubeGet("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: String(Math.min(50, maxItems-scanned)),
      ...(pageToken ? { pageToken } : {})
    }, env, fetchImpl, deadline);
    for (const item of page.items || []) {
      if (scanned >= maxItems) { truncated = true; break; }
      scanned++;
      const id = item.contentDetails?.videoId;
      if (!/^[a-zA-Z0-9_-]{11}$/.test(id || "") || videoIds.includes(id)) continue;
      if (videoIds.length >= maxItems) { truncated = true; break; }
      videoIds.push(id);
    }
    pageToken = page.nextPageToken || "";
    if (pageToken && (scanned >= maxItems || pages >= Math.ceil(maxItems/50) || seenTokens.has(pageToken))) truncated = true;
    if (truncated) pageToken = "";
  } while (pageToken);

  const items = [];
  let skipped = 0;
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const data = await youtubeGet("videos", { part: "snippet,status", id: batch.join(",") }, env, fetchImpl, deadline);
    const byId = new Map((data.items || []).map((video) => [video.id, video]));
    for (const id of batch) {
      const video = byId.get(id);
      // 非公開・削除済みの動画は一覧に出さない
      if (!video?.snippet || !["public", "unlisted"].includes(video.status?.privacyStatus)) { skipped++; continue; }
      items.push({
        videoId: id,
        privacyStatus: video.status.privacyStatus,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: String(video.snippet.title || "").slice(0, 200),
        channelTitle: String(video.snippet.channelTitle || "").slice(0, 100),
        description: String(video.snippet.description || "").slice(0, PLAYLIST_DESCRIPTION_LIMIT),
        thumbnailUrl: bestThumbnail(video.snippet.thumbnails),
        publishedAt: video.snippet.publishedAt || ""
      });
    }
  }

  return {
    playlist: {
      id: playlistId,
      title: String(playlist.snippet.title || "").slice(0, 200),
      channelTitle: String(playlist.snippet.channelTitle || "").slice(0, 100)
    },
    items,
    skipped,
    truncated,
    maxItems
  };
}
