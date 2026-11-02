/* 通知（Web Push）。献立の予定は端末にあるので、この先2週間のお知らせを端末で作ってサーバーへ送る。
   サーバーは15分ごとの定期実行で、時間になったものを届ける（数分〜15分ほど前後することがある）。
   iPhoneは、ホーム画面に追加したアプリでだけ通知を受け取れる。設定は端末ごと（家族の端末には広がらない）。 */
const PUSH_KEY = "ripigochi-push";
const PUSH_TYPES = [
  ["decide", "🗓", "献立を決める日", "買い物の3時間前（まだ決めていない時）"],
  ["shop", "🛒", "買い物の時間", "買い物の30分前"],
  ["tonight", "🍳", "今夜の一品", "毎日、決めた時間に"],
  ["record", "✍️", "作った記録", "21時（まだ記録していない時）"],
];
let pushBusy = false, pushMessage = "", pushSyncTimer = null;
function pushInfo() {
  try { return { decide: true, shop: true, tonight: true, record: false, tonightTime: "16:30", ...JSON.parse(localStorage.getItem(PUSH_KEY) || "{}") }; } catch { return { decide: true, shop: true, tonight: true, record: false, tonightTime: "16:30" }; }
}
function savePush(info) { try { localStorage.setItem(PUSH_KEY, JSON.stringify(info)); } catch {} }
const pushSupported = () => !!API_BASE_URL && "serviceWorker" in (globalThis.navigator || {}) && "PushManager" in globalThis && "Notification" in globalThis;
// 通知を使えるか：unsupported（このブラウザは非対応）／install（iPhoneはホーム画面に追加してから）／denied（ブラウザで拒否）／off／on
function pushState() {
  if (isIOSDevice() && !isInstalledApp()) return "install";
  if (!pushSupported()) return "unsupported";
  if (globalThis.Notification?.permission === "denied") return "denied";
  return pushInfo().endpoint ? "on" : "off";
}
const atLocal = (date, hm) => new Date(`${date}T${hm}:00`);
// この先2週間のお知らせ。決めた・買った・作ったら、次に送る時にはもう入らない。
function pushSchedule(info = pushInfo()) {
  const items = [], now = Date.now();
  const add = (id, at, title, body, url = "") => { if (at.getTime() > now && at.getTime() < now + 14 * 86_400_000) items.push({ id, at: at.toISOString(), title, body, url }); };
  if (rhythmOn()) {
    for (const b of currentBlocks()) {
      const shopAt = new Date(b.shopAt), status = blockStatus(b);
      const range = blockRange(b), hm = b.shopAt.slice(11, 16);
      if (info.decide && status === "open") add(`decide-${b.key}`, new Date(shopAt.getTime() - 3 * 3600_000), `🗓 ${range}の献立を決めよう`, `${hm}の買い物までに。候補はもう並んでいます。`, "?view=plan");
      if (info.shop && ["open", "decided"].includes(status)) add(`shop-${b.key}`, new Date(shopAt.getTime() - 30 * 60_000), `🛒 ${hm}は買い物の時間`, `${range}の分をまとめて。リストはアプリに。`, "?view=shopping");
    }
  }
  const plan = dailyPlan(), locks = typeof lockedDates === "function" ? lockedDates(plan) : new Set();
  for (const d of plan) {
    if (locks.has(d.date)) continue;
    const slot = d.slot, recipe = slot?.status === "confirmed" ? slot.recipe : !slot && !d.off ? d.candidate?.recipe : null;
    if (!recipe) continue;
    const f = typeof folderOfRecipe === "function" ? folderOfRecipe(recipe) : null;
    const title = f ? `${f.name}（${childText(recipe)}）` : recipe.title;
    if (info.tonight) add(`tonight-${d.date}`, atLocal(d.date, info.tonightTime || "16:30"), `🍳 今夜は「${title}」`, `${recipe.planning?.minutes ? `${recipe.planning.minutes}分・` : ""}作り方はアプリで。`, "?view=today");
    if (info.record && slot?.status === "confirmed") add(`record-${d.date}`, atLocal(d.date, "21:00"), `✍️ 今夜の「${title}」、作った？`, "記録すると経験値がたまります。", "?view=today");
  }
  return items;
}
function b64ToBytes(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushPost(path, body) {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify(body) }, 20_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "通知の設定ができませんでした。");
  return data;
}
async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
async function enablePush() {
  if (pushBusy) return;
  pushBusy = true; pushMessage = ""; render();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error(permission === "denied" ? "通知がブロックされています。端末の設定から、リピごちの通知を許可してください。" : "通知が許可されませんでした。");
    const { publicKey } = await (await fetchWithTimeout(`${API_BASE_URL}/api/push/key`, {}, 15_000)).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
    const info = { ...pushInfo(), endpoint: sub.endpoint };
    await pushPost("/api/push/subscribe", { subscription: sub.toJSON(), schedule: pushSchedule(info) });
    savePush({ ...info, sentHash: "" });
    if (!state.onboarded && state.onboardingDraft) state.onboardingDraft.remindAdded = true;
    trackDaily("push_on");
    showToast("通知をオンにしました。");
  } catch (error) {
    pushMessage = error.message || "通知をオンにできませんでした。";
  }
  pushBusy = false; render();
}
async function disablePush() {
  const info = pushInfo();
  // 運営の知らせ（下）も同じ登録を使うので、受け取っている間は端末の登録は残す。
  if (!adminPushEndpoint()) try { const sub = await currentSubscription(); await sub?.unsubscribe(); } catch {}
  if (info.endpoint) await pushPost("/api/push/unsubscribe", { endpoint: info.endpoint }).catch(() => {});
  savePush({ ...info, endpoint: "", sentHash: "" });
  trackDaily("push_off");
  render();
}
// 献立・買い物・記録が変わったら、お知らせを送り直す（少し待ってまとめる。同じ中身なら送らない）。
function queuePushSync(delay = 3000) {
  const info = pushInfo();
  if (!info.endpoint || !pushSupported()) return;
  clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(async () => {
    try {
      const schedule = pushSchedule(info);
      const hash = JSON.stringify(schedule.map((x) => [x.id, x.at, x.title]));
      if (hash === info.sentHash) return;
      const sub = await currentSubscription();
      if (!sub) { savePush({ ...info, endpoint: "" }); return; }
      await pushPost("/api/push/subscribe", { subscription: sub.toJSON(), schedule });
      savePush({ ...pushInfo(), endpoint: sub.endpoint, sentHash: hash });
    } catch {}
  }, delay);
}
function renderPushSettings() {
  const st = pushState(), info = pushInfo();
  if (st === "install") return `<p class="small">iPhoneは、<b>ホーム画面に追加したリピごち</b>で通知を受け取れます。</p>${installSteps()}`;
  if (st === "unsupported") return '<p class="small muted">このブラウザでは通知を使えません。Chrome・Safari（ホーム画面に追加）で開いてください。</p>';
  if (st === "denied") return '<p class="small">通知がブロックされています。端末の「設定」→ 通知 から、リピごち（またはブラウザ）の通知を許可してください。</p>';
  if (st === "off") return `<p class="small">献立を決める日・買い物の時間・今夜の一品を、通知でお知らせします。</p>${dailyButton("life-push-on", pushBusy ? "準備しています…" : "🔔 通知をオンにする", pushBusy ? "disabled" : "", true)}${pushMessage ? `<p class="form-error">${escapeHtml(pushMessage)}</p>` : ""}`;
  return `<div class="push-types">${PUSH_TYPES.map(([id, icon, label, hint]) => `<label class="push-type"><input type="checkbox" data-push-type="${id}" ${info[id] ? "checked" : ""}><span><b>${icon} ${label}</b><small>${hint}</small></span>${id === "tonight" ? `<select class="input push-time" data-push-time aria-label="今夜の一品のお知らせ時間">${["15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"].map((t) => `<option ${info.tonightTime === t ? "selected" : ""}>${t}</option>`).join("")}</select>` : ""}</label>`).join("")}</div>
    <p class="muted small">届く時間は、数分〜15分ほど前後することがあります。</p>
    <div class="push-actions">${dailyButton("life-push-test", "テスト通知を送る")}<button type="button" class="text-button" data-action="life-push-off">通知をオフにする</button></div>`;
}
function bindPushSettings() {
  document.querySelectorAll("[data-push-type]").forEach((el) => el.addEventListener("change", () => { savePush({ ...pushInfo(), [el.dataset.pushType]: el.checked }); queuePushSync(300); }));
  document.querySelector("[data-push-time]")?.addEventListener("change", (e) => { savePush({ ...pushInfo(), tonightTime: e.target.value }); queuePushSync(300); });
}
function handlePushAction(action) {
  if (handleAdminPushAction(action)) return true;
  if (!action.startsWith("life-push")) return false;
  if (action === "life-push-on") enablePush();
  else if (action === "life-push-off") disablePush();
  else if (action === "life-push-test") pushPost("/api/push/test", { endpoint: pushInfo().endpoint }).then(() => showToast("テスト通知を送りました。"), (e) => showToast(e.message));
  return true;
}

