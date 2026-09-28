/* 1週間コンプ：その週（月〜日）に作った晩ごはんの写真が、スタンプのように1マスずつ埋まっていく。
   予定した日が全部（3日以上）写真でそろったら「メニューにする」（チケット3枚）。
   AIは料理の絵だけを描き、日付・料理名・「5/5 コンプ」・ロゴとURLは、ここ（canvas）で重ねる。
   写真も絵も、この端末だけ（アルバムは同期しない・最大12週）。 */
const MENU_TICKETS = 3;
const MENU_MIN = 3;
const ALBUM_MAX = 12;
const MENU_URL = "165cm.github.io/matagochi";
const MENU_SIZES = { feed: [1080, 1350], story: [1080, 1920] };
let weeklyBusy = "", weeklyError = "";
let menuView = null; // { key, size, url }
const menuCache = new Map(); // `${key}:${size}` → 合成した画像（data URL）

const mondayOf = (date) => addDays(date, -((new Date(date + "T12:00:00").getDay() + 6) % 7));
const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
const menuKey = (e) => `${e.id}:${e.mode}`;
function normalizeMenuAlbum(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.id) && Array.isArray(e.art) && e.art.length && e.art.every((a) => typeof a === "string" && a.startsWith("data:image/")))
    .map((e) => ({ id: e.id, mode: e.mode === "each" ? "each" : "one", total: Math.max(1, Math.min(7, Number(e.total) || e.days?.length || 1)), days: (Array.isArray(e.days) ? e.days : []).filter((d) => d && typeof d.date === "string").slice(0, 7).map((d) => ({ date: d.date.slice(0, 10), dish: String(d.dish || "").slice(0, 40) })), art: e.art.slice(0, 7), at: typeof e.at === "string" ? e.at : "" }))
    .slice(0, ALBUM_MAX);
}
// その週の7日：photo（写真あり）／cooked（作ったが写真なし）／planned（これから）／missed（予定したが記録なし）／off（外食・お休み）／none
function weekStamps(start = mondayOf(today())) {
  const t = today();
  return weekDates(start).map((date) => {
    const slot = state.mealSlots?.[date];
    const recs = (state.evaluations || []).filter((e) => String(e.cookedAt || "").slice(0, 10) === date && (!e.mealType || e.mealType === "dinner"));
    const withPhoto = recs.find((e) => isDataPhoto(e.photo));
    const rec = withPhoto || recs[0];
    const recipe = slot?.recipe || (rec && (recipeById(rec.recipeId) || { title: rec.recipeTitle }));
    const kind = withPhoto ? "photo" : rec || slot?.status === "cooked" ? "cooked" : slot?.status === "off" ? "off" : slot?.status === "confirmed" ? (date < t ? "missed" : "planned") : "none";
    return { date, kind, dish: String(rec?.recipeTitle || recipe?.title || "").slice(0, 40), photo: withPhoto?.photo || "", recordId: rec?.id || "", recipe };
  });
}
function weekResult(stamps) {
  const target = stamps.filter((s) => ["photo", "cooked", "planned", "missed"].includes(s.kind)).length;
  const got = stamps.filter((s) => s.kind === "photo").length;
  return { target, got, complete: target >= MENU_MIN && got === target };
}
const albumOf = (start) => (state.menuAlbum || []).filter((e) => e.id === start);
// 今日に出す週：先週コンプしてまだメニューにしていなければ、水曜まで先週を出す。
function menuWeek() {
  const start = mondayOf(today()), last = addDays(start, -7);
  if (daysBetween(start, today()) <= 2 && !albumOf(last).length && weekResult(weekStamps(last)).complete) return last;
  return start;
}
const weekRange = (start) => `${Number(start.slice(5, 7))}/${Number(start.slice(8, 10))}〜${Number(addDays(start, 6).slice(5, 7))}/${Number(addDays(start, 6).slice(8, 10))}`;
const WEEK_LETTERS = ["月", "火", "水", "木", "金", "土", "日"];

