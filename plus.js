/* 無料とリピごちプラスの出し分け。決済（Stripe）と一緒に本番で有効にする（GATING_LIVE）。
   それまでは ?paywall=1 のプレビューの時だけ効く。?plus=on で、この端末をプラス扱いにできる（試す用）。
   ・無料期間：使い始めた日から次の月曜までの半端な日＋2週間（trialPlan）。カード不要・自動で課金しない
   ・無料期間のあと、無料は1週間（月〜日）に献立3日分まで。外食・お休みの日は数えない
   ・3日は自動で選ぶ（決めた日・作った日が先、あとは早い日から）。ロックの日から「この日を3日に入れる」で入れ替えられる
   ・決めた日・作った日はロックしない（無料期間中に決めた分もそのまま）
   ・プラスは、同期している家族みんなで使える（決済と一緒に、サーバーの状態を state.plus に入れる）
   ・プラスの案内は2か所だけ：3日を使い切った時／ロックの日を押した時（チケットの仕組みは 2026-10-28 にやめた） */
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
const PLUS_FROM = { locked: "🔒 毎日の献立はプラスで", used: "🎉 今週の3日分、決定！" };
const PLUS_PERKS = [["🗓", "毎日の献立"], ["👫", "家族で共有"], ["🔕", "いつでも解約"]];
function openPlus(from) {
  if (!PLUS_FROM[from]) return;
  paywall = { plan: "year", from };
  trackDaily("plus_view", { from });
}
function handlePlusAction(action, data) {
  if (action === "life-plus-open") { openPlus(data.from); render(); return true; }
  if (action === "life-free-pick") { if (pickFreeDay(data.date)) saveState(); render(); return true; }
  if (action === "life-free-used-close") { try { localStorage.setItem("ripigochi-free-used", data.week || ""); } catch {} render(); return true; }
  return false;
}

