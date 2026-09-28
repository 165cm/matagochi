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
// ── 表示
const LOCK_TITLE = "🔒 プラスなら毎日の献立";
function renderLockedCard(day, dateLabel, badge) {
  const recipe = day.candidate?.recipe;
  return `<article class="plan-card is-locked"><button type="button" class="plan-photo plan-main" data-action="life-plus-open" data-from="locked" aria-label="${dateLabel}はプラスで献立が入ります">${recipe ? dishTile(recipe) : ""}<span class="lock-veil" aria-hidden="true">🔒</span>${badge}</button><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">${LOCK_TITLE}</strong><p class="plan-time">無料は1週間に3日分まで</p><div class="plan-controls"><button type="button" class="plan-icon" data-action="life-free-pick" data-date="${day.date}">3日に入れる</button><button type="button" class="plan-icon" data-action="life-plus-open" data-from="locked">✨ プラス</button></div></div></article>`;
}
// 3日を使い切った週に、1回だけ出す案内（閉じたら、その週は出さない）。
function renderFreeUsedCard(plan = dailyPlan()) {
  if (!gatingOn() || plusActive() || isViewer()) return "";
  const locked = lockedDates(plan);
  const w = weekStartOf(today());
  const lockedThisWeek = [...locked].filter((d) => weekStartOf(d) === w).length;
  const used = Array.from({ length: 7 }, (_, i) => addDays(w, i)).filter((d) => takenSlot(state.mealSlots?.[d])).length;
  let seen = "";
  try { seen = localStorage.getItem("ripigochi-free-used") || ""; } catch {}
  if (used < FREE_DAYS || !lockedThisWeek || seen === w) return "";
  return `<section class="panel plus-nudge"><p><b>今週の無料3日分、決まりました 🎉</b><small>あと${lockedThisWeek}日も、プラスなら毎日の献立が決まります。</small></p><div class="plus-nudge-actions">${dailyButton("life-plus-open", "プラスを見る", 'data-from="used"', true)}<button type="button" class="text-button" data-action="life-free-used-close" data-week="${w}">閉じる</button></div></section>`;
}
// チケットが足りない時の案内（チケットの画面の中）。
function renderTicketPlusLine() {
  if (!gatingOn() || plusActive()) return "";
  return `<button type="button" class="text-button tk-plus-line" data-action="life-plus-open" data-from="tickets">✨ プラスなら4週ごとにチケット30枚 ›</button>`;
}
const PLUS_FROM = {
  locked: { kicker: "毎日の献立は、プラスで", title: "1週間ぜんぶ、<br>献立が決まる" },
  used: { kicker: "今週の3日分、決まりました", title: "のこりの日も、<br>献立におまかせ" },
  tickets: { kicker: "チケットが足りない時も", title: "4週ごとに、<br>チケット30枚" },
};
const PLUS_PERKS = ["🗓 毎日の献立（無料は週3日分まで）", "🎟 4週ごとにチケット30枚（60枚まで貯められる）", "👫 同期している家族みんなで使える", "🔕 いつでもアプリから解約できる"];
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
