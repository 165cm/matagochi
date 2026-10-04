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
let discoverTriedAt = 0;
// 新着として受け取る数の上限（28日分の新着を、献立の候補にほぼすべて入れる。4週間かぶらない量のため。2026-10-01 に40から広げた）。
const DISCOVER_TREND_MAX = 120;
async function loadDiscover({ force = false } = {}) {
  if (!API_BASE_URL || discoverLoading) return;
  pruneDiscover();
  // 取り直しは1時間ごと。まだ1品もない時は覚えずに、次に開いた時また取りに行く。
  if (!force && discover.savedAt && discover.trends.length && Date.now() - Date.parse(discover.savedAt) < 3_600_000) return;
  // 取れなかった時（0品・通信エラー）は、1分あける。描き直すたびに取りに行って、画面が作り直され続けないように。
  if (!force && Date.now() - discoverTriedAt < 60_000) return;
  discoverTriedAt = Date.now();
  discoverLoading = true;
  const before = JSON.stringify([discover.trends.length, discover.popular.length, discover.savedAt]);
  try {
    const [t, p] = await Promise.all([
      fetchWithTimeout(`${API_BASE_URL}/api/trends`, {}, 15_000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetchWithTimeout(`${API_BASE_URL}/api/popular?segment=${encodeURIComponent(tasteSegment())}`, {}, 15_000).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (t?.items) discover.trends = t.items.filter(liveItem).slice(0, DISCOVER_TREND_MAX);
    if (p?.items) discover.popular = p.items.slice(0, 20);
    if (t || p) { discover.savedAt = discover.trends.length ? new Date().toISOString() : ""; saveDiscover(); }
  } finally { discoverLoading = false; }
  // 中身が変わった時だけ描き直す（入力中の欄を消さない）。
  if (before === JSON.stringify([discover.trends.length, discover.popular.length, discover.savedAt])) return;
  if (["collection", "plan"].includes(state.view) || FUNNEL[state.onboardingDraft?.quickSetupIndex] === "picks") render();
}
// サーバーの読み取り結果を、アプリのレシピの形に。読み取り専用の「おすすめ」として扱う（保存すると自分のレシピになる）。
function discoverRecipe(item, kind) {
  const ingredients = normalizeImportedIngredients(item.ingredients || []);
  const steps = (item.steps || []).map((s) => String(s || "").trim()).filter(Boolean);
  const recipe = { id: `${kind}-${item.videoId}`, title: item.title, ingredients, steps, stepTimes: stepTimesFor(steps, item.stepTimes), ...(recipeGuide({ steps, guide: item.guide, guideOf: item.guideOf }) ? { guide: item.guide, guideOf: item.guideOf } : {}), videoUrl: item.videoUrl, thumbnailUrl: item.thumbnailUrl, author: item.channelTitle || "", channelId: item.channelId || "", ...(/^https:\/\/yt\d\.(ggpht|googleusercontent)\.com\//.test(item.channelThumb || "") ? { channelThumb: item.channelThumb } : {}), ...(typeof item.catch === "string" && item.catch ? { catch: item.catch.slice(0, 40) } : {}), sourceServings: item.sourceServings ?? null, ...(item.embeddable === false ? { embeddable: false } : {}), mealType: "dinner", tags: item.tags || [], ...(typeof item.dish?.name === "string" && item.dish.name ? { dish: item.dish.name.slice(0, 20) } : {}), curated: true, discover: { kind, week: item.week || "", expiresAt: item.expiresAt || "" } };
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
  return recipe.discover?.kind === "trend" ? "🆕 新着" : recipe.discover?.kind === "pop" ? "👨‍👩‍👧 みんなの定番" : "定番";
}
// みんなの定番づくり：献立に入れた・作ったYouTubeレシピを、名前を伏せて送る（設定で止められる）。
const shareStatsOn = () => { try { return localStorage.getItem("ripigochi-share-stats") !== "off"; } catch { return true; } };
function sharePopular(recipe, kind) {
  const videoId = youtubeVideoId(recipe?.videoUrl);
  if (!API_BASE_URL || !videoId || !shareStatsOn() || isViewer()) return;
  globalThis.fetch?.(`${API_BASE_URL}/api/popular/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId, segment: tasteSegment(), kind }) })?.catch(() => {});
}
// 採用率のために、新着・みんなの定番の料理を献立の候補に出したことを知らせる（PR 4b）。同じ料理は1日1回だけ。名前は送らない。
function shareShown(plan) {
  if (!API_BASE_URL || !shareStatsOn() || isViewer()) return;
  const day = today();
  let sent = {};
  try { sent = JSON.parse(localStorage.getItem("ripigochi-shown") || "{}"); } catch {}
  if (sent.day !== day) sent = { day, ids: [] };
  const fresh = plan.map((d) => !d.slot && d.candidate?.recipe?.discover ? youtubeVideoId(d.candidate.recipe.videoUrl) : "").filter((id) => id && !sent.ids.includes(id));
  if (!fresh.length) return;
  for (const id of [...new Set(fresh)]) {
    sent.ids.push(id);
    globalThis.fetch?.(`${API_BASE_URL}/api/popular/event`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoId: id, segment: tasteSegment(), kind: "shown" }) })?.catch(() => {});
  }
  try { localStorage.setItem("ripigochi-shown", JSON.stringify(sent)); } catch {}
}
// オンボーディング：気になる料理を選ぶ（今週の人気が中心。足りなければ写真のある定番で埋める）。
function funnelPickCandidates() {
  const profile = Lifestyle.profile(profileDraft());
  const curated = Lifestyle.curated.filter((r) => STARTER_PHOTOS[r.id]);
  return [...discoverRecipes().filter((r) => discoverSafe(r, profile)), ...curated.filter((r) => Lifestyle.fit(r, profile, today()).ok)].slice(0, 12);
}
// 雑誌のように選べる一覧：写真の上に小さく「新着」、投稿者のアイコンと名前をはっきり、ひとことの解説つき。
// 一言キャッチがない料理は、ひと目でわかる事実を小さなタグで（⏱15分・フライパンひとつ・甘辛）。
function dishFacts(r) {
  const eq = r.planning?.equipment || [];
  const tool = eq.includes("電子レンジ") && !eq.includes("コンロ") ? "レンジだけ" : eq.length && eq.every((e) => ["フライパン", "コンロ", "包丁", "まな板", "計量スプーン"].includes(e)) ? "フライパンひとつ" : "";
  return [r.planning?.minutes ? `⏱${r.planning.minutes}分` : "", tool, (r.planning?.tastes || [])[0] || "", r.planning?.easy ? "かんたん" : ""].filter(Boolean).slice(0, 3);
}
function creatorAvatar(r) {
  const name = shortCreatorName(r.author || "");
  if (r.channelThumb) return `<img class="pick-avatar" src="${escapeAttr(r.channelThumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 17);
  return `<span class="pick-avatar is-letter" style="--h:${hue}" aria-hidden="true">${escapeHtml(name.slice(0, 1) || "🍳")}</span>`;
}
function renderFunnelPicks() {
  const picks = new Set(profileDraft().picks || []);
  const list = funnelPickCandidates();
  const tiles = list.map((r) => `<button type="button" class="pick-tile is-mag" data-action="life-funnel-dish" data-recipe="${escapeAttr(r.id)}" aria-pressed="${picks.has(r.id)}"><span class="pick-photo">${dishTile(r)}${r.discover?.kind === "trend" ? '<span class="pick-badge">新着</span>' : ""}<i class="pick-check" aria-hidden="true"></i></span><span class="pick-title">${escapeHtml(r.title)}</span>${r.author ? `<span class="pick-creator">${creatorAvatar(r)}<span>${escapeHtml(shortCreatorName(r.author))}</span></span>` : ""}${r.catch ? `<span class="pick-blurb">${escapeHtml(r.catch)}</span>` : `<span class="pick-facts">${dishFacts(r).map((x) => `<i>${escapeHtml(x)}</i>`).join("")}</span>`}</button>`).join("");
  return [`😋 気になる料理を、選んで`, `<p class="small">最初の献立に入ります</p><div class="pick-grid is-mag">${tiles || '<p class="muted small">読み込んでいます…</p>'}</div>`];
}
function finishFunnelPicks() {
  const ids = profileDraft().picks || [];
  const chosen = ids.map((id) => findDiscover(id) || Lifestyle.curated.find((r) => r.id === id)).filter(Boolean);
  state.tasteSeeds = chosen.map((r) => Lifestyle.traits(r)).slice(0, 12);
  return chosen.map((r) => saveOwnRecipe(r));
}

/* ---- 投稿者へのリスペクト：公式プレーヤーで見ながら作る・出典を主役に・チャンネル登録へ ---- */
// 覚えやすく書き直した手順（AI。APP_MAP §49）：[{ text, from:[元の手順の番号（0から）] }]。元の手順と合う時だけ使う（合わなければ元の手順を出す）。
// 元の手順の「指紋」（サーバーの api/src/rewrite.js stepsKey と同じ計算：FNV-1a 32bit の16進）。中身が変われば書き直しは使わない。
function stepsKey(steps) {
  const s = (Array.isArray(steps) ? steps : []).map((x) => String(x || "").trim()).join("\n");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
function recipeGuide(recipe) {
  const g = recipe?.guide, n = (recipe?.steps || []).length;
  if (!Array.isArray(g) || !g.length || g.length > 30 || n < 2) return null;
  if (recipe.guideOf !== stepsKey(recipe.steps)) return null;
  const ok = g.every((x) => typeof x?.text === "string" && x.text.trim() && Array.isArray(x.from) && x.from.length && x.from.every((j) => Number.isInteger(j) && j >= 0 && j < n));
  return ok ? g : null;
}
// 手順ごとの動画の時刻は、手順の数と合う時だけ使う。
function stepTimesFor(steps, times) {
  // 時刻が手順より少ない時（長いレシピの後ろの方など）は、足りない分を「なし」に。
  return Array.isArray(times) && Array.isArray(steps) && times.length <= steps.length && times.some((t) => Number.isFinite(t)) ? steps.map((_, i) => (Number.isFinite(times[i]) ? times[i] : null)) : [];
}
let videoStartAt = { key: "", seconds: 0 };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
// 以前に読み取ったレシピには時刻がないので、開いた時にサーバーに探してもらう（一度探した動画は全員で使い回し）。
const timecodes = new Map();
const timecodeKey = (recipe) => `${youtubeVideoId(recipe?.videoUrl)}|${(recipe?.steps || []).join("\n")}`;
// 確かさの順：だれかが直した時刻・説明欄のタイムスタンプ（サーバーから）→ レシピに入っている時刻 → AIが動画から探した時刻。
const TRUSTED_TIMES = new Set(["fix", "chapters"]);
let timeFix = null; // 時刻を直している間：{ key, recipeId, times }
function recipeStepTimes(recipe) {
  const key = timecodeKey(recipe);
  if (timeFix?.key === key) return timeFix.times;
  const entry = timecodes.get(key);
  // 運営がすべて消した時刻（cleared）は、手元に古い時刻があっても使わない。
  if (entry?.cleared) return entry.times;
  if (entry?.times?.length && TRUSTED_TIMES.has(entry.source)) return entry.times;
  if (recipe?.stepTimes?.some((t) => Number.isFinite(t))) return recipe.stepTimes;
  return entry?.times || [];
}
function timecodesLoading(recipe) { return timecodes.get(timecodeKey(recipe))?.status === "loading"; }
// 見出しの横の小さな案内：探している間と、見つからなかった時（理由つき）。
function timecodeHint(recipe) {
  const entry = timecodes.get(timecodeKey(recipe));
  if (timeFix?.key === timecodeKey(recipe) || entry?.cleared) return "";
  if (entry?.status === "loading") return "▶ の場面を探しています…";
  if (entry?.status === "none") return `▶ の場面は付けられませんでした（${entry.reason}）`;
  if (entry?.source === "fix") return "▶ はみんなで直した時刻です";
  if (entry?.source === "chapters") return "▶ は投稿者のタイムスタンプです";
  return "";
}
const hasOwnTimes = (recipe) => recipe?.stepTimes?.some((t) => Number.isFinite(t));
function ensureTimecodes(recipe) {
  if (!API_BASE_URL || !recipe || !youtubeVideoId(recipe.videoUrl) || (recipe.steps || []).length < 2) return;
  const key = timecodeKey(recipe);
  const prev = timecodes.get(key);
  if (prev && (prev.status !== "none" || Date.now() - prev.at < 60_000)) return; // 失敗は1分たてば、開き直した時にもう一度
  // 時刻がもうあるレシピは、説明欄のタイムスタンプや、だれかが直した時刻だけを確かめる（動画はAIに見せない）。
  const peek = hasOwnTimes(recipe);
  timecodes.set(key, { status: peek ? "peek" : "loading" });
  globalThis.fetch?.(`${API_BASE_URL}/api/import/youtube/timecodes`, { method: "POST", headers: { "Content-Type": "application/json", "X-Household": householdKey() }, body: JSON.stringify({ url: recipe.videoUrl, steps: recipe.steps, ...(peek ? { peek: true } : {}) }) })
    .then(async (r) => { const data = await r.json().catch(() => ({})); return r.ok ? data : { error: data.error?.message || `エラー ${r.status}` }; })
    .catch(() => ({ error: "通信できませんでした" }))
    .then((data) => {
      // 運営がすべて消した時刻：「見つからなかった」とは分けて、手元の古い時刻も消す。
      if (data?.cleared) {
        const none = (recipe.steps || []).map(() => null);
        timecodes.set(key, { status: "done", at: Date.now(), times: none, source: "fix", cleared: true });
        const own = state.recipes.find((r) => r.id === recipe.id && timecodeKey(r) === key);
        if (own && hasOwnTimes(own)) { own.stepTimes = none; saveState(); }
        if (["recipe", "cooking"].includes(state.view)) patchStepTimes(recipe);
        return;
      }
      const times = stepTimesFor(recipe.steps, data?.stepTimes);
      if (peek) timecodes.set(key, { status: "done", at: Date.now(), times, source: times.length ? data.source : "" });
      else timecodes.set(key, { status: times.length ? "done" : "none", at: Date.now(), times, source: data?.source || "", reason: times.length ? "" : data?.error || "動画の中に場面が見つかりませんでした" });
      // 自分のレシピなら、見つけた時刻を保存しておく（次からは探さない）。
      const own = state.recipes.find((r) => r.id === recipe.id && timecodeKey(r) === key);
      if (own && times.length && (!peek || TRUSTED_TIMES.has(data.source))) { own.stepTimes = times; saveState(); }
      // 画面全体は描き直さない（再生中の動画が最初に戻らないように）。▶ と案内だけ差し替える。
      if (["recipe", "cooking"].includes(state.view)) patchStepTimes(recipe);
    });
}
function patchStepTimes(recipe) {
  const list = [...document.querySelectorAll("[data-steps-of]")].find((el) => el.dataset.stepsOf === recipe.id);
  if (!list) return;
  const bind = (root) => root.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", handleAction));
  list.querySelectorAll("[data-step-slot]").forEach((el) => { el.innerHTML = stepTimeSlotInner(recipe, Number(el.dataset.stepSlot)); bind(el); });
  // 書き直した手順の ▶（まとめた最初の元の手順の時刻）。時刻を直している間は「動画では」を開いて、元の手順ごとに 📍 を押せるように。
  list.querySelectorAll("[data-guide-slot]").forEach((el) => { el.innerHTML = stepTimeButton(recipe, Number(el.dataset.guideSlot)); bind(el); });
  if (timeFix?.key === timecodeKey(recipe)) list.querySelectorAll("details.guide-src").forEach((d) => { d.open = true; });
  document.querySelectorAll(".timecode-hint").forEach((el) => { const hint = timecodeHint(recipe); el.textContent = hint ? `${el.dataset.sep || ""}${hint}` : ""; });
  document.querySelectorAll("[data-timefix-for]").forEach((el) => { el.outerHTML = timeFixBar(recipe); });
  document.querySelectorAll("[data-timefix-for]").forEach((el) => bind(el));
}
// 手順の番号のすぐ後ろに置く「▶ m:ss」の入れ物。直している間は「📍今の場面」も出す。
function stepTimeSlotInner(recipe, index) {
  if (timeFix?.key !== timecodeKey(recipe)) return stepTimeButton(recipe, index);
  const t = timeFix.times[index];
  return `${Number.isFinite(t) ? stepTimeButton(recipe, index) : '<span class="step-time is-empty">--:--</span>'}<button type="button" class="step-here" data-action="life-time-here" data-index="${index}" aria-label="この手順の時刻を、いま再生している場面にする">📍今の場面</button>`;
}
const stepTimeSlot = (recipe, index) => `<span class="step-time-slot" data-step-slot="${index}">${stepTimeSlotInner(recipe, index)}</span>`;
const timecodeHintHtml = (recipe, sep = "") => { const hint = timecodeHint(recipe); return `<span class="timecode-hint" data-sep="${escapeAttr(sep)}">${hint ? escapeHtml(sep + hint) : ""}</span>`; };
// 「時刻を直す」の帯。直している間は、使い方と「保存してみんなと共有」。
function timeFixBar(recipe) {
  const canFix = youtubeVideoId(recipe?.videoUrl) && (recipe?.steps || []).length >= 2 && API_BASE_URL;
  const open = timeFix?.key === timecodeKey(recipe);
  const body = !canFix ? "" : open
    ? `<div class="timefix-open"><p class="small">動画を再生して、手順が始まったところで <b>📍今の場面</b> を押してください。</p><div class="timefix-actions"><button type="button" class="primary-button" data-action="life-time-save">保存してみんなと共有</button><button type="button" class="text-button" data-action="life-time-cancel">やめる</button></div></div>`
    : recipeStepTimes(recipe).some((t) => Number.isFinite(t)) ? `<p class="timefix-note">※ ▶ の時刻がずれていたら、<button type="button" class="link-inline timefix-start" data-action="life-time-fix" data-recipe="${escapeAttr(recipe.id)}">直せます</button>（みんなと共有されます）</p>` : "";
  return `<div class="timefix" data-timefix-for="${escapeAttr(recipe?.id || "")}">${body}</div>`;
}
function currentTimeRecipe() {
  const id = document.querySelector("[data-timefix-for]")?.dataset.timefixFor;
  return state.view === "cooking" ? (state.mealSlots?.[cookingDate]?.recipe || dailyPlan().find((d) => d.date === cookingDate)?.candidate?.recipe) : (typeof detailRecipe === "function" ? detailRecipe() : null) || recipeById(id);
}
function handleTimeFixAction(action, data) {
  const recipe = currentTimeRecipe();
  if (!recipe) return false;
  if (action === "life-time-fix") { const times = recipeStepTimes(recipe); timeFix = { key: timecodeKey(recipe), times: recipe.steps.map((_, i) => (Number.isFinite(times[i]) ? times[i] : null)) }; patchStepTimes(recipe); return true; }
  if (action === "life-time-cancel") { timeFix = null; patchStepTimes(recipe); return true; }
  if (action === "life-time-here") {
    if (!Number.isFinite(videoPlayer.currentTime)) { showToast("先に動画を再生してから押してください。"); return true; }
    // 押すのが少し遅れがちなので、1秒だけ前に。
    timeFix.times[Number(data.index)] = Math.max(0, Math.floor(videoPlayer.currentTime) - 1);
    patchStepTimes(recipe); return true;
  }
  if (action === "life-time-save") {
    const times = timeFix.times;
    globalThis.fetch?.(`${API_BASE_URL}/api/import/youtube/timecodes`, { method: "PUT", headers: { "Content-Type": "application/json", "X-Household": householdKey() }, body: JSON.stringify({ url: recipe.videoUrl, steps: recipe.steps, stepTimes: times }) })
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error?.message || "保存できませんでした。"); return d; })
      .then((d) => {
        const saved = stepTimesFor(recipe.steps, d.stepTimes);
        timecodes.set(timeFix.key, { status: "done", at: Date.now(), times: saved, source: "fix" });
        const own = state.recipes.find((r) => r.id === recipe.id && timecodeKey(r) === timeFix.key);
        if (own) { own.stepTimes = saved; saveState(); }
        timeFix = null; patchStepTimes(recipe);
        showToast("直した時刻を保存しました。同じ動画を見るみんなにも使われます。");
      })
      .catch((error) => showToast(error.message));
    return true;
  }
  return false;
}
/* ---- 動画プレーヤーの操作：ページを動かさずにその場面へ。縦持ちは画面上に小さく残し、横持ちは左に動画・右に手順 ---- */
const videoPlayer = { ready: false, playing: false, closed: false, currentTime: null };
const landscapeSplit = () => !!globalThis.matchMedia?.("(orientation: landscape) and (max-height: 520px)").matches;
function playerFrame() { return document.querySelector(".creator-credit .video-frame"); }
function playerCommand(func, args = []) { playerFrame()?.querySelector("iframe")?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*"); }
function playVideoAt(seconds) {
  const iframe = playerFrame()?.querySelector("iframe");
  if (!iframe) return false;
  if (videoPlayer.ready) { playerCommand("seekTo", [seconds, true]); playerCommand("playVideo"); }
  else {
    // まだ動画の準備ができていない時は、その場面から始まる動画に差し替える（ページはそのまま）。
    const url = new URL(iframe.src);
    url.searchParams.set("start", String(Math.floor(seconds))); url.searchParams.set("autoplay", "1");
    iframe.src = url.toString();
  }
  videoPlayer.playing = true; videoPlayer.closed = false; videoPlayer.currentTime = seconds;
  dockVideo();
  return true;
}
function closeVideoDock() { playerCommand("pauseVideo"); videoPlayer.playing = false; videoPlayer.closed = true; dockVideo(); }
// 縦持ちで動画が画面の上に隠れたら、再生中のあいだは画面の上に小さく残す。
function dockVideo() {
  const frame = playerFrame();
  if (!frame) return;
  const top = document.querySelector(".topbar")?.getBoundingClientRect().bottom || 0;
  const hidden = frame.getBoundingClientRect().bottom < top + 40;
  frame.classList.toggle("is-docked", !landscapeSplit() && videoPlayer.playing && !videoPlayer.closed && hidden);
}
function bindVideoPlayer() {
  const iframe = playerFrame()?.querySelector("iframe");
  videoPlayer.ready = false; videoPlayer.playing = false; videoPlayer.closed = false; videoPlayer.currentTime = null;
  // 動画の再生・一時停止を知らせてもらう（YouTube の埋め込みプレーヤーの取り決め）。
  iframe?.addEventListener("load", () => { videoPlayer.ready = false; iframe.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "ripigochi", channel: "widget" }), "*"); });
}
if (globalThis.addEventListener && !globalThis.__videoPlayerBound) {
  globalThis.__videoPlayerBound = true;
  globalThis.addEventListener("message", (event) => {
    if (!/youtube(-nocookie)?\.com$/.test(new URL(event.origin || "http://x").hostname)) return;
    let data; try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
    if (["onReady", "initialDelivery", "infoDelivery"].includes(data?.event)) videoPlayer.ready = true;
    if (Number.isFinite(data?.info?.currentTime)) videoPlayer.currentTime = data.info.currentTime;
    const st = data?.info?.playerState;
    if (st !== undefined) { videoPlayer.playing = st === 1 || st === 3; if (videoPlayer.playing) videoPlayer.closed = false; dockVideo(); }
  });
  globalThis.addEventListener("scroll", () => dockVideo(), { passive: true });
  globalThis.addEventListener("resize", () => dockVideo());
}
function stepTimeButton(recipe, index) {
  const t = recipeStepTimes(recipe)[index];
  if (!Number.isFinite(t) || !youtubeVideoId(recipe.videoUrl)) return "";
  // 埋め込み再生ができない動画は、YouTube のその時刻を開く。
  if (recipe.embeddable === false) return `<a class="step-time" href="https://www.youtube.com/watch?v=${encodeURIComponent(youtubeVideoId(recipe.videoUrl))}&t=${Math.floor(t)}s" target="_blank" rel="noopener" aria-label="この手順を YouTube の${mmss(t)}から見る">▶ ${mmss(t)}</a>`;
  return `<button type="button" class="step-time" data-action="life-video-at" data-recipe="${escapeAttr(recipe.id)}" data-seconds="${t}" aria-label="この手順を動画の${mmss(t)}から見る">▶ ${mmss(t)}</button>`;
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
  // 公式の埋め込みプレーヤー（動画を複製しない。再生回数・広告収益への反映は YouTube の仕組みによる）。
  const shorts = /youtube\.com\/shorts\//i.test(recipe.videoUrl);
  // 投稿者が埋め込み再生を許可していない動画は、アプリの中で再生せず、YouTube で開く。
  const player = id && recipe.embeddable === false ? `<a class="video-open" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noopener">▶ YouTubeで動画を見る<small>投稿者の設定で、アプリの中では再生できません</small></a>`
    : id ? `<div class="video-frame${shorts ? " is-shorts" : ""}"><iframe src="https://www.youtube.com/embed/${id}?playsinline=1&rel=0&enablejsapi=1${globalThis.location?.origin ? `&origin=${encodeURIComponent(globalThis.location.origin)}` : ""}${start ? `&start=${start}&autoplay=1` : ""}" title="${escapeAttr(recipe.title)}の動画" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><button type="button" class="video-undock" data-action="life-video-close" aria-label="小さな動画を閉じる">×</button></div>` : "";
  const name = recipe.author || (id ? "YouTubeの投稿者" : "投稿者");
  const link = creatorLink(recipe);
  const isYouTube = !!id;
  return `<section class="creator-credit" aria-label="レシピの出典">${player}<div class="credit-row"><p class="credit-name"><small>レシピ・動画</small><b>${escapeHtml(name)}</b></p>${link ? `<a class="subscribe-button" href="${escapeAttr(link)}" target="_blank" rel="noopener">${isYouTube && recipe.channelId ? "チャンネル登録" : "投稿者を見る"}</a>` : ""}</div><p class="credit-note small">${isYouTube ? (recipe.embeddable === false ? "コツや火加減は動画で。手順の「▶」から、YouTube のその場面を開けます。" : "コツや火加減は動画で。手順の「▶」から、その場面を再生できます。") : "元の動画で、コツや火加減も確かめてください。"} <a href="creators.html" target="_blank" rel="noopener">投稿者の方へ</a></p></section>`;
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
