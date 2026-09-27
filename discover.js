/* おすすめの料理：🔥今週の人気（YouTube・28日で入れ替わり）と、👨‍👩‍👧みんなの定番（アプリ内の集計）。
   好みの順（オンボーディングで選んだ料理・好きな料理に似ている順）に並べる。 */
const DISCOVER_KEY = "ripigochi-discover";
let discover = (() => { try { return JSON.parse(localStorage.getItem(DISCOVER_KEY) || "null") || { trends: [], popular: [], savedAt: "" }; } catch { return { trends: [], popular: [], savedAt: "" }; } })();
let discoverLoading = false;
const liveItem = (x) => !x.expiresAt || Date.parse(x.expiresAt) > Date.now();
function saveDiscover() { try { localStorage.setItem(DISCOVER_KEY, JSON.stringify(discover)); } catch {} }
// 期限（取得から28日）を過ぎた人気レシピは、端末からも消す。
function pruneDiscover() {
  const before = discover.trends.length;
  discover.trends = (discover.trends || []).filter(liveItem);
  if (discover.trends.length !== before) saveDiscover();
}
function tasteSegment() {
  let code = "any";
  try { const r = DinnerPersona.result(dailyProfile().dinnerPriorities || {}); if (/^[LR]{3}$/.test(r?.code || "")) code = r.code; } catch {}
  return `${code}-${Math.max(0, Math.min(5, Number(state.skillProfile?.level) || 0))}`;
}
async function loadDiscover({ force = false } = {}) {
  if (!API_BASE_URL || discoverLoading) return;
  pruneDiscover();
  // 取り直しは1時間ごと。まだ1品もない時は覚えずに、次に開いた時また取りに行く。
  if (!force && discover.savedAt && discover.trends.length && Date.now() - Date.parse(discover.savedAt) < 3_600_000) return;
  discoverLoading = true;
  try {
    const [t, p] = await Promise.all([
      fetchWithTimeout(`${API_BASE_URL}/api/trends`, {}, 15_000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchWithTimeout(`${API_BASE_URL}/api/popular?segment=${encodeURIComponent(tasteSegment())}`, {}, 15_000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (t?.items) discover.trends = t.items.filter(liveItem).slice(0, 40);
    if (p?.items) discover.popular = p.items.slice(0, 20);
    if (t || p) { discover.savedAt = discover.trends.length ? new Date().toISOString() : ""; saveDiscover(); }
  } finally { discoverLoading = false; }
  if (["collection", "plan"].includes(state.view) || FUNNEL[state.onboardingDraft?.quickSetupIndex] === "picks") render();
}
// サーバーの読み取り結果を、アプリのレシピの形に。読み取り専用の「おすすめ」として扱う（保存すると自分のレシピになる）。
function discoverRecipe(item, kind) {
  const ingredients = normalizeImportedIngredients(item.ingredients || []);
  const steps = (item.steps || []).map((s) => String(s || "").trim()).filter(Boolean);
  const recipe = { id: `${kind}-${item.videoId}`, title: item.title, ingredients, steps, stepTimes: stepTimesFor(steps, item.stepTimes), videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl, author: item.channelTitle || "", channelId: item.channelId || "", sourceServings: item.sourceServings ?? null, mealType: "dinner", tags: item.tags || [], curated: true, discover: { kind, week: item.week || "", expiresAt: item.expiresAt || "" } };
  recipe.planning = aiPlanning(item.planning, { ingredients, steps }) || Lifestyle.suggestPlanning({ ingredients, steps });
  return recipe;
}
const discoverCache = { key: "", list: [] };
// おすすめの全体：今週の人気 → みんなの定番 → 最初から入っている定番。保存済み・非表示・同じ動画は除く。
function discoverRecipes() {
  pruneDiscover();
  const key = `${discover.savedAt}|${discover.trends.length}|${discover.popular.length}|${state.settingsUpdatedAt || ""}`;
  if (discoverCache.key !== key) {
    const seen = new Set();
    const out = [];
    for (const [items, kind] of [[discover.trends, "trend"], [discover.popular || [], "pop"]]) for (const item of items) {
      if (!item?.videoId || seen.has(item.videoId)) continue;
      seen.add(item.videoId);
      out.push(discoverRecipe(item, kind));
    }
    discoverCache.key = key; discoverCache.list = out;
  }
  const savedVideos = new Set(state.recipes.map((r) => youtubeVideoId(r.videoUrl)).filter(Boolean));
  const saved = new Set(state.recipes.map((r) => r.starterId).filter(Boolean));
  const hidden = starterHidden();
  return discoverCache.list.filter((r) => !saved.has(r.id) && !hidden.has(r.id) && !savedVideos.has(youtubeVideoId(r.videoUrl)));
}
// 一覧に出すかは「避けたい食材を含むか」だけで決める（時間・器具などは、献立に入れる時に確かめる）。
const discoverSafe = (r, profile = dailyProfile()) => Lifestyle.fit(r, profile, today()).reason !== "避けたい食材を含みます";
const findDiscover = (id) => discoverCache.list.find((r) => r.id === id) || null;
// 好みの近さ：選んだ料理・好きな料理と、主食・メインの素材・味の方向が近いほど上に。
function tasteSeeds() {
  const loved = state.recipes.filter((r) => Object.values({ ...likedCycles(r), ...recipeRatings(r) }).some((c) => c === "weekly" || c === "tomorrow"));
  return [...(state.tasteSeeds || []), ...loved.slice(0, 20).map((r) => Lifestyle.traits(r))];
}
function tasteScore(recipe, seeds = tasteSeeds()) {
  const t = Lifestyle.traits(recipe);
  let score = 0;
  for (const s of seeds) score += (s.staple === t.staple ? 1 : 0) + (s.protein === t.protein ? 2 : 0) + (s.cuisine === t.cuisine ? 1 : 0);
  return score;
}
function rankByTaste(list) {
  const seeds = tasteSeeds();
  const kindBonus = { trend: 2, pop: 3 };
  return list.map((r, i) => ({ r, s: tasteScore(r, seeds) + (kindBonus[r.discover?.kind] || 0), i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.r);
}
function discoverLabel(recipe) {
  return recipe.discover?.kind === "trend" ? "🔥 今週の人気" : recipe.discover?.kind === "pop" ? "👨‍👩‍👧 みんなの定番" : "定番";
}
// みんなの定番づくり：献立に入れた・作ったYouTubeレシピを、名前を伏せて送る（設定で止められる）。
const shareStatsOn = () => { try { return localStorage.getItem("ripigochi-share-stats") !== "off"; } catch { return true; } };
function sharePopular(recipe, kind) {
  const videoId = youtubeVideoId(recipe?.videoUrl);
  if (!API_BASE_URL || !videoId || !shareStatsOn() || isViewer()) return;
  globalThis.fetch?.(`${API_BASE_URL}/api/popular/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId, segment: tasteSegment(), kind }) })?.catch(() => {});
}
// オンボーディング：気になる料理を選ぶ（今週の人気が中心。足りなければ写真のある定番で埋める）。
function funnelPickCandidates() {
  const profile = Lifestyle.profile(profileDraft());
  const curated = Lifestyle.curated.filter((r) => STARTER_PHOTOS[r.id]);
  return [...discoverRecipes().filter((r) => discoverSafe(r, profile)), ...curated.filter((r) => Lifestyle.fit(r, profile, today()).ok)].slice(0, 12);
}
function renderFunnelPicks() {
  const picks = new Set(profileDraft().picks || []);
  const list = funnelPickCandidates();
  const tiles = list.map((r) => `<button type="button" class="pick-tile" data-action="life-funnel-dish" data-recipe="${escapeAttr(r.id)}" aria-pressed="${picks.has(r.id)}">${dishTile(r)}<span class="pick-title">${escapeHtml(r.title)}</span>${r.discover ? `<small>${discoverLabel(r)}${r.author ? ` · ${escapeHtml(shortCreatorName(r.author))}` : ""}</small>` : "<small>定番</small>"}<i class="pick-check" aria-hidden="true"></i></button>`).join("");
  return [`😋 気になる料理を選んで`, `<p class="small">選んだ料理は保存して、最初の献立に入れます。似た料理も上に出します。</p><div class="pick-grid">${tiles || '<p class="muted small">読み込んでいます…</p>'}</div>`];
}
function finishFunnelPicks() {
  const ids = profileDraft().picks || [];
  const chosen = ids.map((id) => findDiscover(id) || Lifestyle.curated.find((r) => r.id === id)).filter(Boolean);
  state.tasteSeeds = chosen.map((r) => Lifestyle.traits(r)).slice(0, 12);
  chosen.forEach((r) => saveOwnRecipe(r));
}

/* ---- 投稿者へのリスペクト：公式プレーヤーで見ながら作る・出典を主役に・チャンネル登録へ ---- */
// 手順ごとの動画の時刻は、手順の数と合う時だけ使う。
function stepTimesFor(steps, times) {
  return Array.isArray(times) && Array.isArray(steps) && times.length === steps.length && times.some((t) => Number.isFinite(t)) ? times.map((t) => (Number.isFinite(t) ? t : null)) : [];
}
let videoStartAt = { key: "", seconds: 0 };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function stepTimeButton(recipe, index) {
  const t = recipe?.stepTimes?.[index];
  if (!Number.isFinite(t) || !youtubeVideoId(recipe.videoUrl)) return "";
  return ` <button type="button" class="step-time" data-action="life-video-at" data-recipe="${escapeAttr(recipe.id)}" data-seconds="${t}" aria-label="この手順を動画の${mmss(t)}から見る">▶ ${mmss(t)}</button>`;
}
function creatorLink(recipe) {
  if (recipe.channelId) return `https://www.youtube.com/channel/${encodeURIComponent(recipe.channelId)}?sub_confirmation=1`;
  const tiktok = String(recipe.videoUrl || "").match(/tiktok\.com\/(@[\w.]+)/i);
  if (tiktok) return `https://www.tiktok.com/${tiktok[1]}`;
  return recipe.videoUrl || "";
}
function renderCreatorCredit(recipe) {
  if (!recipe?.videoUrl) return "";
  const id = youtubeVideoId(recipe.videoUrl);
  const start = videoStartAt.key === recipe.id ? videoStartAt.seconds : 0;
  // 公式の埋め込みプレーヤー（再生は投稿者の再生回数・広告収益になる）。
  const shorts = /youtube\.com\/shorts\//i.test(recipe.videoUrl);
  const player = id ? `<div class="video-frame${shorts ? " is-shorts" : ""}"><iframe src="https://www.youtube.com/embed/${id}?playsinline=1&rel=0${start ? `&start=${start}&autoplay=1` : ""}" title="${escapeAttr(recipe.title)}の動画" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` : "";
  const name = recipe.author || (id ? "YouTubeの投稿者" : "投稿者");
  const link = creatorLink(recipe);
  const isYouTube = !!id;
  return `<section class="creator-credit" aria-label="レシピの出典">${player}<div class="credit-row"><p class="credit-name"><small>レシピ・動画</small><b>${escapeHtml(name)}</b></p>${link ? `<a class="subscribe-button" href="${escapeAttr(link)}" target="_blank" rel="noopener">${isYouTube && recipe.channelId ? "チャンネル登録" : "投稿者を見る"}</a>` : ""}</div><p class="credit-note small">${isYouTube ? "コツや火加減は動画で。手順の「▶」から、その場面を再生できます。" : "元の動画で、コツや火加減も確かめてください。"} <a href="creators.html" target="_blank" rel="noopener">投稿者の方へ</a></p></section>`;
}

/* ---- 作った人の声を投稿者に届ける（つくれぽ型）：コメントで伝える・作ってみたをシェア ---- */
const hashtagOf = (name) => String(name || "").replace(/[\s【】\[\]（）()・|｜:：!！?？#＃"'「」]/g, "").slice(0, 30);
function renderCreatorThanks(recipe, evaluation) {
  if (!recipe?.videoUrl || !evaluation) return "";
  const name = recipe.author || "投稿者";
  return `<div class="creator-thanks"><p class="small">🙏 <b>${escapeHtml(name)}</b>さんのレシピでした</p><div class="thanks-actions"><a class="secondary-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noopener">💬 「作ったよ」を伝える</a><button type="button" class="secondary-button" data-action="life-share-cooked" data-id="${escapeAttr(evaluation.id)}">📣 作ってみたをシェア</button></div><p class="muted small">動画のコメントは、投稿者のいちばんの励みになります。</p></div>`;
}
// 写真があれば、写真に料理名と出典を入れた画像にして共有（端末の中だけで作る）。なければ文章とリンクだけ。
async function cookedCard(photo, title, credit) {
  const img = new Image();
  img.src = photo;
  await img.decode();
  const w = 1080, h = 1350, canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const g = canvas.getContext("2d");
  const scale = Math.max(w / img.width, h / img.height);
  g.drawImage(img, (w - img.width * scale) / 2, (h - img.height * scale) / 2, img.width * scale, img.height * scale);
  const grad = g.createLinearGradient(0, h * 0.6, 0, h);
  grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,0,0,.7)");
  g.fillStyle = grad; g.fillRect(0, h * 0.6, w, h * 0.4);
  g.fillStyle = "#fff";
  g.font = "bold 64px sans-serif"; g.fillText(title.slice(0, 16), 60, h - 170);
  g.font = "bold 40px sans-serif"; g.fillText(`レシピ：${credit}`.slice(0, 26), 60, h - 100);
  g.font = "32px sans-serif"; g.fillText("作ってみた！ #リピごち", 60, h - 48);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.88));
  return new File([blob], "ripigochi.jpg", { type: "image/jpeg" });
}
async function shareCooked(evaluationId) {
  const e = state.evaluations.find((x) => x.id === evaluationId);
  const recipe = e && (recipeById(e.recipeId) || findDiscover(e.recipeId));
  if (!recipe?.videoUrl) return;
  const credit = recipe.author || "投稿者";
  const text = `${credit}さんの「${recipe.title}」を作ってみました！\n#${hashtagOf(credit)} #リピごち`;
  try {
    const files = isDataPhoto(e.photo) ? [await cookedCard(e.photo, recipe.title, credit)] : [];
    const data = files.length && navigator.canShare?.({ files }) ? { files, text: `${text}\n${recipe.videoUrl}` } : { text, url: recipe.videoUrl };
    if (navigator.share) { await navigator.share(data); return; }
  } catch (error) { if (error?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(`${text}\n${recipe.videoUrl}`); showToast("シェアする文章をコピーしました。SNSに貼ってください。"); }
  catch { showToast("この端末ではシェアできませんでした。"); }
}
