/* 動画読み取りチケットと「はじめての4週間チャレンジ」。判定は純粋関数（Nodeのテストでも使う）、画面はその下。 */
(function (root) {
  const WEEKS = 4, REWARD = 2.5;
  const GOALS = [
    { kind: "plan", step: 1, need: 3, label: "献立を3日分決めた" },
    { kind: "plan", step: 2, need: 7, label: "献立を1週間分決めた" },
    { kind: "cook", step: 1, need: 3, label: "3日作った" },
    { kind: "cook", step: 2, need: 7, label: "1週間やりきった" },
  ];
  const id = (week, g) => `w${week}-${g.kind}-${g.step}`;
  // 週ごとの数え方：献立＝決めた日（作った日・お休みの日も含む）。作った＝作った日。
  // 「1週間やりきった」は、作った日＋お休みにした日で7日（外食の日はお休みにすればOK）。
  function progress(slots, startDate, addDays) {
    const list = Object.values(slots || {});
    return Array.from({ length: WEEKS }, (_, week) => {
      const from = addDays(startDate, week * 7), to = addDays(startDate, week * 7 + 6);
      const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
      const status = Object.fromEntries(days.map((d) => [d, ""]));
      for (const s of list) if (s && s.date in status && ["confirmed", "cooked", "off"].includes(s.status)) status[s.date] = s.status;
      const values = Object.values(status);
      const plan = values.filter(Boolean).length, cooked = values.filter((v) => v === "cooked").length, off = values.filter((v) => v === "off").length;
      const count = { plan, cook: cooked };
      const met = (g) => g.kind === "plan" ? plan >= g.need : g.step === 1 ? cooked >= 3 : cooked >= 3 && cooked + off >= 7;
      const goals = GOALS.map((g) => ({ ...g, id: id(week, g), met: met(g), have: g.kind === "cook" && g.step === 2 ? cooked + off : count[g.kind] }));
      return { week, from, to, days, status, plan, cooked, off, goals };
    });
  }
  // 今日の時点で申請できる達成（献立は1週先まで、作った記録はその週の日数が過ぎてから）。
  function eligible(weeks, claims, today) {
    const got = new Set(claims || []);
    return weeks.flatMap((w) => w.goals.filter((g) => {
      if (!g.met || got.has(g.id)) return false;
      if (g.kind === "plan") return today >= addDaysLoose(w.from, -7);
      return today >= w.days[g.step === 1 ? 2 : 6];
    }).map((g) => g.id));
  }
  function addDaysLoose(date, n) { const t = new Date(date + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
  const weekOf = (startDate, today) => Math.floor((Date.parse(today + "T12:00:00Z") - Date.parse(startDate + "T12:00:00Z")) / (7 * 86400000));
  // 次にねらう達成（あと何日か）。今週でもう届かないものは飛ばして、来週の献立へ。
  function nextGoal(weeks, claims, today, prefer = "") {
    const got = new Set(claims || []);
    const start = weeks[0]?.from;
    if (!start) return null;
    const now = weekOf(start, today);
    if (now < 0 || now >= WEEKS) return null;
    const open = [];
    for (const w of weeks.slice(now, now + 2)) {
      const left = w.days.filter((d) => d >= today).length;
      for (const g of w.goals) {
        if (got.has(g.id) || g.met) continue;
        if (w.week > now && g.kind === "cook") continue;
        const remaining = g.need - g.have;
        if (remaining > left) continue;
        open.push({ ...g, week: w.week, remaining, thisWeek: w.week === now });
      }
    }
    return (prefer && open.find((g) => g.kind === prefer)) || open[0] || null;
  }
  const api = { WEEKS, REWARD, GOALS, progress, eligible, nextGoal, weekOf, goalOf: (claim) => { const m = /^w(\d)-(plan|cook)-(\d)$/.exec(claim || ""); return m ? { week: Number(m[1]), ...GOALS.find((g) => g.kind === m[2] && g.step === Number(m[3])) } : null; } };
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
  // はじめて見る達成（家族の端末で達成した分も）はお祝いする。
  const seen = ticketSeen();
  const fresh = (view.claims || []).filter((c) => !seen.includes(c));
  const welcome = !seen.includes("welcome");
  if (fresh.length || welcome) {
    if (welcome) ticketParties.push({ welcome: true });
    if (fresh.length) ticketParties.push({ claims: fresh });
    try { localStorage.setItem("ripigochi-tickets-seen", JSON.stringify([...seen, ...fresh, "welcome"])); } catch {}
  }
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
function ticketWeeks() { const s = ticketStart(); return s ? Tickets.progress(state.mealSlots, s, addDays) : []; }
function challengeLive() { const s = ticketStart(); if (!s) return false; const w = Tickets.weekOf(s, today()); return w >= 0 && w < Tickets.WEEKS; }
// 献立や記録が変わったら、もらえるチケットがないか確かめる（保存のたびに呼ばれるので、少し待ってまとめる）。
function queueTicketClaim(delay = 800) {
  if (!ticketsOn() || !ticketState || ticketState.household !== householdKey()) return;
  clearTimeout(ticketClaimTimer);
  ticketClaimTimer = setTimeout(claimTickets, delay);
}
async function claimTickets() {
  if (ticketClaiming || !ticketState) return;
  const claims = Tickets.eligible(ticketWeeks(), ticketState.claims, today()).filter((c) => !ticketRejected.has(c));
  if (!claims.length) return;
  ticketClaiming = true;
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/tickets/claim`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ claims }) }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return;
    claims.filter((c) => !data.granted?.includes(c)).forEach((c) => ticketRejected.add(c));
    setTickets(data.tickets);
    render();
  } catch {} finally { ticketClaiming = false; }
}
const fmtTickets = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
function goalText(g) {
  if (!g) return "";
  const when = g.thisWeek ? "" : "来週の";
  return g.kind === "plan" ? `${when}献立をあと${g.remaining}日分決めると` : g.step === 1 ? `あと${g.remaining}日作ると` : `あと${g.remaining}日（作る・お休み）で`;
}
// 一覧性を崩さない1行の後押し。タップでチャレンジを開く。
function renderTicketNudge(prefer = "") {
  if (!ticketsOn() || !ticketState || isViewer() || !challengeLive()) return "";
  const g = Tickets.nextGoal(ticketWeeks(), ticketState.claims, today(), prefer);
  if (!g) return "";
  return `<button type="button" class="ticket-nudge" data-action="tickets-open"><span class="ticket-nudge-icon" aria-hidden="true">🎟</span><span>${goalText(g)} <b>+${Tickets.REWARD}枚</b></span><i aria-hidden="true">›</i></button>`;
}
function renderTicketChip() {
  const chip = document.querySelector("#ticket-chip");
  if (!chip) return;
  // ページ固有のボタンが上のバーにある画面では、場所をゆずる（献立は下の1行で後押しする）。
  const show = ticketsOn() && !!ticketState && !document.querySelector("#topbar-actions")?.children.length;
  chip.hidden = !show;
  if (!show) return;
  const g = challengeLive() && !isViewer() ? Tickets.nextGoal(ticketWeeks(), ticketState.claims, today()) : null;
  chip.innerHTML = `<span aria-hidden="true">🎟</span><b>${ticketState.unlimited ? "∞" : fmtTickets(ticketState.balance)}</b>${g && g.remaining <= 1 && g.thisWeek ? '<i class="ticket-dot" aria-hidden="true"></i>' : ""}`;
  chip.setAttribute("aria-label", `チケット ${ticketState.unlimited ? "無制限" : fmtTickets(ticketState.balance) + "枚"}${g ? "。もうすぐチケットがもらえます" : ""}`);
}
function openTicketSheet({ need = false, retry = null } = {}) {
  ticketCodeWrong = need && !!devCode();
  if (ticketCodeWrong) try { localStorage.removeItem("ripigochi-dev-code"); } catch {}
  ticketSheet = { need, retry }; ticketCode = ""; render();
  if (!need) refreshTickets();
}
function weekRow(w, claims, nowWeek) {
  const got = new Set(claims);
  const state_ = w.week < nowWeek ? "is-past" : w.week === nowWeek ? "is-now" : "is-future";
  const perfect = w.goals.every((g) => got.has(g.id));
  const dots = (kind) => w.days.map((d) => {
    const s = w.status[d];
    const on = kind === "plan" ? !!s : s === "cooked";
    const moon = kind === "cook" && s === "off";
    return `<i class="tk-dot${on ? " on" : ""}${moon ? " moon" : ""}${d === today() ? " today" : ""}" aria-hidden="true"></i>`;
  }).join("");
  const stamp = (g) => `<span class="tk-stamp${got.has(g.id) ? " got" : g.met ? " ready" : ""}" title="${g.label}">${got.has(g.id) ? "済" : `${g.need}日`}<small>+${Tickets.REWARD}</small></span>`;
  const line = (kind, label) => {
    const [a, b] = w.goals.filter((g) => g.kind === kind);
    const have = kind === "plan" ? w.plan : w.cooked;
    return `<div class="tk-line"><span class="tk-kind">${label}</span><span class="tk-dots" role="img" aria-label="${label} ${have}日">${dots(kind)}</span>${stamp(a)}${stamp(b)}</div>`;
  };
  return `<div class="tk-week ${state_}${perfect ? " is-perfect" : ""}"><p class="tk-week-head"><b>${w.week + 1}週目</b><span>${formatDate(w.from)}〜${formatDate(w.to)}</span>${w.week === nowWeek ? '<em>今週</em>' : ""}${perfect ? '<em class="tk-crown">👑 パーフェクト</em>' : ""}</p>${line("plan", "🗓 献立")}${line("cook", "🍳 作った")}</div>`;
}
function renderTicketSheet() {
  if (!ticketSheet) return "";
  const t = ticketState;
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];
  const weeks = t ? ticketWeeks() : [];
  const start = ticketStart();
  const nowWeek = start ? Tickets.weekOf(start, today()) : -1;
  const live = nowWeek >= 0 && nowWeek < Tickets.WEEKS;
  const earned = (t?.claims?.length || 0) * Tickets.REWARD, max = Tickets.WEEKS * Tickets.GOALS.length * Tickets.REWARD;
  const g = t && live ? Tickets.nextGoal(weeks, t.claims, today()) : null;
  const daysLeft = start ? Math.max(0, daysBetween(today(), addDays(start, Tickets.WEEKS * 7 - 1)) + 1) : 0;
  const head = ticketSheet.need
    ? `<div class="tk-balance"><p class="quota-title">🎟 チケットがあと1枚いります</p><button type="button" class="tk-close" data-action="tickets-close" aria-label="閉じる">×</button></div><p class="small">動画1本の作り方をAIが読むのに、チケットを1枚使います。${g ? `<b>${goalText(g)} +${Tickets.REWARD}枚</b>もらえます。` : ""}</p>`
    : `<div class="tk-balance"><span class="tk-ticket" aria-hidden="true">🎟</span><p><b>${t?.unlimited ? "∞" : t ? fmtTickets(t.balance) : "…"}</b><small>枚</small></p><button type="button" class="tk-close" data-action="tickets-close" aria-label="閉じる">×</button></div><p class="small tk-what">1枚で、動画1本の作り方をAIが読み取ります。<b>だれかが読んだ動画は0枚</b>、読めなかった時は戻ります。</p>`;
  const challenge = !t || !start ? "" : `<section class="tk-challenge" aria-label="はじめての4週間チャレンジ">
      <p class="tk-title"><b>はじめての4週間チャレンジ</b><span>${live ? `のこり${daysLeft}日` : "おわり"}</span></p>
      <div class="tk-meter"><progress max="${max}" value="${earned}" aria-label="獲得したチケット"></progress><span><b>${fmtTickets(earned)}</b> / ${max}枚</span></div>
      ${g ? `<p class="tk-next">つぎは <b>${goalText(g)}</b> <span class="tk-plus">+${Tickets.REWARD}枚</span></p>` : live ? '<p class="tk-next">今週の分はぜんぶ達成！ 来週もいっしょに。</p>' : `<p class="tk-next">おつかれさまでした！ ${fmtTickets(earned)}枚をゲットしました。</p>`}
      <div class="tk-weeks">${weeks.map((w) => weekRow(w, t.claims, nowWeek)).join("")}</div>
      <p class="muted small">献立：決めた日（お休みの日も）。作った：「作った」を記録した日。7日目は、作った日＋お休みの日で数えます。</p>
    </section>`;
  return `<div class="quota-sheet ticket-sheet" role="dialog" aria-modal="true" aria-label="チケット"><div class="quota-card">
    ${head}${challenge}
    ${ticketSheet.need ? "" : `<label class="tk-skip"><input type="checkbox" data-action="tickets-ask-toggle" ${ticketSkipAsk() ? "" : "checked"}> チケットを使う前に確認する</label>`}
    <details class="quota-dev" ${ticketCode || ticketCodeWrong ? "open" : ""}><summary>開発者コードを入れる</summary>
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
  const claims = (party.claims || []).map(Tickets.goalOf).filter(Boolean);
  const gain = claims.length * Tickets.REWARD;
  const g = challengeLive() ? Tickets.nextGoal(ticketWeeks(), ticketState.claims, today()) : null;
  const confetti = Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join("");
  const body = party.welcome
    ? `<p class="tp-kicker">ようこそ！</p><p class="tp-gain"><span class="tp-ticket" aria-hidden="true">🎁</span><b>25</b>枚</p><p class="tp-what">はじめてのチケットです。1枚で、動画1本の作り方をAIが読み取ります。</p><p class="tp-next">さらに<b>4週間チャレンジ</b>で、最大<b>${Tickets.WEEKS * Tickets.GOALS.length * Tickets.REWARD}枚</b>！<br>献立を決める・作るたびにスタンプがたまります。</p>`
    : `<p class="tp-kicker">${claims.map((c) => `${c.week + 1}週目「${c.label}」`).join("・")}</p><p class="tp-gain"><span class="tp-ticket" aria-hidden="true">🎟</span><b>+${fmtTickets(gain)}</b>枚</p><div class="tp-stamps" aria-hidden="true">${claims.map(() => '<span class="tk-stamp got tp-stamp">済<small>+2.5</small></span>').join("")}</div><p class="tp-what">のこり <b>${fmtTickets(ticketState.balance)}枚</b></p>${g ? `<p class="tp-next">つぎは ${goalText(g)} <b>+${Tickets.REWARD}枚</b></p>` : ""}`;
  return `<div class="ticket-party" role="dialog" aria-modal="true" aria-label="チケットをもらいました"><div class="tp-confetti" aria-hidden="true">${confetti}</div><div class="tp-card">${body}<button type="button" class="primary-button full-button" data-action="tickets-party-close">${party.welcome ? "チャレンジを見る" : "やった！"}</button></div></div>`;
}
function handleTicketAction(action, data) {
  if (action === "tickets-open") { openTicketSheet(); return true; }
  if (action === "tickets-ask-yes") {
    const run = ticketAsk?.run;
    if (document.querySelector("#ticket-skip")?.checked) { try { localStorage.setItem("ripigochi-ticket-ask", "skip"); } catch {} showToast("次からは確認せずに読みます。チケット画面で戻せます。"); }
    ticketAsk = null; render(); run?.(); return true;
  }
  if (action === "tickets-ask-no") { ticketAsk = null; render(); return true; }
  if (action === "tickets-ask-toggle") { try { ticketSkipAsk() ? localStorage.removeItem("ripigochi-ticket-ask") : localStorage.setItem("ripigochi-ticket-ask", "skip"); } catch {} render(); return true; }
  if (action === "tickets-close") { ticketSheet = null; ticketCode = ""; ticketCodeWrong = false; render(); return true; }
  if (action === "tickets-party-close") { const party = ticketParties.shift(); if (party?.welcome) openTicketSheet(); else render(); return true; }
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
function askTicket(run) {
  if (!ticketState || ticketState.unlimited || ticketSkipAsk()) return run();
  if (ticketState.balance < 1) return openTicketSheet({ need: true, retry: run });
  ticketAsk = { run }; render();
}
function renderTicketAsk() {
  if (!ticketAsk || !ticketState) return "";
  return `<div class="quota-sheet ticket-ask" role="dialog" aria-modal="true" aria-label="チケットを使う確認"><div class="quota-card">
    <p class="quota-title">🎬 動画から作り方を読みますか？</p>
    <div class="tk-cost"><span class="tk-ticket" aria-hidden="true">🎟</span><p><span><b>チケットを1枚</b>使います</span><small>のこり ${fmtTickets(ticketState.balance)}枚 → ${fmtTickets(ticketState.balance - 1)}枚</small></p></div>
    <p class="small tk-what">だれかが読んだ動画なら0枚。読めなかった時は戻ります。</p>
    <label class="tk-skip"><input id="ticket-skip" type="checkbox"> 次から確認しない</label>
    <button type="button" class="primary-button full-button" data-action="tickets-ask-yes">🎟1枚で読む</button>
    <button type="button" class="text-button full-button" data-action="tickets-ask-no">やめる</button>
  </div></div>`;
}
// 動画を読んだあとのひとこと。
function ticketNote(result) {
  if (!result?.tickets) return "";
  if (result.tickets.unlimited) return "（開発モード）";
  if (result.cacheHit) return "だれかが読んだ動画だったので、チケットは使いませんでした🎉";
  return result.ticketUsed ? `🎟 のこり${fmtTickets(result.tickets.balance)}枚` : "";
}