// ── 運営の方へ：「⚡️ 異議あり」が届いたら、この端末に通知する（APP_MAP §52-12。2026-11-02 のユーザーの判断：アプリの通知）。
// 管理の合言葉は、登録する時だけ使い、端末には残さない。外す時は登録の宛先だけで外せる。
const ADMIN_PUSH_KEY = "ripigochi-admin-push";
let adminPushBusy = false, adminPushMessage = "";
function adminPushEndpoint() { try { return localStorage.getItem(ADMIN_PUSH_KEY) || ""; } catch { return ""; } }
async function adminPushPost(path, body, token = "") {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body || {}) }, 20_000);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 403 ? "合言葉が違います。" : data.error?.message || "うまくいきませんでした。");
  return data;
}
async function enableAdminPush() {
  if (adminPushBusy) return;
  const token = String(document.querySelector("#admin-push-token")?.value || "").trim();
  if (!token) { adminPushMessage = "管理の合言葉を入れてください。"; render(); return; }
  adminPushBusy = true; adminPushMessage = ""; render();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("通知が許可されませんでした。端末の設定から、リピごちの通知を許可してください。");
    const { publicKey } = await (await fetchWithTimeout(`${API_BASE_URL}/api/push/key`, {}, 15_000)).json();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
    await adminPushPost("/api/admin/push/subscribe", { subscription: sub.toJSON() }, token);
    try { localStorage.setItem(ADMIN_PUSH_KEY, sub.endpoint); } catch {}
    await adminPushPost("/api/admin/push/test", {}, token).catch(() => {});
    showToast("この端末に「異議あり」の知らせが届きます。試しに1件送りました。");
  } catch (error) {
    adminPushMessage = error.message || "うまくいきませんでした。";
  }
  adminPushBusy = false; render();
}
async function disableAdminPush() {
  const endpoint = adminPushEndpoint();
  if (endpoint) await adminPushPost("/api/admin/push/unsubscribe", { endpoint }).catch(() => {});
  try { localStorage.removeItem(ADMIN_PUSH_KEY); } catch {}
  showToast("運営の知らせを止めました。");
  render();
}
function renderAdminPush() {
  const st = pushState();
  let body;
  if (["install", "unsupported", "denied"].includes(st)) body = '<p class="small muted">この端末では通知を受け取れません（上の「通知」の案内をご覧ください）。</p>';
  else if (adminPushEndpoint()) body = `<p class="small">✓ この端末に「⚡️ 異議あり」の知らせが届きます（続けて届いた時は15分に1回にまとめます）。</p><button type="button" class="text-button" data-action="life-admin-push-off">受け取るのをやめる</button>`;
  else body = `<p class="small">「⚡️ 異議あり」が届いたら、この端末に通知します。</p>
    <input id="admin-push-token" class="input" type="password" autocomplete="off" placeholder="管理の合言葉" aria-label="管理の合言葉">
    ${dailyButton("life-admin-push-on", adminPushBusy ? "準備しています…" : "⚡️ この端末で受け取る", adminPushBusy ? "disabled" : "")}
    ${adminPushMessage ? `<p class="form-error">${escapeHtml(adminPushMessage)}</p>` : ""}`;
  return `<details class="admin-push"${adminPushEndpoint() || adminPushMessage ? " open" : ""}><summary>🛠 運営の方へ</summary>${body}</details>`;
}
function handleAdminPushAction(action) {
  if (action === "life-admin-push-on") { enableAdminPush(); return true; }
  if (action === "life-admin-push-off") { disableAdminPush(); return true; }
  return false;
}
