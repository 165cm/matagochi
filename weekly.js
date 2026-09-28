/* 1週間コンプ：その週（月〜日）に作った晩ごはんの写真が、スタンプのように1マスずつ埋まっていく。
   予定した日が全部（3日以上）写真でそろったら「メニューにする」（チケット3枚）。
   その週の写真をまとめて1回で、AIが文字入りの「カフェ風の献立表」1枚に描く（画風・文字の言語・カロリー等の添え書き・雰囲気を選べる）。
   サーバーが書く文字を先に決めて一字一句指定し、描けたら読み返して、違えば1回だけ描き直す。
   アプリは、その絵のまわりに「n/n コンプ」・合計・名前・Lv・ロゴとURLを足す（オン・オフは描き直さない）。
   写真も絵も、この端末だけ（アルバムは同期しない・最大12件）。
   ※ 献立表の生成は、仕上がりの再現度が足りないので止めている（MENU_ENABLED）。スタンプカードとコンプのバッジだけ動く。 */
const MENU_ENABLED = false;
const MENU_TICKETS = 3;
const MENU_MIN = 3;
const ALBUM_MAX = 12;
const MENU_URL = "165cm.github.io/matagochi";
const MENU_SIZES = { feed: [1080, 1350], story: [1080, 1920] };
const MENU_STYLES = {
  chalk: { label: "黒板カフェ", icon: "🖍", hint: "カフェの黒板メニュー", bg: "#2b2825", ink: "#f4efe4", sub: "#bdb3a2", accent: "#f2b79f" },
  watercolor: { label: "水彩カフェ", icon: "🎨", hint: "紙のメニュー表", bg: "#f6efe2", ink: "#4a3829", sub: "#8c6d52", accent: "#b9774a" },
  pencil: { label: "色鉛筆ノート", icon: "✏️", hint: "手描きのラフなスケッチ", bg: "#f7f8fb", ink: "#2346a6", sub: "#5a6fae", accent: "#e0533d" },
  anime: { label: "アニメ飯", icon: "✨", hint: "つやつや・キラキラ", bg: "#fff1dc", ink: "#3b2415", sub: "#94603c", accent: "#ec6a35" },
  retro: { label: "レトロ食堂", icon: "🏮", hint: "昭和の食堂の献立", bg: "#efe2c6", ink: "#3a2a20", sub: "#7a5b44", accent: "#b33a2a" },
};
const MENU_LANGS = [["en", "英語", "崩れにくい"], ["ja", "日本語", ""]];
const MENU_INFOS = [["none", "料理名", ""], ["kcal", "＋kcal", ""], ["kcal_yen", "＋kcal・材料費", ""]];
const MENU_OPTIONS = [["stamp", "💮 コンプ印"], ["totals", "🔥 合計"], ["name", "✍️ 名前"], ["lv", "🏅 Lv・連続"]];
const PROMPT_IDEAS = ["秋っぽく", "夏っぽく", "パステルカラー", "北欧カフェ", "クリスマス"];
const MENU_OPTS_KEY = "ripigochi-menu-opts";
let weeklyBusy = "", weeklyError = "";
let menuSetup = null; // { week, style, lang, info, prompt, model }
let menuView = null; // { key, size, url }
const menuCache = new Map(); // `${key}:${size}:${options}` → 合成した画像（data URL）
function menuOpts() {
  const base = { stamp: true, totals: true, name: false, lv: false, handle: "", style: "chalk", lang: "en", info: "none" };
  try { return { ...base, ...JSON.parse(localStorage.getItem(MENU_OPTS_KEY) || "{}") }; } catch { return base; }
}
function saveMenuOpts(patch) { try { localStorage.setItem(MENU_OPTS_KEY, JSON.stringify({ ...menuOpts(), ...patch })); } catch {} }

