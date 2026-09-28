/* 1週間コンプ：その週（月〜日）に作った晩ごはんの写真が、スタンプのように1マスずつ埋まっていく。
   予定した日が全部（3日以上）写真でそろったら「メニューにする」（チケット3枚）。
   AIは選んだ画風で料理を一皿ずつ描き、カロリー・材料費の目安とひとことを添える。並べ方・料理名・「5/5 コンプ」・
   名前やLv・ロゴとURLは、ここ（canvas）で重ねる。数字や名前は、あとからオン・オフできる（描き直さない）。
   写真も絵も、この端末だけ（アルバムは同期しない・最大12週）。 */
const MENU_TICKETS = 3;
const MENU_MIN = 3;
const ALBUM_MAX = 12;
const MENU_URL = "165cm.github.io/matagochi";
const MENU_SIZES = { feed: [1080, 1350], story: [1080, 1920] };
const MENU_STYLES = {
  watercolor: { label: "水彩カフェ", icon: "🎨", hint: "カフェのメニュー風", paper: "#faf5ec", ink: "#4a3829", sub: "#8c6d52", accent: "#b9774a", en: "Weekly Menu", enFont: "Caveat", enWeight: 600, jpFont: "Klee One", jpWeight: 600, title: "今週のごはん", frame: "line" },
  pencil: { label: "色鉛筆ノート", icon: "✏️", hint: "手描きのラフなスケッチ", paper: "#fdfdf9", ink: "#2346a6", sub: "#2346a6", accent: "#e0533d", en: "this week's dinner", enFont: "Caveat", enWeight: 600, jpFont: "Klee One", jpWeight: 600, title: "", frame: "grid", numbered: true },
  anime: { label: "アニメ飯", icon: "✨", hint: "つやつや・キラキラ", paper: "#fff4e2", ink: "#3b2415", sub: "#94603c", accent: "#ec6a35", en: "WEEKLY MENU", enFont: "Zen Maru Gothic", enWeight: 900, jpFont: "Zen Maru Gothic", jpWeight: 900, title: "今週のごはん", frame: "dots" },
  retro: { label: "レトロ食堂", icon: "🏮", hint: "昭和の食堂メニュー", paper: "#f3e6cc", ink: "#3a2a20", sub: "#7a5b44", accent: "#b33a2a", en: "", enFont: "Shippori Mincho B1", enWeight: 800, jpFont: "Shippori Mincho B1", jpWeight: 800, title: "今週の献立", frame: "double" },
};
const MENU_OPTIONS = [["kcal", "🔥 カロリー"], ["yen", "💴 材料費"], ["time", "⏱ 時間"], ["copy", "💬 ひとこと"], ["name", "✍️ 名前"], ["lv", "🏅 Lv・連続"]];
const PROMPT_IDEAS = ["木のテーブルで", "秋っぽく", "キラキラ", "おしゃれなカフェ", "パステルカラー"];
const MENU_OPTS_KEY = "ripigochi-menu-opts";
let weeklyBusy = "", weeklyError = "";
let menuSetup = null; // { week, style, prompt }
let menuView = null; // { key, size, url }
const menuCache = new Map(); // `${key}:${size}:${options}` → 合成した画像（data URL）
function menuOpts() {
  const base = { kcal: true, yen: true, time: false, copy: true, name: false, lv: false, handle: "", style: "watercolor" };
  try { return { ...base, ...JSON.parse(localStorage.getItem(MENU_OPTS_KEY) || "{}") }; } catch { return base; }
}
function saveMenuOpts(patch) { try { localStorage.setItem(MENU_OPTS_KEY, JSON.stringify({ ...menuOpts(), ...patch })); } catch {} }

