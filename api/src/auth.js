import { createHash, createHmac, createPublicKey, randomBytes, randomInt, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { ApiError } from "./errors.js";

// ログイン：Google（ボタン）と、メールに届く6桁のコード。どちらも同じメールアドレスなら同じアカウント。
// アカウントは、この端末の識別子・家族の合言葉・自分の名前を覚えておき、機種変更の時に戻す。
const DAY = 86_400_000;
const SESSION_DAYS = 180;
const CODE_MINUTES = 10;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha = (text) => createHash("sha256").update(text).digest("hex");
export const accountIdFor = (email) => `u-${sha(String(email).trim().toLowerCase()).slice(0, 40)}`;

export function createAuth(store, env = {}, { fetch = globalThis.fetch, now = Date.now, sendMail = null } = {}) {
  const googleClientId = env.GOOGLE_CLIENT_ID || "";
  const mailer = sendMail || (env.RESEND_API_KEY && env.MAIL_FROM ? resendMailer(env, fetch) : null);
  const required = () => { if (!store) throw new ApiError(503, "auth_not_configured", "ログインの保存先が未設定です。"); };
  let secretCache = null;
  // 署名の鍵はサーバーが最初に作って保存する（設定の手間を増やさない）。
  async function secret() {
    if (secretCache) return secretCache;
    required();
    const entry = await store.get("auth/secret");
    if (entry) return (secretCache = Buffer.from(entry.envelope.key, "base64"));
    const key = randomBytes(32).toString("base64");
    await store.put("auth/secret", { key }, { ifGeneration: 0 });
    const saved = await store.get("auth/secret");
    return (secretCache = Buffer.from(saved.envelope.key, "base64"));
  }
  async function sign(uid) {
    const body = b64url(JSON.stringify({ uid, exp: now() + SESSION_DAYS * DAY }));
    return `${body}.${b64url(createHmac("sha256", await secret()).update(body).digest())}`;
  }
  async function verifySession(token) {
    const [body, mac] = String(token || "").split(".");
    if (!body || !mac) return null;
    const expected = createHmac("sha256", await secret()).update(body).digest();
    const given = Buffer.from(mac, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const { uid, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
      return typeof uid === "string" && exp > now() ? uid : null;
    } catch { return null; }
  }
  async function loadAccount(uid) { return (await store.get(`auth/accounts/${uid}`)) || null; }
  async function saveAccount(uid, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await loadAccount(uid);
      const next = change(entry?.envelope || null);
      if (await store.put(`auth/accounts/${uid}`, next, { ifGeneration: entry?.generation ?? 0 })) return next;
    }
    throw new ApiError(429, "auth_busy", "混雑しています。もう一度お試しください。");
  }
  async function signIn(email, method) {
    const uid = accountIdFor(email);
    const account = await saveAccount(uid, (a) => ({ ...(a || { createdAt: new Date(now()).toISOString() }), email: String(email).toLowerCase(), methods: [...new Set([...(a?.methods || []), method])], updatedAt: new Date(now()).toISOString() }));
    return { token: await sign(uid), account: publicAccount(account) };
  }
  let certs = null;
  async function googleKeys() {
    if (certs && certs.expires > now()) return certs.keys;
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    if (!response.ok) throw new ApiError(502, "google_unavailable", "Googleに接続できませんでした。");
    const { keys } = await response.json();
    certs = { keys, expires: now() + 3_600_000 };
    return keys;
  }
  return {
    config: () => ({ google: googleClientId, email: !!mailer }),
    verifySession,
    async google(credential) {
      required();
      if (!googleClientId) throw new ApiError(503, "google_not_configured", "Googleログインは準備中です。");
      const [h, p, s] = String(credential || "").split(".");
      let header, payload;
      try { header = JSON.parse(Buffer.from(h, "base64url")); payload = JSON.parse(Buffer.from(p, "base64url")); } catch { throw new ApiError(401, "invalid_credential", "Googleのログインを確かめられませんでした。"); }
      const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
      const ok = header.alg === "RS256" && jwk && verifySignature("RSA-SHA256", Buffer.from(`${h}.${p}`), createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(s || "", "base64url"));
      const issuer = ["accounts.google.com", "https://accounts.google.com"].includes(payload.iss);
      if (!ok || !issuer || payload.aud !== googleClientId || !(payload.exp * 1000 > now()) || !payload.email || payload.email_verified === false) {
        throw new ApiError(401, "invalid_credential", "Googleのログインを確かめられませんでした。");
      }
      return signIn(payload.email, "google");
    },
    async emailStart(rawEmail) {
      required();
      if (!mailer) throw new ApiError(503, "email_not_configured", "メールでのログインは準備中です。");
      const email = String(rawEmail || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) throw new ApiError(400, "invalid_email", "メールアドレスを確かめてください。");
      const key = `auth/codes/${sha(email)}`;
      const current = await store.get(key);
      if (current && now() - Date.parse(current.envelope.sentAt) < 60_000) throw new ApiError(429, "code_wait", "コードは1分に1回まで送れます。");
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await store.put(key, { hash: sha(`${email}:${code}`), sentAt: new Date(now()).toISOString(), expires: now() + CODE_MINUTES * 60_000, tries: 0 }, { ifGeneration: current?.generation ?? 0 });
      await mailer(email, code);
      return { sent: true };
    },
    async emailVerify(rawEmail, rawCode) {
      required();
      const email = String(rawEmail || "").trim().toLowerCase();
      const key = `auth/codes/${sha(email)}`;
      const current = await store.get(key);
      const entry = current?.envelope;
      if (!entry || entry.used || entry.expires < now() || entry.tries >= 5) throw new ApiError(401, "code_expired", "コードの期限が切れました。もう一度送ってください。");
      if (sha(`${email}:${String(rawCode || "").trim()}`) !== entry.hash) {
        await store.put(key, { ...entry, tries: entry.tries + 1 }, { ifGeneration: current.generation });
        throw new ApiError(401, "code_wrong", "コードが違います。");
      }
      await store.put(key, { ...entry, used: true }, { ifGeneration: current.generation });
      return signIn(email, "email");
    },
    async me(uid) {
      required();
      const entry = await loadAccount(uid);
      if (!entry) throw new ApiError(401, "signed_out", "ログインし直してください。");
      return publicAccount(entry.envelope);
    },
    // 端末の識別子・合言葉・自分の名前を覚える（次に別の端末でログインした時に戻す）。
    async link(uid, body = {}) {
      required();
      const deviceId = /^[\w-]{8,80}$/.test(body.deviceId || "") ? body.deviceId : undefined;
      const syncCode = typeof body.syncCode === "string" ? body.syncCode.slice(0, 200) : undefined;
      const me = typeof body.me === "string" ? body.me.slice(0, 20) : undefined;
      const account = await saveAccount(uid, (a) => {
        if (!a) throw new ApiError(401, "signed_out", "ログインし直してください。");
        return { ...a, ...(deviceId ? { deviceId } : {}), ...(syncCode !== undefined ? { syncCode } : {}), ...(me !== undefined ? { me } : {}), updatedAt: new Date(now()).toISOString() };
      });
      return publicAccount(account);
    }
  };
}

function publicAccount(a) {
  return { email: a.email, methods: a.methods || [], deviceId: a.deviceId || "", syncCode: a.syncCode || "", me: a.me || "" };
}

// メールは Resend で送る（独自ドメインを入れたら RESEND_API_KEY と MAIL_FROM を設定すると有効になる）。
function resendMailer(env, fetch) {
  return async (to, code) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to, subject: `リピごちのログインコード：${code}`, text: `リピごちのログインコードは ${code} です。\n10分以内に、アプリの画面に入力してください。\n心当たりがない場合は、このメールを無視してください。` })
    });
    if (!response.ok) throw new ApiError(502, "mail_failed", "メールを送れませんでした。時間をおいてお試しください。");
  };
}
