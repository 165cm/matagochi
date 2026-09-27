/* 料理スキル診断（1分）。スキルをちりばめた料理を「作れる？」で答えて、★1〜5のランクを出す。
   オンボーディングとは別のコンテンツ：?skill=1 で誰でも開ける（集客用）、アプリ内からもいつでも。 */
// 「作れる？」ではなく、実際の作業ができるかで判断する（料理名だけだと自己評価がぶれるため）。
const SKILL_QUIZ = [
  { level: 1, dish: "starter-04", title: "レンジだけで、一品つくれる？", can: "レンジで一品", how: "材料を耐熱ボウルで混ぜて、電子レンジで加熱する" },
  { level: 2, dish: "starter-03", title: "野菜を、同じ大きさに切れる？", can: "野菜の切りそろえ", how: "火の通りがそろうように、キャベツやにんじんを切る" },
  { level: 2, dish: "starter-12", title: "味見して、味を整えられる？", can: "味の調整", how: "しょうゆや塩を少しずつ足して、ちょうどいい味にする" },
  { level: 3, dish: "starter-13", title: "鶏肉の火の通り、見分けられる？", can: "火の通りの見極め", how: "切り口や肉汁の色で、中まで焼けたか確かめる" },
  { level: 3, dish: "starter-38", title: "玉ねぎを、みじん切りにできる？", can: "みじん切り", how: "包丁で細かく、同じ大きさに刻む" },
  { level: 4, dish: "starter-33", title: "ハンバーグを、形を作って焼ける？", can: "ハンバーグの成形", how: "こねて成形し、割れずに中まで焼く" },
  { level: 4, dish: "starter-26", title: "2品を、同時進行で作れる？", can: "2品の同時進行", how: "煮ている間にもう一品を焼く、など段取りを組む" },
  { level: 5, dish: "", title: "からあげを、油で揚げられる？", can: "揚げ物", how: "油の温度を見ながら、たっぷりの油で揚げる" },
  { level: 5, dish: "", title: "魚を、三枚におろせる？", can: "魚をおろす", how: "丸ごとの魚を、骨から身を切り離す" },
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
function startSkillQuiz(fromLp = false) {
  skillQuiz = { step: 0, answers: {}, growth: state.skillProfile?.growth || "", fromLp };
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
      <h2><span class="marker">${escapeHtml(item.title)}</span></h2>
      <p class="quiz-how">${escapeHtml(item.how)}</p>
      <div class="quiz-answers">${[[2, "できる！"], [1, "たぶん"], [0, "できない"]].map(([v, label]) => `<button type="button" class="${v === 2 ? "primary-button" : "secondary-button"}" data-action="life-quiz-answer" data-value="${v}">${label}</button>`).join("")}</div>
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
  const can = [...new Set(SKILL_QUIZ.filter((x) => x.level <= level).map((x) => x.can))].slice(-3);
  return `<section class="skill-quiz is-result"><p class="quiz-progress">あなたの料理スキルは…</p>
    <p class="quiz-stars" aria-label="5段階中${level}">${Skills.stars(level)}</p>
    <h2><span class="marker nobr">${type.name}</span></h2>
    <p>${type.text}</p>
    <p class="muted small">できること：${can.map(escapeHtml).join("・")}</p>
    <p class="quiz-style">${q.growth === "grow" ? "🌱 少しずつレベルアップ：1週間に1回くらい、★がひとつ上の料理を入れます。" : "🔁 今のレパートリーで：★" + level + "までの料理で献立を作ります。"}</p>
    <div class="quiz-actions">${q.fromLp && !state.onboarded ? `<a class="primary-button link-button" href="lp/#waitlist">公開のお知らせを受け取る</a>${dailyButton("life-quiz-save", "この結果でアプリを試す")}` : dailyButton("life-quiz-save", state.onboarded ? "献立に反映する" : "この結果で次へ", "", true)}${dailyButton("life-quiz-share", "結果をシェア")}<button type="button" class="text-button" data-action="life-quiz-restart">もう一度</button></div></section>`;
}
function handleSkillQuizAction(action, data) {
  if (!action.startsWith("life-quiz")) return false;
  if (action === "life-quiz-start") { startSkillQuiz(); render(); globalThis.scrollTo?.({ top: 0 }); return true; }
  if (!skillQuiz) return true;
  if (action === "life-quiz-answer") { skillQuiz.answers[skillQuiz.step] = Number(data.value); skillQuiz.step += 1; }
  else if (action === "life-quiz-back") skillQuiz.step = Math.max(0, skillQuiz.step - 1);
  else if (action === "life-quiz-growth") {
    skillQuiz.growth = data.value === "grow" ? "grow" : "steady";
    // Visitors from the LP may leave for the waitlist; keep their result on this device.
    if (skillQuiz.fromLp) { state.skillProfile = { level: skillQuizLevel(skillQuiz.answers), growth: skillQuiz.growth, updatedAt: nowIso() }; saveState(); }
  }
  else if (action === "life-quiz-restart") startSkillQuiz();
  else if (action === "life-quiz-close") skillQuiz = null;
  else if (action === "life-quiz-share") {
    const level = skillQuizLevel(skillQuiz.answers);
    shareMessage(`料理スキル診断の結果は「${SKILL_TYPES[level].name}」${Skills.stars(level)} でした。作れる料理だけで献立が決まる「リピごち」`, `${location.origin}${location.pathname}?skill=1`);
    return true;
  } else if (action === "life-quiz-save") {
    const level = skillQuizLevel(skillQuiz.answers);
    state.skillProfile = { level, growth: skillQuiz.growth, diagnosed: true, updatedAt: nowIso() };
    state.planOverrides = {};
    skillQuiz = null;
    // 初回設定の途中で診断した時は、次の質問へ。
    const draft = state.onboardingDraft;
    if (!state.onboarded && draft && FUNNEL[draft.quickSetupIndex] === 2) draft.quickSetupIndex = FUNNEL.indexOf(3);
    saveState();
    if (state.onboarded) showToast(`「${SKILL_TYPES[level].name}」を献立に反映しました。`);
  }
  render();
  globalThis.scrollTo?.({ top: 0 });
  return true;
}
function normalizeSkillProfile(raw) {
  return [1, 2, 3, 4, 5].includes(Number(raw?.level)) ? { level: Number(raw.level), growth: raw.growth === "grow" ? "grow" : "steady", diagnosed: raw.diagnosed === true, updatedAt: normalizeTimestamp(raw.updatedAt) } : null;
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