const mondayOf = (date) => addDays(date, -((new Date(date + "T12:00:00").getDay() + 6) % 7));
const weekDates = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
const menuKey = (e) => `${e.id}:${e.style}`;
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
function normalizeMenuAlbum(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.id) && Array.isArray(e.art) && e.art.length && e.art.every((a) => typeof a === "string" && a.startsWith("data:image/")))
    .map((e) => ({ id: e.id, style: MENU_STYLES[e.style] ? e.style : "watercolor", total: Math.max(1, Math.min(7, Number(e.total) || e.days?.length || 1)),
      days: (Array.isArray(e.days) ? e.days : []).filter((d) => d && typeof d.date === "string").slice(0, 7).map((d) => ({ date: d.date.slice(0, 10), dish: String(d.dish || "").slice(0, 40), minutes: num(d.minutes, 1, 600), kcal: num(d.kcal, 30, 3000), yen: num(d.yen, 10, 5000), copy: String(d.copy || "").slice(0, 24) })),
      art: e.art.slice(0, 7), prompt: String(e.prompt || "").slice(0, 60), at: typeof e.at === "string" ? e.at : "" }))
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
  if (weeklyBusy === start) foot = '<p class="stamp-note" role="status">🎨 一皿ずつ描いています…（1分ほど）</p>';
  else if (made.length) foot = `<div class="stamp-actions">${dailyButton("life-menu-open", "🍽 メニューを見る", `data-key="${escapeAttr(menuKey(made[0]))}"`, true)}${dailyButton("life-menu-setup", "別の画風でも", `data-week="${start}"`)}</div>`;
  else if (r.complete) foot = dailyButton("life-menu-setup", `🎉 メニューにする <small>🎟${MENU_TICKETS}枚</small>`, `data-week="${start}"`, true);
  else foot = `<p class="stamp-note">${noPhoto ? "📷 のマスをタップして写真を足すと、スタンプになります。" : `あと${left}日、作った料理の写真でコンプ。<b>イラストのメニュー</b>が作れます。`}</p>`;
  return `<section class="panel stamp-card" aria-label="${last ? "先週" : "今週"}のスタンプ">
    <div class="stamp-head"><b>📸 ${last ? "先週" : "今週"}のスタンプ</b><span class="stamp-count${r.complete ? " is-comp" : ""}">${r.complete ? "コンプ！ " : ""}${r.got}/${r.target}</span></div>
    <div class="stamp-row">${cells}</div>${foot}${weeklyError && !menuSetup ? `<p class="form-error">${escapeHtml(weeklyError)}</p>` : ""}</section>`;
}