function renderWeeklyStamps() {
  if (isViewer() || !state.onboarded) return "";
  const start = menuWeek(), stamps = weekStamps(start), r = weekResult(stamps);
  if (!r.target) return "";
  const made = albumOf(start), last = start < mondayOf(today());
  const cells = stamps.map((s, i) => {
    const label = `${WEEK_LETTERS[i]}曜 ${s.dish || ""}`;
    const inner = s.kind === "photo" ? `<img src="${escapeAttr(s.photo)}" alt="">` : s.kind === "cooked" ? "📷" : s.kind === "off" ? "🌙" : s.kind === "missed" ? "？" : "";
    const tag = s.recordId && s.kind !== "photo" ? `button type="button" data-action="life-edit-record" data-id="${escapeAttr(s.recordId)}"` : "span";
    return `<${tag} class="stamp is-${s.kind}${s.date === today() ? " is-today" : ""}" aria-label="${escapeAttr(label)}"><i>${inner}</i><small>${WEEK_LETTERS[i]}</small></${tag.split(" ")[0]}>`;
  }).join("");
  const left = r.target - r.got, noPhoto = stamps.filter((s) => s.kind === "cooked").length;
  let foot;
  if (made.length) foot = `<div class="stamp-actions">${made.map((e) => dailyButton("life-menu-open", made.length > 1 ? `🍽 メニュー（${e.mode === "one" ? "A" : "B"}）` : "🍽 メニューを見る", `data-key="${escapeAttr(menuKey(e))}"`)).join("")}</div>`;
  else if (r.complete) {
    const busy = weeklyBusy === start;
    const dev = devCode() ? `<div class="stamp-actions">${dailyButton("life-menu-make", "A：1枚の絵", `data-week="${start}" data-mode="one"${busy ? " disabled" : ""}`)}${dailyButton("life-menu-make", "B：一皿ずつ", `data-week="${start}" data-mode="each"${busy ? " disabled" : ""}`)}</div>` : "";
    foot = busy ? '<p class="stamp-note" role="status">🎨 メニューを描いています…（1分ほど）</p>'
      : `${devCode() ? '<p class="stamp-note">開発用：A と B を見比べる</p>' + dev : dailyButton("life-menu-make", `🎉 メニューにする <small>🎟${MENU_TICKETS}枚</small>`, `data-week="${start}" data-mode="one"`, true)}${weeklyError ? `<p class="form-error">${escapeHtml(weeklyError)}</p>` : ""}`;
  } else foot = `<p class="stamp-note">${noPhoto ? `📷 のマスをタップして写真を足すと、スタンプになります。` : `あと${left}日、作った料理の写真でコンプ。<b>1週間のメニュー</b>が作れます。`}</p>`;
  return `<section class="panel stamp-card" aria-label="${last ? "先週" : "今週"}のスタンプ">
    <div class="stamp-head"><b>📸 ${last ? "先週" : "今週"}のスタンプ</b><span class="stamp-count${r.complete ? " is-comp" : ""}">${r.complete ? "コンプ！ " : ""}${r.got}/${r.target}</span></div>
    <div class="stamp-row">${cells}</div>${foot}</section>`;
}

