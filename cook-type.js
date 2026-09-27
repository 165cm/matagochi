/* 晩ごはんタイプ診断：① 1週間の晩ごはんの割合 → ② よく食べる主食 → ③ 外食するならどの店？ → ④ いちばん大事なこと
   → ⑤ 作った料理の写真で腕前（AI判定）。3つの軸（定番/挑戦・こってり/あっさり・時短/じっくり）で8タイプ。
   結果は、属性×職業のキャラクターと、パワプロ風のS〜Gランクで見せるステータスカード。 */
const RATIO_KINDS = [
  { id: "self", icon: "🍳", label: "自炊", color: "#ee6a4c" },
  { id: "out", icon: "🍽", label: "外食", color: "#f2a93b" },
  { id: "take", icon: "🥡", label: "テイクアウト・惣菜", color: "#6aa84f" },
  { id: "deli", icon: "🛵", label: "デリバリー", color: "#4f8fd6" },
];
const STAPLES = [["rice", "🍚", "ごはん"], ["noodle", "🍜", "麺類"], ["bread", "🍞", "パン"], ["other", "🥣", "その他"]];
// 駅前によくあるお店（名前は選びやすさのため。店の評価ではありません）。k はこってり度。
const CHAINS = [
  { id: "yoshinoya", name: "吉野家", icon: "🐂", genre: "牛丼", k: 1 },
  { id: "sukiya", name: "すき家", icon: "🐂", genre: "牛丼", k: 1 },
  { id: "matsuya", name: "松屋", icon: "🐂", genre: "牛丼", k: 1 },
  { id: "marugame", name: "丸亀製麺", icon: "🍲", genre: "うどん", k: -1 },
  { id: "hanamaru", name: "はなまるうどん", icon: "🍲", genre: "うどん", k: -1 },
  { id: "ichiran", name: "一蘭", icon: "🍜", genre: "ラーメン", k: 2 },
  { id: "tenkaippin", name: "天下一品", icon: "🍜", genre: "ラーメン", k: 2 },
  { id: "hidakaya", name: "日高屋", icon: "🥟", genre: "中華", k: 1.5 },
  { id: "ohsho", name: "餃子の王将", icon: "🥟", genre: "中華", k: 1.5 },
  { id: "ootoya", name: "大戸屋", icon: "🍱", genre: "定食", k: -1 },
  { id: "yayoiken", name: "やよい軒", icon: "🍱", genre: "定食", k: -0.5 },
  { id: "coco", name: "CoCo壱番屋", icon: "🍛", genre: "カレー", k: 1 },
  { id: "sushiro", name: "スシロー", icon: "🍣", genre: "寿司", k: -1.5 },
  { id: "kura", name: "くら寿司", icon: "🍣", genre: "寿司", k: -1.5 },
  { id: "saizeriya", name: "サイゼリヤ", icon: "🍝", genre: "洋食", k: 0.5 },
  { id: "gusto", name: "ガスト", icon: "🍝", genre: "洋食", k: 0.5 },
  { id: "mcd", name: "マクドナルド", icon: "🍔", genre: "バーガー", k: 1.5 },
  { id: "mos", name: "モスバーガー", icon: "🍔", genre: "バーガー", k: 1 },
  { id: "katsuya", name: "かつや", icon: "🍖", genre: "とんかつ", k: 2 },
  { id: "torikizoku", name: "鳥貴族", icon: "🍢", genre: "焼き鳥", k: 1 },
];
const CHAIN_OF = Object.fromEntries(CHAINS.map((c) => [c.id, c]));
const PRIORITIES = [["cheap", "💴", "安さ"], ["fast", "⚡", "早さ"], ["volume", "🍖", "ボリューム"], ["healthy", "🥗", "からだにいい"], ["variety", "🌈", "いろいろ食べたい"]];
const MOVES = { 牛丼: "特盛いっき食い", うどん: "コシの見極め", ラーメン: "替え玉コンボ", 中華: "強火の鍋振り", 定食: "一汁三菜の構え", カレー: "辛さ10倍チャレンジ", 寿司: "回転レーン見切り", 洋食: "ドリンクバー無限回廊", バーガー: "片手メシ", とんかつ: "衣サクサク斬り", 焼き鳥: "串打ち百本" };
const COOK_TYPES = {
  RKQ: { el: "⚡", element: "雷", color: "#ffd23f", name: "雷速の丼ソードマン", catch: "迷わず斬る、いつもの一杯。", move: "特盛いっき食い" },
  RKS: { el: "🔥", element: "炎", color: "#ff5a3c", name: "炎の煮込みナイト", catch: "鍋を守る、こってりの騎士。", move: "とろとろ煮込み" },
  RAQ: { el: "💧", element: "水", color: "#3ec5ff", name: "水流の和食シーフ", catch: "さっと仕上げる、やさしい定番。", move: "一汁一菜の早業" },
  RAS: { el: "🌿", element: "森", color: "#5fcf6b", name: "出汁の森ヒーラー", catch: "滋味で、みんなを回復させる。", move: "黄金の出汁" },
  CKQ: { el: "🌪", element: "風", color: "#2fe0c8", name: "疾風のスパイスハンター", catch: "新しい辛さを、狩りにいく。", move: "スパイス乱れ撃ち" },
  CKS: { el: "🌋", element: "溶岩", color: "#ff7b1f", name: "灼熱の中華バーサーカー", catch: "強火と油で、暴れまくる。", move: "強火の鍋振り" },
  CAQ: { el: "❄️", element: "氷", color: "#9fe3ff", name: "氷刃のレンジ魔導士", catch: "レンジ一閃、未知の一皿。", move: "レンジ一閃" },
  CAS: { el: "✨", element: "光", color: "#ffb8ec", name: "光の彩り錬金術師", catch: "素材を、輝きに変える。", move: "七色の盛り付け" },
};
const STAT_NAMES = [["fire", "火力"], ["speed", "時短"], ["thrift", "節約"], ["health", "健康"], ["adventure", "冒険心"], ["craft", "腕前"]];
const GRADES = [[90, "S"], [80, "A"], [70, "B"], [60, "C"], [50, "D"], [40, "E"], [30, "F"], [0, "G"]];
const gradeOf = (v) => GRADES.find(([min]) => v >= min)[1];

