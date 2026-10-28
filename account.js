/* ログイン（Google・メールのコード）。機種変更しても、ログインすると家族の共有・自分の名前が戻る。 */
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
let accountSyncConnecting = false;
async function ensureAccountSync() {
  if (!account || !authToken() || authTransferPage() || state.sync?.paused || accountSyncConnecting) return false;
  if (syncInFlight) { syncQueued = true; return false; }
  accountSyncConnecting = true; updateSyncSaveLabel();
  try {
    const email = account.email, token = authToken();
    const preferredCode = !state.sync?.accountEmail || state.sync.accountEmail === email ? state.sync?.code || "" : "";
    const linked = await authPost("sync", { preferredCode }, true);
    if (account?.email !== email || authToken() !== token || state.sync?.paused) return false;
    const roomId = await deriveSyncRoomId(normalizeSyncCode(linked.syncCode));
    if (syncInFlight) return false;
    const backupKey = await saveIntegrationBackup(roomId);
    if (account?.email !== email || authToken() !== token || state.sync?.paused) return false;
    account = linked;
    if (state.sync.roomId !== roomId) {
      clearTimeout(syncTimer);
      state.sync = { code: linked.syncCode, roomId, lastSyncAt: "", accountEmail: email, backupKey, planBase: null, conflicts: {} };
      lastSyncedFingerprint = "";
    } else { state.sync.accountEmail = email; state.sync.backupKey = backupKey; }
    saveState({ scheduleSync: false });
    if (linked.me && state.family.includes(linked.me)) state.me = linked.me;
    await refreshSyncDevice({review:false});
    const synced = await syncNow({ silent: true, fromAccount: true });
    if (synced) { await completeMainProposal(); await refreshSyncDevice({review:true}); }
    else await submitPlanForMain();
    if (linked.me && state.family.includes(linked.me)) { state.me = linked.me; saveState({ scheduleSync: false }); }
    return synced;
  } finally { accountSyncConnecting = false; updateSyncSaveLabel(); }
}
async function loadAuth() {
  if (!API_BASE_URL) return;
  try { authConfig = await (await fetchWithTimeout(`${API_BASE_URL}/api/auth/config`, {}, 10_000)).json(); } catch { authConfig = null; }
  const token = authToken();
  if (token) {
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, { headers: authHeaders() }, 10_000);
      const data = response.ok ? await response.json() : null;
      if (authToken() !== token) return;
      if (response.status === 401) signOutLocal();
      else if (response.ok) account = data;
    } catch {}
  }
  if (account && !authTransferPage()) { try { await ensureAccountSync(); } catch (e) { syncRuntimeStatus = syncErrorText(e); updateSyncSaveLabel(); } }
  authLoaded = true;
  updateSyncSaveLabel();
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
// ログインできたら：前の端末の識別子（1日の上限の数え先）と家族の合言葉（共有データ）を戻し、この端末の分を覚えさせる。
async function afterSignIn({ token, account: acct }) {
  if (!authTransferPage() && state.sync?.accountEmail && state.sync.accountEmail !== acct.email && !window.confirm("別のアカウントです。この端末の献立を新しいアカウントへ統合しますか？統合前の献立は残します。")) return;
  try { localStorage.setItem("ripigochi-session", token); } catch {}
  account = acct;
  if (authTransferPage()) { showToast("ログインしました。引き継ぎコードを発行できます。"); render(); return; }
  if (acct.deviceId && acct.deviceId !== deviceKey()) try { localStorage.setItem("ripigochi-device-id", acct.deviceId); } catch {}
  let restored = false;
  try { restored = await ensureAccountSync(); }
  catch (error) { syncRuntimeStatus = syncErrorText(error); }
  await linkAccount();
  loginEmail = ""; loginCodeSent = false;
  showToast(restored ? "ログインしました。家族の共有を戻しました。" : "ログインしました。");
  refreshTickets();
  render();
}
// アカウントに、この端末の識別子・合言葉・自分の名前を覚えさせる。合言葉は、共有をやめた時だけ消す。
async function linkAccount({ leftRoom = false } = {}) {
  if (!authToken() || !API_BASE_URL) return;
  const token = authToken();
  const body = { deviceId: deviceKey(), me: state.me || "", ...(!account?.syncManaged && state.sync?.code ? { syncCode: state.sync.code } : {}) };
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/auth/me`, { method: "PUT", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) }, 10_000);
    if (response.ok) { const data = await response.json(); if (authToken() === token) account = data; }
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
  if (account) return `<section class="panel account-panel"><p class="account-in"><span class="account-dot" aria-hidden="true"></span>ログイン中 <b>${escapeHtml(account.email)}</b></p><p class="muted small">同じアカウントでログインすると、献立・レシピ・記録をほかの端末と共有します。変更が重なった日は、残す献立を選べます。</p><button type="button" class="text-button" data-action="auth-signout" ${authBusy ? "disabled" : ""}>ログアウト</button>${renderTransferIssuer()}${renderMainDeviceSettings()}${authBusy ? '<p role="status">確かめています…</p>' : ""}</section>`;
  const email = authConfig?.email ? (loginCodeSent
    ? `<label class="small" for="login-code">${escapeHtml(loginEmail)} に届いた6桁のコード</label><div class="login-row"><input id="login-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456"><button type="button" class="primary-button" data-action="auth-email-verify" ${authBusy ? "disabled" : ""}>ログイン</button></div><button type="button" class="text-button" data-action="auth-email-reset">メールアドレスを変える</button>`
    : `<div class="login-row"><input id="login-email" class="input" type="email" autocomplete="email" placeholder="メールアドレス" value="${escapeAttr(loginEmail)}"><button type="button" class="secondary-button" data-action="auth-email-start" ${authBusy ? "disabled" : ""}>コードを送る</button></div>`) : "";
  return `<section class="panel account-panel"><h3>🔐 ログイン</h3><p class="small">ログインしておくと、機種変更やデータが消えた時も、<b>家族の共有</b>が戻ります。</p>${authConfig?.google ? `<div id="google-login" class="google-login" aria-label="Googleでログイン"></div>` : ""}${email}<p id="auth-message" class="small muted" role="status">${escapeHtml(authMessage)}</p>${renderTransferHelp()}${authBusy ? '<p class="muted small">確かめています…</p>' : ""}</section>`;
}
async function handleAuthAction(action) {
  if (authBusy && action.startsWith("auth-")) return true;
  if (action === "auth-main-device") {
    if (syncInFlight || accountSyncConnecting) { showToast("保存が終わってからお試しください。"); return true; }
    if (!window.confirm("この端末をメインにします。献立がぶつかった時は、この端末で選びます。家族の役割は変わりません。")) return true;
    authBusy=true;
    try { await deviceRequest({action:'select',expectedPrimary:state.sync.deviceState?.primary});await ensureAccountSync();showToast("この端末をメインにしました。"); }
    catch(e){showToast(e.message);}
    finally{authBusy=false;render();}return true;
  }
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

if (typeof window !== "undefined") window.addEventListener?.("online", () => {
  if (authToken()) loadAuth();
  else if (syncEnabled()) syncNow({ silent: true });
});

// Browser-local ID: deviceKey() is where the account's daily limit is counted, shared across devices.
function syncClientId() {
  let id=localStorage.getItem('ripigochi-sync-client');
  if (!id) { id=generateId('browser-');localStorage.setItem('ripigochi-sync-client',id); }
  return id;
}
function syncClientKind() { return /iPhone|iPod|Android.*Mobile/i.test(navigator.userAgent || '') ? 'phone' : 'computer'; }
function mainDeviceName() {
  const d=state.sync?.deviceState;
  return d?.devices?.[d.primary]?.label || 'スマホ';
}
function canResolvePlans() {
  return !state.sync?.accountEmail || !state.sync?.deviceState?.primary || state.sync.deviceState.primary===syncClientId();
}
async function deviceRequest(body={}) {
  const token=authToken(), room=state.sync.roomId;
  const result=await authPost('devices',{clientId:syncClientId(),kind:syncClientKind(),syncCode:normalizeSyncCode(state.sync.code),...body},true);
  if (authToken()!==token || state.sync.roomId!==room) throw new Error('保存先が変わりました。もう一度確かめてください。');
  if (!result.primary || !result.devices || !result.proposals) throw new Error('端末の設定を取得できませんでした。');
  state.sync.deviceState={primary:result.primary,explicit:result.explicit,devices:result.devices};
  return result;
}
async function refreshSyncDevice({review=false}={}) {
  const registry=await deviceRequest();
  const own=registry.proposals[syncClientId()], submitted=state.sync.submittedPlan;
  let changed=false;
  if (own?.status==='resolved' && submitted?.id===own.id) {
    const plan=planSnapshot(state);state.sync.planBase ||= {};
    for (const date of Object.keys(own.plan)) {
      const result=own.result[date];
      if (samePlan(plan[date],submitted.plan[date])) {if(result)plan[date]=result;else delete plan[date];}
      if(result)state.sync.planBase[date]=result;else delete state.sync.planBase[date];
      delete state.sync.conflicts[date];
    }
    putPlan(state,plan);state.sync.submittedPlan=null;state.sync.revision='';changed=true;
  }
  const reviewing=state.sync.reviewedProposal;
  if(reviewing && (registry.proposals[reviewing.source]?.id!==reviewing.id || registry.proposals[reviewing.source]?.status==='resolved')) {
    for(const date of reviewing.dates) if(state.sync.conflicts[date]?.proposalId===reviewing.id) delete state.sync.conflicts[date];
    state.sync.reviewedProposal=null;changed=true;
  }
  // One proposal at a time, preserving unresolved choices across reloads.
  if (review && canResolvePlans() && !isViewer() && !state.sync.reviewedProposal && !Object.keys(state.sync.conflicts || {}).length) {
    const next=Object.entries(registry.proposals).find(([id,p])=>id!==syncClientId() && p.status==='pending');
    if(next) {
      const [source,p]=next, plan=planSnapshot(state);
      state.sync.reviewedProposal={source,id:p.id,dates:Object.keys(p.plan)};
      for(const [date,proposed] of Object.entries(p.plan)) if(!samePlan(plan[date],proposed)) state.sync.conflicts[date]={local:plan[date]||null,remote:proposed,sourceLabel:registry.devices[source]?.label || 'サブ端末',proposalId:p.id};
      changed=true;
    }
  }
  saveState({scheduleSync:false});
  if(changed) { if(syncRenderBusy())syncRenderPending=true;else render(); }
}
async function submitPlanForMain() {
  if(canResolvePlans() || !Object.keys(state.sync.conflicts || {}).length)return;
  const current=planSnapshot(state),plan=Object.fromEntries(Object.keys(state.sync.conflicts).map(date=>[date,current[date]||null]));
  let pending=state.sync.submittedPlan;
  if(!pending || !samePlan(pending.plan,plan)) {pending={id:generateId('proposal-'),plan};state.sync.submittedPlan=pending;saveState({scheduleSync:false});}
  await deviceRequest({action:'submit',proposalId:pending.id,plan:pending.plan});
}
async function completeMainProposal() {
  const p=state.sync.reviewedProposal || (state.sync.submittedPlan ? {source:syncClientId(),id:state.sync.submittedPlan.id,dates:Object.keys(state.sync.submittedPlan.plan)} : null);
  if(!p || !canResolvePlans() || Object.keys(state.sync.conflicts || {}).length)return;
  const plan=Object.fromEntries(p.dates.map(d=>[d,state.sync.planBase?.[d]||null]));
  await deviceRequest({action:'resolve',source:p.source,proposalId:p.id,plan});
  state.sync.reviewedProposal=null;saveState({scheduleSync:false});
}
function renderMainDeviceSettings() {
  if(!account || authTransferPage())return '';
  const d=state.sync?.deviceState, mine=d?.primary===syncClientId();
  return `<div class="main-device-settings"><h3>メイン端末</h3><p>${d ? `現在：<b>${escapeHtml(mainDeviceName())}</b>${mine?'（この端末）':''}` : '接続後にスマホを優先して設定します。'}</p><p class="small">PCでも編集できます。同じ日の献立がぶつかった時は、メイン端末で残す献立を選びます。家族の管理者とは別の設定です。</p>${d ? `<button type="button" class="secondary-button" data-action="auth-main-device" ${authBusy?'disabled':''}>${mine?'この端末をメインに固定する':'この端末をメインにする'}</button>`:''}<p class="muted small">初期設定はスマホ優先。PCで先に使い始めた場合は、スマホでログインすると切り替わります。手動で指定した後は自動変更しません。</p></div>`;
}
