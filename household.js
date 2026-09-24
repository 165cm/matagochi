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
  const q = openRequests().find((x) => Lifestyle.sameDish(requestRecipe(x), recipe));
  return q ? { id: q.id, from: q.from } : null;
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
  const list = openRequests();
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
