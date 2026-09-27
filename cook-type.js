/* ごはんタイプ診断（自炊の傾向）：① 先週のごはん日記（7日を1タップずつ）＋ ② 仕上がりが変わる一皿（チャーハンを作る4問）。
   3つの軸（定番/挑戦・こってり/あっさり・時短/じっくり）で8タイプ。結果は属性×職業のキャラクターカード。 */
const DIARY_GENRES = [
  { id: "don", icon: "🍚", label: "丼もの", k: 1, q: 1, taste: "和風" },
  { id: "noodle", icon: "🍜", label: "麺類", k: 0, q: 1, taste: "" },
  { id: "stirfry", icon: "🍳", label: "炒めもの", k: 1, q: 1, taste: "中華風" },
  { id: "washoku", icon: "🐟", label: "焼き魚・和食", k: -1, q: 0, taste: "和風" },
  { id: "nimono", icon: "🍲", label: "煮もの・鍋", k: -1, q: -1, taste: "和風" },
  { id: "fry", icon: "🍤", label: "揚げもの", k: 2, q: -1, taste: "" },
  { id: "western", icon: "🍝", label: "パスタ・洋食", k: 1, q: 0, taste: "洋風" },
  { id: "chinese", icon: "🥟", label: "中華・エスニック", k: 1, q: 0, taste: "中華風" },
  { id: "eatout", icon: "🍽", label: "外食", k: 0, q: 1, out: true },
  { id: "deli", icon: "🍱", label: "お惣菜・お弁当", k: 0, q: 2, out: true },
  { id: "unknown", icon: "❓", label: "覚えていない", k: 0, q: 0, skip: true },
];
const GENRE_OF = Object.fromEntries(DIARY_GENRES.map((g) => [g.id, g]));
const DIARY_DAYS = [1, 2, 3, 4, 5, 6, 0]; // 月〜日
// 仕上がりが変わる一皿：答えるたびにチャーハンが変わる。
const DISH_QUESTIONS = [
  { id: "flavor", q: "味つけは？", options: [["k", "🧄 こってり", "ラード・オイスターソース"], ["a", "🧂 あっさり", "塩・だし"]] },
  { id: "topping", q: "具は？", options: [["r", "🥚 いつもの", "卵・ねぎ・チャーシュー"], ["c", "🧀 意外な組み合わせ", "キムチ・チーズ・パクチー"]] },
  { id: "time", q: "作り方は？", options: [["q", "⚡ 5分で一気に", "強火でまとめて炒める"], ["s", "🕰 20分じっくり", "具を別に炒めて、パラパラに"]] },
  { id: "finish", q: "仕上げは？", options: [["k", "🍳 目玉焼きのせ", "黄身をからめて"], ["a", "🌿 ねぎとごま", "香りでさっぱり"]] },
];
const COOK_TYPES = {
  RKQ: { el: "⚡", element: "雷", name: "雷速の丼ソードマン", catch: "迷わず斬る、いつもの一杯。", move: "丼もの" },
  RKS: { el: "🔥", element: "炎", name: "炎の煮込みナイト", catch: "鍋を守る、こってりの騎士。", move: "煮込み" },
  RAQ: { el: "💧", element: "水", name: "水流の和食シーフ", catch: "さっと仕上げる、やさしい定番。", move: "焼き魚・和食" },
  RAS: { el: "🌿", element: "森", name: "出汁の森ヒーラー", catch: "滋味で、みんなを回復させる。", move: "煮もの・汁もの" },
  CKQ: { el: "🌪", element: "風", name: "疾風のスパイスハンター", catch: "新しい辛さを、狩りにいく。", move: "スパイス炒め" },
  CKS: { el: "🌋", element: "溶岩", name: "灼熱の中華バーサーカー", catch: "強火と油で、暴れまくる。", move: "中華" },
  CAQ: { el: "❄️", element: "氷", name: "氷刃のレンジ魔導士", catch: "レンジ一閃、未知の一皿。", move: "サラダ・エスニック" },
  CAS: { el: "✨", element: "光", name: "光の彩り錬金術師", catch: "素材を、輝きに変える。", move: "彩りプレート" },
};
const STAT_NAMES = [["fire", "火力"], ["speed", "時短"], ["thrift", "節約"], ["health", "健康"], ["adventure", "冒険心"]];

function lastWeekDates(from = today()) {
  let mon = addDays(from, -7);
  while (dow(mon) !== 1) mon = addDays(mon, -1);
  return DIARY_DAYS.map((_, k) => addDays(mon, k));
}
const diaryOf = (p) => (p.diary && typeof p.diary === "object" ? p.diary : {});
const dishOf = (p) => (p.dish && typeof p.dish === "object" ? p.dish : {});
const diaryDone = (p) => lastWeekDates().every((d) => diaryOf(p)[d]) || Object.keys(diaryOf(p)).length >= 7;
const dishDone = (p) => DISH_QUESTIONS.every((q) => dishOf(p)[q.id]);