// ── 画風を選ぶ（描く前）。
function renderMenuSetup() {
  if (!menuSetup) return "";
  const cur = menuSetup.style;
  return `<div class="menu-viewer" role="dialog" aria-modal="true" aria-label="メニューの画風"><div class="menu-sheet menu-setup">
    <div class="menu-top"><b>どんな絵にする？</b><button type="button" class="tk-close" data-action="life-menu-close" aria-label="閉じる">×</button></div>
    <div class="style-grid">${Object.entries(MENU_STYLES).map(([id, st]) => `<button type="button" class="style-card" data-action="life-menu-style" data-style="${id}" aria-pressed="${cur === id}" style="--paper:${st.paper};--ink:${st.ink};--accent:${st.accent}"><span aria-hidden="true">${st.icon}</span><b>${st.label}</b><small>${st.hint}</small></button>`).join("")}</div>
    <label class="menu-wish"><span>こんな感じに（なくてもOK）</span><input id="menu-prompt" class="input" maxlength="60" placeholder="例：木のテーブルで、秋っぽく" value="${escapeAttr(menuSetup.prompt)}"></label>
    <div class="wish-chips">${PROMPT_IDEAS.map((w) => `<button type="button" class="wish-chip" data-action="life-menu-wish" data-wish="${escapeAttr(w)}">+ ${w}</button>`).join("")}</div>
    <p class="stamp-note">写真の料理を、AIが一皿ずつ描き直します。カロリー・材料費の目安とひとことも付きます。写真と絵はこの端末だけに保存。</p>
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
async function makeWeeklyMenu(start, style = "watercolor", prompt = "") {
  if (weeklyBusy || !API_BASE_URL) return;
  const stamps = weekStamps(start), r = weekResult(stamps);
  if (!r.complete) return;
  const days = stamps.filter((s) => s.kind === "photo");
  weeklyBusy = start; weeklyError = ""; menuSetup = null; render();
  try {
    const servings = dailyProfile().servings || 2;
    const photos = await Promise.all(days.map(async (s) => ({ mimeType: "image/jpeg", data: (await shrinkPhoto(s.photo)).split(",")[1], dish: s.dish, ingredients: ingredientLines(s.recipe), servings: s.servings || servings })));
    const response = await fetchWithTimeout(`${API_BASE_URL}/api/weekly/menu`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ style, prompt, photos }) }, 240_000);
    const data = await response.json().catch(() => ({}));
    if (data.tickets) setTickets(data.tickets);
    if (!response.ok || data.images?.length !== days.length) {
      if (data.error?.code === "no_tickets") openTicketSheet();
      throw new Error(data.error?.message || "メニューにできませんでした。チケットは戻しました。");
    }
    const before = cookStats();
    const entry = { id: start, style: MENU_STYLES[data.style] ? data.style : style, total: r.target, prompt,
      days: days.map((s, i) => ({ date: s.date, dish: s.dish, minutes: num(s.recipe?.planning?.minutes, 1, 600), kcal: num(data.notes?.[i]?.kcal, 30, 3000), yen: num(data.notes?.[i]?.yen, 10, 5000), copy: String(data.notes?.[i]?.copy || "").slice(0, 24) })),
      art: data.images.map((i) => `data:${i.mimeType};base64,${i.data}`), at: nowIso() };
    state.menuAlbum = [entry, ...(state.menuAlbum || []).filter((e) => menuKey(e) !== menuKey(entry))].slice(0, ALBUM_MAX);
    saveMenuOpts({ style: entry.style });
    trackDaily("weekly_menu", { style: entry.style, days: days.length, wish: !!prompt });
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

// ── メニューの合成：紙・見出し・一皿ずつの絵と文字・コンプのはんこ・足もと。
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
// 幅に合わせて最大 lines 行に折り返す（日本語は1文字ずつ）。
function wrapText(ctx, text, max, lines = 2) {
  const out = [];
  let cur = "";
  for (const ch of String(text)) {
    if (ctx.measureText(cur + ch).width > max && cur) { out.push(cur); cur = ch; if (out.length === lines) break; }
    else cur += ch;
  }
  if (out.length < lines && cur) out.push(cur);
  const used = out.join("").length;
  if (used < String(text).length) out[out.length - 1] = fitText(ctx, out[out.length - 1] + "…", max);
  return out;
}
const fontOf = (w, px, family) => `${w} ${Math.round(px)}px "${family}", "Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`;
// 並べ方：行ごとの品数。1品だけの行は「絵の横に文字」、2品以上の行は「絵の下に文字」。
const MENU_ROWS = { feed: { 3: [1, 1, 1], 4: [2, 2], 5: [3, 2], 6: [3, 3], 7: [3, 2, 2] }, story: { 3: [1, 1, 1], 4: [1, 1, 1, 1], 5: [2, 2, 1], 6: [2, 2, 2], 7: [2, 2, 2, 1] } };
function menuCells(n, x, y, w, h, story) {
  const rows = MENU_ROWS[story ? "story" : "feed"][n] || Array.from({ length: Math.ceil(n / 2) }, (_, i) => Math.min(2, n - i * 2));
  const weight = rows.map((k) => (k === 1 ? 0.8 : 1)), unit = h / weight.reduce((a, b) => a + b, 0);
  const cells = [];
  let cy = y;
  rows.forEach((k, r) => {
    const ch = unit * weight[r], cw = w / k;
    for (let j = 0; j < k; j += 1) cells.push({ x: x + j * cw, y: cy, w: cw, h: ch, side: k === 1, flip: r % 2 === 1 });
    cy += ch;
  });
  return cells.slice(0, n);
}
// 1行に収まるまで文字を小さくする（下限あり）。
function fitFont(ctx, text, max, weight, px, family, min = 0.6) {
  let size = px;
  ctx.font = fontOf(weight, size, family);
  while (size > px * min && ctx.measureText(text).width > max) { size -= 1; ctx.font = fontOf(weight, size, family); }
  return fitText(ctx, text, max);
}
function menuStreak(start) {
  const weeks = new Set((state.menuAlbum || []).map((e) => e.id));
  let n = 0, w = start;
  while (weeks.has(w)) { n += 1; w = addDays(w, -7); }
  return n;
}
function paper(ctx, W, H, st) {
  ctx.fillStyle = st.paper; ctx.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(90,60,30,0.05)";
  for (let i = 0; i < 2600; i += 1) ctx.fillRect(rnd() * W, rnd() * H, 1.6, 1.6);
  if (st.frame === "grid") {
    ctx.strokeStyle = "rgba(35,70,166,0.09)"; ctx.lineWidth = 2;
    for (let x = 36; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 36; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  } else if (st.frame === "double") {
    ctx.strokeStyle = st.accent; ctx.lineWidth = 6; ctx.strokeRect(26, 26, W - 52, H - 52);
    ctx.lineWidth = 2; ctx.strokeRect(40, 40, W - 80, H - 80);
  } else if (st.frame === "dots") {
    ctx.fillStyle = st.accent; ctx.globalAlpha = 0.12;
    for (let i = 0; i < 90; i += 1) { ctx.beginPath(); ctx.arc(rnd() * W, rnd() * H, 3 + rnd() * 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  } else {
    ctx.strokeStyle = st.sub; ctx.globalAlpha = 0.35; ctx.lineWidth = 3; roundRect(ctx, 30, 30, W - 60, H - 60, 30); ctx.stroke(); ctx.globalAlpha = 1;
  }
}
async function composeMenu(entry, size = "feed", opts = menuOpts()) {
  const [W, H] = MENU_SIZES[size] || MENU_SIZES.feed, story = size === "story";
  const st = MENU_STYLES[entry.style] || MENU_STYLES.watercolor;
  const sp = typeof skillProfile === "function" ? skillProfile() : null, stats = opts.lv ? cookStats() : null, streak = menuStreak(entry.id);
  const handle = String(opts.handle || "").trim().slice(0, 20);
  const sample = ["今週のごはん今週の献立月火水木金土日コンプ連続週品人分平均合計材料費目安約分リピごち", st.title, handle, ...entry.days.flatMap((d) => [d.dish, d.copy])].join("") + "0123456789/〜.,:#@¥kcalLv★WEEKLYMENUthis week's dinner";
  try { await Promise.all([[st.enWeight, st.enFont], [st.jpWeight, st.jpFont], [700, "Zen Maru Gothic"], [900, "Zen Maru Gothic"], [600, "Klee One"]].map(([w, f]) => document.fonts?.load(`${w} 40px "${f}"`, sample))); } catch {}
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  paper(ctx, W, H, st);
  const pad = 72;
  // 見出し
  let y = story ? 150 : 96;
  ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  if (st.en) { ctx.fillStyle = st.accent; ctx.fillText(fitFont(ctx, st.en, W - 360, st.enWeight, st.enFont === "Caveat" ? (story ? 104 : 88) : (story ? 40 : 32), st.enFont, 0.5), W / 2, y + (st.enFont === "Caveat" ? 20 : 0)); y += st.enFont === "Caveat" ? (story ? 74 : 60) : (story ? 70 : 56); }
  if (st.title) { ctx.fillStyle = st.ink; ctx.font = fontOf(st.jpWeight, story ? 76 : 60, st.jpFont); ctx.fillText(st.title, W / 2, y + (story ? 36 : 22)); y += story ? 76 : 58; }
  ctx.fillStyle = st.sub; ctx.font = fontOf(700, story ? 32 : 26, "Zen Maru Gothic"); ctx.fillText(`${weekRange(entry.id)}の晩ごはん`, W / 2, y + (story ? 30 : 22));
  const headerEnd = y + (story ? 76 : 50);
  // 足もとの高さ
  const totals = [];
  const kcals = entry.days.map((d) => d.kcal).filter(Boolean), yens = entry.days.map((d) => d.yen).filter(Boolean);
  if (opts.kcal && kcals.length) totals.push(`平均 約${Math.round(kcals.reduce((a, b) => a + b, 0) / kcals.length)}kcal`);
  if (opts.yen && yens.length) totals.push(`材料費 合計 約¥${yens.reduce((a, b) => a + b, 0).toLocaleString("ja-JP")}`);
  const footH = (story ? 150 : 100) + (totals.length ? (story ? 56 : 44) : 0);
  // 料理
  const imgs = await Promise.all(entry.art.map((a) => loadImage(a)));
  const cells = menuCells(entry.days.length, pad - 16, headerEnd, W - (pad - 16) * 2, H - headerEnd - footH, story);
  entry.days.forEach((d, i) => {
    const c = cells[i], img = imgs[i] || imgs[0];
    const side = c.side;
    const size = side ? Math.min(c.h * 0.96, c.w * 0.5) : Math.min(c.w * 0.9, c.h * 0.6);
    const ix = side ? (c.flip ? c.x + c.w - size : c.x) : c.x + (c.w - size) / 2, iy = side ? c.y + (c.h - size) / 2 : c.y + 4;
    ctx.save();
    ctx.translate(ix + size / 2, iy + size / 2); ctx.rotate((((i * 37) % 7) - 3) * 0.012);
    ctx.globalCompositeOperation = "multiply";
    const s = Math.min(img.width, img.height);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, -size / 2, -size / 2, size, size);
    ctx.restore();
    // 文字
    const tx = side ? (c.flip ? c.x + 8 : ix + size + 18) : c.x + 12, tw = side ? c.w - size - 30 : c.w - 24;
    const fs = side ? Math.max(28, Math.min(48, c.h * 0.13)) : Math.max(24, Math.min(38, c.w * 0.1, c.h * 0.085));
    const wd = WEEK_LETTERS[(new Date(d.date + "T12:00:00").getDay() + 6) % 7];
    ctx.font = fontOf(st.jpWeight, fs, st.jpFont);
    const nameLines = wrapText(ctx, d.dish || "晩ごはん", tw, 2);
    const info = [opts.kcal && d.kcal ? `約${d.kcal}kcal` : "", opts.yen && d.yen ? `約¥${d.yen}` : "", opts.time && d.minutes ? `${d.minutes}分` : ""].filter(Boolean).join(" ・ ");
    const small = Math.round(fs * 0.62);
    // ひとことは、少し小さくして1行に収まるならそのまま（「」だけが次の行に落ちないように）。
    const quote = `「${d.copy}」`;
    ctx.font = fontOf(600, small * 0.85, "Klee One");
    const oneLine = ctx.measureText(quote).width <= tw;
    const copySize = oneLine ? Math.min(small, small * (tw / Math.max(1, ctx.measureText(quote).width)) * 0.85) : small;
    ctx.font = fontOf(600, copySize, "Klee One");
    const copyLines = opts.copy && d.copy ? (oneLine ? [quote] : wrapText(ctx, quote, tw, 2)) : [];
    const tagH = fs * 0.95, blockH = tagH + nameLines.length * fs * 1.22 + (info ? small * 1.6 : 0) + copyLines.length * small * 1.4;
    let ty = side ? c.y + (c.h - blockH) / 2 : iy + size + 8;
    const align = side ? "left" : "center", ax = side ? tx : c.x + c.w / 2;
    ctx.textAlign = align; ctx.textBaseline = "top";
    // 曜日（ノートは #1 のような番号）
    if (st.numbered) {
      ctx.fillStyle = st.accent; ctx.font = fontOf(600, fs * 1.05, "Caveat");
      ctx.fillText(`#${i + 1}  ${wd}`, ax, ty - fs * 0.1);
    } else {
      const r = fs * 0.4, cx = side ? tx + r : ax;
      ctx.fillStyle = st.accent; ctx.beginPath(); ctx.arc(cx, ty + r, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.paper; ctx.font = fontOf(900, r * 1.15, "Zen Maru Gothic"); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(wd, cx, ty + r + 1);
      ctx.textAlign = align; ctx.textBaseline = "top";
    }
    ty += tagH;
    ctx.fillStyle = st.ink; ctx.font = fontOf(st.jpWeight, fs, st.jpFont);
    nameLines.forEach((line) => { ctx.fillText(line, ax, ty); ty += fs * 1.22; });
    // 料理名の下に点線（絵のほうへのばす）
    if (side) {
      ctx.save(); ctx.strokeStyle = st.sub; ctx.globalAlpha = 0.55; ctx.lineWidth = 2; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(c.flip ? tx : tx - 10, ty - fs * 0.12); ctx.lineTo(c.flip ? tx + tw + 14 : tx + tw, ty - fs * 0.12); ctx.stroke(); ctx.restore();
    }
    if (info) { ctx.fillStyle = st.sub; ctx.fillText(fitFont(ctx, info, tw, 700, small, "Zen Maru Gothic"), ax, ty + small * 0.2); ty += small * 1.6; }
    ctx.fillStyle = st.ink; ctx.font = fontOf(600, copySize, "Klee One");
    copyLines.forEach((line) => { ctx.fillText(line, ax, ty); ty += small * 1.4; });
  });
  // コンプのはんこ
  const n = entry.days.length, hx = W - pad - 40, hy = story ? 200 : 128;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-0.2);
  ctx.strokeStyle = st.accent; ctx.fillStyle = st.accent; ctx.globalAlpha = 0.9;
  ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, 62, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 54, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = fontOf(900, 38, "Zen Maru Gothic"); ctx.fillText(`${n}/${entry.total}`, 0, -8);
  ctx.font = fontOf(900, 22, "Zen Maru Gothic"); ctx.fillText("コンプ", 0, 26);
  ctx.restore();
  // 足もと：合計・名前・Lv・ロゴとURL
  let fy = H - footH + (story ? 20 : 10);
  ctx.textBaseline = "middle";
  if (totals.length) {
    ctx.fillStyle = st.sub; ctx.textAlign = "center"; ctx.font = fontOf(700, story ? 30 : 25, "Zen Maru Gothic");
    ctx.fillText(`${n}品 ・ ${totals.join(" ・ ")}（1人分・目安）`, W / 2, fy + 14);
    fy += story ? 56 : 44;
  }
  ctx.strokeStyle = st.sub; ctx.globalAlpha = 0.3; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pad, fy); ctx.lineTo(W - pad, fy); ctx.stroke(); ctx.globalAlpha = 1;
  const ly = fy + (story ? 60 : 44);
  try { const logo = await loadImage("icons/icon-192.png"); drawCover(ctx, logo, pad, ly - 24, 48, 48, 12); } catch {}
  ctx.fillStyle = st.ink; ctx.textAlign = "left"; ctx.font = fontOf(900, 28, "Zen Maru Gothic"); ctx.fillText("リピごち", pad + 60, ly - 9);
  ctx.fillStyle = st.sub; ctx.font = fontOf(700, 18, "Zen Maru Gothic"); ctx.fillText(MENU_URL, pad + 60, ly + 17);
  const who = [opts.name && handle ? `by ${handle}` : "", opts.lv && stats ? `Lv${stats.lv}${sp ? ` ${Skills.stars(sp.level)}` : ""}` : "", opts.lv && streak >= 2 ? `${streak}週連続コンプ` : ""].filter(Boolean);
  if (who.length) {
    ctx.textAlign = "right"; ctx.fillStyle = st.ink; ctx.font = fontOf(st.jpWeight, 30, st.jpFont);
    ctx.fillText(who[0], W - pad, ly - (who.length > 1 ? 12 : 0));
    if (who.length > 1) { ctx.fillStyle = st.accent; ctx.font = fontOf(700, 20, "Zen Maru Gothic"); ctx.fillText(who.slice(1).join(" ・ "), W - pad, ly + 20); }
  }
  return canvas.toDataURL("image/jpeg", 0.9);
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
  const has = { kcal: entry.days.some((d) => d.kcal), yen: entry.days.some((d) => d.yen), time: entry.days.some((d) => d.minutes), copy: entry.days.some((d) => d.copy), name: true, lv: true };
  const sizes = [["feed", "投稿 4:5"], ["story", "ストーリー 9:16"]];
  return `<div class="menu-viewer" role="dialog" aria-modal="true" aria-label="1週間のメニュー"><div class="menu-sheet">
    <div class="menu-top"><div class="segmented" role="group" aria-label="サイズ">${sizes.map(([v, l]) => `<button type="button" class="choice-button" data-action="life-menu-size" data-size="${v}" aria-pressed="${menuView.size === v}">${l}</button>`).join("")}</div><button type="button" class="tk-close" data-action="life-menu-close" aria-label="閉じる">×</button></div>
    <div class="menu-frame is-${menuView.size}">${menuView.url ? `<img src="${escapeAttr(menuView.url)}" alt="1週間のメニュー">` : '<p role="status">仕上げています…</p>'}</div>
    <div class="menu-opts" role="group" aria-label="のせるもの">${MENU_OPTIONS.filter(([k]) => has[k]).map(([k, l]) => `<button type="button" class="opt-chip" data-action="life-menu-opt" data-opt="${k}" aria-pressed="${!!opts[k]}">${l}</button>`).join("")}</div>
    ${opts.name ? `<input class="input menu-name" maxlength="20" placeholder="名前や @アカウント" value="${escapeAttr(opts.handle)}" aria-label="メニューにのせる名前" onchange="menuNameChanged(this.value)">` : ""}
    <div class="menu-actions">${dailyButton("life-menu-share", "📤 シェア", menuView.url ? "" : "disabled", true)}${dailyButton("life-menu-save", "保存", menuView.url ? "" : "disabled")}</div></div></div>`;
}
// ふりかえり：1週間コンプのアルバム。
function renderMenuAlbum() {
  const list = state.menuAlbum || [];
  if (!list.length) return "";
  return `<section class="table-section menu-album"><div class="table-head"><h3>1週間コンプ</h3><small class="muted">この端末だけに保存</small></div>
    <div class="album-row">${list.map((e) => `<button type="button" class="album-tile" data-action="life-menu-open" data-key="${escapeAttr(menuKey(e))}" aria-label="${escapeAttr(`${weekRange(e.id)}のメニュー`)}" style="--paper:${MENU_STYLES[e.style].paper}"><span class="album-art">${e.art.slice(0, 4).map((a) => `<img src="${escapeAttr(a)}" alt="" loading="lazy">`).join("")}</span><small>${weekRange(e.id)}・${MENU_STYLES[e.style].label}</small></button>`).join("")}</div></section>`;
}
const menuCompDone = () => (state.menuAlbum || []).length > 0 || [mondayOf(today()), addDays(mondayOf(today()), -7)].some((w) => weekResult(weekStamps(w)).complete);
function handleWeeklyAction(action, data) {
  if (!action.startsWith("life-menu")) return false;
  if (action === "life-menu-setup") { weeklyError = ""; menuView = null; menuSetup = { week: data.week, style: menuOpts().style, prompt: "" }; render(); }
  else if (action === "life-menu-style" && menuSetup) { readWish(); menuSetup.style = MENU_STYLES[data.style] ? data.style : "watercolor"; render(); }
  else if (action === "life-menu-wish" && menuSetup) { readWish(); const w = data.wish; if (!menuSetup.prompt.includes(w)) menuSetup.prompt = [menuSetup.prompt, w].filter(Boolean).join("、").slice(0, 60); render(); }
  else if (action === "life-menu-make" && menuSetup) { readWish(); makeWeeklyMenu(menuSetup.week, menuSetup.style, menuSetup.prompt); }
  else if (action === "life-menu-open") showMenu(data.key, "feed");
  else if (action === "life-menu-size" && menuView) showMenu(menuView.key, data.size === "story" ? "story" : "feed");
  else if (action === "life-menu-opt" && menuView && MENU_OPTIONS.some(([k]) => k === data.opt)) { const o = menuOpts(); saveMenuOpts({ [data.opt]: !o[data.opt] }); showMenu(menuView.key, menuView.size); }
  else if (action === "life-menu-close") { menuView = null; menuSetup = null; render(); }
  else if (action === "life-menu-share") shareMenu();
  else if (action === "life-menu-save") saveMenu();
  return true;
}
