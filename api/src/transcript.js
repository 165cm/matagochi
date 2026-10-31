// YouTubeのタイムスタンプ付き字幕（Transcript / 字幕トラック）を軽量に取得する。
// 外部ライブラリを使わず、Node標準の fetch と正規表現のみでミリ秒精度の発話時刻を取り出す。

const INNERTUBE_API_URL = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
const INNERTUBE_CLIENT_VERSION = "20.10.38";
const INNERTUBE_CONTEXT = {
  client: { clientName: "ANDROID", clientVersion: INNERTUBE_CLIENT_VERSION }
};
const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;
const MAX_TRANSCRIPT_BYTES = 1024 * 1024; // 1MB上限（DoS/メモリ枯渇防止）

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

// 秒数を "MM:SS" または "HH:MM:SS" に整形（ミリ秒・小数第1位も任意で付与可能）
export function formatTime(seconds, includeFraction = false) {
  const total = Math.max(0, Number(seconds) || 0);
  const roundedTenths = Math.round(total * 10);
  const s = Math.floor(roundedTenths / 10);
  const frac = roundedTenths % 10;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const base = h > 0
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return includeFraction && frac > 0 ? `${base}.${frac}` : base;
}

// 字幕XMLをパースして [{ start, duration, end, text }] の配列に変換する
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
      const start = Math.round(startMs / 100) / 10; // 0.1秒単位
      const duration = Math.round(durMs / 100) / 10;
      results.push({
        start,
        duration,
        end: Math.round((start + duration) * 10) / 10,
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
      const duration = Number.isFinite(dur) ? Math.round(dur * 10) / 10 : 0;
      results.push({
        start: Math.round(start * 10) / 10,
        duration,
        end: Math.round((start + duration) * 10) / 10,
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
// 戻り値:
// { status: "ok", items: [...] }
// { status: "not_available", reason: "no_captions" | "unplayable" | ..., diag?: { client, clientVersion, playability, playabilityReason, trackCount } }
// no_captions も unplayable も「この取得方法では字幕を確かめられなかった」だけ（本番のサーバーからは断られることがある）。永久の「字幕なし」にしない。
// { status: "retryable_error", error: "429" | "timeout" | "server_error" | ... }
export async function fetchYouTubeTranscript(videoId, { lang = "ja", fetchImpl = fetch } = {}) {
  if (!videoId || typeof videoId !== "string") {
    return { status: "not_available", reason: "invalid_id" };
  }

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

    if (res.status === 429) {
      return { status: "retryable_error", error: "http_429" };
    }
    if (!res.ok) {
      return { status: res.status >= 500 ? "retryable_error" : "not_available", error: `http_${res.status}` };
    }

    const data = await res.json().catch(() => null);
    if (!data) return { status: "retryable_error", error: "invalid_json" };

    const captionTracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks) || !captionTracks.length) {
      // 字幕の一覧が空の時は、再生の状態（playabilityStatus）で理由を分ける。再生できない（LOGIN_REQUIRED 等）は
      // サーバーの場所（データセンター）で断られた可能性があるが、断定はできないので「unplayable」とし、元の理由を残す。
      const playability = String(data?.playabilityStatus?.status || "");
      const diag = { client: INNERTUBE_CONTEXT.client.clientName, clientVersion: INNERTUBE_CLIENT_VERSION, playability, playabilityReason: String(data?.playabilityStatus?.reason || "").slice(0, 120), trackCount: 0 };
      console.error(JSON.stringify({ event: "transcript_unavailable", videoId, ...diag }));
      return { status: "not_available", reason: playability && playability !== "OK" ? "unplayable" : "no_captions", diag };
    }

    const track = pickCaptionTrack(captionTracks, lang);
    if (!track?.baseUrl) return { status: "not_available", reason: "no_track_url" };

    // 安全のため HTTPS かつ youtube.com ドメインのURLであることを確認
    const url = new URL(track.baseUrl);
    if (url.protocol !== "https:" || (!url.hostname.endsWith(".youtube.com") && url.hostname !== "youtube.com")) {
      return { status: "not_available", reason: "invalid_track_url" };
    }

    const xmlRes = await fetchImpl(track.baseUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000)
    });

    if (xmlRes.status === 429) return { status: "retryable_error", error: "http_429" };
    if (!xmlRes.ok) return { status: xmlRes.status >= 500 ? "retryable_error" : "not_available", error: `track_http_${xmlRes.status}` };

    const contentLength = Number(xmlRes.headers?.get?.("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_TRANSCRIPT_BYTES) {
      return { status: "not_available", reason: "transcript_too_large" };
    }

    const xml = await xmlRes.text();
    if (xml.length > MAX_TRANSCRIPT_BYTES) {
      return { status: "not_available", reason: "transcript_too_large" };
    }

    const items = parseTranscriptXml(xml);
    if (!items.length) return { status: "not_available", reason: "empty_transcript" };

    return { status: "ok", items };
  } catch (err) {
    const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    return { status: "retryable_error", error: isTimeout ? "timeout" : "network_error" };
  }
}