// ① 先週のごはん日記：1日ずつ、1タップで。
function renderDiaryStep(p) {
  const dates = lastWeekDates();
  const diary = diaryOf(p);
  const current = dates.find((d) => !diary[d]);
  const strip = `<ol class="diary-week">${dates.map((d) => `<li class="${d === current ? "is-now" : diary[d] ? "is-done" : ""}"><small>${WD[dow(d)]}</small><span>${diary[d] ? GENRE_OF[diary[d]]?.icon || "・" : d === current ? "？" : ""}</span></li>`).join("")}</ol>`;
  if (!current) {
    const cooked = dates.map((d) => GENRE_OF[diary[d]]).filter((g) => g && !g.out && !g.skip);
    return `${strip}<p class="diary-summary">先週は <b>${cooked.length}日</b> 自炊。${cooked.length ? `いちばん多かったのは <b>${escapeHtml(topGenre(p)?.label || "")}</b>。` : ""}</p><button type="button" class="text-button" data-action="life-diary-reset">やりなおす</button>`;
  }
  const m = Number(current.slice(5, 7)), d = Number(current.slice(8, 10));
  return `${strip}<p class="diary-q"><small>${m}/${d}</small> 先週の<b>${WD[dow(current)]}曜の夜</b>は、何を食べた？</p>
    <div class="diary-grid">${DIARY_GENRES.map((g) => `<button type="button" class="diary-tile${g.skip ? " is-skip" : ""}" data-action="life-diary" data-date="${current}" data-genre="${g.id}"><span aria-hidden="true">${g.icon}</span>${escapeHtml(g.label)}</button>`).join("")}</div>
    <p class="muted small">📸 スマホの写真アプリで、先週の写真を見ると思い出しやすいですよ。${Object.keys(diary).length ? ' <button type="button" class="link-inline" data-action="life-diary-undo">ひとつ戻す</button>' : ""}</p>`;
}
function topGenre(p) {
  const counts = {};
  Object.values(diaryOf(p)).forEach((id) => { const g = GENRE_OF[id]; if (g && !g.out && !g.skip) counts[id] = (counts[id] || 0) + 1; });
  const [id] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
  return id ? GENRE_OF[id] : null;
}

// ② 仕上がりが変わる一皿（チャーハン）。
function dishName(dish) {
  return `${dish.time === "s" ? "じっくりパラパラ" : dish.time === "q" ? "強火一気の" : ""}${dish.flavor === "k" ? "こってり" : dish.flavor === "a" ? "塩だし" : ""}${dish.topping === "c" ? "キムチーズ" : dish.topping === "r" ? "王道" : ""}チャーハン${dish.finish === "k" ? "・目玉焼きのせ" : dish.finish === "a" ? "・ねぎごま" : ""}`;
}
function renderDishArt(dish) {
  const rice = dish.flavor === "k" ? "#c98a45" : dish.flavor === "a" ? "#f2dc92" : "#ecd7a6";
  const tops = dish.topping === "c" ? ["🧀", "🌶️", "🌿"] : dish.topping === "r" ? ["🥚", "🧅", "🥓"] : [];
  return `<div class="dish-art${dish.time ? ` is-${dish.time}` : ""}" aria-hidden="true">
    <div class="da-plate"><div class="da-rice" style="--rice:${rice}"></div>${tops.map((t, k) => `<span class="da-top t${k}">${t}</span>`).join("")}${dish.finish === "k" ? '<span class="da-egg">🍳</span>' : dish.finish === "a" ? '<span class="da-herb">🌿</span>' : ""}</div>
    ${dish.time === "q" ? '<span class="da-fx">🔥</span>' : dish.time === "s" ? '<span class="da-fx">✨</span>' : ""}</div>`;
}
function renderDishStep(p) {
  const dish = dishOf(p);
  const q = DISH_QUESTIONS.find((x) => !dish[x.id]);
  const name = dishName(dish);
  if (!q) {
    const r = cookTypeOf(p);
    return `${renderDishArt(dish)}<p class="dish-name">完成！<b>${escapeHtml(name)}</b></p>${r ? renderCookTypeCard(r) : ""}`;
  }
  return `${renderDishArt(dish)}<p class="dish-name">${Object.keys(dish).length ? escapeHtml(name) : "まだ、ただのごはん…"}</p><p class="dish-q"><b>${DISH_QUESTIONS.indexOf(q) + 1} / ${DISH_QUESTIONS.length}</b> ${escapeHtml(q.q)}</p>
    <div class="dish-options">${q.options.map(([v, label, hint]) => `<button type="button" class="funnel-pick" data-action="life-dish" data-q="${q.id}" data-value="${v}"><span>${escapeHtml(label)}<small>${escapeHtml(hint)}</small></span></button>`).join("")}</div>`;
}

