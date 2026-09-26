/* ふたりで使う：招待リンクでつながり、レシピ・献立・買い物・記録・リクエストを共有する。
   通信は既存の同期ルーム（app.js の syncNow / deriveSyncRoomId）をそのまま使う。
   招待リンクの合言葉は端末が作る推測されにくいランダム文字列で、URLの # 以降に入るためサーバーのログには残らない。 */
let joinInvite = null; // { code, from, to } while the join screen is open
let shareLink = ""; // shown after creating or re-sending an invite
let shareBusy = false;

function me() {
  return state.me && state.family.includes(state.me) ? state.me : state.family[0];
}
function partnerName() {
  return state.family.find((n) => n !== me()) || "";
}
function shareAvailable() {
  return Boolean(API_BASE_URL && globalThis.crypto?.subtle);
}

// ----- invite link -----
function randomInviteCode() {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
function inviteUrl() {
  const params = new URLSearchParams({ join: state.sync.code, from: me(), to: partnerName() });
  return `${location.origin}${location.pathname}#${params}`;
}
function readInviteFromLocation() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
  const code = hash.get("join");
  if (!code && hash.get("view") === "plan") {
    history.replaceState(null, "", location.pathname + location.search);
    state.view = "plan";
    return;
  }
  if (!code) return;
  history.replaceState(null, "", location.pathname + location.search);
  if (normalizeSyncCode(code).length < 16) return;
  if (state.sync?.roomId && normalizeSyncCode(state.sync.code) === normalizeSyncCode(code)) {
    showToast("この招待には、もう参加しています。");
    return;
  }
  joinInvite = { code, from: (hash.get("from") || "").slice(0, 20), to: (hash.get("to") || "").slice(0, 20) };
}
async function connectRoom(code) {
  state.sync = { code, roomId: await deriveSyncRoomId(normalizeSyncCode(code)), lastSyncAt: "" };
  lastSyncedFingerprint = "";
  saveState({ scheduleSync: false });
  const ok = await syncNow({ silent: true });
  if (!ok) {
    state.sync = { code: "", roomId: "", lastSyncAt: "" };
    saveState({ scheduleSync: false });
  }
  return ok;
}
// Keep the household order; only fill in the placeholder names ("自分" / "いっしょに食べた人").
function setMembers(mine, partner) {
  const family = [...state.family];
  const fill = (name, placeholder) => {
    if (!name || family.includes(name)) return;
    const i = family.indexOf(placeholder);
    if (i >= 0) { renameRatings(placeholder, name); family[i] = name; }
    else family.push(name);
  };
  fill(mine, "自分");
  fill(partner, "いっしょに食べた人");
  if (JSON.stringify(family) !== JSON.stringify(state.family)) {
    state.family = family;
    state.settingsUpdatedAt = nowIso();
  }
  state.me = mine;
}
// Ratings saved under the placeholder names follow the person who renamed them.
function renameRatings(from, to) {
  if (!from || from === to) return;
  state.evaluations.forEach((e) => {
    if (e.familyRepeatCycles && from in e.familyRepeatCycles && !(to in e.familyRepeatCycles)) {
      e.familyRepeatCycles[to] = e.familyRepeatCycles[from];
      delete e.familyRepeatCycles[from];
      e.updatedAt = nowIso();
    }
  });
}
async function shareInvite() {
  const url = inviteUrl();
  const text = `${me()}から「リピごち」への招待です。ふたりの献立とレシピを共有できます。`;
  await shareMessage(text, url);
}

