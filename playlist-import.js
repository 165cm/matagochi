/* Bulk import from a public/unlisted YouTube playlist. Lists videos without AI;
   ingredients are refined one dish at a time from the cooking screen. */
let playlistImport = { status: "idle", url: "", result: null, selected: {}, message: "" };
const PLAYLIST_COOKING_HINT = /レシピ|作り方|材料|分量|大さじ|小さじ|\d+\s?g|炒め|煮|焼き|蒸し|丼|パスタ|うどん|そば|カレー|鍋|ごはん|ご飯|料理|おかず|弁当|献立|recipe|cook/i;

function ownedYouTubeIds() {
  return new Set(state.recipes.map((r) => youtubeVideoId(r.videoUrl)).filter(Boolean));
}

function looksLikeCooking(item) {
  return PLAYLIST_COOKING_HINT.test(`${item.title}\n${item.description}`);
}

function playlistRecipe(item, playlist) {
  const parsed = parseIngredients(item.description || "");
  const ingredients = parsed.length === 1 && parsed[0].name === "材料メモ" ? [] : parsed;
  return {
    id: generateId("r"),
    sourceServings: null,
    catalog: null,
    title: item.title || "YouTubeの料理",
    videoUrl: item.url,
    source: "YouTube",
    mealType: "dinner",
    caption: item.description || "",
    ingredients,
    originalIngredients: clone(ingredients),
    steps: parseCookingSteps(item.description || ""),
    tags: [mealLabel("dinner"), "YouTube", "動画"],
    savedAt: today(),
    updatedAt: nowIso(),
    note: "",
    thumbnailUrl: item.thumbnailUrl || "",
    bulkImport: { playlistId: playlist.id, playlistTitle: playlist.title, importedAt: nowIso() },
  };
}

