/* 無料とリピごちプラスの出し分け。決済（Stripe）と一緒に本番で有効にする（GATING_LIVE）。
   それまでは ?paywall=1 のプレビューの時だけ効く。?plus=on で、この端末をプラス扱いにできる（試す用）。
   ・無料期間：使い始めた日から次の月曜までの半端な日＋2週間（trialPlan）。カード不要・自動で課金しない
   ・無料期間のあと、無料は1週間（月〜日）に献立3日分まで。外食・お休みの日は数えない
   ・3日は自動で選ぶ（決めた日・作った日が先、あとは早い日から）。ロックの日から「この日を3日に入れる」で入れ替えられる
   ・決めた日・作った日はロックしない（無料期間中に決めた分もそのまま）
   ・プラスは、同期している家族みんなで使える（決済と一緒に、サーバーの状態を state.plus に入れる）
   ・プラスの案内は3か所だけ：3日を使い切った時／ロックの日を押した時／チケットが足りない時 */
const GATING_LIVE = false;
const FREE_DAYS = 3;
let gatingOverride = null; // テスト用
function gatingOn() {
  if (gatingOverride !== null) return gatingOverride;
  return GATING_LIVE || paywallPreview();
}
function plusActive() {
  try {
    const q = new URLSearchParams(globalThis.location?.search || "").get("plus");
    if (q === "on" || q === "off") localStorage.setItem("ripigochi-plus", q);
    if (localStorage.getItem("ripigochi-plus") === "on") return true;
  } catch {}
  return !!state.plus?.until && state.plus.until >= today();
}
const trialEnd = () => (state.trialFrom ? trialPlan(state.trialFrom).end : "");
const inTrial = (date = today()) => !state.trialFrom || date <= trialEnd();
const weekStartOf = (date) => addDays(date, -((dow(date) + 6) % 7));
const takenSlot = (slot) => slot?.status === "confirmed" || slot?.status === "cooked";
// 週ごとの無料の日：決めた日・作った日 → 自分で選んだ日 → 献立の早い日 の順に3日まで（決めた日が3日を超えていれば、それは全部）。
function freeDatesOfWeek(weekStart, plan = dailyPlan()) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const cookable = (date) => { const d = plan.find((x) => x.date === date); const slot = state.mealSlots?.[date]; return slot?.status !== "off" && !d?.off && !d?.prestart; };
  const taken = days.filter((date) => takenSlot(state.mealSlots?.[date]));
  const picks = (state.freePicks?.[weekStart] || []).filter((date) => days.includes(date) && date >= today() && cookable(date));
  const planned = plan.filter((d) => days.includes(d.date) && d.date >= today() && cookable(d.date)).map((d) => d.date);
  const out = [...taken];
  for (const date of [...picks, ...planned]) if (!out.includes(date) && out.length < FREE_DAYS) out.push(date);
  return out;
}
// この献立の中でロックする日（Set）。
function lockedDates(plan = dailyPlan()) {
  const locked = new Set();
  if (!gatingOn() || plusActive()) return locked;
  const weeks = new Map();
  for (const d of plan) {
    if (d.off || d.prestart || inTrial(d.date) || takenSlot(d.slot) || d.slot?.status === "off") continue;
    const w = weekStartOf(d.date);
    if (!weeks.has(w)) weeks.set(w, freeDatesOfWeek(w, plan));
    if (!weeks.get(w).includes(d.date)) locked.add(d.date);
  }
  return locked;
}
const isLocked = (date, plan) => lockedDates(plan).has(date);
// ロックの日を「3日」に入れる。決めていない無料の日のうち、いちばん遅い日と入れ替える。
function pickFreeDay(date) {
  const plan = dailyPlan(), w = weekStartOf(date);
  const free = freeDatesOfWeek(w, plan);
  const loose = free.filter((d) => !takenSlot(state.mealSlots?.[d]));
  if (!loose.length) { showToast("今週の3日分はもう決まっています。決めた日を外すと入れ替えられます。"); return false; }
  const drop = loose[loose.length - 1];
  const keep = free.filter((d) => d !== drop && !takenSlot(state.mealSlots?.[d]));
  state.freePicks = { ...(state.freePicks || {}), [w]: [date, ...keep].slice(0, FREE_DAYS) };
  // 古い週の選択は消す
  for (const k of Object.keys(state.freePicks)) if (k < weekStartOf(addDays(today(), -7))) delete state.freePicks[k];
  showToast(`${formatDate(date)}を無料の3日に入れました。${formatDate(drop)}はロックされます。`);
  trackDaily("free_pick", { date, drop });
  return true;
}
function normalizeFreePicks(raw) {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray(v)).map(([k, v]) => [k, v.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, FREE_DAYS)]));
}
// ── 表示（文字は最小限。説明はⓘに入れる）
const LOCK_TITLE = "🔒 今夜はプラスの日";
const WD_SHORT = ["日", "月", "火", "水", "木", "金", "土"];
// 続いているロックの日を1行にまとめる：「🔒 木 金 土 日 ⓘ　✨ 毎日にする」。曜日を押すと無料の3日と入れ替え。
function renderLockStrip(dates) {
  const days = dates.map((d) => `<button type="button" class="lock-day" data-action="life-free-pick" data-date="${d}" aria-label="${formatDate(d)}を無料の日にする">${WD_SHORT[dow(d)]}</button>`).join("");
  return `<div class="lock-strip"><span class="lock-days" aria-hidden="true">🔒</span>${days}${tip("無料は週3日まで。曜日をタップで入れ替え")}<button type="button" class="lock-plus" data-action="life-plus-open" data-from="locked">✨ 毎日にする</button></div>`;
}
// 3日を使い切った週に、1回だけ出す1行（×で、その週は出さない）。
function renderFreeUsedCard(plan = dailyPlan()) {
  if (!gatingOn() || plusActive() || isViewer()) return "";
  const locked = lockedDates(plan);
  const w = weekStartOf(today());
  const lockedThisWeek = [...locked].filter((d) => weekStartOf(d) === w).length;
  const used = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter((d) => takenSlot(state.mealSlots?.[d])).length;
  let seen = "";
  try { seen = localStorage.getItem("ripigochi-free-used") || ""; } catch {}
  if (used < FREE_DAYS || !lockedThisWeek || seen === w) return "";
  return `<div class="plus-nudge"><span>🎉 無料3日 決定・🔒あと${lockedThisWeek}日</span><button type="button" class="lock-plus" data-action="life-plus-open" data-from="used">✨ プラス</button><button type="button" class="tk-close" data-action="life-free-used-close" data-week="${w}" aria-label="閉じる">×</button></div>`;
}
// チケットが足りない時の1行（チケットの画面の中）。
function renderTicketPlusLine() {
  if (!gatingOn() || plusActive()) return "";
  return `<button type="button" class="text-button tk-plus-line" data-action="life-plus-open" data-from="tickets">✨ プラスなら30枚／4週 ›</button>`;
}
const PLUS_FROM = { locked: "🔒 毎日の献立はプラスで", used: "🎉 今週の3日分、決定！", tickets: "🎟 チケットが足りない？" };
const PLUS_PERKS = [["🗓", "毎日の献立"], ["🎟", "30枚／4週"], ["👫", "家族で共有"], ["🔕", "いつでも解約"]];
function openPlus(from) {
  if (!PLUS_FROM[from]) return;
  paywall = { plan: "year", from };
  trackDaily("plus_view", { from });
}
function handlePlusAction(action, data) {
  if (action === "life-plus-open") { if (typeof ticketSheet !== "undefined") ticketSheet = null; openPlus(data.from); render(); return true; }
  if (action === "life-free-pick") { if (pickFreeDay(data.date)) saveState(); render(); return true; }
  if (action === "life-free-used-close") { try { localStorage.setItem("ripigochi-free-used", data.week || ""); } catch {} render(); return true; }
  return false;
}