// Some share targets (LINE, "コピー") drop the separate url field, so the link goes inside the text.
async function shareMessage(text, url) {
  const message = `${text}\n${url}`;
  if (navigator.share) {
    try { await navigator.share({ text: message }); return; } catch (error) { if (error?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(message); showToast("メッセージとリンクをコピーしました。LINEなどに貼り付けてください。"); }
  catch { showToast("コピーできませんでした。設定の「招待リンクを表示」から長押しでコピーしてください。"); }
}

// ----- requests -----
function normalizeRequests(raw) {
  return Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {})
    .filter(([id, r]) => /^req-/.test(id) && r && typeof r.recipeId === "string" && ["open", "done", "dismissed", "cancelled"].includes(r.status))
    .map(([id, r]) => [id, {
      id,
      recipeId: r.recipeId.slice(0, 80),
      recipeTitle: String(r.recipeTitle || "").slice(0, 100),
      from: String(r.from || "").slice(0, 20),
      late: !!r.late,
      status: r.status,
      date: /^\d{4}-\d{2}-\d{2}$/.test(r.date || "") ? r.date : "",
      createdAt: normalizeTimestamp(r.createdAt),
      updatedAt: normalizeTimestamp(r.updatedAt),
    }]));
}
function requestRecipe(q) {
  return recipeById(q.recipeId) || Lifestyle.curated.find((r) => r.id === q.recipeId) || { id: q.recipeId, title: q.recipeTitle, ingredients: [] };
}
function openRequests() {
  return Object.values(state.requests || {}).filter((q) => q.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function openRequestFor(recipe) {
  const q = openRequests().filter((x) => !x.date).find((x) => Lifestyle.sameDish(requestRecipe(x), recipe));
  return q ? { id: q.id, from: q.from } : null;
}
// ----- roles: owner (決める人) / viewer (見るだけ) / editor (変えられる) -----
function normalizeRoles(raw) {
  const members = Object.fromEntries(Object.entries(raw?.members || {}).filter(([n, r]) => typeof n === "string" && ["owner", "viewer", "editor"].includes(r)).map(([n, r]) => [n.slice(0, 20), r]));
  return { members, updatedAt: normalizeTimestamp(raw?.updatedAt) };
}
function roleOf(name) {
  const members = state.roles?.members || {};
  if (members[name]) return members[name];
  // Newcomers to a household with an owner start as viewers; households from before roles keep full access.
  return Object.values(members).includes("owner") ? "viewer" : "editor";
}
function isViewer() {
  return syncEnabled() && roleOf(me()) === "viewer";
}
function isOwner() {
  return roleOf(me()) === "owner";
}
const VIEWER_BLOCKED = ["life-profile", "life-pantry-set", "life-pantry-add", "life-pantry-open", "life-confirm", "life-confirm-one", "life-choose", "life-off", "life-reopen", "life-refresh", "life-add-item", "life-remove-item", "life-shopping-status", "life-quick", "life-review-saved", "edit-recipe", "delete-recipe"];
function viewerBlocked(action) {
  if (!isViewer() || !VIEWER_BLOCKED.includes(action)) return false;
  showToast("見るだけモードです。食べたいものは🙋で送ってね。");
  return true;
}
function viewerNote() {
  return "";
}
function renderViewerPlanBanner(plan) {
  if (!isViewer()) return "";
  const open = plan.some((d) => d.candidate && !d.slot);
  return open
    ? '<section class="viewer-banner"><strong>買い物の前に、食べたいものを送ってね</strong><small>各日の「🙋 別のがいい」か、レシピの「🙋 食べたい」から。</small></section>'
    : '<section class="viewer-banner is-done"><strong>今回の献立は決まりました</strong><small>🙋は次の献立に入ります。</small></section>';
}
function renderAskButton() {
  const partner = partnerName();
  if (!syncEnabled() || !partner || !isOwner()) return "";
  return `<button type="button" class="secondary-button full-button ask-button" data-action="life-ask">💬 ${escapeHtml(partner)}に食べたいものを聞く</button>`;
}
async function askPartner() {
  const url = `${location.origin}${location.pathname}#view=plan`;
  const text = `献立を決める前に、食べたいものある？「🙋 別のがいい」で送ってね`;
  await shareMessage(text, url);
}
// Owner side: "9/25 は ○○ がいい" on the day card, applied with one tap.
function renderSwapRequests(date) {
  const list = openRequests().filter((q) => q.date === date);
  if (!list.length) return "";
  return list.map((q) => {
    const r = requestRecipe(q);
    return `<div class="swap-request"><span>🙋 <b>${escapeHtml(q.from)}</b>：${escapeHtml(r.title || q.recipeTitle)}がいい</span>${isViewer() ? '<small class="muted">送信済み</small>' : `<button type="button" class="primary-button" data-action="life-apply-swap" data-id="${escapeAttr(q.id)}">入れ替える</button><button type="button" class="text-button" data-action="life-request-pass" data-id="${escapeAttr(q.id)}">パス</button>`}</div>`;
  }).join("");
}

function requestsEnabled() {
  return state.family.length >= 2 || syncEnabled();
}
function setRequest(id, status) {
  const q = state.requests?.[id];
  if (q) state.requests[id] = { ...q, status, updatedAt: nowIso() };
}
// Cooking the dish fulfils every open request for it.
function completeRequests(recipe) {
  openRequests().filter((q) => Lifestyle.sameDish(requestRecipe(q), recipe)).forEach((q) => setRequest(q.id, "done"));
}
function requestButton(recipe) {
  if (!requestsEnabled()) return "";
  const q = openRequestFor(recipe);
  const mine = q && q.from === me();
  return `<button type="button" class="tile-request" data-action="life-request" data-recipe="${escapeAttr(recipe.id)}" aria-pressed="${!!mine}" aria-label="${escapeAttr(recipe.title)}を${mine ? "リクエスト中（取り消す）" : "食べたいとリクエスト"}">${mine ? "✓ リクエスト中" : q ? `${escapeHtml(q.from)}のリクエスト` : "🙋 食べたい"}</button>`;
}
function renderRequests() {
  const list = openRequests().filter((q) => !q.date);
  if (!list.length) {
    const log = isViewer() ? "" : renderRequestLog();
    return log ? `<section class="request-card is-quiet">${log}</section>` : "";
  }
  const plan = dailyPlan();
  const where = (q) => {
    const r = requestRecipe(q);
    const day = plan.find((d) => Lifestyle.sameDish(d.slot?.recipe || d.candidate?.recipe, r));
    return day ? `${dayWordFor(day.date) === "今日" ? "今夜" : `${formatDate(day.date)}（${weekdayLabel(day.date)}）`}の献立に入りました` : "今の条件（時間・器具・食材）では献立に入れられません";
  };
  const rows = list.map((q) => {
    const r = requestRecipe(q);
    const mine = q.from === me();
    return `<div class="request-row">${dishTile(r, "request-thumb")}<div><p class="request-from">${mine ? "あなたのリクエスト" : `${escapeHtml(q.from)}から`}${q.late ? "（食べたい気持ち）" : ""}</p><strong>${escapeHtml(r.title || q.recipeTitle)}</strong><small>${escapeHtml(where(q))}</small></div>${mine ? `<button type="button" class="text-button" data-action="life-request" data-recipe="${escapeAttr(q.recipeId)}">取り消す</button>` : `<button type="button" class="text-button" data-action="life-request-pass" data-id="${escapeAttr(q.id)}">今回はパス</button>`}</div>`;
  }).join("");
  return `<section class="request-card" aria-label="リクエスト"><h3>💌 リクエスト</h3>${rows}${isViewer() ? "" : renderRequestLog()}</section>`;
}

// ----- screens -----
function renderSharePanel() {
  if (!shareAvailable()) return "";
  if (!syncEnabled()) {
    const mine = me() === "自分" ? "" : me();
    const partner = partnerName() === "いっしょに食べた人" ? "" : partnerName();
    return `<section class="panel share-panel" id="share"><h3>👫 ふたりで使う</h3><p>招待リンクを送るだけで、レシピ・献立・買い物リスト・記録を共有できます。相手は「これ食べたい」をリクエストできます。</p>
      <div class="share-names"><label>あなたの呼び名<input id="share-me" class="input" maxlength="12" placeholder="例：パパ" value="${escapeAttr(mine)}"></label><label>相手の呼び名<input id="share-partner" class="input" maxlength="12" placeholder="例：むすめ" value="${escapeAttr(partner)}"></label></div>
      <button type="button" class="primary-button full-button" data-action="life-share-start" ${shareBusy ? "disabled" : ""}>${shareBusy ? "準備しています…" : "招待リンクをつくる"}</button>
      <p class="muted small">リンクを知っている人は、このデータを見たり変えたりできます。家族以外には送らないでください。</p></section>`;
  }
  const link = shareLink || inviteUrl();
  return `<section class="panel share-panel" id="share"><h3>👫 ふたりで使う</h3><p>${state.family.map((n) => `<span class="chip">${escapeHtml(n)}${n === me() ? "（あなた）" : ""}</span>`).join(" ")} でつながっています。</p>
    <p class="muted small">最終同期：${formatSyncTime(state.sync.lastSyncAt)}${syncRuntimeStatus ? `<br>${escapeHtml(syncRuntimeStatus)}` : ""}</p>
    ${isViewer() ? '<p class="muted small">あなたは閲覧者です。献立を変えるには、管理者に役割の変更をお願いしてください。</p>' : renderRoleSettings()}
    <div class="actions">${dailyButton("life-share-send", "招待リンクを送る", "", true)}${copyButton("invite")}${dailyButton("sync-now", "今すぐ同期")}</div>
    <details class="share-link"><summary>招待リンクを表示</summary><input class="input" readonly value="${escapeAttr(link)}" aria-label="招待リンク"></details>
    <button type="button" class="text-button" data-action="sync-disconnect">この端末の共有をやめる</button></section>`;
}
function renderShareInvite() {
  if (!shareAvailable() || syncEnabled() || dailyProfile().servings < 2) return "";
  return `<section class="share-invite"><p class="hand">＼ ふたりで使うと、もっと楽しい ／</p><p class="small">相手のスマホから「これ食べたい」をリクエストできます。</p>${dailyButton("life-share-open", "招待リンクをつくる")}</section>`;
}
function renderJoin() {
  const q = joinInvite;
  return `<section class="hero-card join-card"><p class="hand">ようこそ！</p><h2>${q.from ? `${escapeHtml(q.from)}から、<br />` : ""}<span class="marker nobr">ふたりの食卓</span>への<br />招待です。</h2>
    <p>参加すると、レシピ・献立・買い物リストを共有して、「これ食べたい」をリクエストできます。</p>
    <label class="field">あなたの呼び名<input id="join-name" class="input" maxlength="12" value="${escapeAttr(q.to)}" placeholder="例：むすめ"></label>
    ${state.recipes.length || state.evaluations.length ? '<p class="muted small">この端末のレシピと記録も、ふたりのデータに加わります。</p>' : ""}
    <button type="button" class="primary-button full-button" data-action="life-join" ${shareBusy ? "disabled" : ""}>${shareBusy ? "つないでいます…" : "参加する"}</button>
    <button type="button" class="text-button full-button" data-action="life-join-cancel">今はやめておく</button></section>`;
}

// ----- actions (called first from handleDailyAction) -----
function handleHouseholdAction(action, data) {
  if (handleViewerAction(action, data)) return true;
  if (handleRoundAction(action, data)) return true;
  if (handleRhythmAction(action, data)) return true;
  if (action === "life-request") {
    const recipe = allDinnerRecipes().find((r) => r.id === data.recipe) || recipeById(data.recipe) || Lifestyle.curated.find((r) => r.id === data.recipe);
    if (!recipe) return true;
    if (!requestsEnabled()) { state.view = "settings"; showToast("ふたりでつながると、リクエストを送れます。"); }
    else {
      state.requests = state.requests || {};
      const q = openRequests().find((x) => !x.date && Lifestyle.sameDish(requestRecipe(x), recipe) && x.from === me());
      if (q) { setRequest(q.id, "cancelled"); showToast("リクエストを取り消しました。"); }
      else {
        const id = generateId("req-");
        const late = !canSwapRequest();
        state.requests[id] = { id, recipeId: recipe.id, recipeTitle: recipe.title, from: me(), status: "open", late, createdAt: nowIso(), updatedAt: nowIso() };
        if (late) showToast(`「${recipe.title}」食べたい気持ちを伝えました。`);
        else showToast(syncEnabled() ? `「${recipe.title}」をリクエストしました。${partnerName()}の献立に入ります。` : `「${recipe.title}」をリクエストしました。献立に入ります。`);
      }
    }
    saveState(); render(); return true;
  }
  if (action === "life-request-swap") {
    if (!canSwapRequest(data.date)) { showToast("今回の締切は過ぎました。食べたい気持ちはレシピの🙋で伝えられます。"); swapDate = ""; render(); return true; }
    const recipe = allDinnerRecipes().find((r) => r.id === data.recipe);
    if (recipe && data.date) {
      openRequests().filter((q) => q.date === data.date && q.from === me()).forEach((q) => setRequest(q.id, "cancelled"));
      const id = generateId("req-");
      state.requests[id] = { id, recipeId: recipe.id, recipeTitle: recipe.title, from: me(), date: data.date, status: "open", createdAt: nowIso(), updatedAt: nowIso() };
      swapDate = "";
      showToast(`「${recipe.title}」を送りました。`);
    }
    saveState(); render(); return true;
  }
  if (action === "life-apply-swap") {
    const q = state.requests?.[data.id];
    const recipe = q && allDinnerRecipes().find((r) => r.id === q.recipeId);
    if (recipe) {
      if (state.mealSlots[q.date]?.status === "confirmed") confirmDaily({ date: q.date }, recipe);
      else state.planOverrides[q.date] = recipe.id;
      setRequest(q.id, "done");
      showToast(`${formatDate(q.date)}を「${recipe.title}」にしました。`);
    }
    saveState(); render(); return true;
  }
  if (action === "life-ask") { askPartner(); return true; }
  if (action === "life-become-owner") {
    state.roles = { members: Object.fromEntries(state.family.map((n) => [n, n === me() ? "owner" : "viewer"])), updatedAt: nowIso() };
    showToast(`献立を決めるのは${me()}になりました。`);
    saveState(); render(); return true;
  }
  if (action === "life-role-toggle" && isOwner()) {
    const next = roleOf(data.member) === "viewer" ? "editor" : "viewer";
    state.roles = { members: { ...(state.roles?.members || {}), [data.member]: next }, updatedAt: nowIso() };
    showToast(next === "editor" ? `${data.member}も献立を変えられるようにしました。` : `${data.member}を見るだけモードにしました。`);
    saveState(); render(); return true;
  }
  if (action === "life-request-pass") {
    setRequest(data.id, "dismissed");
    saveState(); render(); return true;
  }
  if (action === "life-share-open") {
    state.view = "settings";
    saveState(); render();
    openSetting("share");
    return true;
  }
  if (action === "life-share-send") { shareInvite(); return true; }
  if (action === "life-share-start") {
    const mine = document.querySelector("#share-me")?.value.trim().slice(0, 12);
    const partner = document.querySelector("#share-partner")?.value.trim().slice(0, 12);
    if (!mine || !partner || mine === partner) { showToast("ふたりの呼び名を、ちがう名前で入れてください。"); return true; }
    shareBusy = true; render();
    setMembers(mine, partner);
    state.roles = { members: { ...(state.roles?.members || {}), [mine]: "owner", [partner]: state.roles?.members?.[partner] || "viewer" }, updatedAt: nowIso() };
    if (state.servingCount < 2) state.servingCount = 2;
    connectRoom(randomInviteCode()).then((ok) => {
      shareBusy = false;
      if (ok) { shareLink = inviteUrl(); showToast("招待リンクができました。相手に送ってください。"); render(); shareInvite(); }
      else { showToast("サーバーに接続できませんでした。時間をおいて試してください。"); render(); }
    });
    return true;
  }
  if (action === "life-join-cancel") { joinInvite = null; render(); return true; }
  if (action === "life-join") {
    const name = document.querySelector("#join-name")?.value.trim().slice(0, 12);
    if (!name) { showToast("呼び名を入れてください。"); return true; }
    const invite = joinInvite;
    shareBusy = true; render();
    // A new device skips the questionnaire; the household settings arrive with the data.
    if (!state.onboarded) {
      state.onboarded = true;
      state.foodProfile = Lifestyle.profile({ servings: 2 });
    }
    renameRatings("自分", name);
    connectRoom(invite.code).then((ok) => {
      shareBusy = false;
      if (!ok) { showToast("つなげませんでした。通信を確認して、もう一度リンクを開いてください。"); render(); return; }
      joinInvite = null;
      const partner = state.family.find((n) => n !== name && n !== "自分") || invite.from;
      setMembers(name, partner);
      if (state.servingCount < 2) state.servingCount = 2;
      state.view = "today";
      saveState();
      syncNow({ silent: true });
      showToast(`${invite.from || "相手"}とつながりました！`);
      render();
    });
    return true;
  }
  return false;
}

// ----- 閲覧者のための画面（食に興味がなくても、1タップで済むように） -----
const ROLE_LABEL = { owner: "管理者", editor: "編集者", viewer: "閲覧者" };
const ROLE_TABLE = [
  ["献立・買い物リストを見る", "○", "○", "○"],
  ["🙋 食べたい・別のがいいを送る", "○", "○", "○"],
  ["次に食べたい頃を答える", "○", "○", "○"],
  ["買い物のチェック", "○", "○", "○"],
  ["献立を決める・入れ替える", "○", "○", "×"],
  ["レシピの追加・編集", "○", "○", "×"],
  ["時間・器具などの条件", "○", "○", "×"],
  ["役割を変える", "○", "×", "×"],
];
function normalizeMemberPrefs(raw) {
  return Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([n, v]) => n && v && typeof v === "object").map(([n, v]) => [n.slice(0, 20), {
    restrictions: (Array.isArray(v.restrictions) ? v.restrictions : []).filter((x) => Lifestyle.restrictionOptions.includes(x)),
    likes: (Array.isArray(v.likes) ? v.likes : []).filter((x) => typeof x === "string").slice(0, 20),
    done: !!v.done,
    updatedAt: normalizeTimestamp(v.updatedAt),
  }]));
}
function memberPrefs(name = me()) {
  return state.memberPrefs?.[name] || { restrictions: [], likes: [], done: false, updatedAt: "" };
}
function setMemberPrefs(patch) {
  state.memberPrefs = { ...(state.memberPrefs || {}), [me()]: { ...memberPrefs(), ...patch, updatedAt: nowIso() } };
}
// Everyone's "食べられないもの" applies to the household plan.
function householdRestrictions() {
  return [...new Set(Object.values(state.memberPrefs || {}).flatMap((p) => p.restrictions || []))];
}
// A dish someone tapped as "好き" counts as 毎週 for them until they rate it.
function likedCycles(recipe) {
  const out = {};
  Object.entries(state.memberPrefs || {}).forEach(([name, p]) => {
    if ((p.likes || []).some((id) => Lifestyle.sameDish({ id }, recipe))) out[name] = "weekly";
  });
  return out;
}
let viewerStep = 0;
function needsViewerSetup() {
  return isViewer() && !memberPrefs().done;
}
function renderViewerSetup() {
  const prefs = memberPrefs();
  const steps = [
    () => `<p class="hand">ようこそ！ 質問は2つだけ。</p><h2>食べられないものは<br /><span class="marker nobr">ある？</span></h2><p class="muted small">アレルギーなど。えらんだものは献立に入りません。</p>
      <div class="viewer-chips">${Lifestyle.restrictionOptions.map((x) => `<button type="button" class="chip-tab" data-action="life-viewer-restrict" data-name="${escapeAttr(x)}" aria-pressed="${prefs.restrictions.includes(x)}">${escapeHtml(x)}</button>`).join("")}</div>
      ${dailyButton("life-viewer-next", prefs.restrictions.length ? "つぎへ" : "とくにない", "", true)}`,
    () => {
      const picks = Lifestyle.curated.filter((r) => Lifestyle.fit(r, dailyProfile(), today()).ok).slice(0, 12);
      return `<h2>好きそうなのを<br /><span class="marker nobr">タップ！</span></h2><p class="muted small">いくつでもOK。あとで献立に出やすくなります。</p>
      <div class="viewer-likes">${picks.map((r) => `<button type="button" class="viewer-like" data-action="life-viewer-like" data-recipe="${escapeAttr(r.id)}" aria-pressed="${prefs.likes.includes(r.id)}" aria-label="${escapeAttr(r.title)}">${dishTile(r)}<span>${escapeHtml(r.title)}</span></button>`).join("")}</div>
      ${dailyButton("life-viewer-done", "できた！", "", true)}`;
    },
  ];
  return `<section class="viewer-setup">${steps[Math.min(viewerStep, steps.length - 1)]()}</section>`;
}
function renderViewerToday() {
  const day = dailyPlan()[0];
  const slot = state.mealSlots?.[today()];
  const recipe = slot?.recipe || day?.candidate?.recipe;
  const off = day?.off || slot?.status === "off";
  const tomorrow = dailyPlan()[1];
  const tr = tomorrow?.slot?.recipe || tomorrow?.candidate?.recipe;
  const mine = openRequests().filter((q) => q.from === me());
  return `${renderPreferencePrompt()}
    <section class="viewer-today"><p class="hand">今夜のごはん</p>
      ${off || !recipe ? '<h2 class="viewer-title">今夜はお休み 🌙</h2>' : `${dishTile(recipe, "viewer-photo")}<h2 class="viewer-title">${escapeHtml(recipe.title)}</h2>`}
      ${tr ? `<p class="viewer-next">明日は <b>${escapeHtml(tr.title)}</b></p>` : ""}
    </section>
    <div class="viewer-actions">${dailyButton("go-view", "🙋 食べたいものを送る", 'data-view="collection"', true)}${dailyButton("go-view", "献立を見る", 'data-view="plan"')}</div>
    ${mine.length ? `<p class="viewer-sent">送ったリクエスト：${mine.map((q) => escapeHtml(requestRecipe(q).title || q.recipeTitle)).join("、")}</p>` : ""}`;
}
function renderViewerPlan() {
  const plan = dailyPlan();
  const open = plan.some((d) => d.candidate && !d.slot);
  const rows = plan.map((d) => {
    const r = d.slot?.recipe || d.candidate?.recipe;
    const label = d.date === today() ? "今夜" : `${formatDate(d.date)}（${weekdayLabel(d.date)}）`;
    if (d.off || d.slot?.status === "off" || !r) return `<div class="viewer-day is-off"><b>${label}</b><span>お休み</span></div>`;
    const sent = openRequests().find((q) => q.date === d.date && q.from === me());
    return `<div class="viewer-day">${dishTile(r)}<div><b>${label}</b><strong>${escapeHtml(r.title)}</strong>${sent ? `<small>🙋 ${escapeHtml(requestRecipe(sent).title)}を送ったよ</small>` : ""}</div>${d.slot?.status === "cooked" || !canSwapRequest(d.date) ? "" : `<button type="button" class="tile-request" data-action="${swapDate === d.date ? "life-close-swap" : "life-swap"}" data-date="${d.date}">${swapDate === d.date ? "閉じる" : "🙋 変えたい"}</button>`}</div>${swapDate === d.date ? renderSwapChoices() : ""}`;
  }).join("");
  return `${renderWeekBoard()}<section class="viewer-plan-top"><h2>${open && canSwapRequest() ? "買い物の前に、<br /><span class=\"marker nobr\">🙋で送ってね</span>" : "献立、<br /><span class=\"marker nobr\">決まったよ</span>"}</h2></section><section class="viewer-days">${rows}</section>`;
}
function renderRoleSettings() {
  if (!syncEnabled()) return "";
  const hasOwner = Object.values(state.roles?.members || {}).includes("owner");
  const canEdit = isOwner() || !hasOwner;
  const rows = state.family.map((n) => {
    const role = n === me() && canEdit ? "owner" : roleOf(n);
    const control = n === me() || !canEdit
      ? `<span class="role-badge role-${role}">${ROLE_LABEL[role]}${n === me() ? "（あなた）" : ""}</span>`
      : `<div class="segmented role-seg" role="group" aria-label="${escapeAttr(n)}の役割">${["viewer", "editor"].map((r) => `<button type="button" class="choice-button" data-action="life-set-role" data-member="${escapeAttr(n)}" data-role="${r}" aria-pressed="${role === r}">${ROLE_LABEL[r]}</button>`).join("")}</div>`;
    return `<div class="role-row"><strong>${escapeHtml(n)}</strong>${control}</div>`;
  }).join("");
  return `<div class="role-settings"><h4>メンバーと役割</h4>${rows}
    ${!hasOwner ? '<p class="muted small">役割をえらぶと、あなたが管理者になります。</p>' : ""}
    <details class="role-help"><summary>役割でできること</summary><table><thead><tr><th></th><th>管理者</th><th>編集者</th><th>閲覧者</th></tr></thead><tbody>${ROLE_TABLE.map(([what, ...cells]) => `<tr><td>${what}</td>${cells.map((c) => `<td class="${c === "○" ? "ok" : "ng"}">${c}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="muted small">閲覧者は、画面がシンプルになります（今夜のごはん・献立・食べたいもの・買い物だけ）。</p></details></div>`;
}
function handleViewerAction(action, data) {
  if (action === "life-viewer-restrict") {
    const list = memberPrefs().restrictions;
    setMemberPrefs({ restrictions: list.includes(data.name) ? list.filter((x) => x !== data.name) : [...list, data.name] });
  } else if (action === "life-viewer-next") viewerStep = 1;
  else if (action === "life-viewer-like") {
    const list = memberPrefs().likes;
    setMemberPrefs({ likes: list.includes(data.recipe) ? list.filter((x) => x !== data.recipe) : [...list, data.recipe] });
  } else if (action === "life-viewer-done") { setMemberPrefs({ done: true }); viewerStep = 0; state.view = "today"; showToast("ありがとう！ 好きなものが献立に出やすくなります。"); }
  else if (action === "life-viewer-redo") { setMemberPrefs({ done: false }); viewerStep = 0; state.view = "today"; }
  else if (action === "life-set-role" && (isOwner() || !Object.values(state.roles?.members || {}).includes("owner")) && ["viewer", "editor"].includes(data.role)) {
    state.roles = { members: { ...(state.roles?.members || {}), [me()]: "owner", [data.member]: data.role }, updatedAt: nowIso() };
    showToast(`${data.member}を${ROLE_LABEL[data.role]}にしました。`);
  } else return false;
  saveState(); render(); return true;
}

// ----- 買い物ラウンド：締切までにリクエスト → 買い物完了でロック -----
function normalizeRound(raw) {
  const ok = (v) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || "");
  if (!raw || !ok(raw.deadline)) return { deadline: "", status: "", updatedAt: normalizeTimestamp(raw?.updatedAt), lastDeadline: ok(raw?.lastDeadline) ? raw.lastDeadline : "" };
  return { deadline: raw.deadline, status: raw.status === "done" ? "done" : "open", lastDeadline: ok(raw.lastDeadline) ? raw.lastDeadline : raw.deadline, updatedAt: normalizeTimestamp(raw.updatedAt) };
}
const localStamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
// none: 受付していない / open: 締切前 / closed: 締切後・買い物前 / done: 買い物完了
function roundPhase() {
  if (rhythmOn()) return rhythmPhase();
  const r = state.round;
  if (!r?.deadline) return "none";
  if (r.status === "done") return "done";
  return localStamp(new Date()) < r.deadline ? "open" : "closed";
}
function deadlineLabel(stamp = currentDeadline()) {
  if (!stamp) return "";
  const d = new Date(stamp);
  return `${d.getMonth() + 1}/${d.getDate()}（${"日月火水木金土"[d.getDay()]}）${stamp.slice(11)}`;
}
function timeLeftLabel() {
  const ms = new Date(currentDeadline()) - new Date();
  const h = Math.floor(ms / 3600000);
  return h >= 24 ? `あと${Math.floor(h / 24)}日` : h >= 1 ? `あと${h}時間` : `あと${Math.max(1, Math.ceil(ms / 60000))}分`;
}
// Default: same weekday and time as last time, next occurrence; otherwise tomorrow 10:00.
function defaultDeadline() {
  const now = new Date();
  const last = state.round?.lastDeadline;
  if (last) {
    const prev = new Date(last);
    const next = new Date(now);
    next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
    let add = (prev.getDay() - now.getDay() + 7) % 7;
    if (add === 0 && next <= now) add = 7;
    next.setDate(next.getDate() + add);
    return localStamp(next);
  }
  const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(10, 0, 0, 0);
  return localStamp(t);
}
function canSwapRequest(date) {
  if (rhythmOn()) {
    const b = planningBlock();
    return !!b && blockStatus(b) === "open" && (!date || b.dates.includes(date));
  }
  const phase = roundPhase();
  return phase === "none" || phase === "open";
}
function roundMessage() {
  return `${deadlineLabel()}に買い物に行く予定。献立変更のリクエストがあればそれまでによろしく！`;
}
const planUrl = () => `${location.origin}${location.pathname}#view=plan`;
let roundEditing = false;
function copyButton(kind) {
  return `<button type="button" class="copy-mini" data-action="life-copy-msg" data-kind="${kind}" aria-label="メッセージをコピー">コピー</button>`;
}
async function copyMessage(kind) {
  const text = kind === "invite" ? `${me()}から「リピごち」への招待です。ふたりの献立とレシピを共有できます。\n${inviteUrl()}` : `${roundMessage()}\n${planUrl()}`;
  try { await navigator.clipboard.writeText(text); showToast("メッセージをコピーしました。"); }
  catch { showToast("コピーできませんでした。"); }
}
function renderRoundCard() {
  if (rhythmOn()) return "";
  if (!syncEnabled() || isViewer() || !partnerName()) return "";
  const phase = roundPhase();
  const form = () => `<div class="round-form"><label>買い物に行く予定<input id="round-deadline" class="input" type="datetime-local" value="${escapeAttr(state.round?.deadline && phase !== "done" ? state.round.deadline : defaultDeadline())}"></label>
    <div class="round-actions">${dailyButton("life-round-start", phase === "none" || phase === "done" ? "受付を始めて知らせる" : "締切を変えて知らせる", "", true)}${phase === "open" || phase === "closed" ? `<button type="button" class="text-button" data-action="life-round-cancel-edit">やめる</button>` : ""}</div></div>`;
  if (phase === "none" || phase === "done" || roundEditing) {
    return `<section class="round-card"><h3>🛒 リクエストを受け付ける</h3><p class="small">買い物の予定を決めると、${escapeHtml(partnerName())}がそれまでに「食べたい」「変えたい」を送れます。</p>${form()}</section>`;
  }
  const count = openRequests().filter((q) => !q.late).length;
  return `<section class="round-card is-${phase}"><h3>${phase === "open" ? "🙋 リクエスト受付中" : "⏰ 締切を過ぎました"}</h3>
    <p><b>${deadlineLabel()}</b> ${phase === "open" ? `まで（${timeLeftLabel()}）` : "の買い物"}・届いたリクエスト ${count}件</p>
    <div class="round-actions">${phase === "open" ? dailyButton("life-round-remind", "もう一度知らせる") : ""}${copyButton("round")}<button type="button" class="text-button" data-action="life-round-edit">${phase === "open" ? "締切を変える" : "延長する"}</button></div></section>`;
}
function renderRoundBanner() {
  const phase = roundPhase();
  if (phase === "open") return `<section class="viewer-banner"><strong>${deadlineLabel()}に買い物！</strong><small>それまでに🙋で送ってね（${timeLeftLabel()}）</small></section>`;
  if (phase === "closed" || phase === "done") return `<section class="viewer-banner is-done"><strong>${phase === "done" ? "今回の買い物は終わりました" : "今回の締切は過ぎました"}</strong><small>食べたい気持ちは、いつでも🙋で伝えられます。</small></section>`;
  return "";
}
function renderShoppingDone(items) {
  if (rhythmOn()) return renderBlockShoppingDone(items);
  const phase = roundPhase();
  if (isViewer() || !(phase === "open" || phase === "closed")) return "";
  const all = items.length && items.every((i) => i.status !== "buy");
  return dailyButton("life-round-done", "買い物完了", "", all);
}
function renderRequestLog() {
  const all = Object.values(state.requests || {}).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30);
  if (!all.length) return "";
  const label = { open: "受付中", done: "反映した", dismissed: "パス", cancelled: "取り消し" };
  return `<details class="request-log"><summary>これまでのリクエスト（${all.length}件）</summary><ul>${all.map((q) => `<li><span>${formatDate(q.createdAt.slice(0, 10))}</span><b>${escapeHtml(q.from)}</b>${escapeHtml(requestRecipe(q).title || q.recipeTitle)}${q.date ? `（${formatDate(q.date)}を変えたい）` : ""}<em>${q.late ? "気持ち・" : ""}${label[q.status] || ""}</em></li>`).join("")}</ul></details>`;
}
function handleRoundAction(action, data) {
  if (action === "life-copy-msg") { copyMessage(data.kind); return true; }
  if (action.startsWith("life-round-") && isViewer()) return true;
  if (action === "life-round-edit") roundEditing = true;
  else if (action === "life-round-cancel-edit") roundEditing = false;
  else if (action === "life-round-start") {
    const v = document.querySelector("#round-deadline")?.value || "";
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) || v <= localStamp(new Date())) { showToast("これから先の日時をえらんでください。"); return true; }
    state.round = { deadline: v, status: "open", lastDeadline: v, updatedAt: nowIso() };
    roundEditing = false;
    saveState(); render();
    shareMessage(roundMessage(), planUrl());
    return true;
  } else if (action === "life-round-remind") { shareMessage(roundMessage(), planUrl()); return true; }
  else if (action === "life-round-done") {
    state.round = { ...state.round, status: "done", updatedAt: nowIso() };
    showToast("おつかれさま！ 今回のリクエストは締め切りました。");
  } else return false;
  saveState(); render(); return true;
}