// ── 写真を小さくして送る（768px・JPEG）。
function shrinkPhoto(dataUrl, max = 768, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.src = dataUrl;
  });
}
async function makeWeeklyMenu(start, mode = "one") {
  if (weeklyBusy || !API_BASE_URL) return;
  const stamps = weekStamps(start), r = weekResult(stamps);
  if (!r.complete) return;
  const days = stamps.filter((s) => s.kind === "photo");
  weeklyBusy = start; weeklyError = ""; render();
  try {
    const photos = await Promise.all(days.map(async (s) => ({ mimeType: "image/jpeg", data: (await shrinkPhoto(s.photo)).split(",")[1], dish: s.dish })));
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/weekly/menu`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ mode, photos }) }, 240_000);
    const data = await response.json().catch(() => ({}));
    if (data.tickets) setTickets(data.tickets);
    if (!response.ok || !data.images?.length) {
      if (data.error?.code === "no_tickets") openTicketSheet();
      throw new Error(data.error?.message || "メニューにできませんでした。チケットは戻しました。");
    }
    const before = cookStats();
    const entry = { id: start, mode: data.mode === "each" ? "each" : "one", total: r.target, days: days.map((s) => ({ date: s.date, dish: s.dish })), art: data.images.map((i) => `data:${i.mimeType};base64,${i.data}`), at: nowIso() };
    state.menuAlbum = [entry, ...(state.menuAlbum || []).filter((e) => menuKey(e) !== menuKey(entry))].slice(0, ALBUM_MAX);
    trackDaily("weekly_menu", { mode: entry.mode, days: days.length });
    saveState({ scheduleSync: false });
    celebrateCook(before);
    menuView = { key: menuKey(entry), size: "feed", url: "" };
  } catch (error) {
    weeklyError = error.message || "メニューにできませんでした。";
  }
  weeklyBusy = "";
  render();
  if (menuView && !menuView.url) showMenu(menuView.key, menuView.size);
}

// ── メニューの合成（文字はアプリで重ねる）。
const loadImage = (src) => new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function drawCover(ctx, img, x, y, w, h, r) {
  const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
  ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}
function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}
async function composeMenu(entry, size = "feed") {
  const [W, H] = MENU_SIZES[size] || MENU_SIZES.feed, story = size === "story";
  const F = '"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif';
  try { await Promise.all(["900 64px", "700 36px"].map((f) => document.fonts?.load(`${f} "Zen Maru Gothic"`, "今週のごはん月火水木金土日コンプリピごち0123456789/〜.WEEKLYMENUabcdghimotu"))); } catch {}
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const INK = "#3b2a20", ACCENT = "#e0663e", PAPER = "#fbf5ea";
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#e9dcc5"; ctx.lineWidth = 6; roundRect(ctx, 28, 28, W - 56, H - 56, 36); ctx.stroke();
  const pad = 72, top = story ? 150 : 80;
  // 見出し
  ctx.fillStyle = ACCENT; ctx.font = `700 30px ${F}`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.fillText(`${weekRange(entry.id)}  WEEKLY MENU`, W / 2, top + 30);
  ctx.fillStyle = INK; ctx.font = `900 ${story ? 84 : 72}px ${F}`;
  ctx.fillText("今週のごはん", W / 2, top + (story ? 124 : 110));
  // 絵
  const artY = top + (story ? 170 : 140), artH = story ? 980 : 600, artW = W - pad * 2;
  const imgs = await Promise.all(entry.art.map((a) => loadImage(a)));
  if (imgs.length === 1) drawCover(ctx, imgs[0], pad, artY, artW, artH, 28);
  else {
    const cols = imgs.length <= 4 ? 2 : 3, rows = Math.ceil(imgs.length / cols), gap = 14;
    const cw = (artW - gap * (cols - 1)) / cols, ch = (artH - gap * (rows - 1)) / rows;
    imgs.forEach((img, i) => {
      const row = Math.floor(i / cols), inRow = Math.min(cols, imgs.length - row * cols);
      const x0 = pad + (artW - (inRow * cw + (inRow - 1) * gap)) / 2;
      drawCover(ctx, img, x0 + (i % cols) * (cw + gap), artY + row * (ch + gap), cw, ch, 20);
    });
  }
  // コンプのはんこ
  const n = entry.days.length, cx = W - pad - 92, cy = artY + 92;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.18);
  ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.beginPath(); ctx.arc(0, 0, 84, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = ACCENT; ctx.textAlign = "center"; ctx.font = `900 44px ${F}`; ctx.fillText(`${n}/${entry.total}`, 0, 4);
  ctx.font = `900 28px ${F}`; ctx.fillText("コンプ", 0, 42);
  ctx.restore();
  // 献立の一覧
  const listTop = artY + artH + (story ? 70 : 44), footY = H - (story ? 150 : 86);
  const rowH = Math.min(story ? 84 : 58, (footY - 30 - listTop) / Math.max(1, n));
  const fs = Math.round(Math.min(story ? 44 : 34, rowH * 0.62));
  entry.days.forEach((d, i) => {
    const y = listTop + i * rowH + rowH / 2;
    const wd = WEEK_LETTERS[(new Date(d.date + "T12:00:00").getDay() + 6) % 7];
    ctx.fillStyle = ACCENT; ctx.beginPath(); ctx.arc(pad + fs * 0.7, y, fs * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = `900 ${Math.round(fs * 0.78)}px ${F}`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(wd, pad + fs * 0.7, y + 1);
    ctx.fillStyle = INK; ctx.font = `700 ${fs}px ${F}`; ctx.textAlign = "left";
    ctx.fillText(fitText(ctx, d.dish || "晩ごはん", W - pad * 2 - fs * 2), pad + fs * 1.8, y + 1);
  });
  // ロゴとURL
  ctx.textBaseline = "middle";
  try { const logo = await loadImage("icons/icon-192.png"); drawCover(ctx, logo, pad, footY - 28, 56, 56, 14); } catch {}
  ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.font = `900 34px ${F}`; ctx.fillText("リピごち", pad + 72, footY);
  ctx.fillStyle = "#8a7563"; ctx.textAlign = "right"; ctx.font = `700 26px ${F}`; ctx.fillText(MENU_URL, W - pad, footY);
  return canvas.toDataURL("image/jpeg", 0.9);
}
async function showMenu(key, size = "feed") {
  const entry = (state.menuAlbum || []).find((e) => menuKey(e) === key);
  if (!entry) { menuView = null; render(); return; }
  const cacheKey = `${key}:${size}`;
  menuView = { key, size, url: menuCache.get(cacheKey) || "" };
  render();
  if (menuView.url) return;
  try {
    const url = await composeMenu(entry, size);
    menuCache.set(cacheKey, url);
    if (menuView?.key === key && menuView.size === size) { menuView.url = url; render(); }
  } catch { showToast("メニューを作れませんでした。"); menuView = null; render(); }
}
async function shareMenu() {
  if (!menuView?.url) return;
  const blob = await (await fetch(menuView.url)).blob();
  const name = `ripigochi-menu-${menuView.key.replace(":", "-")}-${menuView.size}.jpg`;
  const file = new File([blob], name, { type: "image/jpeg" });
  const nav = globalThis.navigator;
  if (nav?.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: "今週のごはん、コンプしました！ #リピごち" }); trackDaily("weekly_menu_share", { size: menuView.size }); } catch {}
    return;
  }
  saveMenu();
}
function saveMenu() {
  if (!menuView?.url) return;
  const a = document.createElement("a");
  a.href = menuView.url;
  a.download = `ripigochi-menu-${menuView.key.replace(":", "-")}-${menuView.size}.jpg`;
  document.body.append(a); a.click(); a.remove();
}
function renderMenuViewer() {
  if (!menuView) return "";
  const sizes = [["feed", "投稿 4:5"], ["story", "ストーリー 9:16"]];
  return `<div class="menu-viewer" role="dialog" aria-modal="true" aria-label="1週間のメニュー"><div class="menu-sheet">
    <div class="menu-top"><div class="segmented" role="group" aria-label="サイズ">${sizes.map(([v, l]) => `<button type="button" class="choice-button" data-action="life-menu-size" data-size="${v}" aria-pressed="${menuView.size === v}">${l}</button>`).join("")}</div><button type="button" class="tk-close" data-action="life-menu-close" aria-label="閉じる">×</button></div>
    <div class="menu-frame is-${menuView.size}">${menuView.url ? `<img src="${escapeAttr(menuView.url)}" alt="1週間のメニュー">` : '<p role="status">仕上げています…</p>'}</div>
    <div class="menu-actions">${dailyButton("life-menu-share", "📤 シェア", menuView.url ? "" : "disabled", true)}${dailyButton("life-menu-save", "保存", menuView.url ? "" : "disabled")}</div></div></div>`;
}
// ふりかえり：1週間コンプのアルバム。
function renderMenuAlbum() {
  const list = state.menuAlbum || [];
  if (!list.length) return "";
  return `<section class="table-section menu-album"><div class="table-head"><h3>1週間コンプ</h3><small class="muted">この端末だけに保存</small></div>
    <div class="album-row">${list.map((e) => `<button type="button" class="album-tile" data-action="life-menu-open" data-key="${escapeAttr(menuKey(e))}" aria-label="${escapeAttr(`${weekRange(e.id)}のメニュー`)}"><img src="${escapeAttr(e.art[0])}" alt="" loading="lazy"><small>${weekRange(e.id)}${devCode() ? ` ${e.mode === "one" ? "A" : "B"}` : ""}</small></button>`).join("")}</div></section>`;
}
const menuCompDone = () => (state.menuAlbum || []).length > 0 || [mondayOf(today()), addDays(mondayOf(today()), -7)].some((w) => weekResult(weekStamps(w)).complete);
function handleWeeklyAction(action, data) {
  if (!action.startsWith("life-menu")) return false;
  if (action === "life-menu-make") makeWeeklyMenu(data.week, data.mode === "each" ? "each" : "one");
  else if (action === "life-menu-open") showMenu(data.key, "feed");
  else if (action === "life-menu-size" && menuView) showMenu(menuView.key, data.size === "story" ? "story" : "feed");
  else if (action === "life-menu-close") { menuView = null; render(); }
  else if (action === "life-menu-share") shareMenu();
  else if (action === "life-menu-save") saveMenu();
  return true;
}