// 答えから3つの軸と能力値を出す。
function cookTypeOf(p) {
  const diary = diaryOf(p), dish = dishOf(p);
  if (!dishDone(p)) return null;
  const days = Object.values(diary).map((id) => GENRE_OF[id]).filter((g) => g && !g.skip);
  const cooked = days.filter((g) => !g.out);
  let k = days.reduce((s, g) => s + g.k, 0) / Math.max(1, days.length) * 2 + (dish.flavor === "k" ? 2 : -2) + (dish.finish === "k" ? 1 : -1);
  let q = days.reduce((s, g) => s + g.q, 0) / Math.max(1, days.length) * 2 + (dish.time === "q" ? 2 : -2);
  const variety = new Set(cooked.map((g) => g.id)).size;
  let c = (variety >= 4 ? 2 : variety <= 2 && cooked.length >= 3 ? -2 : 0) + (dish.topping === "c" ? 2 : -2);
  const code = `${c > 0 ? "C" : "R"}${k > 0 ? "K" : "A"}${q >= 0 ? "Q" : "S"}`;
  const clamp = (x) => Math.max(1, Math.min(5, Math.round(x)));
  const out = days.filter((g) => g.out).length;
  const light = cooked.filter((g) => ["washoku", "nimono"].includes(g.id)).length;
  const fried = cooked.filter((g) => ["fry", "stirfry", "chinese"].includes(g.id)).length;
  const stats = { fire: clamp(3 + k / 2 + fried / 3), speed: clamp(3 + q / 2), thrift: clamp(1 + (days.length ? ((days.length - out) / days.length) * 4 : 2)), health: clamp(3 - k / 3 + light / 2), adventure: clamp(3 + c / 1.5) };
  const top = topGenre(p);
  return { code, ...COOK_TYPES[code], stats, move: top ? top.label : COOK_TYPES[code].move, dish: dishName(dish) };
}
// 献立に使う好みの味（先週よく食べたジャンルから）。
function diaryTastes(p) {
  const counts = {};
  Object.values(diaryOf(p)).forEach((id) => { const t = GENRE_OF[id]?.taste; if (t) counts[t] = (counts[t] || 0) + 1; });
  return Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
}
function radar(stats) {
  const cx = 90, cy = 90, R = 70;
  const pt = (i, v) => { const a = (-90 + i * 72) * (Math.PI / 180); return [cx + R * (v / 5) * Math.cos(a), cy + R * (v / 5) * Math.sin(a)]; };
  const ring = (v) => STAT_NAMES.map((_, i) => pt(i, v).map((n) => n.toFixed(1)).join(",")).join(" ");
  const shape = STAT_NAMES.map(([id], i) => pt(i, stats[id]).map((n) => n.toFixed(1)).join(",")).join(" ");
  const labels = STAT_NAMES.map(([id, name], i) => { const [x, y] = pt(i, 6.3); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${name} ${stats[id]}</text>`; }).join("");
  return `<svg class="ct-radar" viewBox="-20 -8 220 200" role="img" aria-label="能力値：${STAT_NAMES.map(([id, n]) => `${n}${stats[id]}`).join("、")}"><polygon class="r-ring" points="${ring(5)}"/><polygon class="r-ring" points="${ring(2.5)}"/><polygon class="r-shape" points="${shape}"/>${labels}</svg>`;
}
function renderCookTypeCard(r) {
  return `<div class="cook-type-card" data-code="${r.code}">
    <p class="ct-kicker">あなたの ごはんタイプは…</p>
    <img class="ct-art" src="assets/types/${r.code}.webp" alt="${escapeAttr(r.name)}のキャラクター" width="640" height="640">
    <p class="ct-element">${r.el} ${escapeHtml(r.element)}属性</p>
    <h3 class="ct-name">${escapeHtml(r.name)}</h3>
    <p class="ct-catch">「${escapeHtml(r.catch)}」</p>
    ${radar(r.stats)}
    <p class="ct-move">必殺技：<b>${escapeHtml(r.move)}</b></p>
    <button type="button" class="secondary-button" data-action="life-type-share">結果をシェア ↗</button></div>`;
}
function handleCookTypeAction(action, data) {
  const p = profileDraft();
  if (action === "life-diary") { p.diary = { ...diaryOf(p), [data.date]: GENRE_OF[data.genre] ? data.genre : "unknown" }; return false; }
  if (action === "life-diary-undo") { const dates = lastWeekDates().filter((d) => diaryOf(p)[d]); const last = dates[dates.length - 1]; if (last) { const next = { ...diaryOf(p) }; delete next[last]; p.diary = next; } return false; }
  if (action === "life-diary-reset") { p.diary = {}; return false; }
  if (action === "life-dish") { if (DISH_QUESTIONS.some((q) => q.id === data.q)) p.dish = { ...dishOf(p), [data.q]: data.value }; return false; }
  if (action === "life-dish-reset") { p.dish = {}; return false; }
  if (action === "life-type-share") {
    const r = cookTypeOf(p);
    if (r) shareMessage(`わたしのごはんタイプは「${r.el}${r.name}」！ 必殺技は${r.move}。#リピごち`, `${location.origin}${location.pathname}`);
    return true;
  }
  return false;
}
