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
  if (navigator.share) {
    try { await navigator.share({ title: "リピごち", text, url }); return; } catch (error) { if (error?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); showToast("招待リンクをコピーしました。LINEなどで送ってください。"); }
  catch { showToast("リンクを長押ししてコピーしてください。"); }
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
const VIEWER_BLOCKED = ["life-profile", "life-confirm", "life-confirm-one", "life-choose", "life-off", "life-reopen", "life-refresh", "life-add-item", "life-remove-item", "life-shopping-status", "life-quick", "life-review-saved", "edit-recipe", "delete-recipe"];
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
  if (navigator.share) {
    try { await navigator.share({ title: "リピごち", text, url }); return; } catch (error) { if (error?.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); showToast("メッセージをコピーしました。LINEなどで送ってください。"); }
  catch { showToast("コピーできませんでした。"); }
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
  if (!list.length) return "";
  const plan = dailyPlan();
  const where = (q) => {
    const r = requestRecipe(q);
    const day = plan.find((d) => Lifestyle.sameDish(d.slot?.recipe || d.candidate?.recipe, r));
    return day ? `${dayWordFor(day.date) === "今日" ? "今夜" : `${formatDate(day.date)}（${weekdayLabel(day.date)}）`}の献立に入りました` : "今の条件（時間・器具・食材）では献立に入れられません";
  };
  const rows = list.map((q) => {
    const r = requestRecipe(q);
    const mine = q.from === me();
    return `<div class="request-row">${dishTile(r, "request-thumb")}<div><p class="request-from">${mine ? "あなたのリクエスト" : `${escapeHtml(q.from)}から`}</p><strong>${escapeHtml(r.title || q.recipeTitle)}</strong><small>${escapeHtml(where(q))}</small></div>${mine ? `<button type="button" class="text-button" data-action="life-request" data-recipe="${escapeAttr(q.recipeId)}">取り消す</button>` : `<button type="button" class="text-button" data-action="life-request-pass" data-id="${escapeAttr(q.id)}">今回はパス</button>`}</div>`;
  }).join("");
  return `<section class="request-card" aria-label="リクエスト"><h3>💌 リクエスト</h3>${rows}</section>`;
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
    <div class="actions">${dailyButton("life-share-send", "招待リンクを送る", "", true)}${dailyButton("sync-now", "今すぐ同期")}</div>
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
  if (action === "life-request") {
    const recipe = allDinnerRecipes().find((r) => r.id === data.recipe) || recipeById(data.recipe) || Lifestyle.curated.find((r) => r.id === data.recipe);
    if (!recipe) return true;
    if (!requestsEnabled()) { state.view = "settings"; showToast("ふたりでつながると、リクエストを送れます。"); }
    else {
      state.requests = state.requests || {};
      const q = openRequests().find((x) => Lifestyle.sameDish(requestRecipe(x), recipe) && x.from === me());
      if (q) { setRequest(q.id, "cancelled"); showToast("リクエストを取り消しました。"); }
      else {
        const id = generateId("req-");
        state.requests[id] = { id, recipeId: recipe.id, recipeTitle: recipe.title, from: me(), status: "open", createdAt: nowIso(), updatedAt: nowIso() };
        showToast(syncEnabled() ? `「${recipe.title}」をリクエストしました。${partnerName()}の献立に入ります。` : `「${recipe.title}」をリクエストしました。献立に入ります。`);
      }
    }
    saveState(); render(); return true;
  }
  if (action === "life-request-swap") {
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
    document.querySelector("#share")?.scrollIntoView({ block: "start" });
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
    return `<div class="viewer-day">${dishTile(r)}<div><b>${label}</b><strong>${escapeHtml(r.title)}</strong>${sent ? `<small>🙋 ${escapeHtml(requestRecipe(sent).title)}を送ったよ</small>` : ""}</div>${d.slot?.status === "cooked" ? "" : `<button type="button" class="tile-request" data-action="${swapDate === d.date ? "life-close-swap" : "life-swap"}" data-date="${d.date}">${swapDate === d.date ? "閉じる" : "🙋 変えたい"}</button>`}</div>${swapDate === d.date ? renderSwapChoices() : ""}`;
  }).join("");
  return `<section class="viewer-plan-top"><h2>${open ? "買い物の前に、<br /><span class=\"marker nobr\">🙋で送ってね</span>" : "献立、<br /><span class=\"marker nobr\">決まったよ</span>"}</h2></section><section class="viewer-days">${rows}</section>`;
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