const mondayOf = (date) => addDays(date, -((new Date(date + "T12:00:00").getDay() + 6) % 7));
const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
const menuKey = (e) => `${e.id}:${e.style}${e.model === "lite" ? ":lite" : ""}`;
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
function normalizeMenuAlbum(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.id) && Array.isArray(e.art) && e.art.length && e.art.every((a) => typeof a === "string" && a.startsWith("data:image/")))
    .map((e) => ({ id: e.id, style: MENU_STYLES[e.style] ? e.style : "chalk", lang: e.lang === "ja" ? "ja" : "en", info: ["kcal", "kcal_yen"].includes(e.info) ? e.info : "none", model: e.model === "lite" ? "lite" : "standard",
      total: Math.max(1, Math.min(7, Number(e.total) || e.days?.length || 1)), checked: e.checked === true ? true : e.checked === false ? false : null,
      days: (Array.isArray(e.days) ? e.days : []).filter((d) => d && typeof d.date === "string").slice(0, 7).map((d) => ({ date: d.date.slice(0, 10), dish: String(d.dish || "").slice(0, 40), kcal: num(d.kcal, 30, 3000), yen: num(d.yen, 10, 5000), copy: String(d.copy || "").slice(0, 24) })),
      art: e.art.slice(0, 1), prompt: String(e.prompt || "").slice(0, 60), at: typeof e.at === "string" ? e.at : "" }))
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
    return { date, kind, dish: String(rec?.recipeTitle || recipe?.title || "").slice(0, 40), photo: withPhoto?.photo || "", recordId: rec?.id || "", recipe, servings: slot?.servings || 0 };
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
  if (weeklyBusy === start) foot = '<p class="stamp-note" role="status">🎨 献立表を描いています…（1分ほど）</p>';
  else if (made.length) foot = `<div class="stamp-actions">${dailyButton("life-menu-open", "🍽 メニューを見る", `data-key="${escapeAttr(menuKey(made[0]))}"`, true)}${MENU_ENABLED ? dailyButton("life-menu-setup", "別の画風でも", `data-week="${start}"`) : ""}</div>`;
  else if (r.complete && !MENU_ENABLED) foot = '<p class="stamp-note">🎉 コンプ！</p>';
  else if (r.complete) foot = dailyButton("life-menu-setup", `🎉 メニューにする <small>🎟${MENU_TICKETS}枚</small>`, `data-week="${start}"`, true);
  else foot = `<p class="stamp-note">${noPhoto ? "📷 をタップで写真を追加" : `あと${left}日でコンプ`}</p>`;
  return `<section class="panel stamp-card" aria-label="${last ? "先週" : "今週"}のスタンプ">
    <div class="stamp-head"><b>📸 ${last ? "先週" : "今週"}のスタンプ</b><span class="stamp-count${r.complete ? " is-comp" : ""}">${r.complete ? "コンプ！ " : ""}${r.got}/${r.target}</span></div>
    <div class="stamp-row">${cells}</div>${foot}${weeklyError && !menuSetup ? `<p class="form-error">${escapeHtml(weeklyError)}</p>` : ""}</section>`;
}