async function fetchPlaylist(url) {
  const response = await fetch(`${API_BASE_URL}/api/import/youtube/playlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "再生リストを読み込めませんでした。");
  return data;
}

function renderPlaylistImport() {
  const p = playlistImport;
  const owned = ownedYouTubeIds();
  const items = p.result?.items || [];
  const selectable = items.filter((i) => !owned.has(i.videoId));
  const count = selectable.filter((i) => p.selected[i.videoId]).length;
  const busy = p.status === "loading";
  const form = `<section class="hero-card"><p class="eyebrow">BULK IMPORT</p><h2>📺 再生リストから、まとめて。</h2><p>料理動画を集めたYouTubeの再生リストを貼ると、まとめてレシピに追加して献立の候補にします。</p>
    ${API_BASE_URL ? `<div class="quick-url-row"><div class="field"><label for="playlist-url">再生リストのURL</label><input id="playlist-url" class="input url-input" inputmode="url" value="${escapeAttr(p.url)}" placeholder="https://youtube.com/playlist?list=..."></div><button class="primary-button fetch-button" type="button" data-action="playlist-load" ${busy ? "disabled" : ""}>${busy ? "読み込み中" : "読み込む"}</button></div>
    ${p.message ? `<p class="notice" role="status">${escapeHtml(p.message)}</p>` : ""}
    <details class="entry-extra"><summary>URLのコピー方法・読み込めないとき</summary><p class="muted small">YouTubeアプリの「ライブラリ」→再生リスト→「︙」→「共有」→「コピー」。公開または限定公開の再生リストが対象です。「後で見る」「高評価」はYouTubeの仕様で読み込めないため、動画を自分の再生リストに移してください。1回200本まで。</p></details>`
    : '<p class="notice">この環境では再生リストの読み込みを利用できません。</p>'}</section>`;
  if (p.status !== "ready") return form;
  const skipped = [owned.size && items.length - selectable.length ? `登録済み${items.length - selectable.length}本` : "", p.result.skipped ? `非公開・削除済み${p.result.skipped}本` : "", p.result.truncated ? `先頭${p.result.maxItems}本まで` : ""].filter(Boolean).join(" · ");
  return `${form}<section class="panel playlist-panel"><div class="section-head"><div><h3>${escapeHtml(p.result.playlist.title || "再生リスト")}</h3><p class="muted small">${items.length}本${skipped ? ` · ${escapeHtml(skipped)}` : ""}</p></div></div>
    <p class="muted small">料理以外に見える動画はチェックを外しています。材料は説明文から自動で拾うため未確認です。作る日に「作り方」から整えられます。</p>
    <div class="actions">${dailyButton("playlist-select", "すべて選ぶ", 'data-all="true"')}${dailyButton("playlist-select", "選択を外す", 'data-all="false"')}</div>
    <ul class="playlist-items">${items.map((item) => {
      const dup = owned.has(item.videoId);
      return `<li><label class="playlist-item ${dup ? "is-owned" : ""}"><input type="checkbox" data-playlist-video="${escapeAttr(item.videoId)}" ${dup ? "disabled" : p.selected[item.videoId] ? "checked" : ""}>${item.thumbnailUrl ? `<img src="${escapeAttr(item.thumbnailUrl)}" alt="" loading="lazy">` : '<span class="playlist-thumb-empty" aria-hidden="true">🍳</span>'}<span><strong>${escapeHtml(item.title)}</strong><small>${dup ? "登録済み" : escapeHtml(item.channelTitle)}${!dup && !looksLikeCooking(item) ? " · 料理以外かも" : ""}</small></span></label></li>`;
    }).join("") || '<li class="muted">追加できる動画がありません。</li>'}</ul>
    <div class="playlist-footer">${dailyButton("playlist-add", count ? `${count}品をレシピに追加して献立へ` : "追加する動画を選んでください", count ? "" : "disabled", true)}</div></section>`;
}

function bindPlaylistEvents() {
  document.querySelectorAll("[data-playlist-video]").forEach((box) =>
    box.addEventListener("change", () => {
      playlistImport.selected[box.dataset.playlistVideo] = box.checked;
      const button = document.querySelector('[data-action="playlist-add"]');
      const count = Object.entries(playlistImport.selected).filter(([id, on]) => on && !ownedYouTubeIds().has(id)).length;
      if (button) {
        button.disabled = !count;
        button.textContent = count ? `${count}品をレシピに追加して献立へ` : "追加する動画を選んでください";
      }
    }),
  );
  document.querySelector("#playlist-url")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.querySelector('[data-action="playlist-load"]')?.click();
  });
}

function handlePlaylistAction(action, data) {
  if (!action.startsWith("playlist-")) return false;
  if (action === "playlist-load") loadPlaylist(document.querySelector("#playlist-url")?.value.trim() || "");
  if (action === "playlist-select") {
    const owned = ownedYouTubeIds();
    (playlistImport.result?.items || []).forEach((i) => {
      if (!owned.has(i.videoId)) playlistImport.selected[i.videoId] = data.all === "true";
    });
    render();
  }
  if (action === "playlist-add") addPlaylistRecipes();
  return true;
}

async function loadPlaylist(url) {
  if (playlistImport.status === "loading") return;
  playlistImport = { status: "loading", url, result: null, selected: {}, message: "" };
  render();
  try {
    const result = await fetchPlaylist(url);
    if (playlistImport.url !== url) return;
    const owned = ownedYouTubeIds();
    playlistImport = {
      status: "ready",
      url,
      result,
      selected: Object.fromEntries(result.items.map((i) => [i.videoId, !owned.has(i.videoId) && looksLikeCooking(i)])),
      message: "",
    };
    trackDaily("playlist_loaded", { items: result.items.length });
  } catch (error) {
    playlistImport = { status: "error", url, result: null, selected: {}, message: error.message || "再生リストを読み込めませんでした。" };
  }
  render();
}

function addPlaylistRecipes() {
  const result = playlistImport.result;
  if (!result) return;
  const owned = ownedYouTubeIds();
  const recipes = result.items
    .filter((i) => playlistImport.selected[i.videoId] && !owned.has(i.videoId))
    .map((i) => playlistRecipe(i, result.playlist));
  if (!recipes.length) return;
  state.recipes.unshift(...recipes);
  trackDaily("playlist_imported", { recipes: recipes.length });
  playlistImport = { status: "idle", url: "", result: null, selected: {}, message: "" };
  state.view = "plan";
  saveState();
  showToast(`${recipes.length}品を追加しました。献立の候補に入れています。`);
  render();
  globalThis.scrollTo?.({ top: 0, behavior: "instant" });
}
