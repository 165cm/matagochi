// YouTubeのタイムスタンプ付き字幕（Transcript / 字幕トラック）を軽量に取得する。
// 外部ライブラリを使わず、Node標準の fetch と正規表現のみでミリ秒精度の発話時刻を取り出す。

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION }
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

// HTMLエンティティの簡易デコード
export function decodeEntities(str = "") {
  return String(str)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#([0-9]+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

// 秒数を "MM:SS" または "HH:MM:SS" に整形
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// 字幕XMLをパースして [{ start, duration, text }] の配列に変換する
export function parseTranscriptXml(xml = "") {
  if (!xml || typeof xml !== "string") return [];
  const results = [];

  // 1. srv3 形式: <p t="ms" d="ms">...<s>...</s>...</p>
  const pRegex = /<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  let foundSrv3 = false;
  while ((match = pRegex.exec(xml)) !== null) {
    foundSrv3 = true;
    const startMs = parseInt(match[1], 10);
    const durMs = parseInt(match[2], 10);
    const inner = match[3];

    let text = "";
    const sRegex = /<s[^>]*>([^<]*)<\/s>/g;
    let sMatch;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      text += sMatch[1];
    }
    if (!text) {
      text = inner.replace(/<[^>]+>/g, "");
    }
    text = decodeEntities(text).replace(/\s+/g, " ").trim();
    if (text) {
      results.push({
        start: Math.round(startMs / 100) / 10, // 0.1秒単位
        duration: Math.round(durMs / 100) / 10,
        text
      });
    }
  }
  if (foundSrv3) return results;

  // 2. クラシック形式: <text start="s" dur="s">テキスト</text>
  const textRegex = /<text\s+start="([^"]+)"\s+dur="([^"]+)"[^>]*>([^<]*)<\/text>/g;
  while ((match = textRegex.exec(xml)) !== null) {
    const start = parseFloat(match[1]);
    const dur = parseFloat(match[2]);
    const text = decodeEntities(match[3]).replace(/\s+/g, " ").trim();
    if (text && Number.isFinite(start)) {
      results.push({
        start: Math.round(start * 10) / 10,
        duration: Number.isFinite(dur) ? Math.round(dur * 10) / 10 : 0,
        text
      });
    }
  }

  return results;
}

// 複数の字幕トラックから優先言語を選択（日本語の手動字幕 → 日本語の自動生成 → 最初のトラック）
export function pickCaptionTrack(tracks = [], targetLang = "ja") {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  // 1. 指定言語の手動字幕
  const manualTarget = tracks.find((t) => t.languageCode === targetLang && t.kind !== "asr");
  if (manualTarget) return manualTarget;
  // 2. 指定言語の自動生成字幕
  const autoTarget = tracks.find((t) => t.languageCode === targetLang);
  if (autoTarget) return autoTarget;
  // 3. なければ最初のトラック
  return tracks[0];
}

// YouTube動画の字幕を取得する
export async function fetchYouTubeTranscript(videoId, { lang = "ja", fetchImpl = fetch } = {}) {
  if (!videoId || typeof videoId !== "string") return null;

  try {
    const res = await fetchImpl(INNERTUBE_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": INNERTUBE_USER_AGENT
      },
      body: JSON.stringify({
        context: INNERTUBE_CONTEXT,
        videoId
      }),
      signal: AbortSignal.timeout(8_000)
    });
    if (!res.ok) return null;

    const data = await res.json();
    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks) || !captionTracks.length) return null;

    const track = pickCaptionTrack(captionTracks, lang);
    if (!track?.baseUrl) return null;

    // 安全のため youtube.com ドメインのURLであることを確認
    const url = new URL(track.baseUrl);
    if (!url.hostname.endsWith(".youtube.com") && url.hostname !== "youtube.com") {
      return null;
    }

    const xmlRes = await fetchImpl(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000)
    });
    if (!xmlRes.ok) return null;

    const xml = await xmlRes.text();
    const items = parseTranscriptXml(xml);
    return items.length ? items : null;
  } catch {
    return null;
  }
}

// AIプロンプト用に字幕を「[MM:SS] 発話内容」形式にまとめる
// 短い発話が連続している場合は数秒単位でまとめて行数を抑え、トークン消費を節約する
export function formatTranscriptForPrompt(items = [], { maxSeconds = 1800, mergeWindowSeconds = 5 } = {}) {
  if (!Array.isArray(items) || !items.length) return "";

  const merged = [];
  let current = null;

  for (const item of items) {
    if (item.start > maxSeconds) break;
    if (!current) {
      current = { start: item.start, text: item.text };
    } else if (item.start - current.start < mergeWindowSeconds) {
      current.text += " " + item.text;
    } else {
      merged.push(current);
      current = { start: item.start, text: item.text };
    }
  }
  if (current) merged.push(current);

  return merged.map((m) => `[${formatTime(m.start)}] ${m.text}`).join("\n");
}
