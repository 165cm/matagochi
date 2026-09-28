/* チケット（配り方はサーバーが決める。ここは申告と表示）。判定は純粋関数（Nodeのテストでも使う）、画面はその下。
   ・はじめに10枚 ・はじめの3日で動画を3本取り込むと+5枚
   ・はじめの4週：作るたびに+1枚（1週5枚・合計20枚まで） ・そのあと：3回作るごとに+1枚 */
(function (root) {
  const WEEKS = 4, PER_WEEK = 5, MAX = 20, EVERY = 3;
  // 申告する「作った日」：作った記録がある日のうち、はじめた日の前日から、7日前〜今日。申告ずみは除く。
  function cookClaims({ slots, evaluations = [], startDate, today, addDays, claims = [] }) {
    const got = new Set(claims);
    const dates = new Set();
    for (const s of Object.values(slots || {})) if (s?.status === "cooked" && s.date) dates.add(s.date);
    for (const e of evaluations) if (e?.cookedAt && (!e.mealType || e.mealType === "dinner")) dates.add(String(e.cookedAt).slice(0, 10));
    return [...dates].filter((d) => d <= today && d >= addDays(today, -7) && d >= addDays(startDate, -1)).map((d) => `cook-${d}`).filter((id) => !got.has(id)).sort();
  }
  const weekOf = (startDate, today) => Math.floor((Date.parse(today + "T12:00:00Z") - Date.parse(startDate + "T12:00:00Z")) / (7 * 86400000));
  // 次にもらえる分の一言（なければ ""）。
  function nextLine(t) {
    if (!t || t.unlimited) return "";
    const ib = t.importBonus;
    if (ib?.open && ib.have < ib.need) return `📥 動画をあと${ib.need - ib.have}本取り込むと <b>+${ib.bonus}枚</b>`;
    const c = t.cook;
    if (!c) return "";
    if (c.challenge) return c.weekGot < c.perWeek && c.total < c.max ? `🍳 作ると <b>+1枚</b>（今週あと${c.perWeek - c.weekGot}枚）` : "";
    return `🍳 あと${c.every - c.towardNext}回作ると <b>+1枚</b>`;
  }
  const api = { WEEKS, PER_WEEK, MAX, EVERY, cookClaims, weekOf, nextLine };
  root.Tickets = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

/* ---- 画面（ブラウザのみ） ---- */
let ticketState = (() => { try { return JSON.parse(localStorage.getItem("ripigochi-tickets") || "null"); } catch { return null; } })();
let ticketSheet = null; // { need: bool, retry: fn }
let ticketParties = []; // お祝いの順番待ち：[{ welcome: true } | { claims: [...] }]
let ticketAsk = null; // 使う前の確認：{ run }
let ticketCode = "", ticketCodeWrong = false, ticketClaiming = false, ticketClaimTimer = null;
const ticketRejected = new Set();

function deviceKey() {
  try {
    let id = localStorage.getItem("ripigochi-device-id");
    if (!id) { id = `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; localStorage.setItem("ripigochi-device-id", id); }
    return id;
  } catch { return ""; }
}
// チケットは家庭ごと（つながっていれば同期ルーム、なければこの端末）。ルームを作ると端末の分を引き継ぐ。
function householdKey() { return state.sync?.roomId || deviceKey(); }
function devCode() { try { return localStorage.getItem("ripigochi-dev-code") || ""; } catch { return ""; } }
function ticketHeaders() {
  const prev = state.sync?.roomId ? deviceKey() : "";
  return { "X-Household": householdKey(), ...(prev ? { "X-Household-Prev": prev } : {}), ...(devCode() ? { "X-Dev-Code": devCode() } : {}) };
}
function setTickets(view) {
  if (!view || typeof view.balance !== "number") return;
  ticketState = { ...view, household: householdKey() };
  try { localStorage.setItem("ripigochi-tickets", JSON.stringify(ticketState)); } catch {}
  // はじめてのチケットと、新しくもらった分（家族の端末で作った分も）をお祝いする。
  const seen = ticketSeen();
  const fresh = (view.rewards || []).filter((r) => r?.id && !seen.includes(r.id));
  const welcome = !seen.includes("welcome");
  if (fresh.length || welcome) {
    if (welcome) ticketParties.push({ welcome: true });
    if (fresh.length && !welcome) ticketParties.push({ rewards: fresh });
    try { localStorage.setItem("ripigochi-tickets-seen", JSON.stringify([...seen, ...fresh.map((r) => r.id), "welcome"].slice(-200))); } catch {}
  }
  if (view.importBonus?.open && view.importBonus.have >= view.importBonus.need) queueTicketClaim(300);
}
function ticketSeen() { try { return JSON.parse(localStorage.getItem("ripigochi-tickets-seen") || "[]"); } catch { return []; } }
const ticketsOn = () => !!API_BASE_URL && !!state?.onboarded;
async function refreshTickets() {
  if (!ticketsOn()) return;
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/tickets`, { headers: ticketHeaders() }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    setTickets(data.tickets);
    render();
    queueTicketClaim(0);
  } catch {}
}
function ticketStart() {
  if (!ticketState?.startedAt) return "";
  const d = new Date(ticketState.startedAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// 献立や記録が変わったら、もらえるチケットがないか確かめる（保存のたびに呼ばれるので、少し待ってまとめる）。
function queueTicketClaim(delay = 800) {
  if (!ticketsOn() || !ticketState || ticketState.household !== householdKey()) return;
  clearTimeout(ticketClaimTimer);
  ticketClaimTimer = setTimeout(claimTickets, delay);
}
async function claimTickets() {
  if (ticketClaiming || !ticketState || !ticketStart()) return;
  const cooks = Tickets.cookClaims({ slots: state.mealSlots, evaluations: state.evaluations, startDate: ticketStart(), today: today(), addDays, claims: ticketState.claims });
  const ib = ticketState.importBonus;
  const claims = [...cooks, ...(ib?.open && ib.have >= ib.need ? ["import"] : [])].filter((c) => !ticketRejected.has(c));
  if (!claims.length) return;
  ticketClaiming = true;
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/tickets/claim`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ claims }) }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    claims.filter((c) => !data.tickets?.claims?.includes(c)).forEach((c) => ticketRejected.add(c));
    setTickets(data.tickets);
    render();
  } catch {} finally { ticketClaiming = false; }
}
const fmtTickets = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
// 一覧性を崩さない1行の後押し。タップでチケットの画面を開く。
function renderTicketNudge() {
  if (!ticketsOn() || !ticketState || isViewer()) return "";
  const line = Tickets.nextLine(ticketState);
  if (!line || (!ticketState.cook?.challenge && !ticketState.importBonus?.open)) return "";
  return `<button type="button" class="ticket-nudge" data-action="tickets-open"><span>${line}</span><i aria-hidden="true">›</i></button>`;
}
function renderTicketChip() {
  const chip = document.querySelector("#ticket-chip");
  if (!chip) return;
  // ページ固有のボタンが上のバーにある画面では、場所をゆずる（献立は下の1行で後押しする）。
  const show = ticketsOn() && !!ticketState && !document.querySelector("#topbar-actions")?.children.length;
  chip.hidden = !show;
  if (!show) return;
  const soon = !isViewer() && ticketState.importBonus?.open;
  chip.innerHTML = `<span aria-hidden="true">🎟</span><b>${ticketState.unlimited ? "∞" : fmtTickets(ticketState.balance)}</b>${soon ? '<i class="ticket-dot" aria-hidden="true"></i>' : ""}`;
  chip.setAttribute("aria-label", `チケット ${ticketState.unlimited ? "無制限" : fmtTickets(ticketState.balance) + "枚"}`);
}
function openTicketSheet({ need = false, retry = null } = {}) {
  ticketCodeWrong = need && !!devCode();
  if (ticketCodeWrong) try { localStorage.removeItem("ripigochi-dev-code"); } catch {}
  ticketSheet = { need, retry }; ticketCode = ""; render();
  if (!need) refreshTickets();
}
const tkDate = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
function renderTicketSheet() {
  if (!ticketSheet) return "";
  const t = ticketState;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const start = ticketStart();
  const c = t?.cook, ib = t?.importBonus;
  const daysLeft = start ? Math.max(0, daysBetween(today(), addDays(start, Tickets.WEEKS * 7 - 1)) + 1) : 0;
  const line = t ? Tickets.nextLine(t) : "";
  const head = ticketSheet.need
    ? `<div class="tk-balance"><p class="quota-title">🎟 チケットがあと1枚</p><button type="button" class="tk-close" data-action="tickets-close" aria-label="閉じる">×</button></div>${line ? `<p class="small tk-what">${line}</p>` : ""}${typeof renderTicketPlusLine === "function" ? renderTicketPlusLine() : ""}`
    : `<div class="tk-balance"><span class="tk-ticket" aria-hidden="true">🎟</span><p><b>${t?.unlimited ? "∞" : t ? fmtTickets(t.balance) : "…"}</b><small>枚</small></p><button type="button" class="tk-close" data-action="tickets-close" aria-label="閉じる">×</button></div><p class="small tk-what">🎬 1枚＝動画1本をAIが読み取り（<b>読み取り済みは0枚</b>）</p>`;
  const dots = (n, max) => Array.from({ length: max }, (_, i) => `<i class="tk-dot${i < n ? " on" : ""}" aria-hidden="true"></i>`).join("");
  const earn = !t || !c ? "" : c.challenge
    ? `<section class="tk-challenge" aria-label="作るたびにチケット">
      <p class="tk-title"><b>🍳 作るたびに +1枚</b><span>のこり${daysLeft}日</span></p>
      <div class="tk-meter"><progress max="${c.max}" value="${c.total}" aria-label="もらったチケット"></progress><span><b>${c.total}</b> / ${c.max}枚</span></div>
      <p class="tk-line"><span class="tk-kind">今週</span><span class="tk-dots" role="img" aria-label="今週 ${c.weekGot} / ${c.perWeek}枚">${dots(c.weekGot, c.perWeek)}</span></p>
    </section>`
    : `<section class="tk-challenge" aria-label="作るとチケット"><p class="tk-title"><b>🍳 ${c.every}回作るごとに +1枚</b></p><p class="tk-line"><span class="tk-dots" role="img" aria-label="${c.towardNext} / ${c.every}回">${dots(c.towardNext, c.every)}</span></p></section>`;
  const bonus = ib?.open ? `<p class="tk-bonus">📥 ${tkDate(ib.until)}までに動画を${ib.need}本取り込むと <b>+${ib.bonus}枚</b> <span class="tk-dots">${dots(Math.min(ib.have, ib.need), ib.need)}</span></p>` : "";
  const expiring = t?.expiring ? `<p class="muted small">⏳ ${fmtTickets(t.expiring.n)}枚は${tkDate(t.expiring.at)}まで ${tip("購入分とプラスの分は、受け取ってから6か月で期限が切れます。期限の近いものから使います")}</p>` : "";
  return `<div class="quota-sheet ticket-sheet" role="dialog" aria-modal="true" aria-label="チケット"><div class="quota-card">
    ${head}${ticketSheet.need ? "" : bonus + earn + expiring}
    ${!ticketSheet.need && loginAvailable() && !account ? '<button type="button" class="text-button tk-login" data-action="tickets-login">🔐 ログインで機種変更しても引き継ぎ ›</button>' : ""}
    ${ticketSheet.need ? "" : `<label class="tk-skip"><input type="checkbox" data-action="tickets-ask-toggle" ${ticketSkipAsk() ? "" : "checked"}> 使う前に確認する</label>`}
    <details class="quota-dev" ${ticketCode || ticketCodeWrong ? "open" : ""}><summary>開発者コード</summary>
      ${ticketCodeWrong ? '<p class="quota-wrong">コードが違うようです。</p>' : ""}<p class="quota-code" aria-live="polite">${ticketCode ? "●".repeat(ticketCode.length) : "&nbsp;"}</p>
      <div class="quota-keys">${keys.map((k) => k ? `<button type="button" class="quota-key" data-action="tickets-key" data-key="${k}" aria-label="${k === "⌫" ? "1文字消す" : k}">${k}</button>` : "<span></span>").join("")}</div>
      <button type="button" class="primary-button full-button" data-action="tickets-unlock" ${ticketCode.length ? "" : "disabled"}>決定</button>
    </details>
  </div></div>`;
}
// 達成の瞬間：スタンプがポンと押されて、チケットが増える。
function renderTicketParty() {
  const party = ticketParties[0];
  if (!party || !ticketState || ticketSheet) return "";
  const confetti = Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const rewards = party.rewards || [];
  const gain = rewards.reduce((a, r) => a + (r.n || 0), 0);
  const why = rewards.some((r) => r.id === "import") ? "📥 取り込みボーナス" : rewards.some((r) => r.id.startsWith("plus-")) ? "✨ プラスの4週分" : rewards.some((r) => r.id.startsWith("buy-")) ? "🛒 ご購入ありがとうございます" : "🍳 作ったごほうび";
  const next = Tickets.nextLine(ticketState);
  const body = party.welcome
    ? `<p class="tp-kicker">ようこそ！</p><p class="tp-gain"><span class="tp-ticket" aria-hidden="true">🎁</span><b>${fmtTickets(ticketState.balance)}</b>枚</p><p class="tp-what">🎬 1枚＝動画1本をAIが読み取り</p><p class="tp-next">🍳 最初の4週は、作るたびに<b>+1枚</b></p>`
    : `<p class="tp-kicker">${why}</p><p class="tp-gain"><span class="tp-ticket" aria-hidden="true">🎟</span><b>+${fmtTickets(gain)}</b>枚</p><p class="tp-what">のこり <b>${fmtTickets(ticketState.balance)}枚</b></p>${next ? `<p class="tp-next">${next}</p>` : ""}`;
  return `<div class="ticket-party" role="dialog" aria-modal="true" aria-label="チケットをもらいました"><div class="tp-confetti" aria-hidden="true">${confetti}</div><div class="tp-card">${body}<button type="button" class="primary-button full-button" data-action="tickets-party-close">${party.welcome ? "OK" : "やった！"}</button></div></div>`;
}
function handleTicketAction(action, data) {
  if (action === "tickets-open") { openTicketSheet(); return true; }
  if (action === "tickets-login") { ticketSheet = null; setView("settings"); return true; }
  if (action === "tickets-ask-yes") {
    const run = ticketAsk?.run;
    if (document.querySelector("#ticket-skip")?.checked) { try { localStorage.setItem("ripigochi-ticket-ask", "skip"); } catch {} showToast("次からは確認せずに読みます。チケット画面で戻せます。"); }
    ticketAsk = null; render(); run?.(); return true;
  }
  if (action === "tickets-ask-no") { ticketAsk = null; render(); return true; }
  if (action === "tickets-ask-toggle") { try { ticketSkipAsk() ? localStorage.removeItem("ripigochi-ticket-ask") : localStorage.setItem("ripigochi-ticket-ask", "skip"); } catch {} render(); return true; }
  if (action === "tickets-close") { ticketSheet = null; ticketCode = ""; ticketCodeWrong = false; render(); return true; }
  if (action === "tickets-party-close") { ticketParties.shift(); render(); return true; }
  if (action === "tickets-key") { ticketCode = data.key === "⌫" ? ticketCode.slice(0, -1) : (ticketCode + data.key).slice(0, 6); render(); return true; }
  if (action === "tickets-unlock") {
    try { localStorage.setItem("ripigochi-dev-code", ticketCode); } catch {}
    const retry = ticketSheet?.retry;
    ticketSheet = null; ticketCode = ""; ticketCodeWrong = false;
    showToast(retry ? "開発者コードを設定しました。もう一度読み取ります。" : "開発者コードを設定しました。");
    render();
    if (retry) retry(); else refreshTickets();
    return true;
  }
  return false;
}
// チケットを使う前の確認。「次から確認しない」を選んだ端末では省く（チケット画面で戻せる）。
const ticketSkipAsk = () => { try { return localStorage.getItem("ripigochi-ticket-ask") === "skip"; } catch { return false; } };
// 押した時にサーバーへ聞く：だれかがもう動画から読んでいれば、確認なし・チケットなしでそのまま読む。
let ticketChecking = false;
async function videoAlreadyRead(url) {
  if (!url || !API_BASE_URL) return false;
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/import/youtube/status?url=${encodeURIComponent(url)}`, {}, 6_000);
    return response.ok && (await response.json()).videoRead === true;
  } catch { return false; }
}
async function askTicket(run, url = "") {
  if (!ticketState || ticketState.unlimited) return run();
  if (ticketChecking) return;
  ticketChecking = true;
  const free = await videoAlreadyRead(url);
  ticketChecking = false;
  if (free || ticketSkipAsk()) return run();
  if (ticketState.balance < 1) return openTicketSheet({ need: true, retry: run });
  ticketAsk = { run }; render();
}
function renderTicketAsk() {
  if (!ticketAsk || !ticketState) return "";
  return `<div class="quota-sheet ticket-ask" role="dialog" aria-modal="true" aria-label="チケットを使う確認"><div class="quota-card">
    <p class="quota-title">🎬 動画から作り方を読みますか？</p>
    <div class="tk-cost"><span class="tk-ticket" aria-hidden="true">🎟</span><p><span><b>チケットを1枚</b>使います</span><small>のこり ${fmtTickets(ticketState.balance)}枚 → ${fmtTickets(ticketState.balance - 1)}枚</small></p></div>
    <p class="small tk-what">読めなかった時は、チケットは戻ります。</p>
    <label class="tk-skip"><input id="ticket-skip" type="checkbox"> 次から確認しない</label>
    <button type="button" class="primary-button full-button" data-action="tickets-ask-yes">🎟1枚で読む</button>
    <button type="button" class="text-button full-button" data-action="tickets-ask-no">やめる</button>
  </div></div>`;
}
// 動画を読んだあとのひとこと。
function ticketNote(result) {
  if (!result?.tickets) return "";
  if (result.tickets.unlimited) return "（開発モード）";
  if (result.cacheHit) return "読み取り済みの動画だったので、チケットは使いませんでした🎉";
  return result.ticketUsed ? `🎟 のこり${fmtTickets(result.tickets.balance)}枚` : "";
}