// ----- 共通タイムライン：献立 → リクエスト → 買い物 → 完了 -----
function flowState() {
  const plan = dailyPlan();
  const unconfirmed = plan.some((d) => d.candidate && !d.slot);
  const toBuy = dailyShopping().filter((i) => i.status === "buy").length;
  const phase = roundPhase();
  const shared = syncEnabled() && !!partnerName();
  const steps = shared ? ["献立", "リクエスト", "買い物", "完了"] : ["献立", "買い物", "完了"];
  let step;
  if (unconfirmed && (phase === "open" || phase === "closed")) step = "リクエスト";
  else if (unconfirmed) step = "献立";
  else if (toBuy && phase !== "done") step = "買い物";
  else step = "完了";
  return { steps, step, phase, toBuy, shared };
}
function flowHint(f) {
  const v = isViewer();
  const partner = escapeHtml(partnerName());
  const who = v ? "" : partner;
  switch (f.step) {
    case "献立": return v ? "献立を準備中。食べたいものは🙋でいつでも" : f.shared ? `献立を見て、${who}にリクエストを聞こう` : "献立を見て「これで決定」";
    case "リクエスト": return f.phase === "open"
      ? (v ? `<b>${deadlineLabel()}</b>までに🙋で送ってね（${timeLeftLabel()}）` : `<b>${deadlineLabel()}</b>まで受付中（${timeLeftLabel()}）`)
      : (v ? "締切を過ぎました。献立の決定を待っています" : "締切を過ぎました。献立を決めて買い物へ");
    case "買い物": return v ? `買い物の準備中（あと${f.toBuy}品）` : `あと${f.toBuy}品。買ったらチェック、終わったら「買い物完了」`;
    default: return "おつかれさま！ あとは作って、食べて、「次はいつ食べたい？」";
  }
}
function renderFlow() {
  if (!state.onboarded) return "";
  const f = flowState();
  const at = f.steps.indexOf(f.step);
  const target = { 献立: "plan", リクエスト: "plan", 買い物: "shopping", 完了: "today" }[f.step];
  const go = target !== state.view && f.step !== "完了" ? `<button type="button" class="flow-go" data-action="go-view" data-view="${target}">${f.step === "買い物" ? "買い物リストへ" : "献立へ"} ›</button>` : "";
  return `<section class="flow" aria-label="今の段階：${f.step}"><ol class="flow-steps">${f.steps.map((s, i) => `<li class="${i < at ? "is-done" : i === at ? "is-now" : ""}"><i aria-hidden="true">${i < at ? "✓" : i + 1}</i><span>${s}</span></li>`).join("")}</ol><p class="flow-hint"><span>${flowHint(f)}</span>${go}</p></section>`;
}

