/* 📮 わたしの食卓レビュー（APP_MAP §82。2026-11-24 のユーザーの判断）
   ふりかえりの「わたしの食卓」から、期間（2026年・今週・1か月）を選び、表紙の一皿を選んで、SNS に出せる縦長の画像を作る。
   主役は「絵（色鉛筆のイラスト）」と「ひとこと」。数字は1行の補足。％・連続・前より減ったは出さない（記録していない日を失敗に見せない）。
   - 数えるのは端末の記録（state.evaluations）だけ。AI は写真を色鉛筆の絵にする時だけ（お試し合計3枚・サーバーが数える）
   - 画像に描くのは、同じ場所の絵（assets/）・端末の写真・AI の絵（サーバーから受け取って端末に置いたもの）だけ（外の画像は書き出せない）
   - 家族の名前・メモ・評価・撮影日時は描かない
   判定は純粋な関数（Node のテストでも使う）、画面はその下。 */
(function (root) {
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return iso(d); };
  const dayOf = (e) => String(e?.cookedAt || "").slice(0, 10);
  const validDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const between = (a, b) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000);

  // 期間：今週はレシートと同じ（金〜日は今週、月〜木は先週）。1か月は暦の月（今月）。2026年は暦の年（今日まで）。
  function periods(now) {
    const d = new Date(`${now}T12:00:00`).getDay();
    const monday = addDays(now, -((d + 6) % 7));
    const week = d >= 5 || d === 0 ? { start: monday, end: now, word: "今週" } : { start: addDays(monday, -7), end: addDays(monday, -1), word: "先週" };
    const y = now.slice(0, 4), m = Number(now.slice(5, 7));
    return [
      { key: "year", start: `${y}-01-01`, end: now, title: `${y}年のわたしの食卓`, chip: `${y}年` },
      { key: "month", start: `${now.slice(0, 7)}-01`, end: now, title: `${m}月のわたしの食卓`, chip: `${m}月` },
      { key: "week", start: week.start, end: week.end, title: `${week.word}の夜ごはん`, chip: week.word },
    ];
  }
  // 期間の記録（デモ・日付のないものは除く。同じ記録は1回だけ）
  function records(evaluations, period) {
    const seen = new Set();
    return (evaluations || []).filter((e) => {
      const day = dayOf(e);
      if (!e || !validDay(day) || String(e.id || "").startsWith("demo-") || day < period.start || day > period.end) return false;
      const k = e.id || `${day}|${e.recipeId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  // 料理（親）の名前でまとめる鍵：同じ料理の別の作り方も「はじめて」にしない
  const dishKey = (r, e) => String(r?.dish || r?.title || e?.recipeTitle || e?.recipeId || "").replace(/\s+/g, "");
  const VEG = /野菜|きのこ/;

  // まとめ。recipeOf(e) → レシピ、lovers(recipe) → 「明日でも／毎週」の人数（いちばん新しい評価）、members → 評価する人の数
  function summarize({ evaluations = [], period, recipeOf = () => null, lovers = () => 0, members = 1 } = {}) {
    const list = records(evaluations, period).sort((a, b) => String(b.cookedAt).localeCompare(String(a.cookedAt)));
    const before = (evaluations || []).filter((e) => e && validDay(dayOf(e)) && dayOf(e) < period.start && !String(e.id || "").startsWith("demo-"));
    const pastKeys = new Set(before.map((e) => dishKey(recipeOf(e), e)));
    const items = new Map();
    for (const e of list) {
      const r = recipeOf(e) || { id: e.recipeId, title: e.recipeTitle || "", ingredients: [] };
      const k = e.recipeId || dishKey(r, e);
      const it = items.get(k) || { key: k, recipe: r, records: [], times: 0, love: lovers(r), photo: "" };
      it.records.push(e); it.times += 1;
      if (!it.photo && typeof e.photo === "string" && e.photo.startsWith("data:image/")) it.photo = e.id;
      items.set(k, it);
    }
    const all = [...items.values()];
    const days = new Set(list.map(dayOf)).size;
    const firstKeys = new Set(all.filter((it) => !pastKeys.has(dishKey(it.recipe, it.records[0]))).map((it) => dishKey(it.recipe, it.records[0])));
    // おかえり：期間の中で、前に作った日から28日以上あいて戻ってきた料理（いちばん長くあいたもの）
    let welcome = null;
    for (const it of all) {
      const mine = (evaluations || []).filter((e) => e && (e.recipeId === it.key || dishKey(recipeOf(e), e) === dishKey(it.recipe, it.records[0])) && validDay(dayOf(e))).map(dayOf).sort();
      for (let i = 1; i < mine.length; i++) {
        const gap = between(mine[i - 1], mine[i]);
        if (mine[i] >= period.start && mine[i] <= period.end && gap >= 28 && (!welcome || gap > welcome.days)) welcome = { title: it.recipe.title, days: gap };
      }
    }
    const minutes = (r) => Number(r?.minutes ?? r?.planning?.minutes ?? r?.time);
    const quick = list.filter((e) => { const m = minutes(recipeOf(e)); return m > 0 && m <= 15; }).length;
    const veg = new Set();
    for (const it of all) for (const i of it.recipe.ingredients || []) {
      const name = Array.isArray(i) ? i[0] : i?.name, cat = Array.isArray(i) ? i[2] : i?.category;
      if (name && VEG.test(String(cat || ""))) veg.add(String(name).replace(/[（(].*$/, ""));
    }
    const loved = all.filter((it) => it.love > 0);
    const together = members >= 2 ? all.filter((it) => it.love >= members).length : 0;
    return { count: list.length, days, kinds: all.length, items: all, firstTimes: firstKeys.size, welcome, quick, veg: veg.size, loved: loved.length, together, empty: !list.length };
  }
  // 表紙のおすすめ：今週＝また食べたい → 新しい順／1か月＝作った回数／2026年＝また食べたい × 回数
  function recommend(periodKey, items) {
    const list = [...(items || [])];
    if (!list.length) return null;
    const score = { week: (it) => it.love * 10 + it.times, month: (it) => it.times * 10 + it.love, year: (it) => it.love * 3 + it.times * 2 }[periodKey] || ((it) => it.times);
    // 写真がある料理を少しだけ先に（自分の食卓らしさ）
    return list.map((it, i) => ({ it, s: score(it) + (it.photo ? 0.5 : 0) - i * 0.001 })).sort((a, b) => b.s - a.s)[0].it;
  }
  // ひとこと（1行）。期間ごとに先に見る種類を変える。どれも「家庭的な一面」：がんばりだけでなく上手に手を抜くことも
  function phrase(periodKey, s, { solo = true } = {}) {
    if (!s || s.empty) return "";
    const c = {
      welcome: s.welcome && `おかえり、${s.welcome.title}。${s.welcome.days >= 56 ? `${Math.round(s.welcome.days / 7)}週間` : `${s.welcome.days}日`}ぶり`,
      together: !solo && s.together >= 1 && `ふたりの「また食べたい」が${s.together}皿`,
      loved: s.loved >= 2 && `「また食べたい」が${s.loved}皿`,
      quick: s.quick >= 2 && `15分ごはんに助けられた夜が${s.quick}回`,
      first: s.firstTimes >= 2 && `はじめての料理に${s.firstTimes}回`,
      veg: s.veg >= 5 && `${s.veg}種類の野菜を使いました`,
    };
    const order = { week: ["together", "quick", "loved", "welcome", "first", "veg"], month: ["welcome", "first", "together", "quick", "loved", "veg"], year: ["together", "first", "welcome", "veg", "loved", "quick"] }[periodKey] || ["first"];
    for (const k of order) if (c[k]) return c[k];
    return s.count === 1 ? "この一皿から、わたしの食卓" : `${s.count}回の夜ごはん、おつかれさま`;
  }
  const numbers = (s) => (s && !s.empty ? `${s.count}皿・${s.kinds}種類` : "");
  // 共通の色鉛筆の絵（最初から入っている48品。assets/illust/<id>.webp）
  const SHARED = new Set(Array.from({ length: 48 }, (_, i) => `starter-${51 + i}`));
  const sharedIllust = (recipe) => { const id = [recipe?.id, recipe?.starterId].find((x) => SHARED.has(String(x || ""))); return id ? `assets/illust/${id}.webp` : ""; };
  const api = { periods, records, summarize, recommend, phrase, numbers, sharedIllust };
  root.TableReview = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);

/* ---- 画面（ブラウザのみ） ---- */
let reviewView = null; // { period, cover（記録ID）, art: "pencil"|"photo"|"app", showName, busy, error }
let reviewTrial = null; // サーバーの { used, total, left, paused }
let reviewOut = { key: "", file: null, url: "" };
const ILLUST_STORE = "ripigochi-illust";
const illustCache = () => { try { return JSON.parse(localStorage.getItem(ILLUST_STORE) || "{}") || {}; } catch { return {}; } };
function saveIllust(recordId, dataUrl) {
  // 作った絵は端末だけに置く（同期しない）。古いものから消して6枚まで（容量を食わないように）。
  const all = illustCache();
  all[recordId] = { url: dataUrl, at: Date.now() };
  const keep = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 6);
  try { localStorage.setItem(ILLUST_STORE, JSON.stringify(Object.fromEntries(keep))); } catch {}
}
const reviewRecipeOf = (e) => recipeById(e.recipeId) || Lifestyle.curated.find((c) => c.id === e.recipeId) || { id: e.recipeId, title: e.recipeTitle || "わが家の一皿", ingredients: [] };
function reviewData() {
  const ps = TableReview.periods(today());
  const period = ps.find((p) => p.key === reviewView.period) || ps[0];
  const names = typeof raterNames === "function" ? raterNames() : [];
  const lovers = (r) => Object.values(recipeRatings(r)).filter((c) => c === "weekly" || c === "tomorrow").length;
  const s = TableReview.summarize({ evaluations: state.evaluations, period, recipeOf: reviewRecipeOf, lovers, members: Math.max(1, names.length) });
  const cover = s.items.find((it) => it.records.some((e) => e.id === reviewView.cover)) || TableReview.recommend(period.key, s.items);
  return { ps, period, s, cover, solo: names.length < 2 };
}
const recordOf = (id) => state.evaluations.find((e) => e.id === id);
// 表紙の絵の候補：AI の色鉛筆（作った絵）・共通の色鉛筆・写真・アプリの絵
function coverArts(cover) {
  if (!cover) return {};
  const photoRec = cover.records.find((e) => isDataPhoto(e.photo));
  const made = cover.records.map((e) => illustCache()[e.id]).find(Boolean);
  const app = cardImageInfo(cover.recipe).url;
  const t = Lifestyle.traits(cover.recipe || {});
  return {
    illust: made?.url || "",
    shared: TableReview.sharedIllust(cover.recipe),
    photo: photoRec?.photo || "",
    photoId: photoRec?.id || "",
    app: /^assets\//.test(app) && !/photo-unavailable/.test(app) ? app : `assets/dishes/fallback-${{ rice: "rice", noodle: "noodle", bread: "bread" }[t.staple] || "okazu"}.webp`,
  };
}
function chosenArt(arts) {
  const art = reviewView.art;
  if (art === "photo" && arts.photo) return { src: arts.photo, ai: false };
  if (art === "app") return { src: arts.app, ai: false };
  if (arts.illust) return { src: arts.illust, ai: true };
  if (arts.shared) return { src: arts.shared, ai: true };
  if (arts.photo) return { src: arts.photo, ai: false };
  return { src: arts.app, ai: false };
}
function openTableReview() {
  reviewView = { period: "year", cover: "", art: "pencil", showName: true, busy: "", error: "" };
  reviewOut = { key: "", file: null, url: "" };
  if (API_BASE_URL && typeof ticketHeaders === "function") {
    fetch(`${API_BASE_URL}/api/illust`, { headers: ticketHeaders() }).then((r) => (r.ok ? r.json() : null)).then((v) => { if (v && reviewView) { reviewTrial = v; render(); } }).catch(() => {});
  }
}
function closeTableReview() {
  if (reviewOut.url) URL.revokeObjectURL(reviewOut.url);
  reviewView = null; reviewOut = { key: "", file: null, url: "" };
  document.body?.classList?.remove("has-sheet");
}
function renderTableReview() {
  if (!reviewView) return "";
  const { ps, period, s, cover, solo } = reviewData();
  const chips = ps.map((p) => `<button type="button" class="chip-button" data-action="review-period" data-period="${p.key}" aria-pressed="${p.key === period.key}">${escapeHtml(p.chip)}</button>`).join("");
  let body;
  if (s.empty) {
    body = `<div class="tr-empty">${yohaku("bowl")}<p>この期間の記録は、まだありません。</p><p class="muted small">「作った」を押すと、ここで1枚にできます。</p></div>`;
  } else {
    const arts = coverArts(cover);
    const thumbs = s.items.slice(0, 12).map((it) => {
      const id = it.records[0].id;
      const on = it === cover;
      return `<button type="button" class="tr-pick" data-action="review-cover" data-id="${escapeAttr(id)}" aria-pressed="${on}" aria-label="${escapeAttr(`${it.recipe.title}を表紙にする`)}">${isDataPhoto(recordOf(it.photo)?.photo) ? `<img src="${escapeAttr(recordOf(it.photo).photo)}" alt="">` : dishTile(it.recipe)}</button>`;
    }).join("");
    const left = reviewTrial ? reviewTrial.left : null;
    const canDraw = !!(API_BASE_URL && arts.photo && !arts.illust && (left === null || left > 0) && !reviewTrial?.paused);
    const artBtn = (key, label, ok) => (ok ? `<button type="button" class="chip-button" data-action="review-art" data-art="${key}" aria-pressed="${reviewView.art === key}">${label}</button>` : "");
    const drawBtn = canDraw && !reviewView.busy ? `<button type="button" class="primary-button tr-draw" data-action="review-draw">🖍 写真を色鉛筆に${left !== null ? `（お試し のこり${left}枚）` : ""}</button>` : "";
    const used = arts.photo && !arts.illust && left === 0 ? `<p class="muted small">色鉛筆のお試し（${reviewTrial.total}枚）は使い切りました。写真・アプリの絵で作れます。</p>` : "";
    const ready = reviewOut.url && !reviewView.busy;
    body = `<p class="tr-label">表紙の一皿</p><div class="tr-picks">${thumbs}</div>
      <div class="tr-arts" role="group" aria-label="絵">${artBtn("pencil", "🖍 色鉛筆", arts.illust || arts.shared)}${artBtn("photo", "📷 写真", arts.photo)}${artBtn("app", "🖼 アプリの絵", true)}<label class="tr-name"><input type="checkbox" data-action="review-name" ${reviewView.showName ? "checked" : ""}> 料理名</label></div>
      ${drawBtn}${used}
      <div class="tr-preview">${reviewView.busy === "drawing" ? `<div class="tr-wait">${yohaku("wait")}<p>色鉛筆で描いています…</p><small>10〜20秒ほど</small></div>` : ready ? `<img src="${escapeAttr(reviewOut.url)}" alt="${escapeAttr(`${period.title}の画像`)}">` : `<div class="tr-wait"><p>画像を作っています…</p></div>`}</div>
      ${reviewView.error ? `<p class="tr-error" role="alert">${escapeHtml(reviewView.error)}</p>` : ""}
      <div class="tr-actions"><button type="button" class="primary-button" data-action="review-share" ${ready ? "" : "disabled"}>📤 シェア</button><button type="button" class="secondary-button" data-action="review-save" ${ready ? "" : "disabled"}>⬇ 保存</button><button type="button" class="text-button" data-action="review-copy">🔗 文をコピー</button></div>
      <p class="muted small">家族の名前・メモ・評価は画像に入りません。</p>`;
    queueMicrotask(() => buildReviewImage().catch(() => {}));
  }
  return `<div class="tr-overlay" role="dialog" aria-modal="true" aria-label="わたしの食卓レビュー"><div class="tr-backdrop" data-action="review-close"></div><section class="tr-sheet">
    <header class="tr-head"><h3>📮 わたしの食卓レビュー</h3><button type="button" class="round-icon" data-action="review-close" aria-label="閉じる">×</button></header>
    <div class="tr-periods" role="group" aria-label="期間">${chips}</div>${body}</section></div>`;
}
// ---- 画像づくり（1080×1920）。プレビューの時に作っておき、📤 を押したらすぐ共有する（iPhone の Safari は、押してから待つと共有を断る）
const loadImg = (src) => new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ng; im.decoding = "async"; im.src = src; });
function wrapText(ctx, text, maxWidth) {
  const lines = []; let line = "";
  for (const ch of String(text)) { if (ctx.measureText(line + ch).width > maxWidth && line) { lines.push(line); line = ch; } else line += ch; }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
async function buildReviewImage() {
  if (!reviewView || reviewView.busy === "drawing") return;
  const { period, s, cover, solo } = reviewData();
  if (!cover) return;
  const art = chosenArt(coverArts(cover));
  const line = TableReview.phrase(period.key, s, { solo });
  const key = JSON.stringify([period.key, period.start, period.end, cover.key, art.src.length, art.src.slice(-40), reviewView.showName, line, s.count, s.kinds]);
  if (reviewOut.key === key) return;
  reviewOut.key = key;
  const W = 1080, H = 1920, font = `"Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP","Yu Gothic",sans-serif`;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fbf6ec"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#3b2f25"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
  ctx.font = `700 64px ${font}`; ctx.fillText(period.title, W / 2, 170);
  ctx.fillStyle = "#8a7a68"; ctx.font = `400 34px ${font}`;
  const first = s.items.flatMap((it) => it.records).map((e) => e.cookedAt.slice(0, 10)).sort()[0] || period.start;
  const range = `${formatDate(period.key === "year" ? first : period.start)}〜${formatDate(period.end)}`;
  ctx.fillText(range, W / 2, 225);
  // 読めなかったら、アプリの絵にする（その時は「AIイラスト」の印も付けない）
  let img, ai = art.ai;
  try { img = await loadImg(art.src); } catch { ai = false; img = await loadImg(coverArts(cover).app).catch(() => null); }
  const S = 900, X = (W - S) / 2, Y = 280;
  ctx.save(); roundRect(ctx, X, Y, S, S, 36); ctx.clip();
  ctx.fillStyle = "#efe6d6"; ctx.fillRect(X, Y, S, S);
  if (img) { const k = Math.max(S / img.width, S / img.height); const w = img.width * k, h = img.height * k; ctx.drawImage(img, X + (S - w) / 2, Y + (S - h) / 2, w, h); }
  ctx.restore();
  if (ai && img) { ctx.fillStyle = "rgba(255,255,255,.82)"; roundRect(ctx, X + S - 180, Y + S - 58, 160, 40, 20); ctx.fill(); ctx.fillStyle = "#6b5b4b"; ctx.font = `400 24px ${font}`; ctx.fillText("AIイラスト", X + S - 100, Y + S - 30); }
  let y = Y + S + 90;
  ctx.fillStyle = "#3b2f25";
  if (reviewView.showName && cover.recipe.title) { ctx.font = `700 50px ${font}`; for (const l of wrapText(ctx, cover.recipe.title, 900).slice(0, 2)) { ctx.fillText(l, W / 2, y); y += 64; } y += 20; }
  ctx.font = `700 56px ${font}`; ctx.fillStyle = "#b5532f";
  for (const l of wrapText(ctx, line, 940)) { ctx.fillText(l, W / 2, y); y += 74; }
  ctx.fillStyle = "#8a7a68"; ctx.font = `400 38px ${font}`; ctx.fillText(TableReview.numbers(s), W / 2, y + 10);
  // 下：よはく・アプリの名前（検索で見つかる名前）
  const yo = await loadImg(`assets/yohaku/happy.webp`).catch(() => null);
  if (yo) ctx.drawImage(yo, 90, H - 260, 170, 170 * (yo.height / yo.width));
  ctx.textAlign = "left"; ctx.fillStyle = "#3b2f25"; ctx.font = `700 60px ${font}`; ctx.fillText("リピごち", 300, H - 170);
  ctx.fillStyle = "#8a7a68"; ctx.font = `400 30px ${font}`; ctx.fillText("「今日なに食べる？」を、過去の食卓から。", 300, H - 118);
  const blob = await new Promise((ok) => c.toBlob(ok, "image/png"));
  if (!blob || reviewOut.key !== key) return;
  if (reviewOut.url) URL.revokeObjectURL(reviewOut.url);
  reviewOut = { key, file: new File([blob], `ripigochi-${period.key}.png`, { type: "image/png" }), url: URL.createObjectURL(blob) };
  if (reviewView) render();
}
const reviewLink = () => { try { return new URL("lp/?from=review", location.href.split(/[?#]/)[0].replace(/[^/]*$/, "")).href; } catch { return "https://165cm.github.io/matagochi/lp/?from=review"; } };
const reviewText = () => { const { period } = reviewData(); return `${period.title} 🍳\n#リピごち\n${reviewLink()}`; };
// 写真を縮めて送る（1MB 以下・1024px）
async function photoForIllust(dataUrl) {
  const im = await loadImg(dataUrl);
  const k = Math.min(1, 1024 / Math.max(im.width, im.height));
  const c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
async function drawIllustForCover() {
  const { cover } = reviewData();
  const arts = coverArts(cover);
  if (!arts.photo || reviewView.busy) return;
  reviewView.busy = "drawing"; reviewView.error = ""; render();
  try {
    const res = await fetch(`${API_BASE_URL}/api/illust`, { method: "POST", headers: { "Content-Type": "application/json", ...ticketHeaders() }, body: JSON.stringify({ image: { mimeType: "image/jpeg", data: await photoForIllust(arts.photo) }, dish: cover.recipe.title || "" }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || "イラストを描けませんでした。");
    // 受け取った絵は小さくして端末に置く（800px の WebP）
    const im = await loadImg(`data:${body.image.mimeType};base64,${body.image.data}`);
    const c = document.createElement("canvas"); c.width = c.height = Math.min(800, im.width);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    saveIllust(arts.photoId, c.toDataURL("image/webp", 0.86));
    reviewTrial = { ...(reviewTrial || {}), left: body.left, total: body.total };
    if (reviewView) reviewView.art = "pencil";
  } catch (error) {
    if (reviewView) reviewView.error = String(error?.message || "イラストを描けませんでした。");
  }
  if (reviewView) { reviewView.busy = ""; render(); }
}
async function shareReview() {
  const file = reviewOut.file;
  if (!file) return;
  const data = { files: [file], text: reviewText() };
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share(data); return; }
  } catch (error) { if (error?.name === "AbortError") return; }
  saveReview();
}
function saveReview() {
  if (!reviewOut.url) return;
  const a = document.createElement("a");
  a.href = reviewOut.url; a.download = reviewOut.file?.name || "ripigochi.png"; a.target = "_blank"; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  showToast("保存できない時は、画像を長押しして「写真に保存」");
}
function handleTableReviewAction(action, data) {
  if (action === "review-open") { openTableReview(); render(); return true; }
  if (!reviewView) return false;
  if (action === "review-close") { closeTableReview(); render(); return true; }
  if (action === "review-period") { reviewView.period = data.period; reviewView.cover = ""; reviewView.error = ""; render(); return true; }
  if (action === "review-cover") { reviewView.cover = data.id; reviewView.error = ""; render(); return true; }
  if (action === "review-art") { reviewView.art = data.art; render(); return true; }
  if (action === "review-name") { reviewView.showName = !reviewView.showName; render(); return true; }
  if (action === "review-draw") { drawIllustForCover(); return true; }
  if (action === "review-share") { shareReview(); return true; }
  if (action === "review-save") { saveReview(); return true; }
  if (action === "review-copy") {
    navigator.clipboard?.writeText(reviewText()).then(() => showToast("📋 コピーしました。投稿に貼ってください"), () => showToast("コピーできませんでした"));
    return true;
  }
  return false;
}
// Esc で閉じる（開いている時だけ）
if (typeof document !== "undefined") document.addEventListener?.("keydown", (ev) => { if (ev.key === "Escape" && reviewView) { closeTableReview(); render(); } });
