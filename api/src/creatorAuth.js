import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";

// 投稿者の本人確認（YouTubeでログイン）。docs/APP_MAP.md §40。
// 1. 投稿者ページで Google の画面を開き、「YouTube チャンネルを見るだけ」（youtube.readonly）の許可をもらう（アクセストークン）
// 2. サーバーは、そのトークンが「リピごち用に発行されたもの」か Google に確かめる（aud / azp がこのアプリのクライアントID）
//    → 別のアプリ向けのトークンを持ち込まれても通さない
// 3. YouTube に「このログインの持ち主のチャンネル」を聞く（channels.list mine=true）
// 4. 持ち主と分かったチャンネルIDだけを入れた、短い期限の「投稿者の合い鍵」を返す（Googleのトークンは保存しない）
export const YOUTUBE_READONLY = "https://www.googleapis.com/auth/youtube.readonly";
const CREATOR_SESSION_MS = 2 * 3_600_000; // 2時間。長く持たせない（持ち主が変わることもあるため）
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const CHANNEL_RE = /^UC[\w-]{22}$/;

export function createCreatorAuth(store, { clientId = "", fetch = globalThis.fetch, now = Date.now } = {}) {
  let secretCache = null;
  async function secret() {
    if (secretCache) return secretCache;
    if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
    let entry = await store.get("creators/secret");
    if (!entry) { await store.put("creators/secret", { key: randomBytes(32).toString("base64") }, { ifGeneration: 0 }); entry = await store.get("creators/secret"); }
    return (secretCache = Buffer.from(entry.envelope.key, "base64"));
  }
  async function sign(channels) {
    const body = b64url(JSON.stringify({ ch: channels, exp: now() + CREATOR_SESSION_MS }));
    return `${body}.${b64url(createHmac("sha256", await secret()).update(body).digest())}`;
  }
  // 合い鍵を確かめて、持ち主と確認できたチャンネルIDの一覧を返す（だめなら 401）。
  async function channelsOf(token) {
    const [body, mac] = String(token || "").replace(/^Bearer /, "").split(".");
    const fail = () => { throw new ApiError(401, "creator_signed_out", "YouTubeでもう一度ログインしてください。"); };
    if (!body || !mac) fail();
    const expected = createHmac("sha256", await secret()).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) fail();
    let data;
    try { data = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { fail(); }
    if (!(data?.exp > now()) || !Array.isArray(data.ch)) fail();
    return data.ch.filter((id) => CHANNEL_RE.test(id));
  }
  async function getJson(url, init, errorCode) {
    let response;
    try { response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) }); }
    catch { throw new ApiError(504, "google_unavailable", "Googleに接続できませんでした。時間をおいてお試しください。"); }
    if (!response.ok) throw new ApiError(401, errorCode, "YouTubeのログインを確かめられませんでした。もう一度ログインしてください。");
    return response.json();
  }
  return {
    channelsOf,
    async verify(accessToken) {
      if (!clientId) throw new ApiError(503, "google_not_configured", "YouTubeでのログインは準備中です。");
      const token = String(accessToken || "");
      if (!/^[\w.~+/=-]{20,4096}$/.test(token)) throw new ApiError(400, "invalid_token", "YouTubeのログインを確かめられませんでした。");
      // このアプリ向けのトークンか・期限・許可の範囲
      const info = await getJson(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`, {}, "invalid_token");
      const scopes = String(info.scope || "").split(/\s+/);
      if (info.aud !== clientId && info.azp !== clientId) throw new ApiError(401, "wrong_audience", "このログインは、リピごち用ではありません。");
      if (!(Number(info.expires_in) > 0)) throw new ApiError(401, "invalid_token", "ログインの期限が切れています。もう一度ログインしてください。");
      if (!scopes.includes(YOUTUBE_READONLY)) throw new ApiError(403, "missing_scope", "YouTubeチャンネルの確認を許可してください。");
      // 持ち主のチャンネル
      const data = await getJson("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50", { headers: { Authorization: `Bearer ${token}` } }, "youtube_denied");
      const channels = (data.items || []).filter((c) => CHANNEL_RE.test(c?.id || "")).map((c) => ({ channelId: c.id, title: String(c.snippet?.title || "").slice(0, 200) }));
      if (!channels.length) throw new ApiError(404, "no_channel", "このGoogleアカウントには、YouTubeチャンネルがありません。チャンネルを持つアカウントでログインしてください。");
      return { token: await sign(channels.map((c) => c.channelId)), channels, expiresInMinutes: CREATOR_SESSION_MS / 60_000 };
    }
  };
}
