/* 定番フォルダ：料理名（親）の中に、いろいろな人の作り方（子）を入れて、食べ比べる。
   - 子の呼び名は「▶ リュウジ流」のように短く（アイコン＋投稿者の呼び名＋流）
   - 献立には1つのフォルダを週に1回まで。まだ作っていない作り方と、ランキング1位を交互に出す
   - 作ったあと「ランキングの何位？」を聞く。5位までに入れると、5位だった作り方は圏外へ
   - 曜日のピン留め：「毎週火曜は明太子パスタ」
   - ほかの作り方を探す：YouTubeで同じ料理を探して、取り込むとこのフォルダに入る */
const RANK_MAX = 5;
const MEDALS = ["🥇", "🥈", "🥉", "4位", "5位"];
const WEEKDAYS = "日月火水木金土";
let folderOpen = "", rankPromptId = "", pendingFolder = "";
let folderSearch = { key: "", status: "idle", items: [], message: "" };
// 名前をそろえて比べる（たらこ＝明太子、スパゲッティ＝パスタ）。
function folderNorm(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/たらこ|タラコ/g, "明太子").replace(/スパゲッティ|スパゲティ/g, "パスタ").replace(/[\s・]/g, "");
}
// 動画のタイトルから料理名だけを取り出す。例：「【悪魔の】レンジで明太子パスタ｜リュウジ」→「明太子パスタ」
function dishNameOf(title) {
  let t = String(title || "").normalize("NFKC").replace(/[【\[「『(（<＜][^】\]」』)）>＞]*[】\]」』)）>＞]/g, " ").replace(/[#＃]\S+/g, " ").replace(/[!！?？♪☆★✨🔥]+/g, " ");
  t = t.split(/[|｜/／]/)[0];
  t = t.replace(/^(\s*(簡単|かんたん|絶品|究極の?|至高の?|最強の?|悪魔の?|本格|本気の?|無限|神|激うま|爆速|時短|レンジで|フライパン(ひとつ|1つ)で|\d+分で|たった\d+分で?|プロが教える|超|やみつき)\s*)+/, "");
  t = t.replace(/(の作り方|の?レシピ|を作る|作り方)\s*$/, "").trim();
  const best = t.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] || String(title || "").trim();
  return [...best].slice(0, 16).join("");
}
function normalizeFolders(raw) {
  const out = {};
  for (const [key, f] of Object.entries(raw && typeof raw === "object" ? raw : {})) {
    if (!/^f[\w-]{2,40}$/.test(key) || !f || typeof f !== "object") continue;
    const name = String(f.name || "").trim().slice(0, 20);
    if (!name) continue;
    out[key] = { key, name, ranking: [...new Set((Array.isArray(f.ranking) ? f.ranking : []).filter((x) => typeof x === "string" && x.length < 80))].slice(0, RANK_MAX),
      pinDay: /^[0-6]$/.test(String(f.pinDay ?? "")) ? String(f.pinDay) : "", ...(f.deleted ? { deleted: true } : {}), updatedAt: normalizeTimestamp(f.updatedAt) };
  }
  return out;
}
const folderList = () => Object.values(state.folders || {}).filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name, "ja"));
function folderOfRecipe(r) {
  const key = r?.folder || (r?.id && recipeById(r.id)?.folder);
  const f = key && state.folders?.[key];
  return f && !f.deleted ? f : null;
}
function folderMembers(key) {
  return state.recipes.filter((r) => r.folder === key);
}
const cookCount = (r) => state.evaluations.filter((e) => e.recipeId === r.id).length;
function folderRanking(f) {
  const members = new Map(folderMembers(f.key).map((r) => [r.id, r]));
  return (f.ranking || []).map((id) => members.get(id)).filter(Boolean);
}
// 献立に出す作り方：まだ作っていないもの（古い順）と、ランキング1位を交互に。
function folderPick(f) {
  const members = folderMembers(f.key).filter((r) => r.mealType === "dinner");
  if (!members.length) return null;
  const untried = members.filter((r) => !cookCount(r)).sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
  const top = folderRanking(f)[0] || members.slice().sort((a, b) => cookCount(b) - cookCount(a))[0];
  const cooks = members.reduce((n, r) => n + cookCount(r), 0);
  return untried.length && (cooks % 2 === 0 || !folderRanking(f).length) ? untried[0] : top;
}
// 子の呼び名：「▶ リュウジ流」「🍳 リピごち流」「✎ わが家流」
function childLabel(r) {
  if (r.curated || r.starterId) return `<span class="src-mark" aria-hidden="true">🍳</span>リピごち流`;
  const name = authorOf(r) ? creatorName(r) : "";
  return name ? `${creatorLabel(name, sourceOf(r))}流` : `<span class="src-mark" aria-hidden="true">✎</span>わが家流`;
}
const childText = (r) => childLabel(r).replace(/<[^>]+>/g, "");
function suggestFolder(title) {
  const n = folderNorm(title);
  return folderList().find((f) => n.includes(folderNorm(f.name))) || null;
}
// 献立に渡すレシピ：フォルダごとに1つの作り方だけ（日付を指定した作り方は残す）。
function planRecipes(list = allDinnerRecipes()) {
  const keep = new Set(Object.values(state.planOverrides || {}));
  const pick = new Map(folderList().map((f) => [f.key, folderPick(f)?.id]));
  return list.filter((r) => !r.folder || !pick.has(r.folder) || pick.get(r.folder) === r.id || keep.has(r.id));
}
function folderPins() {
  return Object.fromEntries(folderList().filter((f) => f.pinDay).map((f) => [f.pinDay, folderPick(f)?.id]).filter(([, id]) => id));
}
// ランキングのN位に入れる（1〜5）。5位からはみ出した作り方を返す。
function rankInsert(f, recipeId, pos) {
  const list = (f.ranking || []).filter((id) => id !== recipeId);
  if (pos !== "out") list.splice(Math.max(0, Math.min(list.length, Number(pos) - 1)), 0, recipeId);
  const dropped = list.slice(RANK_MAX);
  state.folders[f.key] = { ...f, ranking: list.slice(0, RANK_MAX), updatedAt: nowIso() };
  return dropped.map((id) => recipeById(id)).filter(Boolean);
}
function recipeTitleHtml(recipe) {
  const f = folderOfRecipe(recipe);
  return f ? `${escapeHtml(f.name)}<span class="child-name">${childLabel(recipe)}</span>` : escapeHtml(recipe.title);
}
// ── 画面 ──
function renderRankPrompt() {
  const r = rankPromptId && recipeById(rankPromptId);
  const f = r && folderOfRecipe(r);
  if (!f || isViewer()) return "";
  const others = folderRanking(f).filter((x) => x.id !== r.id);
  const now = (f.ranking || []).indexOf(r.id);
  const slots = Math.min(RANK_MAX, others.length + 1);
  return `<section class="panel rank-prompt"><p class="rp-head">🏆 <b>${escapeHtml(f.name)}</b> ランキング</p>
    <p class="small">今回の<b>${childLabel(r)}</b>は何位？${now >= 0 ? `（いま${now + 1}位）` : ""}</p>
    ${others.length ? `<ol class="rp-list">${others.map((x) => `<li>${childLabel(x)}</li>`).join("")}</ol>` : ""}
    <div class="rp-buttons">${Array.from({ length: slots }, (_, i) => `<button type="button" class="${i === 0 ? "primary-button" : "secondary-button"}" data-action="life-rank" data-folder="${f.key}" data-recipe="${escapeAttr(r.id)}" data-pos="${i + 1}">${i + 1}位</button>`).join("")}<button type="button" class="secondary-button" data-action="life-rank" data-folder="${f.key}" data-recipe="${escapeAttr(r.id)}" data-pos="out">圏外</button></div>
    ${others.length >= RANK_MAX ? '<p class="muted small">5位までに入れると、いまの5位は圏外になります。</p>' : ""}
    <button type="button" class="text-button" data-action="life-rank-close">あとで</button></section>`;
}
function renderFolderRow(r, f, i = -1) {
  const rankOf = (f.ranking || []).indexOf(r.id);
  const move = rankOf >= 0 ? `<span class="fr-moves">${rankOf > 0 ? `<button type="button" class="plan-icon" data-action="life-rank" data-folder="${f.key}" data-recipe="${escapeAttr(r.id)}" data-pos="${rankOf}" aria-label="順位を上げる">↑</button>` : ""}${rankOf < (f.ranking.length - 1) ? `<button type="button" class="plan-icon" data-action="life-rank" data-folder="${f.key}" data-recipe="${escapeAttr(r.id)}" data-pos="${rankOf + 2}" aria-label="順位を下げる">↓</button>` : ""}</span>` : "";
  const n = cookCount(r);
  return `<li class="folder-row"><span class="fr-rank">${i >= 0 ? MEDALS[i] : ""}</span><button type="button" class="fr-main" data-action="life-recipe-open" data-recipe="${escapeAttr(r.id)}">${dishTile(r, "fr-thumb")}<span><b>${childLabel(r)}</b><small>${n ? `${n}回作った` : "まだ作っていない"}${r.planning?.minutes ? ` · ⏱${r.planning.minutes}分` : ""}</small></span></button>${move}</li>`;
}
function renderFolderDetail(f) {
  const members = folderMembers(f.key);
  const ranked = folderRanking(f);
  const untried = members.filter((r) => !cookCount(r) && !ranked.includes(r));
  const out = members.filter((r) => cookCount(r) && !ranked.includes(r));
  const s = folderSearch.key === f.key ? folderSearch : { status: "idle", items: [] };
  const known = new Set(members.map((r) => youtubeVideoId(r.videoUrl)).filter(Boolean));
  const results = s.items.filter((x) => !known.has(x.videoId));
  return `<section class="folder-detail"><button type="button" class="text-button cooking-back" data-action="life-folder-close">‹ 定番フォルダ</button>
    <h2 class="folder-title">📁 ${escapeHtml(f.name)}</h2>
    <div class="folder-pin"><label>📌 毎週 <select class="input" data-folder-pin="${f.key}"><option value="">決めない</option>${[1, 2, 3, 4, 5, 6, 0].map((d) => `<option value="${d}" ${f.pinDay === String(d) ? "selected" : ""}>${WEEKDAYS[d]}曜</option>`).join("")}</select> は、この料理</label></div>
    <h3 class="detail-h">🏆 ランキング <small>${ranked.length}/${RANK_MAX}</small></h3>
    ${ranked.length ? `<ol class="folder-rows">${ranked.map((r, i) => renderFolderRow(r, f, i)).join("")}</ol>` : '<p class="muted small">作ったあとに、何位か選ぶとここに並びます。</p>'}
    ${untried.length ? `<h3 class="detail-h">🆕 まだ作っていない <small>${untried.length}</small></h3><ul class="folder-rows">${untried.map((r) => renderFolderRow(r, f)).join("")}</ul>` : ""}
    ${out.length ? `<h3 class="detail-h">圏外 <small>${out.length}</small></h3><ul class="folder-rows is-out">${out.map((r) => renderFolderRow(r, f)).join("")}</ul>` : ""}
    <div class="folder-search">${s.status === "loading" ? '<p class="muted small" role="status">🔍 探しています…</p>' : dailyButton("life-folder-search", `🔍 ほかの「${escapeHtml(f.name)}」の作り方を探す`, `data-folder="${f.key}"`, !results.length)}
      ${s.status === "error" ? `<p class="form-error">${escapeHtml(s.message)}</p>` : ""}
      ${results.length ? `<ul class="search-results">${results.map((x) => `<li><img src="https://i.ytimg.com/vi/${escapeAttr(x.videoId)}/mqdefault.jpg" alt="" loading="lazy"><span><b>${escapeHtml(x.title)}</b><small>${escapeHtml(x.channelTitle || "")}</small></span><button type="button" class="secondary-button" data-action="life-folder-import" data-folder="${f.key}" data-video="${escapeAttr(x.videoId)}">取り込む</button></li>`).join("")}</ul><p class="muted small">取り込むと、材料・作り方を読み取ってこのフォルダに入ります。</p>` : ""}</div>
    <details class="folder-edit"><summary>フォルダの名前・削除</summary><div class="folder-edit-row"><input id="folder-name" class="input" maxlength="20" value="${escapeAttr(f.name)}" aria-label="フォルダの名前"><button type="button" class="secondary-button" data-action="life-folder-rename" data-folder="${f.key}">変更</button></div><button type="button" class="text-button danger" data-action="life-folder-delete" data-folder="${f.key}">フォルダを削除（レシピは残ります）</button></details></section>`;
}
function renderFolders() {
  const f = folderOpen && state.folders?.[folderOpen];
  if (f && !f.deleted) return renderFolderDetail(f);
  const list = folderList();
  if (!list.length) return `<section class="folder-empty panel"><p><b>📁 定番フォルダ</b></p><p class="small">同じ料理のいろいろな作り方をまとめて、食べ比べできます。レシピの画面の「📁 定番フォルダに入れる」から作れます。</p></section>`;
  return `<ul class="folder-list">${list.map((x) => {
    const top = folderRanking(x)[0] || folderMembers(x.key)[0];
    return `<li><button type="button" class="folder-card" data-action="life-folder-open" data-folder="${x.key}">${top ? dishTile(top, "fc-thumb") : ""}<span><b>${escapeHtml(x.name)}</b><small>${folderMembers(x.key).length}の作り方${top && folderRanking(x)[0] ? ` · 🥇${escapeHtml(childText(top))}` : ""}</small></span>${x.pinDay ? `<em class="fc-pin">📌${WEEKDAYS[Number(x.pinDay)]}</em>` : ""}</button></li>`;
  }).join("")}</ul>`;
}
// レシピの画面：フォルダに入れる／見る
function renderFolderLine(r) {
  if (isViewer() || r.mealType === "breakfast" || r.mealType === "lunch") return "";
  const f = folderOfRecipe(r);
  if (f) return `<div class="folder-line">📁 <button type="button" class="link-inline" data-action="life-folder-open" data-folder="${f.key}">${escapeHtml(f.name)}</button> の ${childLabel(r)}<button type="button" class="text-button" data-action="life-folder-leave" data-recipe="${escapeAttr(r.id)}">外す</button></div>`;
  const hit = suggestFolder(r.title);
  const others = folderList().filter((x) => x !== hit);
  return `<div class="folder-line">${hit ? dailyButton("life-folder-add", `📁「${escapeHtml(hit.name)}」に入れる`, `data-recipe="${escapeAttr(r.id)}" data-folder="${hit.key}"`) : dailyButton("life-folder-add", `📁 定番フォルダを作る（${escapeHtml(dishNameOf(r.title))}）`, `data-recipe="${escapeAttr(r.id)}" data-folder="new"`)}
    ${others.length || hit ? `<details class="folder-other"><summary>ほかのフォルダ</summary><div>${others.map((x) => `<button type="button" class="text-button" data-action="life-folder-add" data-recipe="${escapeAttr(r.id)}" data-folder="${x.key}">${escapeHtml(x.name)}</button>`).join("")}${hit ? `<button type="button" class="text-button" data-action="life-folder-add" data-recipe="${escapeAttr(r.id)}" data-folder="new">＋ 新しいフォルダ（${escapeHtml(dishNameOf(r.title))}）</button>` : ""}</div></details>` : ""}</div>`;
}
async function searchFolderVariants(f) {
  if (!API_BASE_URL) return;
  folderSearch = { key: f.key, status: "loading", items: [], message: "" };
  render();
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/search/variants`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ q: f.name }) }, 20_000);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || "探せませんでした。");
    folderSearch = { key: f.key, status: "done", items: Array.isArray(data.items) ? data.items : [], message: "" };
    if (!folderSearch.items.length) folderSearch = { ...folderSearch, status: "error", message: "見つかりませんでした。" };
  } catch (error) {
    folderSearch = { key: f.key, status: "error", items: [], message: error.message || "探せませんでした。" };
  }
  render();
}
function handleFolderAction(action, data) {
  if (!action.startsWith("life-folder") && !action.startsWith("life-rank")) return false;
  if (isViewer()) return true;
  const f = data.folder && state.folders?.[data.folder];
  if (action === "life-folder-open") { recipeTab = "folders"; folderOpen = data.folder || ""; state.view = "collection"; swapDate = ""; if (data.search === "true" && f) { render(); searchFolderVariants(f); return true; } }
  else if (action === "life-folder-close") folderOpen = "";
  else if (action === "life-rank-close") rankPromptId = "";
  else if (action === "life-folder-add") {
    const base = recipeById(data.recipe) || Lifestyle.curated.find((x) => x.id === data.recipe) || findDiscover(data.recipe);
    if (!base) return true;
    const own = saveOwnRecipe(base);
    let key = data.folder;
    if (key === "new" || !state.folders?.[key]) {
      key = generateId("f");
      state.folders = { ...(state.folders || {}), [key]: { key, name: dishNameOf(own.title), ranking: [], pinDay: "", updatedAt: nowIso() } };
    }
    own.folder = key;
    own.updatedAt = nowIso();
    if (state.view === "recipe") recipeDetailId = own.id;
    showToast(`「${state.folders[key].name}」に入れました。`);
  } else if (action === "life-folder-leave") {
    const r = recipeById(data.recipe);
    const from = r && folderOfRecipe(r);
    if (r) { delete r.folder; r.updatedAt = nowIso(); }
    if (from) state.folders[from.key] = { ...from, ranking: from.ranking.filter((id) => id !== r.id), updatedAt: nowIso() };
  } else if (action === "life-rank" && f) {
    const dropped = rankInsert(f, data.recipe, data.pos);
    if (rankPromptId === data.recipe) rankPromptId = "";
    const r = recipeById(data.recipe);
    showToast(data.pos === "out" ? `${childText(r)}は圏外にしました。` : `${childText(r)}を${data.pos}位に。${dropped.length ? `${childText(dropped[0])}は圏外になりました。` : ""}`);
  } else if (action === "life-folder-rename" && f) {
    const name = (globalThis.document?.querySelector?.("#folder-name")?.value ?? data.name ?? "").trim().slice(0, 20);
    if (name) state.folders[f.key] = { ...f, name, updatedAt: nowIso() };
  } else if (action === "life-folder-delete" && f) {
    state.folders[f.key] = { ...f, deleted: true, pinDay: "", updatedAt: nowIso() };
    folderMembers(f.key).forEach((r) => { delete r.folder; r.updatedAt = nowIso(); });
    folderOpen = "";
  } else if (action === "life-folder-search" && f) { searchFolderVariants(f); return true; }
  else if (action === "life-folder-import" && f && /^[\w-]{11}$/.test(data.video || "")) {
    pendingFolder = f.key;
    startRecipeFromText(`https://www.youtube.com/watch?v=${data.video}`);
    saveState();
    render();
    globalThis.scrollTo?.({ top: 0 });
    setTimeout(() => globalThis.document?.querySelector?.('[data-action="fetch-caption"]:not([disabled])')?.click(), 60);
    return true;
  }
  saveState();
  render();
  return true;
}
// 曜日のピン留め（select）。同じ曜日は1つのフォルダだけ。
function setFolderPin(key, day) {
  const f = state.folders?.[key];
  if (!f) return;
  for (const x of folderList()) if (x.key !== key && day && x.pinDay === day) state.folders[x.key] = { ...x, pinDay: "", updatedAt: nowIso() };
  state.folders[key] = { ...f, pinDay: /^[0-6]$/.test(day) ? day : "", updatedAt: nowIso() };
}