// 平日（5回）と休日（2回）に分けて振り分ける。ratioOf は合計（7回）。
const RATIO_PARTS = [{ id: "wd", label: "平日（月〜金）", total: 5, base: { self: 3, out: 1, take: 1, deli: 0 } }, { id: "we", label: "休日（土日）", total: 2, base: { self: 1, out: 1, take: 0, deli: 0 } }];
const partOf = (p, part) => { const def = RATIO_PARTS.find((x) => x.id === part); return { ...def.base, ...(p.ratio?.[part] && typeof p.ratio[part] === "object" ? p.ratio[part] : {}) }; };
const ratioOf = (p) => Object.fromEntries(RATIO_KINDS.map((k) => [k.id, RATIO_PARTS.reduce((s, part) => s + (Number(partOf(p, part.id)[k.id]) || 0), 0)]));
const ratioTotal = (r) => RATIO_KINDS.reduce((s, k) => s + (Number(r[k.id]) || 0), 0);

// ① いまの1週間：平日5回・休日2回の晩ごはんを、自炊・外食・テイクアウト・デリバリーに振り分ける。
function renderRatioStep(p) {
  return `<p class="small">だいたいでOK。平日と休日に分けて、振り分けてください。</p>${RATIO_PARTS.map((part) => {
    const r = partOf(p, part.id);
    const plates = RATIO_KINDS.flatMap((k) => Array.from({ length: r[k.id] }, () => `<i style="--c:${k.color}" title="${k.label}">${k.icon}</i>`)).join("");
    return `<section class="ratio-part"><h3 class="quick-sub">${part.label} <small>${part.total}回</small></h3><div class="ratio-plates" style="--n:${part.total}" aria-hidden="true">${plates}</div>
      <div class="ratio-grid">${RATIO_KINDS.map((k) => `<div class="ratio-cell" style="--c:${k.color}"><span class="rc-label"><span aria-hidden="true">${k.icon}</span>${k.label.replace("・惣菜", "")}</span><b class="rr-count" aria-live="polite">${r[k.id]}</b><span class="rc-btns"><button type="button" data-action="life-ratio" data-part="${part.id}" data-kind="${k.id}" data-delta="-1" aria-label="${part.label}の${k.label}を1回減らす" ${r[k.id] <= 0 ? "disabled" : ""}>−</button><button type="button" data-action="life-ratio" data-part="${part.id}" data-kind="${k.id}" data-delta="1" aria-label="${part.label}の${k.label}を1回増やす" ${r[k.id] >= part.total ? "disabled" : ""}>＋</button></span></div>`).join("")}</div></section>`;
  }).join("")}`;
}
function changeRatio(p, partId, kind, delta) {
  const part = RATIO_PARTS.find((x) => x.id === partId);
  if (!part || !RATIO_KINDS.some((k) => k.id === kind)) return;
  const r = partOf(p, partId);
  r[kind] = Math.max(0, Math.min(part.total, r[kind] + delta));
  // 回数は平日5・休日2のまま：増やしたぶんは自炊から（自炊を増やした時は、多いものから）減らす。減らしたぶんは自炊へ。
  while (ratioTotal(r) > part.total) { const from = kind !== "self" && r.self > 0 ? "self" : RATIO_KINDS.map((k) => k.id).filter((id) => id !== kind).sort((a, b) => r[b] - r[a])[0]; r[from] -= 1; }
  while (ratioTotal(r) < part.total) r.self += 1;
  p.ratio = { ...(p.ratio || {}), [partId]: r };
}
// ② よく食べる主食（複数OK）
function renderStapleStep(p) {
  const on = new Set(p.staples || []);
  return `<p class="small">あてはまるものを、ぜんぶ。</p><div class="funnel-picks is-grid2 staple-picks">${STAPLES.map(([id, icon, label]) => `<button type="button" class="funnel-pick" data-action="life-staple" data-value="${id}" aria-pressed="${on.has(id)}"><span class="fp-icon" aria-hidden="true">${icon}</span>${label}</button>`).join("")}</div>`;
}
// ③ 外食するなら？（駅前のお店をタップ・3つまで）
function renderChainStep(p) {
  const on = new Set(p.chains || []);
  return `<p class="small">入りたいお店を、<b>3つまで</b>タップ。</p><div class="chain-grid">${CHAINS.map((c) => `<button type="button" class="chain-tile" data-action="life-chain" data-value="${c.id}" aria-pressed="${on.has(c.id)}" ${!on.has(c.id) && on.size >= 3 ? "disabled" : ""}><span aria-hidden="true">${c.icon}</span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.genre)}</small></button>`).join("")}</div><p class="muted small">お店の名前は、選びやすさのためだけに使っています。</p>`;
}
// ④ いちばん大事なこと
function renderPriorityStep(p) {
  return `<div class="funnel-picks">${PRIORITIES.map(([id, icon, label]) => `<button type="button" class="funnel-pick" data-action="life-priority" data-value="${id}" aria-pressed="${p.priority === id}"><span class="fp-icon" aria-hidden="true">${icon}</span>${label}</button>`).join("")}</div>`;
}

