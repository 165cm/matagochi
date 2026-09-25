/* 料理スキル診断（1分）。スキルをちりばめた料理を「作れる？」で答えて、★1〜5のランクを出す。
   オンボーディングとは別のコンテンツ：?skill=1 で誰でも開ける（集客用）、アプリ内からもいつでも。 */
const SKILL_QUIZ = [
  { level: 1, dish: "starter-04", title: "レンジで作る さば豆腐丼", how: "混ぜてチンするだけ" },
  { level: 2, dish: "starter-03", title: "豚こまキャベツ炒め", how: "包丁で切って、フライパンで炒める" },
  { level: 2, dish: "starter-12", title: "トマト卵うどん", how: "鍋で煮て、卵に火を通す" },
  { level: 3, dish: "starter-38", title: "ガパオライス", how: "みじん切りして、手早く炒める" },
  { level: 3, dish: "starter-13", title: "鶏の照り焼き", how: "肉を中まで焼いて、たれを煮からめる" },
  { level: 4, dish: "starter-33", title: "チーズインハンバーグ", how: "こねて、チーズを包んで成形する" },
  { level: 4, dish: "starter-26", title: "鶏の揚げ焼き", how: "少なめの油で揚げ焼きにする" },
  { level: 5, dish: "", title: "からあげ", how: "たっぷりの油で揚げる" },
  { level: 5, dish: "", title: "あじの三枚おろし", how: "魚を丸ごと買って、おろす" },
];
const SKILL_TYPES = {
  1: { name: "レンジ名人", text: "混ぜてチン、が得意。包丁いらずの一皿から、無理なく回します。" },
  2: { name: "炒めもの上手", text: "切る・炒める・煮るはおまかせ。定番の丼や麺がどんどん回ります。" },
  3: { name: "フライパン使い", text: "焼いて中まで火を通す・煮からめるもOK。照り焼きやガパオまで守備範囲。" },
  4: { name: "おうちシェフ", text: "成形も揚げ焼きもこなせる腕前。ハンバーグの日も献立に入ります。" },
  5: { name: "台所マイスター", text: "揚げ物も魚も自在。どんな料理でも献立に並べます。" },
};
let skillQuiz = null; // { step, answers: {index: 0|1|2}, growth }
function skillQuizLevel(answers) {
  let level = 1;
  for (let l = 1; l <= 5; l += 1) {
    const items = SKILL_QUIZ.map((q, i) => [q, answers[i]]).filter(([q]) => q.level === l);
    const avg = items.reduce((sum, [, a]) => sum + (a ?? 0), 0) / items.length;
    if (avg >= 1.5) level = l; else break;
  }
  return level;
}
function skillProfile() {
  return state.skillProfile?.level ? state.skillProfile : null;
}
function startSkillQuiz() {
  skillQuiz = { step: 0, answers: {}, growth: state.skillProfile?.growth || "" };
}
function renderSkillQuiz() {
  const q = skillQuiz;
  const n = SKILL_QUIZ.length;
  if (q.step < n) {
    const item = SKILL_QUIZ[q.step];
    const r = Lifestyle.curated.find((c) => c.id === item.dish) || { id: `quiz-${q.step}`, title: item.title, ingredients: [], steps: [] };
    return `<section class="skill-quiz"><p class="quiz-progress">料理スキル診断 <b>${q.step + 1}</b> / ${n}</p>
      <div class="quiz-bar"><i style="width:${Math.round((q.step / n) * 100)}%"></i></div>
      ${dishTile(r, "quiz-photo")}
      <h2>${escapeHtml(item.title)}、<br><span class="marker nobr">作れる？</span></h2>
      <p class="quiz-how">${escapeHtml(item.how)}</p>
      <div class="quiz-answers">${[[2, "作れる！"], [1, "たぶん"], [0, "むり…"]].map(([v, label]) => `<button type="button" class="${v === 2 ? "primary-button" : "secondary-button"}" data-action="life-quiz-answer" data-value="${v}">${label}</button>`).join("")}</div>
      ${q.step ? '<button type="button" class="text-button" data-action="life-quiz-back">‹ ひとつ戻る</button>' : '<button type="button" class="text-button" data-action="life-quiz-close">あとで</button>'}</section>`;
  }
  if (!q.growth) {
    return `<section class="skill-quiz"><p class="quiz-progress">さいごの質問</p>
      <h2>これからの献立は、<br><span class="marker nobr">どうしたい？</span></h2>
      <div class="quiz-growth">
        <button type="button" class="rhythm-option" data-action="life-quiz-growth" data-value="steady"><strong>今のレパートリーで回したい</strong><small>作れる料理だけで、迷わずルーティン</small></button>
        <button type="button" class="rhythm-option" data-action="life-quiz-growth" data-value="grow"><strong>少しずつレベルアップしたい</strong><small>1週間に1回くらい「ちょっと挑戦」の一皿を入れる</small></button>
      </div></section>`;
  }
  const level = skillQuizLevel(q.answers);
  const type = SKILL_TYPES[level];
  const can = [...new Set(SKILL_QUIZ.filter((x) => x.level <= level).map((x) => x.title))].slice(-3);
  return `<section class="skill-quiz is-result"><p class="quiz-progress">あなたの料理スキルは…</p>
    <p class="quiz-stars" aria-label="5段階中${level}">${Skills.stars(level)}</p>
    <h2><span class="marker nobr">${type.name}</span></h2>
    <p>${type.text}</p>
    <p class="muted small">作れる料理の例：${can.map(escapeHtml).join("・")}</p>
    <p class="quiz-style">${q.growth === "grow" ? "🌱 少しずつレベルアップ：1週間に1回くらい、★がひとつ上の料理を入れます。" : "🔁 今のレパートリーで：★" + level + "までの料理で献立を作ります。"}</p>
    <div class="quiz-actions">${dailyButton("life-quiz-save", state.onboarded ? "献立に反映する" : "この結果ではじめる", "", true)}${dailyButton("life-quiz-share", "結果をシェア")}<button type="button" class="text-button" data-action="life-quiz-restart">もう一度</button></div></section>`;
}
function handleSkillQuizAction(action, data) {
  if (!action.startsWith("life-quiz")) return false;
  if (action === "life-quiz-start") { startSkillQuiz(); render(); globalThis.scrollTo?.({ top: 0 }); return true; }
  if (!skillQuiz) return true;
  if (action === "life-quiz-answer") { skillQuiz.answers[skillQuiz.step] = Number(data.value); skillQuiz.step += 1; }
  else if (action === "life-quiz-back") skillQuiz.step = Math.max(0, skillQuiz.step - 1);
  else if (action === "life-quiz-growth") skillQuiz.growth = data.value === "grow" ? "grow" : "steady";
  else if (action === "life-quiz-restart") startSkillQuiz();
  else if (action === "life-quiz-close") skillQuiz = null;
  else if (action === "life-quiz-share") {
    const level = skillQuizLevel(skillQuiz.answers);
    shareMessage(`料理スキル診断の結果は「${SKILL_TYPES[level].name}」${Skills.stars(level)} でした。作れる料理だけで献立が決まる「リピごち」`, `${location.origin}${location.pathname}?skill=1`);
    return true;
  } else if (action === "life-quiz-save") {
    const level = skillQuizLevel(skillQuiz.answers);
    state.skillProfile = { level, growth: skillQuiz.growth, updatedAt: nowIso() };
    state.planOverrides = {};
    skillQuiz = null;
    saveState();
    showToast(`「${SKILL_TYPES[level].name}」を献立に反映しました。`);
  }
  render();
  globalThis.scrollTo?.({ top: 0 });
  return true;
}
function normalizeSkillProfile(raw) {
  return [1, 2, 3, 4, 5].includes(Number(raw?.level)) ? { level: Number(raw.level), growth: raw.growth === "grow" ? "grow" : "steady", updatedAt: normalizeTimestamp(raw.updatedAt) } : null;
}
function renderSkillSettings() {
  if (isViewer()) return "";
  const sp = skillProfile();
  return `<section class="panel skill-settings"><h3>🔪 料理スキル</h3>${sp
    ? `<p><span class="skill-stars">${Skills.stars(sp.level)}</span> <b>${SKILL_TYPES[sp.level].name}</b></p>
      <div class="segmented" role="group" aria-label="献立の方針">${[["steady", "今のレパートリーで"], ["grow", "少しずつレベルアップ"]].map(([v, l]) => `<button type="button" class="choice-button" data-action="life-skill-growth" data-value="${v}" aria-pressed="${sp.growth === v}">${l}</button>`).join("")}</div>
      <button type="button" class="text-button" data-action="life-quiz-start">もう一度診断する</button>`
    : `<p class="muted small">1分の診断で、作れる料理だけの献立になります。</p>${dailyButton("life-quiz-start", "料理スキル診断をする", "", true)}`}</section>`;
}