// ── β版のあいだ：課金ボタンを押してくれた人に「お気持ちありがとう」。意見を送ってくれた人には、正式版で3か月無料の招待コードを届ける。
const BETA = !GATING_LIVE;
let feedbackSheet = null; // { step: "thanks" | "form" | "sent", from, busy, error }
function openFeedback(from = "", step = "form") { feedbackSheet = { step, from, busy: false, error: "" }; paywall = null; if (typeof ticketSheet !== "undefined") ticketSheet = null; trackDaily("feedback_open", { from, step }); render(); }
async function sendFeedback() {
  if (!feedbackSheet || feedbackSheet.busy) return;
  const message = String(document.querySelector("#fb-message")?.value || "").trim();
  const contact = String(document.querySelector("#fb-contact")?.value || "").trim();
  if (message.length < 2) { feedbackSheet.error = "ご意見を入力してください。"; render(); return; }
  feedbackSheet = { ...feedbackSheet, busy: true, error: "", message, contact };
  render();
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/feedback`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ message, contact, where: feedbackSheet.from, version: APP_VERSION }) }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "送れませんでした。");
    feedbackSheet = { step: "sent", from: feedbackSheet.from, withContact: !!contact };
    trackDaily("feedback_sent", { from: feedbackSheet.from });
  } catch (error) {
    feedbackSheet = { ...feedbackSheet, busy: false, error: error.message || "送れませんでした。" };
  }
  render();
}
function renderFeedbackSheet() {
  const f = feedbackSheet;
  if (!f) return "";
  const close = '<button type="button" class="tk-close" data-action="life-fb-close" aria-label="閉じる">×</button>';
  let body;
  if (f.step === "thanks") body = `<div class="fb-head"><p class="fb-title">💐 お気持ち、ありがとう！</p>${close}</div>
    <p class="fb-lead">いまはβ版。<b>ぜんぶ無料</b>でお使いください。</p>
    <p class="fb-gift">🎁 改善してほしいことを送ってくれた方に、正式版で<b>3か月無料</b>の招待コードを。</p>
    <button type="button" class="primary-button full-button" data-action="life-fb-form">✍️ 意見を送る</button>
    <button type="button" class="text-button full-button" data-action="life-fb-close">閉じる</button>`;
  else if (f.step === "sent") body = `<div class="fb-head"><p class="fb-title">✅ 届きました！</p>${close}</div>
    <p class="fb-lead">ありがとうございます。いただいた声で、リピごちを良くしていきます。</p>
    ${f.withContact ? '<p class="fb-gift">🎁 招待コードは、正式版の公開時にメールでお届けします。</p>' : '<p class="fb-gift">🎁 招待コードは、正式版の公開時にこのアプリでお知らせします。</p>'}
    <button type="button" class="primary-button full-button" data-action="life-fb-close">OK</button>`;
  else body = `<div class="fb-head"><p class="fb-title">💬 意見・お問い合わせ</p>${close}</div>
    <textarea id="fb-message" class="input fb-message" maxlength="2000" rows="5" placeholder="使いにくいところ、ほしい機能、うれしかったこと…">${escapeHtml(f.message || "")}</textarea>
    <label class="fb-contact"><span>メール（任意） ${tip("招待コードや、お返事の連絡先に使います")}</span><input id="fb-contact" class="input" type="email" inputmode="email" autocomplete="email" maxlength="254" placeholder="you@example.com" value="${escapeAttr(f.contact || "")}"></label>
    ${f.error ? `<p class="form-error">${escapeHtml(f.error)}</p>` : ""}
    <button type="button" class="primary-button full-button" data-action="life-fb-send" ${f.busy ? "disabled" : ""}>${f.busy ? "送っています…" : "送る"}</button>
    ${BETA ? '<p class="muted small fb-note">🎁 送ってくれた方に、正式版で3か月無料の招待コード</p>' : ""}`;
  return `<div class="quota-sheet fb-sheet" role="dialog" aria-modal="true" aria-label="意見を送る"><div class="quota-card">${body}</div></div>`;
}
function handleFeedbackAction(action, data) {
  if (!action.startsWith("life-fb")) return false;
  if (action === "life-fb-open") openFeedback(data.from || "settings", "form");
  else if (action === "life-fb-thanks") openFeedback(data.from || "", "thanks");
  else if (action === "life-fb-form") { feedbackSheet = { ...feedbackSheet, step: "form" }; render(); }
  else if (action === "life-fb-send") sendFeedback();
  else if (action === "life-fb-close") { feedbackSheet = null; render(); }
  return true;
}