// ----- 献立のリズム：決める→買う→作る（作りながら次を考える）を曜日で固定する -----
// 定着の目安：3日ずつなら週2回の決定。好きな料理が「次に食べたい頃」でまた出てくるのは
// 2〜4週目なので、はじめの4週間を「ループが回り始めるまで」として見せる（週カウンター）。
const RHYTHMS = {
  "3day": { label: "3日ずつ", note: "月火水／木金土・日曜お休み", blocks: [[1, 2, 3], [4, 5, 6]] },
  week: { label: "1週間まとめて", note: "月〜土・日曜お休み", blocks: [[1, 2, 3, 4, 5, 6]] },
  weekday: { label: "平日だけ", note: "月〜金・土日お休み", blocks: [[1, 2, 3, 4, 5]] },
};
const SHOP_TIMES = ["10:00", "12:00", "17:00", "19:00"];
const LOOP_WEEKS = 4;
function normalizeShopDone(raw) {
  return Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "string"));
}
function normalizeRhythm(raw) {
  return {
    preset: RHYTHMS[raw?.preset] ? raw.preset : "",
    shopTime: SHOP_TIMES.includes(raw?.shopTime) ? raw.shopTime : "17:00",
    dismissed: !!raw?.dismissed,
    // First block of the rhythm: starting mid-block would skip the first full "decide → shop" round.
    startFrom: /^\d{4}-\d{2}-\d{2}$/.test(raw?.startFrom || "") ? raw.startFrom : "",
    updatedAt: normalizeTimestamp(raw?.updatedAt),
  };
}
function rhythmOn() {
  return !!RHYTHMS[state.rhythm?.preset];
}
function rhythmDays() {
  return [...new Set(RHYTHMS[state.rhythm.preset].blocks.flat())].map(String);
}
const dow = (date) => new Date(date + "T12:00:00").getDay();
const WD = "日月火水木金土";
function blockRange(b) {
  return `${WD[dow(b.start)]}〜${WD[dow(b.end)]}`;
}
// Concrete blocks (start, end, dates, shopAt) that end on or after `from`.
function blocksFrom(from, horizon = 21) {
  if (!rhythmOn()) return [];
  const out = [];
  for (let i = -7; i < horizon; i += 1) {
    const date = addDays(from, i);
    const shape = RHYTHMS[state.rhythm.preset].blocks.find((b) => b[0] === dow(date));
    if (!shape) continue;
    const dates = shape.map((_, k) => addDays(date, k));
    const b = { key: date, start: date, end: dates[dates.length - 1], dates, shopAt: `${addDays(date, -1)}T${state.rhythm.shopTime}` };
    if (b.end >= from) out.push(b);
  }
  return out;
}
function currentBlocks() {
  const from = state.rhythm?.startFrom || "";
  return blocksFrom(today(), 28).filter((b) => !from || b.start >= from).slice(0, 2);
}
// The first block whose shopping time is still ahead, so the first round is a whole one.
function firstFullBlock() {
  const now = localStamp(new Date());
  return blocksFrom(today(), 28).find((b) => b.start >= today() && b.shopAt > now);
}
function prestartUntil() {
  return rhythmOn() && state.rhythm.startFrom > today() ? state.rhythm.startFrom : "";
}
function rhythmPlanDays() {
  const [cur, next] = currentBlocks();
  const end = (next || cur)?.end;
  return end ? daysBetween(today(), end) + 1 : 3;
}
function blockStatus(b) {
  if (state.shopDone?.[b.key]) return "shopped";
  const upcoming = b.dates.filter((d) => d >= today());
  const slots = state.mealSlots || {};
  if (upcoming.every((d) => slots[d] && slots[d].status !== "removed")) return "decided";
  return localStamp(new Date()) < b.shopAt ? "open" : "late";
}
function planningBlock() {
  return currentBlocks().find((b) => ["open", "late"].includes(blockStatus(b))) || null;
}
function shoppingBlock() {
  return currentBlocks().find((b) => blockStatus(b) === "decided") || null;
}
function rhythmPhase() {
  const b = planningBlock();
  if (!b) return shoppingBlock() ? "closed" : "done";
  return blockStatus(b) === "open" ? "open" : "closed";
}
function currentDeadline() {
  return rhythmOn() ? planningBlock()?.shopAt || "" : state.round?.deadline || "";
}
function decidedUntil() {
  const slots = state.mealSlots || {};
  let d = today(), last = "";
  for (let i = 0; i < 21; i += 1, d = addDays(d, 1)) {
    const s = slots[d];
    const off = rhythmOn() && !rhythmDays().includes(String(dow(d)));
    if (s && s.status !== "removed") last = d;
    else if (!off) break;
  }
  return last;
}
function loopWeek() {
  const first = [...state.evaluations].map((e) => e.cookedAt).filter(Boolean).sort()[0];
  return first ? Math.floor(daysBetween(first, today()) / 7) + 1 : 0;
}
let boardWeek = 0;
function renderWeekBoard() {
  if (!state.onboarded) return "";
  const t = today();
  const start = addDays(addDays(t, -dow(t)), boardWeek * 7);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const plan = new Map(dailyPlan().map((d) => [d.date, d]));
  const eaten = new Map(mealHistory(28).map((m) => [m.date, m.recipe]));
  const blocks = rhythmOn() ? blocksFrom(addDays(start, -7), 28).filter((b) => b.end >= start && b.start <= dates[6]) : [];
  const shopDays = new Map(blocks.map((b) => [b.shopAt.slice(0, 10), b.shopAt.slice(11)]));
  const cells = dates.map((date) => {
    const slot = state.mealSlots?.[date];
    const day = plan.get(date);
    const past = date < t;
    const recipe = past ? eaten.get(date) || slot?.recipe : slot?.recipe || day?.candidate?.recipe;
    const off = slot?.status === "off" || day?.off || (rhythmOn() && !rhythmDays().includes(String(dow(date))));
    const kind = slot?.status === "cooked" || (past && recipe) ? "is-cooked" : slot && slot.status !== "removed" ? "is-decided" : recipe ? "is-draft" : "";
    const inner = day?.prestart && !recipe ? "<em>–</em>" : off && !recipe ? "<em>休</em>" : recipe ? dishTile(recipe) : "<em>・</em>";
    const shop = shopDays.has(date) ? `<b class="wk-shop" title="買い物 ${shopDays.get(date)}">🛒</b>` : "";
    return `<button type="button" class="wk-cell ${kind} ${date === t ? "is-today" : ""}" ${recipe ? `data-action="life-cal-pick" data-date="${date}"` : "disabled"} aria-label="${escapeAttr(`${formatDate(date)}${recipe ? " " + recipe.title : off ? " お休み" : " 未定"}`)}"><span class="wk-num">${Number(date.slice(8))}</span>${inner}${shop}${kind === "is-cooked" ? '<i class="wk-check">✓</i>' : ""}</button>`;
  }).join("");
  const label = { open: "受付中", late: "締切すぎ", decided: "決定", shopped: "買い物済み" };
  const bars = blocks.map((b) => {
    const from = Math.max(0, daysBetween(start, b.start)), to = Math.min(6, daysBetween(start, b.end));
    const st = blockStatus(b);
    return `<span class="wk-bar is-${st}" style="grid-column:${from + 1} / ${to + 2}">${label[st]}${st === "open" ? ` 〜${WD[dow(b.shopAt.slice(0, 10))]}${b.shopAt.slice(11)}` : st === "shopped" || st === "decided" ? " ✓" : ""}</span>`;
  }).join("");
  const pick = calPick && dates.includes(calPick) ? (plan.get(calPick)?.slot?.recipe || plan.get(calPick)?.candidate?.recipe || eaten.get(calPick)) : null;
  const week = loopWeek();
  const counter = week ? `<span class="wk-loop" title="${LOOP_WEEKS}週目ごろから「また食べたい」が回り始めます">${week}週目 ${Array.from({ length: LOOP_WEEKS }, (_, i) => `<i class="${i < Math.min(week, LOOP_WEEKS) ? "on" : ""}"></i>`).join("")}</span>` : "";
  return `<section class="week-board" aria-label="今週の献立">
    <div class="wk-top"><button type="button" class="wk-nav" data-action="life-week" data-delta="-1" ${boardWeek <= -2 ? "disabled" : ""} aria-label="前の週">‹</button><strong>${boardWeek === 0 ? "今週" : boardWeek === 1 ? "来週" : `${-boardWeek}週前`}</strong><button type="button" class="wk-nav" data-action="life-week" data-delta="1" ${boardWeek >= 1 ? "disabled" : ""} aria-label="次の週">›</button>${counter}</div>
    <div class="wk-head">${[...WD].map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="wk-grid">${cells}</div>
    ${bars ? `<div class="wk-bars">${bars}</div>` : ""}
    ${pick ? `<p class="wk-pick">${formatDate(calPick)}（${weekdayLabel(calPick)}）：<b>${escapeHtml(pick.title)}</b></p>` : ""}
    <div class="wk-hint">${boardHint()}</div></section>`;
}
function boardHint() {
  const v = isViewer();
  const until = decidedUntil();
  const untilText = until ? `<b>${formatDate(until)}（${weekdayLabel(until)}）</b>まで決まってるよ` : "";
  if (!rhythmOn()) {
    const phase = roundPhase();
    if (phase === "open") return v ? `<b>${deadlineLabel()}</b>までに🙋で送ってね（${timeLeftLabel()}）` : `<b>${deadlineLabel()}</b>の買い物まで受付中（${timeLeftLabel()}）`;
    return v ? untilText || "献立を準備中" : `${untilText ? untilText + "。" : ""}<button type="button" class="text-button" data-action="life-rhythm-open">献立のリズムを決める ›</button>`;
  }
  const b = planningBlock();
  const shop = shoppingBlock();
  const shared = syncEnabled() && !!partnerName();
  if (b) {
    const st = blockStatus(b);
    const count = openRequests().filter((q) => !q.late).length;
    if (v) return st === "open" ? `${blockRange(b)}のごはん、<b>${deadlineLabel(b.shopAt)}</b>までに🙋で送ってね` : `${untilText || "次の献立を準備中"}`;
    const tools = shared && st === "open" ? `<span class="wk-tools">${dailyButton("life-round-remind", "知らせる")}${copyButton("round")}</span>` : "";
    return `次の<b>${blockRange(b)}</b>：${st === "open" ? `${deadlineLabel(b.shopAt)}の買い物までに決めよう${shared ? `（リクエスト${count}件）` : ""}` : "買い物の予定を過ぎました。献立を決めて買い物へ"}${state.view !== "plan" ? ' <button type="button" class="text-button" data-action="go-view" data-view="plan">献立へ ›</button>' : ""}${tools}`;
  }
  if (shop && !v) return `${blockRange(shop)}の献立が決まりました。買い物が終わったら「買い物完了」 <button type="button" class="text-button" data-action="go-view" data-view="shopping">買い物へ ›</button>`;
  return untilText || "おつかれさま！";
}
function renderBlockShoppingDone(items) {
  const b = shoppingBlock();
  if (isViewer() || !b) return "";
  const all = items.length && items.every((i) => i.status !== "buy");
  return dailyButton("life-block-shopped", "買い物完了", `data-key="${b.key}"`, all);
}
function renderRhythmSettings(first = false) {
  const cur = state.rhythm?.preset || "3day";
  return `<section class="panel rhythm-panel" id="rhythm"><h3>🗓 献立のリズム</h3>
    <p class="muted small">決める日・買い物の日が曜日で決まり、「作りながら次を考える」が自然に回ります。</p>
    <div class="rhythm-options">${Object.entries(RHYTHMS).map(([id, r]) => `<button type="button" class="rhythm-option" data-action="life-rhythm" data-preset="${id}" aria-pressed="${rhythmOn() ? state.rhythm.preset === id : !first ? false : id === cur}"><strong>${r.label}</strong><small>${r.note}</small></button>`).join("")}</div>
    <label class="rhythm-time">買い物の時間（まとまりの前日）<select id="rhythm-time" class="input">${SHOP_TIMES.map((t) => `<option ${state.rhythm?.shopTime === t || (!state.rhythm?.shopTime && t === "17:00") ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    ${rhythmOn() ? '<button type="button" class="text-button" data-action="life-rhythm-off">リズムを使わない</button>' : ""}</section>`;
}
function renderRhythmInvite() {
  if (rhythmOn() || isViewer() || state.rhythm?.dismissed) return "";
  return `<section class="rhythm-invite"><p><b>献立のリズムを決めよう</b><br><small>おすすめ：3日ずつ（月火水／木金土・日曜お休み）、買い物は前日17:00</small></p><div class="actions">${dailyButton("life-rhythm", "これではじめる", 'data-preset="3day"', true)}${dailyButton("life-rhythm-open", "ほかを選ぶ")}</div></section>`;
}
function handleRhythmAction(action, data) {
  if (action === "life-week") { boardWeek = Math.max(-2, Math.min(1, boardWeek + (Number(data.delta) || 0))); calPick = ""; }
  else if (action === "life-rhythm-open") { state.view = "settings"; saveState(); openSetting("rhythm"); return true; }
  else if (action === "life-rhythm" && RHYTHMS[data.preset] && !isViewer()) {
    state.rhythm = { preset: data.preset, shopTime: document.querySelector("#rhythm-time")?.value || state.rhythm?.shopTime || "17:00", updatedAt: nowIso() };
    // With nothing decided from today on, begin at the next whole block.
    const decidedAhead = Object.values(state.mealSlots || {}).some((x) => x.date >= today() && ["confirmed", "cooked"].includes(x.status));
    state.rhythm.startFrom = decidedAhead ? "" : firstFullBlock()?.start || "";
    // During the first-run questions, picking a rhythm moves on to the next question.
    if ((profileEditing || !state.onboarded) && state.onboardingDraft?.quickSetupIndex === 1) state.onboardingDraft.quickSetupIndex = 2;
    state.planOverrides = {};
    showToast(`献立のリズムを「${RHYTHMS[data.preset].label}」にしました。`);
  } else if (action === "life-rhythm-off" && !isViewer()) state.rhythm = { preset: "", shopTime: state.rhythm.shopTime, updatedAt: nowIso(), dismissed: true };
  else if (action === "life-block-shopped" && !isViewer()) {
    // One trip covers every block that is decided by now.
    const stamp = nowIso();
    const keys = [data.key, ...currentBlocks().filter((x) => blockStatus(x) === "decided").map((x) => x.key)];
    state.shopDone = { ...(state.shopDone || {}), ...Object.fromEntries(keys.map((k) => [k, stamp])) };
    showToast("おつかれさま！ 次に献立を決めると、新しい買い物リストになります。");
  } else return false;
  saveState(); render(); return true;
}
