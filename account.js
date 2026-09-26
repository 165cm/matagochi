/* ログイン（Google・メールのコード）。機種変更しても、ログインするとチケット・家族の共有・自分の名前が戻る。 */
let authConfig = null, account = null, authBusy = false, loginEmail = "", loginCodeSent = false;
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
  // 描き直すのは設定画面を開いている時だけ（入力中の画面や初回設定の自動送りを邪魔しない）。
  if (state.view === "settings" && state.onboarded) render();
}
function signOutLocal() {
  try { localStorage.removeItem("ripigochi-session"); } catch {}
  account = null;
}
async function authPost(path, body) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 20_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "ログインできませんでした。");
  return data;
}
// ログインできたら：前の端末の識別子（チケット）と家族の合言葉（共有データ）を戻し、この端末の分を覚えさせる。
async function afterSignIn({ token, account: acct }) {
  try { localStorage.setItem("ripigochi-session", token); } catch {}
  account = acct;
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
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
    if (response.ok) account = await response.json();
  } catch {}
}
async function signInWithGoogle(credential) {
  if (authBusy) return;
  authBusy = true; render();
  try { await afterSignIn(await authPost("google", { credential })); }
  catch (error) { showToast(error.message); }
  finally { authBusy = false; render(); }
}
let gisLoading = null, gisReady = false;
function loadGis() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  return (gisLoading ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true; script.onload = resolve; script.onerror = () => { gisLoading = null; reject(new Error("gis")); };
    document.head.append(script);
  }));
}
// Googleのボタンは Google の部品を描く（画面を描き直すたびに置き直す）。
async function mountGoogleButton() {
  const el = document.querySelector("#google-login");
  if (!el || !authConfig?.google || account) return;
  try { await loadGis(); } catch { el.textContent = "Googleのボタンを読み込めませんでした。"; return; }
  if (!gisReady) { google.accounts.id.initialize({ client_id: authConfig.google, callback: (r) => signInWithGoogle(r.credential), ux_mode: "popup" }); gisReady = true; }
  const target = document.querySelector("#google-login");
  if (target && !target.childElementCount) google.accounts.id.renderButton(target, { theme: "outline", size: "large", text: "signin_with", shape: "pill", locale: "ja", width: Math.min(320, target.clientWidth || 320) });
}
function renderAccountPanel() {
  if (!loginAvailable() && !account) return "";
  if (account) return `<section class="panel account-panel"><p class="account-in"><span class="account-dot" aria-hidden="true"></span>ログイン中 <b>${escapeHtml(account.email)}</b></p><p class="muted small">機種変更しても、同じ方法でログインすると、チケット・家族の共有・自分の名前が戻ります。</p><button type="button" class="text-button" data-action="auth-signout">ログアウト</button></section>`;
  const email = authConfig?.email ? (loginCodeSent
    ? `<label class="small" for="login-code">${escapeHtml(loginEmail)} に届いた6桁のコード</label><div class="login-row"><input id="login-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><button type="button" class="primary-button" data-action="auth-email-verify" ${authBusy ? "disabled" : ""}>ログイン</button></div><button type="button" class="text-button" data-action="auth-email-reset">メールアドレスを変える</button>`
    : `<div class="login-row"><input id="login-email" class="input" type="email" autocomplete="email" placeholder="メールアドレス" value="${escapeAttr(loginEmail)}"><button type="button" class="secondary-button" data-action="auth-email-start" ${authBusy ? "disabled" : ""}>コードを送る</button></div>`) : "";
  return `<section class="panel account-panel"><h3>🔐 ログイン</h3><p class="small">ログインしておくと、機種変更やデータが消えた時も、<b>チケット・家族の共有</b>が戻ります。</p>${authConfig?.google ? `<div id="google-login" class="google-login" aria-label="Googleでログイン"></div>` : ""}${email}${authBusy ? '<p class="muted small">確かめています…</p>' : ""}</section>`;
}
async function handleAuthAction(action) {
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
