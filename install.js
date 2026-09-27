/* ホーム画面に追加（アプリとして使う）の案内。
   iPhoneは「共有 → ホーム画面に追加」を覚えてもらう必要がある。追加すると：通知が届く（iPhoneは追加したアプリだけ）、
   Safariが7日使わないサイトのデータを消す対象から外れる、ホーム画面から1タップで開ける。
   出すのは：最初の献立ができたあと／初めて「作った！」のあと／閉じてから7日あけて、最大3回。追加済みなら出さない。 */
const INSTALL_KEY = "ripigochi-install";
const INSTALL_MAX = 3;
const INSTALL_GAP_DAYS = 7;
let installPrompt = null; // Android（Chrome）の「インストール」をあとで出すためのイベント
let installOpen = false;  // 設定などから開いた案内
globalThis.addEventListener?.("beforeinstallprompt", (event) => { event.preventDefault(); installPrompt = event; });
globalThis.addEventListener?.("appinstalled", () => { installPrompt = null; saveInstall({ ...installInfo(), installed: true }); trackDaily("app_installed"); render(); });
function installInfo() {
  try { return JSON.parse(localStorage.getItem(INSTALL_KEY) || "{}") || {}; } catch { return {}; }
}
function saveInstall(info) {
  try { localStorage.setItem(INSTALL_KEY, JSON.stringify(info)); } catch {}
}
// 使っている環境：ios（Safari）／ios-other（iPhoneのChromeなど）／inapp（LINE・Instagramなどの中）／android／other
function installPlatform() {
  const ua = String(globalThis.navigator?.userAgent || "");
  if (/Line\/|Instagram|FBAN|FBAV|FB_IAB|Twitter|MicroMessenger|YJApp|GSA\//i.test(ua)) return "inapp";
  if (isIOSDevice()) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}
// いま案内を出すか（今日の画面のカード）。
function installDue() {
  if (isInstalledApp()) return false;
  const info = installInfo(), platform = installPlatform();
  if (info.installed || platform === "other" || (info.dismissed || 0) >= INSTALL_MAX) return false;
  if (!state.onboarded || !Object.values(state.mealSlots || {}).some((s) => s.status === "confirmed" || s.status === "cooked")) return false;
  if (!info.dismissed) return true; // 1回目：最初の献立が決まったあと
  if (info.cookTrigger && !info.cookShown) return true; // 2回目：初めて「作った！」のあと
  return Date.now() - Date.parse(info.lastAt || 0) >= INSTALL_GAP_DAYS * 86_400_000;
}
// 初めて「作った！」を押した時に呼ぶ。
function noteInstallCook() {
  const info = installInfo();
  if (!info.cookTrigger) saveInstall({ ...info, cookTrigger: true });
}
const SHARE_ICON = '<svg class="ios-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const PLUS_ICON = '<svg class="ios-share" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function installSteps(platform = installPlatform()) {
  if (platform === "inapp") return `<p class="small">LINEやInstagramの中の画面からは追加できません。<b>Safari（Androidは Chrome）で開き直して</b>ください。</p>
    <ol class="install-steps"><li>右上（または右下）の「…」から<b>「ブラウザで開く」</b></li><li>開いた画面で、この案内の手順どおりに追加</li></ol>
    ${dailyButton("life-install-copy", "🔗 アプリのURLをコピー")}`;
  if (platform === "ios" || platform === "ios-other") return `<ol class="install-steps">
    <li>画面${platform === "ios" ? "下" : "上"}の <b>共有ボタン</b> ${SHARE_ICON} を押す${platform === "ios" ? "（見えない時は、画面を少し上にスクロール）" : ""}</li>
    <li>下にスクロールして <b>「ホーム画面に追加」</b> ${PLUS_ICON} を押す</li>
    <li>右上の <b>「追加」</b> を押す</li></ol>`;
  if (installPrompt) return `<p class="small">ボタンを押して「インストール」を選ぶだけです。</p>${dailyButton("life-install-prompt", "📲 ホーム画面に追加する", "", true)}`;
  return `<ol class="install-steps"><li>右上のメニュー <b>⋮</b> を押す</li><li><b>「ホーム画面に追加」</b>または<b>「アプリをインストール」</b>を押す</li></ol>`;
}
const INSTALL_WHY = '<ul class="install-why"><li>🔔 献立を決める日・買い物の時間の<b>通知</b>（準備中）が受け取れる</li><li>💾 記録が<b>消えにくく</b>なる</li><li>📱 ホーム画面から<b>1タップ</b>で開ける</li></ul>';
function renderInstallCard() {
  if (!installOpen && !installDue()) return "";
  return `<section class="panel install-card" aria-label="ホーム画面に追加">
    <div class="install-head"><img src="icons/icon-192.png" alt="" width="44" height="44"><p><b>リピごちを、ホーム画面に</b><small>アプリのように使えます（無料・30秒）</small></p></div>
    ${INSTALL_WHY}${installSteps()}
    <button type="button" class="text-button" data-action="life-install-later">${installOpen ? "閉じる" : "あとで"}</button></section>`;
}
function renderInstallSettings() {
  const done = isInstalledApp() || installInfo().installed;
  return done ? '<p class="small">✓ ホーム画面から開いています。</p>' : `${INSTALL_WHY}${installSteps()}`;
}
function handleInstallAction(action) {
  if (!action.startsWith("life-install")) return false;
  const info = installInfo();
  if (action === "life-install-later") {
    if (!installOpen) {
      saveInstall({ ...info, dismissed: (info.dismissed || 0) + 1, lastAt: new Date().toISOString(), ...(info.cookTrigger ? { cookShown: true } : {}) });
      trackDaily("install_later", { n: (info.dismissed || 0) + 1, platform: installPlatform() });
    }
    installOpen = false;
  } else if (action === "life-install-open") installOpen = true;
  else if (action === "life-install-prompt" && installPrompt) {
    const event = installPrompt;
    installPrompt = null;
    event.prompt?.();
    event.userChoice?.then((c) => { trackDaily("install_prompt", { outcome: c?.outcome || "" }); if (c?.outcome === "accepted") { saveInstall({ ...installInfo(), installed: true }); installOpen = false; render(); } });
    return true;
  } else if (action === "life-install-copy") {
    const url = `${location.origin}${location.pathname}`;
    globalThis.navigator?.clipboard?.writeText?.(url).then(() => showToast("URLをコピーしました。Safari（Chrome）に貼りつけて開いてください。"), () => showToast(url));
    return true;
  }
  render();
  return true;
}