// ── 描く前に選ぶ：画風・文字・添え書き・雰囲気。
const segment = (label, key, list, cur) => `<div class="menu-field"><span>${label}</span><div class="segmented" role="group" aria-label="${label}">${list.map(([v, l, hint]) => `<button type="button" class="choice-button" data-action="life-menu-pick" data-key="${key}" data-value="${v}" aria-pressed="${cur === v}">${l}${hint ? `<small>${hint}</small>` : ""}</button>`).join("")}</div></div>`;
function renderMenuSetup() {
  if (!menuSetup) return "";
  const m = menuSetup;
  return `<div class="menu-viewer" role="dialog" aria-modal="true" aria-label="献立表の画風"><div class="menu-sheet menu-setup">
    <div class="menu-top"><b>どんな献立表にする？</b><button type="button" class="tk-close" data-action="life-menu-close" aria-label="閉じる">×</button></div>
    <div class="style-grid">${Object.entries(MENU_STYLES).map(([id, st]) => `<button type="button" class="style-card" data-action="life-menu-pick" data-key="style" data-value="${id}" aria-pressed="${m.style === id}" style="--paper:${st.bg};--ink:${st.ink};--accent:${st.accent}"><span aria-hidden="true">${st.icon}</span><b>${st.label}</b><small>${st.hint}</small></button>`).join("")}</div>
    ${segment("文字", "lang", MENU_LANGS, m.lang)}
    ${segment("料理ごとに", "info", MENU_INFOS, m.info)}
    <label class="menu-wish"><span>こんな感じに（なくてもOK）</span><input id="menu-prompt" class="input" maxlength="60" placeholder="例：秋っぽく、北欧カフェ" value="${escapeAttr(m.prompt)}"></label>
    <div class="wish-chips">${PROMPT_IDEAS.map((w) => `<button type="button" class="wish-chip" data-action="life-menu-wish" data-wish="${escapeAttr(w)}">+ ${w}</button>`).join("")}</div>
    ${devCode() ? segment("開発用：モデル", "model", [["standard", "標準"], ["lite", "Lite"]], m.model) : ""}
    <p class="stamp-note">今週の写真をまとめて、AIが1枚の献立表に描きます（1分ほど）。書く文字はアプリが決めて、描けたら読み返して確かめます。写真と絵はこの端末だけに保存。</p>
    ${dailyButton("life-menu-make", `🎨 描く <small>🎟${MENU_TICKETS}枚${devCode() ? "（開発コード：無料）" : ""}</small>`, "", true)}</div></div>`;
}
const readWish = () => { const el = globalThis.document?.querySelector?.("#menu-prompt"); if (el && menuSetup) menuSetup.prompt = String(el.value || "").slice(0, 60); };

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
const ingredientLines = (recipe) => (recipe?.ingredients || []).slice(0, 12).map((i) => `${i.name || ""} ${i.amount || ""}`.trim()).filter(Boolean);
const menuMD = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
async function makeWeeklyMenu(start, choice = {}) {
  if (weeklyBusy || !API_BASE_URL) return;
  const stamps = weekStamps(start), r = weekResult(stamps);
  if (!r.complete) return;
  const days = stamps.filter((s) => s.kind === "photo");
  const pick = { style: "chalk", lang: "en", info: "none", prompt: "", model: "standard", ...choice };
  weeklyBusy = start; weeklyError = ""; menuSetup = null; render();
  try {
    const servings = dailyProfile().servings || 2;
    const photos = await Promise.all(days.map(async (s) => ({ mimeType: "image/jpeg", data: (await shrinkPhoto(s.photo)).split(",")[1], dish: s.dish, ingredients: ingredientLines(s.recipe), servings: s.servings || servings, day: (new Date(s.date + "T12:00:00").getDay() + 6) % 7 })));
    const body = { style: pick.style, lang: pick.lang, info: pick.info, prompt: pick.prompt, range: `${menuMD(start)} - ${menuMD(addDays(start, 6))}`, ...(devCode() ? { model: pick.model } : {}), photos };
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/weekly/menu`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify(body) }, 300_000);
    const data = await response.json().catch(() => ({}));
    if (data.tickets) setTickets(data.tickets);
    if (!response.ok || !data.image?.data) {
      if (data.error?.code === "no_tickets") openTicketSheet();
      throw new Error(data.error?.message || "メニューにできませんでした。チケットは戻しました。");
    }
    const before = cookStats();
    const entry = { id: start, style: MENU_STYLES[data.style] ? data.style : pick.style, lang: data.lang === "ja" ? "ja" : "en", info: data.info || pick.info, model: data.model === "lite" ? "lite" : "standard", total: r.target, prompt: pick.prompt, checked: typeof data.checked === "boolean" ? data.checked : null,
      days: days.map((s, i) => ({ date: s.date, dish: s.dish, kcal: num(data.notes?.[i]?.kcal, 30, 3000), yen: num(data.notes?.[i]?.yen, 10, 5000), copy: String(data.notes?.[i]?.copy || "").slice(0, 24) })),
      art: [`data:${data.image.mimeType};base64,${data.image.data}`], at: nowIso() };
    state.menuAlbum = [entry, ...(state.menuAlbum || []).filter((e) => menuKey(e) !== menuKey(entry))].slice(0, ALBUM_MAX);
    saveMenuOpts({ style: entry.style, lang: pick.lang, info: pick.info });
    trackDaily("weekly_menu", { style: entry.style, lang: entry.lang, info: entry.info, model: entry.model, days: days.length, wish: !!pick.prompt, checked: entry.checked });
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

// ── 仕上げ：AIの献立表のまわりに、コンプのはんこ・合計・名前・Lv・ロゴとURLを足す。
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
const fontOf = (w, px) => `${w} ${Math.round(px)}px "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
function menuStreak(start) {
  const weeks = new Set((state.menuAlbum || []).map((e) => e.id));
  let n = 0, w = start;
  while (weeks.has(w)) { n += 1; w = addDays(w, -7); }
  return n;
}
function hanko(ctx, x, y, r, n, total, color) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.2);
  ctx.fillStyle = "rgba(255,255,255,0.92)"; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = fontOf(900, r * 0.58); ctx.fillText(`${n}/${total}`, 0, -r * 0.12);
  ctx.font = fontOf(900, r * 0.32); ctx.fillText("コンプ", 0, r * 0.42);
  ctx.restore();
}
async function composeMenu(entry, size = "feed", opts = menuOpts()) {
  const [W, H] = MENU_SIZES[size] || MENU_SIZES.feed, story = size === "story";
  const st = MENU_STYLES[entry.style] || MENU_STYLES.chalk;
  try { await Promise.all([700, 900].map((w) => document.fonts?.load(`${w} 40px "Zen Maru Gothic"`, "今週の献立コンプ！連続週品平均合計材料費目安リピごち0123456789/〜.,:@¥kcalLv★by"))); } catch {}
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = st.bg; ctx.fillRect(0, 0, W, H);
  const art = await loadImage(entry.art[0]);
  const n = entry.days.length;
  // 絵（4:5）
  const iw = story ? 1000 : 940, ih = Math.round(iw * 1.25), ix = (W - iw) / 2, iy = story ? 250 : 34;
  ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.25)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8; roundRect(ctx, ix, iy, iw, ih, 18); ctx.fillStyle = st.bg; ctx.fill(); ctx.restore();
  drawCover(ctx, art, ix, iy, iw, ih, 18);
  // ストーリーは上に見出し
  if (story) {
    ctx.fillStyle = st.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = fontOf(900, 64); ctx.fillText("今週の献立、コンプ！", W / 2, 120);
    ctx.fillStyle = st.sub; ctx.font = fontOf(700, 32); ctx.fillText(`${weekRange(entry.id)}・${n}品`, W / 2, 188);
  }
  if (opts.stamp) story ? hanko(ctx, W - 130, 130, 72, n, entry.total, st.accent) : hanko(ctx, ix + iw - 58, iy + ih - 58, 56, n, entry.total, st.accent);
  // 足もと
  const kcals = entry.days.map((d) => d.kcal).filter(Boolean), yens = entry.days.map((d) => d.yen).filter(Boolean);
  const totals = opts.totals ? [kcals.length ? `平均 約${Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length)}kcal` : "", yens.length ? `材料費 合計 約¥${yens.reduce((a, b) => a + b, 0).toLocaleString("ja-JP")}` : ""].filter(Boolean) : [];
  const handle = String(opts.handle || "").trim().slice(0, 20);
  const sp = typeof skillProfile === "function" ? skillProfile() : null, stats = opts.lv ? cookStats() : null, streak = menuStreak(entry.id);
  const who = [opts.name && handle ? `by ${handle}` : "", opts.lv && stats ? `Lv${stats.lv}${sp ? ` ${Skills.stars(sp.level)}` : ""}${streak >= 2 ? `・${streak}週連続コンプ` : ""}` : ""].filter(Boolean);
  const fy = iy + ih + (story ? 60 : 22), pad = ix;
  ctx.textBaseline = "middle";
  let y = fy;
  if (totals.length) {
    ctx.fillStyle = st.sub; ctx.textAlign = story ? "center" : "left"; ctx.font = fontOf(700, story ? 32 : 22);
    ctx.fillText(fitText(ctx, `${totals.join("・")}（1人分・目安）`, iw), story ? W / 2 : pad, y + 12);
    y += story ? 64 : 34;
  }
  const ly = story ? H - 110 : Math.max(y + 22, H - 44);
  try { const logo = await loadImage("icons/icon-192.png"); drawCover(ctx, logo, pad, ly - (story ? 32 : 22), story ? 64 : 44, story ? 64 : 44, 10); } catch {}
  ctx.textAlign = "left"; ctx.fillStyle = st.ink; ctx.font = fontOf(900, story ? 34 : 24); ctx.fillText("リピごち", pad + (story ? 80 : 54), ly - (story ? 10 : 8));
  ctx.fillStyle = st.sub; ctx.font = fontOf(700, story ? 20 : 15); ctx.fillText(MENU_URL, pad + (story ? 80 : 54), ly + (story ? 20 : 13));
  if (who.length) {
    ctx.textAlign = "right"; ctx.fillStyle = st.ink; ctx.font = fontOf(900, story ? 34 : 24);
    ctx.fillText(who[0], pad + iw, ly - (who.length > 1 ? (story ? 16 : 11) : 0));
    if (who.length > 1) { ctx.fillStyle = st.accent; ctx.font = fontOf(700, story ? 24 : 17); ctx.fillText(who[1], pad + iw, ly + (story ? 22 : 15)); }
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}
const optsKey = (o) => MENU_OPTIONS.map(([k]) => (o[k] ? 1 : 0)).join("") + (o.name ? o.handle : "");
async function showMenu(key, size = "feed") {
  const entry = (state.menuAlbum || []).find((e) => menuKey(e) === key);
  if (!entry) { menuView = null; render(); return; }
  const opts = menuOpts(), cacheKey = `${key}:${size}:${optsKey(opts)}`;
  menuView = { key, size, url: menuCache.get(cacheKey) || "", cacheKey };
  render();
  if (menuView.url) return;
  try {
    const url = await composeMenu(entry, size, opts);
    menuCache.set(cacheKey, url);
    if (menuView?.cacheKey === cacheKey) { menuView.url = url; render(); }
  } catch { showToast("メニューを作れませんでした。"); menuView = null; render(); }
}
async function shareMenu() {
  if (!menuView?.url) return;
  const blob = await (await fetch(menuView.url)).blob();
  const name = `ripigochi-menu-${menuView.key.replace(":", "-")}-${menuView.size}.jpg`;
  const file = new File([blob], name, { type: "image/jpeg" });
  const nav = globalThis.navigator;
  if (nav?.canShare?.({ files: [file] })) {
    try { await nav.share({ files: [file], text: "今週のごはん、コンプしました！ #リピごち #今週の献立" }); trackDaily("weekly_menu_share", { size: menuView.size }); } catch {}
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
function menuNameChanged(value) {
  saveMenuOpts({ handle: String(value || "").trim().slice(0, 20) });
  if (menuView) showMenu(menuView.key, menuView.size);
}
function renderMenuViewer() {
  if (menuSetup) return renderMenuSetup();
  if (!menuView) return "";
  const entry = (state.menuAlbum || []).find((e) => menuKey(e) === menuView.key);
  if (!entry) return "";
  const opts = menuOpts();
  const has = { stamp: true, totals: entry.days.some((d) => d.kcal || d.yen), name: true, lv: true };
  const sizes = [["feed", "投稿 4:5"], ["story", "ストーリー 9:16"]];
  return `<div class="menu-viewer" role="dialog" aria-modal="true" aria-label="1週間の献立表"><div class="menu-sheet">
    <div class="menu-top"><div class="segmented" role="group" aria-label="サイズ">${sizes.map(([v, l]) => `<button type="button" class="choice-button" data-action="life-menu-size" data-size="${v}" aria-pressed="${menuView.size === v}">${l}</button>`).join("")}</div><button type="button" class="tk-close" data-action="life-menu-close" aria-label="閉じる">×</button></div>
    <div class="menu-frame is-${menuView.size}">${menuView.url ? `<img src="${escapeAttr(menuView.url)}" alt="1週間の献立表">` : '<p role="status">仕上げています…</p>'}</div>
    <div class="menu-opts" role="group" aria-label="のせるもの">${MENU_OPTIONS.filter(([k]) => has[k]).map(([k, l]) => `<button type="button" class="opt-chip" data-action="life-menu-opt" data-opt="${k}" aria-pressed="${!!opts[k]}">${l}</button>`).join("")}</div>
    ${opts.name ? `<input class="input menu-name" maxlength="20" placeholder="名前や @アカウント" value="${escapeAttr(opts.handle)}" aria-label="献立表にのせる名前" onchange="menuNameChanged(this.value)">` : ""}
    ${devCode() ? `<p class="stamp-note">開発用：${entry.model === "lite" ? "Lite" : "標準"}モデル・${MENU_STYLES[entry.style].label}・${entry.lang === "en" ? "英語" : "日本語"}・読み返し${entry.checked === true ? "OK" : entry.checked === false ? "ずれあり" : "なし"}</p>` : ""}
    <div class="menu-actions">${dailyButton("life-menu-share", "📤 シェア", menuView.url ? "" : "disabled", true)}${dailyButton("life-menu-save", "保存", menuView.url ? "" : "disabled")}</div></div></div>`;
}
// ふりかえり：1週間コンプのアルバム。
function renderMenuAlbum() {
  const list = state.menuAlbum || [];
  if (!list.length) return "";
  return `<section class="table-section menu-album"><div class="table-head"><h3>1週間コンプ</h3><small class="muted">この端末だけに保存</small></div>
    <div class="album-row">${list.map((e) => `<button type="button" class="album-tile" data-action="life-menu-open" data-key="${escapeAttr(menuKey(e))}" aria-label="${escapeAttr(`${weekRange(e.id)}の献立表`)}"><img src="${escapeAttr(e.art[0])}" alt="" loading="lazy"><small>${weekRange(e.id)}・${MENU_STYLES[e.style].label}</small></button>`).join("")}</div></section>`;
}
const menuCompDone = () => (state.menuAlbum || []).length > 0 || [mondayOf(today()), addDays(mondayOf(today()), -7)].some((w) => weekResult(weekStamps(w)).complete);
const SETUP_KEYS = { style: Object.keys(MENU_STYLES), lang: MENU_LANGS.map(([v]) => v), info: MENU_INFOS.map(([v]) => v), model: ["standard", "lite"] };
function handleWeeklyAction(action, data) {
  if (!action.startsWith("life-menu")) return false;
  if (!MENU_ENABLED && ["life-menu-setup", "life-menu-pick", "life-menu-wish", "life-menu-make"].includes(action)) return true;
  if (action === "life-menu-setup") { const o = menuOpts(); weeklyError = ""; menuView = null; menuSetup = { week: data.week, style: MENU_STYLES[o.style] ? o.style : "chalk", lang: o.lang === "ja" ? "ja" : "en", info: SETUP_KEYS.info.includes(o.info) ? o.info : "none", prompt: "", model: "standard" }; render(); }
  else if (action === "life-menu-pick" && menuSetup && SETUP_KEYS[data.key]?.includes(data.value)) { readWish(); menuSetup[data.key] = data.value; render(); }
  else if (action === "life-menu-wish" && menuSetup) { readWish(); const w = data.wish; if (!menuSetup.prompt.includes(w)) menuSetup.prompt = [menuSetup.prompt, w].filter(Boolean).join("、").slice(0, 60); render(); }
  else if (action === "life-menu-make" && menuSetup) { readWish(); const { week, ...pick } = menuSetup; makeWeeklyMenu(week, pick); }
  else if (action === "life-menu-open") showMenu(data.key, "feed");
  else if (action === "life-menu-size" && menuView) showMenu(menuView.key, data.size === "story" ? "story" : "feed");
  else if (action === "life-menu-opt" && menuView && MENU_OPTIONS.some(([k]) => k === data.opt)) { const o = menuOpts(); saveMenuOpts({ [data.opt]: !o[data.opt] }); showMenu(menuView.key, menuView.size); }
  else if (action === "life-menu-close") { menuView = null; menuSetup = null; render(); }
  else if (action === "life-menu-share") shareMenu();
  else if (action === "life-menu-save") saveMenu();
  return true;
}