// AIプロンプト用に字幕を各発話ID [ID] とタイムスタンプ付きで整形する。
// 発話時刻の秒未満（0.1秒単位）も保持し、AIには該当する発話IDを選ばせる。
export function formatTranscriptForPrompt(items = [], { maxSeconds = 1800, maxChars = 24000 } = {}) {
  if (!Array.isArray(items) || !items.length) return { text: "", cues: [], truncated: false };

  const cues = [];
  const lines = [];
  let totalChars = 0;
  let truncated = false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.start > maxSeconds) {
      truncated = true;
      break;
    }
    const id = i + 1;
    const timeStr = formatTime(item.start, true);
    const line = `[${id}] ${timeStr} ${item.text}`;
    if (totalChars + line.length > maxChars) {
      truncated = true;
      break;
    }

    cues.push({ id, start: item.start, duration: item.duration, end: item.end, text: item.text });
    lines.push(line);
    totalChars += line.length + 1;
  }

  return { text: lines.join("\n"), cues, truncated };
}

// AIの回答（cueIds または stepTimes）から、実在する字幕発話の開始秒を安全にルックアップする。
// 実在する字幕アイテムに対応しない手順は null とする（架空の時刻生成を防ぐ）。
export function resolveTranscriptTimes(cues = [], rawAnswer = {}) {
  if (!Array.isArray(cues) || !cues.length || !rawAnswer || typeof rawAnswer !== "object") {
    return { stepTimes: [], stepCues: [] };
  }

  const cueMap = new Map();
  for (const c of cues) {
    cueMap.set(c.id, c);
  }

  const rawCues = Array.isArray(rawAnswer.cueIds) ? rawAnswer.cueIds : [];
  const rawTimes = Array.isArray(rawAnswer.stepTimes) ? rawAnswer.stepTimes : [];
  const rawTexts = Array.isArray(rawAnswer.stepCues) ? rawAnswer.stepCues : [];

  const n = Math.max(rawCues.length, rawTimes.length, rawTexts.length);
  const stepTimes = [];
  const stepCues = [];

  for (let i = 0; i < n; i++) {
    let matchedCue = null;

    // 1. cueId（発話番号）の照合を最優先
    const rawId = rawCues[i];
    if (Number.isFinite(Number(rawId)) && cueMap.has(Number(rawId))) {
      matchedCue = cueMap.get(Number(rawId));
    } else {
      // 2. 時刻文字列からの照合（実在する字幕の start から end+2秒 以内にあるか検証）
      const t = rawTimes[i];
      if (t !== null && t !== undefined && t !== "") {
        const sec = parseTimeStringToSeconds(t);
        if (Number.isFinite(sec)) {
          // 実在する字幕の中で時刻が一致するものを探す（±3秒の許容範囲）
          const candidate = cues.find((c) => Math.abs(c.start - sec) <= 3);
          if (candidate) matchedCue = candidate;
        }
      }
    }

    if (matchedCue) {
      stepTimes.push(matchedCue.start);
      stepCues.push(matchedCue.text.slice(0, 20));
    } else {
      stepTimes.push(null);
      stepCues.push(null);
    }
  }

  return { stepTimes, stepCues };
}

// "MM:SS" または "HH:MM:SS" または 秒数を数値秒に変換
function parseTimeStringToSeconds(val) {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const s = val.trim();
  const colon = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2}(?:\.\d+)?)$/);
  if (colon) {
    const [, h, m, sec] = colon;
    return (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(sec);
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
