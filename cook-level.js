/* 経験値（XP）・Lv・バッジ・スキル一覧。晩ごはんの記録（state.evaluations）から毎回計算する（保存しないので、家族の端末でも同じ値）。
   1皿：10XP ＋ 料理の★ひとつごとに5XP ＋ はじめての料理10XP ＋ 写真5XP ＋ 前の日も作った5XP（1日2皿まで）。
   Lvが上がると、ひとつ上の★の昇級試験が受けられる。 */
const LV_FOR_STAR = { 2: 2, 3: 4, 4: 7, 5: 11 };
const xpToNext = (lv) => 40 + 20 * (lv - 1);
const xpAtLv = (lv) => { let sum = 0; for (let l = 1; l < lv; l += 1) sum += xpToNext(l); return sum; };
function levelOfXp(xp) {
  let lv = 1, rest = xp;
  while (rest >= xpToNext(lv) && lv < 99) { rest -= xpToNext(lv); lv += 1; }
  return { lv, into: rest, need: xpToNext(lv) };
}
function cookedRecipeOf(e) {
  return recipeById(e.recipeId) || Lifestyle.curated.find((r) => r.id === e.recipeId || r.title === e.recipeTitle) || null;
}
function cookStats() {
  const evs = (state.evaluations || []).filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.cookedAt || "")).sort((a, b) => a.cookedAt.localeCompare(b.cookedAt) || String(a.id).localeCompare(String(b.id)));
  const perDay = {}, kinds = {}, skills = {}, days = new Set();
  let xp = 0, count = 0, photos = 0;
  for (const e of evs) {
    const day = e.cookedAt.slice(0, 10);
    perDay[day] = (perDay[day] || 0) + 1;
    if (perDay[day] > 2) continue;
    const recipe = cookedRecipeOf(e);
    const rated = recipe ? Skills.rate(recipe) : { level: 2, skills: [] };
    const key = e.recipeId || e.recipeTitle || e.id;
    xp += 10 + 5 * (rated.level - 1) + (kinds[key] ? 0 : 10) + (e.photo ? 5 : 0) + (days.has(addDays(day, -1)) ? 5 : 0);
    kinds[key] = (kinds[key] || 0) + 1;
    for (const id of rated.skills) skills[id] = (skills[id] || 0) + 1;
    if (e.photo) photos += 1;
    days.add(day);
    count += 1;
  }
  const sorted = [...days].sort();
  let streak = 0, run = 0, week = false;
  sorted.forEach((d, i) => {
    run = i && addDays(sorted[i - 1], 1) === d ? run + 1 : 1;
    streak = Math.max(streak, run);
    // 1週間達成：7日のうち5日以上作った。
    if (sorted.filter((x) => x >= addDays(d, -6) && x <= d).length >= 5) week = true;
  });
  return { xp, ...levelOfXp(xp), count, kinds: Object.keys(kinds).length, maxRepeat: Math.max(0, ...Object.values(kinds)), photos, skills, streak, week, days: sorted,
    avgXp: count >= 3 ? Math.round(xp / count) : 20, tested: !!state.skillProfile?.quizLevel, promoted: (state.skillProfile?.promoted || 0) > 0, comp: typeof menuCompDone === "function" && menuCompDone() };
}
const BADGES = [
  { id: "first", icon: "🍳", name: "はじめの一皿", hint: "晩ごはんを1回作る", ok: (s) => s.count >= 1 },
  { id: "test", icon: "📝", name: "腕試し", hint: "料理スキル試験を受ける", ok: (s) => s.tested },
  { id: "photo", icon: "📸", name: "写真デビュー", hint: "作った料理の写真を残す", ok: (s) => s.photos >= 1 },
  { id: "streak3", icon: "🔥", name: "3日連続", hint: "3日続けて作る", ok: (s) => s.streak >= 3 },
  { id: "week", icon: "🗓", name: "1週間達成", hint: "7日のうち5日作る", ok: (s) => s.week },
  { id: "d10", icon: "🍽", name: "10皿", hint: "10回作る", ok: (s) => s.count >= 10 },
  { id: "regular", icon: "🔁", name: "定番誕生", hint: "同じ料理を3回作る", ok: (s) => s.maxRepeat >= 3 },
  { id: "variety", icon: "🌈", name: "レパートリー10", hint: "10種類の料理を作る", ok: (s) => s.kinds >= 10 },
  { id: "streak7", icon: "⚡", name: "7日連続", hint: "7日続けて作る", ok: (s) => s.streak >= 7 },
  { id: "shape", icon: "🥟", name: "成形デビュー", hint: "練る・包む料理を作る", ok: (s) => !!s.skills.shape },
  { id: "fry", icon: "🍤", name: "揚げ物デビュー", hint: "揚げ物を作る", ok: (s) => !!s.skills.deepfry },
  { id: "promote", icon: "🎖", name: "昇級", hint: "昇級試験に合格する", ok: (s) => s.promoted },
  { id: "comp", icon: "🎨", name: "1週間コンプ", hint: "1週間の献立を写真でコンプする", ok: (s) => s.comp },
  { id: "d30", icon: "🏅", name: "30皿", hint: "30回作る", ok: (s) => s.count >= 30 },
  { id: "d100", icon: "👑", name: "100皿", hint: "100回作る", ok: (s) => s.count >= 100 },
];
const earnedBadges = (s = cookStats()) => BADGES.filter((b) => b.ok(s));
// 自炊の回数（初回設定の「いまの1週間」）。なければ週4回。
function cooksPerWeek() {
  const p = state.foodProfile?.ratio ? state.foodProfile : state.onboardingDraft || {};
  return Math.max(2, Math.min(7, ratioOf(p).self || 4));
}
// ★nの次へ：身につけるスキル・あと何皿・何週で昇級試験か。
function skillNextPlan(star, s = cookStats()) {
  const target = star + 1;
  const needLv = LV_FOR_STAR[target];
  const leftXp = Math.max(0, xpAtLv(needLv) - s.xp);
  const dishes = Math.ceil(leftXp / s.avgXp), perWeek = cooksPerWeek();
  const skills = Skills.SKILLS.filter((x) => x.level === target).map((x) => x.label.replace(/（.*）/, "")).slice(0, 3).join("、");
  return { target, needLv, dishes, perWeek, weeks: Math.max(1, Math.ceil(dishes / perWeek)), skills, ready: s.lv >= needLv };
}
// 昇級試験を受けられるか（不合格の日は、次の日から）。
function examReady(s = cookStats()) {
  const sp = skillProfile();
  if (!sp || sp.level >= 5 || isViewer() || sp.examFailedOn === today()) return false;
  return s.lv >= LV_FOR_STAR[sp.level + 1];
}
// 作った！のあとに、もらったXP・Lvアップ・新しいバッジを小さく出す。
function celebrateCook(before) {
  const after = cookStats();
  const gained = after.xp - before.xp;
  const lines = gained > 0 ? [`<b class="xp-gain">+${gained} XP</b>`] : [];
  if (after.lv > before.lv) lines.push(`<span class="xp-lv">Lv ${after.lv} にアップ！</span>`);
  const had = new Set(earnedBadges(before).map((b) => b.id));
  for (const b of earnedBadges(after).filter((x) => !had.has(x.id))) lines.push(`<span class="xp-badge">${b.icon} バッジ「${b.name}」</span>`);
  if (examReady(after) && !examReady(before)) lines.push(`<span class="xp-lv">🎖 昇級試験が受けられます</span>`);
  if (!lines.length) return;
  try {
    document.querySelector(".xp-pop")?.remove();
    const el = document.createElement("div");
    el.className = "xp-pop";
    el.setAttribute("role", "status");
    el.innerHTML = lines.join("");
    document.body.append(el);
    setTimeout(() => el.remove(), 3600);
  } catch {}
}
// 診断に使った写真（この端末だけ）。
function renderSkillPhoto() {
  const p = state.skillPhoto;
  if (!p?.photo) return "";
  return `<figure class="skill-photo"><img src="${p.photo}" alt="診断に使った料理の写真"><figcaption><b>${escapeHtml(p.dish)}</b>診断に使った写真（この端末だけに保存）</figcaption></figure>`;
}
function renderSkillSettings() {
  if (isViewer()) return "";
  const sp = skillProfile(), s = cookStats();
  const earned = new Set(earnedBadges(s).map((b) => b.id));
  const lvCard = `<div class="lv-card"><div class="lv-badge"><small>Lv</small><b>${s.lv}</b></div><div class="lv-main">
    <p class="lv-title">${sp ? `<span class="skill-stars">${Skills.stars(sp.level)}</span> ${SKILL_TYPES[sp.level].name}${sp.score !== undefined ? `<small>${kyuOfScore(sp.score)}・${sp.score}点</small>` : ""}` : "料理スキル 未診断"}</p>
    <div class="xp-bar" role="progressbar" aria-label="次のLvまで" aria-valuemin="0" aria-valuemax="${s.need}" aria-valuenow="${s.into}"><i style="width:${Math.round((s.into / s.need) * 100)}%"></i></div>
    <p class="small muted">次のLvまで ${s.need - s.into} XP・これまで${s.count}皿・${s.xp} XP</p></div></div>`;
  let next = "";
  if (sp && sp.level < 5) {
    const n = skillNextPlan(sp.level, s);
    next = examReady(s)
      ? `<div class="next-star is-ready"><p>🎖 <b>★${n.target}「${SKILL_TYPES[n.target].name}」の昇級試験</b>が受けられます（5問・4問正解で合格）</p>${dailyButton("life-exam-start", "昇級試験を受ける", "", true)}</div>`
      : `<div class="next-star"><p>🎯 ★${n.target}へ：Lv${n.needLv}で昇級試験。あと<b>約${n.dishes}皿</b>（週${n.perWeek}回で約${n.weeks}週）${sp.examFailedOn === today() ? "・今日の試験はおしまい" : ""}</p><small>身につけるスキル：${escapeHtml(n.skills)}</small></div>`;
  }
  const learned = Skills.SKILLS.filter((x) => s.skills[x.id]).sort((a, b) => b.level - a.level || s.skills[b.id] - s.skills[a.id]);
  const nextSkills = sp ? Skills.SKILLS.filter((x) => !s.skills[x.id] && x.level <= Math.min(5, sp.level + 1)).slice(0, 4) : [];
  const skillList = `<h4 class="skill-h">身についたスキル <small>${learned.length}/${Skills.SKILLS.length}</small></h4><div class="skill-chips">${learned.map((x) => `<span class="skill-chip lv${x.level}">${escapeHtml(x.label.replace(/（.*）/, ""))}<small>×${s.skills[x.id]}</small></span>`).join("")}${nextSkills.map((x) => `<span class="skill-chip is-locked">${escapeHtml(x.label.replace(/（.*）/, ""))}</span>`).join("")}${learned.length ? "" : '<span class="muted small">作った料理から、身についたスキルがここに並びます。</span>'}</div>`;
  const shelf = `<h4 class="skill-h">バッジ <small>${earned.size}/${BADGES.length}</small></h4><ul class="badge-shelf">${BADGES.map((b) => `<li class="${earned.has(b.id) ? "is-earned" : ""}" title="${escapeAttr(b.hint)}"><span aria-hidden="true">${earned.has(b.id) ? b.icon : "？"}</span><b>${earned.has(b.id) ? b.name : b.hint}</b></li>`).join("")}</ul>`;
  const growth = sp ? `<div class="segmented" role="group" aria-label="献立の方針">${[["steady", "今のレパートリーで"], ["grow", "少しずつレベルアップ"]].map(([v, l]) => `<button type="button" class="choice-button" data-action="life-skill-growth" data-value="${v}" aria-pressed="${sp.growth === v}">${l}</button>`).join("")}</div>` : "";
  return `<section class="panel skill-settings">${lvCard}${next}${skillList}${shelf}${renderSkillPhoto()}${growth}
    ${sp ? '<button type="button" class="text-button" data-action="life-quiz-start">料理スキル試験をもう一度受ける</button>' : `<p class="muted small">10問の試験で、作れる料理だけの献立になります。</p>${dailyButton("life-quiz-start", "料理スキル試験を受ける", "", true)}`}</section>`;
}
