/* 作った回数の集計（cookStats）と、設定の「料理の腕前」。晩ごはんの記録（state.evaluations）から毎回計算する。
   2026-10-28：経験値・Lv・バッジ・昇級試験は画面に出さない（ゲームの要素を外した）。cookStats は止めている献立表の機能（weekly.js）だけが使う。 */
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
// 料理の腕前（設定）：★を自分で選ぶだけ（2026-10-28 のユーザーの判断「ゲームの要素は外して、できる限りシンプルに」）。
// 経験値・Lv・バッジ・昇級試験・写真の判定は出さない。豆知識クイズ（10問）は遊べる診断として、ここから開ける。
function renderSkillSettings() {
  if (isViewer()) return "";
  const sp = skillProfile();
  const picks = [1, 2, 3, 4, 5].map((l) => `<button type="button" class="rhythm-option" data-action="life-quick-skill" data-level="${l}" aria-pressed="${sp?.level === l}"><strong><span class="skill-stars">${Skills.stars(l)}</span></strong><small>${escapeHtml(SKILL_TYPES[l].name)}</small></button>`).join("");
  return `<section class="panel skill-settings">
    <p class="small">いちばん近いものを選んでください。★より難しい料理も外さず、後ろのほうに並べます（「ちょっと挑戦」の印）。</p>
    <div class="skill-picks">${picks}</div>
    ${sp ? '<button type="button" class="text-button" data-action="life-skill-clear">腕前を使わない（並べ方を元に戻す）</button>' : ""}
    <p class="muted small">🧠 遊びで：${dailyButton("life-quiz-start", "料理の豆知識クイズ（10問）")}</p></section>`;
}
