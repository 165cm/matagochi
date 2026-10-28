/* 1日の上限（2026-10-28 のユーザーの判断で、チケットの仕組みをやめて置き換えた）。
   動画から作り方を読む・献立の絵など、AI の費用がかかる操作は、家庭ごとに1日の回数まで（数えるのはサーバー：api/src/tickets.js）。
   配る・買う・ためる・確認の画面はない。知らせるのは2回だけ：上限の半分に達した時と、残り1回になった時（その日に1度ずつ）。
   上限に達したら、その操作の時に「今日の上限に達しました」。判定は純粋関数（Nodeのテストでも使う）、画面はその下。 */
(function (root) {
  // view：サーバーの { used, limit, left, day, unlimited }。seen：その日にもう出した知らせ（["half", "last"] など）。
  // 返すのは、いま出す知らせ（"last" ＞ "half"）か ""。
  function notice(view, seen = []) {
    if (!view || view.unlimited || !(view.limit > 0)) return "";
    if (view.left === 1 && !seen.includes("last")) return "last";
    if (view.left > 1 && view.used >= Math.ceil(view.limit / 2) && !seen.includes("half")) return "half";
    return "";
  }
  const api = { notice };
  root.Tickets = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

/* ---- 画面（ブラウザのみ） ---- */
let ticketState = (() => { try { const v = JSON.parse(localStorage.getItem("ripigochi-tickets") || "null"); return v && typeof v.limit === "number" ? v : null; } catch { return null; } })();
let limitNotice = null; // { kind: "half" | "last" | "over", left, limit }

function deviceKey() {
  try {
    let id = localStorage.getItem("ripigochi-device-id");
    if (!id) { id = `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem("ripigochi-device-id", id); }
    return id;
  } catch { return ""; }
}
// 回数は家庭ごと（つながっていれば同期ルーム、なければこの端末）。
function householdKey() { return state.sync?.roomId || deviceKey(); }
function devCode() { try { return localStorage.getItem("ripigochi-dev-code") || ""; } catch { return ""; } }
function ticketHeaders() {
  const prev = state.sync?.roomId ? deviceKey() : "";
  return { "X-Household": householdKey(), ...(prev ? { "X-Household-Prev": prev } : {}), ...(devCode() ? { "X-Dev-Code": devCode() } : {}) };
}
// その日にもう出した知らせ。保存できない端末（プライベートブラウズなど）でも、開いている間は覚えておく。
let limitSeenMemo = { day: "", kinds: [] };
function limitSeen(day) {
  let saved = [];
  try { const v = JSON.parse(localStorage.getItem("ripigochi-limit-seen") || "{}"); if (v.day === day) saved = v.kinds || []; } catch {}
  return [...new Set([...saved, ...(limitSeenMemo.day === day ? limitSeenMemo.kinds : [])])];
}
// サーバーから届いた回数を覚え、半分・残り1回の知らせを出す（その日に1度ずつ）。
function setTickets(view) {
  if (!view || typeof view.limit !== "number") return;
  ticketState = { ...view, household: householdKey() };
  try { localStorage.setItem("ripigochi-tickets", JSON.stringify(ticketState)); } catch {}
  const seen = limitSeen(view.day);
  const kind = Tickets.notice(view, seen);
  if (!kind) return;
  limitNotice = { kind, left: view.left, limit: view.limit };
  limitSeenMemo = { day: view.day, kinds: [...seen, kind] };
  try { localStorage.setItem("ripigochi-limit-seen", JSON.stringify({ day: view.day, kinds: [...seen, kind] })); } catch {}
}
const ticketsOn = () => !!API_BASE_URL && !!state?.onboarded;
// 起動時などに、その日の回数を読む（サーバーに家庭を登録する役目もある）。
async function refreshTickets() {
  if (!ticketsOn()) return;
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/tickets`, { headers: ticketHeaders() }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    const before = !!limitNotice;
    setTickets(data.tickets);
    if (limitNotice && !before) render();
  } catch {}
}
// 上限に達した時（サーバーが daily_limit を返した時）。
function showLimitReached() {
  const t = ticketState;
  limitNotice = { kind: "over", left: 0, limit: t?.limit || 0 };
  render();
}
const isLimitError = (error) => error?.code === "daily_limit" || error?.code === "no_tickets";
// AI の費用がかかる操作：上限に達していると分かっていれば、押した時に知らせる。それ以外はそのまま（数えるのはサーバー）。
function withDailyLimit(run) {
  if (ticketState && !ticketState.unlimited && ticketState.day === limitToday() && ticketState.left < 1) return showLimitReached();
  return run();
}
// 日本時間の今日（サーバーの日の区切りと同じ）。
const limitToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
function renderLimitNotice() {
  const n = limitNotice;
  if (!n) return "";
  const body = n.kind === "over"
    ? `<p class="quota-title">今日の上限に達しました</p><p class="small">動画から作り方を読むのは、1日${n.limit}回までです。明日（0時から）また使えます。説明欄から読む・手で入力するのは、いつでもできます。</p>`
    : n.kind === "last"
      ? `<p class="quota-title">今日は、あと1回です</p><p class="small">動画から作り方を読むのは、1日${n.limit}回まで。明日（0時から）また${n.limit}回に戻ります。</p>`
      : `<p class="quota-title">今日の上限の半分を使いました</p><p class="small">動画から作り方を読むのは、1日${n.limit}回まで。今日はあと${n.left}回です。</p>`;
  // 開発者コード（運営のテスト用。入れた端末は数えない）は、上限に達した時の画面にだけ置く。
  const dev = n.kind === "over" ? `<details class="quota-dev"><summary>開発者コード</summary><label class="sr-only" for="dev-code">開発者コード</label><input id="dev-code" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="off"><button type="button" class="secondary-button full-button" data-action="limit-dev">決定</button></details>` : "";
  return `<div class="quota-sheet limit-notice" role="dialog" aria-modal="true" aria-label="1日の上限"><div class="quota-card">${body}<button type="button" class="primary-button full-button" data-action="limit-ok">OK</button>${dev}</div></div>`;
}
function handleTicketAction(action) {
  if (action === "limit-ok") { limitNotice = null; render(); return true; }
  if (action === "limit-dev") {
    const code = String(document.querySelector?.("#dev-code")?.value || "").trim().slice(0, 6);
    if (code) { try { localStorage.setItem("ripigochi-dev-code", code); } catch {} }
    limitNotice = null;
    showToast(code ? "開発者コードを設定しました。もう一度お試しください。" : "コードが空です。");
    render();
    refreshTickets();
    return true;
  }
  return false;
}
