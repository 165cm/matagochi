/* ログイン（Google・メールのコード）。機種変更しても、ログインするとチケット・家族の共有・自分の名前が戻る。 */
let authLoaded = false;
let authConfig = null, account = null, authBusy = false, loginEmail = "", loginCodeSent = false;
let authMessage = "", transferCode = "", transferExpires = "";
let googleWaitUntil = 0, googleWaitTimer = null, googleButtonState = "";
const authTransferPage = () => typeof location !== "undefined" && new URLSearchParams(location.search).get("login-transfer") === "1";
const iosHomeApp = () => typeof navigator !== "undefined" && (/iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) && (navigator.standalone === true || globalThis.matchMedia?.("(display-mode: standalone)").matches === true);
const googleAuthPending = () => googleWaitUntil > Date.now();
function finishGoogleWait() { googleWaitUntil = 0; clearTimeout(googleWaitTimer); googleWaitTimer = null; }
function googleWaitExpired() {
  if (!googleWaitUntil || Date.now() < googleWaitUntil) return;
  finishGoogleWait(); googleButtonState = "";
  authMessage = authTransferPage() ? "Googleから結果が戻りませんでした。Googleの画面を閉じて、もう一度ログインしてください。" : "Googleから結果が戻りませんでした。Googleの画面を閉じて、下の「Safariから引き継ぐ」をお試しください。";
  if (state.view === "settings") render();
}
function startGoogleWait() {
  finishGoogleWait(); googleWaitUntil = Date.now() + 60_000;
  googleWaitTimer = setTimeout(googleWaitExpired, 60_000);
  const note = document.querySelector("#auth-message");
  if (note) note.textContent = "Googleの画面でログインしてください。戻らない場合は、その画面を閉じてSafariから引き継げます。";
}
if (typeof document !== "undefined") document.addEventListener?.("visibilitychange", () => { if (document.visibilityState === "visible") googleWaitExpired(); });
if (typeof window !== "undefined") window.addEventListener?.("pageshow", googleWaitExpired);
const authToken = () => { try { return localStorage.getItem("ripigochi-session") || ""; } catch { return ""; } };
const authHeaders = () => (authToken() ? { Authorization: `Bearer ${authToken()}` } : {});
const loginAvailable = () => !!(authConfig?.google || authConfig?.email);
async function loadAuth() {
  if (!API_BASE_URL) return;
  try { authConfig = await (await fetchWithTimeout(`${API_BASE_URL}/api/auth/config`, {}, 10_000)).json(); } catch { authConfig = null; }
  if (authToken()) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, { headers: authHeaders() }, 10_000);
      if (response.status === 401) signOutLocal();
      else if (response.ok) account = await response.json();
    } catch {}
  }
  authLoaded = true;
  // 描き直すのは設定画面を開いている時だけ（入力中の画面や初回設定の自動送りを邪魔しない）。
  if ((state.view === "settings" && state.onboarded) || authTransferPage()) render();
}
function signOutLocal() {
  try { localStorage.removeItem("ripigochi-session"); } catch {}
  account = null; transferCode = ""; transferExpires = ""; finishGoogleWait(); googleButtonState = "";
}
async function authPost(path, body, signed = false) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(signed ? authHeaders() : {}) }, body: JSON.stringify(body) }, 20_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "ログインできませんでした。");
  return data;
}
// ログインできたら：前の端末の識別子（チケット）と家族の合言葉（共有データ）を戻し、この端末の分を覚えさせる。
async function afterSignIn({ token, account: acct }) {
  try { localStorage.setItem("ripigochi-session", token); } catch {}
  account = acct;
  if (authTransferPage()) { showToast("ログインしました。引き継ぎコードを発行できます。"); render(); return; }
  if (acct.deviceId && acct.deviceId !== deviceKey()) try { localStorage.setItem("ripigochi-device-id", acct.deviceId); } catch {}
  let restored = false;
  if (acct.syncCode && !state.sync?.roomId) {
    restored = await connectRoom(acct.syncCode);
    if (restored && acct.me && state.family.includes(acct.me)) { state.me = acct.me; saveState({ scheduleSync: false }); }
  }
  await linkAccount();
  loginEmail = ""; loginCodeSent = false;
  showToast(restored ? "ログインしました。家族の共有とチケットを戻しました。" : "ログインしました。");
  refreshTickets();
  render();
}
// アカウントに、この端末の識別子・合言葉・自分の名前を覚えさせる。合言葉は、共有をやめた時だけ消す。
async function linkAccount({ leftRoom = false } = {}) {
  if (!authToken() || !API_BASE_URL) return;
  const body = { deviceId: deviceKey(), me: state.me || "", ...(state.sync?.code ? { syncCode: state.sync.code } : leftRoom ? { syncCode: "" } : {}) };
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) }, 10_000);
    if (response.ok) account = await response.json();
  } catch {}
}
async function signInWithGoogle(credential) {
  if (authBusy) return;
  finishGoogleWait(); authMessage = "";
  authBusy = true; render();
  try { await afterSignIn(await authPost("google", { credential })); }
  catch (error) { showToast(error.message); }
  finally { authBusy = false; render(); }
}
let gisLoading = null, gisReady = false;
function loadGis() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const failed = () => { clearTimeout(timer); script.remove(); gisLoading = null; reject(new Error("Googleのボタンを読み込めませんでした。もう一度お試しください。")); };
    const timer = setTimeout(failed, 10_000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => { if (!globalThis.google?.accounts?.id) { failed(); return; } clearTimeout(timer); resolve(); };
    script.onerror = failed;
    document.head.append(script);
  });
  return gisLoading;
}
// Googleのボタンは Google の部品を描く（画面を描き直すたびに置き直す）。
async function mountGoogleButton() {
  const el = document.querySelector("#google-login");
  if (!el || !authConfig?.google || account || authBusy) return;
  try { await loadGis(); } catch { el.innerHTML = '<p>Googleのボタンを読み込めませんでした。</p><button type="button" class="secondary-button" data-action="auth-google-retry">もう一度読み込む</button>'; return; }
  if (account || authBusy) return;
  if (!gisReady) { google.accounts.id.initialize({ client_id: authConfig.google, callback: (r) => { if (r.state !== googleButtonState || !googleButtonState) return; finishGoogleWait(); signInWithGoogle(r.credential); }, ux_mode: "popup" }); gisReady = true; }
  const target = document.querySelector("#google-login");
  if (target && !target.childElementCount) {
    googleButtonState = `login-${Date.now()}-${Math.random()}`;
    google.accounts.id.renderButton(target, { state: googleButtonState, click_listener: startGoogleWait, theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "ja", width: Math.min(320, target.clientWidth || 320) });
  }
}
function renderTransferHelp() {
  if (authTransferPage()) return "";
  const url = new URL("./?login-transfer=1", location.href).href;
  return `<details class="panel" ${iosHomeApp() ? "open" : ""}><summary>Safariから引き継ぐ</summary><p class="small">Googleの画面で止まる場合は、下のページをSafariで開いてログインしてください。ホーム画面版に戻り、発行したコードを貼り付けます。</p><p><a class="secondary-button" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">ログイン用ページを開く</a></p><p class="small muted">Safariで開かない場合はリンクを長押ししてコピーし、Safariのアドレス欄に貼り付けてください。</p><label for="auth-transfer-code">Safariで発行したコード</label><div class="login-row"><input id="auth-transfer-code" class="input" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="24" placeholder="コードを貼り付ける"><button type="button" class="secondary-button" data-action="auth-transfer-redeem" ${authBusy ? "disabled" : ""}>引き継ぐ</button></div><p class="small muted">自分がSafariで発行したコードだけを入力してください。</p></details>`;
}
function renderTransferIssuer() {
  if (!authTransferPage()) return "";
  return `<div><button type="button" class="primary-button" data-action="auth-transfer-create" ${authBusy ? "disabled" : ""}>${transferCode ? "新しいコードを発行" : "引き継ぎコードを発行"}</button>${transferCode ? `<p>このコードをコピーし、ホーム画面のリピごちに戻って「Safariから引き継ぐ」に貼り付けてください。</p><input id="auth-transfer-issued" class="input" readonly value="${escapeAttr(transferCode)}" aria-label="引き継ぎコード"><button type="button" class="secondary-button" data-action="auth-transfer-copy">コードをコピー</button><p class="small">有効期限：${escapeHtml(new Date(transferExpires).toLocaleTimeString("ja-JP"))}（1回限り）。他の人には渡さないでください。</p>` : ""}</div>`;
}
function renderAccountPanel() {
  if (!loginAvailable() && !account) return "";
  if (account) return `<section class="panel account-panel"><p class="account-in"><span class="account-dot" aria-hidden="true"></span>ログイン中 <b>${escapeHtml(account.email)}</b></p><p class="muted small">機種変更しても、同じ方法でログインすると、チケット・家族の共有・自分の名前が戻ります。</p><button type="button" class="text-button" data-action="auth-signout" ${authBusy ? "disabled" : ""}>ログアウト</button>${renderTransferIssuer()}${authBusy ? '<p role="status">確かめています…</p>' : ""}</section>`;
  const email = authConfig?.email ? (loginCodeSent
    ? `<label class="small" for="login-code">${escapeHtml(loginEmail)} に届いた6桁のコード</label><div class="login-row"><input id="login-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><button type="button" class="primary-button" data-action="auth-email-verify" ${authBusy ? "disabled" : ""}>ログイン</button></div><button type="button" class="text-button" data-action="auth-email-reset">メールアドレスを変える</button>`
    : `<div class="login-row"><input id="login-email" class="input" type="email" autocomplete="email" placeholder="メールアドレス" value="${escapeAttr(loginEmail)}"><button type="button" class="secondary-button" data-action="auth-email-start" ${authBusy ? "disabled" : ""}>コードを送る</button></div>`) : "";
  return `<section class="panel account-panel"><h3>🔐 ログイン</h3><p class="small">ログインしておくと、機種変更やデータが消えた時も、<b>チケット・家族の共有</b>が戻ります。</p>${authConfig?.google ? `<div id="google-login" class="google-login" aria-label="Googleでログイン"></div>` : ""}${email}<p id="auth-message" class="small muted" role="status">${escapeHtml(authMessage)}</p>${renderTransferHelp()}${authBusy ? '<p class="muted small">確かめています…</p>' : ""}</section>`;
}
async function handleAuthAction(action) {
  if (authBusy && action.startsWith("auth-")) return true;
  if (action === "auth-load-retry") { authLoaded = false; render(); await loadAuth(); return true; }
  if (action === "auth-google-retry") { finishGoogleWait(); authMessage = ""; render(); return true; }
  if (action === "auth-transfer-copy") {
    try { await navigator.clipboard.writeText(transferCode); showToast("コピーしました。ホーム画面のリピごちに戻って貼り付けてください。"); }
    catch { document.querySelector("#auth-transfer-issued")?.select(); showToast("コードを長押ししてコピーしてください。"); }
    return true;
  }
  if (action === "auth-transfer-create" || action === "auth-transfer-redeem") {
    const code = (document.querySelector("#auth-transfer-code")?.value || "").trim();
    finishGoogleWait(); googleButtonState = ""; authBusy = true; render();
    try {
      if (action === "auth-transfer-create") {
        const result = await authPost("transfer", {}, true); transferCode = result.code; transferExpires = result.expiresAt;
      } else await afterSignIn(await authPost("transfer/redeem", { code }));
    } catch (error) { showToast(error.message); }
    finally { authBusy = false; render(); }
    return true;
  }
  if (action === "auth-signout") {
    if (!window.confirm("ログアウトします。この端末のデータはそのまま残ります。よろしいですか？")) return true;
    signOutLocal(); globalThis.google?.accounts?.id?.disableAutoSelect?.(); showToast("ログアウトしました。"); render(); return true;
  }
  if (action === "auth-email-reset") { loginCodeSent = false; render(); return true; }
  if (action === "auth-email-start") {
    loginEmail = (document.querySelector("#login-email")?.value || "").trim();
    authBusy = true; render();
    try { await authPost("email/start", { email: loginEmail }); loginCodeSent = true; showToast("コードを送りました。メールを確かめてください。"); }
    catch (error) { showToast(error.message); }
    finally { authBusy = false; render(); }
    return true;
  }
  if (action === "auth-email-verify") {
    const code = (document.querySelector("#login-code")?.value || "").trim();
    authBusy = true; render();
    try { await afterSignIn(await authPost("email/verify", { email: loginEmail, code })); }
    catch (error) { showToast(error.message); }
    finally { authBusy = false; render(); }
    return true;
  }
  return false;
}