// ── β版のあいだ：課金ボタンを押してくれた人に「お気持ちありがとう」。意見を送ってくれた人には、正式版で3か月無料の招待コードを届ける。
const BETA = !GATING_LIVE;
let feedbackSheet = null; // { step: "thanks" | "form" | "sent", from, busy, error }
function openFeedback(from = "", step = "form") { feedbackSheet = { step, from, busy: false, error: "" }; paywall = null; trackDaily("feedback_open", { from, step }); render(); }
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
// ── 「⚡️ 異議あり」：レシピの間違い（人数・材料・手順・時刻）を運営に知らせる。construction2nd の「この問題に異議あり！」をまねた（APP_MAP §52-11）。
const OBJECTION_CATEGORIES = [
  { id: "servings", icon: "👥", label: "何人分か（人数）が違う" },
  { id: "ingredients", icon: "🥕", label: "材料・分量が違う" },
  { id: "steps", icon: "📝", label: "作り方（手順）が違う" },
  { id: "times", icon: "⏱", label: "動画の時刻がずれている" },
  { id: "other", icon: "💬", label: "その他ツッコミ" },
];
let objectionSheet = null; // { recipeId, date, category, suggested, comment, step: "form" | "sent", busy, error, applied }
function objectionRecipe(o = objectionSheet) {
  if (!o) return null;
  // 作る画面の提案中の料理（献立の枠にまだない）も、その日の候補から探す（Claude review #216）。
  const candidate = () => (o.date && typeof dailyPlan === "function" ? dailyPlan().find((d) => d.date === o.date)?.candidate?.recipe : null);
  return (o.date && state.mealSlots?.[o.date]?.recipe?.id === o.recipeId ? state.mealSlots[o.date].recipe : null)
    || (candidate()?.id === o.recipeId ? candidate() : null)
    || state.recipes.find((r) => r.id === o.recipeId)
    || Object.values(state.mealSlots || {}).find((sl) => sl?.recipe?.id === o.recipeId)?.recipe
    || (typeof detailRecipe === "function" && detailRecipe()?.id === o.recipeId ? detailRecipe() : null);
}
function openObjection(data) {
  const r = objectionRecipe({ recipeId: data.recipe, date: data.date || "" });
  if (!r) return;
  // レシピ全体への異議。どこが違うかは選んでもらう（呼び出し元が決めた時だけ選んでおく）。
  const category = OBJECTION_CATEGORIES.some((c) => c.id === data.category) ? data.category : "";
  objectionSheet = { recipeId: r.id, date: data.date || "", category, suggested: null, comment: "", step: "form", busy: false, error: "" };
  trackDaily("objection_open", { category: category || "none" });
}
// 打っている途中のひとことを覚えておく（ほかの理由で画面が描き直されても消えないように。Claude review #216）。
if (typeof document !== "undefined" && typeof document.addEventListener === "function") document.addEventListener("input", (e) => { if (e.target?.id === "obj-comment" && objectionSheet) objectionSheet.comment = String(e.target.value || "").slice(0, 500); });
const objectionComment = () => String(document.querySelector("#obj-comment")?.value ?? objectionSheet?.comment ?? "").slice(0, 500);
async function sendObjection() {
  const o = objectionSheet;
  if (!o || o.busy) return;
  const r = objectionRecipe(o);
  if (!r) { objectionSheet = null; render(); return; }
  const comment = objectionComment().trim();
  if (!o.category) { objectionSheet = { ...o, comment, error: "どこに異議があるか選んでください。" }; render(); return; }
  if (o.category === "other" && comment.length < 2) { objectionSheet = { ...o, comment, error: "どこが違うか、ひとこと書いてください。" }; render(); return; }
  const shown = r.sourceServings ?? null, by = r.sourceServingsBy || "";
  // 正しい人数を選んだら、この家庭のレシピ（と献立の写し）はすぐその人数にする（運営の確認を待たない）。
  let applied = 0;
  if (o.category === "servings" && o.suggested && o.suggested !== shown && !isViewer() && typeof setRecipeServings === "function") {
    applied = setRecipeServings(r.id, o.suggested, { date: o.date });
    if (applied) saveState();
  }
  objectionSheet = { ...o, comment, busy: true, error: "", applied: applied ? o.suggested : 0 };
  render();
  try {
    if (!API_BASE_URL) throw new Error("いまは送れません。");
    const body = { videoId: youtubeVideoId(r.videoUrl) || "", title: r.title || "", category: o.category, comment, where: state.view, version: APP_VERSION,
      ...(o.category === "servings" ? { servings: { shown, by, suggested: o.suggested || null } } : {}) };
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/recipes/objections`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify(body) }, 15_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "送れませんでした。");
    objectionSheet = { ...objectionSheet, step: "sent", busy: false };
    trackDaily("objection_sent", { category: o.category });
  } catch (error) {
    objectionSheet = { ...objectionSheet, busy: false, error: `${error.message || "送れませんでした。"} 時間をおいて、もう一度お試しください。` };
  }
  render();
}
function renderObjectionSheet() {
  const o = objectionSheet;
  if (!o) return "";
  const r = objectionRecipe(o);
  if (!r) return "";
  const close = '<button type="button" class="tk-close" data-action="life-obj-close" aria-label="閉じる">×</button>';
  const head = `<div class="fb-head obj-head"><span class="obj-bolt" aria-hidden="true">⚡️</span><div><p class="fb-title">このレシピに異議あり！</p><p class="obj-sub">${escapeHtml(r.title || "")}</p></div>${close}</div>`;
  let body;
  if (o.step === "sent") body = `${head}<div class="obj-done"><div class="obj-scale" aria-hidden="true">⚖️</div><p class="fb-title">異議申し立てを受け付けました！</p>
    <p class="fb-lead">ツッコミありがとうございます！<br>動画と見比べて確かめ、必要なら直します⚡️</p>
    ${o.applied ? `<p class="fb-gift">この家庭のレシピは、<b>${o.applied}人分</b>にしました。</p>` : ""}</div>
    <button type="button" class="primary-button full-button" data-action="life-obj-close">OK</button>`;
  else {
    const shown = r.sourceServings == null ? "未確認" : `${r.sourceServings}人分${r.sourceServingsBy === "manual" ? "（手動で設定）" : ""}`;
    body = `${head}<p class="obj-lead">「人数が違う！」「手順が足りない」など、違和感があれば5秒でツッコミを！</p>
    <p class="obj-label">どこに異議がありますか？（タップで選択）</p>
    <div class="obj-cats">${OBJECTION_CATEGORIES.map((c) => `<button type="button" class="obj-cat" data-action="life-obj-cat" data-category="${c.id}" aria-pressed="${o.category === c.id}"><span aria-hidden="true">${c.icon}</span>${escapeHtml(c.label)}</button>`).join("")}</div>
    ${o.category === "servings" ? `<p class="obj-label">いまは <b>${escapeHtml(shown)}</b>。正しくは何人分？（わかれば）</p>
    <div class="servings-options" role="group" aria-label="正しい人数">${[1, 2, 3, 4].map((k) => `<button type="button" class="choice-button" data-action="life-obj-servings" data-count="${k}" aria-pressed="${o.suggested === k}">${k}人分</button>`).join("")}<button type="button" class="choice-button" data-action="life-obj-servings" data-count="" aria-pressed="${!o.suggested}">不明</button></div>
    ${o.suggested && !isViewer() ? `<p class="muted small">送ると、この家庭のレシピも${o.suggested}人分になります。</p>` : ""}` : ""}
    <label class="obj-label" for="obj-comment">ひとことツッコミ（${o.category === "other" ? "必須" : "任意"}）</label>
    <textarea id="obj-comment" class="input fb-message" maxlength="500" rows="2" placeholder="例：説明欄に「2人分」と書いてあります">${escapeHtml(o.comment || "")}</textarea>
    <p class="muted small obj-note">※ 運営に届きます。お名前など個人情報は書かないでください。</p>
    ${o.error ? `<p class="form-error">${escapeHtml(o.error)}</p>` : ""}
    <button type="button" class="obj-submit full-button" data-action="life-obj-send" ${o.busy ? "disabled" : ""}>${o.busy ? "送っています…" : "⚡️ 異議を申し立てる！（送る）"}</button>`;
  }
  return `<div class="quota-sheet fb-sheet obj-sheet" role="dialog" aria-modal="true" aria-label="異議あり"><div class="quota-card">${body}</div></div>`;
}
function handleObjectionAction(action, data) {
  if (!action.startsWith("life-obj-")) return false;
  if (action === "life-obj-open") openObjection(data);
  else if (!objectionSheet) return true;
  else if (action === "life-obj-cat") objectionSheet = { ...objectionSheet, comment: objectionComment(), category: data.category, error: "" };
  else if (action === "life-obj-servings") { const n = Number(data.count); objectionSheet = { ...objectionSheet, comment: objectionComment(), suggested: Number.isInteger(n) && n > 0 ? n : null }; }
  else if (action === "life-obj-send") { sendObjection(); return true; }
  else if (action === "life-obj-close") objectionSheet = null;
  render();
  return true;
}
function handleFeedbackAction(action, data) {
  if (handleObjectionAction(action, data)) return true;
  if (action === "life-usage-toggle") { try { localStorage.setItem("ripigochi-usage", usageOn() ? "off" : "on"); } catch {} render(); return true; }
  if (!action.startsWith("life-fb")) return false;
  if (action === "life-fb-open") openFeedback(data.from || "settings", "form");
  else if (action === "life-fb-thanks") openFeedback(data.from || "", "thanks");
  else if (action === "life-fb-form") { feedbackSheet = { ...feedbackSheet, step: "form" }; render(); }
  else if (action === "life-fb-send") sendFeedback();
  else if (action === "life-fb-close") { feedbackSheet = null; render(); }
  return true;
}

// ── 使われ方の集計（個人・家庭を特定しない）。端末ごとのランダムな番号で、その日に起きたことの回数だけを送る。設定で止められる。
const USAGE_EVENTS = ["plan_confirmed", "plan_swapped", "plan_url_inserted", "meal_cooked", "meal_rated", "meal_skipped", "cooking_opened", "recipe_saved", "playlist_imported", "shopping_completed", "push_on", "feedback_sent", "objection_sent", "paywall_view", "plus_view", "free_pick", "talk_started", "talk_followup", "talk_fixed", "talk_saved", "meal_replanned", "swap_opened", "swap_more", "swap_closed"];
const usageOn = () => { try { return localStorage.getItem("ripigochi-usage") !== "off"; } catch { return false; } };
function anonId() {
  try {
    let id = localStorage.getItem("ripigochi-anon");
    if (!/^[a-z0-9]{8,40}$/.test(id || "")) { id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, "").slice(0, 24); localStorage.setItem("ripigochi-anon", id); }
    return id;
  } catch { return ""; }
}
const localDay = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
function usageSummary(day = today()) {
  const start = state.trialFrom || day;
  const events = {};
  for (const e of state.experienceEvents || []) if (USAGE_EVENTS.includes(e?.name) && e.at && localDay(e.at) === day) events[e.name] = (events[e.name] || 0) + 1;
  return { anon: anonId(), day, n: Math.max(0, daysBetween(start, day)), events, synced: typeof syncEnabled === "function" && syncEnabled(), members: (state.family || []).length || 1, recipes: (state.recipes || []).length, v: APP_VERSION };
}
let usageTimer = null;
function queueUsage(delay = 8000) {
  if (!API_BASE_URL || !state?.onboarded || !usageOn() || isViewer?.()) return;
  clearTimeout(usageTimer);
  usageTimer = setTimeout(async () => {
    const body = usageSummary();
    if (!body.anon) return;
    const hash = JSON.stringify(body);
    try { if (localStorage.getItem("ripigochi-usage-sent") === hash) return; } catch {}
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/usage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: hash }, 10_000);
      if (response.ok) try { localStorage.setItem("ripigochi-usage-sent", hash); } catch {}
    } catch {}
  }, delay);
}