// ⑤ 作った料理の写真で腕前を判定（AI）。写真は判定したら捨てる。
let skillPhoto = { status: "idle", result: null, message: "" };
function renderPhotoJudge() {
  const s = skillPhoto;
  if (s.status === "loading") return `<div class="demo-wait"><p class="dw-stage" aria-live="polite">${WAIT_STAGES_PHOTO[0]}</p><div class="dw-bar"><i></i></div><div class="dw-tip" aria-live="polite"><small>待っている間に、ひとこと</small><p>${WAIT_TIPS[3]}</p></div></div>`;
  if (s.status === "done") { const r = s.result; return `<div class="skill-part is-done"><p class="sp-head">📸 写真 <b>${Skills.stars(r.level)}</b></p><p class="pj-dish">${escapeHtml(r.dish)}</p>${r.techniques.length ? `<p class="pj-tech">${r.techniques.map((t) => `<i>${escapeHtml(t)}</i>`).join("")}</p>` : ""}${r.comment ? `<p class="pj-comment">${escapeHtml(r.comment)}</p>` : ""}<button type="button" class="link-inline" data-action="life-photo-retry">別の写真で</button></div>`; }
  return `<label class="skill-part photo-drop"><input type="file" accept="image/*" id="skill-photo" hidden><span aria-hidden="true">📸</span><b>作った料理の写真</b><small>AIが腕前を見ます。写真は保存しません</small></label>${s.status === "error" ? `<p class="form-error small">${escapeHtml(s.message)}</p>` : ""}`;
}
const WAIT_STAGES_PHOTO = ["写真を見ています", "焼き色と切り方を見ています", "腕前を計算しています"];
function bindPhotoJudge() {
  const input = document.querySelector("#skill-photo");
  if (input) input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { skillPhoto = { status: "error", result: null, message: "画像を選んでください。" }; render(); return; }
    skillPhoto = { status: "loading", result: null, message: "" }; render();
    try {
      const url = await resizeImage(file, 960, 0.75);
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/skill/photo`, { method: "POST", headers: { "Content-Type": "application/json", "X-Household": householdKey() }, body: JSON.stringify({ image: { mimeType: "image/jpeg", data: url.split(",")[1] } }) }, 90_000);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error?.message || "判定できませんでした。");
      skillPhoto = { status: "done", result: data, message: "" };
      const quizLevel = state.skillProfile?.quizLevel || null;
      state.skillProfile = { level: combinedSkill(quizLevel, data.level), photoLevel: data.level, ...(quizLevel ? { quizLevel } : {}), growth: state.skillProfile?.growth || "steady", diagnosed: true, updatedAt: nowIso() };
      trackDaily("skill_photo_judged", { level: data.level });
      saveState({ scheduleSync: false });
    } catch (error) {
      skillPhoto = { status: "error", result: null, message: error.message || "判定できませんでした。" };
    }
    render();
  });
  const wait = document.querySelector(".demo-wait");
  if (wait && skillPhoto.status === "loading") {
    let n = 0;
    const timer = setInterval(() => { if (!document.body.contains(wait)) { clearInterval(timer); return; } n += 1; wait.querySelector(".dw-stage").textContent = WAIT_STAGES_PHOTO[Math.min(WAIT_STAGES_PHOTO.length - 1, n)]; const tip = wait.querySelector(".dw-tip p"); tip.textContent = WAIT_TIPS[(n + 3) % WAIT_TIPS.length]; tip.classList.remove("is-in"); void tip.offsetWidth; tip.classList.add("is-in"); }, 2800);
  }
}

// 答えから3つの軸と、6つのステータス（0〜100）を出す。
function cookTypeOf(p) {
  const r = ratioOf(p);
  const chains = (p.chains || []).map((id) => CHAIN_OF[id]).filter(Boolean);
  if (!p.ratioSet && !chains.length && !p.priority) return null;
  const outShare = (r.out + r.take + r.deli) / 7;
  const pr = p.priority || "";
  const avgK = chains.length ? chains.reduce((s, c) => s + c.k, 0) / chains.length : 0;
  const k = avgK * 1.2 + (pr === "volume" ? 1 : 0) + (pr === "healthy" ? -1.5 : 0) + ((p.staples || []).includes("noodle") ? 0.3 : 0);
  const q = outShare * 4 - 2 + (pr === "fast" ? 2 : 0) + (pr === "healthy" ? -0.5 : 0);
  const genres = new Set(chains.map((c) => c.genre)).size;
  const c = (genres >= 3 ? 2 : genres <= 1 && chains.length ? -1.5 : 0) + (pr === "variety" ? 2 : 0) + ((p.staples || []).length >= 3 ? 1 : 0) - (pr === "cheap" ? 0.5 : 0);
  const code = `${c > 0 ? "C" : "R"}${k > 0 ? "K" : "A"}${q >= 0 ? "Q" : "S"}`;
  const lvl = state.skillProfile?.level || 2;
  const clamp = (x) => Math.max(8, Math.min(100, Math.round(x)));
  const stats = {
    fire: clamp(52 + k * 12 + (lvl - 3) * 6),
    speed: clamp(50 + q * 11),
    thrift: clamp(30 + (r.self / 7) * 50 + (pr === "cheap" ? 20 : 0)),
    health: clamp(55 - k * 10 + (pr === "healthy" ? 22 : 0) + (r.self / 7) * 10 - (r.deli / 7) * 12),
    adventure: clamp(48 + c * 11),
    craft: clamp(12 + lvl * 17),
  };
  const overall = Math.round(Object.values(stats).reduce((a, b) => a + b, 0) / STAT_NAMES.length);
  const counts = {};
  chains.forEach((x) => { counts[x.genre] = (counts[x.genre] || 0) + 1; });
  const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { code, ...COOK_TYPES[code], stats, overall, move: (fav && MOVES[fav]) || COOK_TYPES[code].move, fav: fav || "" };
}
// 献立に使う好みの味：選んだお店のジャンルから（和風・洋風・中華風）。
function chainTastes(p) {
  const map = { 牛丼: "和風", うどん: "和風", 定食: "和風", 寿司: "和風", とんかつ: "和風", 焼き鳥: "和風", 中華: "中華風", ラーメン: "中華風", 洋食: "洋風", バーガー: "洋風", カレー: "洋風" };
  const counts = {};
  (p.chains || []).forEach((id) => { const t = map[CHAIN_OF[id]?.genre]; if (t) counts[t] = (counts[t] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
}
// 結果のカード：アプリの色（生成り・テラコッタ）に合わせた、メニューカード風。アーチ窓の絵・判子の属性・明朝体の名前・S〜Gの成績表。
const TYPE_NO = { RKQ: 1, RKS: 2, RAQ: 3, RAS: 4, CKQ: 5, CKS: 6, CAQ: 7, CAS: 8 };
function renderCookTypeCard(r) {
  return `<div class="cook-type-card" style="--el:${r.color}" data-code="${r.code}">
    <p class="ct-kicker"><span>YOUR DINNER TYPE</span><span>No.${String(TYPE_NO[r.code]).padStart(2, "0")}</span></p>
    <figure class="ct-portrait"><img class="ct-art" src="assets/types/${r.code}.webp" alt="${escapeAttr(r.name)}のキャラクター" width="640" height="640"><span class="ct-stamp" aria-label="${escapeAttr(r.element)}属性">${escapeHtml(r.element)}</span><span class="ct-overall"><span>総合</span><b>${r.overall}</b></span></figure>
    <p class="ct-element">${r.el} ${escapeHtml(r.element)}属性</p>
    <h3 class="ct-name">${escapeHtml(r.name)}</h3>
    <p class="ct-catch">${escapeHtml(r.catch)}</p>
    <div class="ct-sheet">
      <ul class="ct-stats">${STAT_NAMES.map(([id, name], i) => { const v = r.stats[id], g = gradeOf(v); return `<li style="--v:${v}%;--d:${i * 0.1 + 0.2}s"><span class="cs-name">${name}</span><span class="cs-bar"><i class="g-${g}"></i></span><b class="cs-grade g-${g}">${g}</b></li>`; }).join("")}</ul>
    </div>
    <p class="ct-move"><span>得意技</span><i aria-hidden="true"></i><b>${escapeHtml(r.move)}</b></p>
    <button type="button" class="ct-share" data-action="life-type-share">結果をシェア</button></div>`;
}
function handleCookTypeAction(action, data) {
  const p = profileDraft();
  if (action === "life-ratio") { changeRatio(p, data.part, data.kind, Number(data.delta) || 0); p.ratioSet = true; return false; }
  if (action === "life-staple") { const on = new Set(p.staples || []); on.has(data.value) ? on.delete(data.value) : on.add(data.value); p.staples = STAPLES.map(([id]) => id).filter((id) => on.has(id)); return false; }
  if (action === "life-chain") { const on = new Set(p.chains || []); if (on.has(data.value)) on.delete(data.value); else if (on.size < 3 && CHAIN_OF[data.value]) on.add(data.value); p.chains = [...on]; return false; }
  if (action === "life-priority") { p.priority = PRIORITIES.some(([id]) => id === data.value) ? data.value : ""; p.quickSetupIndex = Math.min(QUICK_STEPS - 1, p.quickSetupIndex + 1); return false; }
  if (action === "life-photo-retry") { skillPhoto = { status: "idle", result: null, message: "" }; return false; }
  if (action === "life-type-share") {
    const r = cookTypeOf(p) || cookTypeOf(state.foodProfile || {});
    if (r) shareMessage(`わたしの晩ごはんタイプは「${r.el}${r.name}」総合力${r.overall}！ 必殺技は「${r.move}」。#リピごち`, `${location.origin}${location.pathname}`);
    return true;
  }
  return false;
}
