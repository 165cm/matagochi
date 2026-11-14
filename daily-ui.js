/* Daily experience. Existing recipe importing/editing remains in app.js. */
let profileEditing = false;
let swapDate = "";
// 「⇄ 変更」の今夜の4皿（2026-11-07 のユーザーの判断・APP_MAP §64）。どれも、その日の候補を開いている間だけ。
// swapMood：上の気分の札（1つだけ）／swapPick：押して✓をつけた料理。
let swapMood = "";
let swapPick = "";
// 今夜の4皿のひとこと用：直前の操作（pass / bulk / undo / unlearn / mood）。写真から開いたレシピ（その中で「決める／戻る」）。
let swapLastAct = "";
let swapDetailId = "";
// 消去法（2026-11-07 のユーザーの判断・APP_MAP §64-2）：消した料理（順番どおり）と、「少なめ」から外した特徴。
let swapRemoved = [];
let swapIgnore = [];
// 決めた料理を変える時、買った材料をどうするか（"" か use＝使う料理を先に〔はじめからON〕／skip＝気にせず選ぶ）。
let swapBought = "";
let cookingDate = "";
let analyzingDate = "";
let editingEvaluationId = "";
let shoppingNotice = "";
let preferencePromptId = "";
let reviewReturnDate = "";
let equipmentGroupIndex = 0;
const profileChapters = [
  "暮らし",
  "暮らし",
  "好み",
  "好み",
  "好み",
  "調理スタイル",
  "調理スタイル",
  "調理器具",
  "常備品",
  "常備品",
  "常備品",
  "常備品",
  "常備品",
  "買い物",
  "使い切り",
  "確認",
];
const profileTitles = [
  "何人分つくる？",
  "自炊する曜日は？",
  "食べられないもの",
  "苦手な食材",
  "好きな料理と、ごはんタイプ",
  "料理に使える時間",
  "どんな作り方がいい？",
  "キッチンの持ちもの",
  ...Object.keys(Lifestyle.pantry),
  "買い物のペース",
  "先に使いたい食材",
  "あなたの設定",
];
function profileDraft() {
  if (!state.onboardingDraft) {
    state.onboardingDraft = Lifestyle.profile({
      ...dailyProfile(),
      step: state.foodProfile?.completed ? 15 : 0,
      startedAt: nowIso(),
    });
    trackDaily("profile_started");
  }
  migrateFunnel(state.onboardingDraft);
  return state.onboardingDraft;
}
// 初回設定の途中の人（以前の順番で保存されている）を、今の順番の同じ画面・なければ次に残っている画面へ移す。何度通しても同じ。
// funnelV：なし＝21段階（FUNNEL_V1）・2＝15画面（FUNNEL_V2）・3＝今の7画面。
function migrateFunnel(p) {
  if (!p || p.funnelV === 3) return;
  const from = p.funnelV === 2 ? FUNNEL_V2 : FUNNEL_V1;
  p.funnelV = 3;
  if (p.quickSetupIndex === null || p.quickSetupIndex === undefined) return;
  // 21段階 → 15画面
  const v1 = { pain: 0, ratio: "talk", staple: "talk", chains: "talk", priority: "talk", type: "talk", commit: "result", building: "result" };
  // 15画面 → 7画面：外した画面は、次に残っている画面へ（リズムは以前は後ろにあったので、外した画面の多くはリズムへ）。
  const v2 = { equipment: 3, 2: 1, talk: 1, videos: 1, demo: 1, loss: 1, goal: 1, remind: "result" };
  let key = from[p.quickSetupIndex];
  if (from === FUNNEL_V1 && key in v1) key = v1[key];
  if (key in v2) key = v2[key];
  const at = FUNNEL.indexOf(key);
  p.quickSetupIndex = at >= 0 ? at : 0;
}
const setupEmoji = ["🍽️", "📅", "🔎", "🥬", "😋", "⏱️", "🧑‍🍳", "🍳", "🧂", "🧈", "🍲", "🌿", "🍚", "🛒", "🥕", "✨"];
const itemEmojis = {"コンロ":"🔥","電子レンジ":"♨️","フライパン":"🍳","鍋":"🍲","包丁":"🔪","まな板":"🥕","ざる":"🥬","ふた":"🍲","計量スプーン":"🥄","炊飯器":"🍚","トースター":"🍞","キッチンばさみ":"✂️","耐熱ボウル":"🥣","電気ケトル":"🫖","オーブン":"🥧","はかり":"⚖️","圧力鍋":"🍲","ミキサー":"🥤","ホットプレート":"🥞","塩":"🧂","砂糖":"🍬","しょうゆ":"🫙","みそ":"🥣","酢":"🍶","みりん":"🍶","料理酒":"🍶","サラダ油":"🌻","オリーブ油":"🫒","ごま油":"🫙","バター":"🧈","マヨネーズ":"🥚","こしょう":"🧂","にんにく":"🧄","しょうが":"🌿","カレー粉":"🍛","米":"🌾","パスタ":"🍝","うどん":"🍜","食パン":"🍞","小麦粉":"🌾","片栗粉":"🥔","ツナ缶":"🐟","トマト缶":"🍅","のり":"🍙","卵":"🥚","乳":"🥛","小麦":"🌾","えび":"🦐","かに":"🦀","そば":"🍜","落花生":"🥜","くるみ":"🌰","大豆":"🫘","魚":"🐟","肉":"🥩","和風":"🍙","洋風":"🍝","中華風":"🥟","和風だし":"🍲","鶏ガラスープの素":"🐓","コンソメ":"🥣","めんつゆ":"🥢","ポン酢":"🍋","ケチャップ":"🍅","中濃ソース":"🥫","焼肉のたれ":"🍖","オイスターソース":"🦪","七味":"🌶️","ごま":"🌱","豆板醤":"🌶️"};
function emojiMark(value) { return `<span class="choice-emoji" aria-hidden="true">${value}</span>`; }
function ownershipCard(field, name) {
  const value = profileDraft()[field][name] || "unknown";
  const action = field === "equipment" ? "life-equipment-toggle" : "life-pantry-toggle";
  return `<button type="button" class="equipment-choice" data-action="${action}" data-name="${escapeAttr(name)}" aria-pressed="${value === 'unknown' ? 'mixed' : value === 'have'}">${emojiMark(itemEmojis[name] || (field === 'equipment' ? '🍴' : '🫙'))}<span>${escapeHtml(name)}</span><strong>${value === 'have' ? '✓ ある' : value === 'none' ? '− ない' : '未確認'}</strong></button>`;
}
function optionInput(field, value, label, multiple = false) {
  const p = profileDraft();
  const selected = multiple
    ? (p[field] || []).includes(value)
    : String(p[field]) === String(value);
  return `<label class="profile-choice"><input type="${multiple ? "checkbox" : "radio"}" name="${field}" data-profile="${field}" ${multiple ? 'data-multiple="true"' : ""} value="${escapeAttr(value)}" ${selected ? "checked" : ""}><span>${itemEmojis[value] ? emojiMark(itemEmojis[value]) : field === "servings" ? emojiMark(Number(value) === 1 ? "🧑" : "🧑‍🤝‍🧑") : ""}${escapeHtml(label)}</span></label>`;
}
function textInput(field, label, placeholder) {
  return `<label class="field">${label}<input class="input" data-profile="${field}" data-list="true" value="${escapeAttr(profileDraft()[field].join("、"))}" placeholder="${escapeAttr(placeholder)}"><small>複数は「、」で区切る</small></label>`;
}
function renderEquipmentFields() {
  const p = profileDraft();
  const seeded = Lifestyle.equipmentDefaults(p.equipment);
  if (JSON.stringify(seeded) !== JSON.stringify(p.equipment)) {
    p.equipment = seeded;
    saveState({scheduleSync: false});
  }
  const group = Lifestyle.equipmentGroups[equipmentGroupIndex];
  const extras = Object.keys(p.equipment).filter(name => !Lifestyle.equipment.includes(name));
  const names = [...group.names, ...(equipmentGroupIndex === 2 ? extras : [])];
  return `<p class="muted">違うものだけタップ（基本は「ある」、ほかは「ない」）</p>
    <div class="equipment-groups" role="group" aria-label="調理器具のグループ">${Lifestyle.equipmentGroups.map((g,index) => `<button type="button" class="equipment-group" data-action="life-equipment-group" data-group="${index}" aria-pressed="${index === equipmentGroupIndex}">${emojiMark(["🍳","🥣","✨"][index])}<span>${["基本","便利","こだわり"][index]}</span></button>`).join('')}</div>
    <div class="equipment-grid" role="group" aria-label="${group.label}">${names.map(name => ownershipCard('equipment', name)).join('')}</div>

    <details class="equipment-custom"><summary>＋ 道具を追加</summary><label class="field">道具の名前<input id="custom-owned" class="input" maxlength="99" placeholder="例：蒸し器"></label><button class="secondary-button" data-action="life-custom" data-field="equipment" type="button">追加する</button></details>`;
}
function ownershipFields(field, names) {
  const p = profileDraft();
  const seeded = Lifestyle.pantryDefaults(p.pantry, names);
  if (JSON.stringify(seeded) !== JSON.stringify(p.pantry)) {
    p.pantry = seeded;
    saveState({scheduleSync:false});
  }
  const extras = Object.keys(profileDraft()[field]).filter(name => !Object.values(Lifestyle.pantry).flat().includes(name));
  return `<p class="muted">定番は「ある」で選択済み。違うものだけタップ。</p><div class="equipment-grid pantry-grid" role="group" aria-label="常備品の選択">${[...new Set([...names,...extras])].map(name => ownershipCard(field,name)).join('')}</div>
    <details class="equipment-custom"><summary>＋ 一覧にないもの</summary><label class="field">名前<input id="custom-owned" class="input" maxlength="99" placeholder="例：白だし"></label><button class="secondary-button" data-action="life-custom" data-field="${field}" type="button">追加する</button></details>`;
}
function profileSummary(p) {
  const owned = (field) =>
    Object.entries(p[field])
      .filter(([, v]) => v === "have")
      .map(([n]) => n)
      .join("、") || "未確認・なし";
  const rows = [
    ["人数", `${p.servings}人分`],
    [
      "自炊する日",
      p.days.length
        ? p.days.map((d) => "日月火水木金土"[Number(d)]).join("・")
        : "毎日提案（未指定）",
    ],
    ["食べられない食材", p.restrictions.join("、") || "未指定"],
    ["苦手な食材", p.dislikes.join("、") || "未指定"],
    ["好きな料理", p.dishPicksAt ? p.dishPicks.map((id) => FoodTaste.IDEAL_OF[id].label).join("、") || "なし" : "写真から選ぶ"],
    ["夜ごはんタイプ", p.dinnerPriorities.length ? DinnerPersona.result(p.dinnerPriorities).title : "診断で見つける"],
    [
      "調理時間",
      `平日 ${p.weekdayMinutes ? `${p.weekdayMinutes}分以内` : "未指定"} / 休日 ${p.weekendMinutes ? `${p.weekendMinutes}分以内` : "未指定"}`,
    ],
    [
      "調理スタイル",
      `${p.skill === "easy" ? "かんたん優先" : "指定なし"}${p.avoidTasks.length ? " / " + p.avoidTasks.join("・") + "を避ける" : ""}`,
    ],
    ["手持ちの器具", owned("equipment")],
    ["手持ちの常備品", owned("pantry")],
    [
      "買い物",
      `${{ daily: "その日ごと", "3days": "数日分", weekly: "週まとめ" }[p.shoppingFrequency] || "未指定"} / ${p.savings ? "食材の使い回し優先" : "好きな味優先"}`,
    ],
    ["使い切りたい", p.useUp.join("、") || "なし"],
  ];
  return `<dl class="profile-summary">${rows.map(([k, v], i) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd>${dailyButton("life-section", "変更", `data-step="${[0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 13, 14][i]}"`)}</div>`).join("")}</dl>`;
}
// ベータ版の目印：いまは晩ごはんだけ（朝ごはん・お弁当はこれから）。
const betaBadge = () => `<span class="beta-badge">ベータ版 <i>for 晩ごはん</i></span>`;
const betaNote = () => `<p class="beta-note">${betaBadge()}${tip("朝ごはん・お弁当は準備中です")}</p>`;
function renderWelcome() {
  document.body.classList.add("is-onboarding");
  // 質問の前に、何ができるアプリかを見せる（文脈がわかってから答えてもらう）。
  document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard welcome-card"><p class="eyebrow">リピごち ${betaBadge()}</p><h2 tabindex="-1">保存した料理動画が、<br><span class="marker">来週の献立</span>になる。</h2>
    <ol class="welcome-flow" aria-label="リピごちでできること"><li><span aria-hidden="true">📱</span><b>動画を貼る</b><small>YouTube</small></li><li><span aria-hidden="true">🤖</span><b>AIが読む</b><small>材料・作り方・時間</small></li><li><span aria-hidden="true">🗓</span><b>献立が決まる</b><small>かぶらず自動で</small></li><li><span aria-hidden="true">🛒</span><b>買い物リスト</b><small>まとめて1回</small></li></ol>
    <p class="small">いくつかの質問に答えると、<b>あなたの家族専用</b>の献立を作ります。</p><p class="muted small beta-line">いまは<b>晩ごはん</b>の献立だけ。朝ごはん・お弁当は準備中です。</p><div class="welcome-actions">${dailyButton("life-quick", "はじめる（約1分）", "", true)}${dailyButton("life-preview", "設定せずに見てみる")}</div><button type="button" class="text-button" data-action="life-detailed">好み・器具・常備品まで詳しく設定する</button></section>`;
  document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handleAction));
}
function renderProfileWizard() {
  if (profileDraft().quickSetupIndex !== null) return renderQuickSetup();
  if (!state.onboarded && profileDraft().step === 0 && !profileDraft().detailedSetup) return renderWelcome();
  const p = profileDraft(),
    step = p.step;
  let content = "";
  if (step === 0)
    content = `<p>好みとキッチンに合わせて献立を提案します。</p><div class="profile-options">${optionInput("servings", 1, "1人分")}${optionInput("servings", 2, "2人分")}</div>`;
  if (step === 1)
    content = `<p>複数選択OK。未選択なら毎日提案します。</p><div class="profile-options">${[1, 2, 3, 4, 5, 6, 0].map((d) => optionInput("days", String(d), "日月火水木金土"[d], true)).join("")}</div><h3>何日分？</h3><div class="profile-options">${optionInput("period", 3, "3日分")}${optionInput("period", 7, "7日分")}</div>`;
  if (step === 2)
    content = `<p>含む料理を除外。市販品の原材料表示も確認してください。</p><div class="profile-options">${Lifestyle.restrictionOptions.map((n) => optionInput("restrictions", n, n, true)).join("")}</div><p class="muted small">一覧外は下に入力。照合できない場合は候補を出しません。</p>${textInput("restrictions", "食べられない食材の一覧", "例：卵、乳")}`;
  if (step === 3)
    content = `<p>嫌いなものを我慢せず、楽しめる料理を。</p>${textInput("dislikes", "苦手な食材", "例：なす、パクチー")}`;
  if (step === 4)
    content = renderTasteQuiz();
  if (step === 5)
    content =
      ["weekdayMinutes", "weekendMinutes"]
        .map(
          (f, i) =>
            `<fieldset><legend>${i ? "休日" : "平日"}</legend><div class="profile-options">${[10, 20, 30, 60].map((n) => optionInput(f, n, `${n}分以内`)).join("")}${optionInput(f, "null", "未指定")}</div></fieldset>`,
        )
        .join("") +
      '<p class="muted small">炊飯時間は別です。</p>';
  if (step === 6)
    content = `<div class="profile-options">${optionInput("skill", "easy", "かんたん優先")}${optionInput("skill", "any", "こだわらない")}${optionInput("skill", "unknown", "未指定")}</div><h3>避けたい作業</h3><div class="profile-options">${["肉を切る", "揚げる", "長く煮込む"].map((n) => optionInput("avoidTasks", n, n, true)).join("")}</div>`;
  if (step === 7) content = renderEquipmentFields();
  if (step >= 8 && step <= 12) {
    const names = Object.values(Lifestyle.pantry)[step - 8];
    content = ownershipFields(
      "pantry",
      step === 12
        ? [
            ...new Set([
              ...names,
              ...Object.keys(p.pantry).filter(
                (n) => !Object.values(Lifestyle.pantry).flat().includes(n),
              ),
            ]),
          ]
        : names,
    );
  }
  if (step === 13)
    content = `<div class="profile-options">${optionInput("shoppingFrequency", "daily", "その日ごと")}${optionInput("shoppingFrequency", "3days", "数日分")}${optionInput("shoppingFrequency", "weekly", "週まとめ")}${optionInput("shoppingFrequency", "unknown", "未指定")}</div><label class="profile-choice"><input type="checkbox" data-profile="savings" ${p.savings ? "checked" : ""}><span>食材を使い回して節約</span></label><p class="muted small">価格の比較や節約額の計算は行いません。</p>`;
  if (step === 14)
    content = `<p>任意。これから7日間の提案で優先します。</p>${textInput("useUp", "冷蔵庫で使い切りたいもの", "例：キャベツ、豆腐")}`;
  if (step === 15)
    content = `<p>この条件で提案します。あとから変更できます。</p>${profileSummary(p)}<p class="muted small">好み・食材制限は端末内に保存（バックアップには含む）。</p>`;
  document.body.classList.toggle("is-onboarding", !state.onboarded);
  document.querySelector("#app").innerHTML =
    `<section class="hero-card profile-wizard" data-step="${step}"><div class="wizard-progress"><span>${profileChapters[step]}</span><span>${step + 1} / 16</span></div><progress max="16" value="${step + 1}" aria-label="初回設定の進捗"></progress><h2 tabindex="-1">${emojiMark(setupEmoji[step])}${profileTitles[step]}</h2>${content}<div class="wizard-footer"><button type="button" class="text-button" data-action="life-back" ${step === 0 ? "disabled" : ""}>戻る</button><button type="button" class="primary-button" data-action="${step === 15 ? "life-finish" : "life-next"}">${step === 15 ? "献立を見る" : "次へ"}</button></div><div class="wizard-secondary">${step < 15 && state.foodProfile?.completed ? '<button type="button" class="text-button" data-action="life-review">設定一覧へ</button>' : ""}${state.onboarded ? '<button type="button" class="text-button" data-action="life-pause">保存して閉じる</button>' : '<p class="muted small">未回答でも進めます · 自動保存</p>'}</div></section>`;
  document
    .querySelectorAll("[data-profile]")
    .forEach((el) => el.addEventListener("input", () => captureProfile(el)));
  bindAutoAdvance();
  document
    .querySelectorAll("[data-action]")
    .forEach((el) => el.addEventListener("click", handleAction));
  if (step === 4) bindTasteQuiz();
}
function captureProfile(el) {
  const p = profileDraft(),
    f = el.dataset.profile;
  if (el.dataset.owned) p[f][el.dataset.owned] = el.value;
  else if (el.dataset.multiple) {
    p[f] = el.checked
      ? [...new Set([...p[f], el.value])]
      : p[f].filter((x) => x !== el.value);
    const text = document.querySelector(`[data-profile="${f}"][data-list]`);
    if (text) text.value = p[f].join("、");
  } else if (el.dataset.list) {
    p[f] = el.value
      .split(/[、,，\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
    document
      .querySelectorAll(`[data-profile="${f}"][data-multiple]`)
      .forEach((box) => (box.checked = p[f].includes(box.value)));
  } else p[f] = el.type === "checkbox" ? el.checked : el.value;
  p.answered = [...new Set([...p.answered, f])];
  saveState({ scheduleSync: false });
}
// Single-question screens move on as soon as an answer is tapped (including the preselected one).
let autoAdvancing = false;
let autoAdvanceTimer = null;
function cancelAutoAdvance() {
  if (autoAdvanceTimer !== null) clearTimeout(autoAdvanceTimer);
  autoAdvanceTimer = null;
  autoAdvancing = false;
}
function bindAutoAdvance() {
  const p = profileDraft();
  const single = p.quickSetupIndex !== null ? [0, 3].includes(FUNNEL[p.quickSetupIndex]) : p.step === 0;
  if (!single) return;
  document.querySelectorAll('.profile-wizard input[type="radio"][data-profile]').forEach((el) =>
    el.addEventListener("click", () => {
      if (autoAdvancing) return;
      autoAdvancing = true;
      captureProfile(el);
      autoAdvanceTimer = setTimeout(() => {
        cancelAutoAdvance();
        if (p.quickSetupIndex !== null) p.quickSetupIndex++;
        else p.step++;
        saveState({ scheduleSync: false });
        render();
        document.querySelector(".profile-wizard h2")?.focus();
      }, 180);
    }),
  );
}
function dailyProfile() {
  return Lifestyle.profile({
    ...state.foodProfile,
    ...state.householdProfile,
    restrictions: [...new Set([...(state.foodProfile?.restrictions || []), ...householdRestrictions()])],
    ...(rhythmOn() ? { days: rhythmDays() } : {}),
    leftovers: activeLeftovers(),
    ...(skillProfile() && !isViewer() ? { skillLevel: state.skillProfile.level, skillGrowth: state.skillProfile.growth } : {}),
    servings: state.servingCount,
  });
}
function allDinnerRecipes() {
  const personal = state.recipes.filter((r) => r.mealType === "dinner");
  const originals = new Set(personal.map((r) => r.starterId));
  return [...new Map([
    ...personal,
    ...Object.values(normalizePlanDrafts(state.planDrafts, state.tombstones?.recipes)).filter(r => !personal.some(p => p.id === r.id)),
    ...(showStarters() ? [...discoverRecipes(), ...Lifestyle.curated.filter((r) => !originals.has(r.id) && !starterHidden().has(r.id))] : []),
  ].map(r => [r.id, r])).values()];
}
// Meals actually eaten (or confirmed and past) in the last two weeks, newest first.
function mealHistory(days = 14) {
  const from = addDays(today(), -days);
  const seen = new Set();
  const out = [];
  const add = (date, recipe) => {
    if (!recipe || !date || date < from || date > today()) return;
    const k = date + "|" + (recipe.id || recipe.title);
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ date, recipe });
  };
  Object.values(state.mealSlots || {}).forEach((s) => {
    if (s.status === "cooked" || (s.status === "confirmed" && s.date < today())) add(s.date, s.recipe);
  });
  (state.evaluations || []).forEach((e) => {
    const r = recipeById(e.recipeId) || Lifestyle.curated.find((c) => c.id === e.recipeId);
    add(e.cookedAt, r || (e.recipeTitle ? { id: e.recipeId, title: e.recipeTitle, ingredients: [] } : null));
  });
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
function lastEatenLabel(recipe) {
  const hit = mealHistory(60).find((m) => m.recipe.id === recipe.id || m.recipe.starterId === recipe.id || recipe.starterId === m.recipe.id || m.recipe.title === recipe.title);
  if (!hit) return "はじめて";
  const gap = daysBetween(hit.date, today());
  return gap === 0 ? "今日" : gap === 1 ? "昨日" : gap === 2 ? "一昨日" : `前回は${gap}日前`;
}
// 描き直しの間だけ、献立の計算結果を覚えておく（render() が始めと終わりを決める。入れ子の描き直しでも、いちばん外で消す）。
let planMemo = null, planMemoDepth = 0;
function beginPlanMemo() { if (planMemoDepth++ === 0) planMemo = { plan: null }; }
function endPlanMemo() { if (--planMemoDepth <= 0) { planMemoDepth = 0; planMemo = null; } }
// exclude：出さない料理のID（わが家のごはん方針の「変えるなら？」で外した料理）。
function dailyPlan({ exclude = [] } = {}) {
  if (planMemo && !exclude.length) return (planMemo.plan ||= dailyPlanNow());
  return dailyPlanNow({ exclude });
}
function dailyPlanNow({ exclude = [] } = {}) {
  const p = dailyProfile();
  const plan = Lifestyle.propose({
    history: mealHistory(120),
    recipes: exclude.length ? planRecipes().filter((r) => !exclude.includes(r.id)) : planRecipes(),
    profile: p,
    slots: state.mealSlots || {},
    start: today(),
    length: rhythmOn() ? rhythmPlanDays() : state.planLength || p.period,
    addDays,
    // 自動提案の保存分（planDrafts）は、パスして休ませている料理を使わない（自分で選んだ planOverrides はそのまま。Codex review #234）。
    overrides: { ...Object.fromEntries(Object.entries(normalizePlanDrafts(state.planDrafts, state.tombstones?.recipes)).filter(([d, r]) => !hiddenParents().has(parentKeyOf(r)) && !starterHidden().has(r.id) && !passRested(r) && Lifestyle.fit(r, p, d).ok).map(([d, r]) => [d, r.id])), ...state.planOverrides },
    // 子の評価がなければ親の評価を引き継ぐ（APP_MAP §48）。
    cyclesOf: plannedCycles(),
    offUntil: prestartUntil(),
    requestOf: openRequestFor,
    // 1回の買い物で作る日。日持ちしない食材の料理を、買い物のすぐあとに回すのに使う。
    rounds: rhythmOn() ? currentBlocks().map((b) => b.dates) : null,
    pins: folderPins(),
    parentOf: parentKeyOf,
    // 「もう出さない」にした親の作り方は、自分で選んだ日だけ（ほかの日に自動では入れない）。
    // パスした料理は3日休ませる（§64-3）。「もう出さない」にした親の作り方も（自分で選んだ日だけ入る）。
    autoBlocked: (() => { const hp = hiddenParents(); return (r) => (hp.size && hp.has(parentKeyOf(r))) || passRested(r); })(),
    // わが家のごはん方針で、この端末の人が「合ってる」と確かめた好みと、家族が「見せる」にした好み（✓ だけ）を加点に使う。
    preferenceOf: (() => {
      const base = state.tasteProfile || state.sharedPolicies ? ProfileTalk.leaner(state.tasteProfile, me(), ProfileTalk.othersFrom(state.sharedPolicies, me(), state.family)) : null;
      const anyLess = Object.values(state.passMemo?.asked || {}).some((a) => a.answer === "less");
      if (!anyLess) return base || undefined;
      // 「少なめにする」と答えた特徴は、少し後ろへ（§64-3）。理由の文は出さない。
      return (recipe, date) => { const b = base?.(recipe, date) || null; const less = passLessOf(recipe); return less ? { ...(b || { reason: "", ids: [] }), score: (b?.score || 0) - less } : b; };
    })(),
  });
  for (const day of plan) {
    if (day.candidate && state.planDrafts?.[day.date] && !state.planOverrides[day.date]) day.candidate.chosen = false;
  }
  return plan;
}
// Why this dish on this day, most important first: request, who wants it again (and when), variety, season.
function planReason(day) {
  const c = day.candidate;
  if (day.slot) return [openRequestFor(day.slot.recipe || {}) && `${openRequestFor(day.slot.recipe).from}のリクエスト`, day.repeat?.reason, day.rotation?.reason, day.useUp?.reason, day.season?.reason].find(Boolean) || "";
  return c ? [c.request && `${c.request.from}のリクエスト`, c.warn, c.chosen && "✋ 自分で決めた一皿", c.challenge && `ちょっと挑戦 ${"★".repeat(c.skillNeed)}`, c.repeat?.reason, c.rotation?.reason, c.useUp?.reason, c.season?.reason].find(Boolean) || "" : "";
}
// The last time someone pressed 買い物完了. Meals confirmed before it were bought on that trip.
function lastShoppedAt() {
  const done = Object.values(state.shopDone || {});
  if (state.round?.status === "done" && state.round.updatedAt) done.push(state.round.updatedAt);
  return done.sort().pop() || "";
}
let shopPage = ""; // 見ている買い物のページ（planPageBlocks の key）
let shopCombineNext = false; // "次回分もまとめて買う"
function resetShopCombine() { shopCombineNext = false; }

function shopBlocks() {
  if (!rhythmOn()) return null;
  const blocks = planPageBlocks();
  if (!blocks.length) return null;
  const curKey = blocks.find((b) => b.end >= today())?.key || blocks[0].key;
  const ci = blocks.findIndex((b) => b.key === curKey);
  return {
    blocks,
    curIndex: ci,
    prev: ci > 0 ? blocks[ci - 1] : null,
    current: blocks[ci] || null,
    next: ci >= 0 && ci + 1 < blocks.length ? blocks[ci + 1] : null,
  };
}

function activeShopBlock() {
  const sb = shopBlocks();
  if (!sb) return null;
  const hit = shopPage && sb.blocks.find((b) => b.key === shopPage);
  if (hit) return hit;
  // 初期表示：「今回」が買い物前なら、たとえ「次回」が決まっていても3日分（今回）をデフォルトにする。
  // 「今回」が買い物済み（追加の未購入品なし）で、「次回」に確定した献立がある時だけ自動的に「次回」を開く。
  if (sb.current && state.shopDone?.[sb.current.key] && sb.next) {
    const curDoneAt = state.shopDone[sb.current.key];
    const curHasNewBuy = blockAllDates(sb.current, sb.blocks).some((d) => {
      const s = state.mealSlots?.[d];
      return s?.status === "confirmed" && !s.bought && (s.updatedAt || "") > curDoneAt;
    });
    const nextHasConfirmed = blockAllDates(sb.next, sb.blocks).some((d) => state.mealSlots?.[d]?.status === "confirmed");
    if (!curHasNewBuy && nextHasConfirmed) return sb.next;
  }
  return sb.current || sb.blocks[0];
}

// 献立を新しく確定・変更した時、買い物済みのページを見たままになっていれば、確定した献立のページへ合わせる
function syncShopPageForDate(date) {
  if (!rhythmOn() || !date) return;
  const sb = shopBlocks();
  if (!sb) return;
  const target = sb.blocks.find((b) => blockAllDates(b, sb.blocks).includes(date));
  if (!target || state.shopDone?.[target.key]) return;
  if (!shopPage) return; // 未固定なら activeShopBlock() が自動で適切に選ぶ
  const pinned = sb.blocks.find((b) => b.key === shopPage);
  if (!pinned || state.shopDone?.[pinned.key] || pinned.end < today()) {
    shopPage = target.key;
  }
}

function shopBlockTabName() {
  const sb = shopBlocks();
  const active = activeShopBlock();
  if (!sb || !active) return "current";
  if (sb.prev?.key === active.key) return "prev";
  if (sb.next?.key === active.key) return "next";
  return "current";
}

// リズムの曜日以外にずらした料理（外食で土曜にずらした分など）も、献立画面と同じかたまりに含める
function blockAllDates(b, blocks = planPageBlocks()) {
  if (!b) return [];
  const idx = blocks.findIndex((x) => x.key === b.key);
  const inAny = new Set(blocks.flatMap((x) => x.dates));
  const nextStart = idx >= 0 && idx + 1 < blocks.length ? blocks[idx + 1].start : "";
  const extra = Object.values(state.mealSlots || {})
    .filter((s) => s && s.date >= b.start && (!nextStart || s.date < nextStart) && !inAny.has(s.date) && ["confirmed", "cooked"].includes(s.status))
    .map((s) => s.date);
  return [...new Set([...b.dates, ...extra])].sort();
}

function tripSlots() {
  if (!rhythmOn()) {
    const since = lastShoppedAt();
    return Object.fromEntries(
      Object.entries(state.mealSlots || {}).filter(([, s]) => s && !s.bought && (!since || (s.updatedAt || "") > since)),
    );
  }
  const sb = shopBlocks();
  const active = activeShopBlock();
  if (!sb || !active) return {};
  if (active.end < today() && !state.shopDone?.[active.key]) return {};

  const targetBlocks = [active];
  if (shopCombineNext && sb.current?.key === active.key && sb.next) {
    targetBlocks.push(sb.next);
  }
  const out = {};
  for (const tb of targetBlocks) {
    const doneAt = state.shopDone?.[tb.key] || "";
    const dates = blockAllDates(tb, sb.blocks);
    for (const d of dates) {
      const s = state.mealSlots?.[d];
      if (!s || s.status !== "confirmed" || !s.recipe) continue;
      if (!doneAt) {
        if (!s.bought || tb.dates.includes(d)) out[d] = s;
      } else if ((s.updatedAt || "") > doneAt && !s.bought) {
        out[d] = s;
      }
    }
  }
  return out;
}

function manualForActivePage() {
  const all = state.manualShopping || {};
  if (!rhythmOn()) return all;
  const sb = shopBlocks();
  const active = activeShopBlock();
  if (!sb || !active) return all;
  if (active.end < today()) return {};
  const doneAt = state.shopDone?.[active.key] || "";
  if (!doneAt) return all;
  // 「今回」が買い物済みで、「次回」が決定済みなら、買い足し品は「次回」側に出す
  if (sb.current?.key === active.key && sb.next && blockStatus(sb.next) === "decided") return {};
  return Object.fromEntries(
    Object.entries(all).filter(([, m]) => m && !m.deleted && (m.updatedAt || "") > doneAt && !/（あとで買う）$/.test(m.name || "")),
  );
}

// Meals this shopping trip is for (confirmed, not cooked, not bought on an earlier trip).
function tripMeals() {
  if (!rhythmOn()) {
    return Object.values(tripSlots()).filter((s) => s.status === "confirmed" && s.date >= today() && s.recipe).sort((a, b) => a.date.localeCompare(b.date));
  }
  return Object.values(tripSlots()).filter((s) => s.status === "confirmed" && s.recipe).sort((a, b) => a.date.localeCompare(b.date));
}

// 表示中ページの対象献立（買い物済み・前回の振り返りでも料理タイルを出す）
function shopPageMeals() {
  if (!rhythmOn()) {
    const active = tripMeals();
    if (active.length) return active;
    if (lastShoppedAt()) {
      return Object.values(state.mealSlots || {})
        .filter((s) => s && s.date >= today() && ["confirmed", "cooked"].includes(s.status) && s.recipe)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return [];
  }
  const sb = shopBlocks();
  const active = activeShopBlock();
  if (!sb || !active) return [];
  const targetBlocks = [active];
  if (shopCombineNext && sb.current?.key === active.key && sb.next) targetBlocks.push(sb.next);
  const dates = targetBlocks.flatMap((tb) => blockAllDates(tb, sb.blocks));
  return dates
    .map((d) => state.mealSlots?.[d])
    .filter((s) => s && ["confirmed", "cooked"].includes(s.status) && s.recipe)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderTripMeals(meals = tripMeals()) {
  if (!meals.length) return "";
  const first = meals[0].date, last = meals[meals.length - 1].date;
  const range = first === last ? `${formatDate(first)}（${weekdayLabel(first)}）` : `${formatDate(first)}（${weekdayLabel(first)}）〜${formatDate(last)}（${weekdayLabel(last)}）`;
  return `<section class="trip-meals" aria-label="この買い物で作るごはん"><p class="trip-range"><b>${range}</b> ${meals.length}食分</p><div class="trip-row">${meals.map((m) => `<button type="button" class="trip-meal" data-action="life-cook" data-date="${m.date}" aria-label="${escapeAttr(`${formatDate(m.date)} ${m.recipe.title}`)}">${dishTile(m.recipe)}<small>${WD[new Date(m.date + "T12:00:00").getDay()]}</small></button>`).join("")}</div></section>`;
}

function dailyShopping() {
  const p = dailyProfile();
  const slots = tripSlots();
  let start = today();
  let end = addDays(today(), (p.shoppingFrequency === "daily" ? 1 : p.shoppingFrequency === "weekly" ? 7 : state.planLength || 3) - 1);
  if (rhythmOn()) {
    start = "0000-01-01";
    end = "9999-12-31";
  }
  const list = Lifestyle.shopping({
    slots,
    start,
    end,
    scale: scaleAmountForServings,
    combine: combineAmounts,
    pantry: p.pantry,
    marks: state.shoppingMarks || {},
    manual: manualForActivePage(),
  });
  // 献立を変える前の「予定している食材」も添える（買い物完了の後は、このリストが空でも差分が分かるように）。
  Object.defineProperty(list, "planned", { value: plannedIngredients(), enumerable: false });
  return list;
}

// 買い物画面で現在見ているページの状態（買い物前か買い物済みか）と全品目（完了後も購入済みリストを表示）
function shopViewContext() {
  const p = dailyProfile();
  const activeItems = dailyShopping();
  if (rhythmOn()) {
    const sb = shopBlocks();
    const b = activeShopBlock();
    if (!sb || !b) return { isShopped: false, doneAt: "", block: null, sb: null, items: activeItems };
    const doneAt = state.shopDone?.[b.key] || "";
    const isPastDecided = !doneAt && b.end < today() && blockAllDates(b, sb.blocks).some((d) => ["confirmed", "cooked"].includes(state.mealSlots?.[d]?.status));
    if (!doneAt && !isPastDecided) {
      return { isShopped: false, doneAt: "", block: b, sb, items: activeItems };
    }
    const dates = blockAllDates(b, sb.blocks);
    const fullSlots = Object.fromEntries(
      dates.map((d) => [d, state.mealSlots?.[d]]).filter(([, s]) => s && ["confirmed", "cooked"].includes(s.status) && s.recipe),
    );
    const rawItems = Lifestyle.shopping({
      slots: fullSlots,
      start: "0000-01-01",
      end: "9999-12-31",
      includeCooked: true,
      scale: scaleAmountForServings,
      combine: combineAmounts,
      pantry: p.pantry,
      marks: state.shoppingMarks || {},
      manual: manualForActivePage(),
    });
    const activeBuyIds = new Set(activeItems.filter((x) => x.status === "buy").map((x) => x.id));
    const marks = state.shoppingMarks || {};
    const merged = rawItems.map((item) => {
      const m = marks[item.id];
      const uncheckedAfterDone = doneAt && m?.status === "buy" && (m.updatedAt || "") > doneAt;
      if (activeBuyIds.has(item.id) || uncheckedAfterDone) return { ...item, status: "buy" };
      if (item.status === "buy") return { ...item, status: "purchased" };
      return item;
    });
    return { isShopped: true, doneAt, block: b, sb, items: merged };
  }
  // リズムOFF時：未購入の買い物があれば「買い物前」。買い物完了後で今後の確定献立がある時は「買い物済み」として購入済みリストを表示
  const since = lastShoppedAt();
  if (!activeItems.length && since) {
    const length = p.shoppingFrequency === "daily" ? 1 : p.shoppingFrequency === "weekly" ? 7 : state.planLength || 3;
    const end = addDays(today(), length - 1);
    const boughtSlots = Object.fromEntries(
      Object.entries(state.mealSlots || {}).filter(([, s]) => s && s.date >= today() && s.date <= end && ["confirmed", "cooked"].includes(s.status) && s.recipe),
    );
    if (Object.keys(boughtSlots).length) {
      const marks = state.shoppingMarks || {};
      const rawItems = Lifestyle.shopping({
        slots: boughtSlots,
        start: today(),
        end,
        includeCooked: true,
        scale: scaleAmountForServings,
        combine: combineAmounts,
        pantry: p.pantry,
        marks,
        manual: {},
      }).map((item) => {
        const m = marks[item.id];
        if (m?.status === "buy" && (m.updatedAt || "") > since) return { ...item, status: "buy" };
        return item.status === "buy" ? { ...item, status: "purchased" } : item;
      });
      return { isShopped: true, doneAt: since, block: null, sb: null, items: rawItems };
    }
  }
  return { isShopped: false, doneAt: "", block: null, sb: null, items: activeItems };
}

function shopPageItems() {
  return shopViewContext().items;
}
// 今日から先の、決めた献立で使う食材。bought：前の買い物で買った料理の材料か、買った印がある。
function plannedIngredients() {
  const trip = tripSlots(), shopped = !!lastShoppedAt(), marks = state.shoppingMarks || {};
  const out = new Map();
  for (const s of Object.values(state.mealSlots || {})) {
    if (s?.status !== "confirmed" || !s.recipe || s.date < today()) continue;
    const onTrip = shopped && !trip[s.date];
    for (const i of s.recipe.ingredients || []) {
      const name = Lifestyle.shoppingName(i.name);
      if (!name || !Lifestyle.isBought(name)) continue;
      // 「あとで」にした品は、前の買い物の料理の材料でも、まだ買っていない。
      const mark = marks[Lifestyle.shoppingKey(name)]?.status;
      const bought = mark === "purchased" || (onTrip && mark !== "later");
      out.set(name, out.get(name) || bought);
    }
    if (s.side) {
      const side = Lifestyle.sideOf?.(s.side);
      for (const i of side?.ingredients || []) {
        const name = Lifestyle.shoppingName(i.name);
        if (!name || !Lifestyle.isBought(name)) continue;
        const mark = marks[Lifestyle.shoppingKey(name)]?.status;
        const bought = mark === "purchased" || (onTrip && mark !== "later");
        out.set(name, out.get(name) || bought);
      }
    }
  }
  return out;
}
// ⓘ：毎回読まなくていい説明は、押した時だけ吹き出しで出す。
const tip = (text) => `<button type="button" class="tip" data-tip="${escapeAttr(text)}" aria-label="${escapeAttr(text)}">ⓘ</button>`;
function dailyButton(action, label, extra = "", primary = false) {
  return `<button type="button" class="${primary ? "primary-button" : "secondary-button"}" data-action="${action}" ${extra}>${label}</button>`;
}
function dishVisual(recipe, hero = false) {
  const photo = recipe ? recipeThumbnail(recipe) : "";
  if (photo)
    return `<img class="daily-photo ${hero ? "large" : ""}" src="${escapeAttr(photo)}" alt="${escapeAttr(recipe.title)}" loading="lazy">`;
  return `<div class="dish-art ${hero ? "large" : ""}" role="img" aria-label="料理写真の代わりの器のイラスト"><svg viewBox="0 0 320 180" aria-hidden="true"><ellipse cx="160" cy="142" rx="105" ry="13" fill="#dacdb7"/><ellipse cx="160" cy="102" rx="105" ry="50" fill="#fffdf7"/><ellipse cx="160" cy="101" rx="84" ry="35" fill="#e5ae69"/><path d="M85 103 Q120 42 156 100 T237 91" fill="none" stroke="#6e8b64" stroke-width="18" stroke-linecap="round"/><ellipse cx="164" cy="101" rx="28" ry="21" fill="#fff9df"/><circle cx="164" cy="100" r="13" fill="#efbc53"/><path d="M101 43 Q89 28 105 17 M162 40 Q150 25 166 14 M217 42 Q205 27 221 16" fill="none" stroke="#baad97" stroke-width="3" stroke-linecap="round"/></svg><small>料理のイメージ</small></div>`;
}
function planThumb(recipe) {
  return dishTile(recipe, "plan-thumb");
}
function planMeta(recipe, reasons = []) {
  const minutes = recipe?.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "";
  return [minutes, ...reasons.filter((r) => !/分目安$|器具を確認/.test(r)).slice(0, 2)].filter(Boolean).join(" · ");
}
function widenButtons(dates = []) {
  if (isViewer()) return "";
  const hp = typeof hiddenParents === "function" ? hiddenParents() : new Set();
  const hints = Lifestyle.widenHints({
    recipes: typeof planRecipes === "function" ? planRecipes() : allDinnerRecipes(),
    profile: dailyProfile(),
    dates,
    cyclesOf: typeof plannedCycles === "function" ? plannedCycles() : () => ({}),
    autoBlocked: hp.size ? (r) => hp.has(typeof parentKeyOf === "function" ? parentKeyOf(r) : "") : () => false,
  });
  return hints.map((h) => dailyButton("life-widen", h.label, `data-key="${h.key}" data-value="${h.value}"`)).join("");
}
function renderPlanStapleNote(recipe, slot, date) {
  if (!recipe) return "";
  const isOther = Lifestyle.traits(recipe).staple === "other";
  if (!isOther && !slot?.side) return "";
  const sideHtml = slot?.side ? `<span class="plan-side-pill">🥢 添え物：${escapeHtml(slot.side)}${!isViewer() ? `<button type="button" class="side-del" data-action="life-remove-side" data-date="${date}" aria-label="添え物を外す">✕</button>` : ""}</span>` : "";
  const foldHtml = !slot?.side && !isViewer() ? `<details class="side-fold"><summary class="side-fold-btn">＋ 添え物</summary><div class="side-chips">${(Lifestyle.QUICK_SIDES || []).map((s) => `<button type="button" class="side-chip" data-action="life-add-side" data-date="${date}" data-side="${escapeAttr(s.name)}">${s.icon} ${escapeHtml(s.name)}</button>`).join("")}</div></details>` : "";
  return `<div class="plan-staple-note">${isOther ? '<span class="staple-tip" title="主菜（おかず）の日は、ごはんの準備をお忘れなく">🍚 ごはん準備</span>' : ""}${sideHtml}${foldHtml}</div>`;
}
function renderPlanBalance(plan, locks = new Set()) {
  if (typeof Lifestyle?.planBalance !== "function") return "";
  const unlocked = (plan || []).filter((d) => !locks.has(d.date));
  const b = Lifestyle.planBalance(unlocked);
  // 内訳はふだん出さない。野菜が少ない時だけ、添え物をすすめる1行（2026-10-28）。
  if (!b || b.vegCount >= 3) return "";
  return `<p class="plan-balance-low small" role="status">🥬 ${escapeHtml(b.vegLabel)}</p>`;
  return `<div class="plan-balance-bar" role="status" aria-label="献立のバランス"><span class="pb-chip pb-protein">${escapeHtml(b.proteinText)}</span><span class="pb-chip pb-veg ${b.vegCount < 3 ? "is-low" : ""}">${escapeHtml(b.vegLabel)}</span><span class="pb-mood">${escapeHtml(b.moodNote)}</span>${tip(`主菜の内訳と、使う野菜の種類（${b.vegKinds.length ? b.vegKinds.join("・") : "なし"}）のざっくり目安です。栄養価の計算ではありません`)}</div>`;
}
function renderDailyPlan() {
  const plan = dailyPlan();
  const locks = lockedDates(plan);
  shareShown(plan.filter((d) => !locks.has(d.date) && !d.off));
  const n = state.planLength || 3;
  // 献立トレイは献立タブの中にまとめる（2026-11-11 のユーザーの判断）：上の献立カードが「トレイ」。下に決定・よはく・候補カード
  const trayDays = isViewer() ? [] : trayTargetDays();
  const trayOn = trayDays.length > 0;
  if (trayOn) prepareInlineTray(trayDays);
  const trayDates = new Set(trayDays.map((d) => d.date));
  const thinking = trayOn && trayThinking;
  const cardList = plan
    .map((day, dayIdx) => {
      const inTray = trayDates.has(day.date);
      const drafted = inTray && Object.prototype.hasOwnProperty.call(trayDraft, day.date) && (trayDraft[day.date] || null) !== (trayInitialDraft[day.date] || null);
      const recipe = inTray ? trayDayRecipe(day) : day.slot?.recipe || day.candidate?.recipe;
      const trayIdx = inTray ? trayDays.findIndex((d) => d.date === day.date) : -1;
      const isActive = inTray && trayActiveDate === day.date && (trayActiveChosen || !trayDayRecipe(day));
      const dateLabel = `${formatDate(day.date)}（${weekdayLabel(day.date)}）`;
      const badge = day.date === today() ? '<span class="today-badge">今夜</span>' : "";
      if (day.prestart) return `<article class="plan-card is-off"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>🛒</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">いつもどおりで</strong><p class="plan-time">献立は${formatDate(prestartUntil())}から</p></div></article>`;
      if (day.slot?.status === "off" || day.off)
        return `<article class="plan-card is-off"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>${SKIP_OF[day.slot?.kind]?.icon || "🌙"}</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">${escapeHtml(skipLabel(day.slot))}</strong><div class="plan-controls"><button type="button" class="plan-icon" data-action="life-reopen" data-date="${day.date}">料理する</button></div></div></article>`;
      // ロックの日：続いている日を1行にまとめる（2日目以降は何も出さない）。
      if (locks.has(day.date)) {
        const i = plan.indexOf(day);
        if (i > 0 && locks.has(plan[i - 1].date)) return "";
        const run = [];
        for (let k = i; k < plan.length && locks.has(plan[k].date); k += 1) run.push(plan[k].date);
        return renderLockStrip(run);
      }
      // トレイの日：よはくが考えている間は点が跳ねる。空にした日は「下から選んでね」
      if (inTray && thinking)
        return `<article class="plan-card is-dish is-thinking" style="--i:${trayIdx}" aria-busy="true"><div class="plan-photo plan-think-photo">${badge}<span class="tray-think-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title plan-think-title">考え中…</strong></div></article>`;
      if (inTray && !recipe)
        return `<article class="plan-card is-dish is-tray-empty ${isActive ? "is-tray-active" : ""}"><button type="button" class="plan-photo plan-empty-photo" data-action="life-tray-select-day" data-date="${day.date}" aria-pressed="${isActive}" aria-label="${dateLabel}の料理を下の候補から選ぶ">${badge}<span>${isActive ? "👇 下のカードから選んでね" : "＋ この日を選ぶ"}</span></button><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">まだ決まっていません</strong></div></article>`;
      if (!recipe)
        return `<article class="plan-card"><div class="plan-photo yohaku-tile">${yohaku("normal")}${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">条件に合う候補がありません</strong><p class="plan-time">時間・食材・器具をゆるめるか、レシピを追加してください。</p><div class="plan-controls">${widenButtons([day.date])}${dailyButton("life-profile", "条件を確認")}</div></div></article>`;
      const status = drafted ? "選び直した" : day.slot?.status === "cooked" ? "作った" : day.slot ? "確定" : "";
      // 文字は少なく（2026-10-28 のユーザーの判断）：前の買い物の食材を使う時だけ添える（ほかの理由は今日の画面で）。
      const note = carryNote(day.slot) || "";
      const minutes = recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "";
      // 「⋯」はカードの下にメニューを開く（カードの外にはみ出すと、スマホでは押せない）。
      const more = day.slot?.status === "cooked" || isViewer() ? "" : `<button type="button" class="plan-icon plan-more-btn" data-action="life-more" data-date="${day.date}" aria-expanded="${moreDate === day.date}" aria-label="${dateLabel}のその他の操作">${moreDate === day.date ? "×" : "⋯"}</button>`;
      const swap = day.slot?.status === "cooked" ? "" : inTray ? `<button type="button" class="plan-icon plan-swap ${isActive ? "is-active" : ""}" data-action="life-tray-select-day" data-date="${day.date}" data-scroll="cards" aria-pressed="${isActive}" aria-label="${dateLabel}の料理を下の候補から選び直す"><span aria-hidden="true">🔄</span><span class="plan-icon-label">${isActive ? "選び直し中" : "選び直す"}</span></button>` : `<button type="button" class="plan-icon plan-swap" data-action="${swapDate === day.date ? "life-close-swap" : "life-swap"}" data-date="${day.date}" aria-expanded="${swapDate === day.date}" aria-label="${swapDate === day.date ? "候補を閉じる" : `${dateLabel}の料理を入れ替える`}">${swapDate === day.date ? "閉じる" : isViewer() ? '<span aria-hidden="true">🙋</span><span class="plan-icon-label">別のがいい</span>' : '<span aria-hidden="true">⇄</span><span class="plan-icon-label">変更</span>'}</button>`;
      // 写真を上に大きく（動画のサムネイルと同じ16:9）。日付・状態・時間は1行に、料理名、ボタンの行（ごはん準備・添え物も同じ行）。
      // 選び直した日は、まだ献立に入っていないので、写真と料理名からはカードの裏面（材料・作り方・動画）を開く
      const open = drafted ? `data-action="life-card-flip" data-recipe="${escapeAttr(recipe.id)}"` : `data-action="life-cook" data-date="${day.date}"`;
      return `<article class="plan-card is-dish ${swapDate === day.date ? "is-swapping" : ""} ${isActive ? "is-tray-active" : ""} ${inTray && trayRevealFresh ? "is-reveal" : ""}" ${inTray ? `style="--i:${trayIdx}"` : ""}><button type="button" class="plan-photo plan-main" ${open} aria-label="${dateLabel} ${escapeAttr(recipe.title)}の作り方を見る">${dishTile(recipe)}${badge}${(() => { const b = day.slot?.status === "cooked" || drafted ? "" : planBadge(day); return b ? `<i class="plan-reason-badge">${escapeHtml(b)}</i>` : ""; })()}</button><div class="plan-body"><p class="plan-date">${dateLabel}${status ? ` · <b class="plan-status">${status}</b>` : ""}${minutes ? ` · ${minutes}` : ""}</p><button type="button" class="plan-title" ${open}>${recipeTitleHtml(recipe)}</button>${note ? `<p class="hand plan-note">${escapeHtml(note)}</p>` : ""}${!isViewer() && !recipe.steps?.length && canRereadRecipe(recipe) ? `<button type="button" class="text-button plan-fill" data-action="life-fill-video" data-recipe="${escapeAttr(recipe.id)}" ${rereadingId ? "disabled" : ""}>${rereadingId === recipe.id ? "動画を読んでいます…" : "🎬 動画で作り方をそろえる"}</button>` : ""}<div class="plan-controls">${drafted ? "" : renderPlanStapleNote(recipe, day.slot, day.date)}${swap}${drafted ? "" : more}</div></div>${day.slot && !drafted ? conditionWarning(recipe, day.date) : ""}${renderSwapRequests(day.date)}</article>${renderPlanMenu(plan, day)}${renderSkipPanel(day.date)}`;
    })
    ;
  // 条件に合う料理が足りず、同じ料理が2回出ている時は、条件をゆるめずにそう伝える（PR 4a・docs/PERSONALIZE_PLAN.md §7.2）。
  const repeats = plan.filter((d) => d.candidate?.repeated && !locks.has(d.date)).length;
  const shortNote = repeats && !isViewer() ? `<p class="plan-short small" role="status"><span>🔁 合う料理が少なく、同じ料理が${repeats}回出ています ${tip("食べられないもの・時間などの条件はゆるめません。レシピを足すと、ちがう料理が出せます")}</span>${widenButtons(plan.filter((d) => !locks.has(d.date) && !d.off && !d.prestart && !d.slot).map((d) => d.date))}${dailyButton("go-view", "レシピを足す", 'data-view="collection"')}</p>` : "";
  // リズムの時は、買い物のひとかたまり（例：木〜土）を1ページにして横に並べる（2026-10-28 のユーザーの判断：
  // ひとかたまりを1画面で完結・次のかたまりは横スライド・食べた日は評価といっしょに残す）。
  const cards = shortNote + (rhythmOn() ? renderPlanPages(plan, cardList, locks) : cardList.join(""));
  const ready = plan.filter((d) => d.candidate && !locks.has(d.date)).length;
  // 献立画面は「この数日分を決めて、買い物へ」だけに絞る（2026-10-28 のユーザーの判断）。献立をいちばん上に置き、
  // その下は押すことがある時だけ：無料の日数・リクエストの受付（ふたり）・野菜が少ない時の1行・届いたリクエスト・残っている食材・リズムの案内。
  // 外したもの：週のカレンダー（ページと同じ情報）・バランスの内訳・まとめて評価（ページの「評価する」と今日の画面で）・
  // 動画の読み取りの案内・ふたりで使う誘い（最初の献立の画面で1回）・「お試しの提案」・食材制限の ⓘ（作る画面と設定にある）。
  const list = `<section class="plan-list">${cards}${trayOn && !rhythmOn() ? renderTrayActionBar(trayDays) : ready && !isViewer() && !rhythmOn() ? dailyButton("life-confirm", "これで決定・買い物へ", "", true) : ""}</section>`;
  return `${renderFirstPlanReveal()}<section class="plan-top"><div class="plan-tools page-actions">${rhythmOn() ? "" : `<div class="segmented" role="group" aria-label="献立の日数">${[3, 7].map((d) => `<button class="choice-button" aria-pressed="${n === d}" data-action="life-length" data-length="${d}">${d}日</button>`).join("")}</div>`}${isViewer() ? "" : `<button type="button" class="round-icon" data-action="${!state.foodProfile?.completed ? "life-quick" : "life-profile"}" aria-label="条件を調整"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>`}</div></section>${list}${trayOn ? renderCardTraySheet() : ""}${renderFreeUsedCard(plan)}${renderRoundCard()}${renderPlanBalance(plan, locks)}${isViewer() ? "" : renderRequests()}${renderLeftoverPanel()}${renderRhythmInvite()}${swapDate ? renderSwapChoices() : ""}${trayFlipId ? renderCardFlipModal() : ""}${renderCardGetModal()}`;
}
// ---- 献立のページ（買い物のひとかたまりごと・横スライド） ----
let planPage = ""; // 見ているページ（ひとかたまりの key）。描き直しても同じページのまま
function planPageBlocks() {
  const from = state.rhythm?.startFrom || "";
  const prev = blocksFrom(addDays(today(), -14), 28).filter((b) => b.end < today() && (!from || b.start >= from)).pop();
  return [...(prev ? [prev] : []), ...currentBlocks()];
}
// 食べた日（今日より前）：写真・料理名と、評価（なければ「評価する」）。
function renderPastPlanRow(date) {
  const slot = state.mealSlots?.[date];
  const dateLabel = `${formatDate(date)}（${weekdayLabel(date)}）`;
  if (slot?.status === "off") return `<article class="plan-card is-past is-off-row"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>${SKIP_OF[slot.kind]?.icon || "🌙"}</span></span></div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">${escapeHtml(skipLabel(slot))}</strong></div></article>`;
  const e = (state.evaluations || []).find((x) => x.id === `meal-${date}` || (String(x.cookedAt || "").slice(0, 10) === date && (!slot?.recipe || x.recipeId === slot.recipe.id)));
  const recipe = slot?.recipe || (e && (recipeById(e.recipeId) || allDinnerRecipes().find((r) => r.id === e.recipeId))) || null;
  // 記録のない日は出さない（空の行は邪魔なだけ）。
  if (!recipe) return "";
  const rated = Object.entries(e?.familyRepeatCycles || {}).filter(([, c]) => c);
  const rating = rated.length ? rated.map(([n, c]) => { const ch = REVIEW_CHOICES.find((x) => x[0] === c); return ch ? `${ch[1]} ${rated.length > 1 ? `${escapeHtml(n)} ` : ""}${ch[2]}` : ""; }).filter(Boolean).join("・") : "";
  const action = isViewer() ? "" : e ? `<button type="button" class="plan-icon" data-action="life-edit-record" data-id="${escapeAttr(e.id)}">${rating ? "記録" : "⭐ 評価する"}</button>` : slot?.status === "confirmed" && canRecordDate(date) ? dailyButton("life-record-past", "作った", `data-date="${date}"`) : "";
  return `<article class="plan-card is-past"><div class="plan-photo">${dishTile(recipe)}<i class="past-check" aria-hidden="true">✓</i></div><div class="plan-body"><p class="plan-date">${dateLabel} · ${e ? "食べた" : "予定だった"}</p><strong class="plan-title">${recipeTitleHtml(recipe)}</strong>${rating ? `<p class="plan-rating">${rating}</p>` : ""}<div class="plan-controls">${action}</div></div></article>`;
}
function renderPlanPages(plan, cardList, locks) {
  const blocks = planPageBlocks();
  if (!blocks.length) return cardList.join("");
  const at = new Map(plan.map((d, i) => [d.date, i]));
  const label = { open: (b) => `受付中・${deadlineLabel(b.shopAt)}に買い物`, late: () => "買い物の予定を過ぎました", decided: () => "決定 ✓", shopped: () => "買い物済み ✓", past: () => "おわり" };
  // 初めて開いた時は、今日をふくむ（なければ次の）ページから。
  const current = blocks.find((b) => b.end >= today())?.key || blocks[0].key;
  if (!blocks.some((b) => b.key === planPage)) planPage = current;
  // リズムの曜日でない日に入った献立（外食した日の分を土曜に作る など）は、その前のかたまりのページに足す。
  const inBlock = new Set(blocks.flatMap((b) => b.dates));
  const extra = (b, i) => plan.filter((d) => d.date >= b.start && (i === blocks.length - 1 || d.date < blocks[i + 1].start) && !inBlock.has(d.date) && d.slot && d.slot.status !== "removed" && d.slot.status !== "off").map((d) => d.date);
  const pages = blocks.map((b, i) => {
    const st = blockStatus(b);
    const rows = [...b.dates, ...extra(b, i)].sort().map((d) => (d < today() ? renderPastPlanRow(d) : at.has(d) ? cardList[at.get(d)] : "")).join("");
    const needs = plan.some((d) => b.dates.includes(d.date) && d.candidate && !locks.has(d.date));
    const isTrayBlock = !isViewer() && trayTargetDates.length && b.dates.some((d) => trayTargetDates.includes(d));
    const foot = isTrayBlock ? `<div class="block-foot">${renderTrayActionBar(trayTargetDays())}</div>` : needs && !isViewer() ? `<div class="block-foot">${dailyButton("life-confirm", `${blockRange(b)}をこれで決定`, `data-block="${b.key}"`, true)}</div>` : "";
    return `<section class="plan-page" data-page="${b.key}" aria-label="${escapeAttr(blockRange(b))}の献立"><h3 class="block-head is-${st}"><span>${blockRange(b)}</span><small>${(label[st] || label.past)(b)}</small></h3>${rows}${foot}</section>`;
  }).join("");
  // 同じ曜日のかたまり（木〜土が2つ）でも見分けられるように、タブは「前回・今回・次回」。
  const ci = blocks.findIndex((b) => b.key === current);
  const name = (i) => ({ "-1": "前回", 0: "今回", 1: "次回" })[i - ci] || (i < ci ? `${ci - i}回前` : `${i - ci}回先`);
  const dots = blocks.length > 1 ? `<div class="plan-dots" role="group" aria-label="献立のページ">${blocks.map((b, i) => `<button type="button" class="plan-dot" data-action="life-plan-page" data-page="${b.key}" aria-pressed="${b.key === planPage}" aria-label="${escapeAttr(`${name(i)}（${blockRange(b)}）`)}">${name(i)}</button>`).join("")}</div>` : "";
  return `${dots}<div class="plan-pages" data-plan-pages>${pages}</div>`;
}
// 描いたあと、見ていたページへ（横の位置だけ。縦は動かさない）。指で動かしたら、そのページを覚える。
function placePlanPages({ smooth = false } = {}) {
  const box = document.querySelector?.("[data-plan-pages]");
  if (!box) return;
  const page = [...box.children].find((el) => el.dataset.page === planPage);
  if (page) box.scrollTo?.({ left: page.offsetLeft - box.offsetLeft, behavior: smooth ? "smooth" : "instant" });
  let t = null;
  box.addEventListener?.("scroll", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const near = [...box.children].reduce((a, el) => (Math.abs(el.offsetLeft - box.offsetLeft - box.scrollLeft) < Math.abs(a.offsetLeft - box.offsetLeft - box.scrollLeft) ? el : a));
      if (near?.dataset.page && near.dataset.page !== planPage) {
        // 選び直しの途中は、ほかのかたまりへ動かない（ボタンで動く時と同じ。Codex review #240）
        if (isTrayDraftActive()) {
          showToast("選び直しの途中です。先に決定するか「元の献立に戻す」を押してね");
          placePlanPages({ smooth: true });
          return;
        }
        planPage = near.dataset.page;
        document.querySelectorAll(".plan-dot").forEach((d) => d.setAttribute("aria-pressed", String(d.dataset.page === planPage)));
        // 下の候補カード・決定ボタンを、見ているかたまりの日に合わせて描き直す
        if (!isViewer() && typeof render === "function") render();
      }
    }, 120);
  }, { passive: true });
}
// 好きの度合い（評価）：「明日でも」がいちばん。家族の中でいちばん低い評価で比べる。
const LOVE = { tomorrow: 5, weekly: 4, twice_month: 3, monthly: 2, pause: 1 };
function loveScore(r) {
  const c = Object.values(recipeRatings(r)).filter((x) => LOVE[x]);
  return c.length ? Math.min(...c.map((x) => LOVE[x])) : 0;
}
// 🔗 動画のURLから、その日の献立に入れる。YouTubeは説明文をその場で読む（1日の上限は使わない）。
// ほかのURL（TikTokなど）は登録画面で読み取り、保存したらその日に入れる（urlInsertDate）。
let urlInsert = { date: "", status: "idle", message: "" };
let urlInsertDate = "";
function placeOnDate(date, recipe) {
  if (!date || !recipe) return;
  const before = dailyShopping();
  if (state.mealSlots[date]?.status === "confirmed") confirmDaily({ date }, recipe);
  else state.planOverrides[date] = recipe.id;
  changedShopping(before);
  trackDaily("plan_url_inserted");
}
async function insertFromUrl(date, raw) {
  const url = (String(raw || "").match(/https?:\/\/\S+/) || [""])[0];
  if (!url) { urlInsert = { date, status: "error", message: "動画のURLを貼ってください" }; render(); return; }
  const vid = youtubeVideoId(url);
  const saved = state.recipes.find((r) => r.mealType === "dinner" && (r.videoUrl === url || (vid && youtubeVideoId(r.videoUrl) === vid)));
  const done = (recipe, note = "") => {
    placeOnDate(date, recipe);
    urlInsert = { date: "", status: "idle", message: "" };
    swapDate = "";
    saveState(); render();
    showToast(`${formatDate(date)}に「${recipe.title}」を入れました${note}`);
  };
  if (saved) return done(saved);
  if (!vid || !API_BASE_URL) {
    // YouTube以外：登録画面で読み取って、保存したらこの日に入れる。
    if (!startRecipeFromText(url)) return;
    urlInsertDate = date; urlInsert = { date: "", status: "idle", message: "" }; swapDate = "";
    state.fetchStatus = "読み取っています…"; saveState(); render();
    setTimeout(() => document.querySelector('[data-action="fetch-caption"]:not([disabled])')?.click(), 300);
    return;
  }
  urlInsert = { date, status: "loading", message: "" }; render();
  try {
    const result = await importRecipeFromYouTube(url);
    const videoId = result.videoId || vid;
    const recipe = saveOwnRecipe(discoverRecipe({ ...result, videoUrl: result.videoUrl || url, videoId, thumbnailUrl: result.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }, "url"));
    // 共通レシピの目印（版）を残す（運営があとで直した時に「新しい作り方にする」を出せるように。2026-11-01）。
    if (result.catalog?.id && !recipe.catalog) {
      recipe.catalog = { id: result.catalog.id, revision: result.catalog.revision || "" };
      recipe.sourceRevision = result.catalog.revision || "";
      recipe.sourcePrint = sourcePrint(recipe);
    }
    done(recipe, (recipe.steps || []).length ? "" : "（作り方は、作る画面の📹で動画から読めます）");
  } catch (error) {
    urlInsert = { date, status: "error", message: isLimitError(error) ? "今日の上限に達しました（明日また使えます）" : (error.message || "読み取れませんでした") };
    render();
  }
}
function renderUrlInsert() {
  if (isViewer()) return "";
  const u = urlInsert.date === swapDate ? urlInsert : { status: "idle" };
  if (u.status === "loading") return `<div class="swap-url is-busy" aria-live="polite">🤖 動画を読んでいます…</div>`;
  // ふだんは閉じた1行（今夜を決める画面では写真を主役に。2026-11-07）。読み取りに失敗した時は開いたまま。
  return `<details class="swap-url-fold"${u.status === "error" ? " open" : ""}><summary>🔗 動画から入れる</summary><div class="swap-url"><input id="swap-url" class="input" type="url" inputmode="url" placeholder="動画のURLを貼る" aria-label="動画のURL"><button type="button" class="primary-button" data-action="life-url-insert" data-date="${swapDate}">入れる</button></div>${u.status === "error" ? `<p class="form-error small">${escapeHtml(u.message)}</p>` : ""}</details>`;
}
// 買った材料を使い切る時の重み（売り場で決める）：主役で傷みやすい肉・魚・豆腐など3、野菜・卵など1。
// 調味料・乾物・缶詰・米や麺は買い置きできるので0（聞かない・数えない。ごはんはほとんどの料理で使うので手がかりにもならない）。
const REUSE_WEIGHT = { meat: 3, fish: 3, daily: 3, veg: 1, chilled: 1, frozen: 1, other: 1, staple: 0, dry: 0, seasoning: 0 };
// その日の決めた料理の材料のうち、もう買ったもの [{ name, weight }]（重い順）。
function swapBoughtItems(date) {
  const slot = state.mealSlots?.[date];
  if (slot?.status !== "confirmed" || !slot.recipe) return [];
  const planned = plannedIngredients(), seen = new Set(), out = [];
  for (const i of slot.recipe.ingredients || []) {
    const name = Lifestyle.shoppingName(i.name);
    if (!name || seen.has(name) || planned.get(name) !== true) continue;
    seen.add(name);
    const weight = REUSE_WEIGHT[Aisles.aisleOf(name, i.category, state.aisleOverrides || {})] ?? 1;
    if (weight > 0) out.push({ name, weight });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
const usesNames = (r, items) => items.filter((x) => (r.ingredients || []).some((i) => Lifestyle.shoppingName(i.name) === x.name));
const reuseScore = (r, items) => usesNames(r, items).reduce((n, x) => n + x.weight, 0);
const namesOf = (items, n = 3) => items.slice(0, n).map((x) => x.name).join("・");
// 気分の札（「何なら食べたい？」。押すとその場で、その札に合う料理だけにしぼる。ごはん方針は変えない）。
// 合う料理が0品の札は出さない（レシピタブの気分のボタンと同じ決まり）。第2回ブレストで5つに（2026-11-07）。
const SWAP_MOODS = [
  ["usual", "😋 いつもの", (r) => cookCount(r) > 0 && loveScore(r) >= 3],
  ["quick", "⚡ 15分以内", (r) => (r.planning?.minutes || 99) <= 15],
  ["meat", "🥩 肉", (r) => Lifestyle.traits(r).protein === "meat"],
  ["fish", "🐟 魚", (r) => Lifestyle.traits(r).protein === "fish"],
  ["light", "🍋 さっぱり", (r) => Lifestyle.tags(r).includes("light")],
];
// 並べる数：スマホは4皿（2×2）。画面が広い（幅600px以上）か、縦に長い（高さ900px以上）時は6皿（2026-11-08 のユーザーの判断）。
// 広い画面は3列×2段、縦に長いスマホは2列×3段（列の数は CSS で決める）。
// 縦の長さは、Safari のアドレスバーが出たり引っ込んだりしても変わらない画面の高さ（screen.height）で決める（見えている高さで決めると、
// 下へ動かすたびに4皿と6皿が入れ替わってしまう。レビューで見つけた）。縦持ちの時だけ見る（iPhone は横にしても screen の値が縦のまま）。
function swapSize() {
  const w = Number(globalThis.innerWidth) || 0, h = Number(globalThis.innerHeight) || 0;
  const tall = h > w && Math.max(h, Number(globalThis.screen?.height) || 0) >= 900;
  return w >= 600 || tall ? 6 : 4;
}
// 料理の札（1つだけ）。今夜の4皿では写真の外（料理名の下の行）に出す（YouTube のサムネイルの文字とぶつけない）。
function dishBadge(r, { reuse = [], medal = "" } = {}) {
  if (medal) return medal;
  if (openRequestFor(r)) return "🙋 リクエスト";
  if (reuse.length && usesNames(r, reuse).length) return `🧺 ${usesNames(r, reuse)[0].name}`;
  const love = loveScore(r);
  if (love >= 4) return "😋 好物";
  if (lastEatenLabel(r) === "はじめて") return "🆕 はじめて";
  return "";
}
// ---- 消去法で寄せる（§64-2。第3回の相談で直した：2026-11-07） ----
// 料理の特徴と重み。パスした料理と同じ特徴をもつ料理を、その場だけ後ろへ回す。
// 主役（鶏・豚・魚 など）1.5／主役の大きな種類だけ同じ 0.5（魚は1.5）・主役と二重に足さない／食べ方の形（おかず・丼・麺・パン）2／
// こってり・ピリ辛・さっぱり・汁もの 2（合わせて3まで）／和洋中 0.5／時間は使わない（「⚡ 15分以内」の札で選ぶ）。
const SWAP_FEATURE_LABEL = {
  "g:meat": "🍖 肉", "g:fish": "🐟 魚", "g:eggtofu": "🥚 卵・豆腐", "g:veg": "🥬 野菜",
  "s:rice": "🍚 丼・ごはんもの", "s:noodle": "🍜 麺", "s:bread": "🍞 パン", "s:other": "🍽 おかず",
  "c:japanese": "和風", "c:western": "洋風", "c:chinese": "中華",
  "t:rich": "こってり", "t:spicy": "ピリ辛", "t:light": "さっぱり", "t:soup": "汁もの",
};
const SWAP_MAIN = ["chicken", "pork", "beef", "mince", "fish", "egg", "tofu"];
const SWAP_WEIGHT = { p: 1.5, s: 2, t: 2, c: 0.5, g: 0.5, "g:fish": 1.5 };
// 気分の札で選んだ特徴は「少なめ」にしない（本人の指定を推測より優先。Codex の案）。
const SWAP_MOOD_KEEPS = { meat: ["g:meat"], fish: ["g:fish"], light: ["t:light"] };
const swapFeatureMemo = new Map();
function swapFeatures(r) {
  if (swapFeatureMemo.has(r)) return swapFeatureMemo.get(r);
  const t = Lifestyle.traits(r), tags = Lifestyle.tags(r);
  const main = SWAP_MAIN.find((k) => tags.includes(k)) || "veg";
  const out = [`p:${main}`, `g:${t.protein}`, `s:${t.staple}`, `c:${t.cuisine}`, ...["rich", "spicy", "light", "soup"].filter((k) => tags.includes(k)).map((k) => `t:${k}`)];
  swapFeatureMemo.set(r, out);
  return out;
}
const swapWeight = (k) => SWAP_WEIGHT[k] ?? SWAP_WEIGHT[k.slice(0, 1)] ?? 0;
// 同じ特徴を何品パスしたかの強さ：1品=1・2品=1.5・3品以上=2 で頭打ち（0.5品＝元の献立の料理）。
const swapMult = (n) => (n <= 0 ? 0 : n < 1 ? n : n < 2 ? 1 + (n - 1) * 0.5 : Math.min(2, 1.5 + (n - 2) * 0.5));
// パスした料理たちから、特徴ごとの数と「どちらか分からない」特徴（魚の丼だけを2品＝魚と丼が同じ顔ぶれ）を数える。
function swapEvidence(removed, original = null) {
  const ignore = new Set([...swapIgnore, ...(SWAP_MOOD_KEEPS[swapMood] || [])]);
  const who = new Map();
  removed.forEach((r, i) => swapFeatures(r).forEach((k) => { if (!ignore.has(k)) who.set(k, [...(who.get(k) || []), i]); }));
  const count = new Map([...who].map(([k, list]) => [k, list.length]));
  if (original) swapFeatures(original).forEach((k) => { if (!ignore.has(k)) count.set(k, (count.get(k) || 0) + 0.5); });
  // 見せる特徴（主役の大きな種類・食べ方の形・味）で、2品以上が同じ顔ぶれの組は、どちらが理由か分からない → 強くしない・見せない。
  const shown = [...who].filter(([k, list]) => /^[gst]:/.test(k) && list.length >= 2);
  const unsure = new Set();
  shown.forEach(([k, list], i) => shown.forEach(([k2, list2], j) => { if (i !== j && list.join() === list2.join()) { unsure.add(k); unsure.add(k2); } }));
  return { count, unsure, who };
}
// パスした料理たちとの重なり（大きいほど後ろへ）。
function swapPenalty(r, ev) {
  if (!ev.count.size) return 0;
  const mine = swapFeatures(r);
  let n = 0, taste = 0;
  const main = mine.find((k) => k.startsWith("p:"));
  for (const k of mine) {
    const c = ev.count.get(k);
    if (!c) continue;
    if (k.startsWith("g:") && ev.count.get(main)) continue; // 主役が同じなら、大きな種類は足さない
    const w = swapWeight(k) * swapMult(c) * (ev.unsure.has(k) ? 0.5 : 1);
    if (k.startsWith("t:")) taste += w; else n += w;
  }
  return n + Math.min(3, taste);
}
// いま並んでいる料理と重なる分（散らすため。肉・魚などの大きな種類2・食べ方の形1.5・味の系統1）。
function swapCrowd(r, shown) {
  const t = Lifestyle.traits(r);
  return shown.reduce((n, x) => { const u = Lifestyle.traits(x); return n + (u.protein === t.protein ? 2 : 0) + (u.staple === t.staple ? 1.5 : 0) + (u.cuisine === t.cuisine ? 1 : 0); }, 0);
}
// 次の1皿：点数の順（list の並び）を土台に、パスした料理と似ているほど・並んでいる料理と同じ種類ほど後ろへ。
function swapBest(list, exclude, ev, shown, diverse) {
  let best = null, bestScore = -Infinity;
  list.forEach((x, i) => {
    if (exclude.has(x.r.id)) return;
    const score = -i * 0.05 - swapPenalty(x.r, ev) - (diverse ? swapCrowd(x.r, shown) : 0);
    if (score > bestScore) { best = x; bestScore = score; }
  });
  return best;
}
// 最初の4皿：好物を1枚（周期が来ている＝前回から7日以上）＋散らした3皿（主役・食べ方の形・味がなるべく重ならない）。
// 元の献立の料理は 0.5品ぶんパスした扱い（変更を開いた＝今夜の気分ではない。Gemini の案）。
function swapFirstFour(list, diverse, original) {
  const picks = [];
  const ev = swapEvidence([], original);
  const gap = (r) => { const m = /(\d+)日前/.exec(lastEatenLabel(r)); return m ? Number(m[1]) : 0; };
  const fav = diverse && list.find((x) => cookCount(x.r) > 0 && loveScore(x.r) >= 4 && gap(x.r) >= 7);
  if (fav) picks.push(fav);
  while (picks.length < swapSize()) {
    const next = swapBest(list, new Set(picks.map((x) => x.r.id)), ev, picks.map((x) => x.r), diverse);
    if (!next) break;
    picks.push(next);
  }
  return picks;
}
// swapRemoved の1件：{ id, bulk }。bulk＝「🔄 別の4皿」（その4皿は出さないが、特徴は学ばない）。
const swapEntry = (x) => (typeof x === "string" ? { id: x, bulk: false } : x);
// 今の4皿：最初の4皿から、パスした順に1枚ずつ入れ替えた結果（描き直しても同じ＝「↩ 戻す」は最後の1つを消すだけ）。
// 1回ごとに「その時までの手がかり」で選ぶので、前に入った料理は、あとのパスで入れ替わらない（パスした枠だけ変わる。Codex review #234）。
function swapSlots(list, first, diverse, original) {
  const byId = new Map(list.map((x) => [x.r.id, x]));
  const entries = swapRemoved.map(swapEntry);
  const removed = [], gone = new Set(), goneParents = new Set();
  const slots = [...first], placed = new Set(first.map((x) => x.r.id));
  for (const e of entries) {
    gone.add(e.id);
    if (!e.bulk) {
      const r = byId.get(e.id)?.r || allDinnerRecipes().find((x) => x.id === e.id);
      if (r) {
        removed.push(r);
        // パスした料理と同じ料理名（親）は、その場では別の作り方も出さない（Claude・Codex の案）。
        const k = parentKeyOf(r);
        if (k) goneParents.add(k);
      }
    }
    const at = slots.findIndex((x) => x?.r.id === e.id);
    if (at < 0) continue;
    const ev = swapEvidence(removed, original);
    const pool = list.filter((x) => !gone.has(x.r.id) && !placed.has(x.r.id) && !goneParents.has(parentKeyOf(x.r)));
    const next = swapBest(pool, new Set(), ev, slots.filter((x, i) => x && i !== at).map((x) => x.r), diverse);
    slots[at] = next || null;
    if (next) placed.add(next.r.id);
  }
  const ev = swapEvidence(removed, original);
  // いちばん最近入った料理（ふわっと出す）。
  const last = entries.length ? entries[entries.length - 1] : null;
  const fresh = last ? slots.filter((x, i) => x && x.r.id !== first[i]?.r.id && (last.bulk || first[i]?.r.id === last.id || !first.some((f) => f.r.id === last.id))).map((x) => x.r.id) : [];
  const left = list.filter((x) => !gone.has(x.r.id) && !placed.has(x.r.id) && !goneParents.has(parentKeyOf(x.r))).length;
  return { slots, removed, ev, fresh: last?.bulk ? fresh : fresh.slice(-1), left };
}
// 今並んでいる4皿の id（「4皿とも消す」で使う）。
function swapCurrentIds() {
  beginPlanMemo();
  try { return swapCurrentIdsNow(); } finally { endPlanMemo(); }
}
function swapCurrentIdsNow() {
  return [...renderSwapChoices().matchAll(/data-action="life-swap-remove" data-recipe="([^"]+)"/g)].map((m) => m[1]);
}
// 「少なめ」：パスした料理に2品以上で共通する特徴（主役の大きな種類・食べ方の形・味）。どちらが理由か分からない組は出さない。多い順に2つまで。
function swapLearned(ev) {
  return [...ev.who].filter(([k, list]) => /^[gst]:/.test(k) && SWAP_FEATURE_LABEL[k] && list.length >= 2 && !ev.unsure.has(k))
    .sort((a, b) => b[1].length - a[1].length || swapWeight(b[0]) - swapWeight(a[0])).slice(0, 2).map(([k]) => k);
}
// 献立のカードの札：理由（planReason）を短い札にする（2026-11-07 のユーザーの判断で、理由を札1つだけ戻す）。
function planBadge(day) {
  const reason = planReason(day);
  if (!reason) return "";
  if (/リクエスト/.test(reason)) return "🙋 リクエスト";
  if (/自分で決めた/.test(reason)) return "";
  if (/好物/.test(reason)) return "😋 好物";
  if (/挑戦/.test(reason)) return "★ 挑戦";
  if (/使い回し/.test(reason)) return "🧺 使い回し";
  if (/毎週/.test(reason) && /📌/.test(reason)) return reason.slice(0, 8);
  if (/^[🌸🌻🍂⛄]/u.test(reason)) return reason.slice(0, 7);
  if (/日ぶり|久しぶり|ちょうどいい頃/.test(reason)) return "🔁 久しぶり";
  return "";
}
// 今夜の4皿の候補：条件に合う料理だけ（食べられないもの・器具・時間はゆるめない）。料理名（親）ごとに1枚。
function swapCandidates() {
  const p = dailyProfile();
  const bought = isViewer() ? [] : swapBoughtItems(swapDate);
  const reuse = bought.length && swapBought !== "skip" ? bought : [];
  const plan = dailyPlan();
  const current = plan.find((d) => d.date === swapDate);
  const currentRecipe = current?.slot?.recipe || current?.candidate?.recipe;
  const used = new Set(plan.filter((d) => d.date !== swapDate).map((d) => d.slot?.recipe?.id || d.candidate?.recipe.id));
  const currentParent = currentRecipe ? parentKeyOf(currentRecipe) : "";
  const all = allDinnerRecipes()
    .filter((r) => r.id !== currentRecipe?.id && !Object.values(recipeRatings(r)).includes("never"))
    .map((r) => ({ r, fit: Lifestyle.fit(r, p, swapDate) }));
  const ok = all.filter((x) => x.fit.ok)
    .sort((a, b) => Number(!!a.r.curated) - Number(!!b.r.curated) || Number(used.has(a.r.id)) - Number(used.has(b.r.id)) || (b.fit.score || 0) - (a.fit.score || 0));
  // 買った材料を使う料理を先に（重みの合計が大きい順＝主役の食材を使う料理が先）。sort は安定なので、同じ重みは今の並びのまま。
  if (reuse.length) ok.sort((a, b) => reuseScore(b.r, reuse) - reuseScore(a.r, reuse));
  const review = isViewer() ? [] : all.filter((x) => !x.fit.ok && !x.r.curated && Lifestyle.reviewable(x.r, p, swapDate));
  const folder = currentRecipe && !isViewer() ? folderOfRecipe(currentRecipe) : null;
  return { ok, review, reuse, bought, folder, currentParent, used, original: currentRecipe || null };
}
// パスを覚える（閉じた時・決めた時。§64-3・2026-11-07 のユーザーの判断 B）：
// ①パスした料理そのものは、3日間は自動の献立に出さない（評価は変えない。自分で選ぶ・URLから入れるのはできる）
// ②その時「少なめ」になった特徴を、日付つきで残す（30日まで）。別の日に3回そろったら、今日の画面で1回だけ聞く。
function swapCommit() {
  if (!swapDate || isViewer() || !swapRemoved.length) return;
  const memo = state.passMemo = normalizePassMemo(state.passMemo);
  const until = addDays(today(), 3);
  for (const e of swapRemoved.map(swapEntry)) if (!e.bulk) memo.rests[e.id] = until;
  beginPlanMemo();
  let html = "";
  try { html = renderSwapChoices(); } finally { endPlanMemo(); }
  const keys = [...html.matchAll(/data-action="life-swap-unlearn" data-key="([^"]+)"/g)].map((m) => m[1]);
  const from = addDays(today(), -30);
  for (const k of keys) memo.log[k] = [...new Set([...(memo.log[k] || []), today()])].filter((d) => d >= from).sort();
  for (const [id, d] of Object.entries(memo.rests)) if (d <= today()) delete memo.rests[id];
}
const passRested = (r) => { const d = state.passMemo?.rests?.[r?.id]; return !!d && today() < d; };
// 「少なめにする」と答えた特徴（自動の献立で少し後ろへ。−6＝「好き」1人分と同じくらい）。
const PASS_LESS = 6;
function passLessOf(r) {
  const keys = Object.entries(state.passMemo?.asked || {}).filter(([, a]) => a.answer === "less").map(([k]) => k);
  if (!keys.length || !r) return 0;
  const mine = new Set(swapFeatures(r));
  return keys.some((k) => mine.has(k)) ? PASS_LESS : 0;
}
// 聞いてよい特徴：ここ30日の別の日に3回「少なめ」になり、まだ答えていないもの。
function passAskKey() {
  if (isViewer()) return "";
  const memo = state.passMemo || {}, from = addDays(today(), -30);
  return Object.entries(memo.log || {}).find(([k, list]) => !memo.asked?.[k] && SWAP_FEATURE_LABEL[k] && list.filter((d) => d >= from).length >= 3)?.[0] || "";
}
function renderPassAsk() {
  const k = passAskKey();
  if (!k) return "";
  const label = SWAP_FEATURE_LABEL[k];
  return `<div class="todo-row pass-ask"><span>🙅</span><p>ここ30日で3回、<b>${escapeHtml(label)}</b>をパスしました。献立でも少なめにしますか？</p><div class="todo-actions">${dailyButton("life-pass-ask", "少なめにする", `data-key="${k}" data-answer="less"`, true)}${dailyButton("life-pass-ask", "このままでいい", `data-key="${k}" data-answer="keep"`)}</div></div>`;
}
// 決めた日の料理を r に変えたら、買い物リストに新しく「買う」が付く品（Codex review #234：常備品・購入済みの印も、
// 実際の買い物リストと同じ計算で見る）。いったんその日の料理を r に置きかえて dailyShopping() を作り、すぐ元に戻す。
function swapNewToBuy(r) {
  const slot = state.mealSlots?.[swapDate];
  if (slot?.status !== "confirmed" || !r) return null;
  const before = dailyShopping();
  let after = before;
  // 決めた時と同じ枠（新しい日時・買った印なし）と、同じ買い物ページで計算する（買い物を終えたあとでも、ずれない。Codex review #234）。
  const page = shopPage, memo = planMemo;
  try {
    planMemo = null; // その日の料理を仮に置きかえている間は、覚えた献立を使わない・残さない
    state.mealSlots[swapDate] = confirmedSlot(swapDate, r);
    syncShopPageForDate(swapDate);
    after = dailyShopping();
  } finally {
    state.mealSlots[swapDate] = slot;
    shopPage = page;
    planMemo = memo;
  }
  return [...new Set(after.filter((x) => x.status === "buy" && !before.some((b) => b.id === x.id)).map((x) => x.name))];
}
function swapPickBar(r, reuse) {
  if (!r) return "";
  const back = `<button type="button" class="secondary-button" data-action="life-swap-back">‹ ${swapSize()}皿に戻る</button>`;
  if (isViewer()) return `<div class="swap-pickbar">${dailyButton("life-request-swap", `🙋 「${r.title.slice(0, 14)}」がいいと送る`, `data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}"`, true)}${back}</div>`;
  let need = "";
  const names = swapNewToBuy(r);
  if (names) need = names.length ? `🛒 新しく買う：${names.slice(0, 3).join("・")}${names.length > 3 ? ` ほか${names.length - 3}品` : ""}` : "🛒 新しく買う物はありません";
  const uses = reuse.length ? usesNames(r, reuse) : [];
  return `<div class="swap-pickbar">${need || uses.length ? `<p class="swap-pick-note">${uses.length ? `🧺 ${escapeHtml(namesOf(uses, 2))}を使う${need ? " · " : ""}` : ""}${escapeHtml(need)}</p>` : ""}<div class="swap-pick-actions">${dailyButton("life-choose", "✓ この料理にする", `data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}"`, true)}${back}</div></div>`;
}
// カード（2026-11-08 のユーザーの判断・2回目）：写真の上には何も重ねない（サムネイルの文字とぶつけない）。
// 写真のすぐ下の1行に「⏱時間 · 札」と目立つ「✕ パス」（写真に付いた行なので、どの料理の情報か一目でわかる）。その下に料理名（隙間は作らない）。
// 写真・料理名を押すとレシピへ（レシピの中で「この料理にする／戻る」）。
function swapCard({ r }, opts) {
  const badge = opts.badge ?? dishBadge(r, opts);
  const minutes = r.planning?.minutes ? `⏱${r.planning.minutes}分` : "";
  const meta = [minutes, badge, opts.used?.has(r.id) ? "ほかの日と同じ" : ""].filter(Boolean).map(escapeHtml).join(" · ");
  // 写真と料理名のどちらからでもレシピへ（料理名のボタンは、読み上げでは写真と重ならないように隠す）。
  const open = (inner, cls, title = false) => `<button type="button" class="${cls}" ${title ? `data-recipe="${escapeAttr(r.id)}" data-action="life-swap-detail" tabindex="-1" aria-hidden="true"` : `data-action="life-swap-detail" data-recipe="${escapeAttr(r.id)}" aria-label="${escapeAttr(r.title)}のレシピを見る"`}>${inner}</button>`;
  return `<div class="swap-card${opts.fresh ? " is-fresh" : ""}${opts.hint ? " is-hint" : ""}">${open(`<span class="swap-photo">${dishTile(r, "swap-tile")}</span>`, "swap-pick")}<div class="swap-meta"><small class="swap-min">${meta}</small>${opts.removable ? `<button type="button" class="swap-x" data-action="life-swap-remove" data-recipe="${escapeAttr(r.id)}" aria-label="「${escapeAttr(r.title.slice(0, 20))}」をパス"><span>✕ パス</span></button>` : ""}</div>${open(`<strong class="swap-name">${recipeTitleHtml(r)}</strong>`, "swap-pick swap-title", true)}</div>`;
}
// よはくのひとこと（秘書のように、パスした気持ちを代弁する。2026-11-08 のユーザーの判断）。
const swapWord = (k) => (SWAP_FEATURE_LABEL[k] || "").replace(/^\S+\s/, "");
// パスした料理の、いちばん「気分」に近い特徴：味（こってり・ピリ辛…）→ 肉か魚か → 丼か麺か。
function swapSalient(r, ev) {
  const mine = swapFeatures(r);
  const order = [...mine.filter((k) => k.startsWith("t:")), ...mine.filter((k) => k.startsWith("g:") && k !== "g:veg"), ...mine.filter((k) => k.startsWith("s:") && k !== "s:other")];
  const ignore = new Set([...swapIgnore, ...(SWAP_MOOD_KEEPS[swapMood] || [])]);
  return order.find((k) => !ignore.has(k) && (ev.who.get(k)?.length || 0) >= 2 && !ev.unsure.has(k)) || order.find((k) => !ignore.has(k)) || "";
}
function swapSecretary({ ev, learned, removed, cards, mood }) {
  const last = swapRemoved.length ? swapEntry(swapRemoved[swapRemoved.length - 1]) : null;
  if (!cards.length) return ["bowl", "これで全部だよ。↩ 戻して選び直してもいいよ"];
  if (swapLastAct === "undo") return ["normal", "戻したよ"];
  if (swapLastAct === "unlearn" && swapIgnore.length) return ["happy", `${swapWord(swapIgnore[swapIgnore.length - 1])}も、また出すね`];
  if (swapLastAct === "mood" && mood) return ["happy", `${mood[1].replace(/^\S+\s/, "")}だね。しぼったよ`];
  if (last?.bulk) return ["popup", "ぜんぶちがった？ ほかのも見てみよう"];
  if (last) {
    const r = removed[removed.length - 1];
    const k = r ? swapSalient(r, ev) : "";
    if (k && learned.includes(k)) return ["happy", `${swapWord(k)}の気分じゃないんだね。減らしておくね`];
    if (k) return ["normal", `${swapWord(k)}じゃない気分かな？`];
    return ["normal", "ほかのにしてみたよ"];
  }
  return ["wave", "食べたくないのは「✕ パス」してね。好みに寄せていくよ"];
}
function renderSwapChoices() {
  const { ok, review, reuse, bought, folder, currentParent, used, original } = swapCandidates();
  const mood = SWAP_MOODS.find(([k]) => k === swapMood);
  const counts = SWAP_MOODS.map(([k, label, match]) => [k, label, ok.filter((x) => match(x.r)).length]).filter(([, , n]) => n > 0);
  // 定番フォルダの料理の日：最初の4皿は、そのフォルダの作り方（まだ作っていない作り方 → ランキング）。消すとほかの料理が入る。
  let folderFour = [];
  const medals = new Map();
  if (folder && !mood) {
    const mine = ok.filter((x) => x.r.folder === folder.key);
    const ranked = folderRanking(folder).map((r, i) => (medals.set(r.id, MEDALS[i]), mine.find((x) => x.r.id === r.id))).filter(Boolean);
    folderFour = [...new Map([...mine.filter((x) => !cookCount(x.r)), ...ranked].map((x) => [x.r.id, x])).values()].slice(0, swapSize());
  }
  // 料理名（親）ごとに1枚（八宝菜が2枚並ばない）。今の料理と同じ親は出さない（フォルダの4皿は別）。
  const seenParent = new Set([currentParent]);
  const list = ok.filter((x) => !mood || mood[2](x.r)).filter((x) => { if (folderFour.some((f) => f.r.id === x.r.id)) return true; const k = parentKeyOf(x.r); if (!k) return true; if (seenParent.has(k)) return false; seenParent.add(k); return true; });
  // 買った材料を使う時は、散らさずに「使う料理」の順のまま。
  const diverse = !reuse.length;
  // 元の献立の料理を「0.5品パス」とみなすのは、買った材料を使わない時だけ（使う時は、元の料理と同じ材料の料理を先に出したい）。
  const orig = diverse ? original : null;
  const first = folderFour.length ? folderFour : swapFirstFour(list, diverse, orig);
  const { slots, ev, fresh, left } = swapSlots(list, first, diverse, orig);
  const learned = isViewer() ? [] : swapLearned(ev);
  const chips = `${bought.length ? `<button type="button" class="chip-button swap-chip" data-action="life-swap-bought" data-use="${swapBought === "skip" ? "use" : "skip"}" aria-pressed="${swapBought !== "skip"}">🧺 買った${escapeHtml(namesOf(bought, 2))}を使う</button>` : ""}${counts.map(([k, label]) => `<button type="button" class="chip-button swap-chip" data-action="life-swap-mood" data-mood="${k}" aria-pressed="${swapMood === k}">${label}</button>`).join("")}`;
  const cards = slots.filter(Boolean);
  const isFolder = folderFour.length && !swapRemoved.length;
  const viewer = isViewer();
  const grid = cards.length
    ? `${isFolder ? `<p class="swap-folder">📁 <b>${escapeHtml(folder.name)}</b>の作り方 <button type="button" class="link-inline" data-action="life-folder-open" data-folder="${folder.key}" data-search="true">🔍 ほかの作り方を探す</button></p>` : ""}<div class="swap-grid">${(() => {
      // 4枚とも同じ札（はじめたばかりで全部「🆕 はじめて」など）なら、札は出さない（違いがわかる時だけ）。
      const opts = cards.map((x, i) => ({ reuse, medal: medals.get(x.r.id) || "", used, removable: !viewer, fresh: fresh.includes(x.r.id), hint: !swapRemoved.length && i === 0 }));
      const badges = cards.map((x, i) => dishBadge(x.r, opts[i]));
      const same = cards.length > 1 && badges.every((b) => b === badges[0]);
      return cards.map((x, i) => swapCard(x, { ...opts[i], badge: same ? "" : badges[i] })).join("");
    })()}</div>`
    : `<p class="swap-empty">${mood && !swapRemoved.length ? `${mood[1]}で、条件に合う料理はありません` : "読み込み済みの候補はここまでです"}</p>`;
  // 秘書のよはく（状態の行。高さは固定＝写真がずれない）：吹き出しで気持ちを代弁し、その下に「少なめ：[こってり ✕] [魚 ✕]」だけ。
  const removedNow = swapRemoved.map(swapEntry).filter((e) => !e.bulk).map((e) => allDinnerRecipes().find((r) => r.id === e.id)).filter(Boolean);
  const [pose, words] = swapSecretary({ ev, learned, removed: removedNow, cards, mood });
  const less = learned.length ? `<div class="swap-less"><span>少なめ：</span>${learned.map((k) => `<button type="button" class="swap-less-chip" data-action="life-swap-unlearn" data-key="${k}" aria-label="${escapeAttr(swapWord(k))}を少なめにするのをやめる">${escapeHtml(swapWord(k))} ✕</button>`).join("")}</div>` : "";
  const status = viewer ? "" : `<div class="swap-status" role="status">${yohaku(pose, "swap-yohaku")}<div class="swap-talk"><p class="swap-bubble">${escapeHtml(words)}</p>${less}</div>${swapRemoved.length ? `<button type="button" class="link-inline swap-undo" data-action="life-swap-undo">↩ 戻す</button>` : ""}</div>`;
  // 下の操作の場所：「🔄 別の4皿」（特徴は学ばない）。決めるのは、写真からレシピを開いて「この料理にする」。
  const nav = viewer || !cards.length ? "" : `<div class="swap-nav">${left ? `<button type="button" class="secondary-button swap-more" data-action="life-swap-remove-all">🔄 別の${swapSize()}皿</button>` : `<p class="swap-end small" role="status">読み込み済みの候補はここまで（${list.length}品）</p>`}</div>`;
  // 時間・材料を確かめれば選べる自分のレシピは、閉じた1行に（確認すれば選べるので隠さない）。
  const reviewRows = review.length ? `<details class="swap-review"><summary>確認すると選べる ${review.length}品</summary>${review.slice(0, 6).map(({ r }) => `<button type="button" class="swap-option needs-review" data-action="life-review-saved" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${recipeTitleHtml(r)}</strong><small>確認が必要 · 時間と材料を確認すると選べます</small></span><b aria-hidden="true">確認</b></button>`).join("")}</details>` : "";
  const day = `${formatDate(swapDate)}（${weekdayLabel(swapDate)}）`;
  // 献立トレイは献立タブの中にあるので、この画面から切り替える入口は置かない（2026-11-11）
  const traySwitch = "";
  return `<div class="swap-backdrop" data-action="life-close-swap" aria-hidden="true"></div><section class="swap-panel swap-sheet" role="dialog" aria-modal="true" tabindex="-1" aria-label="${day}の料理を選ぶ"><div class="swap-head"><b>${day}</b>${traySwitch}<button type="button" class="round-icon swap-close" data-action="life-close-swap" aria-label="閉じる">✕</button></div>${chips ? `<div class="swap-chips" role="group" aria-label="食べたい気分">${chips}</div>` : ""}${status}${grid}<div class="swap-bottom">${nav}</div><div class="swap-foot">${reviewRows}${renderUrlInsert()}</div></section>`;
}
// Photo when we have one, otherwise a warm tile with a staple emoji (clearly labelled as an image).
// よはく：画面の余白にこっそり住んでいるキャラクター。1画面に1匹まで、文字やボタンには重ねない。
const YOHAKU = Object.fromEntries(["normal", "wave", "popup", "open", "wait", "bowl", "happy"].map((k) => [k, `assets/yohaku/${k}.webp`]));
function yohaku(pose, cls = "") {
  return `<img class="yohaku yohaku-${pose} ${cls}" src="${YOHAKU[pose]}?v=${typeof APP_VERSION === "undefined" ? "" : APP_VERSION}" alt="" aria-hidden="true" decoding="async" draggable="false">`;
}
function dishTile(recipe, cls = "") {
  const photo = recipe ? recipeThumbnail(recipe) : "";
  if (photo) return renderRecipeImage(recipe, `dish-tile ${cls}`);
  // No photo of its own: a generic dish photo by staple, marked as an image only.
  const t = Lifestyle.traits(recipe || {});
  const fallback = { rice: "rice", noodle: "noodle", bread: "bread", other: "okazu" }[t.staple] || "okazu";
  return `<span class="dish-tile dish-fallback ${cls}" role="img" aria-label="料理のイメージ写真" style="background-image:url('assets/dishes/fallback-${fallback}.webp')"><small aria-hidden="true">イメージ</small></span>`;
}
const dayWordFor = (date) => { const g = daysBetween(date, today()); return g === 0 ? "今日" : g === 1 ? "昨日" : g === 2 ? "一昨日" : `${g}日前`; };
// 献立が始まる前の日（「献立は◯日から」）にも、今夜の一品を出す（2026-11-14 のユーザーの判断。APP_MAP §68）。
// 作る日でない日・夜遅くに始めた人は、最初の献立まで今夜と週末が空く。買い足しが少なそうな料理から1品（日ごとに変わる）。
// 買い足し＝常備品・調味料とみなす材料（Lifestyle.keeps）を除いた数。家にあるかは分からないので「目安」。
const prestartBuy = (r) => (r.ingredients || []).filter((i) => !Lifestyle.keeps(i));
const PRESTART_POOL = 8; // 買い足しの少ない順に、この数の中から日ごとに1品
function prestartPick() {
  const date = today();
  if (isViewer() || !prestartUntil() || state.mealSlots?.[date]) return null;
  const p = dailyProfile(), hp = hiddenParents();
  const all = allDinnerRecipes();
  // 「⇄ ほかの一皿」で選んだ料理があれば、それ（ふつうの日と同じ：選ぶ → これにする）。
  const chosen = all.find((r) => r.id === state.planOverrides?.[date]);
  if (chosen && Lifestyle.fit(chosen, p, date).ok) return { recipe: chosen, buy: prestartBuy(chosen).length, chosen: true };
  // これからの献立に入っている料理は外す（同じ料理が続かないように）。
  const used = new Set(dailyPlan().map((d) => d.slot?.recipe?.id || d.candidate?.recipe?.id).filter(Boolean));
  const rows = all
    .filter((r) => !used.has(r.id) && (r.ingredients || []).length && !Object.values(recipeRatings(r)).includes("never") && !(hp.size && hp.has(parentKeyOf(r))) && !passRested(r) && Lifestyle.fit(r, p, date).ok)
    .map((r) => ({ recipe: r, buy: prestartBuy(r).length }))
    .sort((a, b) => a.buy - b.buy || (a.recipe.planning?.minutes || 99) - (b.recipe.planning?.minutes || 99) || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, PRESTART_POOL);
  if (!rows.length) return null;
  let h = 2166136261;
  for (const c of date) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return rows[h % rows.length];
}
// 今日タブ：今夜の一品 → 今日やること（あるときだけ）→ 明日の一行。それ以外は献立タブへ。
function renderToday() {
  const plan = dailyPlan();
  const day = plan[0],
    slot = state.mealSlots?.[today()],
    recipe = slot?.recipe || day?.candidate?.recipe;
  const off = slot?.status === "off" || (!slot && day?.off);
  const locked = !off && (!slot || slot.status === "removed") && lockedDates(plan).has(today());
  const servings = slot?.servings || dailyProfile().servings;
  const reason = (day && planReason(day)) || "";
  const tonightNeeds = slot?.status === "confirmed" ? dailyShopping().filter((i) => i.status === "buy" && i.uses?.includes(slot.recipe.title)).length : 0;
  let actions = "";
  if (off) actions = dailyButton("life-reopen", "今夜は料理する", `data-date="${today()}"`, true);
  else if (locked) actions = `${dailyButton("life-plus-open", "✨ 毎日にする", 'data-from="locked"', true)}<button type="button" class="text-button" data-action="life-free-pick" data-date="${today()}">無料の日にする</button>`;
  else if (!slot || slot.status === "removed")
    actions = `${recipe ? dailyButton("life-confirm-one", "これにする", `data-date="${today()}"`, true) : dailyButton("life-profile", "条件をゆるめる", "", true)}${recipe ? `<button type="button" class="text-button swap-link" data-action="life-swap" data-date="${today()}">⇄ ほかの一皿</button>` : ""}`;
  else if (slot.status === "cooked") actions = "";
  else actions = `${dailyButton("life-cook", "作り方を見る", `data-date="${today()}"`, true)}${tonightNeeds ? dailyButton("go-view", `🛒 この料理の買うもの あと${tonightNeeds}品`, 'data-view="shopping"') : ""}${isViewer() ? "" : `<button type="button" class="text-button swap-link" data-action="life-swap" data-date="${today()}" aria-label="今夜の料理を変更">⇄ 変更</button>`}`;
  const pre = !slot && day?.prestart ? prestartUntil() : "";
  const firstBlock = pre ? currentBlocks()[0] : null;
  // 献立が始まる前の日も、今夜の一品を出す（§68）。合う料理がない時・見るだけの人は、今までどおり「献立は◯日から」。
  const pick = pre ? prestartPick() : null;
  if (pre) actions = pick
    ? `${dailyButton("life-tonight-pick", "これにする", `data-recipe="${escapeAttr(pick.recipe.id)}"`, true)}<button type="button" class="text-button swap-link" data-action="life-swap" data-date="${today()}">⇄ ほかの一皿</button>`
    : dailyButton("go-view", "最初の献立を見る", 'data-view="plan"', true);
  const preLine = pre ? `🛒 いつもの献立は <b class="nobr">${formatDate(pre)}（${weekdayLabel(pre)}）から</b>` : "";
  // 始まる前の日に決めた一品は、買い物リスト（献立のまとまりごと）に入らないので、買い足す物をここに出す。
  const preBuy = !pre && slot?.status === "confirmed" && slot.recipe && prestartUntil() ? prestartBuy(slot.recipe).map((i) => i.name) : [];
  const label = pick ? "今夜のおすすめ" : pre ? `献立は<span class="nobr">${formatDate(pre)}（${weekdayLabel(pre)}）から</span>` : off ? (SKIP_OF[slot?.kind] ? `今日は${SKIP_OF[slot.kind].label}` : "今日はお休み") : slot?.status === "cooked" ? "ごちそうさま！" : slot ? "今夜の一品" : "今夜のおすすめ";
  const tomorrow = plan[1];
  const tr = tomorrow?.slot?.recipe || tomorrow?.candidate?.recipe;
  const tomorrowOff = tomorrow?.off || tomorrow?.slot?.status === "off";
  return `${renderRequestNews()}${renderPreferencePrompt() || renderRankPrompt() || renderRoundReview()}
  <section class="hero-card today-dish tonight-card"><div class="tonight-head"><p class="tonight-label"><span class="marker">${label}</span></p><p class="today-date">${formatDate(today())}（${weekdayLabel(today())}）· ${servings}人分</p></div>
    ${ pick ? `${dishTile(pick.recipe, "tonight-photo")}<h3 class="tonight-title">${recipeTitleHtml(pick.recipe)}</h3><p class="tonight-reason hand"><span class="marker">${pick.chosen ? "✋ 自分で選んだ一皿" : pick.buy ? `🧺 買い足しは${pick.buy}品ほど` : "🧺 家にある物で作れそう"}</span></p><p class="tonight-meta">${[pick.recipe.planning?.minutes ? `⏱ ${pick.recipe.planning.minutes}分` : "", pick.chosen && pick.buy ? `買い足し ${pick.buy}品ほど` : ""].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : pre ? `<p class="tonight-off">🛒 最初の買い物は <b>${firstBlock ? deadlineLabel(firstBlock.shopAt) : ""}</b></p>` : locked ? `<p class="tonight-off">${LOCK_TITLE} ${tip("無料は週3日まで")}</p>` : off ? `<p class="tonight-off">${SKIP_OF[slot?.kind]?.icon || "🌙"} また次の晩ごはんで</p>` : recipe ? `${dishTile(recipe, "tonight-photo")}<h3 class="tonight-title">${recipeTitleHtml(recipe)}</h3>${reason && slot?.status !== "cooked" ? `<p class="tonight-reason hand"><span class="marker">${escapeHtml(reason)}</span></p>` : ""}<p class="tonight-meta">${[recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "", /好物|日ぶり/.test(reason) ? "" : bothLike(recipe) ? "😋 ふたりとも好き" : lastEatenLabel(recipe) === "はじめて" ? "はじめての一皿" : lastEatenLabel(recipe)].filter(Boolean).map(escapeHtml).join(" · ")}</p>${slot?.status === "cooked" ? renderTonightQuickRate(today(), recipe) + renderCardGetBanner(recipe) : ""}` : '<p class="tonight-off">条件に合う料理が見つかりません。</p>'}
    ${slot?.status === "confirmed" ? conditionWarning(recipe, today()) : ""}
    ${preBuy.length ? `<p class="tonight-meta tonight-prebuy">🧺 買い足す物（目安）：${preBuy.map(escapeHtml).join("・")}</p>` : ""}
    ${actions || (!off && !slot) ? `<div class="tonight-actions">${actions}${!off && !pre && slot?.status !== "cooked" && recipe ? `<button class="text-button" data-action="life-skip" data-date="${today()}">🍽 今日は外食・中食にする</button>` : ""}</div>` : ""}
    ${pick ? `<p class="tonight-prestart small">${preLine} <button type="button" class="text-button" data-action="go-view" data-view="plan">最初の献立を見る ›</button></p>` : ""}</section>
  ${renderSkipPanel(today())}
  ${renderTodayTodos()}
  ${tomorrow ? `<button type="button" class="tomorrow-line" data-action="go-view" data-view="plan"><span>明日は</span><b>${tomorrow.prestart ? "いつもどおり（献立の前）" : tomorrowOff ? "お休み 🌙" : tr ? escapeHtml(tr.title) : "未定"}</b><i aria-hidden="true">›</i></button>` : ""}
  ${renderWeeklyStamps()}
  ${renderInstallCard()}
  ${trayFlipId ? renderCardFlipModal() : ""}
  ${renderCardGetModal()}
`;
}
// 食後すぐの1タップ評価（「ごちそうさま！」のカード内で、次に食べたい頃をスタンプ感覚で選べる）。
function renderTonightQuickRate(date, recipe) {
  if (isViewer()) return "";
  const e = state.evaluations.find((x) => x.id === `meal-${date}` || (x.recipeId === recipe?.id && (x.cookedAt || "").slice(0, 10) === date));
  if (!e) return "";
  const names = raterNames();
  const who = names.find((n) => !e.familyRepeatCycles?.[n]) || names[0];
  const cur = e.familyRepeatCycles?.[who];
  const allDone = names.every((n) => !!e.familyRepeatCycles?.[n]);
  const times = cookHistory(e.recipeId).length;
  const isLove = Object.values(e.familyRepeatCycles || {}).some((c) => c === "weekly" || c === "tomorrow");
  const growth = allDone && isLove ? (times >= 2 ? `<span class="qr-growth is-staple">🏆 わが家の定番（${times}回目）</span>` : `<span class="qr-growth">🌱 あと1回作ると「🏆 わが家の定番」入り！</span>`) : "";
  if (allDone) {
    const summary = names.map((n) => `${escapeHtml(n)}：${escapeHtml(CYCLE_CHOICES.find((c) => c.cycle === e.familyRepeatCycles[n])?.label || "")}`).join(" · ");
    return `<div class="tonight-quick-rate is-done" role="region" aria-label="次に食べたい頃"><div class="qr-done-line"><span>✨ 次は <b>${summary}</b> 頃</span><button type="button" class="text-button qr-edit" data-action="life-edit-record" data-id="${escapeAttr(e.id)}">メモ・写真 ›</button></div>${growth}</div>`;
  }
  return `<div class="tonight-quick-rate" role="region" aria-label="次に食べたい頃"><p class="qr-head"><span>🍽 次はいつ食べたい？${names.length > 1 ? `（<b>${escapeHtml(who)}</b>）` : ""}</span><button type="button" class="text-button qr-edit" data-action="life-edit-record" data-id="${escapeAttr(e.id)}">写真・メモ ›</button></p>
    <div class="rv-chips qr-chips" role="group" aria-label="${escapeAttr(`${who}：次に食べたい頃`)}">${REVIEW_CHOICES.map(([c, icon, label]) => `<button type="button" class="rv-chip" data-action="life-rate" data-id="${escapeAttr(e.id)}" data-member="${escapeAttr(who)}" data-cycle="${c}" aria-pressed="${cur === c}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`).join("")}</div></div>`;
}
// Only things that need doing today; each row is one tap to the place where it gets done.
function renderTodayTodos() {
  const rows = [];
  if (!isViewer()) {
    Object.values(state.mealSlots || {}).filter((s) => s.status === "confirmed" && s.date < today() && canRecordDate(s.date)).sort((a, b) => b.date.localeCompare(a.date))
      .forEach((s) => rows.push(`<div class="todo-row"><span>🍳</span><p><b>${formatDate(s.date)}の${escapeHtml(s.recipe.title)}</b>、作った？</p>${dailyButton("life-record-past", "作った", `data-date="${s.date}"`)}</div>`));
  }
  const yestEval = state.evaluations.find((e) => (e.cookedAt || "").slice(0, 10) === addDays(today(), -1) && e.preferencePending && raterNames().some((n) => !e.familyRepeatCycles?.[n]));
  if (yestEval && !isViewer() && !reviewDue()) {
    const who = raterNames().find((n) => !yestEval.familyRepeatCycles?.[n]) || raterNames()[0];
    rows.push(`<div class="todo-row is-rate-row"><span>😋</span><div class="todo-rate-body"><p><b>昨日の${escapeHtml(yestEval.recipeTitle)}</b>、また食べたい？${raterNames().length > 1 ? `<small>（${escapeHtml(who)}）</small>` : ""}</p><div class="rv-chips qr-chips">${REVIEW_CHOICES.map(([c, icon, label]) => `<button type="button" class="rv-chip" data-action="life-rate" data-id="${escapeAttr(yestEval.id)}" data-member="${escapeAttr(who)}" data-cycle="${c}" aria-pressed="${yestEval.familyRepeatCycles?.[who] === c}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`).join("")}</div></div></div>`);
  }
  const fromOthers = openRequests().filter((q) => q.from !== me());
  if (fromOthers.length) rows.push(`<div class="todo-row"><span>💌</span><p><b>${escapeHtml(fromOthers[0].from)}</b>から「${escapeHtml(requestRecipe(fromOthers[0]).title || fromOthers[0].recipeTitle)}」${fromOthers.length > 1 ? `ほか${fromOthers.length - 1}件` : ""}のリクエスト</p>${dailyButton("go-view", "献立へ", 'data-view="plan"')}</div>`);
  if (rhythmOn()) {
    const b = planningBlock();
    if (b) {
      const hours = (new Date(b.shopAt) - new Date()) / 3600000;
      if (blockStatus(b) === "late") rows.push(`<div class="todo-row is-urgent"><span>🗓</span><p><b>${blockRange(b)}の献立</b>がまだ決まっていません</p>${dailyButton("go-view", "決める", 'data-view="plan"', true)}</div>`);
      else if (hours <= 30) rows.push(`<div class="todo-row"><span>🗓</span><p><b>${blockRange(b)}の献立</b>を${deadlineLabel(b.shopAt)}の買い物までに</p>${dailyButton("go-view", "献立へ", 'data-view="plan"')}</div>`);
    }
  } else if (plan0Undecided()) rows.push(`<div class="todo-row"><span>🗓</span><p>この先の献立を決めよう</p>${dailyButton("go-view", "献立へ", 'data-view="plan"')}</div>`);
  const toBuy = dailyShopping().filter((i) => i.status === "buy").length;
  const shopToday = rhythmOn() && shoppingBlock() && shoppingBlock().shopAt.slice(0, 10) <= today();
  if (toBuy && (shopToday || !rhythmOn())) rows.push(`<div class="todo-row"><span>🛒</span><p>買うもの <b>あと${toBuy}品</b></p>${dailyButton("go-view", "リストへ", 'data-view="shopping"')}</div>`);
  // 自分向けにする追加の質問（料理の腕前・ごはん方針・詳しい設定）は、一度に1つだけ。途中のものを先に（2026-10-27 のユーザーの判断）。
  const more = [];
  // 料理の腕前は★を選ぶだけ（10秒）。献立から外さず、難しい料理を後ろに並べるのに使う（2026-10-28）。
  if (!skillProfile() && !isViewer()) more.push([false, `<div class="todo-row"><span>🔪</span><p><b>料理の腕前</b>を★で選ぶ（10秒）→ 作りやすい料理から並べます</p>${dailyButton("life-skill-open", "選ぶ")}</div>`]);
  const talk = renderTalkTodo();
  if (talk) more.push([!!talkProfile().session, talk]);
  if (!state.foodProfile?.completed) more.push([!!state.onboardingDraft, `<div class="todo-row"><span>✍️</span><p>好み・常備品まで教えると、提案があなた向けに（2分）</p>${dailyButton("life-profile", state.onboardingDraft ? "続きから" : "教える")}</div>`]);
  // 動画の保存のしかた（レシピタブの上から ＋ の画面へ移した。まだ動画を保存していない人に1回だけ。2026-10-28）。
  if (!isViewer() && !saveGuideSeen() && !state.recipes.some((r) => r.videoUrl)) more.push([false, `<div class="todo-row"><span>📋</span><p><b>保存した動画を、献立に使えます</b>　YouTubeのレシピ動画を1本入れてみよう（1分）</p>${dailyButton("life-save-guide", "やってみる")}<button type="button" class="todo-x" data-action="life-save-guide-x" aria-label="閉じる">×</button></div>`]);
  // 記録からの提案（「また食べたい」とごはん方針の差）を、追加の質問より先に1件だけ（2026-10-28：行動から学ぶのを主に）。
  const ev = isViewer() ? [] : talkEvidence(1);
  // パスの「少なめにしますか？」（別の日に3回そろった時だけ・1回だけ。§64-3）も、記録からの提案と同じく先に1件。
  const pass = renderPassAsk();
  const next = ev.length ? [false, `<div class="today-evidence">${renderTalkEvidence(ev)}</div>`] : pass ? [false, pass] : more.find(([started]) => started) || more[0];
  if (next) rows.push(next[1]);
  if (typeof backupReminderDue === "function" && backupReminderDue() && !isViewer()) {
    rows.push(`<div class="todo-row is-backup-row"><span>🛡</span><p><b>レシピ${state.recipes.length}品・記録${state.evaluations.length}回</b>をバックアップして保護</p>${dailyButton("export-data", "保存する")}<button type="button" class="todo-x" data-action="snooze-backup" aria-label="2週間後に再通知">×</button></div>`);
  }
  return rows.length ? `<section class="today-todos" aria-label="今日やること"><h3 class="section-title"><span class="marker">今日やること</span></h3>${rows.join("")}</section>` : "";
}
function plan0Undecided() {
  return dailyPlan().slice(1).some((d) => d.candidate && !d.slot);
}
function canRecordDate(date) { return date >= addDays(today(), -3) && date <= today(); }
function renderRecentMeals() {
  if (isViewer()) return "";
  const slots = Object.values(state.mealSlots || {}).filter(s => s.status === "confirmed" && s.date < today() && canRecordDate(s.date)).sort((a,b)=>b.date.localeCompare(a.date));
  return slots.length ? `<section class="panel"><h3>🍳 作った？</h3>${slots.map(s=>`<div class="daily-plan-row"><p>${formatDate(s.date)} · ${escapeHtml(s.recipe.title)}</p>${dailyButton("life-record-past","作った",`data-date="${s.date}"`)}</div>`).join("")}</section>` : "";
}
// Each person rates with one tap. Kind words only: nobody "dislikes", they "pass this time".
// One rating model everywhere: how often each person wants the dish again.
const CYCLE_CHOICES = [
  { cycle: "tomorrow", label: "明日でも", hint: "大好き" },
  { cycle: "weekly", label: "毎週", hint: "好き" },
  { cycle: "twice_month", label: "月2回", hint: "ほどよく" },
  { cycle: "monthly", label: "月1回", hint: "たまに" },
  { cycle: "pause", label: "しばらくいい", hint: "お休み" },
  { cycle: "never", label: "もう作らない", hint: "" },
];
function renderCyclePicker(name, current, attrs) {
  return `<div class="cycle-row"><span class="rate-name">${escapeHtml(name)}${current ? `<small>${escapeHtml(CYCLE_CHOICES.find((c) => c.cycle === current)?.label || "")}</small>` : ""}</span><div class="cycle-grid" role="group" aria-label="${escapeAttr(name)}：次に食べたい頃">${CYCLE_CHOICES.map((c) => `<button type="button" class="cycle-chip cycle-${c.cycle}" ${attrs(c.cycle)} aria-pressed="${current === c.cycle}" aria-label="${escapeAttr(name)}：${c.label}"><strong>${c.label}</strong>${c.hint ? `<small>${c.hint}</small>` : ""}</button>`).join("")}</div></div>`;
}
function raterNames() {
  const names = [...state.family];
  if (dailyProfile().servings >= 2 && names.length < 2) names.push("いっしょに食べた人");
  return names;
}
// ⭐ まとめて評価：作った料理は、献立のひと回りが終わった時にまとめて評価する（毎日は聞かない）。
// 並べて比べられるように、全部の料理を1枚に。人ごとにタブで切り替える。
const REVIEW_DAYS = 14, REVIEW_MAX = 7;
let reviewWho = "", reviewLater = false;
const reviewSeen = new Set(); // 表示中に評価し終えた料理も、比べられるように並べたままにする
function reviewPending({ withSeen = false } = {}) {
  const from = addDays(today(), -REVIEW_DAYS);
  const names = raterNames();
  return state.evaluations
    .filter((e) => (e.cookedAt || "") >= from && ((withSeen && reviewSeen.has(e.id)) || (e.preferencePending && !e.nudgeDismissed && names.some((n) => !e.familyRepeatCycles?.[n]))))
    .sort((a, b) => a.cookedAt.localeCompare(b.cookedAt))
    .slice(-REVIEW_MAX);
}
// ひと回りの終わり：これから作る確定の献立が残っていない。または3品以上たまって、今夜の分は作り終えた。
function reviewDue(pending = reviewPending()) {
  if (!pending.length || reviewLater) return false;
  const t = today();
  const slots = Object.values(state.mealSlots || {});
  const upcoming = slots.some((s) => s.status === "confirmed" && s.date >= t);
  const tonight = state.mealSlots?.[t];
  return !upcoming || (pending.length >= 3 && (!tonight || tonight.status === "cooked"));
}
const REVIEW_CHOICES = [["tomorrow", "😍", "明日でも"], ["weekly", "😋", "毎週"], ["twice_month", "🙂", "月2回"], ["monthly", "😌", "月1回"], ["pause", "💤", "しばらく"], ["never", "🙅", "もう"]];
function renderRoundReview({ where = "today" } = {}) {
  if (isViewer()) return "";
  const open = reviewPending();
  if (!open.length || (where === "today" && !reviewDue(open))) { reviewSeen.clear(); return ""; }
  const pending = reviewPending({ withSeen: true });
  pending.forEach((e) => reviewSeen.add(e.id));
  const names = raterNames();
  const solo = names.length <= 1;
  const done = (n) => pending.every((e) => e.familyRepeatCycles?.[n]);
  if (!names.includes(reviewWho) || done(reviewWho)) reviewWho = names.find((n) => !done(n)) || names[0];
  const who = reviewWho;
  const tabs = solo ? "" : `<div class="rv-tabs" role="tablist">${names.map((n) => `<button type="button" role="tab" class="rv-tab" data-action="life-review-who" data-member="${escapeAttr(n)}" aria-selected="${n === who}">${done(n) ? "✓ " : ""}${escapeHtml(n)}</button>`).join("")}</div>`;
  const rows = pending.map((e) => {
    const r = recipeById(e.recipeId) || { id: e.recipeId, title: e.recipeTitle, ingredients: [] };
    const cur = e.familyRepeatCycles?.[who];
    return `<li class="rv-row"><div class="rv-dish">${planThumb(r)}<span><b>${escapeHtml(e.recipeTitle)}</b><small>${formatDate(e.cookedAt)}（${weekdayLabel(e.cookedAt)}）</small></span></div>
      <div class="rv-chips" role="group" aria-label="${escapeAttr(`${who}：${e.recipeTitle}を次に食べたい頃`)}">${REVIEW_CHOICES.map(([c, icon, label]) => `<button type="button" class="rv-chip" data-action="life-rate" data-batch="1" data-id="${escapeAttr(e.id)}" data-member="${escapeAttr(who)}" data-cycle="${c}" aria-pressed="${cur === c}"><span aria-hidden="true">${icon}</span><small>${label}</small></button>`).join("")}</div></li>`;
  }).join("");
  const ask = `<div class="rv-foot">${solo ? "<span></span>" : `<button type="button" class="text-button" data-action="life-rate-ask">💬 LINEなどで聞く</button>`}${yohaku("wait")}</div>`;
  return `<section class="panel rv-card" role="region" aria-label="まとめて評価"><div class="rv-head"><h3>⭐ ${where === "plan" ? "前回" : "今回"}の${pending.length}品、また食べたい？ ${tip("比べながら、次に食べたい頃を。評価は次の献立に効きます")}</h3><button type="button" class="round-icon" data-action="life-review-later" aria-label="あとで">×</button></div>
    ${tabs}<ul class="rv-list">${rows}</ul>${ask}</section>`;
}
async function askRating() {
  const list = reviewPending().map((e) => `・${e.recipeTitle}`).join("\n");
  const text = `🍳 最近の晩ごはん、次はいつ食べたい？\n${list}\n（明日でも／毎週／月2回／月1回／しばらくいい）`;
  const url = `${location.origin}${location.pathname}`;
  try {
    if (navigator.share) { await navigator.share({ text, url }); return; }
  } catch (error) { if (error?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); showToast("📋 コピーしました。LINEなどに貼ってください"); }
  catch { showToast("共有できませんでした"); }
}
function renderPreferencePrompt() {
  const e = state.evaluations.find(e=>e.id===preferencePromptId && e.preferencePending);
  if (!e) return "";
  const names = raterNames();
  const rows = names.map((name) => renderCyclePicker(name, e.familyRepeatCycles?.[name], (cycle) => `data-action="life-rate" data-id="${escapeAttr(e.id)}" data-member="${escapeAttr(name)}" data-cycle="${cycle}"`)).join("");
  return `<section class="panel rate-card" role="region" aria-label="次に食べたい頃"><p class="hand rate-note">おつかれさま！</p><h3>${escapeHtml(e.recipeTitle)}、次はいつ食べたい？</h3><p class="muted small">${names.length > 1 ? "ひとりずつタップ。ふたりが食べたくなる頃に、また献立に入ります。" : "えらんだ頃に、また献立に入ります。"}</p>${rows}${renderCreatorThanks(recipeById(e.recipeId), e)}${dailyButton("life-frequency-close","あとで")}</section>`;
}
// Latest rating per person for a recipe (own copy or starter).
function recipeRatings(recipe) {
  const ids = new Set([recipe.id, recipe.starterId].filter(Boolean));
  state.recipes.forEach((r) => { if (r.starterId === recipe.id) ids.add(r.id); });
  // 途中まで（ひとりだけ）の評価も使う。人ごとに、その人のいちばん新しい評価（Lifestyle.latestRatings）。
  const row = Lifestyle.latestRatings(state.evaluations.filter((x) => ids.has(x.recipeId)), () => "dish").get("dish");
  return row ? { ...row.cycles } : {};
}
function bothLike(recipe) {
  const values = Object.values(recipeRatings(recipe));
  return values.length >= 2 && values.every((c) => c === "weekly" || c === "tomorrow");
}
let aisleEdit = false;
let shopDoneLater = false;
// Vertical aisle tags: three characters at most so a one-item aisle stays one row tall.
const AISLE_SHORT = { veg: "野菜", fish: "魚", meat: "肉", daily: "日配", chilled: "乳・卵", frozen: "冷凍", staple: "主食", dry: "乾物", seasoning: "調味料", other: "他" };

// 曜日バッジ：直径22pxの料理写真の代わりに「月」「水」などの使う曜日を表示。
function useDayBadges(item) {
  const parts = item.parts || [];
  const dateMap = new Map();
  const meals = shopPageMeals();
  for (const p of parts) {
    const [d] = String(p).split(":");
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      if (!dateMap.has(d)) {
        const title = (meals.find((m) => m.date === d)?.recipe?.title) || "";
        dateMap.set(d, title);
      }
    }
  }
  const dates = [...dateMap.keys()].sort();
  if (!dates.length) return "";
  const t = today();
  return `<span class="use-days" aria-label="${dates.map((d) => `${formatDate(d)}（${weekdayLabel(d)}）`).join("・")}に使う">${dates.map((d) => {
    const dt = new Date(d + "T12:00:00");
    const wd = WD[dt.getDay()];
    const title = dateMap.get(d) || "";
    const isNear = d === t || d === addDays(t, 1);
    const tipText = `${formatDate(d)}（${weekdayLabel(d)}）${title ? `：${title}` : ""}`;
    return `<span class="use-day-badge ${isNear ? "is-near" : ""}" title="${escapeAttr(tipText)}" aria-label="${escapeAttr(tipText)}">${escapeHtml(wd)}</span>`;
  }).join("")}</span>`;
}

// 次の回のための代用・パスの記憶を書き、取り消し用の関数を返す。
// 取り消しは前の記憶に戻す。前に記憶がなければ「clear」（消した印）を新しい日時で書く
// （ただ消すと、同期で相手の端末の記憶が戻ってくるため）。
function rememberItemPref(name, pref) {
  state.itemPrefs = state.itemPrefs || {};
  const k = Lifestyle.shoppingKey(name);
  const prev = state.itemPrefs[k] ? { ...state.itemPrefs[k] } : null;
  state.itemPrefs[k] = pref;
  return () => {
    state.itemPrefs = state.itemPrefs || {};
    state.itemPrefs[k] = prev && prev.action !== "clear" ? { ...prev, updatedAt: nowIso() } : { action: "clear", updatedAt: nowIso() };
  };
}
// リピート時の記憶バッジ（前回代用・パスした食材に表示し、1タップで即適用）
function renderItemPrefBadge(item) {
  if (item.status !== "buy") return "";
  const pref = state.itemPrefs?.[item.id];
  if (!pref) return "";
  if (pref.action === "sub") {
    const text = pref.subText ? `🔄 ${pref.subText}` : "🔄 代用";
    return `<button type="button" class="shop-pref-badge" data-action="life-apply-item-pref" data-id="${escapeAttr(item.id)}" title="前回の代用設定をそのまま適用します">前回: ${escapeHtml(text)}</button>`;
  }
  if (pref.action === "skip") {
    return `<button type="button" class="shop-pref-badge is-skip" data-action="life-apply-item-pref" data-id="${escapeAttr(item.id)}" title="前回のパス（今回は買わない）を適用します">前回: ⏭ パス</button>`;
  }
  return "";
}

// 常備品の有効な買い替え周期（手動設定がなければ品目ごとのデフォルト賞味期限目安を使う。0は通知オフ）
function effectivePantryCycle(name) {
  const m = state.pantryMeta?.[name];
  if (m?.cycleDays === 0) return 0;
  if (Number(m?.cycleDays) > 0) return Number(m.cycleDays);
  return typeof Lifestyle.defaultPantryCycle === "function" ? Lifestyle.defaultPantryCycle(name) : 90;
}

function formatCycleDays(days) {
  if (!days) return "OFF";
  if (days <= 7) return "1週";
  if (days <= 14) return "2週";
  if (days <= 21) return "3週";
  if (days <= 31) return "1ヶ月";
  if (days <= 62) return "2ヶ月";
  if (days <= 95) return "3ヶ月";
  if (days <= 190) return "半年";
  return "1年";
}

// 表示中の献立で使われている常備品の数をカウント
function tripPantryCount() {
  const p = dailyProfile();
  const pantry = p.pantry || {};
  const usedPantryKeys = new Set();
  for (const s of shopPageMeals()) {
    if (!s?.recipe) continue;
    for (const ing of s.recipe.ingredients || []) {
      const k = Lifestyle.shoppingName(ing.name);
      if (pantry[k] === "have" || Object.entries(pantry).some(([pn, v]) => v === "have" && Lifestyle.key(pn) === Lifestyle.key(k))) {
        usedPantryKeys.add(k);
      }
    }
  }
  return usedPantryKeys.size;
}

// 常備品に注意アラートがあるか（切れたまま、または賞味期限・買い替え周期が到来した品）
function pantryHasAlert() {
  const p = dailyProfile();
  const pantry = p.pantry || {};
  if (Object.values(pantry).some((v) => v === "none")) return true;
  const t = today();
  for (const [name, meta] of Object.entries(state.pantryMeta || {})) {
    const cycle = effectivePantryCycle(name);
    if (meta?.lastBoughtAt && cycle > 0 && pantry[name] !== "none") {
      if (daysBetween(meta.lastBoughtAt, t) >= cycle) return true;
    }
  }
  return false;
}

let shopUndo = null; // { text, undo() }：直近の1つだけ
let shopPantryOpen = false; // 常備品の畳みを、描き直しても開いたままに
let activeSwipeId = null; // 買い物リストで左スライド展開中の品ID
let activePantrySwipe = null; // 常備品リストで左スライド展開中の品名

function swipeGuideSeen() {
  try { return localStorage.getItem("ripigochi-swipe-seen") === "1"; } catch { return true; }
}
function markSwipeGuideSeen() {
  try { localStorage.setItem("ripigochi-swipe-seen", "1"); } catch {}
}

// 献立の .plan-dots / .plan-dot と完全に統一した前回・今回・次回タブ
function renderShopTabs() {
  const sb = shopBlocks();
  if (!sb || sb.blocks.length <= 1) return "";
  const active = activeShopBlock();
  const name = (i) => ({ "-1": "前回", 0: "今回", 1: "次回" })[i - sb.curIndex] || (i < sb.curIndex ? `${sb.curIndex - i}回前` : `${i - sb.curIndex}回先`);
  const tabKey = (i) => ({ "-1": "prev", 0: "current", 1: "next" })[i - sb.curIndex] || "current";
  return `<div class="plan-dots shop-plan-dots" role="group" aria-label="買い物のページ">${sb.blocks.map((b, i) => `<button type="button" class="plan-dot" data-action="life-shop-page" data-page="${b.key}" data-tab="${tabKey(i)}" aria-pressed="${b.key === active?.key}" aria-label="${escapeAttr(`${name(i)}（${blockRange(b)}）`)}">${name(i)}</button>`).join("")}</div>`;
}

// 🧂 常備品：上部ボタン（今回使う品数とアラート通知）
function renderShopPantryBar() {
  const count = tripPantryCount();
  const alert = pantryHasAlert();
  return `<button type="button" class="shop-pantry-btn" data-action="life-pantry-open" aria-label="常備品リストを開く"><span>🧂 常備品 <strong>${count}</strong></span>${alert ? '<span class="pantry-alert-dot" title="買い替え時期または切れた品があります" aria-hidden="true"></span>' : ""}</button>`;
}

function renderDailyShopping() {
  const ctx = shopViewContext();
  const items = ctx.items;
  const meals = shopPageMeals();
  const left = new Set(activeLeftovers().map((n) => Lifestyle.shoppingName(n)));
  const laterOf = new Map(items.map((i) => [i.id, freshLater(i)]));
  const later = (i) => laterOf.get(i.id);
  const aisleIdOf = (i) => Aisles.aisleOf(i.name, i.category, state.aisleOverrides || {});
  const aisle = (i) => Aisles.aisleLabel(aisleIdOf(i));
  const order = Aisles.AISLES.map(([, label]) => label);
  const count = (status) => items.filter((i) => i.status === status).length;
  const fix = (i) => aisleEdit ? `<select class="aisle-select" data-aisle-name="${escapeAttr(i.name)}" aria-label="${escapeAttr(i.name)}の売り場">${Aisles.AISLES.map(([id, label]) => `<option value="${id}" ${aisleIdOf(i) === id ? "selected" : ""}>${label}</option>`).join("")}</select>` : "";
  const daysBadge = (i) => useDayBadges(i);
  const needPeek = !swipeGuideSeen() && !isViewer();
  let peekAssigned = false;

  const sortInAisle = (list, catLabel) => {
    const id = Aisles.AISLES.find(([, l]) => l === catLabel)?.[0];
    if (id === "seasoning" && typeof Aisles.seasoningShelfOrder === "function") {
      return [...list].sort((a, b) => Aisles.seasoningShelfOrder(a.name) - Aisles.seasoningShelfOrder(b.name));
    }
    return list;
  };

  const row = (i, status) => {
    const isActionOpen = activeSwipeId === i.id;
    const prefBadge = renderItemPrefBadge(i);
    const subNote = i.status === "sub" ? `<small class="sub-hint">🔄 ${escapeHtml(i.subText || "代用")}</small>` : "";
    const skipNote = i.status === "skip" ? '<small class="skip-hint">⏭ パス</small>' : "";
    const showPeek = needPeek && !peekAssigned && status === "buy";
    if (showPeek) peekAssigned = true;
    const hasExtraBuy = status !== "buy" && status !== "purchased";
    return `<div class="daily-shopping-row swipe-row ${aisleEdit ? "is-fixing" : ""} ${isActionOpen ? "is-swiped-left" : ""} ${hasExtraBuy ? "has-4-acts" : ""} ${showPeek ? "is-peek-demo" : ""}" data-item-id="${escapeAttr(i.id)}">
      ${!isViewer() ? `<div class="swipe-bg" aria-hidden="${!isActionOpen}">
        <div class="swipe-bg-left ${status === "purchased" ? "is-uncheck" : "is-check"}">
          <span class="swipe-circle">${status === "purchased" ? "↺" : "✓"}</span>
          <b>${status === "purchased" ? "戻す" : "購入"}</b>
        </div>
        <div class="swipe-bg-right" role="group" aria-label="${escapeAttr(i.name)}の選択肢">
          ${status === "purchased" ? `<button type="button" class="swipe-act act-buy" data-action="life-shopping-status" data-id="${escapeAttr(i.id)}" data-status="buy"><span>↺</span><small>未購入へ</small></button>` : `
            <button type="button" class="swipe-act act-have" data-action="life-shopping-status" data-id="${escapeAttr(i.id)}" data-status="have"><span>🏠</span><small>ある</small></button>
            <button type="button" class="swipe-act act-sub" data-action="life-item-sub" data-id="${escapeAttr(i.id)}"><span>🔄</span><small>代用</small></button>
            <button type="button" class="swipe-act act-skip" data-action="life-item-skip" data-id="${escapeAttr(i.id)}"><span>⏭</span><small>パス</small></button>
            ${hasExtraBuy ? `<button type="button" class="swipe-act act-buy" data-action="life-shopping-status" data-id="${escapeAttr(i.id)}" data-status="buy"><span>🛒</span><small>買う</small></button>` : ""}
          `}
        </div>
      </div>` : ""}
      <div class="swipe-front shop-row-main">
        ${fix(i)}
        <label class="daily-shopping-check">
          <input type="checkbox" data-shopping-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を購入済みにする" ${status === "purchased" ? "checked" : ""}>
          <span class="shop-line">
            <strong>${escapeHtml(i.name)}</strong>
            ${i.amount ? `<small>${escapeHtml(i.amount)}</small>` : ""}
            ${subNote}${skipNote}
            ${i.recheck ? '<small class="notice">要確認</small>' : ""}
            ${left.has(i.name) ? '<small class="leftover-hint">🧺 残りあり</small>' : ""}
            ${later(i) ? `<small class="later-hint" title="${escapeAttr(`${later(i).label}は傷みやすい食材です`)}">🗓 ${escapeHtml(formatDate(later(i).date))}（${weekdayLabel(later(i).date)}）に使う・傷みやすいので、その前に買うと安心</small>` : ""}
          </span>
        </label>
        ${prefBadge}
        ${later(i) && !isViewer() ? `<button type="button" class="shopping-inline later-btn" data-action="life-item-later" data-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}をあとで買う">あとで</button>` : ""}
        ${daysBadge(i)}
        ${i.id.startsWith("manual-") && !isViewer() ? `<button type="button" class="shop-row-btn shop-del-btn" data-action="life-remove-item" data-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を削除">✕</button>` : ""}
        ${status === "purchased" || isViewer() ? "" : `<button type="button" class="shop-row-btn shop-opt-btn" data-action="life-toggle-item-actions" data-id="${escapeAttr(i.id)}" aria-expanded="${isActionOpen}" aria-label="${escapeAttr(i.name)}の選択肢">${isActionOpen ? "›" : "⋯"}</button>`}
      </div>
    </div>`;
  };

  const groups = (status) => order.map((category) => {
    const list = sortInAisle(items.filter((i) => i.status === status && aisle(i) === category), category);
    return list.length ? `<section class="aisle-group"><h4 class="aisle-tag" title="${escapeAttr(category)}"><span class="sr-only">${category}</span><span aria-hidden="true">${AISLE_SHORT[Aisles.AISLES.find(([, l]) => l === category)?.[0]] || category}</span></h4><div class="aisle-items">${list.map((i) => row(i, status)).join("")}</div></section>` : "";
  }).join("");

  const groupsHaveOrSub = () => order.map((category) => {
    const list = sortInAisle(items.filter((i) => ["have", "sub", "skip"].includes(i.status) && aisle(i) === category), category);
    return list.length ? `<section class="aisle-group"><h4 class="aisle-tag" title="${escapeAttr(category)}"><span class="sr-only">${category}</span><span aria-hidden="true">${AISLE_SHORT[Aisles.AISLES.find(([, l]) => l === category)?.[0]] || category}</span></h4><div class="aisle-items">${list.map((i) => row(i, i.status)).join("")}</div></section>` : "";
  }).join("");

  const buy = count("buy"), purchased = count("purchased"), total = buy + purchased;
  const all = !ctx.isShopped && total > 0 && !buy;
  if (buy) shopDoneLater = false;
  const countHaveSub = items.filter((i) => ["have", "sub", "skip"].includes(i.status)).length;
  const done = renderShoppingDone(items);
  const topActions = `<div class="page-actions">${isViewer() ? "" : renderShopPantryBar()}${items.length || ctx.isShopped ? `<details class="shop-menu"><summary aria-label="買い物メニュー">⋯</summary><div class="shop-menu-list">${dailyButton("copy-shopping", "リストをコピー")}${dailyButton("share-shopping", "共有")}<button type="button" class="secondary-button" data-action="life-aisle-edit">${aisleEdit ? "売り場の直しを終える" : "売り場を直す"}</button>${isViewer() ? "" : '<button type="button" class="secondary-button" data-action="life-pantry-open">常備品</button>'}${done}</div></details>` : ""}</div>`;
  const sheet = all && done && !shopDoneLater ? `<div class="shop-done-sheet" role="dialog" aria-label="買い物完了"><p><b>全部そろった！</b>買い物を終えますか？</p><div>${done}<button type="button" class="text-button" data-action="life-shop-later">あとで</button></div></div>` : "";

  // ブロック見出し＆買い物前／買い物済みステータスカード
  const sb = ctx.sb;
  const b = ctx.block;
  const rangeTitle = b ? `${blockRange(b)}${shopCombineNext && sb?.next && sb.current?.key === b.key ? `＋${blockRange(sb.next)}` : ""}` : (meals.length ? `${formatDate(meals[0].date)}〜` : "");
  const doneDateStr = ctx.doneAt ? formatDate(ctx.doneAt.slice(0, 10)) : "";
  const nextHasConfirmed = !!(sb?.next && sb.next.dates.some((d) => state.mealSlots?.[d]?.status === "confirmed"));
  const showCombineBar = !ctx.isShopped && sb && b && sb.current?.key === b.key && sb.next && !isViewer();
  const combineBtn = showCombineBar
    ? (nextHasConfirmed || shopCombineNext
      ? `<button type="button" class="shop-combine-btn ${shopCombineNext ? "is-active" : ""}" data-action="life-shop-combine" aria-pressed="${shopCombineNext}">${shopCombineNext ? `✓ 次回（${blockRange(sb.next)}）も合算中` : `＋ 次回分（${blockRange(sb.next)}）も一緒に買う`}</button>`
      : `<button type="button" class="shop-combine-btn is-undecided" data-action="life-go-next-plan" data-page="${sb.next.key}">＋ 次回分（${blockRange(sb.next)}）も決めて一緒に買う ›</button>`)
    : "";

  const statusBanner = (items.length || meals.length || b) ? `<section class="shop-status-card ${ctx.isShopped ? "is-shopped" : all ? "is-ready" : "is-before"}" aria-label="買い物の状態">
    <div class="shop-status-top">
      <div class="shop-status-title">
        ${rangeTitle ? `<strong class="shop-block-range">${escapeHtml(rangeTitle)}</strong>` : ""}
        ${ctx.isShopped
          ? `<span class="shop-state-pill is-done">✓ 買い物済み${doneDateStr ? `（${escapeHtml(doneDateStr)}）` : ""}</span>`
          : items.length
            ? `<span class="shop-state-pill ${all ? "is-ready" : "is-before"}">${all ? "✨ カゴにそろった" : "🛒 買い物前"}</span>`
            : `<span class="shop-state-pill is-empty">献立未決定</span>`}
      </div>
      ${total ? `<div class="shop-progress" role="status">
        <span>${ctx.isShopped && !buy ? `購入済み <strong>${purchased}</strong>品` : buy ? `あと<strong>${buy}</strong>` : "そろった！"}</span>
        <span class="shop-bar"><i style="width:${Math.round((purchased / total) * 100)}%"></i></span>
        <small>${purchased}/${total}</small>
      </div>` : ""}
    </div>
    ${meals.length ? renderTripMeals(meals) : ""}
    ${combineBtn ? `<div class="shop-combine-row">${combineBtn}</div>` : ""}
  </section>` : "";

  const swipeHintLine = buy && !isViewer() ? `<p class="shop-swipe-hint small muted"><span>↔ 右スライドで購入チェック・左スライドである／代用／パス</span>${tip("行を指で右にスライドすると「購入済み」、左にスライド（または右の⋯）すると「家にある・代用・今回はパス」が選べます")}</p>` : "";

  const emptyBlockIsPast = b && b.end < today();
  const emptySection = !items.length ? `<section class="panel shop-empty">
    <p>${emptyBlockIsPast ? "この期間の買い物記録はありません。" : "献立が決まると、必要な材料だけのリストができます。"}</p>
    ${emptyBlockIsPast ? "" : dailyButton("go-view", isViewer() ? "献立を見る" : "献立を決める", 'data-view="plan"', true)}
  </section>` : "";

  return `${topActions}${renderShopDiff()}
  <section class="shop-head">
    ${renderShopTabs()}
    ${statusBanner}
  </section>
  ${emptySection}
  ${aisleEdit ? '<button type="button" class="primary-button full-button" data-action="life-aisle-edit">売り場の直しを終える</button>' : ""}
  ${swipeHintLine}
  ${ctx.isShopped && buy ? `<h3 class="shop-sec-head is-add">🛒 追加で買うもの <span class="badge">${buy}</span></h3>` : ""}
  ${buy ? `<div class="shop-list">${groups("buy")}</div>` : ""}
  ${ctx.isShopped && purchased ? `<section class="shop-bought-board"><h3 class="shop-sec-head is-done">✓ 購入済みリスト <span class="badge">${purchased}</span><small>チェックを外すと未購入に戻せます</small></h3><div class="shop-list is-purchased-list">${groups("purchased")}</div></section>` : ""}
  ${isViewer() || emptyBlockIsPast ? "" : `<details class="shop-add"><summary>＋ 買い足す</summary><div class="shopping-add"><input id="manual-name" class="input" maxlength="100" placeholder="品名（例：牛乳）" aria-label="品名"><input id="manual-amount" class="input" maxlength="80" placeholder="数量" aria-label="数量"><button type="button" class="primary-button" data-action="life-add-item" aria-label="買い足すものに追加">追加</button></div></details>`}
  ${count("later") ? `<details class="shopping-fold"><summary><h3>あとで買う <span class="badge">${count("later")}</span></h3><small class="muted">この品は「◯日の分」として、買い足すものに入れました</small></summary>${groups("later")}</details>` : ""}
  ${!ctx.isShopped && purchased ? `<details class="shopping-fold"><summary><h3>購入済み <span class="badge">${purchased}</span></h3><small class="muted">チェックを外すと戻ります</small></summary>${groups("purchased")}</details>` : ""}
  ${countHaveSub ? `<details class="shopping-fold"><summary><h3>家にある・代用・パス <span class="badge">${countHaveSub}</span></h3><small class="muted">左スライドまたは「⋯」から変更できます</small></summary>${groupsHaveOrSub()}</details>` : ""}
  ${sheet}
  ${shopUndo && !sheet ? `<div class="shop-undo" role="status"><span>${escapeHtml(shopUndo.text)}</span><button type="button" data-action="life-shop-undo">↩ 元に戻す</button><button type="button" class="shop-undo-x" data-action="life-shop-undo-close" aria-label="閉じる">✕</button></div><div class="shop-undo-space" aria-hidden="true"></div>` : ""}`;
}
// 常備品だけを直すページ。設定ウィザードと同じデータ（householdProfile / foodProfile / 下書き）を書き換える。
let pantryReturn = "shopping";
let pantryFilterCat = "all";
let pantrySearchQuery = "";

function setPantry(name, value) {
  const base = dailyProfile();
  const pantry = { ...base.pantry, [name]: value };
  state.householdProfile = { equipment: base.equipment, pantry, updatedAt: nowIso() };
  if (state.foodProfile) state.foodProfile = { ...state.foodProfile, pantry };
  if (state.onboardingDraft) state.onboardingDraft.pantry = { ...state.onboardingDraft.pantry, [name]: value };
  touchSettings();
}

function notePantryBought(pantryName) {
  state.pantryMeta = state.pantryMeta || {};
  state.pantryMeta[pantryName] = {
    ...(state.pantryMeta[pantryName] || {}),
    lastBoughtAt: today(),
    updatedAt: nowIso(),
  };
  setPantry(pantryName, "have");
}

function setPantryCycle(name, cycleDays) {
  state.pantryMeta = state.pantryMeta || {};
  const parsed = cycleDays === "0" || cycleDays === 0 ? 0 : Number(cycleDays) > 0 ? Number(cycleDays) : null;
  state.pantryMeta[name] = {
    ...(state.pantryMeta[name] || {}),
    cycleDays: parsed,
    updatedAt: nowIso(),
  };
  saveState();
  render();
}

function renderPantryPage() {
  const pantry = dailyProfile().pantry || {};
  const meta = state.pantryMeta || {};
  const t = today();

  // 全常備品の名前リスト（既知＋追加されたもの）
  const allNames = [...new Set([...Object.values(Lifestyle.pantry).flat(), ...Object.keys(pantry)])];

  // 表示中の献立で使われている常備品
  const tripPantryNames = new Set();
  for (const s of shopPageMeals()) {
    if (!s?.recipe) continue;
    for (const ing of s.recipe.ingredients || []) {
      const k = Lifestyle.shoppingName(ing.name);
      if (allNames.includes(k)) tripPantryNames.add(k);
      else {
        const hit = allNames.find((pn) => Lifestyle.key(pn) === Lifestyle.key(k));
        if (hit) tripPantryNames.add(hit);
      }
    }
  }

  // 🔔 買い替え時期・切れたまま（切れている、または購入日＋周期が到来した品）
  const isItemDue = (name) => {
    const m = meta[name];
    const cycle = effectivePantryCycle(name);
    return !!(m?.lastBoughtAt && cycle > 0 && pantry[name] !== "none" && daysBetween(m.lastBoughtAt, t) >= cycle);
  };
  const alertNames = allNames.filter((name) => (pantry[name] || "unknown") === "none" || isItemDue(name));

  // 買い替え目安（デフォルト賞味期限つき）選択肢
  const cycleOpts = [
    { days: 7, label: "目安1週" },
    { days: 14, label: "目安2週" },
    { days: 30, label: "目安1ヶ月" },
    { days: 60, label: "目安2ヶ月" },
    { days: 90, label: "目安3ヶ月" },
    { days: 180, label: "目安半年" },
    { days: 365, label: "目安1年" },
    { days: 0, label: "通知OFF" },
  ];

  const pantryRow = (name, keyPrefix = "") => {
    const v = pantry[name] || "unknown";
    const m = meta[name];
    const cycle = effectivePantryCycle(name);
    const due = isItemDue(name);
    const inTrip = tripPantryNames.has(name);
    const rowKey = `${keyPrefix}${name}`;
    const isOpen = activePantrySwipe === rowKey;
    const subInfo = v === "none"
      ? ""
      : due
        ? `<span class="pantry-due-tag">🔔 買い替え時期（${formatDate(m.lastBoughtAt)}購入）</span>`
        : m?.lastBoughtAt
          ? `<small class="pantry-cycle-meta">${formatDate(m.lastBoughtAt)} · 目安${formatCycleDays(cycle)}</small>`
          : cycle
            ? `<small class="pantry-cycle-meta">目安${formatCycleDays(cycle)}</small>`
            : "";

    return `<div class="pantry-swipe-row swipe-row ${v === "none" ? "is-out" : v === "have" ? "is-have" : "is-unconfirmed"} ${due ? "is-due" : ""} ${isOpen ? "is-swiped-left" : ""}" data-pantry-row="${escapeAttr(rowKey)}" data-pantry-name="${escapeAttr(name)}">
      <div class="swipe-bg" aria-hidden="${!isOpen}">
        <div class="swipe-bg-left is-check">
          <span class="swipe-circle">🛒</span>
          <b>買うリストへ</b>
        </div>
        <div class="swipe-bg-right pantry-bg-right" role="group" aria-label="${escapeAttr(name)}の操作">
          <select class="pantry-cycle-select" data-pantry-cycle="${escapeAttr(name)}" aria-label="${escapeAttr(name)}の買い替え目安">
            ${cycleOpts.map((o) => `<option value="${o.days}" ${cycle === o.days ? "selected" : ""}>${o.label}</option>`).join("")}
          </select>
          <button type="button" class="swipe-act act-buy" data-action="life-pantry-to-shop" data-name="${escapeAttr(name)}"><span>🛒</span><small>買う</small></button>
        </div>
      </div>
      <div class="swipe-front pantry-row-front">
        <button type="button" class="pantry-item-main" data-action="life-pantry-set" data-name="${escapeAttr(name)}" aria-pressed="${v === "unknown" ? "mixed" : v === "have"}" title="タップで在庫のあり／切れたを切り替え">
          <span class="pantry-dot" aria-hidden="true"></span>
          <strong class="pantry-name">${escapeHtml(name)}</strong>
          ${v === "none" ? '<span class="pantry-out-badge">切れた</span>' : ""}
          ${inTrip ? '<span class="pantry-in-trip-badge">今回</span>' : ""}
          ${subInfo}
        </button>
        ${v === "none" || due ? `<button type="button" class="pantry-quick-shop" data-action="life-pantry-to-shop" data-name="${escapeAttr(name)}" aria-label="${escapeAttr(name)}を買い物リストへ追加">＋買う</button>` : ""}
        <button type="button" class="shop-row-btn shop-opt-btn" data-action="life-toggle-pantry-actions" data-row="${escapeAttr(rowKey)}" aria-expanded="${isOpen}" aria-label="${escapeAttr(name)}の周期・買い足し設定">${isOpen ? "›" : "⋯"}</button>
      </div>
    </div>`;
  };

  // 検索とカテゴリフィルタ（スーパーの売り場ベース）
  const q = (pantrySearchQuery || "").trim().toLowerCase();
  const shelves = Lifestyle.PANTRY_SHELVES || ["調味料・油", "つゆ・たれ・ソース", "だし・中華・スパイス", "粉・乾物・缶詰", "米・パン・麺", "冷蔵・冷凍", "その他"];
  const filteredNames = allNames.filter((name) => {
    if (q && !name.toLowerCase().includes(q)) return false;
    if (pantryFilterCat === "trip") return tripPantryNames.has(name);
    if (pantryFilterCat === "alert") return alertNames.includes(name);
    if (pantryFilterCat !== "all") return Lifestyle.pantryCategoryOf(name) === pantryFilterCat;
    return true;
  });

  const categorized = shelves.map((cat) => ({
    cat,
    names: filteredNames.filter((name) => Lifestyle.pantryCategoryOf(name) === cat),
  })).filter((g) => g.names.length > 0);

  const shelfShort = {
    all: "すべて",
    trip: `🍳 今回 (${tripPantryNames.size})`,
    "調味料・油": "🧂 調味料・油",
    "つゆ・たれ・ソース": "🫙 つゆ・たれ・マヨ",
    "だし・中華・スパイス": "🧄 だし・中華・薬味",
    "粉・乾物・缶詰": "🥫 粉・乾物・缶",
    "米・パン・麺": "🍚 米・パン・麺",
    "冷蔵・冷凍": "🥛 冷蔵・冷凍",
    その他: "その他",
  };
  const catTabs = ["all", ...(tripPantryNames.size ? ["trip"] : []), ...shelves.filter((c) => allNames.some((n) => Lifestyle.pantryCategoryOf(n) === c))];

  return `<section class="pantry-page">
    <div class="pantry-head">
      <button type="button" class="text-button" data-action="life-pantry-back">← もどる</button>
      <span class="pantry-help-line muted small">タップで切替・横スライドで操作 ${tip("家にある調味料や定番食材です。緑●の品は買い物リストで自動的に「家にある」に入ります。右スライドで買い物リストへ追加、左スライド（または⋯）で賞味期限・買い替え目安を変更できます")}</span>
    </div>

    <div class="pantry-toolbar">
      <input id="pantry-search-input" class="input pantry-search-input" type="search" placeholder="🔍 品名で探す（みりん、油など）" value="${escapeAttr(pantrySearchQuery)}" aria-label="常備品を検索">
      <div class="pantry-cat-tabs" role="tablist" aria-label="常備品カテゴリ">
        ${catTabs.map((c) => `<button type="button" class="choice-button ${pantryFilterCat === c ? "is-active" : ""}" data-action="life-pantry-cat" data-cat="${c}" aria-pressed="${pantryFilterCat === c}">${shelfShort[c] || c}</button>`).join("")}
      </div>
    </div>

    ${alertNames.length && pantryFilterCat === "all" && !q ? `<section class="pantry-alert-section">
      <h3 class="pantry-section-title">🔔 買い替え時期・切れた品 <span class="badge">${alertNames.length}</span></h3>
      <div class="pantry-list-box">${alertNames.map((n) => pantryRow(n, "alert:")).join("")}</div>
    </section>` : ""}

    <section class="pantry-all-section">
      ${categorized.length ? categorized.map((g) => `
        <h4 class="pantry-group-heading">${escapeHtml(shelfShort[g.cat] || g.cat)} <small class="muted">${g.names.length}</small></h4>
        <div class="pantry-list-box">${g.names.map((n) => pantryRow(n)).join("")}</div>
      `).join("") : '<p class="muted small pantry-empty">見つかりませんでした。</p>'}
    </section>

    <div class="shopping-add pantry-add">
      <input id="pantry-name" class="input" maxlength="99" placeholder="常備品を追加（例：白だし）" aria-label="常備品の名前">
      <button type="button" class="primary-button" data-action="life-pantry-add">追加</button>
    </div>
  </section>`;
}
// Device-local progress: never share cooking checkmarks with another household member.
let cookingProgress = (() => {
  try { const value = JSON.parse(localStorage.getItem("ripigochi-cooking-progress") || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
})();
function cookingCheck(kind, index, recipe, servings) {
  const key = JSON.stringify([cookingDate, recipe.id, servings, kind, index, kind === "ingredient" ? recipe.ingredients[index] : recipe.steps[index]]);
  return `<input type="checkbox" data-cooking-check="${escapeAttr(key)}" ${cookingProgress[key] ? "checked" : ""}>`;
}
// 作る画面とレシピの詳細で同じ：材料（タレはまとめて）・作り方（⏰タイマー・手順ごとの材料）・🍳 料理モード。
function cookSections(recipe, servings) {
  const amountOf = (x) => scaleAmountForServings(x.amount, servings, recipe.sourceServings);
  const steps = recipe.steps || [];
  // 覚えやすく書き直した手順があれば、それを表に（元の手順は各手順の下の「動画では」に。▶ はまとめた最初の元の手順の時刻。APP_MAP §49）。
  const guide = recipeGuide(recipe);
  const shown = guide ? guide.map((g) => g.text) : steps;
  const guideSlotOf = (g, t) => g.from.find((j) => Number.isFinite(t?.[j])) ?? g.from[0];
  const isFixed = () => typeof isTimecodeFixed === "function" && isTimecodeFixed(recipe);
  const timesOf = guide ? () => {
    const t = recipeStepTimes(recipe);
    const mapped = guide.map((g) => {
      const j = guideSlotOf(g, t);
      return Number.isFinite(t[j]) ? t[j] : null;
    });
    if (isFixed()) return mapped;
    return typeof CookMode?.refineTimes === "function" ? CookMode.refineTimes(shown, mapped, { durationSeconds: recipe.durationSeconds }) : mapped;
  } : () => recipeStepTimes(recipe);
  // 埋め込み再生ができない動画は、料理モードでは写真を出す（動画は YouTube で開く）。
  const slot = state.mealSlots?.[cookingDate];
  CookMode.setRecipe({
    title: recipe.title,
    steps: shown,
    timesOf,
    timesFixed: isFixed,
    durationSeconds: recipe.durationSeconds,
    onTimeFix: (idx, sec) => {
      if (typeof saveQuickTimeFix !== "function") return;
      const origIdx = guide && guide[idx] ? guideSlotOf(guide[idx], recipeStepTimes(recipe)) : idx;
      saveQuickTimeFix(recipe, origIdx, sec);
    },
    videoId: recipe.embeddable === false ? "" : youtubeVideoId(recipe.videoUrl),
    shorts: /youtube\.com\/shorts\//i.test(recipe.videoUrl || ""),
    ingredients: recipe.ingredients || [],
    amountOf,
    photoHtml: dishTile(recipe, "cm-photo"),
    staple: Lifestyle.traits(recipe).staple,
    side: slot?.side,
    markScope: { date: cookingDate, recipeId: recipe.id },
  });
  const timed = shown.some((st) => CookMode.timesIn(st).length);
  const fixing = typeof timeFix !== "undefined" && timeFix?.key === timecodeKey(recipe);
  // 最初の「下ごしらえ：」などの要点は太字に（覚える手がかり）。
  const guideKeyHtml = (text, gi) => { const m = String(text).match(/^([^：:。、]{1,10})[：:]\s*(.+)$/s); return m ? `<b class="guide-key">${escapeHtml(m[1])}</b>${CookMode.stepHtml(m[2], `${gi + 1}. ${m[1]}`)}` : CookMode.stepHtml(text, `${gi + 1}. ${String(text).slice(0, 12)}`); };
  const curTimes = recipeStepTimes(recipe);
  const guideList = () => `<ol class="cooking-steps cook-list has-guide" data-steps-of="${escapeAttr(recipe.id)}">${guide.map((g, gi) => { const slotIdx = guideSlotOf(g, curTimes); return `<li><div class="cs-text"><span class="step-time-slot" data-guide-slot="${slotIdx}">${stepTimeButton(recipe, slotIdx)}</span>${guideKeyHtml(g.text, gi)}</div>${CookMode.usesHtml(g.text, recipe.ingredients || [], amountOf)}<details class="guide-src"${fixing ? " open" : ""}><summary>動画では：手順${g.from.map((j) => j + 1).join("・")}</summary><ol class="guide-orig">${g.from.map((j) => `<li value="${j + 1}">${stepTimeSlot(recipe, j)}${escapeHtml(steps[j])}</li>`).join("")}</ol></details></li>`; }).join("")}</ol>`;
  return {
    ingredients: (recipe.ingredients || []).length ? CookMode.ingredientsHtml(recipe.ingredients, amountOf, "", { date: cookingDate, recipeId: recipe.id }) : '<p class="muted small">材料が登録されていません。</p>',
    steps: `<div class="cooking-steps-head"><h3>作り方 <small class="muted">${guide ? `<span class="guide-badge">✍ 覚えやすい手順${tip("動画の手順をAIが覚えやすくまとめました。数字（時間・温度・分量）は動画のまま。各手順の下の「動画では」で元の手順を見られます")}</span>${timed ? "・" : ""}` : ""}${timed ? "⏰でタイマー" : ""}${timecodeHintHtml(recipe, timed || guide ? "・" : "")}</small></h3>${steps.length ? '<div class="cook-mode-cta"><button type="button" class="primary-button cook-mode-open" data-cook-mode="open">🍳 料理モード</button><small>✋ 手をかざして進める</small></div>' : ""}</div>
      ${steps.length ? `${guide ? guideList() : `<ol class="cooking-steps cook-list" data-steps-of="${escapeAttr(recipe.id)}">${steps.map((st, index) => `<li><div class="cs-text">${stepTimeSlot(recipe, index)}${CookMode.stepHtml(st, `${index + 1}. ${String(st).slice(0, 12)}`)}</div>${CookMode.usesHtml(st, recipe.ingredients || [], amountOf)}</li>`).join("")}</ol>`}${timeFixBar(recipe)}`
        : '<p class="muted small">作り方がまだありません。動画から読み取ると、🍳 料理モードが使えます。</p>'}`,
  };
}
function renderCooking() {
  const day = dailyPlan().find((d) => d.date === cookingDate);
  const slot = state.mealSlots?.[cookingDate];
  const recipe = slot?.recipe || day?.candidate?.recipe;
  ensureTimecodes(recipe);
  // 献立の枠の写しも、運営が直した最新の版にする（APP_MAP §52-9）。
  if (slot?.recipe) ensureLatest(slot.recipe);
  if (!recipe)
    return `<section class="panel"><h2>料理を選び直してください</h2>${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</section>`;
  const servings = slot?.servings || dailyProfile().servings;
  const cook = cookSections(recipe, servings);
  const meta = [`${servings}人分`, recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分（炊飯は別）` : "時間は未確認", recipe.planning?.equipment?.length ? `器具：${recipe.planning.equipment.join("・")}` : ""].filter(Boolean).join(" · ");
  const primary = !isViewer() && slot?.status === "confirmed" && canRecordDate(cookingDate) ? dailyButton("life-cooked", "作った！", "", true) : !isViewer() && (!slot || slot.status === "removed") ? dailyButton("life-confirm-one", "この日の献立に確定", `data-date="${cookingDate}"`, true) : "";
  return `<section class="hero-card cooking-card"><div class="detail-top"><button type="button" class="text-button cooking-back" data-action="go-view" data-view="plan">‹ 献立へ戻る</button>${objectionButton(recipe, cookingDate)}</div><div class="cooking-head">${planThumb(recipe)}<div><p class="eyebrow">${formatDate(cookingDate)}（${weekdayLabel(cookingDate)}） · ${slot?.recipe ? "確定" : "提案中"}</p><h2>${escapeHtml(recipe.title)}</h2><p class="muted small">${escapeHtml(meta)}</p>${CookMode.supported() ? `<p class="wake-chip">🔆 画面つけっぱなし ${tip("作る画面の間は、スマホの画面が消えません")}</p>` : ""}</div></div>
  <details class="cooking-safety"><summary>⚠️ 原材料・火の通りを確認</summary><p class="small">食材制限がある場合は市販品の原材料表示も確認してください。ごはんは炊いたものを用意し、加熱時間は様子を見て調整してください。中心温度の確認には食品用温度計を使い、2人分のレンジ加熱は途中で混ぜて追加加熱してください。</p></details>
  ${renderCreatorCredit(recipe)}
  ${Lifestyle.traits(recipe).staple === "other" ? `<div class="cooking-staple-alert"><span class="csa-icon" aria-hidden="true">🍚</span><div class="csa-text"><strong>ごはん（主食）の準備はOKですか？</strong><p class="small muted">おかずがメインの献立です。炊飯のセットや主食の用意をお忘れなく！</p></div></div>` : ""}
  ${slot?.side ? `<div class="cooking-side-box"><b>🥢 今日の添え物：${escapeHtml(slot.side)}</b><p class="small muted">${escapeHtml(Lifestyle.sideOf(slot.side)?.desc || "")}</p></div>` : ""}
  ${canAnalyzeRecipe(recipe) ? `<p>${dailyButton("life-analyze", analyzingDate ? "作成中…" : "動画の説明文から下書きを作る",`data-date="${cookingDate}" ${analyzingDate ? "disabled" : ""}`)}</p>` : ""}
  ${slot?.recipe ? renderSourceNote(slot.recipe, !isViewer(), cookingDate) : ""}
  ${slot?.recipe ? renderSourceReload(slot.recipe, !isViewer(), cookingDate) : ""}
  ${servingsUnknownBanner(recipe, !isViewer() && (!!slot?.recipe || state.recipes.some((x) => x.id === recipe.id)), slot?.recipe ? cookingDate : "")}
  ${servingsManualNote(recipe)}
  <h3>材料 <small class="muted">${recipe.sourceServings == null ? "動画の分量のまま" : `${servings}人分`}</small></h3>${cook.ingredients}
  ${cook.steps}
  <div class="actions">${dailyButton("life-save-copy", "自分のレシピに保存", `data-recipe="${escapeAttr(recipe.id)}"`)}</div>${primary ? `<div class="cooking-primary">${primary}</div>` : ""}</section>`;
}
// ----- 記録の編集（食べた日・次に食べたい頃・写真・メモ） -----
let recordDraft = null;
function recordRecipe(e) {
  return recipeById(e.recipeId) || Lifestyle.curated.find((c) => c.id === e.recipeId) || { id: e.recipeId, title: e.recipeTitle || "保存済みの料理", ingredients: [] };
}
function openRecordEditor(evaluation) {
  recordDraft = clone(evaluation);
  recordDraft.familyRepeatCycles = { ...(evaluation.familyRepeatCycles || {}) };
  state.view = "recordDetails";
}
// 記録の事実：作った回数と日付・その日の人数・元の動画・もう一度、献立に入れる（docs/PERSONALIZE_PLAN.md §10）。
function cookHistory(recipeId) {
  return state.evaluations.filter((e) => e.recipeId === recipeId && e.cookedAt).map((e) => e.cookedAt.slice(0, 10)).sort().reverse();
}
function renderRecordFacts(d, r) {
  const dates = cookHistory(d.recipeId);
  const servings = d.id.startsWith("meal-") ? state.mealSlots?.[d.cookedAt?.slice(0, 10)]?.servings : null;
  const facts = [
    dates.length ? `🍳 ${dates.length}回つくった${dates.length > 1 ? `（${dates.slice(0, 4).map((x) => formatDate(x)).join("・")}${dates.length > 4 ? "ほか" : ""}）` : ""}` : "",
    servings ? `👥 この日は${servings}人分` : "",
  ].filter(Boolean);
  const video = r.videoUrl ? `<a class="text-button" href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noopener">▶ 元の動画${r.author ? `（${escapeHtml(r.author)}）` : ""}</a>` : "";
  const again = !isViewer() && !d.isNew && allDinnerRecipes().some((x) => x.id === r.id) ? dailyButton("life-replan", "🔁 もう一度、献立に入れる", `data-recipe="${escapeAttr(r.id)}"`) : "";
  return facts.length || video || again ? `<div class="record-facts">${facts.length ? `<p class="small">${facts.map((f) => escapeHtml(f)).join("<br>")}</p>` : ""}<div class="record-links">${video}${again}</div></div>` : "";
}
// もう一度、献立に入れる：まだ決めていない、いちばん近い日（条件に合う日だけ）の下書きに入れる。決めた日は置き換えない。
function replanRecipe(id) {
  const r = allDinnerRecipes().find((x) => x.id === id);
  if (!r) return "";
  const p = dailyProfile();
  const plan = dailyPlan(), locks = lockedDates(plan);
  // もう入っている日があれば、それを知らせるだけ（同じ料理を2回入れない）。
  // 同じ料理：同じID・どちらかが元のおすすめ・同じおすすめから保存したコピー同士（家族の別の端末で保存した時など）。
  const same = (x) => x && (x.id === r.id || (x.starterId && (x.starterId === r.id || x.starterId === r.starterId)) || (r.starterId && r.starterId === x.id));
  const has = plan.find((d) => d.date >= today() && !d.off && d.slot?.status !== "off" && same(d.slot?.recipe || d.candidate?.recipe));
  if (has) return { date: has.date, already: true };
  // 本人がほかの料理を選んだ日（下書きの入れ替え）も置き換えない。
  const day = plan.find((d) => d.date >= today() && !d.off && !d.prestart && !locks.has(d.date) && !state.planOverrides[d.date] && !(d.slot && ["confirmed", "cooked", "off"].includes(d.slot.status)) && Lifestyle.fit(r, p, d.date).ok);
  if (!day) return "";
  const before = dailyShopping();
  state.planOverrides[day.date] = r.id;
  changedShopping(before);
  return { date: day.date, already: false };
}
function renderRecordEditor() {
  const d = recordDraft;
  if (!d) return `<section class="panel"><p>記録が見つかりません。</p>${dailyButton("go-view", "ふりかえりへ", 'data-view="repeat"')}</section>`;
  const r = recordRecipe(d);
  const fixedDate = d.id.startsWith("meal-");
  const photo = isDataPhoto(d.photo) ? `<img class="dish-tile record-photo" src="${escapeAttr(d.photo)}" alt="">` : dishTile(r, "record-photo");
  return `<section class="record-editor">
    <button type="button" class="text-button cooking-back" data-action="life-record-back">‹ ふりかえりへ</button>
    <div class="record-head">${photo}<div><p class="eyebrow">${d.isNew ? "作った記録をつける" : "記録を編集"}</p><h2>${escapeHtml(r.title)}</h2><p class="muted small">${escapeHtml(lastEatenLabel(r) === "はじめて" ? "はじめての記録" : lastEatenLabel(r))}</p></div></div>
    ${renderRecordFacts(d, r)}
    <label class="record-field">食べた日<input id="record-date" class="input" type="date" max="${today()}" value="${escapeAttr(d.cookedAt)}" ${fixedDate ? "readonly" : ""}></label>
    <h3 class="record-h">次はいつ食べたい？</h3>
    <p class="muted small">ふたりとも食べたくなる頃に、また献立に入ります。</p>
    ${raterNames().map((name) => renderCyclePicker(name, d.familyRepeatCycles[name], (cycle) => `data-action="life-record-cycle" data-member="${escapeAttr(name)}" data-cycle="${cycle}"`)).join("")}
    <label class="record-field">メモ<textarea id="record-memo" class="textarea" maxlength="400" placeholder="例：次は具を多めに">${escapeHtml(d.memo || "")}</textarea></label>
    <div class="record-photo-actions"><label class="secondary-button" for="record-photo">📷 写真を${d.photo ? "変える" : "追加"}</label><input id="record-photo" type="file" accept="image/*" hidden>${d.photo ? '<button type="button" class="text-button" data-action="life-record-photo-remove">写真を外す</button>' : ""}</div>
    ${d.isNew ? "" : renderCreatorThanks(r, d)}
    ${dailyButton("life-record-save", "記録を保存", "", true)}
    ${d.isNew ? "" : '<button type="button" class="text-button danger full-button" data-action="life-record-delete">この記録を削除</button>'}
  </section>`;
}

let reflMonth = 0; // 0 = this month, -1 = last month, ...
function reflectionMonth() {
  const [y, m] = today().split("-").map(Number);
  const d = new Date(y, m - 1 + reflMonth, 1);
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.getFullYear() === new Date().getFullYear() ? `${d.getMonth() + 1}月` : `${d.getFullYear()}年${d.getMonth() + 1}月` };
}
// わかってきたこと：評価から見えた好み。まだ少ないうちは、あと何品かだけ出す。
function renderInsights(recipeOf, favId = "") {
  if (!state.evaluations.length) return "";
  let { left, items } = Lifestyle.insights({ evaluations: state.evaluations, recipeOf: (id) => recipeOf({ recipeId: id }), family: state.family || [] });
  items = items.filter((x) => !(x.kind === "staple" && x.recipeId === favId)); // 今月の偏愛と同じ料理は重ねない
  const body = left ? `<p class="muted">あと<b>${left}品</b>「また食べたい」をつけると見えてきます</p>`
    : items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x.text)}</li>`).join("")}</ul>` : "";
  if (!body) return "";
  return `<section class="insight-card">${yohaku("open", "ic-yohaku")}<h3>💡 わかってきたこと ${tip("評価から見えた好み。献立の提案にも使っています")}</h3>${body}</section>`;
}
// 🏆 わが家の定番：2回以上つくって、だれかの（人ごとの）いちばん新しい評価が「明日でも／毎週」の料理。もう一度、献立に入れられる。
// 回数・前回の日は記録全体から。評価は Lifestyle.latestRatings（片方だけの新しい記録で、もう片方の評価を落とさない）。
function stapleRecipes(recipeOf) {
  const latest = new Map();
  const times = new Map();
  for (const e of state.evaluations) {
    if (!e.recipeId || !e.cookedAt) continue;
    times.set(e.recipeId, (times.get(e.recipeId) || 0) + 1);
    const cur = latest.get(e.recipeId);
    if (!cur || e.cookedAt > cur.cookedAt) latest.set(e.recipeId, e);
  }
  const ratings = Lifestyle.latestRatings(state.evaluations);
  return [...times].filter(([id, n]) => n >= 2 && Object.values(ratings.get(id)?.cycles || {}).some((c) => c === "weekly" || c === "tomorrow"))
    .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => ({ recipe: recipeOf(latest.get(id)), times: n, last: latest.get(id).cookedAt.slice(0, 10) }));
}
// 🌱 もうすぐ定番（1回作って「明日でも／毎週」がついた料理。あと1回作ると定番入り）。
function stapleCandidates(recipeOf) {
  const latest = new Map();
  const times = new Map();
  for (const e of state.evaluations) {
    if (!e.recipeId || !e.cookedAt) continue;
    times.set(e.recipeId, (times.get(e.recipeId) || 0) + 1);
    const cur = latest.get(e.recipeId);
    if (!cur || e.cookedAt > cur.cookedAt) latest.set(e.recipeId, e);
  }
  const ratings = Lifestyle.latestRatings(state.evaluations);
  return [...times].filter(([id, n]) => n === 1 && Object.values(ratings.get(id)?.cycles || {}).some((c) => c === "weekly" || c === "tomorrow"))
    .sort((a, b) => String(latest.get(b[0])?.cookedAt || "").localeCompare(String(latest.get(a[0])?.cookedAt || "")))
    .slice(0, 4).map(([id, n]) => ({ recipe: recipeOf(latest.get(id)), times: n, last: latest.get(id).cookedAt.slice(0, 10) }));
}
function renderStaples(recipeOf) {
  const list = stapleRecipes(recipeOf);
  const cands = stapleCandidates(recipeOf);
  if (!list.length && !cands.length) return "";
  const can = (r) => !isViewer() && allDinnerRecipes().some((x) => x.id === r.id);
  const rankBadge = (n) => n >= 5 ? '<span class="staple-rank is-gold">👑 殿堂</span>' : n >= 3 ? '<span class="staple-rank is-silver">⭐ 常連</span>' : '<span class="staple-rank">🏆 定番</span>';
  const candHtml = cands.length ? `<div class="staple-candidates"><p class="staple-cand-head">🌱 <b>もうすぐ定番</b> <small class="muted">あと1回作ると定番入り！</small></p><ul class="staple-list is-cand">${cands.map(({ recipe, last }) => `<li>${dishTile(recipe, "staple-photo")}<div><b>${escapeHtml(recipe.title)}</b><small>1回（あと1回！）· 前回 ${escapeHtml(formatDate(last))}</small></div></li>`).join("")}</ul></div>` : "";
  if (!list.length) return `<section class="staple-card is-growing"><h3>🌱 わが家の定番候補 ${tip("2回以上つくって、「また食べたい」がつくと定番図鑑に入ります")}</h3>${candHtml}</section>`;
  return `<section class="staple-card"><h3>🏆 わが家の定番 <span class="badge">${list.length}品</span> ${tip("2回以上つくって、「また食べたい」がついた料理")}</h3><ul class="staple-list">${list.map(({ recipe, times, last }) => `<li>${dishTile(recipe, "staple-photo")}<div><b>${escapeHtml(recipe.title)}</b><small>${times}回・前回 ${escapeHtml(formatDate(last))} ${rankBadge(times)}</small></div>${can(recipe) ? `<button type="button" class="secondary-button" data-action="life-replan" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}をもう一度、献立に入れる">🔁 もう一度</button>` : ""}</li>`).join("")}</ul>${candHtml}</section>`;
}
// 「わたしの食卓」の見せ方：月のカレンダー（既定）か、写真の一覧。端末ごとに覚える（なくても動く）。
let reflView = (() => { try { const v = localStorage.getItem("ripigochi-refl-view"); return v === "grid" || v === "book" ? v : "cal"; } catch { return "cal"; } })();
// 記録の月のカレンダー（日曜はじまり）。作った日は写真、2品以上は「+1」。タップでその日のいちばん新しい記録を開く。先の日は空。
function renderRecordCalendar(list, monthKey, recipeOf, photoOf) {
  // 同じ日の記録は新しい順：更新した日時、同じなら保存の順（新しい記録は state.evaluations の先頭に入る）。
  const order = new Map(state.evaluations.map((e, i) => [e, i]));
  const newer = (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")) || (order.get(a) ?? 0) - (order.get(b) ?? 0);
  const byDay = new Map();
  list.forEach((e) => { const k = e.cookedAt.slice(0, 10); byDay.set(k, [...(byDay.get(k) || []), e]); });
  byDay.forEach((recs) => recs.sort(newer));
  const first = `${monthKey}-01`;
  const lead = new Date(first + "T12:00:00").getDay();
  const days = new Date(Number(monthKey.slice(0, 4)), Number(monthKey.slice(5, 7)), 0).getDate();
  const t = today();
  const cells = [...Array.from({ length: lead }, () => '<span class="cal-cell is-blank" aria-hidden="true"></span>'), ...Array.from({ length: days }, (_, i) => {
    const date = addDays(first, i), n = i + 1, recs = byDay.get(date) || [];
    const cls = ["cal-cell", date === t ? "is-today" : "", date > t ? "is-later" : ""].filter(Boolean).join(" ");
    if (!recs.length) return `<span class="${cls} is-empty"><span>${n}</span></span>`;
    const e = recs[0], r = recipeOf(e);
    const names = recs.map((x) => recipeOf(x).title).join("・");
    return `<button type="button" class="${cls}" data-action="life-edit-record" data-id="${escapeAttr(e.id)}" aria-label="${escapeAttr(`${formatDate(date)} ${names}の記録を開く`)}">${photoOf(e, r)}<span>${n}</span>${recs.length > 1 ? `<b class="cal-more">+${recs.length - 1}</b>` : ""}</button>`;
  })].join("");
  return `<div class="record-cal"><div class="cal-head" aria-hidden="true">${["日", "月", "火", "水", "木", "金", "土"].map((w) => `<span>${w}</span>`).join("")}</div><div class="cal-grid">${cells}</div></div>`;
}
function renderReflection() {
  const month = reflectionMonth();
  const recipeOf = (e) => recipeById(e.recipeId) || Lifestyle.curated.find((c) => c.id === e.recipeId) || { id: e.recipeId, title: e.recipeTitle || "保存済みの料理", ingredients: [] };
  const list = state.evaluations.filter((e) => (e.cookedAt || "").startsWith(month.key)).sort((a, b) => b.cookedAt.localeCompare(a.cookedAt));
  const loved = (e) => Object.values(e.familyRepeatCycles || {}).filter((c) => c === "weekly" || c === "tomorrow").length;
  const tally = new Map();
  list.forEach((e) => {
    const t = tally.get(e.recipeId) || { e, times: 0, love: 0 };
    t.times += 1;
    t.love += loved(e);
    tally.set(e.recipeId, t);
  });
  const fav = [...tally.values()].sort((a, b) => b.love - a.love || b.times - a.times)[0];
  const favRecipe = fav && recipeOf(fav.e);
  const favNote = fav ? (fav.love && bothLike(favRecipe) ? "ふたりとも「また食べたい」" : fav.times > 1 ? `${fav.times}回つくりました` : fav.love ? "「また食べたい」の一皿" : "今月の一皿") : "";
  const lovedCount = [...tally.values()].filter((t) => t.love).length;
  const nav = `<div class="month-nav"><button type="button" class="round-icon" data-action="life-month" data-delta="-1" aria-label="前の月">‹</button><strong>${month.label}</strong><button type="button" class="round-icon" data-action="life-month" data-delta="1" aria-label="次の月" ${reflMonth >= 0 ? "disabled" : ""}>›</button></div>`;
  const photoOf = (e, r) => isDataPhoto(e.photo) ? `<img class="dish-tile" src="${escapeAttr(e.photo)}" alt="" loading="lazy">` : dishTile(r);
  const tiles = list.slice(0, 31).map((e) => {
    const r = recipeOf(e);
    const photo = photoOf(e, r);
    return `<button type="button" class="table-tile" data-action="life-edit-record" data-id="${escapeAttr(e.id)}" aria-label="${escapeAttr(`${formatDate(e.cookedAt)} ${r.title}の記録を開く`)}">${photo}<span class="day-num">${Number(e.cookedAt.slice(8, 10))}</span>${loved(e) ? '<span class="tile-love" aria-hidden="true">😍</span>' : ""}<small>${escapeHtml(r.title)}</small></button>`;
  }).join("");
  return `<div class="page-actions">${nav}</div>
  ${list.length ? `<div class="refl-stats"><p><strong>${list.length}</strong><small>回つくった</small></p><p><strong>${tally.size}</strong><small>種類の料理</small></p><p><strong>${lovedCount}</strong><small>また食べたい</small></p></div>` : ""}
  ${reflMonth === 0 ? renderInsights(recipeOf, favRecipe?.id) : ""}
  ${reflMonth === 0 ? renderStaples(recipeOf) : ""}
  ${reflMonth === 0 ? renderReflectEvidence() : ""}
  ${fav ? `<section class="fav-card"><p class="eyebrow">${reflMonth === 0 ? "今月" : "この月"}の偏愛</p><div class="fav-body">${dishTile(favRecipe, "fav-photo")}<div><h3>${escapeHtml(favRecipe.title)}</h3><p class="hand"><span class="marker">${escapeHtml(favNote)}</span></p></div></div></section>` : ""}
  ${reflMonth === 0 ? renderMenuAlbum() : ""}
  <section class="table-section"><div class="table-head"><h3>わたしの食卓</h3><div class="view-switch" role="group" aria-label="見せ方">${list.length ? `<button type="button" class="chip-button" data-action="life-refl-view" data-view="cal" aria-pressed="${reflView === "cal"}">📅 カレンダー</button><button type="button" class="chip-button" data-action="life-refl-view" data-view="grid" aria-pressed="${reflView === "grid"}">🖼 写真</button>` : ""}<button type="button" class="chip-button" data-action="life-refl-view" data-view="book" aria-pressed="${reflView === "book"}">🃏 図鑑</button></div></div>
  ${reflView === "book" ? renderCardBookInline() : tiles ? (reflView === "cal" ? renderRecordCalendar(list, month.key, recipeOf, photoOf) : `<div class="table-grid">${tiles}</div>`) + '<p class="muted small">タップで記録を開く</p>' : `<div class="empty-state">${yohaku("bowl")}<p class="muted">${reflMonth === 0 ? "「作った」を押すと、ここに食卓の記録がたまっていきます。" : "この月の記録はありません。"}</p></div>`}</section>
  ${reflMonth === 0 && typeof renderBackupReminder === "function" ? renderBackupReminder() : ""}
  ${trayFlipId ? renderCardFlipModal() : ""}`;
}
function saveOwnRecipe(recipe) {
  const existing = state.recipes.find(
    (r) => r.id === recipe.id || r.starterId === recipe.id,
  );
  if (existing) return existing;
  const own = {
    ...clone(recipe),
    id: generateId("r"),
    starterId: recipe.curated ? recipe.id : recipe.starterId,
    curated: undefined,
    discover: undefined,
    savedAt: today(),
    updatedAt: nowIso(),
    catalog: null,
  };
  // 受け取った時の中身の指紋（運営があとで直した時、使う人が直していなければ自動で入れ替える。APP_MAP §52-9）。
  if (own.sourceRevision) own.sourcePrint = sourcePrint(own);
  state.recipes.unshift(own);
  return own;
}
function confirmDaily(day, recipe = day.candidate?.recipe) {
  if (!recipe) return;
  // 今週の人気・みんなの定番は、献立に入れた時点で自分のレシピとして保存する（28日で消えても献立は残る）。
  if (recipe.discover) recipe = saveOwnRecipe(recipe);
  sharePopular(recipe, "planned");
  state.mealSlots[day.date] = confirmedSlot(day.date, recipe);
  syncShopPageForDate(day.date);
}
// 決めた日の枠（confirmDaily と、今夜の4皿の「新しく買う」の予告で同じものを使う＝予告と実際がずれない）。
function confirmedSlot(date, recipe) {
  const existingSide = state.mealSlots[date]?.side;
  return {
    date,
    mealType: "dinner",
    servings: dailyProfile().servings,
    recipe: clone(recipe),
    status: "confirmed",
    updatedAt: nowIso(),
    ...(existingSide ? { side: existingSide } : {}),
  };
}
// 献立を変えた時の買い物の差分を、品名で残す（買い物タブの上に出す。×で閉じる）。
// bought：もう買ってあるのに、使わなくなった品（残りの食材として使える）。more：買ってあるが、分量が増えた・別の料理にも使う品。
function changedShopping(before) {
  const after = dailyShopping();
  const names = (list) => [...new Set(list.map((x) => x.name))];
  const gone = before.filter((x) => !after.some((b) => b.id === x.id));
  // 買ってあるのに使わなくなった品：リストから消えた「購入済み」と、前の買い物で買った料理の材料のうち、もうどの献立でも使わないもの。
  const nowPlanned = after.planned || plannedIngredients();
  const boughtGone = [...(before.planned || new Map())].filter(([n, b]) => b && !nowPlanned.has(n)).map(([n]) => n);
  const diff = {
    added: names(after.filter((x) => x.status === "buy" && !before.some((b) => b.id === x.id))),
    removed: names(gone.filter((x) => x.status === "buy")),
    bought: [...new Set([...names(gone.filter((x) => x.status === "purchased")), ...boughtGone])],
    more: names(after.filter((x) => x.recheck && before.some((b) => b.id === x.id && b.signature !== x.signature))),
  };
  if (!Object.values(diff).some((l) => l.length)) return;
  shoppingNotice = diff;
  const part = (label, list) => (list.length ? `${label}${list.slice(0, 3).join("・")}${list.length > 3 ? `ほか${list.length - 3}品` : ""}` : "");
  showToast(`買い物：${[part("＋", diff.added), part("−", diff.removed), part("🧺 買ってある：", diff.bought)].filter(Boolean).join("／") || "分量が変わった品があります"}`);
}
// 残っている食材（本人が確かめたもの）。確かめてから7日を過ぎたものは使わない（使ったはずと決めつけない代わりに、古いものは出さない）。
const LEFTOVER_DAYS = 7;
function activeLeftovers() {
  const since = addDays(today(), -LEFTOVER_DAYS);
  return Object.entries(state.leftovers?.items || {}).filter(([, v]) => (v?.at || "").slice(0, 10) >= since).map(([name]) => name);
}
function setLeftover(name, on) {
  const n = String(name || "").normalize("NFKC").trim().slice(0, 30);
  if (!n) return;
  // 期限を過ぎたものは、書く時に外す（たまって新しい物が上限で落ちないように）。
  const since = addDays(today(), -LEFTOVER_DAYS);
  const items = Object.fromEntries(Object.entries(state.leftovers?.items || {}).filter(([, v]) => (v?.at || "").slice(0, 10) >= since));
  if (on) items[n] = { at: nowIso() }; else delete items[n];
  state.leftovers = { items, updatedAt: nowIso() };
}
// 残っているかもしれない食材の候補：買ってあるのに今のリストで使わなくなった品（ここ7日の買った印）と、
// 前の買い物のあとに予定していたのに作らなかった料理の材料。どれも「かもしれない」なので、本人が選ぶまで使わない。
function leftoverCandidates() {
  const since = addDays(today(), -LEFTOVER_DAYS);
  const now = new Set(dailyShopping().map((x) => x.id));
  const byId = new Map();
  const pantry = dailyProfile().pantry || {};
  const add = (name) => { const n = Lifestyle.shoppingName(name); if (n && Lifestyle.isBought(n) && pantry[n] !== "have" && !byId.has(n)) byId.set(n, n); };
  // 手入力の品は、印の鍵（manual-…）ではなく、入力した品名で。
  for (const [id, m] of Object.entries(state.shoppingMarks || {})) if (m?.status === "purchased" && (m.updatedAt || "").slice(0, 10) >= since && !now.has(id)) add(state.manualShopping?.[id]?.name || (/^manual-/.test(id) ? "" : id));
  for (const s of Object.values(state.mealSlots || {})) if (s?.status === "confirmed" && s.recipe && s.date < today() && s.date >= since) (s.recipe.ingredients || []).forEach((i) => add(i.name));
  return [...byId.values()].slice(0, 20);
}
// 傷みやすい食材を、買い物の日から何日も後に初めて使う時の目安（docs/PERSONALIZE_PLAN.md §9「保存できる日数を推測で保証しない」）。
// 何日もつとは言わない。急ぎ度（Lifestyle.freshness の表）が高い物ほど早めに「その前に買うと安心」と知らせ、「あとで買う」は本人が押す。
// 急ぎ度5（刺身・もやし）は2日目から、4（葉もの・魚介）は3日目から、3（ひき肉・豆腐）は4日目から。冷凍品・缶詰などは急がない。
const LATER_AFTER = { 5: 2, 4: 3, 3: 4 };
function shopDayFor(date) {
  if (rhythmOn()) { const b = blocksFrom(today(), 28).find((x) => x.dates.includes(date)); if (b) return b.shopAt.slice(0, 10) < today() ? today() : b.shopAt.slice(0, 10); }
  return today();
}
function freshLater(item) {
  if (item.status !== "buy" || item.id.startsWith("manual-")) return null;
  const dates = (item.parts || []).map((p) => String(p).split(":")[0]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!dates.length) return null;
  const f = Lifestyle.freshness({ ingredients: [{ name: item.name }] });
  const after = LATER_AFTER[f.urgency];
  if (!after || daysBetween(shopDayFor(dates[0]), dates[0]) < after) return null;
  return { date: dates[0], label: f.label };
}
function renderLeftoverPanel() {
  if (isViewer() || !lastShoppedAt()) return "";
  const have = activeLeftovers();
  const names = [...new Set([...have, ...leftoverCandidates()])];
  if (!names.length && !leftoverOpen) return "";
  const undecided = undecidedPlanDates();
  const open = have.length > 0 || leftoverOpen;
  return `<details class="leftover-panel" aria-labelledby="leftover-h"${open ? " open" : ""}><summary class="leftover-summary"><span id="leftover-h" class="quick-sub">🧺 家に残っている食材${have.length ? ` <span class="leftover-badge">${have.length}品選択中</span>` : names.length ? ` <small class="muted">候補${names.length}品</small>` : ""}</span><span class="leftover-toggle">${open ? "閉じる ▴" : "選ぶ ▾"}</span></summary>
    <div class="leftover-body"><p class="muted small leftover-lead">残っているものを選ぶと、その食材を使う料理を先に出します（選んでから7日で外れます）</p>
    ${names.length ? `<div class="leftover-chips" role="group" aria-label="残っている食材">${names.map((n) => `<button type="button" class="chip-button" data-action="life-leftover" data-name="${escapeAttr(n)}" aria-pressed="${have.includes(n)}">${escapeHtml(n)}</button>`).join("")}</div>` : `<p class="muted small">候補はありません。下から足せます</p>`}
    <div class="shopping-add leftover-add"><input id="leftover-name" class="input" maxlength="30" placeholder="ほかに（例：キャベツ）" aria-label="残っている食材"><button type="button" class="secondary-button" data-action="life-leftover-add">足す</button></div>
    ${have.length && undecided.length ? `${dailyButton("life-leftover-rebuild", "🧺 この食材で組み直す", "", true)}<p class="muted small">まだ決めていない${undecided.length}日だけ。決めた献立はそのまま</p>` : ""}
    </div>
  </details>`;
}
let leftoverOpen = false;
// まだ決めていない日（確定・作った・お休みの日は入れない）。組み直しても、決めた献立は置き換えない。
function undecidedPlanDates() {
  return dailyPlan().filter((d) => d.date >= today() && !d.off && !d.prestart && !(d.slot && ["confirmed", "cooked", "off"].includes(d.slot.status))).map((d) => d.date);
}
// 買い物タブの上：献立を変えた時の差分（品名）。
function renderShopDiff() {
  const d = shoppingNotice;
  if (!d || typeof d !== "object") return "";
  const line = (icon, label, list) => (list.length ? `<p><b>${icon} ${label}</b> ${list.map((n) => escapeHtml(n)).join("・")}</p>` : "");
  return `<section class="shop-diff" role="status"><button type="button" class="todo-x" data-action="life-shopdiff-close" aria-label="献立を変えた時の知らせを閉じる">×</button>
    <p class="small"><b>献立を変えたので、買い物が変わりました</b></p>
    ${line("＋", "買う物に増えた", d.added)}${line("−", "いらなくなった", d.removed)}${line("↻", "分量・使う料理が変わった（買ってある分で足りるか確認）", d.more)}
    ${d.bought.length ? `<p><b>🧺 もう買ってあるのに、使わなくなった</b> ${d.bought.map((n) => escapeHtml(n)).join("・")}</p>${isViewer() ? "" : dailyButton("life-shopdiff-leftover", "残っている食材に入れる", "", true)}` : ""}
  </section>`;
}
function dailyRecord(slot) {
  if (isViewer() || !slot || slot.status !== "confirmed" || !canRecordDate(slot.date)) return;
  const prevCooks = cardCookCount(slot.recipe);
  const own = saveOwnRecipe(slot.recipe);
  const id = `meal-${slot.date}`;
  const isNewRecord = !state.evaluations.some((e) => e.id === id);
  if (isNewRecord) {
    state.evaluations.unshift({
      id,
      recipeId: own.id,
      recipeTitle: slot.recipe.title,
      cookedAt: slot.date,
      mealType: "dinner",
      preferencePending: true,
      familyRepeatCycles: {},
      memo: "",
      photo: "",
      updatedAt: nowIso(),
    });
    noteInstallCook();
    // 定番フォルダの作り方なら、ランキングの何位かを聞く。
    if (folderOfRecipe(own)) rankPromptId = own.id;
  }
  completeRequests(slot.recipe);
  sharePopular(slot.recipe, "cooked");
  state.mealSlots[slot.date] = {
    ...slot,
    status: "cooked",
    updatedAt: nowIso(),
  };
  const nextCooks = cardCookCount(own);
  // 初回GET（0→1）またはランク進化（1→2、2→3）の時だけ、食後1タップ評価を邪魔しないお祝いバナーを出す
  if (isNewRecord && nextCooks > prevCooks && nextCooks <= 3) {
    cardGetBannerRecipeId = own.id;
  }
}
function bindDailyEvents() {
  if (typeof CookMode !== "undefined") CookMode.sync();
  if (state.view !== "shopping") shopUndo = null;
  document.querySelector(".shop-pantry")?.addEventListener("toggle", (ev) => { shopPantryOpen = ev.target.open; });
  document.querySelectorAll("[data-folder-pin]").forEach((el) => el.addEventListener("change", () => {
    setFolderPin(el.dataset.folderPin, el.value);
    saveState();
    showToast(el.value ? `毎週${WEEKDAYS[Number(el.value)]}曜は「${state.folders[el.dataset.folderPin].name}」にします。` : "曜日の指定をやめました。");
    render();
  }));
  document.querySelectorAll(".aisle-select").forEach((el) => el.addEventListener("change", () => {
    state.aisleOverrides = { ...(state.aisleOverrides || {}), [Aisles.baseName(el.dataset.aisleName)]: { aisle: el.value, updatedAt: nowIso() } };
    saveState();
    showToast(`「${el.dataset.aisleName}」は次から${Aisles.aisleLabel(el.value)}に並びます。`);
    render();
  }));
  document.querySelector("#record-photo")?.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !recordDraft) return;
    if (!file.type.startsWith("image/")) { showToast("画像ファイルを選んでください。"); return; }
    recordDraft.memo = document.querySelector("#record-memo")?.value ?? recordDraft.memo;
    resizeImage(file).then((url) => { recordDraft.photo = url; render(); }).catch(() => showToast("写真を読み込めませんでした。"));
  });
  bindVideoPlayer();
  // 手順の中の「▶」を押しても、チェックは付け外ししない。
  document.querySelectorAll(".cooking-check .step-time-slot").forEach((el) => el.addEventListener("click", (event) => event.preventDefault()));
  document.querySelectorAll("[data-cooking-check]").forEach((el) => el.addEventListener("change", () => {
    if (el.checked) cookingProgress[el.dataset.cookingCheck] = Date.now();
    else delete cookingProgress[el.dataset.cookingCheck];
    cookingProgress = Object.fromEntries(Object.entries(cookingProgress).filter(([, t]) => t > Date.now() - 7 * 86400000).sort((a,b) => b[1] - a[1]).slice(0, 500));
    try { localStorage.setItem("ripigochi-cooking-progress", JSON.stringify(cookingProgress)); } catch { showToast("調理のチェックを端末に保存できませんでした。"); }
  }));
  document.querySelectorAll("#manual-name, #manual-amount").forEach((el) =>
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) document.querySelector('[data-action="life-add-item"]')?.click();
    }),
  );
  const unconfirm = () => { const el=document.querySelector("#planning-verified"); if(el)el.checked=false; };
  const refreshSummary = () => {
    const picked = (field) => [...document.querySelectorAll(`[data-planning-field="${field}"]:checked`)].map((el) => el.value);
    const text = planningSummaryText({ equipment: picked("equipment"), contains: picked("contains"), tasks: picked("tasks"), noEquipment: !!document.querySelector("#planning-no-equipment")?.checked });
    document.querySelectorAll("[data-planning-summary]").forEach((dd) => (dd.textContent = text[dd.dataset.planningSummary]));
  };
  document.querySelectorAll("[data-planning-minute], [data-planning-easy]").forEach(el=>el.addEventListener("click",()=>{
    const field=el.dataset.planningMinute !== undefined ? "minute" : "easy";
    document.querySelector(field==="minute" ? "#planning-minutes" : "#planning-easy").value=el.dataset[field==="minute" ? "planningMinute":"planningEasy"];
    document.querySelectorAll(`[data-planning-${field}]`).forEach(b=>b.setAttribute("aria-pressed",String(b===el)));
    unconfirm();
  }));
  document.querySelectorAll("[data-planning-field], #planning-minutes, #planning-no-equipment").forEach(el=>el.addEventListener("change",()=>{
    unconfirm();
    if(el.dataset.planningField==="contains") { const c=document.querySelector("#planning-verified"); if(c)c.checked=false; }
    if(el.dataset.planningField==="equipment" && el.checked) document.querySelector("#planning-no-equipment").checked=false;
    if(el.id==="planning-no-equipment" && el.checked) document.querySelectorAll('[data-planning-field="equipment"]').forEach(e=>e.checked=false);
    refreshSummary();
  }));
  document.querySelector("#planning-minutes")?.addEventListener("input", (event) =>
    document.querySelectorAll("[data-planning-minute]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.planningMinute === event.target.value))),
  );

  document.querySelectorAll("[data-shopping-id]").forEach((el) =>
    el.addEventListener("change", () => {
      const item = shopPageItems().find((i) => i.id === el.dataset.shoppingId);
      if (!item) return;
      markSwipeGuideSeen();
      activeSwipeId = null;
      // 直近の1つは、画面の下の「↩ 元に戻す」で戻せる（間違えて押した時に、購入済みを開き直さなくていい）。
      const prev = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      shopUndo = { text: `${el.checked ? "✓" : "↺"} ${item.name}`, undo: () => { state.shoppingMarks[item.id] = prev ? { ...prev, updatedAt: nowIso() } : { status: "buy", signature: item.signature, updatedAt: nowIso() }; } };
      state.shoppingMarks[item.id] = {
        status: el.checked ? "purchased" : "buy",
        signature: item.signature,
        updatedAt: nowIso(),
      };
      if (el.checked) {
        const pantry = dailyProfile().pantry || {};
        const pantryName = Object.keys(pantry).find((n) => Lifestyle.key(n) === item.id || (Lifestyle.key(n) === "米" && item.id === "ごはん")) || item.name;
        if (Lifestyle.keeps(item) || pantry[pantryName] !== undefined) {
          notePantryBought(pantryName);
        }
      }
      if (!dailyShopping().some((i) => i.status === "buy"))
        trackDaily("shopping_completed");
      saveState();
      render();
    }),
  );

  // Gmail風の物理横スライド（買い物行＆常備品行共通：指にリアルタイム追従し、行が増えない1行完結UI）
  document.querySelectorAll(".swipe-row").forEach((row) => {
    const front = row.querySelector(".swipe-front");
    const bg = row.querySelector(".swipe-bg");
    if (!front || !bg) return;
    const isPantry = row.classList.contains("pantry-swipe-row");
    const circle = bg.querySelector(".swipe-circle");
    const rightBox = bg.querySelector(".swipe-bg-right");
    const optBtn = front.querySelector(".shop-opt-btn");
    let startX = 0;
    let startY = 0;
    let baseOffset = 0;
    let curX = 0;
    let tracking = false;
    let dragging = false;
    let aborted = false;

    const getOpenWidth = () => {
      const w = rightBox ? rightBox.offsetWidth : 0;
      if (w > 20) return w;
      if (isPantry) return 168;
      return row.classList.contains("has-4-acts") ? 236 : 178;
    };

    const closeOtherRows = () => {
      document.querySelectorAll(".swipe-row.is-swiped-left").forEach((other) => {
        if (other === row) return;
        other.classList.remove("is-swiped-left", "is-dragging-left", "is-dragging-right", "is-armed");
        const of = other.querySelector(".swipe-front");
        const ob = other.querySelector(".swipe-bg");
        const oo = other.querySelector(".shop-opt-btn");
        if (of) of.style.transform = "";
        if (ob) ob.setAttribute("aria-hidden", "true");
        if (oo) { oo.textContent = "⋯"; oo.setAttribute("aria-expanded", "false"); }
      });
    };

    const startGesture = (clientX, clientY, target) => {
      if (target?.closest?.(".shop-row-btn, .swipe-act, select, .later-btn, .shop-pref-badge, .pantry-quick-shop")) return false;
      startX = clientX;
      startY = clientY;
      const openW = getOpenWidth();
      baseOffset = row.classList.contains("is-swiped-left") ? -openW : 0;
      curX = baseOffset;
      tracking = true;
      dragging = false;
      aborted = false;
      return true;
    };

    const moveGesture = (clientX, clientY, ev) => {
      if (!tracking || aborted) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) {
          aborted = true;
          tracking = false;
          return;
        }
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
          dragging = true;
          closeOtherRows();
          row.classList.remove("is-peek-demo");
          front.style.transition = "none";
          bg.setAttribute("aria-hidden", "false");
        } else {
          return;
        }
      }
      if (ev?.cancelable) ev.preventDefault();
      const openW = getOpenWidth();
      let raw = baseOffset + dx;
      if (raw > 92) raw = 92 + (raw - 92) * 0.25;
      if (raw < -openW - 24) raw = -openW - 24 + (raw + openW + 24) * 0.25;
      curX = raw;
      row.classList.toggle("is-dragging-right", curX > 2);
      row.classList.toggle("is-dragging-left", curX < -2);
      row.classList.toggle("is-armed", curX >= 62);
      front.style.transform = `translate3d(${Math.round(curX)}px, 0, 0)`;
      if (circle && curX > 0) {
        const sc = Math.min(1.16, Math.max(0.65, curX / 62));
        circle.style.transform = `scale(${sc.toFixed(2)})`;
      }
    };

    const endGesture = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      // スワイプ直後の誤クリック発火を1回だけ吸収
      const eatClick = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      row.addEventListener("click", eatClick, { capture: true, once: true });
      setTimeout(() => row.removeEventListener("click", eatClick, { capture: true }), 260);

      front.style.transition = "";
      if (circle) circle.style.transform = "";
      row.classList.remove("is-dragging-left", "is-dragging-right", "is-armed");
      markSwipeGuideSeen();

      const openW = getOpenWidth();
      if (curX >= 62) {
        row.classList.remove("is-swiped-left");
        front.style.transform = "";
        bg.setAttribute("aria-hidden", "true");
        if (isPantry) {
          activePantrySwipe = null;
          const pName = row.dataset.pantryName;
          if (pName) handleDailyAction("life-pantry-to-shop", { name: pName });
        } else {
          activeSwipeId = null;
          const chk = row.querySelector('input[type="checkbox"]');
          if (chk) {
            chk.checked = !chk.checked;
            chk.dispatchEvent(new Event("change"));
          }
        }
      } else if (curX <= -Math.min(50, openW * 0.35)) {
        row.classList.add("is-swiped-left");
        front.style.transform = "";
        bg.setAttribute("aria-hidden", "false");
        if (optBtn) { optBtn.textContent = "›"; optBtn.setAttribute("aria-expanded", "true"); }
        if (isPantry) activePantrySwipe = row.dataset.pantryRow || null;
        else activeSwipeId = row.dataset.itemId || null;
      } else {
        row.classList.remove("is-swiped-left");
        front.style.transform = "";
        bg.setAttribute("aria-hidden", "true");
        if (optBtn) { optBtn.textContent = "⋯"; optBtn.setAttribute("aria-expanded", "false"); }
        if (isPantry && activePantrySwipe === row.dataset.pantryRow) activePantrySwipe = null;
        if (!isPantry && activeSwipeId === row.dataset.itemId) activeSwipeId = null;
      }
    };

    row.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startGesture(e.touches[0].clientX, e.touches[0].clientY, e.target);
    }, { passive: true });
    row.addEventListener("touchmove", (e) => {
      if (e.touches.length !== 1) return;
      moveGesture(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });
    row.addEventListener("touchend", endGesture, { passive: true });
    row.addEventListener("touchcancel", endGesture, { passive: true });

    // PCマウスでのドラッグにも対応
    row.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (!startGesture(e.clientX, e.clientY, e.target)) return;
      const onMove = (ev) => moveGesture(ev.clientX, ev.clientY, ev);
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        endGesture();
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });

  // 常備品画面の検索・追加・周期変更
  document.querySelector("#pantry-search-input")?.addEventListener("input", (e) => {
    pantrySearchQuery = e.target.value;
    render();
    const inp = document.querySelector("#pantry-search-input");
    if (inp) { inp.focus(); inp.selectionStart = inp.selectionEnd = inp.value.length; }
  });
  document.querySelector("#pantry-name")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) document.querySelector('[data-action="life-pantry-add"]')?.click();
  });
  document.querySelectorAll("[data-pantry-cycle]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      setPantryCycle(e.target.dataset.pantryCycle, e.target.value);
    });
  });
}
function handleDailyAction(action, data) {
  const oldView = state.view;
  if (!action.startsWith("life-")) return false;
  if (handleHouseholdAction(action, data)) return true;
  if (handleSkillQuizAction(action, data)) return true;
  if (handlePlanMoveAction(action, data)) return true;
  if (handleFolderAction(action, data)) return true;
  if (handleInstallAction(action)) return true;
  if (handlePushAction(action)) return true;
  if (handleWeeklyAction(action, data)) return true;
  if (handleFeedbackAction(action, data)) return true;
  if (handlePlusAction(action, data)) return true;
  if (handlePaywallAction(action, data)) return true;
  if (handleTalkAction(action, data)) return true;
  if (["life-ratio", "life-staple", "life-chain", "life-priority", "life-photo-retry", "life-type-share"].includes(action)) { if (handleCookTypeAction(action, data)) return true; saveState({ scheduleSync: false }); render(); return true; }
  if (viewerBlocked(action)) return true;
  const before = dailyShopping();
  if (action === "life-review-saved") {
    reviewReturnDate = data.date;
    handleAction({currentTarget:{dataset:{action:"edit-recipe",recipe:data.recipe}}});
    return true;
  }
  if (action === "life-planning-suggest") {
    captureDraft();
    const previous=state.draft.planning;
    state.draft.planning={...Lifestyle.suggestPlanning({ingredients:state.extractedIngredients,steps:state.extractedSteps}),minutes:previous?.minutes || null};
  }
  if (action === "life-detailed") profileDraft().detailedSetup = true;
  if (action === "life-quick") {profileDraft().quickSetupIndex=0;profileDraft().period=3;profileEditing=true;}
  if (action === "life-quick-next") {
    // The rhythm step starts on the recommended weekday rhythm if nothing was picked.
    if (FUNNEL[profileDraft().quickSetupIndex] === 1 && !rhythmOn()) {
      state.rhythm = { preset: "weekday", shopTime: document.querySelector("#rhythm-time")?.value || "17:00", updatedAt: nowIso() };
      startRhythm();
    }
    profileDraft().quickSetupIndex = Math.min(QUICK_STEPS - 1, profileDraft().quickSetupIndex + 1);
  }
  if (action === "life-skill-clear") { state.skillProfile = null; state.planOverrides = {}; showToast("腕前を使わない並べ方に戻しました。"); }
  if (action === "life-skill-open") { state.view = "settings"; saveState(); openSetting("skill"); return true; }
  if (action === "life-quick-skill") {
    setSkillLevel(data.level);
    if (state.onboarded) showToast(`腕前を★${data.level}にしました。難しい料理は後ろのほうに並べます。`);
    // スキルの画面が初回設定にある時だけ、次の画面へ（2026-10-28 から初回にはない）。
    if (FUNNEL.includes(2) && FUNNEL[profileDraft().quickSetupIndex] === 2) profileDraft().quickSetupIndex = FUNNEL.indexOf(2) + 1;
  }
  if (action === "life-funnel-pick") {
    const p = profileDraft();
    if (["goal", "pain", "savedVideos"].includes(data.field)) p[data.field] = data.value;
    p.quickSetupIndex = Math.min(QUICK_STEPS - 1, p.quickSetupIndex + 1);
  }
  if (action === "life-servings") {
    const p = profileDraft();
    p.servings = Math.max(1, Math.min(5, Number(data.count) || 1));
    p.quickSetupIndex = Math.min(QUICK_STEPS - 1, p.quickSetupIndex + 1);
  }
  if (action === "life-minutes") profileDraft().weekdayMinutes = Number(data.minutes) || 20;
  if (action === "life-chip-add") { addChip(data.field); return true; }
  if (action === "life-chip-remove") { const p = profileDraft(); p[data.field] = (p[data.field] || []).filter((x) => x !== data.name); }
  if (action === "life-eater") { const p = profileDraft(); const on = new Set(p.eaters || []); on.has(data.value) ? on.delete(data.value) : on.add(data.value); p.eaters = EATERS.map(([id]) => id).filter((id) => on.has(id)); }
  if (action === "life-remind-calendar") { downloadReminder(); profileDraft().remindAdded = true; trackDaily("funnel_reminder_added", { via: "ics" }); }
  if (action === "life-remind-google") { globalThis.open?.(googleCalendarUrl(), "_blank", "noopener"); profileDraft().remindAdded = true; trackDaily("funnel_reminder_added", { via: "google" }); }
  if (action === "life-url-insert") { insertFromUrl(data.date, document.querySelector("#swap-url")?.value || ""); return true; }
  if (action === "life-demo-read") { runFunnelDemo(document.querySelector("#demo-url")?.value.trim() || ""); return true; }
  if (action === "life-funnel-dish") {
    const p = profileDraft();
    const picks = new Set(p.picks || []);
    picks.has(data.recipe) ? picks.delete(data.recipe) : picks.add(data.recipe);
    p.picks = [...picks].slice(0, 12);
  }
  if (action === "life-start-when") profileDraft().startTonight = data.when === "tonight";
  if (action === "life-quick-back") { profileDraft().quickSetupIndex=Math.max(0,profileDraft().quickSetupIndex-1); }
  if (action === "life-preview" && !state.onboarded) {
    state.onboarded=true;state.planLength=3;state.view="plan";profileEditing=false;
  }
  if (action === "life-profile") {
    profileEditing = true;
    profileDraft();
    state.view = "today";
  }
  if (action === "life-add-side" && data.date && data.side) {
    if (isViewer()) return true;
    const plan = dailyPlan();
    const day = plan.find((d) => d.date === data.date);
    if (!state.mealSlots[data.date]?.recipe && day?.candidate?.recipe) {
      confirmDaily(day);
    }
    const slot = state.mealSlots[data.date];
    if (slot) {
      const before = dailyShopping();
      slot.side = data.side;
      slot.updatedAt = nowIso();
      changedShopping(before || []);
      saveState();
      render();
    }
    return true;
  }
  if (action === "life-remove-side" && data.date) {
    if (isViewer()) return true;
    const slot = state.mealSlots[data.date];
    if (slot && slot.side) {
      const before = dailyShopping();
      delete slot.side;
      slot.updatedAt = nowIso();
      changedShopping(before || []);
      saveState();
      render();
    }
    return true;
  }
  if (action === "life-widen") {
    const k = data.key, v = data.value;
    if (k === "weekdayMinutes") {
      const m = Math.max(5, Math.min(60, Number(v) || 20));
      state.foodProfile = Lifestyle.profile({ ...state.foodProfile, weekdayMinutes: m });
      if (state.householdProfile && Object.hasOwn(state.householdProfile, "weekdayMinutes")) state.householdProfile.weekdayMinutes = m;
      if (state.onboardingDraft) state.onboardingDraft.weekdayMinutes = m;
      showToast(`平日の調理時間を${m}分以内に広げました。`);
    } else if (k === "weekendMinutes") {
      const m = [10, 20, 30, 60].includes(Number(v)) ? Number(v) : 30;
      state.foodProfile = Lifestyle.profile({ ...state.foodProfile, weekendMinutes: m });
      if (state.householdProfile && Object.hasOwn(state.householdProfile, "weekendMinutes")) state.householdProfile.weekendMinutes = m;
      if (state.onboardingDraft) state.onboardingDraft.weekendMinutes = m;
      showToast(`休日の調理時間を${m}分以内に広げました。`);
    } else if (k === "skillLevel" && state.skillProfile) {
      const lvl = Math.max(1, Math.min(5, Number(v) || 1));
      state.skillProfile = { ...state.skillProfile, level: lvl, updatedAt: nowIso() };
      showToast(`料理レベルを★${lvl}まで広げました。`);
    } else if (k === "skill") {
      state.foodProfile = Lifestyle.profile({ ...state.foodProfile, skill: "any" });
      if (state.householdProfile && Object.hasOwn(state.householdProfile, "skill")) state.householdProfile.skill = "any";
      if (state.onboardingDraft) state.onboardingDraft.skill = "any";
      showToast("かんたん以外の料理も出すようにしました。");
    }
    // 条件変更でも、本人が選んだ日の料理は保持する。
    saveState();
    render();
    return true;
  }
  if (action === "life-equipment-group") equipmentGroupIndex = Math.max(0, Math.min(2, Number(data.group) || 0));
  if (action === "life-pantry-toggle") {
    const p = profileDraft();
    p.pantry[data.name] = p.pantry[data.name] === "have" ? "none" : "have";
    if (state.foodProfile?.completed) setPantry(data.name, p.pantry[data.name]);
  }
  if (action === "life-equipment-toggle") {
    const p = profileDraft();
    if (Object.hasOwn(p.equipment, data.name)) p.equipment[data.name] = p.equipment[data.name] === "have" ? "none" : "have";
  }
  if (action === "life-section")
    profileDraft().step = Math.max(0, Math.min(15, Number(data.step) || 0));
  if (action === "life-review") profileDraft().step = 15;
  if (action === "life-next" || action === "life-back") {
    const p = profileDraft();
    if (action === "life-next")
      trackDaily("profile_step_completed", { step: p.step });
    // 写真12枚で選んだまま「次へ」：決定を押した時と同じに保存する。
    if (p.step === 4 && action === "life-next" && dishPickDraft?.length) saveDishPicks(dishPickDraft);
    if (p.step === 4) dishPickDraft = null;
    if (p.step === 4 && p.tasteReturnStep !== null) {
      p.step = p.tasteReturnStep;
      p.tasteReturnStep = null;
    } else p.step = Math.max(
      0,
      Math.min(15, p.step + (action === "life-next" ? 1 : -1)),
    );
  }
  if (action === "life-pause") {
    profileEditing = false;
    state.view = "settings";
  }
  if (action === "life-custom") {
    const name = document
      .querySelector("#custom-owned")
      ?.value.trim()
      .slice(0, 100);
    if (name) { profileDraft()[data.field][name] = "have"; if (data.field === "equipment") equipmentGroupIndex = 2; }
  }
  if (action === "life-finish") {
    state.planDrafts = {};
    // 最初の提案の画面を出すのは、初めての初回設定を終えた時だけ（詳しい設定の保存・かんたん設定のやり直しでは出さない）。
    const firstRun = !state.onboarded && profileDraft().quickSetupIndex !== null;
    // 初めての初回設定：選んだ「今夜から／明日から」で最初の回を作り直す（2026-10-28）。
    if (firstRun && rhythmOn() && !Object.values(state.mealSlots || {}).some((x) => x.date >= today() && ["confirmed", "cooked"].includes(x.status))) startRhythm(new Date(), { tonight: startTonight(profileDraft()) });
    const chosen = [...finishFunnelPicks(), ...(funnelDemo.result ? [funnelDemo.result] : [])];
    trackDaily("profile_completed");
    const p = Lifestyle.profile(profileDraft());
    p.completed = p.quickSetupIndex === null || p.completed;
    p.quickSetupIndex = null;
    p.completedAt = nowIso();
    p.useUpUntil = addDays(today(), 6);
    p.step = 15;
    state.foodProfile = p;
    state.householdProfile = {
      equipment: p.equipment,
      pantry: p.pantry,
      updatedAt: nowIso(),
    };
    state.servingCount = p.servings;
    state.planLength = p.period;
    state.onboardingDraft = null;
    state.onboarded = true;
    profileEditing = false;
    state.view = "plan";
    firstPlanReveal = true;
    // 「選んだ料理は最初の献立に入れます」：選んだ料理と、AIで読み取った料理を、最初の日から入れる（条件に合う日だけ）。
    const open = dailyPlan().filter((d) => !d.off && !d.prestart && !state.mealSlots?.[d.date]);
    const prof = dailyProfile();
    for (const recipe of chosen) {
      const day = open.find((d) => !state.planOverrides[d.date] && Lifestyle.fit(recipe, prof, d.date).ok);
      if (day) state.planOverrides[day.date] = recipe.id;
    }
    state.trialFrom = state.trialFrom || today();
    // 方針を保存した人は、最初の具体的な料理と、その理由から（わが家のごはん方針の提案の画面）。
    // 途中の会話があれば、それを上書きしない（続きから開けるように残す）。
    if (firstRun && !state.tasteProfile?.session && state.tasteProfile?.snapshots?.some((x) => x.member === talkWho())) {
      state.tasteProfile.session = { member: talkWho(), stage: "suggest", confirmId: "", q: "", startedAt: nowIso(), updatedAt: nowIso() };
      state.view = "talk";
    }
    if (paywallPreview()) openPaywall();
    touchSettings();
  }
  if (action === "life-length")
    state.planLength = Number(data.length) === 7 ? 7 : 3;
  if (action === "life-confirm") {
    const allBlocks = rhythmOn() ? planPageBlocks() : currentBlocks();
    const only = data.block ? (allBlocks.find((b) => b.key === data.block) || currentBlocks().find((b) => b.key === data.block))?.dates || [] : null;
    if (data.block) {
      planPage = data.block;
      shopPage = data.block;
      shopCombineNext = false;
    }
    trackDaily("plan_confirmed", {
      days: dailyPlan().filter((d) => d.candidate).length,
    });
    const plan = dailyPlan(), locks = lockedDates(plan);
    const targets = plan.filter((d) => d.candidate && !locks.has(d.date) && (!only || only.includes(d.date)));
    const hadConfirmed = targets.some((d) => state.mealSlots?.[d.date]?.status === "confirmed");
    targets.forEach((d) => confirmDaily(d));
    if (hadConfirmed) changedShopping(before);
    else shoppingNotice = "";
    state.view = "shopping";
  }
  // 献立が始まる前の日の「今夜のおすすめ」を決める（§68）。その日だけの一品で、リズムの始まりは動かさない。
  if (action === "life-tonight-pick" && !isViewer() && prestartUntil() && !state.mealSlots?.[today()]) {
    const r = allDinnerRecipes().find((x) => x.id === data.recipe);
    if (r && Lifestyle.fit(r, dailyProfile(), today()).ok) { confirmDaily({ date: today() }, r); delete state.planOverrides[today()]; }
  }
  if (action === "life-confirm-one") {
    const plan = dailyPlan(), d = plan.find((d) => d.date === data.date);
    const hadConfirmed = state.mealSlots?.[data.date]?.status === "confirmed";
    if (d?.candidate && !lockedDates(plan).has(d.date)) confirmDaily(d);
    if (hadConfirmed) changedShopping(before);
  }
  if (action === "life-refresh") {
    const slot = state.mealSlots[data.date];
    const r = slot && latestSlotRecipe(slot);
    if (r) {
      confirmDaily({ date: data.date }, r);
      changedShopping(before || []);
    }
  }
  if (action === "life-off") {
    state.mealSlots[data.date] = {
      date: data.date,
      status: "off",
      updatedAt: nowIso(),
    };
    changedShopping(before);
  }
  if (action === "life-reopen") {
    state.mealSlots[data.date] = {
      date: data.date,
      status: "removed",
      updatedAt: nowIso(),
    };
    state.view = "plan";
  }
  if (action === "life-plan-page" && data.page) {
    if (isTrayDraftActive() && data.page !== planPage) { showToast("選び直しの途中です。先に決定するか「元に戻す」を押してね"); return true; }
    planPage = data.page; render(); placePlanPages({ smooth: true }); return true; }
  if (action === "life-swap") {
    const b = rhythmOn() && planPageBlocks().find((x) => x.dates.includes(data.date));
    if (b) planPage = b.key;
    swapMood = "";
    swapPick = "";
    swapRemoved = [];
    swapIgnore = [];
    swapLastAct = "";
    swapDetailId = "";
    swapFocusAt = -1;
    swapFocusWhat = null;
    swapBought = "";
    swapDate = data.date;
    state.view = "plan";
    trackDaily("swap_opened");
  }
  if (action === "life-close-swap") { if (swapDate && !swapPick) trackDaily("swap_closed"); swapCommit(); swapDate = ""; }
  if (handleCardTrayAction(action, data, before)) {
    saveState();
    render();
    return true;
  }
  if (action === "life-pass-ask" && SWAP_FEATURE_LABEL[data.key] && ["less", "keep"].includes(data.answer) && !isViewer()) {
    const memo = state.passMemo = normalizePassMemo(state.passMemo);
    memo.asked[data.key] = { answer: data.answer, at: nowIso() };
    trackDaily("pass_asked", { answer: data.answer });
    showToast(data.answer === "less" ? `${SWAP_FEATURE_LABEL[data.key]}を少なめにします（設定の「おすすめレシピ」で戻せます）` : "このままにします");
  }
  if (action === "life-pass-unless" && !isViewer()) {
    const memo = state.passMemo = normalizePassMemo(state.passMemo);
    for (const [k, a] of Object.entries(memo.asked)) if (a.answer === "less") memo.asked[k] = { answer: "keep", at: nowIso() };
    showToast("少なめにしていた料理を、元に戻しました");
  }
  // 今夜の4皿（APP_MAP §64）：気分の札・🔀 ほかの4皿・写真を押して✓。好みとして学ぶのは「選んだ・作った・評価した」だけ
  // （見送った料理は下げない。Codex の案）。
  if (action === "life-swap-bought" && swapDate && ["use", "skip"].includes(data.use)) { swapBought = data.use; swapPick = ""; swapLastAct = ""; trackDaily("swap_bought", { use: data.use }); }
  // 気分の札を変えても、消した料理の手がかりはそのまま（その場の消去法は続く）。
  if (action === "life-swap-mood" && swapDate) { swapMood = swapMood === data.mood ? "" : String(data.mood || ""); swapPick = ""; swapLastAct = swapMood ? "mood" : ""; trackDaily("swap_mood", { mood: swapMood }); }
  // 写真・料理名 → レシピ（その中で「この料理にする／4皿に戻る」。2026-11-08 のユーザーの判断）。
  if (action === "life-swap-detail" && swapDate && data.recipe) { recipeDetailId = String(data.recipe); swapDetailId = recipeDetailId; state.view = "recipe"; trackDaily("swap_detail"); }
  if (action === "life-swap-back") { swapDetailId = ""; state.view = "plan"; }
  // 消去法（§64-2）：✕ で1皿消す → その枠に、消した料理と似ていない料理が入る。消した特徴はその場だけ（好みとしては残さない）。
  if (action === "life-swap-remove" && swapDate && data.recipe && !isViewer()) {
    if (!swapRemoved.some((e) => swapEntry(e).id === data.recipe)) swapRemoved = [...swapRemoved, { id: String(data.recipe), bulk: false }];
    if (swapPick === data.recipe) swapPick = "";
    swapLastAct = "pass";
    trackDaily("swap_removed");
  }
  if (action === "life-swap-remove-all" && swapDate && !isViewer()) {
    const now = swapCurrentIds();
    // 「🔄 別の4皿」：その4皿は出さないが、特徴は学ばない（Codex・Gemini の案）。
    swapRemoved = [...swapRemoved, ...now.filter((id) => !swapRemoved.some((e) => swapEntry(e).id === id)).map((id) => ({ id, bulk: true }))];
    swapPick = "";
    swapLastAct = "bulk";
    trackDaily("swap_more");
  }
  if (action === "life-swap-undo" && swapDate) { swapRemoved = swapRemoved.slice(0, -1); swapLastAct = "undo"; trackDaily("swap_undo"); }
  if (action === "life-swap-unlearn" && swapDate && SWAP_FEATURE_LABEL[data.key]) { swapIgnore = [...new Set([...swapIgnore, data.key])]; swapLastAct = "unlearn"; }
  if (action === "life-save-guide" || action === "life-save-guide-x") {
    try { localStorage.setItem("ripigochi-save-guide", "seen"); } catch {}
    saveGuideMemo = true;
    if (action === "life-save-guide") { state.view = "register"; state.editingRecipeId = null; entryMethod = "url"; }
  }
  if (action === "life-starter-more") starterShown += 40;
  if (action === "life-quick-filter") quickFilter = quickFilter === data.value ? "" : data.value || "";
  if (action === "life-facets-toggle") facetsOpen = !facetsOpen;
  // 同じ親の作り方を並べて見る（料理名で探す）。
  if (action === "life-dish-variants" && data.dish) { state.searchText = String(data.dish).slice(0, 20); recipeTab = "starter"; folderOpen = ""; state.view = "collection"; }
  // 食べ比べ：空いている日に、同じ親の別の作り方を入れる（自分で選んだ日として。入れ替えで戻せる）。
  if (action === "life-dish-compare" && data.parent && !isViewer()) {
    const n = dishCompare(data.parent);
    if (n) { trackDaily("dish_compare"); changedShopping(before); state.view = "plan"; }
    showToast(n ? `「${String(data.dish || "").slice(0, 20)}」の食べ比べ：${n}日分を献立に入れました（入れ替えで戻せます）` : "空いている日がないか、条件に合う作り方がありません。");
  }
  if ((action === "life-dish-hide" || action === "life-dish-unhide") && data.parent && !isViewer()) {
    const pref = normalizeStarterPref(state.starterPref), set = new Set(pref.hiddenDishes);
    if (action === "life-dish-hide") set.add(data.parent); else set.delete(data.parent);
    state.starterPref = { ...pref, hiddenDishes: [...set], updatedAt: nowIso() };
    showToast(action === "life-dish-hide" ? `「${String(data.dish || "").slice(0, 20)}」は、おすすめと自動の献立に出しません（設定で戻せます）` : "出すように戻しました。");
  }
  if (action === "life-facet" && data.facet in recipeFacets) recipeFacets[data.facet] = recipeFacets[data.facet] === data.value ? "" : data.value;
  if (action === "life-facet-clear") recipeFacets = { home: "", staple: "", main: "", style: "", author: "" };
  if (action === "life-refl-view") { reflView = data.view === "grid" || data.view === "book" ? data.view : "cal"; try { localStorage.setItem("ripigochi-refl-view", reflView); } catch {} }
  if (action === "life-month") reflMonth = Math.min(0, reflMonth + (Number(data.delta) || 0));
  if (action === "life-recipe-tab") { recipeTab = ["saved", "starter", "folders"].includes(data.tab) ? data.tab : "starter"; folderOpen = ""; quickFilter = ""; starterShown = 40; if (data.tab !== "folders") state.searchText = ""; }
  if (action === "life-creator") { recipeFacets = { home: "", staple: "", main: "", style: "", author: data.name || "" }; recipeTab = "saved"; }
  if (action === "life-creator-edit") { creatorEditing = data.key || ""; globalThis.setTimeout?.(() => document.querySelector("#creator-alias")?.select?.(), 30); }
  if (action === "life-creator-save" && data.key) {
    const alias = data.reset === "true" ? "" : (document.querySelector("#creator-alias")?.value || "").trim().slice(0, 16);
    state.creatorNames = { ...(state.creatorNames || {}), [data.key]: { alias, updatedAt: nowIso() } };
    creatorEditing = "";
  }
  if (action === "life-save-starter") {
    const r = (linkedRecipe?.id === data.recipe ? linkedRecipe : null) || findDiscover(data.recipe) || Lifestyle.curated.find((x) => x.id === data.recipe);
    if (r) {
      const own = saveOwnRecipe(r);
      if (state.view === "recipe") recipeDetailId = own.id;
      showToast(`「${r.title}」をレシピに保存しました。`);
    }
  }
  if (action === "life-place-open") placeRecipeId = data.recipe || "";
  if (action === "life-place-close") placeRecipeId = "";
  if (action === "life-place") { placeFromRecipe(data.recipe, data.date); placeRecipeId = ""; }
  if (action === "life-choose") {
    trackDaily("plan_swapped", swapDate ? { removed: swapRemoved.length, mood: swapMood } : {});
    swapCommit();
    // レシピから決めた時は、献立の画面へ戻る。
    if (swapDetailId) { swapDetailId = ""; state.view = "plan"; }
    swapPick = "";
    const r = allDinnerRecipes().find((r) => r.id === data.recipe);
    if (r && Lifestyle.fit(r, dailyProfile(), data.date).ok) {
      if (state.mealSlots[data.date]?.status === "confirmed")
        confirmDaily({ date: data.date }, r);
      else state.planOverrides[data.date] = r.id;
      changedShopping(before || []);
    }
    swapDate = "";
  }
  // 残っている食材（本人が選ぶ）と、それを使った組み直し。確定・作った・お休みの日は置き換えない。
  if (action === "life-leftover" && data.name) setLeftover(data.name, !activeLeftovers().includes(data.name));
  if (action === "life-leftover-add") {
    const el = document.querySelector("#leftover-name");
    const name = (el?.value || "").trim();
    if (name) { setLeftover(name, true); leftoverOpen = true; }
  }
  if (action === "life-leftover-rebuild") {
    state.planDrafts = {};
    const dates = undecidedPlanDates();
    dates.forEach((d) => { delete state.planOverrides[d]; });
    changedShopping(before);
    showToast(`残っている食材を使うように、${dates.length}日を組み直しました。決めた献立はそのままです。`);
  }
  if (action === "life-shopdiff-close") shoppingNotice = "";
  if (action === "life-shopdiff-leftover" && shoppingNotice?.bought?.length) {
    shoppingNotice.bought.forEach((n) => setLeftover(n, true));
    showToast(`${shoppingNotice.bought.join("・")}を、残っている食材に入れました。献立タブで組み直せます。`);
    shoppingNotice = { ...shoppingNotice, bought: [] };
  }
  if (action === "life-cook") {
    trackDaily("cooking_opened");
    cookingDate = data.date;
    state.view = "cooking";
  }
  if (action === "life-analyze") { analyzeCookingRecipe(data.date); return true; }
  if (action === "life-share-cooked") { shareCooked(data.id); return true; }
  if (action === "life-video-at") { if (playVideoAt(Number(data.seconds) || 0)) return true; videoStartAt = { key: data.recipe, seconds: Number(data.seconds) || 0 }; }
  if (action === "life-video-close") { closeVideoDock(); return true; }
  if (action.startsWith("life-time-") && handleTimeFixAction(action, data)) return true;
  if (action === "life-reread") { withDailyLimit(() => rereadRecipe(data.recipe)); return true; }
  if (action === "life-servings-set") {
    if (isViewer()) return true;
    const n = Number(data.count);
    if (setRecipeServings(data.recipe, n, { date: data.date || "" })) { saveState(); showToast(`元の人数を${n}人分にしました`); }
    render(); return true;
  }
  // 決めた献立の材料が変わる時は、買い物の差分（＋増えた品／🧺 買ってある品）も出す（Gemini review #215）。
  if (action === "life-source-apply") { const before = dailyShopping(); if (applySourcePending(data.recipe, data.date || "")) { showToast("新しい作り方にしました"); changedShopping(before); render(); } return true; }
  if (action === "life-source-keep") { if (keepSourceAsIs(data.recipe, data.date || "")) { showToast("いまの作り方のままにしました"); render(); } return true; }
  if (action === "life-source-reload") {
    if (sourceReloading) return true;
    sourceReloading = true; render();
    const before = dailyShopping();
    // 画面の言葉は「サーバー」「通信」を使わない（UI_RULES §1-2。Gemini review #215）。
    reloadLatest({ recipeId: data.recipe || "", date: data.date || "" }).then((res) => {
      showToast({ updated: "📝 最新の作り方にしました", same: "いまの作り方が最新です", none: "この動画の新しい作り方は、まだありません", error: "つながりませんでした。少し待ってからもう一度押してください", cooking: "料理モードの間は入れ替えません。閉じてから、もう一度押してください" }[res] || "");
      if (res === "updated") changedShopping(before);
    }).finally(() => { sourceReloading = false; render(); });
    return true;
  }
  if (action === "life-fill-video") { withDailyLimit(() => fillRecipeFromVideo(data.recipe)); return true; }
  if (action === "life-cooked") {
    trackDaily("meal_cooked");
    const slot = state.mealSlots[cookingDate];
    if (slot?.status === "confirmed" && canRecordDate(cookingDate))
      dailyRecord(slot);
    state.view = "today";
  }
  if (action === "life-record-past") {
    dailyRecord(state.mealSlots[data.date]);
    state.view = "today";
  }
  if (action === "life-frequency-close") preferencePromptId = "";
  if (action === "life-review-who") reviewWho = data.member || "";
  if (action === "life-review-later") { reviewLater = true; showToast("献立を決める時に、また出します"); }
  if (action === "life-rate-ask") { askRating(); return true; }
  if (action === "life-rate") {
    const e = state.evaluations.find(e=>e.id===data.id);
    if (e && CYCLE_CHOICES.some(r=>r.cycle===data.cycle) && raterNames().includes(data.member)) {
      const wasStaple = cookHistory(e.recipeId).length >= 2 && Object.values(recipeRatings({ id: e.recipeId })).some((c) => c === "weekly" || c === "tomorrow");
      if (!state.family.includes(data.member)) state.family.push(data.member);
      e.familyRepeatCycles = {...e.familyRepeatCycles, [data.member]:data.cycle};
      e.updatedAt = nowIso();
      clearCardTrayCaches();
      trackDaily("meal_rated");
      const left = raterNames().filter((n) => !e.familyRepeatCycles[n]);
      const nowStaple = cookHistory(e.recipeId).length >= 2 && Object.values(recipeRatings({ id: e.recipeId })).some((c) => c === "weekly" || c === "tomorrow");
      const stapleMsg = !wasStaple && nowStaple ? `🏆「${e.recipeTitle}」がわが家の定番に入りました！` : "";
      if (left.length && stapleMsg) showToast(stapleMsg);
      if (!left.length && data.batch) { e.personalPreference = true; e.preferencePending = false; if (!reviewPending().length) showToast(stapleMsg || "🎉 評価しました。次の献立に反映します"); else if (stapleMsg) showToast(stapleMsg); }
      else if (!left.length) {
        e.personalPreference = true; e.preferencePending = false;
        preferencePromptId = "";
        showToast(stapleMsg || (bothLike({id:e.recipeId}) ? "ふたりとも好き！ちょうどいい頃に、また提案します。" : "記録しました。えらんだ頃に、また提案します。"));
      }
    }
  }
  if (action === "life-frequency") {
    const e = state.evaluations.find(e=>e.id===data.id);
    if (e?.preferencePending && e.id === preferencePromptId && repeatOptions.some(o=>o.id===data.cycle)) {
      e.familyRepeatCycles = {...e.familyRepeatCycles, [state.family[0]]:data.cycle};
      e.personalPreference = true; e.preferencePending = false; e.updatedAt = nowIso();
      clearCardTrayCaches();
      preferencePromptId = "";
    }
  }
  // 傷みやすい食材を「あとで買う」：今回の買い物からは外し（印 later）、「◯日の分」として買い足すものに入れる（買い物完了の後も残る）。
  // 操作名は「買い物完了にする？」の「あとで」（life-shop-later）と分ける。
  if (action === "life-item-later") {
    const item = shopPageItems().find((i) => i.id === data.id);
    const when = item && freshLater(item);
    if (when) {
      const prevMark = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      const id = generateId("manual-");
      state.shoppingMarks[item.id] = { status: "later", signature: item.signature, updatedAt: nowIso() };
      state.manualShopping[id] = { name: `${item.name}（${formatDate(when.date)}の分）`.slice(0, 100), amount: String(item.amount || "").slice(0, 80), updatedAt: nowIso() };
      // 元に戻す時は、印を消さずに新しい日時の印を書く（消すと、同期でサーバーに残っている later が戻ってくる）。
      shopUndo = { text: `🗓 ${item.name}は${formatDate(when.date)}の前に買う`, undo: () => { state.shoppingMarks[item.id] = prevMark ? { ...prevMark, updatedAt: nowIso() } : { status: "buy", signature: item.signature, updatedAt: nowIso() }; state.manualShopping[id] = { ...state.manualShopping[id], deleted: true, updatedAt: nowIso() }; } };
    }
  }
  if (action === "life-shopping-status" && ["buy","have"].includes(data.status)) {
    activeSwipeId = null;
    const item = shopPageItems().find((i) => i.id === data.id);
    if (item) {
      const prevMark = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      const pantry = dailyProfile().pantry || {};
      // 常備品の名前（「米」と「ごはん」のようなゆれも）
      const pantryName = Object.keys(pantry).find((n) => Lifestyle.key(n) === item.id || (Lifestyle.key(n) === "米" && item.id === "ごはん")) || item.name;
      const prevPantry = pantry[pantryName];
      state.shoppingMarks[item.id] = {status:data.status, signature:item.signature, updatedAt:nowIso()};
      const undo = () => { state.shoppingMarks[item.id] = prevMark ? { ...prevMark, updatedAt: nowIso() } : { status: data.status === "have" ? "buy" : "have", signature: item.signature, updatedAt: nowIso() }; if (prevPantry !== dailyProfile().pantry?.[pantryName]) setPantry(pantryName, prevPantry || "none"); };
      if (data.status === "have" && Lifestyle.keeps(item)) {
        // 調味料など：常備品として覚えて、次の献立でも「家にある」に。
        notePantryBought(pantryName);
        shopUndo = { text: `🧂 ${item.name}は常備品に（次も家にある）`, undo };
      } else if (data.status === "buy" && prevPantry === "have") {
        // 常備品を切らした：常備品からも外して、今回の買い物へ。
        setPantry(pantryName, "none");
        shopUndo = { text: `🛒 ${item.name}は切れた（常備品から外しました）`, undo };
      } else {
        shopUndo = { text: data.status === "have" ? `🏠 ${item.name}は今回は家にある` : `🛒 ${item.name}を買うものに`, undo };
      }
    }
  }
  if (action === "life-shop-page" && data.page) {
    shopPage = data.page;
    planPage = data.page;
    shopCombineNext = false;
    activeSwipeId = null;
    render();
    return true;
  }
  if (action === "life-shop-tab" && data.tab) {
    const sb = shopBlocks();
    const target = data.tab === "prev" ? sb?.prev : data.tab === "next" ? sb?.next : sb?.current;
    if (target) {
      shopPage = target.key;
      planPage = target.key;
    }
    shopCombineNext = false;
    activeSwipeId = null;
    render();
    return true;
  }
  if (action === "life-go-next-plan") {
    if (data.page) planPage = data.page;
    state.view = "plan";
    saveState({ scheduleSync: false });
    render();
    placePlanPages({ smooth: false });
    return true;
  }
  if (action === "life-shop-combine") {
    shopCombineNext = !shopCombineNext;
    activeSwipeId = null;
    render();
    return true;
  }
  if (action === "life-toggle-item-actions") {
    markSwipeGuideSeen();
    activeSwipeId = activeSwipeId === data.id ? null : data.id;
    render();
    return true;
  }
  if (action === "life-toggle-pantry-actions") {
    markSwipeGuideSeen();
    activePantrySwipe = activePantrySwipe === data.row ? null : data.row;
    render();
    return true;
  }
  if (action === "life-item-sub") {
    const item = shopPageItems().find((i) => i.id === data.id);
    if (item) {
      activeSwipeId = null;
      const prevMark = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      const hint = Lifestyle.substituteHint?.(item.name) || "";
      const subText = hint;
      state.shoppingMarks[item.id] = { status: "sub", subText, signature: item.signature, updatedAt: nowIso() };
      const restorePref = rememberItemPref(item.name, { action: "sub", subText, updatedAt: nowIso() });
      shopUndo = {
        text: `🔄 ${item.name}は代用${subText ? `（${subText}）` : ""}`,
        undo: () => {
          state.shoppingMarks[item.id] = prevMark ? { ...prevMark, updatedAt: nowIso() } : { status: "buy", signature: item.signature, updatedAt: nowIso() };
          restorePref();
        },
      };
      showToast(`🔄 ${item.name}は代用${subText ? `（${subText}）` : ""}にしました`);
    }
  }
  if (action === "life-item-skip") {
    const item = shopPageItems().find((i) => i.id === data.id);
    if (item) {
      activeSwipeId = null;
      const prevMark = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      state.shoppingMarks[item.id] = { status: "skip", signature: item.signature, updatedAt: nowIso() };
      const restorePref = rememberItemPref(item.name, { action: "skip", updatedAt: nowIso() });
      shopUndo = {
        text: `⏭ ${item.name}は今回は買わない（パス）`,
        undo: () => {
          state.shoppingMarks[item.id] = prevMark ? { ...prevMark, updatedAt: nowIso() } : { status: "buy", signature: item.signature, updatedAt: nowIso() };
          restorePref();
        },
      };
      showToast(`⏭ ${item.name}は今回は買わない（パス）にしました`);
    }
  }
  if (action === "life-apply-item-pref") {
    const item = shopPageItems().find((i) => i.id === data.id);
    const pref = item && state.itemPrefs?.[item.id];
    if (item && ["sub", "skip"].includes(pref?.action)) {
      const prevMark = state.shoppingMarks[item.id] ? { ...state.shoppingMarks[item.id] } : null;
      state.shoppingMarks[item.id] = { status: pref.action, subText: pref.subText || "", signature: item.signature, updatedAt: nowIso() };
      shopUndo = {
        text: pref.action === "sub" ? `🔄 ${item.name}は代用` : `⏭ ${item.name}はパス`,
        undo: () => {
          state.shoppingMarks[item.id] = prevMark ? { ...prevMark, updatedAt: nowIso() } : { status: "buy", signature: item.signature, updatedAt: nowIso() };
        },
      };
      showToast(pref.action === "sub" ? `🔄 ${item.name}を前回と同じ代用にしました` : `⏭ ${item.name}を前回と同じパスにしました`);
    }
  }
  if (action === "life-pantry-to-shop" && data.name) {
    activePantrySwipe = null;
    const name = data.name;
    const prevVal = dailyProfile().pantry?.[name];
    setPantry(name, "none");
    const id = generateId("manual-");
    state.manualShopping[id] = { name, amount: "1つ", updatedAt: nowIso() };
    shopUndo = {
      text: `🛒 ${name}を買い物リストへ`,
      undo: () => {
        if (prevVal) setPantry(name, prevVal);
        state.manualShopping[id] = { ...state.manualShopping[id], deleted: true, updatedAt: nowIso() };
      },
    };
    showToast(`🛒 ${name}を買い物リストに入れました`);
  }
  if (action === "life-pantry-cat" && data.cat) {
    pantryFilterCat = data.cat;
    activePantrySwipe = null;
    render();
    return true;
  }
  if (action === "life-again") {
    const e = state.evaluations.find((e) => e.id === `meal-${data.date}`);
    if (e) {
      e.preferencePending = false;
      e.personalPreference = true;
      e.familyRepeatCycles = {
        ...e.familyRepeatCycles,
        [state.family[0]]: "weekly",
      };
      e.updatedAt = nowIso();
      clearCardTrayCaches();
      showToast("また食べたい一品にしました。");
    }
  }
  if (action === "life-save-copy") {
    const r =
      state.mealSlots[cookingDate]?.recipe ||
      allDinnerRecipes().find((r) => r.id === data.recipe);
    if (r) {
      saveOwnRecipe(r);
      showToast("自分用に保存しました。レシピ画面から編集できます。");
    }
  }
  if (action === "life-replan" && data.recipe && !isViewer()) {
    const hit = replanRecipe(data.recipe);
    if (hit && !hit.already) trackDaily("meal_replanned");
    if (hit) { state.view = "plan"; showToast(`${formatDate(hit.date)}（${weekdayLabel(hit.date)}）の献立に${hit.already ? "もう入っています" : "入れました（まだ決定前の下書き）"}`); }
    else showToast("入れられる日がありません（まだ決めていない日がない・条件に合わない）。献立タブで入れ替えもできます");
  }
  if (action === "life-edit-record") {
    const e = state.evaluations.find((e) => e.id === data.id);
    if (e) openRecordEditor(e);
  }
  if (action === "life-new-record") {
    const r = allDinnerRecipes().find((x) => x.id === data.recipe) || recipeById(data.recipe);
    if (r) openRecordEditor({ id: generateId("e"), isNew: true, recipeId: r.id, recipeTitle: r.title, cookedAt: today(), mealType: "dinner", preferencePending: true, familyRepeatCycles: {}, memo: "", photo: "" });
  }
  if (action === "life-aisle-edit") aisleEdit = !aisleEdit;
  if (action === "life-shop-later") shopDoneLater = true;
  if (action === "life-pantry-open") { pantryReturn = state.view === "pantry" ? pantryReturn : state.view; state.view = "pantry"; }
  if (action === "life-pantry-back") state.view = pantryReturn || "shopping";
  if (action === "life-shop-undo") { shopUndo?.undo(); shopUndo = null; }
  if (action === "life-shop-undo-close") shopUndo = null;
  if (action === "life-shop-pantry-out" && data.name) {
    const name = data.name;
    setPantry(name, "none");
    shopUndo = { text: `🧂 ${name}を「切れた」に`, undo: () => setPantry(name, "have") };
  }
  if (action === "life-pantry-set") {
    const v = dailyProfile().pantry[data.name];
    if (v === "have") setPantry(data.name, "none");
    else notePantryBought(data.name);
  }
  if (action === "life-pantry-add") {
    const inp = document.querySelector("#pantry-name");
    const name = inp?.value.trim().slice(0, 99);
    if (name) {
      notePantryBought(name);
      if (inp) inp.value = "";
      showToast(`🧂 ${name}を常備品に追加しました`);
    }
  }
  if (action === "life-recipe-open") { recipeDetailId = data.recipe; swapDetailId = ""; state.view = "recipe"; }
  if (action === "life-recipe-back") state.view = "collection";
  if (action === "life-starters" && !isViewer()) {
    state.starterPref = { show: data.show === "true", asked: true, updatedAt: nowIso() };
    showToast(data.show === "true" ? "おすすめレシピを表示します。" : "おすすめを隠しました。自分のレシピだけで献立を作ります。");
  }
  if (action === "life-share-stats") { try { localStorage.setItem("ripigochi-share-stats", shareStatsOn() ? "off" : "on"); } catch {} }
  if (action === "life-starters-unhide" && !isViewer()) { state.starterPref = { ...normalizeStarterPref(state.starterPref), hidden: [], hiddenDishes: [], updatedAt: nowIso() }; showToast("非表示にしたおすすめを戻しました。"); }
  if (action === "life-starters-keep") state.starterPref = { ...normalizeStarterPref(state.starterPref), asked: true, updatedAt: nowIso() };
  // The first-plan welcome stays until the next real action on the plan.
  if (!["life-finish", "life-rhythm"].includes(action)) firstPlanReveal = false;
  if (action === "life-reveal-close") firstPlanReveal = false;
  if (action === "life-record-back") { recordDraft = null; state.view = "repeat"; }
  if (action === "life-record-cycle" && recordDraft && CYCLE_CHOICES.some((c) => c.cycle === data.cycle)) {
    recordDraft.memo = document.querySelector("#record-memo")?.value ?? recordDraft.memo;
    recordDraft.cookedAt = document.querySelector("#record-date")?.value || recordDraft.cookedAt;
    recordDraft.familyRepeatCycles[data.member] = data.cycle;
  }
  if (action === "life-record-photo-remove" && recordDraft) recordDraft.photo = "";
  if (action === "life-record-save" && recordDraft) {
    const date = document.querySelector("#record-date")?.value || recordDraft.cookedAt;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today()) { showToast("食べた日を確認してください。"); return true; }
    const { isNew, ...record } = recordDraft;
    Object.assign(record, { cookedAt: date, memo: (document.querySelector("#record-memo")?.value || "").slice(0, 400), updatedAt: nowIso() });
    raterNames().forEach((n) => { if (record.familyRepeatCycles[n] && !state.family.includes(n)) state.family.push(n); });
    if (Object.keys(record.familyRepeatCycles).length) { record.preferencePending = false; record.personalPreference = true; }
    if (isNew && !recipeById(record.recipeId)) record.recipeId = saveOwnRecipe(Lifestyle.curated.find((c) => c.id === record.recipeId) || recordRecipe(record)).id;
    state.evaluations = [record, ...state.evaluations.filter((e) => e.id !== record.id)];
    clearCardTrayCaches();
    if (isNew) completeRequests(recordRecipe(record));
    recordDraft = null;
    state.view = "repeat";
    showToast("記録を保存しました。");
  }
  if (action === "life-record-delete" && recordDraft) {
    if (!window.confirm("この記録を削除します。よろしいですか？")) return true;
    const id = recordDraft.id;
    state.tombstones.evaluations[id] = nowIso();
    const date = id.startsWith("meal-") ? id.slice(5) : "";
    if (state.mealSlots[date]?.status === "cooked") state.mealSlots[date] = { ...state.mealSlots[date], status: "confirmed", updatedAt: nowIso() };
    state.evaluations = state.evaluations.filter((e) => e.id !== id);
    clearCardTrayCaches();
    recordDraft = null;
    state.view = "repeat";
    showToast("記録を削除しました。");
  }
  if (action === "life-add-item") {
    const name = document
      .querySelector("#manual-name")
      ?.value.trim()
      .slice(0, 100);
    if (name) {
      const id = generateId("manual-");
      state.manualShopping[id] = {
        name,
        amount: (document.querySelector("#manual-amount")?.value || "").trim().slice(0, 80),
        updatedAt: nowIso(),
      };
      const sb = shopBlocks();
      const active = activeShopBlock();
      if (sb && active && sb.current?.key === active.key && state.shopDone?.[active.key] && sb.next && blockStatus(sb.next) === "decided") {
        shopPage = sb.next.key;
      }
    }
  }
  if (action === "life-remove-item") {
    activeSwipeId = null;
    const prev = state.manualShopping[data.id];
    if (prev) {
      state.manualShopping[data.id] = {
        ...prev,
        deleted: true,
        updatedAt: nowIso(),
      };
      shopUndo = {
        text: `🗑 ${prev.name}を削除`,
        undo: () => {
          state.manualShopping[data.id] = { ...prev, deleted: false, updatedAt: nowIso() };
        },
      };
    }
  }
  saveState({
    scheduleSync: ![
      "life-next",
      "life-quick",
      "life-quick-next",
      "life-quick-back",
      "life-back",
      "life-custom",
      "life-equipment-group",
      "life-equipment-toggle",
      "life-pantry-toggle",
      "life-profile",
      "life-pause",
      "life-section",
      "life-review",
    ].includes(action),
  });
  render();
  if (action === "life-add-item") document.querySelector("#manual-name")?.focus();
  if (action === "life-pantry-toggle") [...document.querySelectorAll('[data-action="life-pantry-toggle"]')].find(el => el.dataset.name === data.name)?.focus({preventScroll:true});
  if (action === "life-equipment-toggle") [...document.querySelectorAll('[data-action="life-equipment-toggle"]')].find(el => el.dataset.name === data.name)?.focus({preventScroll:true});
  if (action === "life-equipment-group") document.querySelector(`[data-action="life-equipment-group"][data-group="${equipmentGroupIndex}"]`)?.focus({preventScroll:true});
  if (oldView !== state.view)
    globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  if (action === "life-swap")
    document.querySelector(".swap-panel")?.focus?.({ preventScroll: true });
  else if (
    [
      "life-next",
      "life-quick",
      "life-quick-next",
      "life-quick-back",
      "life-back",
      "life-finish",
      "life-cook",
      "life-section",
      "life-review",
    ].includes(action)
  ) {
    globalThis.scrollTo?.(0, 0);
    document.querySelector(".profile-wizard h2")?.focus();
  }
  return true;
}

function planningSummaryText(p) {
  const list = (values, empty) => (values || []).length ? values.join("・") : empty;
  return { equipment: p.noEquipment ? "特別な器具なし" : list(p.equipment, "未確認"), contains: list(p.contains, "該当なし"), tasks: list(p.tasks, "なし") };
}
function renderPlanningFields() {
  // 見るだけの家族は条件を決めない。保存するとリクエストになり、決める人が条件を確かめる。
  if (isViewer()) return '<p class="muted small viewer-save-note">保存すると、🙋 食べたいリクエストとして届きます。献立に入れる条件は、決める人が確かめます。</p>';
  if (!state.draft.planning) state.draft.planning = Lifestyle.suggestPlanning({ingredients:state.extractedIngredients, steps:state.extractedSteps});
  const p = state.draft.planning;
  const chips = (values,field) => `<div class="planning-chips">${values.map(v=>`<label class="planning-chip"><input type="checkbox" data-planning-field="${field}" value="${escapeAttr(v)}" ${(p[field]||[]).includes(v)?"checked":""}><span>${escapeHtml(v)}</span></label>`).join("")}</div>`;
  const summary = planningSummaryText(p);
  const restricted = dailyProfile().restrictions;
  const ai = !!p.aiJudged;
  // AIが判定した時は確認なしで保存できる。食べられないものがある家庭だけ、含む食材を1回確かめる。
  const confirm = ai
    ? (restricted.length ? `<label class="profile-choice planning-confirm"><input id="planning-verified" type="checkbox" ${p.ingredientsVerified ? "checked" : ""}>食べられないもの（${escapeHtml(restricted.join("・"))}）が入っていないか、材料と市販品の表示を確認した</label>` : "")
    : `<label class="profile-choice planning-confirm"><input id="planning-verified" type="checkbox" ${p.ingredientsVerified && p.conditionsConfirmed?"checked":""}>材料・市販品の表示と、上の条件を確認した</label>
  <p class="muted small">わからなければチェックなしで保存OK ${tip("未確認のレシピは自動の献立に使わず、入れ替える時に確認します")}</p>`;
  return `<section id="planning-panel" class="planning-panel ${ai ? "is-ai" : ""}">${ai ? '<input id="planning-ai" type="hidden" value="1">' : ""}<h3>${ai ? "🤖 献立に使う条件" : "🍳 献立に使う条件"}</h3><p class="muted small">${ai ? "AIが判定" : "材料と手順から判定"}・違う所だけ直す</p>
  <div class="planning-row"><span>時間</span><div class="planning-options">${[10,15,20,30,45,60].map(n=>`<button type="button" class="choice-button" data-planning-minute="${n}" aria-pressed="${p.minutes===n}">${n}分</button>`).join("")}</div></div>
  <div class="planning-row"><span>手間</span><div class="planning-options"><input id="planning-easy" type="hidden" value="${p.easy===true?"true":p.easy===false?"false":""}"><button type="button" class="choice-button" data-planning-easy="true" aria-pressed="${p.easy===true}">😊 かんたん</button><button type="button" class="choice-button" data-planning-easy="false" aria-pressed="${p.easy===false}">🍳 手間をかける</button></div></div>
  <dl class="planning-summary"><div><dt>器具</dt><dd data-planning-summary="equipment">${escapeHtml(summary.equipment)}</dd></div><div><dt>含む食材</dt><dd data-planning-summary="contains">${escapeHtml(summary.contains)}</dd></div><div><dt>作業</dt><dd data-planning-summary="tasks">${escapeHtml(summary.tasks)}</dd></div></dl>
  <details class="planning-edit"><summary>器具・食材・作業を直す</summary>${p.equipment?.length || p.noEquipment ? "" : '<p class="notice small">使う器具を選んでください（なければ「特別な器具は使わない」）。</p>'}
  <label class="field">時間を直接入力（分）<input id="planning-minutes" class="input" type="number" inputmode="numeric" min="1" max="300" value="${escapeAttr(p.minutes||"")}"></label>
  <h4>使う器具</h4>${chips([...new Set([...Lifestyle.equipment, ...(p.equipment||[])])],"equipment")}<label class="profile-choice"><input id="planning-no-equipment" type="checkbox" ${p.noEquipment?"checked":""}>特別な器具は使わない</label>
  <h4>含む・市販品によって含む食材</h4>${chips(Lifestyle.restrictionOptions,"contains")}
  <h4>必要な作業</h4>${chips(["肉を切る","揚げる","長く煮込む"],"tasks")}
  <h4>味の分類</h4>${chips(["和風","洋風","中華風"],"tastes")}
  ${dailyButton("life-planning-suggest","材料・手順から読み取り直す")}</details>
  ${confirm}</section>`;
}
function capturePlanningFields() {
  const minutes = document.querySelector("#planning-minutes");
  if (!minutes) return;
  const selected = field => [...document.querySelectorAll(`[data-planning-field="${field}"]:checked`)].map(el=>el.value);
  const easy = document.querySelector("#planning-easy")?.value;
  state.draft.planning = {
    minutes: Number(minutes.value)>0 && Number(minutes.value)<=300 ? Number(minutes.value):null,
    equipment:selected("equipment"), noEquipment:!!document.querySelector("#planning-no-equipment")?.checked,
    tasks:selected("tasks"), tastes:selected("tastes"), contains:selected("contains"),
    easy:easy==="true" ? true : easy==="false" ? false : null,
    ingredientsVerified:!!document.querySelector("#planning-verified")?.checked,
    conditionsConfirmed:!!document.querySelector("#planning-verified")?.checked,
  };
  // AI判定：条件は確定済み。含む食材の確認は、食べられないものがある家庭だけ。
  if (document.querySelector("#planning-ai")) {
    const verify = document.querySelector("#planning-verified");
    state.draft.planning = { ...state.draft.planning, aiJudged: true, conditionsConfirmed: true, ingredientsVerified: verify ? verify.checked : true };
  }
}
function conditionWarning(recipe, date) {
  const fit = Lifestyle.fit(recipe, dailyProfile(), date);
  return fit.ok
    ? ""
    : `<p class="notice">今の条件と合わない可能性があります：${escapeHtml(fit.reason)}。確定済みの料理は保持しています。必要なら入れ替えてください。</p>`;
}
function trackDaily(name, detail = {}) {
  state.experienceEvents = [
    ...(state.experienceEvents || []),
    { name, at: nowIso(), ...detail },
  ].slice(-500);
}

function latestSlotRecipe(slot) {
  return (
    state.recipes.find(
      (r) => r.id === slot.recipe?.id || r.starterId === slot.recipe?.id,
    ) || slot.recipe
  );
}
function slotHasUpdates(slot) {
  const r = latestSlotRecipe(slot);
  return (
    slot.servings !== dailyProfile().servings ||
    JSON.stringify([r.title, r.ingredients, r.steps]) !==
      JSON.stringify([
        slot.recipe.title,
        slot.recipe.ingredients,
        slot.recipe.steps,
      ])
  );
}

const COMMON_DISLIKES = ["パクチー", "ピーマン", "なす", "セロリ", "しいたけ", "トマト", "納豆", "レバー", "さば", "ゴーヤ"];
// 初回のかんたん設定。継続と課金につながる順番：
// 目標（何を叶えたい？）→ 悩み → 人数 → リズム → 1年の変化（時間と食材）→ 保存した動画 → AIの読み取りを試す
// → 料理スキル（診断がおすすめ）→ 平日の夜の時間（ダイヤル）→ 食べられないもの → 新着から選ぶ → 目標を決める → 作成中。
// 数字（0〜4）は献立に使う5問（0 人数・1 リズム・2 スキル・3 時間・4 食べられないもの）。
// 2部構成。第1部「いまのあなた」（現状）→ いまのままだと…（損の見える化）→ 第2部「これからのあなた」（希望と設定）→ 約束。
// 2026-09-30 の整理（docs/PERSONALIZE_PLAN.md §4、APP_MAP §19）：
//  ・「いま、夜ごはんはどう決めてる？」（pain）は、わが家のごはん方針の最初の質問と同じなのでやめた
//  ・晩ごはんタイプ（割合・主食・お店・いちばん大事なこと・タイプ）は、方針の会話（味・大変なこと）が役目を持つので、初回からは外した
//  ・宣言（3回の長押し）と、時間だけで100%になる「作成中」はやめた。最後は、実際に反映する中身と、最初の提案
//  ・方針の会話（talk）を、食べられないもの・器具・時間・スキルのあとに入れた（聞き返し・確認・保存まで）
// 2026-10-28 の見直し（ユーザーの判断「少ない質問で魅力的な献立を出し、あとから段階的に聞く」）：初回は7画面だけ
// （人数 → 一緒に食べる人 → 食べられないもの → 平日の時間 → リズム → 気になる料理 → 確認といつから始めるか）。
// 器具（基本の道具のまま）・腕前・ごはん方針は「今日やること」から1つずつ（料理の腕前・方針・詳しい設定）。
// 動画の習慣・読み取りのお試し・1年の損・目標・カレンダーの登録は初回から外した（画面の関数は残す）。
const FUNNEL = [0, "eaters", 4, 3, 1, "picks", "result"];
// 2026-09-30〜10-27 の順番（途中まで進んだ人の移し替えだけに使う）。
const FUNNEL_V2 = [0, "eaters", 4, "equipment", 3, 2, "talk", "picks", "videos", "demo", "loss", "goal", 1, "remind", "result"];
// 以前の順番（途中まで進んだ人の移し替えだけに使う）。
const FUNNEL_V1 = ["pain", 0, "eaters", 4, "equipment", "ratio", "staple", "chains", "priority", 2, "type", "videos", "demo", "loss", "goal", 1, "remind", 3, "picks", "commit", "building"];
const EATERS = [["me", "🧑", "自分"], ["partner", "💑", "パートナー"], ["kids", "🧒", "子ども（小学生まで）"], ["teens", "🧑‍🎓", "子ども（中学生から）"], ["parents", "👵", "親"], ["friends", "🏠", "同居の友人など"]];
const EATER_OF = Object.fromEntries(EATERS.map(([id, , label]) => [id, label.replace(/（.*$/, "")]));
const OPTIONAL_TOOLS = ["炊飯器", "トースター", "オーブン", "電気ケトル", "圧力鍋", "ホットプレート", "ミキサー", "はかり"];
const QUICK_STEPS = FUNNEL.length;
// 答えへのひとこと（入力が続く第1部を、会話のようにする）。前の答えを次の画面の上に出す。
const FUNNEL_ECHO = {
  0: (p) => ({ fridge: "毎日その場で考えるの、大変ですよね。", same: "同じ料理が続くと、飽きちゃいますよね。", tired: "考えるのが一番しんどい、よく聞きます。", ok: "いいですね。もっと楽にしましょう。" })[p.pain] || "",
  demo: (p) => ({ few: "保存したまま、もったいない！1本、試してみましょう。", some: "たまに作れるなら、あと一歩です。", many: "よく作る人ほど、献立にまとめると一気にラクに。", none: "YouTubeで気になった料理を、1本だけ探して貼ってみてください。" })[p.savedVideos] || "",
  eaters: (p) => (p.servings >= 3 ? `${p.servings >= 5 ? "5人以上" : `${p.servings}人分`}ですね。まとめ買いが効く人数です。` : p.servings === 2 ? "2人分ですね。食材を使い切りやすい人数です。" : "1人分ですね。少量でもムダなく回します。"),
  4: (p) => ((p.eaters || []).includes("kids") ? "お子さんと一緒の食卓ですね。みんなの「また食べたい」を覚えていきます。" : (p.eaters || []).includes("partner") ? "ふたりの「また食べたい」を覚えていきます。" : ""),
  staple: (p) => { const r = ratioOf(p); return r.self >= 5 ? `自炊が週${r.self}回。しっかり作っていますね。` : r.self >= 3 ? `自炊は週${r.self}回。ちょうどいいバランスです。` : `自炊は週${r.self}回。まずは週1回ふやすところから。`; },
  chains: (p) => ((p.staples || []).includes("noodle") && !(p.staples || []).includes("rice") ? "麺派なんですね。" : (p.staples || []).length >= 3 ? "主食はいろいろ派ですね。" : ""),
  priority: (p) => { const g = [...new Set((p.chains || []).map((id) => CHAIN_OF[id]?.genre).filter(Boolean))]; return g.length ? `${g.slice(0, 2).join("と")}が好きなんですね。` : ""; },
  type: () => (skillPhoto.status === "done" ? `「${skillPhoto.result.dish}」、おいしそう！` : ""),
};
const GOALS = [["smile", "😊", "一緒に食べる人を、笑顔にしたい"], ["save", "💴", "食費と食材のムダを、減らしたい"], ["time", "⏰", "自分の時間を、つくりたい"], ["grow", "🌱", "料理のレパートリーを、広げたい"]];
const GOAL_OF = Object.fromEntries(GOALS.map(([id, icon, label]) => [id, { icon, label }]));
const PAINS = [["fridge", "その日に冷蔵庫を見て考える"], ["same", "いつも同じ料理になりがち"], ["tired", "考えるのが一番しんどい"], ["ok", "わりと決められている"]];
const VIDEOS = [["few", "ほとんど作っていない"], ["some", "たまに作る"], ["many", "よく作る"], ["none", "動画は保存しない"]];
const SERVINGS = [[1, "1人"], [2, "2人"], [3, "3人"], [4, "4人"], [5, "5人以上"]];
const funnelPick = (field, [value, label], current, icon = "") => `<button type="button" class="funnel-pick" data-action="life-funnel-pick" data-field="${field}" data-value="${value}" aria-pressed="${current === value}">${icon ? `<span class="fp-icon" aria-hidden="true">${icon}</span>` : ""}${escapeHtml(label)}</button>`;
// 1年で変わること。数字は出典のある目安だけを使う（画面の「数字の出典」に載せる）。
//  献立を考える時間：夕食1回あたり平均約20分（クックパッド調べ）。リピごちでは決める日に1回約10分。
//  家庭の食品ロス：年233万トン（環境省 令和5年度推計）＝1人あたり年約19kg。捨てた理由の3割以上が「傷んでいた・期限切れ」（消費者庁 徳島県の実証）。
const THINK_MIN = 20, DECIDE_MIN = 10, LOSS_KG_PER_PERSON = 19, DINNER_KG = 0.4;
function yearlyChange(p) {
  const preset = state.rhythm?.preset || "weekday";
  const decides = { weekday: 52, week: 52, "3day": 104 }[preset] || 52;
  const covered = { weekday: 260, week: 312, "3day": 312 }[preset] || 260;
  const now = 365 * THINK_MIN;
  const withApp = decides * DECIDE_MIN + (365 - covered) * THINK_MIN;
  const hours = Math.round((now - withApp) / 60);
  const people = Number(p.servings) || 1;
  const kg = LOSS_KG_PER_PERSON * people;
  return { hours, movies: Math.floor(hours / 2), days: Math.round((hours / 24) * 10) / 10, kg, bags: Math.max(1, Math.round(kg / 5)), people, preset };
}
const funnelSource = `<details class="funnel-source"><summary>数字の出典</summary><ul class="small">
  <li>夕食の献立を考える時間 平均約20分：<a href="https://info.cookpad.com/news/press_2012_1016" target="_blank" rel="noopener">クックパッド「毎日の料理時間に関するアンケート」</a></li>
  <li>家庭の食品ロス 年233万トン（1人あたり約19kgで計算）：<a href="https://www.env.go.jp/press/press_00002.html" target="_blank" rel="noopener">環境省「食品ロスの発生量の推計値（令和5年度）」</a></li>
  <li>捨てた理由「傷んでいた23%・期限切れ11%」、記録と工夫で約4割減：<a href="https://www.caa.go.jp/policies/policy/consumer_policy/information/food_loss/efforts/pdf/efforts_180703_0003.pdf" target="_blank" rel="noopener">消費者庁「徳島県における食品ロス削減に関する実証事業」</a></li>
  <li>リピごちで決める時間は1回約10分・決めない日は今と同じとして計算した目安です。</li>
  <li>「食卓◯回分」は、1人前の夕食を約400gとして計算した目安です。</li></ul></details>`;
// いまのまま（リピごちなし）の1年。
function nowCost(p) {
  const hours = Math.round((365 * THINK_MIN) / 60);
  const people = Number(p.servings) || 1;
  const kg = LOSS_KG_PER_PERSON * people;
  return { hours, movies: Math.floor(hours / 2), days: Math.round((hours / 24) * 10) / 10, kg, bags: Math.max(1, Math.round(kg / 5)), people };
}
// Googleカレンダーの「予定の作成」を、くり返し入りで開くリンク。
function googleCalendarUrl() {
  const r = rhythmReminder();
  const first = new Date(); first.setHours(0, 0, 0, 0);
  while (!r.days.includes(first.getDay())) first.setDate(first.getDate() + 1);
  const ymd = `${first.getFullYear()}${String(first.getMonth() + 1).padStart(2, "0")}${String(first.getDate()).padStart(2, "0")}`;
  const [h, m] = r.at.split(":").map(Number);
  const end = `${String(h + (m + 15 >= 60 ? 1 : 0)).padStart(2, "0")}${String((m + 15) % 60).padStart(2, "0")}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: "🍳 リピごち：献立を決めて、買い物へ", details: `アプリを開いて、次の献立を決めましょう。\n${location.origin}${location.pathname}`, dates: `${ymd}T${r.at.replace(":", "")}00/${ymd}T${end}00`, ctz: "Asia/Tokyo", recur: `RRULE:FREQ=WEEKLY;BYDAY=${r.days.map((d) => ICS_DAYS[d]).join(",")}` });
  return `https://calendar.google.com/calendar/render?${params}`;
}
// 決める日（まとまりの前日）の予定を、毎週くり返しのカレンダーファイルにする。
const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"], DAY_JA = ["日", "月", "火", "水", "木", "金", "土"];
function rhythmReminder() {
  const blocks = rhythmOn() ? rhythmBlocks() : RHYTHMS.weekday.blocks;
  // 決める日＝買い物の日（まとまりの前日か当日）。
  const days = blocks.map((b) => (state.rhythm?.shopBefore === 0 ? b[0] : (b[0] + 6) % 7));
  const time = state.rhythm?.shopTime || "17:00";
  const [h, m] = time.split(":").map(Number);
  const at = `${String(Math.max(0, h - 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { days, at, label: `${days.map((d) => DAY_JA[d]).join("・")}曜 ${at}` };
}
function downloadReminder() {
  const r = rhythmReminder();
  const first = new Date(); first.setHours(0, 0, 0, 0);
  while (!r.days.includes(first.getDay())) first.setDate(first.getDate() + 1);
  const ymd = `${first.getFullYear()}${String(first.getMonth() + 1).padStart(2, "0")}${String(first.getDate()).padStart(2, "0")}`;
  const hm = r.at.replace(":", "");
  const url = `${location.origin}${location.pathname}`;
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ripigochi//JP", "BEGIN:VTIMEZONE", "TZID:Asia/Tokyo", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0900", "TZOFFSETTO:+0900", "TZNAME:JST", "END:STANDARD", "END:VTIMEZONE", "BEGIN:VEVENT", `UID:ripigochi-decide-${Date.now()}@ripigochi`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=Asia/Tokyo:${ymd}T${hm}00`, "DURATION:PT15M", `RRULE:FREQ=WEEKLY;BYDAY=${r.days.map((d) => ICS_DAYS[d]).join(",")}`, "SUMMARY:🍳 リピごち：献立を決めて、買い物へ", `DESCRIPTION:アプリを開いて、次の献立を決めましょう。\n${url}`, `URL:${url}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:献立を決める日です", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  a.download = "ripigochi-kondate.ics";
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
// AIの読み取りを試す（説明欄から読むので1日の上限は使わない）。
let funnelDemo = { status: "idle", url: "", result: null, message: "" };
async function runFunnelDemo(url) {
  if (!url || funnelDemo.status === "loading") return;
  funnelDemo = { status: "loading", url, result: null, message: "" }; render();
  try {
    const result = await importRecipeFromYouTube(url);
    if (!(result.steps || []).length && !(result.ingredients || []).length) throw new Error("この動画からはレシピを読み取れませんでした。別の動画で試してください。");
    const videoId = result.videoId || youtubeVideoId(url);
    const recipe = saveOwnRecipe(discoverRecipe({ ...result, videoId, thumbnailUrl: result.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` }, "demo"));
    funnelDemo = { status: "done", url, result: recipe, message: "" };
    trackDaily("funnel_demo_read");
  } catch (error) {
    funnelDemo = { status: "error", url, result: null, message: error.message || "読み取れませんでした。" };
  }
  if (FUNNEL[profileDraft().quickSetupIndex] === "demo") render();
}
// 読み取りを待つ間に流す、料理のひとこと豆知識。
const WAIT_TIPS = [
  "🧅 玉ねぎは冷やしてから切ると、目にしみにくくなります",
  "🍳 フライパンは、油を入れる前によく温めるとくっつきにくい",
  "🥩 肉は焼く前に少し常温に置くと、焼きムラが減ります",
  "🍚 炊きあがったごはんは、すぐにほぐすとふっくら",
  "🧂 「少々」は指2本で、「ひとつまみ」は指3本でつまむ量",
  "🥬 キャベツは芯をくり抜いて湿らせたペーパーを詰めると長持ち",
  "🥚 卵は、とがった方を下にして保存すると長持ちします",
  "🍝 パスタのゆで汁は、ソースをなめらかにする名脇役",
];
const WAIT_STAGES = ["動画を見ています", "材料を書き出しています", "作り方をまとめています", "手順ごとの場面を探しています"];
let demoTimer = null;
function renderFunnelDemo() {
  const d = funnelDemo;
  if (d.status === "done") {
    const r = d.result;
    const servings = dailyProfile().servings;
    return [`🎉 読み取れました！`, `<div class="demo-recipe">${renderCreatorCredit(r)}<h3 class="demo-title">${escapeHtml(r.title)}</h3><p class="muted small">${[r.planning?.minutes ? `⏱ ${r.planning.minutes}分` : "", `材料 ${r.ingredients.length}品`, `作り方 ${r.steps.length}ステップ`].filter(Boolean).join(" ・ ")}</p>
      <p class="demo-hint">📱 スマホを<b>横</b>にすると、動画を見ながら作り方を読めます。手順の <b>▶</b> で、その場面から再生。</p>
      <h4 class="detail-h">材料</h4><ul class="detail-ingredients">${r.ingredients.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, r.sourceServings))}</span></li>`).join("")}</ul>
      <h4 class="detail-h">作り方</h4><ol class="detail-steps" data-steps-of="${escapeAttr(r.id)}">${r.steps.map((st, i) => `<li>${stepTimeSlot(r, i)}${escapeHtml(st)}</li>`).join("")}</ol>
      <p class="fd-ok">✓ このレシピを、献立の候補に入れました</p></div>`];
  }
  if (d.status === "loading") return [`🤖 AIが動画を読んでいます…`, `<div class="demo-wait"><p class="dw-stage" aria-live="polite">${WAIT_STAGES[0]}</p><div class="dw-bar"><i></i></div><div class="dw-tip" aria-live="polite"><small>待っている間に、ひとこと</small><p>${WAIT_TIPS[0]}</p></div></div>`];
  return [`🎬 最近見て気になった、YouTubeのレシピ動画のURLを貼って！`, `<div class="demo-try"><input id="demo-url" class="input" type="url" inputmode="url" placeholder="https://youtu.be/…" value="${escapeAttr(d.url)}"><button type="button" class="primary-button" data-action="life-demo-read">読み取る</button></div>${d.status === "error" ? `<p class="form-error small">${escapeHtml(d.message)}</p>` : ""}`];
}
// 待ち時間のあいだ、段階と豆知識を順に入れ替える（画面は描き直さない）。
function bindDemoWait() {
  clearInterval(demoTimer);
  const wait = document.querySelector(".demo-wait");
  if (!wait) return;
  let n = 0;
  demoTimer = setInterval(() => {
    if (!document.body.contains(wait)) { clearInterval(demoTimer); return; }
    n += 1;
    wait.querySelector(".dw-stage").textContent = WAIT_STAGES[Math.min(WAIT_STAGES.length - 1, Math.floor(n / 2))];
    const tip = wait.querySelector(".dw-tip p");
    tip.classList.remove("is-in"); void tip.offsetWidth; tip.textContent = WAIT_TIPS[n % WAIT_TIPS.length]; tip.classList.add("is-in");
  }, 3200);
}
// 平日の夜ごはんの時間：時計のダイヤル（5分きざみ・5〜60分）。
const DIAL_MIN = 5, DIAL_MAX = 60, DIAL = { r: 88, cx: 110, cy: 110 };
function dialGeometry(m) {
  const { r, cx, cy } = DIAL;
  const angle = (m / 60) * 360;
  const rad = ((angle - 90) * Math.PI) / 180;
  const kx = cx + r * Math.cos(rad), ky = cy + r * Math.sin(rad);
  const arc = angle >= 359.9 ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}` : `M ${cx} ${cy - r} A ${r} ${r} 0 ${angle > 180 ? 1 : 0} 1 ${kx.toFixed(2)} ${ky.toFixed(2)}`;
  return { arc, kx: kx.toFixed(2), ky: ky.toFixed(2) };
}
function renderTimeDial(minutes) {
  const m = minutes || 20;
  const { r, cx, cy } = DIAL;
  const g = dialGeometry(m);
  const ticks = Array.from({ length: 12 }, (_, k) => { const a = ((k * 30 - 90) * Math.PI) / 180; return `<line x1="${(cx + 100 * Math.cos(a)).toFixed(1)}" y1="${(cy + 100 * Math.sin(a)).toFixed(1)}" x2="${(cx + 106 * Math.cos(a)).toFixed(1)}" y2="${(cy + 106 * Math.sin(a)).toFixed(1)}" />`; }).join("");
  return `<div class="time-dial"><svg viewBox="0 0 220 220" role="slider" tabindex="0" aria-label="平日の夜ごはんにかける時間" aria-valuemin="${DIAL_MIN}" aria-valuemax="${DIAL_MAX}" aria-valuenow="${m}" aria-valuetext="${m}分">
    <circle class="td-face" cx="${cx}" cy="${cy}" r="${r}" /><g class="td-ticks">${ticks}</g><path class="td-arc" d="${g.arc}" /><circle class="td-knob" cx="${g.kx}" cy="${g.ky}" r="14" /></svg>
    <p class="td-value"><b>${m}</b>分</p></div>
    <div class="td-quick">${[10, 20, 30, 45, 60].map((n) => `<button type="button" class="chip-button" data-action="life-minutes" data-minutes="${n}" aria-pressed="${n === m}">${n}分</button>`).join("")}</div>`;
}
function bindTimeDial() {
  const svg = document.querySelector(".time-dial svg");
  if (!svg) return;
  const set = (raw) => {
    const m = Math.max(DIAL_MIN, Math.min(DIAL_MAX, Math.round(raw / 5) * 5));
    if (profileDraft().weekdayMinutes === m) return;
    profileDraft().weekdayMinutes = m;
    const g = dialGeometry(m);
    svg.querySelector(".td-arc").setAttribute("d", g.arc);
    svg.querySelector(".td-knob").setAttribute("cx", g.kx); svg.querySelector(".td-knob").setAttribute("cy", g.ky);
    svg.setAttribute("aria-valuenow", String(m)); svg.setAttribute("aria-valuetext", `${m}分`);
    document.querySelector(".td-value b").textContent = String(m);
    document.querySelectorAll(".td-quick [data-minutes]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.minutes) === m)));
    globalThis.navigator?.vibrate?.(5);
  };
  const fromPoint = (ev) => {
    const box = svg.getBoundingClientRect();
    const x = ev.clientX - (box.left + box.width / 2), y = ev.clientY - (box.top + box.height / 2);
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    return (deg / 360) * 60 || 60;
  };
  let dragging = false;
  svg.addEventListener("pointerdown", (ev) => { dragging = true; svg.setPointerCapture?.(ev.pointerId); set(fromPoint(ev)); });
  svg.addEventListener("pointermove", (ev) => { if (dragging) { ev.preventDefault(); set(fromPoint(ev)); } });
  ["pointerup", "pointercancel"].forEach((e) => svg.addEventListener(e, () => { if (dragging) { dragging = false; saveState({ scheduleSync: false }); } }));
  svg.addEventListener("keydown", (ev) => {
    const m = profileDraft().weekdayMinutes || 20;
    if (["ArrowRight", "ArrowUp"].includes(ev.key)) { ev.preventDefault(); set(m + 5); saveState({ scheduleSync: false }); }
    if (["ArrowLeft", "ArrowDown"].includes(ev.key)) { ev.preventDefault(); set(m - 5); saveState({ scheduleSync: false }); }
  });
}
// 食べられないもの・苦手：入力して「追加」（Enterでも）→ タブが増える。×で消せる。
function chipField(field, placeholder) {
  const p = profileDraft();
  const chips = (p[field] || []).map((name) => `<span class="food-chip">${escapeHtml(name)}<button type="button" data-action="life-chip-remove" data-field="${field}" data-name="${escapeAttr(name)}" aria-label="${escapeAttr(name)}を外す">×</button></span>`).join("");
  return `<div class="chip-field" data-chip-field="${field}"><div class="chip-add"><input class="input" data-chip-input="${field}" placeholder="${escapeAttr(placeholder)}" enterkeyhint="done"><button type="button" class="secondary-button" data-action="life-chip-add" data-field="${field}">追加</button></div><div class="food-chips">${chips}</div></div>`;
}
function addChip(field) {
  const input = document.querySelector(`[data-chip-input="${field}"]`);
  const names = String(input?.value || "").split(/[、,，\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 10);
  if (!names.length) return;
  const p = profileDraft();
  p[field] = [...new Set([...(p[field] || []), ...names])].slice(0, 40);
  saveState({ scheduleSync: false });
  render();
  document.querySelector(`[data-chip-input="${field}"]`)?.focus();
}
// 損の場面の動画（音なし・くり返し）。動きを減らす設定の人には止まった絵だけ。
function lossVideo(name) {
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  return reduce ? `<img class="lv-media" src="assets/loss/${name}.webp" alt="">` : `<video class="lv-media" poster="assets/loss/${name}.webp" autoplay muted loop playsinline preload="auto" aria-hidden="true"><source src="assets/loss/${name}.mp4" type="video/mp4"><source src="assets/loss/${name}.webm" type="video/webm"></video>`;
}
function renderFunnelStep(key) {
  const p = profileDraft();
  if (key === "goal") return [`🎯 これから、何を叶えたい？`, `<div class="funnel-picks is-goals">${GOALS.map(([id, icon, label]) => funnelPick("goal", [id, label], p.goal, icon)).join("")}</div>`];
  if (key === "pain") return [`🤔 いま、夜ごはんはどうやって決めてる？`, `<div class="funnel-picks">${PAINS.map((x) => funnelPick("pain", x, p.pain)).join("")}</div>`];
  if (key === "loss") {
    const c = nowCost(p);
    const flips = Math.round(c.kg / (DINNER_KG * c.people));
    const kgLine = `${c.people >= 5 ? "5人以上" : `${c.people}人`}の家庭`;
    return [`⏳ いまのままだと、1年で…`, `<div class="loss-scenes">
      <figure class="loss-video is-fridge" aria-label="冷蔵庫の前で迷う時間は、年${c.hours}時間。丸${c.days}日です">
        ${lossVideo("fridge")}
        <figcaption class="lv-over" aria-hidden="true"><span class="lv-label">冷蔵庫の前で迷う時間</span><b class="lv-num">年<span data-count="${c.hours}">${c.hours}</span>時間</b><span class="lv-sub">＝ 丸${c.days}日</span></figcaption>
      </figure>
      <figure class="loss-video is-table" aria-label="${kgLine}が捨てる食材は年${c.kg}kg。食卓${flips}回分をひっくり返すのと同じです">
        ${lossVideo("table")}
        <figcaption class="lv-over" aria-hidden="true"><span class="lv-label">捨てる食材 年${c.kg}kg</span><b class="lv-num">ちゃぶ台返し <span data-count="${flips}">${flips}</span>回分</b><span class="lv-sub">${kgLine}・3割は「傷んだ・期限切れ」</span></figcaption>
      </figure>
    </div><p class="funnel-turn">次は、<b>これから</b>のこと →</p>${funnelSource}`];
  }
  if (key === "remind") {
    const r = rhythmReminder();
    return [`🔔 決める日を、忘れないように`, `<div class="remind-card"><p class="rc-when">毎週 <b>${escapeHtml(r.label)}</b></p></div>
      <div class="remind-options">
        ${pushState() === "off" ? `<button type="button" class="remind-button is-push" data-action="life-push-on" ${pushBusy ? "disabled" : ""}><span aria-hidden="true">🔔</span>${pushBusy ? "準備しています…" : "通知でお知らせ（おすすめ）"}</button>` : pushState() === "on" ? '<p class="remind-done">🔔 通知はオンです</p>' : ""}
        <button type="button" class="remind-button" data-action="life-remind-google"><span aria-hidden="true">🗓</span>Googleカレンダーに追加</button>
        <details class="remind-how"><summary>追加のしかた</summary><ol class="small"><li>ボタンを押すと、Googleカレンダーの「予定の作成」画面が開きます（Googleにログインしていない時はログイン）。</li><li>毎週のくり返しは入力済み。右上の<b>「保存」</b>を押せば完了です。</li><li>通知は、Googleカレンダーのいつもの設定（例：10分前）で届きます。</li></ol></details>
        <button type="button" class="remind-button" data-action="life-remind-calendar"><span aria-hidden="true">📱</span>iPhoneのカレンダーに追加</button>
        <details class="remind-how"><summary>追加のしかた</summary><ol class="small"><li>ボタンを押すと、予定のファイルができます。</li><li>Safari：「カレンダーに追加」の画面が出たら、<b>「すべてを追加」</b>（または「追加」）を押します。</li><li>画面が出ない時は、SafariでリピごちのURLを開いて、もう一度押してください。</li><li>時間になると、カレンダーの通知でお知らせします。</li></ol></details>
      </div>${p.remindAdded ? '<p class="fd-ok small">✓ 追加の画面を開きました。保存（追加）まで進めてください。</p>' : ""}`];
  }

  if (key === "eaters") {
    const on = new Set(p.eaters || []);
    return [`👨‍👩‍👧 いま、一緒に食べるのは？`, `<p class="small">複数OK</p><div class="funnel-picks is-grid2">${EATERS.map(([id, icon, label]) => `<button type="button" class="funnel-pick" data-action="life-eater" data-value="${id}" aria-pressed="${on.has(id)}"><span class="fp-icon" aria-hidden="true">${icon}</span>${escapeHtml(label)}</button>`).join("")}</div>`];
  }
  if (key === "equipment") {
    const eq = p.equipment;
    const chip = (name) => `<button type="button" class="tool-chip" data-action="life-equipment-toggle" data-name="${escapeAttr(name)}" aria-pressed="${eq[name] === "have"}">${escapeHtml(name)}</button>`;
    return [`🍳 いま、キッチンにあるものは？`, `<p class="small">持っている道具で作れる料理だけ出します</p><h3 class="quick-sub">基本（ない物だけ外す）</h3><div class="tool-chips">${["コンロ", "電子レンジ", "フライパン", "鍋"].map(chip).join("")}</div><h3 class="quick-sub">あると使う（ある物をタップ）</h3><div class="tool-chips">${OPTIONAL_TOOLS.map(chip).join("")}</div>`];
  }
  if (key === "ratio") return [`🗓 いまの1週間、晩ごはんはどうしてる？`, renderRatioStep(p)];
  if (key === "staple") return [`🍚 晩ごはんで、よく食べる主食は？`, renderStapleStep(p)];
  if (key === "chains") return [`🏪 晩ごはんを外で食べるなら、どこ？`, renderChainStep(p)];
  if (key === "priority") return [`🎯 晩ごはんで、いちばん大事なのは？`, renderPriorityStep(p)];
  if (key === "type") { const r = cookTypeOf(p); return [`🎴 あなたの晩ごはんタイプ`, r ? renderCookTypeCard(r) : `<p>答えが足りないので、タイプはあとで診断できます。</p>`]; }
  if (key === "videos") return [`📱 保存したレシピ動画、実際に作ったのは？`, `<div class="funnel-picks">${VIDEOS.map((x) => funnelPick("savedVideos", x, p.savedVideos)).join("")}</div>`];
  if (key === "demo") return renderFunnelDemo();
  if (key === "picks") return renderFunnelPicks();
  if (key === "result") {
    // 時間で進む演出はしない。この時点で決まっている中身を、そのまま見せる。
    const lines = resultLines(p);
    // いつから始めるか（2026-10-28 のユーザーの判断）：今日が作る日なら「今夜から」も選べる。決めていなければ17時より前は今夜・あとは明日。
    const can = canStartTonight(), tonight = startTonight(p);
    const when = can ? `<h3 class="quick-sub">いつから始める？</h3><div class="funnel-picks is-grid2 start-when">
        <button type="button" class="funnel-pick" data-action="life-start-when" data-when="tonight" aria-pressed="${tonight}"><span class="fp-icon" aria-hidden="true">🌙</span>今夜から</button>
        <button type="button" class="funnel-pick" data-action="life-start-when" data-when="tomorrow" aria-pressed="${!tonight}"><span class="fp-icon" aria-hidden="true">☀️</span>明日から</button></div>
      <p class="muted small">${tonight ? "今夜の一品から決めます。最初の買い物は1時間後の目安です" : "最初の買い物は、いつもの買い物の時間です"}</p>` : "";
    return [`✅ この条件で、献立を作ります`, `<ul class="funnel-result">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>${when}
      <p class="muted small">あとから設定で変えられます。好み・器具・腕前は、使いながら少しずつ聞きます</p>
      <button type="button" class="primary-button full-button" data-action="life-finish">最初の提案を見る</button>`];
  }
  return ["", ""];
}
// 今夜の4皿のシート：開いている間は後ろの画面を動かさない・Esc で閉じる（描き直すたびに呼ぶ）。
// 描き直した後も、押した場所（の近く）にフォーカスを戻し、Tab はシートの中だけで回す（Codex review #234）。
let swapFocusAt = -1;
let swapFocusWhat = null;
const swapFocusables = (sheet) => [...(sheet?.querySelectorAll?.("button, input, summary, [tabindex]:not([tabindex='-1'])") || [])].filter((el) => !el.disabled && el.offsetParent !== null && (el.tagName === "SUMMARY" || !el.closest?.("details:not([open])")));
let swapSizeSeen = 0;
function syncHasSheetBodyClass() {
  const inPlanOrToday = !state?.view || state.view === "plan" || state.view === "today";
  const hasModal = Boolean(
    (swapDate && (!state?.view || state.view === "plan")) ||
    ((trayFlipId || cardGetRecipeId) && (inPlanOrToday || state.view === "repeat"))
  );
  document.body?.classList?.toggle("has-sheet", hasModal);
  return hasModal;
}
// よはくの吹き出しを1文字ずつ出す（言葉が変わった時だけ。途中で描き直されても続きから。動きを減らす設定では一度に出す）
let trayTypedSay = "";
let trayTypedAt = 0;
let trayTypeTimer = 0;
function typeTrayBubble() {
  const bar = document.querySelector?.(".tray-yohaku-bar");
  if (!bar) { trayTypedSay = ""; if (trayTypeTimer && typeof clearInterval === "function") clearInterval(trayTypeTimer); return; }
  const say = bar.dataset?.say || bar.getAttribute?.("data-say") || "";
  const el = bar.querySelector?.(".tray-bubble-text");
  if (!el) return;
  const chars = [...say];
  if (say !== trayTypedSay) { trayTypedSay = say; trayTypedAt = 0; }
  if (trayTypedAt >= chars.length) return;
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce || typeof setInterval !== "function") { trayTypedAt = chars.length; return; }
  clearInterval(trayTypeTimer);
  el.textContent = chars.slice(0, trayTypedAt).join("");
  bar.classList?.add("is-typing");
  trayTypeTimer = setInterval(() => {
    if (!el.isConnected || trayTypedSay !== say) { clearInterval(trayTypeTimer); return; }
    trayTypedAt += 1;
    el.textContent = chars.slice(0, trayTypedAt).join("");
    if (trayTypedAt >= chars.length) { clearInterval(trayTypeTimer); bar.classList?.remove("is-typing"); }
  }, 40);
}
function bindSwapSheet() {
  syncHasSheetBodyClass();
  if (typeof document !== "undefined") typeTrayBubble();
  // 画面の向き・大きさが変わって並べる数（4皿／6皿）が変わったら、描き直す。
  if (!swapSizeSeen && globalThis.addEventListener) globalThis.addEventListener("resize", () => { if (swapDate && state.view === "plan" && swapSize() !== swapSizeSeen) render(); });
  swapSizeSeen = swapSize();
  const topModal =
    document.querySelector(".rc-flip-overlay") ||
    document.querySelector(".rc-get-overlay") ||
    document.querySelector(".swap-sheet") ||
    null;
  if (!topModal) {
    swapFocusAt = -1;
    if (lastModalTriggerSelector) {
      const restoreEl = document.querySelector(lastModalTriggerSelector);
      lastModalTriggerSelector = "";
      restoreEl?.focus?.({ preventScroll: true });
    }
    return;
  }
  if (!topModal.classList?.contains("rc-flip-overlay") && flipTriggerSelector) {
    const restoreFlipEl = document.querySelector(flipTriggerSelector);
    flipTriggerSelector = "";
    if (restoreFlipEl && topModal.contains?.(restoreFlipEl)) {
      restoreFlipEl.focus?.({ preventScroll: true });
    }
  }
  const closeTopModal = () => {
    if (trayFlipId) return handleDailyAction("life-card-flip-close", {});
    if (cardGetRecipeId) return handleDailyAction("life-card-get-close", {});
    if (swapDate) return handleDailyAction("life-close-swap", {});
  };
  const sheet = topModal;
  sheet.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { ev.preventDefault?.(); closeTopModal(); return; }
    if (ev.key !== "Tab") return;
    const list = swapFocusables(sheet);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (ev.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { ev.preventDefault?.(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault?.(); first.focus(); }
  });
  sheet.addEventListener("click", (ev) => {
    const el = ev.target?.closest?.("[data-action]");
    const i = swapFocusables(sheet).indexOf(el);
    if (i < 0) return;
    const card = el.closest?.(".swap-card");
    swapFocusAt = i;
    swapFocusWhat = { action: el.dataset.action, mood: el.dataset.mood || "", recipe: el.dataset.recipe || "", slot: card ? [...sheet.querySelectorAll(".swap-card")].indexOf(card) : -1 };
  }, true);
  if (topModal.contains(document.activeElement)) return;
  const list = swapFocusables(topModal);
  const w = swapFocusWhat;
  // 同じボタン（同じ札・同じ料理）→ パスした時は同じ枠の「✕ パス」→ 同じ順番の場所。
  const same = w && list.find((el) => el.dataset?.action === w.action && (el.dataset.mood || "") === w.mood && (el.dataset.recipe || "") === w.recipe);
  const slot = w && w.slot >= 0 ? sheet.querySelectorAll(".swap-card")[w.slot]?.querySelector(w.action === "life-swap-detail" ? ".swap-pick" : ".swap-x") : null;
  const target = same || slot || (swapFocusAt >= 0 && list.length ? list[Math.min(swapFocusAt, list.length - 1)] : list[0] || topModal);
  target?.focus?.({ preventScroll: true });
}
function bindFunnel() {
  document.querySelector("#swap-url")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) document.querySelector('[data-action="life-url-insert"]')?.click(); });
  document.querySelector("#demo-url")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) document.querySelector('[data-action="life-demo-read"]')?.click(); });
  document.querySelectorAll("[data-chip-input]").forEach((el) => el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); addChip(el.dataset.chipInput); } }));
  bindTimeDial();
  // 損の場面：動画の上の数字を、0から一度だけ数え上げる（動きを減らす設定ならそのまま）。
  const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (!reduce) document.querySelectorAll(".loss-video [data-count]").forEach((el, i) => {
    const max = Number(el.dataset.count) || 0, t0 = performance.now() + 400 + i * 500, ms = 1400;
    el.textContent = "0";
    const tick = (t) => { if (!document.body.contains(el)) return; const k = Math.max(0, Math.min(1, (t - t0) / ms)); el.textContent = String(Math.round(max * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
// 最後の画面：この時点で決まっている条件を、そのまま並べる（「〜しています」と進んでいるふりはしない）。
// 今日が作る日（リズムの曜日）で、まだ21時より前なら、今夜から始められる。
function canStartTonight(now = new Date()) {
  return now.getHours() < 21 && (!rhythmOn() || rhythmDays().includes(String(new Date(today() + "T12:00:00").getDay())));
}
// 今夜から始めるか：選んでいればその答え。決めていなければ、17時より前なら今夜（買い物と料理に間に合う目安）。
function startTonight(p, now = new Date()) {
  if (!canStartTonight(now)) return false;
  return typeof p?.startTonight === "boolean" ? p.startTonight : now.getHours() < 17;
}
function resultLines(p) {
  const avoid = [...(p.restrictions || []), ...(p.dislikes || [])];
  const tools = OPTIONAL_TOOLS.filter((t) => p.equipment?.[t] === "have");
  const sp = state.skillProfile;
  const eaters = (p.eaters || []).filter((x) => x !== "me").map((x) => EATER_OF[x]);
  // わが家のごはん方針で、本人が「合ってる」にしたもの（推測のままのものは入れない）。
  const tp = state.tasteProfile && typeof ProfileTalk !== "undefined" ? ProfileTalk.interpret(state.tasteProfile, talkWho()).filter((x) => x.status === "confirmed") : [];
  return [
    `🍽 ${p.servings >= 5 ? "5人以上" : `${p.servings || 1}人分`}${eaters.length ? `（${eaters.join("・")}と）` : ""}`,
    avoid.length ? `🚫 ${avoid.slice(0, 4).join("・")}${avoid.length > 4 ? " ほか" : ""}は入れない` : "🚫 食べられないもの：なし",
    `⏱ 平日 ${p.weekdayMinutes || 20}分以内`,
    `🍳 ${tools.length ? `基本の道具＋${tools.slice(0, 3).join("・")}` : "基本の道具"}${sp ? `・★${sp.level}まで` : ""}`,
    ...tp.slice(0, 4).map((x) => x.label),
    // 選んだ数は事実。献立に入るかは条件（食べられないもの・時間・器具）と空いている日しだいなので、ここでは約束しない。
    ...((p.picks || []).length ? [`📌 気になる料理を${p.picks.length}品選択済み`] : []),
  ];
}
/* ---- 課金の案内（リピごちプラス）：献立ができた直後、期待がいちばん高い時に出す。閉じられる。
   閉じようとした人には、値引きではなく「無料期間の延長」をすすめる。
   決済（Stripe）の準備ができるまでは、?paywall=1 で開いた時だけ出すプレビュー。 */
const PLANS = { year: { label: "1年", price: 6000, per: "年", note: "月500円" }, four: { label: "4週間", price: 600, per: "4週", note: "週150円" } };
// 無料期間：今日から次の月曜までの半端な日＋月曜から2週間。解約しようとした時に「＋2週間」をすすめる（決済と一緒に作る）。
function trialPlan(from = today()) {
  let start = from;
  while (dow(start) !== 1) start = addDays(start, 1);
  const end = addDays(start, 13);
  return { start, end, notify: addDays(end, -2), charge: addDays(end, 1) };
}
let paywall = null; // { plan }
function paywallPreview() {
  try {
    if (new URLSearchParams(globalThis.location?.search || "").get("paywall") === "1") localStorage.setItem("ripigochi-paywall", "preview");
    return localStorage.getItem("ripigochi-paywall") === "preview";
  } catch { return false; }
}
function openPaywall() { paywall = { plan: "year" }; trackDaily("paywall_view"); }
const md = (date) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}（${WD[dow(date)]}）`;
function renderPaywall() {
  if (!paywall) return "";
  const p = state.foodProfile || {};
  const goal = GOAL_OF[p.goal] || GOAL_OF.time;
  const t = trialPlan();
  const saving = Math.round((1 - PLANS.year.price / (PLANS.four.price * 13)) * 100);
  const plan = (id) => { const x = PLANS[id]; return `<button type="button" class="pw-plan" data-action="life-pay-plan" data-plan="${id}" aria-pressed="${paywall.plan === id}">${id === "year" ? `<span class="pw-badge">${saving}%OFF</span>` : ""}<b>${x.label}</b><span class="pw-price">${x.price.toLocaleString()}円<small>／${x.per}</small></span>${x.note ? `<small>${x.note}</small>` : ""}</button>`; };
  const legal = '<a href="legal/terms.html" target="_blank" rel="noopener">利用規約</a>・<a href="legal/tokushoho.html" target="_blank" rel="noopener">特定商取引法に基づく表記</a>';
  // 2か所の案内（ロックの日・3日を使い切った）から開いた時：プラスでできることを、絵文字と短い言葉で。
  const from = paywall.from && PLUS_FROM[paywall.from];
  if (from) return `<div class="paywall" role="dialog" aria-modal="true" aria-label="リピごちプラス"><div class="pw-card pw-plus">
    <button type="button" class="pw-close" data-action="life-pay-close" aria-label="閉じる">×</button>
    <p class="pw-kicker">${from}</p>
    <h2>✨ リピごちプラス</h2>
    <ul class="pw-perks">${PLUS_PERKS.map(([i, t]) => `<li><span aria-hidden="true">${i}</span>${t}</li>`).join("")}</ul>
    <div class="pw-plans">${plan("year")}${plan("four")}</div>
    <button type="button" class="primary-button full-button pw-start" data-action="life-pay-start">プラスにする</button>
    <p class="muted small pw-fine">税込${paywallPreview() ? "・プレビュー" : ""}　${legal}</p></div></div>`;
  return `<div class="paywall" role="dialog" aria-modal="true" aria-label="リピごちプラス"><div class="pw-card">
    <button type="button" class="pw-close" data-action="life-pay-close" aria-label="閉じる">×</button>
    <p class="pw-kicker">あなた専用の献立ができました</p>
    <h2>${goal.icon} この献立で、<br><span class="marker">${escapeHtml(goal.label.replace(/、/, ""))}</span></h2>
    <ol class="pw-timeline"><li><b>今日</b><span>すべての機能を無料ではじめる</span></li><li><b>${md(t.start)}〜${md(t.end)}</b><span>まるごと2週間、無料で献立づくり</span></li><li><b>${md(t.notify)}</b><span>無料期間が終わる前に、お知らせします</span></li><li><b>${md(t.charge)}</b><span>ここからは献立が週3日分まで。毎日ならプラスへ</span></li></ol>
    <div class="pw-plans">${plan("year")}${plan("four")}</div>
    <button type="button" class="primary-button full-button pw-start" data-action="life-pay-start">無料ではじめる</button>
    <p class="muted small pw-fine">カードの登録は不要です。無料期間のあと、自動で料金がかかることはありません。${paywallPreview() ? "（プレビュー：決済はまだ準備中です）" : ""}<br><a href="legal/terms.html" target="_blank" rel="noopener">利用規約</a>・<a href="legal/tokushoho.html" target="_blank" rel="noopener">特定商取引法に基づく表記</a></p></div></div>`;
}
function handlePaywallAction(action, data) {
  if (!action.startsWith("life-pay-") || !paywall) return false;
  if (action === "life-pay-plan") paywall.plan = data.plan === "four" ? "four" : "year";
  if (action === "life-pay-close") { trackDaily("paywall_closed"); paywall = null; }
  if (action === "life-pay-start") {
    trackDaily("paywall_start", { plan: paywall.plan, from: paywall.from || "" });
    if (paywall.from && BETA) { openFeedback(`plus-${paywall.plan}`, "thanks"); return true; }
    showToast("プレビューです。決済はまだ準備中です。"); paywall = null;
  }
  render();
  return true;
}
// 上の進み具合：画面の数だけのブロックが1つずつ色づく（2026-10-28 から1部だけ）。
function funnelProgress(i) {
  const block = (k) => `<li class="${k < i ? "is-done" : k === i ? "is-current" : ""}"></li>`;
  return `<div class="funnel-parts" role="progressbar" aria-label="初回設定の進み具合" aria-valuemin="1" aria-valuemax="${QUICK_STEPS}" aria-valuenow="${i + 1}" aria-valuetext="${i + 1} / ${QUICK_STEPS}"><div class="fs-part is-active"><span class="fs-label">はじめの設定（${i + 1} / ${QUICK_STEPS}）</span><ol class="funnel-steps" style="--n:${QUICK_STEPS}">${FUNNEL.map((_, k) => block(k)).join("")}</ol></div></div>`;
}
function renderQuickSetup() {
  const p = profileDraft(), i = p.quickSetupIndex;
  const key = FUNNEL[i];
  const shell = (title, body, next, extra = "") => {
    document.body.classList.toggle("is-onboarding", !state.onboarded);
    // 前の答えへのひとこと（今の画面をキーに引く）。
    const echo = FUNNEL_ECHO[key]?.(p) || "";
    document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard funnel-step" data-funnel="${key}">${funnelProgress(i)}${echo ? `<p class="funnel-echo">💬 ${escapeHtml(echo)}</p>` : ""}<h2 tabindex="-1">${title}</h2>${body}<div class="wizard-footer"><button class="text-button" data-action="life-quick-back" ${i === 0 || key === "building" ? "disabled" : ""}>戻る</button>${next}</div>${extra}</section>`;
    document.querySelectorAll("[data-profile]").forEach((el) => el.addEventListener("input", () => captureProfile(el)));
    bindAutoAdvance();
    document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handleAction));
    bindFunnel();
    if (key === "demo") { bindDemoWait(); bindVideoPlayer(); }
    if (key === 2) bindPhotoJudge();
  };
  const nextButton = `<button class="primary-button" data-action="life-quick-next">次へ</button>`;
  // わが家のごはん方針の会話は、その画面をそのまま使う（聞き返し・確かめる・保存まで）。上に進み具合だけ出す。
  if (key === "talk") {
    document.body.classList.toggle("is-onboarding", !state.onboarded);
    startTalkInFunnel();
    document.querySelector("#app").innerHTML = `<div class="funnel-talk">${funnelProgress(i)}${renderTalk()}</div>`;
    document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handleAction));
    return;
  }
  if (key === "equipment") p.equipment = Lifestyle.equipmentDefaults(p.equipment);
  if (typeof key === "string") {
    const [title, body] = renderFunnelStep(key);
    // 主食・お店は、選ぶまで「次へ」の代わりに「スキップ」。
    if ((key === "staple" && !(p.staples || []).length) || (key === "chains" && !(p.chains || []).length)) return shell(title, body, `<button class="text-button" data-action="life-quick-next">スキップ</button>`);
    const next = ["result", "goal", "pain", "videos", "priority"].includes(key) ? "" : key === "remind" ? `<button class="primary-button is-quiet" data-action="life-quick-next">${p.remindAdded ? "次へ" : "あとで"}</button>` : nextButton;
    return shell(title, body, next);
  }
  if (key === 3 && !p.weekdayMinutes) p.weekdayMinutes = 20;
  const rhythmNow = state.rhythm?.preset || "weekday";
  const content = [
    `<div class="funnel-picks is-servings">${SERVINGS.map(([n, label]) => `<button type="button" class="funnel-pick" data-action="life-servings" data-count="${n}" aria-pressed="${Number(p.servings) === n}"><span class="fp-icon" aria-hidden="true">${"🧑".repeat(Math.min(n, 4))}${n >= 5 ? "＋" : ""}</span>${label}</button>`).join("")}</div>`,
    `<div class="rhythm-options">${Object.entries(RHYTHMS).map(([id, r]) => `<button type="button" class="rhythm-option" data-action="life-rhythm" data-preset="${id}" aria-pressed="${rhythmNow === id}"><strong>${r.label}${id === "weekday" ? " ⭐おすすめ" : ""}</strong><small>${r.note}</small></button>`).join("")}</div><label class="rhythm-time">買い物の時間（まとまりの前日）<select id="rhythm-time" class="input">${SHOP_TIMES.map((t) => `<option ${(state.rhythm?.shopTime || "17:00") === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>`,
    "", // 2：料理の腕前は初回設定から外した（2026-10-28。設定の「料理の腕前」で★を選ぶ）
    `${renderTimeDial(p.weekdayMinutes)}<p class="muted small">炊飯の時間は別</p>`,
    `<h3 class="quick-sub">アレルギー・食べられないもの</h3><div class="profile-options">${Lifestyle.restrictionOptions.map((n) => optionInput("restrictions", n, n, true)).join("")}</div>
     <h3 class="quick-sub">苦手なもの・一覧にない食材</h3><div class="profile-options">${COMMON_DISLIKES.map((n) => optionInput("dislikes", n, n, true)).join("")}</div>${chipField("dislikes", "ほかにあれば入力（例：キウイ）")}
     <p class="muted small">選んだ食材の料理は出しません ${tip("市販品（たれ・加工品）の原材料は、作る前に確かめてください")}</p>`,
  ][key];
  const titles = ["🍽️ 何人分つくる？", "🗓 これからの献立、どのリズムで決める？", "🔪 いまの料理スキルは？", "🌙 これからの平日の夜ごはん、何分で作りたい？", "🔎 食べられないもの・苦手なものは？"];
  shell(titles[key], content, key === 0 ? "" : nextButton);
}

// 「動画から読み直す」：保存したYouTubeレシピなら、いつでも読み直して編集画面で確かめられる。
let rereadingId = "";
function canRereadRecipe(recipe) {
  return !!API_BASE_URL && !!recipe && !!youtubeVideoId(recipe.videoUrl) && recipe.bulkImport?.privacyStatus !== "unlisted" && !!state.recipes.find((x) => x.id === recipe.id);
}
async function rereadRecipe(id) {
  if (rereadingId) return;
  const own = state.recipes.find((x) => x.id === id);
  if (!canRereadRecipe(own)) return;
  rereadingId = id; render();
  try {
    const result = await importRecipeFromYouTube(own.videoUrl, { mode: "video" });
    if (state.view !== "register" || state.editingRecipeId !== id) await handleAction({ currentTarget: { dataset: { action: "edit-recipe", recipe: id } } });
    applyImportedRecipe(result);
    state.draftExpanded = true;
    state.fetchStatus = result.analyzedFrom?.startsWith("video")
      ? `${result.cacheHit ? "動画から読み取った結果を表示しています。" : "動画から読み直しました。"}まだおかしい所は、このまま直して「更新する」を押してください。`
      : "動画からは作り方を読み取れませんでした（今日の回数は戻しました）。動画を見ながら、このまま直して「更新する」を押してください。";
    showToast("読み直しました。確かめて保存してください。");
  } catch (error) {
    if (isLimitError(error)) showLimitReached();
    else showToast(error.message || "読み直せませんでした。");
  } finally {
    rereadingId = "";
    saveState(); render();
    globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  }
}
// 献立から：作り方がない料理を、編集画面を開かずに動画でそろえる（直したい時はレシピを開いて編集）。
async function fillRecipeFromVideo(id) {
  if (rereadingId) return;
  const own = state.recipes.find((x) => x.id === id);
  if (!canRereadRecipe(own)) return;
  rereadingId = id; render();
  try {
    const result = await importRecipeFromYouTube(own.videoUrl, { mode: "video" });
    const steps = (result.steps || []).map((x) => String(x || "").trim()).filter(Boolean);
    // 埋め込み再生を許可していない動画の印は、作り方が読めたかどうかにかかわらず先に残す（YouTube で開く）。
    // 変わった時は更新日時も進める（同期は更新日時の新しいほうを使うので、進めないと別の端末に届かない）。
    if (result.embeddable === false && own.embeddable !== false) Object.assign(own, { embeddable: false, updatedAt: nowIso() });
    if (!steps.length) {
      // AI の上限・混雑・停止中で読めなかった時は、その理由を伝える（サーバーは説明欄の結果を 200 で返す）。
      const reason = result.analysis?.ok === false ? importReason(result.analysis.code) : null;
      showToast(reason?.short || "動画からも作り方を読み取れませんでした。レシピを開いて手で入れてください。");
      return;
    }
    const ingredients = normalizeImportedIngredients(result.ingredients);
    const planning = aiPlanning(result.planning, { ingredients: ingredients.length ? ingredients : own.ingredients, steps });
    Object.assign(own, {
      steps,
      stepTimes: stepTimesFor(steps, result.stepTimes),
      ingredients: own.ingredients?.length ? own.ingredients : ingredients,
      sourceServings: own.sourceServings ?? result.sourceServings ?? null,
      planning: own.planning?.conditionsConfirmed ? own.planning : planning || own.planning,
      updatedAt: nowIso(),
    });
    showToast(`「${own.title}」の作り方をそろえました。`);
  } catch (error) {
    if (isLimitError(error)) showLimitReached();
    else showToast(error.message || "読み取れませんでした。");
  } finally {
    rereadingId = "";
    saveState(); render();
  }
}
// ボタンに添える値札。開発モードでは使わない。
function canAnalyzeRecipe(recipe) {
  return !!API_BASE_URL && !!youtubeVideoId(recipe?.videoUrl) && recipe.bulkImport?.privacyStatus !== "unlisted" && !recipe.catalog && !recipe.planning?.ingredientsVerified;
}
async function analyzeCookingRecipe(date) {
  if (analyzingDate) return;
  const recipe = state.mealSlots?.[date]?.recipe || dailyPlan().find(d=>d.date===date)?.candidate?.recipe;
  if (!canAnalyzeRecipe(recipe)) return;
  const own = state.recipes.find(r=>r.id===recipe.id);
  if (!own) return;
  const before = JSON.stringify(own);
  const slotBefore = JSON.stringify(state.mealSlots?.[date]);
  analyzingDate = date; render();
  let applied = false;
  try {
    const result = await importRecipeFromYouTube(recipe.videoUrl);
    if (state.view !== "cooking" || cookingDate !== date) return;
    if (JSON.stringify(state.recipes.find(r=>r.id===recipe.id)) !== before || JSON.stringify(state.mealSlots?.[date]) !== slotBefore)
      throw new Error("解析中にレシピか献立が変更されたため、上書きせず停止しました。");
    if (!result.ingredients?.length) throw new Error("材料を取得できませんでした。レシピ画面で編集してください。");
    await handleAction({currentTarget:{dataset:{action:"edit-recipe",recipe:own.id}}});
    reviewReturnDate = date;
    // The saved recipe and confirmed slot remain untouched until user review.
    applyImportedRecipe(result);
    state.draftExpanded = true;
    applied = true;
    showToast("下書きを作りました。材料・手順・調理条件を確認して保存してください。");
  } catch (error) { showToast(error.message || "下書きを作れませんでした。"); }
  finally {
    analyzingDate = "";
    if (applied) { saveState(); render(); }
    else if (state.view === "cooking" && cookingDate === date) render();
  }
}

// Starter recipes are browsable and searchable from the Recipes tab, one tap to save.
function starterRecipeList() {
  if (!showStarters()) return [];
  const saved = new Set(state.recipes.map((r) => r.starterId).filter(Boolean));
  const query = (state.searchText || "").trim().toLowerCase();
  const hidden = starterHidden();
  const hp = hiddenParents();
  return [...rankByTaste(discoverRecipes()), ...Lifestyle.curated]
    .filter((r) => !saved.has(r.id) && !hidden.has(r.id) && !(hp.size && r.dish && hp.has(parentKeyOf(r))))
    // Browsing only needs the safety filter; tools are checked again before a dish is planned.
    .filter((r) => (r.discover ? discoverSafe(r) : Lifestyle.fit(r, dailyProfile(), today()).ok))
    // 親の料理名（dish）でも探せる（表記ゆれでまとめた子も「ほか◯つの作り方」から見られるように）。
    .filter((r) => !query || [r.title, r.dish || "", r.author || "", ...r.ingredients.map((i) => i.name), ...(r.planning?.tastes || [])].join(" ").toLowerCase().includes(query));
}

// ----- レシピの詳細（閲覧が基本。編集は「編集する」から） -----
let recipeDetailId = "";
let linkedRecipe = null;
function detailRecipe() {
  return (linkedRecipe?.id === recipeDetailId ? linkedRecipe : null) || recipeById(recipeDetailId) || findDiscover(recipeDetailId) || Lifestyle.curated.find((r) => r.id === recipeDetailId) || null;
}
function tagLabels(recipe) {
  const labels = new Map(Lifestyle.FACETS.flatMap((f) => f.options));
  return Lifestyle.tags(recipe).map((t) => labels.get(t)).filter(Boolean);
}
// 元レシピの人数が未確認なら、材料ごとではなく1か所だけ赤いバナーで知らせる。
// その場で数字をタップして決められる（2026-11-02：編集画面で決めても、作る画面の献立の写しには届かず、バナーが出続けていた）。
function servingsUnknownBanner(recipe, canEdit, date = "") {
  if (!recipe || recipe.sourceServings != null) return "";
  const pick = canEdit ? `<div class="servings-options" role="group" aria-label="元のレシピの人数">${[1, 2, 3, 4].map((k) => `<button type="button" class="choice-button" data-action="life-servings-set" data-recipe="${escapeAttr(recipe.id)}"${date ? ` data-date="${escapeAttr(date)}"` : ""} data-count="${k}">${k}人分</button>`).join("")}</div>` : "";
  return `<div class="servings-banner" role="note"><p><b>元のレシピが何人分か未確認です</b><br>分量は動画のまま。${dailyProfile().servings || getServingCount()}人分に合わせるには、${canEdit ? "動画の人数をタップしてください。" : "レシピを編集できる人に人数を決めてもらってください。"}</p>${pick}</div>`;
}
// 手で決めた人数は、そう書いておく。違っていたら、画面の上の「⚡️ 異議あり」で知らせられる（APP_MAP §52-11）。
function servingsManualNote(recipe) {
  if (!recipe || recipe.sourceServings == null || recipe.sourceServingsBy !== "manual") return "";
  return `<p class="servings-manual" role="note">✋ 元の人数は<b>手動で設定</b>（${recipe.sourceServings}人分）${tip("動画からは読み取れなかったので、この家庭で決めた人数です。違っていたら、画面の上の「⚡️ 異議あり」から知らせてください")}</p>`;
}
// レシピ全体への「⚡️ 異議あり」（construction2nd の問題の上のボタンをまねて、画面の上の段に置く）。動画のあるレシピだけ（運営が動画と見比べて直せるもの）。
function objectionButton(recipe, date = "") {
  if (!recipe || typeof youtubeVideoId !== "function" || !youtubeVideoId(recipe.videoUrl)) return "";
  return `<button type="button" class="objection-button" data-action="life-obj-open" data-recipe="${escapeAttr(recipe.id)}"${date ? ` data-date="${escapeAttr(date)}"` : ""} title="このレシピの間違い（人数・材料・作り方・時刻）を知らせる">⚡️ 異議あり</button>`;
}
// 元の人数を決める：保存したレシピと、同じレシピ（同じ動画）の献立の枠の写しの全部に入れる（作る画面・買い物リストは枠の写しを見る）。
// 返り値：変えた数。n が null なら「不明」に戻す。
function setRecipeServings(id, n, { date = "", by = "manual" } = {}) {
  const count = Number.isInteger(n) && n > 0 && n <= 100 ? n : null;
  const own = state.recipes.find((x) => x.id === id);
  const slotRecipe = date ? state.mealSlots?.[date]?.recipe : null;
  const base = own || slotRecipe || Object.values(state.mealSlots || {}).find((sl) => sl?.recipe?.id === id)?.recipe;
  if (!base) return 0;
  const vid = youtubeVideoId(base.videoUrl);
  // 保存したレシピは、押したレシピとその写しのもと（starterId）だけ。同じ動画でも、使う人が別に作ったレシピは変えない（Claude review #216）。
  const linked = (r) => r.id === id || (r.starterId && r.starterId === base.id) || (base.starterId && base.starterId === r.id);
  const owned = state.recipes.filter(linked);
  // 献立の枠は、そのレシピの写しか、同じ動画で別の保存したレシピの写しでないもの。
  const otherIds = new Set(state.recipes.filter((r) => !owned.includes(r)).map((r) => r.id));
  const slotOf = (r) => r && (linked(r) || (vid && youtubeVideoId(r.videoUrl) === vid && !otherIds.has(r.id)));
  const targets = [...owned.map((r) => ({ r, slot: null })),
    ...Object.values(state.mealSlots || {}).filter((sl) => slotOf(sl?.recipe) && !["cooked", "removed"].includes(sl.status)).map((sl) => ({ r: sl.recipe, slot: sl }))];
  if (slotRecipe && !targets.some((t) => t.r === slotRecipe)) targets.push({ r: slotRecipe, slot: state.mealSlots[date] });
  let changed = 0;
  for (const { r, slot } of targets) {
    if (r.sourceServings === count && (count == null || (r.sourceServingsBy || "") === (by || ""))) continue;
    r.sourceServings = count;
    if (count != null && by) r.sourceServingsBy = by; else delete r.sourceServingsBy;
    // 家族の端末にも届くよう、更新日時を進める（同期は新しいほうを使う）。
    if (slot) slot.updatedAt = nowIso(); else r.updatedAt = nowIso();
    changed++;
  }
  return changed;
}
function renderRecipeDetail() {
  const r = detailRecipe();
  if (r && linkedRecipe?.id !== r.id) ensureTimecodes(r);
  if (r && !r.curated) ensureLatest(r);
  if (!r) return `<section class="panel"><p>レシピが見つかりません。</p>${dailyButton("go-view", "レシピ一覧へ", 'data-view="collection"')}</section>`;
  const saved = !r.curated;
  const servings = dailyProfile().servings;
  const cook = cookSections(r, servings);
  const ratings = recipeRatings(r);
  const cycleLabel = (c) => CYCLE_CHOICES.find((x) => x.cycle === c)?.label || "";
  const meta = [r.planning?.minutes ? `⏱ ${r.planning.minutes}分` : "", r.planning?.equipment?.length ? r.planning.equipment.join("・") : "", r.author ? `@${r.author}` : "", saved ? r.source : "おすすめ"].filter(Boolean);
  const last = lastEatenLabel(r);
  const edit = !isViewer();
  // いつも使うのは「献立に入れる」「料理モード」「保存」だけ。動画・定番フォルダ・記録・編集・削除は ⋯ の中へ（2026-10-28 のユーザーの判断）。
  const fLine = edit ? renderFolderLine(r) : "";
  const more = edit ? `<details class="plan-more detail-more"><summary aria-label="${escapeAttr(r.title)}のメニュー">⋯</summary><div class="plan-more-menu">
      ${r.videoUrl ? `<a class="text-button" href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noreferrer">▶ 動画を開く</a>` : ""}
      ${fLine}
      ${saved ? `<button type="button" class="text-button" data-action="life-new-record" data-recipe="${escapeAttr(r.id)}">作った記録をつける</button><button type="button" class="text-button" data-action="edit-recipe" data-recipe="${escapeAttr(r.id)}">✏️ 編集する</button><button type="button" class="text-button danger" data-action="delete-recipe" data-recipe="${escapeAttr(r.id)}">このレシピを削除</button>` : ""}
    </div></details>` : "";
  const cookable = (r.steps || []).length > 0;
  const actions = edit
    ? `<button type="button" class="primary-button full-button detail-place" data-action="life-place-open" data-recipe="${escapeAttr(r.id)}">🗓 献立に入れる</button><div class="detail-actions">${cookable ? `<button type="button" class="secondary-button" data-cook-mode="open">🍳 料理モード</button>` : ""}${saved ? "" : dailyButton("life-save-starter", "🤍 保存", `data-recipe="${escapeAttr(r.id)}"`)}</div>`
    : `<div class="detail-actions">${requestButton(r)}${r.videoUrl ? `<a class="secondary-button link-button" href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noreferrer">▶ 動画を開く</a>` : ""}</div>`;
  const pLine = renderParentLine(r);
  // 今夜の4皿から開いた時：上は「‹ 4皿に戻る」、下に「✓ この料理にする／‹ 4皿に戻る」（新しく買う物も先に見せる）。
  const fromSwap = !!swapDate && swapDetailId === r.id;
  return `<section class="recipe-detail${fromSwap ? " is-from-swap" : ""}">
    <div class="detail-top">${fromSwap ? `<button type="button" class="text-button cooking-back" data-action="life-swap-back">‹ ${swapSize()}皿に戻る</button>` : `<button type="button" class="text-button cooking-back" data-action="life-recipe-back">‹ レシピ一覧</button>`}<div class="detail-top-end">${objectionButton(r)}${more}</div></div>
    ${renderCreatorCredit(r) || dishTile(r, "detail-photo")}
    <h2 class="detail-title">${escapeHtml(r.title)}</h2>
    <p class="detail-meta">${meta.map(escapeHtml).join(" · ")}</p>
    <div class="detail-tags">${tagLabels(r).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>
    ${renderSkillLine(r)}
    <p class="detail-history">${last === "はじめて" ? "まだ作っていません" : `前回：${escapeHtml(last)}`}${Object.keys(ratings).length ? ` · ${Object.entries(ratings).map(([n, c]) => `${escapeHtml(n)}：${escapeHtml(cycleLabel(c))}`).join(" / ")}` : ""}</p>
    ${fromSwap ? swapPickBar(r, swapCandidates().reuse) : actions}
    ${pLine && !fromSwap ? `<div class="dish-group-box">${pLine}</div>` : ""}
    ${edit && saved && canRereadRecipe(r) ? `<div class="reread-row${r.steps?.length ? "" : " is-empty"}">${r.steps?.length ? "" : "<p><b>作り方がまだありません</b>動画を見て読み取れます。</p>"}<button type="button" class="${r.steps?.length ? "text-button" : "primary-button"}" data-action="life-reread" data-recipe="${escapeAttr(r.id)}" ${rereadingId ? "disabled" : ""}>${rereadingId === r.id ? "動画を読んでいます…（最大2分）" : r.steps?.length ? "🎬 作り方がおかしい？動画から読み直す" : "🎬 動画から読み取る"}</button></div>` : ""}
    ${renderSourceNote(r, saved && edit)}
    ${saved ? renderSourceReload(r, edit) : ""}
    ${servingsUnknownBanner(r, saved && edit)}
    ${servingsManualNote(r)}
    <h3 class="detail-h">材料 <small>${r.sourceServings == null ? "動画の分量のまま" : `${servings}人分`}</small></h3>
    ${cook.ingredients}
    ${cook.steps}
    ${r.note ? `<p class="detail-note">📝 ${escapeHtml(r.note)}</p>` : ""}
    <div class="yohaku-corner">${yohaku("wave")}</div>
    ${renderPlaceSheet(r)}
  </section>`;
}
// 運営が作り方を直した時の知らせ（APP_MAP §52-9）：入れ替えた時は7日だけ小さく。使う人が直していた時は「新しい作り方にする」。
// 「🔄 最新の作り方を読み込む」（自動の判断が外れても、押せば確実に最新にする。2026-11-01）。動画のあるレシピだけ・閲覧者は出さない。
let sourceReloading = false;
function renderSourceReload(r, canEdit, date = "") {
  if (!r || !canEdit || !videoOfRecipe(r) || !API_BASE_URL) return "";
  return `<p class="source-reload"><button type="button" class="text-button" data-action="life-source-reload" data-recipe="${escapeAttr(r.id)}"${date ? ` data-date="${escapeAttr(date)}"` : ""} ${sourceReloading ? "disabled" : ""}>${sourceReloading ? "読み込んでいます…" : "🔄 最新の作り方を読み込む"}</button></p>`;
}
// date：作る画面（献立の枠の写し）から出す時の、その日。
function renderSourceNote(r, canEdit, date = "") {
  if (!r) return "";
  // 目印のないレシピ（自分で書いた・目印が外れた）は、運営が直したとは言えないので「サーバーに新しい作り方があります」（Claude review #215）。
  if (r.sourcePending && canEdit) return `<div class="source-note" role="note"><p>📝 ${sourceKind(r) ? "運営が作り方を直しました" : "この動画の新しい作り方があります"}（手順 ${(r.steps || []).length} → ${(r.sourcePending.steps || []).length}${r.sourcePending.sourceServings != null && r.sourcePending.sourceServings !== r.sourceServings ? `・元の人数 → ${r.sourcePending.sourceServings}人分` : ""}）。${r.sourcePending.planned ? "材料が変わるので、決めた献立と買い物リストに合わせて、自動では入れ替えていません。" : r.sourcePrint && sourcePrint(r) !== r.sourcePrint ? "いまの作り方は、あなたが直したものなので、そのままにしています。" : "いまの作り方のままにしています。新しい作り方にするか選べます。"}</p><button type="button" class="secondary-button" data-action="life-source-apply" data-recipe="${escapeAttr(r.id)}"${date ? ` data-date="${escapeAttr(date)}"` : ""}>新しい作り方にする</button><button type="button" class="text-button" data-action="life-source-keep" data-recipe="${escapeAttr(r.id)}"${date ? ` data-date="${escapeAttr(date)}"` : ""}>このままにする</button></div>`;
  const at = Date.parse(r.sourceUpdatedAt || "");
  if (Number.isFinite(at) && Date.now() - at < 7 * 86_400_000) return `<p class="source-note muted small" role="note">📝 作り方が新しくなりました（${escapeHtml(formatDate(new Date(at).toISOString().slice(0, 10)))}）</p>`;
  return "";
}
// ----- 🗓 献立に入れる（レシピの画面から・2026-10-28 のユーザーの判断） -----
// これからの献立の日（作らない日・作った日・始まる前の日は除く）を並べ、選んだ日の料理と入れかえる。決めた日は決めた料理のまま入れかえる。
let placeRecipeId = "";
function placeDays() {
  return dailyPlan().filter((d) => d.date >= today() && !d.off && !d.prestart && !(d.slot && ["cooked", "off"].includes(d.slot.status)));
}
const sameRecipe = (a, b) => !!a && !!b && (a.id === b.id || (!!a.starterId && a.starterId === b.id) || (!!b.starterId && b.starterId === a.id));
function renderPlaceSheet(r) {
  if (!r || placeRecipeId !== r.id || isViewer()) return "";
  const p = dailyProfile();
  const rows = placeDays().map((d) => {
    const cur = d.slot?.recipe || d.candidate?.recipe;
    const fit = Lifestyle.fit(r, p, d.date);
    const decided = d.slot?.status === "confirmed";
    const day = `${d.date === today() ? "今夜 " : ""}${formatDate(d.date)}（${"日月火水木金土"[new Date(`${d.date}T12:00:00`).getDay()]}）`;
    if (sameRecipe(cur, r)) return `<div class="place-day is-same"><span>${escapeHtml(day)}<small>この料理です</small></span></div>`;
    // 決めた日の、もう買った材料のうち、この料理では使わないもの（入れかえたあと、買い物タブでも知らせる）。
    const unused = decided ? swapBoughtItems(d.date).filter((x) => !usesNames(r, [x]).length) : [];
    const now = cur ? `いまの予定：${cur.title}（${decided ? "決定済み" : "候補"}）` : "まだ決まっていない";
    if (!fit.ok) return `<div class="place-day is-off"><span>${escapeHtml(day)}<small>${escapeHtml(fit.reason || "この日の条件に合いません")}</small></span></div>`;
    return `<button type="button" class="place-day" data-action="life-place" data-recipe="${escapeAttr(r.id)}" data-date="${d.date}"><span>${escapeHtml(day)}<small>${escapeHtml(now)}</small>${unused.length ? `<small class="place-unused">🧺 買った${escapeHtml(namesOf(unused))}は、この料理では使いません</small>` : ""}</span><b>${cur ? "入れかえ" : "入れる"}</b></button>`;
  }).join("");
  return `<div class="place-sheet" role="dialog" aria-modal="true" aria-labelledby="place-title"><button type="button" class="place-dim" data-action="life-place-close" aria-label="閉じる"></button><div class="place-card">
    <h3 id="place-title">「${escapeHtml(r.title)}」を、いつ？</h3>
    ${rows ? `<p class="muted small">選んだ日の料理と入れかわります</p><div class="place-days">${rows}</div>` : `<p class="small">これからの献立がまだありません。献立タブで献立を作ると、ここから入れられます。</p>`}
    <button type="button" class="text-button full-button" data-action="life-place-close">閉じる</button>
  </div></div>`;
}
function placeFromRecipe(id, date) {
  const r = detailRecipe();
  if (!r || r.id !== id || !placeDays().some((d) => d.date === date) || !Lifestyle.fit(r, dailyProfile(), date).ok) return false;
  // 献立の候補にない料理（おすすめを隠している時など）は、自分のレシピに保存してから入れる。
  const inPlan = allDinnerRecipes().some((x) => x.id === r.id);
  const recipe = inPlan ? r : r.curated ? saveOwnRecipe(r) : null;
  if (!recipe) { showToast("夜ごはんのレシピだけ、献立に入れられます"); return false; }
  const before = dailyShopping();
  if (state.mealSlots[date]?.status === "confirmed") confirmDaily({ date }, recipe);
  else state.planOverrides[date] = recipe.id;
  changedShopping(before);
  trackDaily("plan_placed_from_recipe");
  showToast(`${date === today() ? "今夜" : formatDate(date)}に「${recipe.title}」を入れました`);
  if (recipe !== r && state.view === "recipe") recipeDetailId = recipe.id;
  return true;
}

// ----- 最初から入っているおすすめレシピの表示 ON/OFF（家庭で共有） -----
const STARTER_HIDE_HINT = 15;
function showStarters() {
  return state.starterPref?.show !== false;
}
function normalizeStarterPref(raw) {
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter((id) => typeof id === "string" && id.length < 80))] : [];
  // 親（料理名）ごと「もう出さない」（APP_MAP §48）。
  const hiddenDishes = Array.isArray(raw?.hiddenDishes) ? [...new Set(raw.hiddenDishes.filter((k) => typeof k === "string" && k.length < 60))].slice(0, 200) : [];
  return { show: raw?.show !== false, asked: !!raw?.asked, hidden, hiddenDishes, updatedAt: normalizeTimestamp(raw?.updatedAt) };
}
// 一覧から選んで「非表示」にしたおすすめ。一覧にも献立にも出さない（設定で戻せる）。
const starterHidden = () => new Set(state.starterPref?.hidden || []);
function ownDinnerCount() {
  return state.recipes.filter((r) => r.mealType === "dinner").length;
}
function renderStarterHint() {
  if (isViewer() || !showStarters() || state.starterPref?.asked || ownDinnerCount() < STARTER_HIDE_HINT) return "";
  return `<section class="starter-hint"><p><b>自分のレシピが${ownDinnerCount()}品になりました！</b><br><small>おすすめ（最初から入っている料理）を隠して、自分のレシピだけで献立を作りますか？ 設定からいつでも戻せます。</small></p><div class="actions">${dailyButton("life-starters", "おすすめを隠す", 'data-show="false"', true)}${dailyButton("life-starters-keep", "このまま")}</div></section>`;
}
function renderStarterSettings() {
  if (isViewer()) return "";
  const n = ownDinnerCount();
  return `<section class="panel starter-settings"><h3>🍳 おすすめレシピ</h3>
    <button type="button" class="role-toggle" data-action="life-starters" data-show="${!showStarters()}" aria-pressed="${showStarters()}"><span>最初から入っている料理を使う<small>${showStarters() ? "レシピ一覧と献立に、おすすめも出します" : "自分のレシピだけで献立を作ります"}</small></span><i aria-hidden="true"></i></button>
    <button type="button" class="role-toggle" data-action="life-share-stats" aria-pressed="${shareStatsOn()}"><span>みんなの定番づくりに協力する<small>献立に入れた・作ったYouTubeレシピを、名前を伏せて数えます。写真・メモ・手入力のレシピは送りません。</small></span><i aria-hidden="true"></i></button>
    ${state.starterPref?.hidden?.length || state.starterPref?.hiddenDishes?.length ? `<p class="small starter-hidden">非表示にしたおすすめ <b>${state.starterPref.hidden?.length || 0}品</b>${state.starterPref.hiddenDishes?.length ? `・出さない料理名 <b>${state.starterPref.hiddenDishes.length}</b>` : ""} <button type="button" class="text-button" data-action="life-starters-unhide">すべて戻す</button></p>` : ""}
    ${(() => { const less = Object.entries(state.passMemo?.asked || {}).filter(([, a]) => a.answer === "less").map(([k]) => SWAP_FEATURE_LABEL[k]).filter(Boolean); return less.length ? `<p class="small starter-hidden">🙅 少なめにしている：<b>${escapeHtml(less.join("・"))}</b> <button type="button" class="text-button" data-action="life-pass-unless">元に戻す</button></p>` : ""; })()}
    ${!showStarters() && n < 6 ? `<p class="notice">自分の夜ごはんのレシピが${n}品です。少ないと、献立が組めない日があります。</p>` : ""}</section>`;
}

// 必要なスキル（★1〜5）と技法。skills.js の内部DBから。
function renderSkillLine(recipe) {
  const x = Skills.rate(recipe);
  const shown = x.skills.filter((id) => (Skills.SKILLS.find((s) => s.id === id)?.level || 1) >= 2).slice(0, 4);
  return `<div class="detail-skill"><span class="skill-stars" aria-label="必要なスキル ${x.level}（5段階）">${Skills.stars(x.level)}</span><b>${x.label}</b>${shown.length ? `<small>${shown.map((id) => escapeHtml(Skills.skillLabel(id))).join("・")}</small>` : ""}</div>`;
}

// 初回設定のあとに一度だけ：「最初の献立ができました」
let firstPlanReveal = false;
function renderFirstPlanReveal() {
  if (!firstPlanReveal || isViewer()) return "";
  const sp = skillProfile();
  const b = rhythmOn() ? currentBlocks()[0] : null;
  const why = [sp ? `★${sp.level}までの料理` : "", dailyProfile().weekdayMinutes ? `${dailyProfile().weekdayMinutes}分以内` : "", "かぶらない組み合わせ"].filter(Boolean).join("・");
  const invite = dailyProfile().servings >= 2 && shareAvailable() && !syncEnabled();
  return `<section class="first-reveal"><p class="first-reveal-emoji" aria-hidden="true">🎉</p><h2>最初の献立が<br><span class="marker nobr">できました！</span></h2>
    <p>${b ? `${blockRange(b)}の分を、` : ""}${escapeHtml(why)}で選びました。気になる日は「入れ替え」でどうぞ。</p>
    ${invite ? `<div class="first-invite"><p><b>ふたりで使う？</b><br><small>相手が「これ食べたい」を送れるようになります。</small></p><div class="actions">${dailyButton("life-share-open", "相手を招待する")}<button type="button" class="text-button" data-action="life-reveal-close">あとで</button></div></div>` : `<button type="button" class="text-button" data-action="life-reveal-close">閉じる</button>`}</section>`;
}

// ----- 🃏 カフェ風レシピカード＆3日分の献立トレイ -----
let trayOpen = false;
let trayActiveDate = "";
let trayMood = "";
let trayPage = 0;
let trayAnchorId = "";
let trayFlipId = "";
let trayClearedDates = new Set();
let trayDraft = {};
let trayInitialDraft = {};
let trayBasePlan = {};
let trayTargetDates = [];
let trayUndoStack = [];
// 開いた直後の「よはくが考えている」演出（1.5秒）と、そのあとの「考えてみたよ！」
let trayThinking = false;
let trayThinkToken = 0;
let trayRevealFresh = false;
let trayThoughtKeys = new Set();
let trayActiveChosen = false; // 「🔄 選び直す」で日を選んだ時だけ、その日を目立たせる（空の日はいつも目立たせる）
let trayLastPlaced = null; // 直前に置いた料理（よはくが「◯曜は『◯◯』にしたよ」と言う）
let cardGetRecipeId = "";
let cardGetBannerRecipeId = "";
let cardBookOpen = false;
let lastModalTriggerSelector = "";
let trayTriggerSelector = "";
let flipTriggerSelector = "";

const MAX_CARD_CACHE = 600;
const CARD_COOK_MEMO = new Map();
const CARD_ART_MEMO = new Map();
const NUTRITION_MEMO = new Map();
const CARD_SPEC_MEMO = new Map();
const TRAY_CANDIDATE_BASE_MEMO = new Map();

function setBoundedMemo(map, key, val) {
  if (map.size >= MAX_CARD_CACHE && !map.has(key)) {
    const oldestKey = map.keys().next().value;
    if (oldestKey !== undefined) map.delete(oldestKey);
  }
  map.set(key, val);
  return val;
}

function clearCardTrayCaches() {
  CARD_COOK_MEMO.clear();
  CARD_ART_MEMO.clear();
  NUTRITION_MEMO.clear();
  CARD_SPEC_MEMO.clear();
  TRAY_CANDIDATE_BASE_MEMO.clear();
}

function evalsSignature() {
  const evals = state?.evaluations || [];
  if (!evals.length) return "0";
  return evals
    .map((e) => {
      if (!e) return "";
      const cycles = e.familyRepeatCycles && typeof e.familyRepeatCycles === "object"
        ? Object.entries(e.familyRepeatCycles).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(",")
        : "";
      return `${e.id || ""}:${e.recipeId || ""}:${e.cookedAt || ""}:${e.updatedAt || ""}:${cycles}`;
    })
    .join(";");
}

function recipeRevisionKey(recipe) {
  if (!recipe) return "";
  const ings = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((i) => `${i?.name || ""}=${i?.amount || ""}`).join(";")
    : "";
  return [
    recipe.id || "",
    recipe.starterId || "",
    recipe.title || "",
    recipe.updatedAt || "",
    recipe.sourceRevision || recipe.catalog?.revision || "",
    recipe.sourceServings ?? "null",
    recipe.planning?.minutes || "",
    recipe.photo || "",
    recipe.thumbnailUrl || "",
    ings,
  ].join("|");
}

function resetCardTrayModals() {
  // タブを切り替えたら、裏面などの重なった画面は閉じる。選び直しの途中（下書き）は残す（献立タブに戻れば続きから）
  trayOpen = false;
  if (!isTrayDraftActive()) {
    trayDraft = {};
    trayInitialDraft = {};
    trayBasePlan = {};
    trayTargetDates = [];
    trayUndoStack = [];
    trayClearedDates = new Set();
  }
  trayThinking = false;
  trayThinkToken += 1;
  trayAnchorId = "";
  trayFlipId = "";
  cardBookOpen = false;
  cardGetRecipeId = "";
  cardGetBannerRecipeId = "";
  document.body?.classList?.remove("has-sheet");
}

function isTrayDraftActive() {
  return Object.keys(trayDraft).some((date) => (trayDraft[date] || null) !== (trayInitialDraft[date] || null));
}

function syncTrayAfterConflictResolution(date, chosen) {
  if (!date) return;
  if (Object.prototype.hasOwnProperty.call(trayBasePlan, date)) {
    const snap = typeof planSnapshot === "function" ? planSnapshot(state)?.[date] : null;
    trayBasePlan[date] = snap ? clone(snap) : chosen ? clone(chosen) : null;
  }
  const chosenId = chosen?.slot?.recipe?.id || chosen?.override || chosen?.draft?.id || null;
  if (Object.prototype.hasOwnProperty.call(trayInitialDraft, date)) {
    trayInitialDraft[date] = chosenId;
  }
  if (Object.prototype.hasOwnProperty.call(trayDraft, date)) {
    trayDraft[date] = chosenId;
    syncTrayClearedSet();
  }
}

// 試作版の「✨ 作ってカードGET！を試す」で入った demo-get-* 記録だけを安全に整理する（本物の調理記録や保存レシピは消さない）
function cleanDemoGetRecords(stateObj = state) {
  if (!stateObj || !Array.isArray(stateObj.evaluations)) return { removedCount: 0, removedIds: [] };
  const removedIds = [];
  const deletedAt = typeof nowIso === "function" ? nowIso() : new Date().toISOString();
  stateObj.evaluations = stateObj.evaluations.filter((e) => {
    const id = String(e?.id || "");
    if (id.startsWith("demo-get-")) {
      removedIds.push(id);
      if (stateObj.tombstones?.evaluations && typeof stateObj.tombstones.evaluations === "object") {
        stateObj.tombstones.evaluations[id] = deletedAt;
      }
      return false;
    }
    return true;
  });
  if (removedIds.length) clearCardTrayCaches();
  return { removedCount: removedIds.length, removedIds };
}

// 作った回数（保存コピー・元の初期レシピ・同じ親料理の合算も見る。demo-get-* は除外）
function cardCookCount(recipe) {
  if (!recipe) return 0;
  const sig = `${recipe.id || ""}|${recipe.starterId || ""}|${recipe.title || ""}|${evalsSignature()}`;
  if (CARD_COOK_MEMO.has(sig)) return CARD_COOK_MEMO.get(sig);
  const evals = state?.evaluations || [];
  const pk = typeof parentKeyOf === "function" ? parentKeyOf(recipe) : "";
  const count = evals.filter((e) => {
    if (!e || String(e.id || "").startsWith("demo-get-")) return false;
    if (e.recipeId === recipe.id || (recipe.starterId && e.recipeId === recipe.starterId)) return true;
    const target = recipeById(e.recipeId);
    if (target && (target.starterId === recipe.id || (pk && typeof parentKeyOf === "function" && parentKeyOf(target) === pk))) return true;
    if (pk && e.recipeTitle && e.recipeTitle === recipe.title) return true;
    return false;
  }).length;
  return setBoundedMemo(CARD_COOK_MEMO, sig, count);
}

// 親料理（parentDish）ごとの基本イラスト対応表。
// 主材料や見た目が大きく異なる子レシピ（例：麻婆なす vs 麻婆豆腐、塩焼きそば vs ソース焼きそば）には別料理の絵を流用しない。
const APPROVED_PARENT_ILLUSTRATION_RULES = {
  shogayaki: { url: "assets/dish-picks/shogayaki.webp", excludeRe: /鶏|牛|鮭|さば|サバ|豆腐|なす/ },
  karaage: { url: "assets/dish-picks/karaage.webp", excludeRe: /豚|魚|さば|サバ|鮭|たこ|いか|ごぼう|れんこん/ },
  hamburg: { url: "assets/dish-picks/hamburg.webp", excludeRe: /魚|いわし|サバ|ロールキャベツ/ },
  nikujaga: { url: "assets/dish-picks/nikujaga.webp", excludeRe: /カレー|塩|キムチ|トマト/ },
  reishabu: { url: "assets/dish-picks/reishabu.webp", excludeRe: /ぶり|鯛|鶏|牛/ },
  hoikoro: { url: "assets/dish-picks/hoikoro.webp", excludeRe: /鶏|牛|魚|厚揚げのみ/ },
  mabo: { url: "assets/dish-picks/mabo.webp", excludeRe: /なす|茄子|春雨|はるさめ|もやし|大根|白菜/ },
  mapotofu: { url: "assets/dish-picks/mabo.webp", excludeRe: /なす|茄子|春雨|はるさめ|もやし|大根|白菜/ },
  omurice: { url: "assets/dish-picks/omurice.webp", excludeRe: /そば|うどん|パスタ|ホワイト/ },
  salmonfoil: { url: "assets/dish-picks/salmonfoil.webp", excludeRe: /たら|タラ|さば|サバ|鶏|豚|フライ/ },
  sabamiso: { url: "assets/dish-picks/sabamiso.webp", excludeRe: /竜田|塩焼き|カレー|トマト|南蛮/ },
  meuniere: { url: "assets/dish-picks/meuniere.webp", excludeRe: /鶏|豚|ホイル|煮付け/ },
  happosai: { url: "assets/dish-picks/happosai.webp", excludeRe: /麻婆|あんかけ焼きそば|麺/ },
};

// 正直な画像解決：
// 1. その料理自身の承認済みイラスト → 2. 親料理の承認済み基本イラスト（見た目・主材料が一致する時のみ）
// → 3. その料理自身の動画サムネイル・完成写真 → 4. 未整備プレースホルダ（別料理のイラストは絶対に流用しない）
function cardImageInfo(recipe) {
  const placeholder = {
    url: "assets/dishes/photo-unavailable-pot.webp",
    src: "assets/dishes/photo-unavailable-pot.webp",
    kind: "placeholder",
    label: "イメージ",
  };
  if (!recipe) return placeholder;
  const key = `${recipe.id || ""}|${recipe.starterId || ""}|${recipe.title || ""}|${recipe.photo || ""}|${recipe.thumbnailUrl || ""}|${recipe.imageUrl || ""}|${recipe.illustration?.url || ""}`;
  if (CARD_ART_MEMO.has(key)) return CARD_ART_MEMO.get(key);
  const pick = (info) => setBoundedMemo(CARD_ART_MEMO, key, { ...info, src: info.url });

  // 1. レシピに直接指定された承認済みイラスト
  if (recipe.illustration?.approved && recipe.illustration?.url) {
    return pick({ url: String(recipe.illustration.url), kind: "illustration", label: "イラスト" });
  }
  const ownPhoto = String(recipe.photo || "");
  if (/^assets\/(dishes|dish-picks)\//.test(ownPhoto) && !/photo-unavailable|fallback-/.test(ownPhoto)) {
    return pick({ url: ownPhoto, kind: "illustration", label: "イラスト" });
  }
  const starterPhoto = typeof STARTER_PHOTOS !== "undefined" ? (STARTER_PHOTOS[recipe.id] || STARTER_PHOTOS[recipe.starterId] || "") : "";
  if (starterPhoto && /^assets\/(dishes|dish-picks)\//.test(starterPhoto) && !/photo-unavailable|fallback-/.test(starterPhoto)) {
    return pick({ url: starterPhoto, kind: "illustration", label: "イラスト" });
  }
  if (recipe.starterId) {
    const st = (Lifestyle.curated || []).find((x) => x.id === recipe.starterId);
    if (st?.photo && /^assets\/(dishes|dish-picks)\//.test(st.photo) && !/photo-unavailable|fallback-/.test(st.photo)) {
      return pick({ url: st.photo, kind: "illustration", label: "イラスト" });
    }
  }
  if (/^starter-\d+$/.test(String(recipe.id || ""))) {
    const st = (Lifestyle.curated || []).find((x) => x.id === recipe.id);
    if (st?.photo && /^assets\/(dishes|dish-picks)\//.test(st.photo) && !/photo-unavailable|fallback-/.test(st.photo)) {
      return pick({ url: st.photo, kind: "illustration", label: "イラスト" });
    }
  }

  // 2. 親料理（parentDish）の基本イラスト（主材料や見た目が大きく異なる子レシピは除外）
  const ideal = typeof FoodTaste?.dishOf === "function" ? FoodTaste.dishOf(recipe) : null;
  if (ideal?.id && APPROVED_PARENT_ILLUSTRATION_RULES[ideal.id]) {
    const rule = APPROVED_PARENT_ILLUSTRATION_RULES[ideal.id];
    const text = `${recipe.title || ""} ${recipe.dish || ""}`;
    if (!rule.excludeRe || !rule.excludeRe.test(text)) {
      return pick({ url: rule.url, kind: "illustration", label: "イラスト", parentDishId: ideal.id });
    }
  }

  // 3. レシピ自身の動画サムネイルまたは完成写真
  const realThumb = (typeof recipeThumbnail === "function" ? recipeThumbnail(recipe) : "") || String(recipe.imageUrl || "");
  if (realThumb && !/^assets\/(dishes|dish-picks)\//.test(realThumb)) {
    return pick({ url: realThumb, kind: "photo", label: "" });
  }
  if (ownPhoto && !/^assets\//.test(ownPhoto)) {
    return pick({ url: ownPhoto, kind: "photo", label: "" });
  }

  // 4. 画像未整備の料理：別料理の絵は使わず、正直なプレースホルダを返す
  return pick(placeholder);
}

function cardArtOf(recipe) {
  return cardImageInfo(recipe).url;
}

// ----- 第2段階：検証可能な栄養・塩分推定エンジン（スマホ内計算・誤マッチ防止・根拠と不確実性の明示） -----
const NUTRITION_FOOD_DB_SOURCE = "日本食品標準成分表（八訂）増補2023年を参考にしたアプリ内換算表";
const NUTRITION_CALC_VERSION = "2026.11-v3";

const SEASONING_SALT_RULES = [
  { re: /減塩しょうゆ|減塩醤油/, label: "減塩しょうゆ", foodId: "low_salt_soy_sauce", tbspSalt: 1.3, tspSalt: 0.43, gramSalt: 0.072, kcalPerGram: 0.7 },
  { re: /薄口しょうゆ|うすくち醤油|薄口醤油/, label: "薄口しょうゆ", foodId: "light_soy_sauce", tbspSalt: 2.9, tspSalt: 0.97, gramSalt: 0.16, kcalPerGram: 0.6 },
  { re: /しょうゆ|醤油/, label: "しょうゆ", foodId: "soy_sauce", tbspSalt: 2.6, tspSalt: 0.87, gramSalt: 0.145, kcalPerGram: 0.75 },
  { re: /みそ|味噌/, label: "みそ", foodId: "miso", tbspSalt: 2.2, tspSalt: 0.73, gramSalt: 0.124, kcalPerGram: 1.9 },
  { re: /白だし/, label: "白だし", foodId: "shirodashi", tbspSalt: 2.2, tspSalt: 0.73, gramSalt: 0.12, kcalPerGram: 0.4 },
  { re: /めんつゆ/, label: "めんつゆ", foodId: "mentsuyu", tbspSalt: 1.6, tspSalt: 0.53, gramSalt: 0.09, kcalPerGram: 0.6 },
  { re: /ぽん酢|ポン酢|味ぽん|味ポン/, label: "ポン酢", foodId: "ponzu", tbspSalt: 1.5, tspSalt: 0.5, gramSalt: 0.083, kcalPerGram: 0.6 },
  { re: /オイスターソース/, label: "オイスターソース", foodId: "oyster_sauce", tbspSalt: 2.1, tspSalt: 0.7, gramSalt: 0.115, kcalPerGram: 1.1 },
  { re: /焼肉のたれ|焼き肉のたれ|焼肉のタレ/, label: "焼肉のたれ", foodId: "yakiniku_sauce", tbspSalt: 1.3, tspSalt: 0.43, gramSalt: 0.072, kcalPerGram: 1.6 },
  { re: /ウスターソース|中濃ソース|とんかつソース|^ソース$/, label: "ソース", foodId: "worcester_sauce", tbspSalt: 1.4, tspSalt: 0.47, gramSalt: 0.08, kcalPerGram: 1.3 },
  { re: /ケチャップ/, label: "ケチャップ", foodId: "ketchup", tbspSalt: 0.5, tspSalt: 0.17, gramSalt: 0.033, kcalPerGram: 1.2 },
  { re: /豆板醤|コチュジャン|甜麺醤/, label: "中華醤", foodId: "chili_bean_paste", tbspSalt: 2.4, tspSalt: 0.8, gramSalt: 0.13, kcalPerGram: 1.8 },
  { re: /鶏ガラスープ|鶏がらスープ|中華だし|中華スープ|コンソメ|和風だし|だしの素|ほんだし|顆粒だし|ウェイパー|創味シャンタン|ブイヨン/, label: "だし・スープの素", foodId: "bouillon_granule", isStockRule: true, tbspSalt: 3.8, tspSalt: 1.25, gramSalt: 0.42, kcalPerGram: 2.2 },
  { re: /カレールウ|カレールー|シチュールウ|シチュールー/, label: "ルウ", foodId: "curry_roux", tbspSalt: 2.1, tspSalt: 0.7, gramSalt: 0.105, kcalPerGram: 5.1 },
  { re: /マヨネーズ/, label: "マヨネーズ", foodId: "mayonnaise", tbspSalt: 0.27, tspSalt: 0.09, gramSalt: 0.019, kcalPerGram: 6.7 },
  { re: /有塩バター|^(?!.*無塩).*バター$/, label: "有塩バター", foodId: "butter", tbspSalt: 0.2, tspSalt: 0.07, gramSalt: 0.015, kcalPerGram: 7.5 },
  { re: /塩麹|塩こうじ/, label: "塩麹", foodId: "shio_koji", tbspSalt: 2.0, tspSalt: 0.67, gramSalt: 0.11, kcalPerGram: 1.5 },
  { re: /^塩$|塩こしょう|塩コショウ|食塩|粗塩|ハーブソルト/, label: "塩", foodId: "salt", tbspSalt: 18.0, tspSalt: 6.0, gramSalt: 0.99, kcalPerGram: 0 },
];

function parseSimpleNumberToken(tok) {
  const s = String(tok || "").trim();
  if (!s) return null;
  const mixed = s.match(/^(\d+)\s*と\s*(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den <= 0) return { val: 0, invalid: true };
    return { val: Number(mixed[1]) + Number(mixed[2]) / den, invalid: false };
  }
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const den = Number(frac[2]);
    if (den <= 0) return { val: 0, invalid: true };
    return { val: Number(frac[1]) / den, invalid: false };
  }
  const dec = s.match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (dec) {
    const v = Number(dec[1]);
    if (!Number.isFinite(v) || v <= 0) return { val: 0, invalid: true };
    return { val: v, invalid: false };
  }
  return null;
}

function parseAmountQuantity(rawAmount) {
  const s = String(rawAmount || "")
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/／/g, "/")
    .replace(/．/g, ".")
    .replace(/−|ー|―/g, "-")
    .replace(/½/g, "1/2")
    .replace(/⅓/g, "1/3")
    .replace(/⅔/g, "2/3")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .trim();
  if (!s) return { unit: "unknown", val: 0, qty: null, ambiguous: true, invalid: false };

  // かっこ内の表記（例：「1/2袋（100g）」「1袋（0.5kg）」「1袋（100 〜 150g）」「1/2袋（市販品）」）をチェック
  const parenBlock = s.match(/[（(]\s*([^）)]+?)\s*[)）]/);
  if (parenBlock) {
    const pContent = parenBlock[1].trim();
    // 単位（kg, g, ml, cc 等）を末尾に持つ数量表記かを判定
    const pUnitMatch = pContent.match(/^(?:約\s*)?(.*?)\s*(kg|グラム|g|ミリリットル|ml|cc)$/i);
    if (pUnitMatch) {
      const numStr = pUnitMatch[1].trim();
      const rawUnit = pUnitMatch[2].toLowerCase();

      let pVal = null;
      let isRange = false;
      let rangeBounds = null;
      const rangeM = numStr.match(/^(.*?)\s*[〜~\-]\s*(.*)$/);
      if (rangeM) {
        const leftTok = parseSimpleNumberToken(rangeM[1]);
        const rightTok = parseSimpleNumberToken(rangeM[2]);
        if (!leftTok || !rightTok || leftTok.invalid || rightTok.invalid || rightTok.val < leftTok.val || leftTok.val <= 0) {
          return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
        }
        pVal = (leftTok.val + rightTok.val) / 2;
        isRange = true;
        rangeBounds = [leftTok.val, rightTok.val];
      } else {
        const tok = parseSimpleNumberToken(numStr);
        if (!tok || tok.invalid || tok.val <= 0) {
          return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
        }
        pVal = tok.val;
      }

      let pUnit = "g";
      let factor = 1;
      if (/kg/i.test(rawUnit)) { factor = 1000; pUnit = "g"; }
      else if (/g|グラム/i.test(rawUnit)) { pUnit = "g"; }
      else if (/ml|cc|ミリリットル/i.test(rawUnit)) { pUnit = "ml"; }

      const finalVal = pVal * factor;
      return {
        unit: pUnit,
        val: finalVal,
        qty: finalVal,
        ambiguous: isRange,
        invalid: false,
        ...(rangeBounds ? { range: [rangeBounds[0] * factor, rangeBounds[1] * factor], assumption: `範囲表記（${rangeBounds[0] * factor}〜${rangeBounds[1] * factor}）の中央値で換算` } : {}),
      };
    }
  }

  // かっこ内に数量表記がない場合（例：「1/2袋（市販品）」）はかっこを除去して外側の単位・分量を判定する
  const cleanS = s.replace(/[（(][^）)]*[)）]/g, " ").trim();
  const targetS = cleanS || s;

  if (/少々|ひとつまみ/.test(targetS)) {
    const isPinch = /ひとつまみ/.test(targetS);
    const v = isPinch ? 0.8 : 0.45;
    return {
      unit: "pinch",
      val: v,
      qty: v,
      ambiguous: true,
      invalid: false,
      assumption: isPinch ? "ひとつまみ＝約0.8gで換算" : "少々＝約0.45gで換算",
    };
  }
  if (/適量|お好み|適宜/.test(targetS)) {
    return { unit: "some", val: 0, qty: null, ambiguous: true, invalid: false, assumption: "適量・お好み（数値換算から除外）" };
  }
  if (/^半分$|^半(個|玉|丁|袋|束|本|枚|切れ)$/.test(targetS)) {
    return { unit: /g|グラム/i.test(targetS) ? "g" : "piece", val: 0.5, qty: 0.5, ambiguous: false, invalid: false };
  }

  // 負数・ゼロ・分母ゼロの明示的検出（1へフォールバックしない）
  if (/(?:^|[^\d])-\d+/.test(targetS) || /\d+\s*\/\s*0(?!\d)/.test(targetS) || /(?:^|[^\d/.])0(?:\.0+)?(?:\s*(?:g|kg|ml|cc|個|玉|本|枚|袋|丁|パック|大さじ|小さじ)|$)/i.test(targetS)) {
    return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
  }

  // 範囲表記（例：1〜2個、100~150g、1/2〜1個）
  const rangeMatch = targetS.match(/(\d+\s*と\s*\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*[〜~\-]\s*(\d+\s*と\s*\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+(?:\.\d+)?)/);
  let num = null;
  let isRange = false;
  let rangeBounds = null;
  if (rangeMatch) {
    const left = parseSimpleNumberToken(rangeMatch[1]);
    const right = parseSimpleNumberToken(rangeMatch[2]);
    if (!left || !right || left.invalid || right.invalid || right.val < left.val) {
      return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
    }
    num = (left.val + right.val) / 2;
    isRange = true;
    rangeBounds = [left.val, right.val];
  } else {
    const mixed = targetS.match(/(\d+)\s*と\s*(\d+)\s*\/\s*(\d+)/);
    const frac = !mixed && targetS.match(/(\d+)\s*\/\s*(\d+)/);
    const dec = !mixed && !frac && targetS.match(/(\d+(?:\.\d+)?)/);
    if (mixed) {
      const den = Number(mixed[3]);
      if (den <= 0) return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
      num = Number(mixed[1]) + Number(mixed[2]) / den;
    } else if (frac) {
      const den = Number(frac[2]);
      if (den <= 0) return { unit: "invalid", val: 0, qty: null, ambiguous: true, invalid: true };
      num = Number(frac[1]) / den;
    } else if (dec) {
      num = Number(dec[1]);
    }
  }

  if (num === null || !Number.isFinite(num) || num <= 0) {
    return { unit: "unknown", val: 0, qty: null, ambiguous: true, invalid: true };
  }

  let unit = "raw";
  let val = num;
  if (/大さじ/.test(targetS)) unit = "tbsp";
  else if (/小さじ/.test(targetS)) unit = "tsp";
  else if (/カップ/.test(targetS)) { unit = "ml"; val = num * 200; }
  else if (/ml|cc|ミリリットル/i.test(targetS)) unit = "ml";
  else if (/kg/i.test(targetS)) { unit = "g"; val = num * 1000; }
  else if (/g|グラム/i.test(targetS)) unit = "g";
  else if (/パック|袋|束|丁|缶/.test(targetS)) unit = "pack";
  else if (/個|玉|本|枚|尾|切れ|片|合/.test(targetS)) unit = "piece";

  return {
    unit,
    val,
    qty: val,
    ambiguous: isRange || unit === "raw",
    invalid: false,
    ...(rangeBounds ? { range: rangeBounds, assumption: `範囲表記（${rangeBounds[0]}〜${rangeBounds[1]}）の中央値で換算` } : {}),
  };
}

function estimateRecipeNutrition(recipe) {
  const revKey = recipeRevisionKey(recipe);
  if (revKey && NUTRITION_MEMO.has(revKey)) return NUTRITION_MEMO.get(revKey);

  const rawServings = Number(recipe?.sourceServings);
  const servings = Number.isFinite(rawServings) && rawServings > 0 && rawServings <= 20 ? rawServings : null;
  const ings = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];

  let totalSaltG = 0;
  let totalProteinG = 0;
  let totalVegG = 0;
  let totalKcal = 0;
  let matchedSeasonings = 0;
  let matchedSaltyFoods = 0;
  let matchedMacroItems = 0;
  let hasUnquantifiedSalt = false;
  let hasUnquantifiedMacro = false;

  const saltSources = [];
  const matchedItems = [];
  const unmatchedItems = [];
  const ambiguousItems = [];
  const assumptions = [];

  if (servings === null) {
    assumptions.push("元のレシピの人数（何人分）が未設定のため、1人前換算は「不明」としています");
  }

  for (const ing of ings) {
    const name = String(ing?.name || "").trim();
    const amt = String(ing?.amount || "").trim();
    if (!name) continue;
    const pq = parseAmountQuantity(amt);

    if (pq.assumption) {
      assumptions.push(`${name}（${amt || "分量未記載"}）：${pq.assumption}`);
    }
    if (pq.ambiguous || pq.invalid) {
      ambiguousItems.push({ name, amount: amt || "未記載", reason: pq.invalid ? "分量不明・不正" : "あいまい分量" });
    }

    // 0-a. 水・お湯・氷・無塩のだし汁（塩分・エネルギー0）
    if (/^水$|^お湯$|^湯$|^氷$/.test(name)) {
      matchedItems.push({ name, amount: amt, category: "water", foodId: "water" });
      continue;
    }
    if (/^(?:だし汁|出し汁|出汁|かつおだし|昆布だし|煮干しだし)$/.test(name)) {
      const g = !pq.invalid && pq.val > 0 ? (pq.unit === "g" || pq.unit === "ml" ? pq.val : pq.unit === "tbsp" ? 15 * pq.val : pq.unit === "tsp" ? 5 * pq.val : 200) : 0;
      matchedItems.push({ name, amount: amt, category: "dashi_liquid", foodId: "dashi_liquid", grams: Math.round(g), saltG: 0 });
      continue;
    }

    // 0-b. 無塩バター・油類
    if (/無塩バター/.test(name)) {
      if (pq.invalid || pq.unit === "some" || pq.val <= 0) {
        hasUnquantifiedMacro = true;
        unmatchedItems.push({ name, amount: amt || "適量", reason: "分量が特定できないためエネルギー加算を保留" });
      } else {
        const g = pq.unit === "g" ? pq.val : pq.unit === "tbsp" ? 12 * pq.val : pq.unit === "tsp" ? 4 * pq.val : 10;
        totalKcal += g * 7.5;
        matchedMacroItems += 1;
        matchedItems.push({ name, amount: amt, category: "fat", foodId: "unsalted_butter", grams: Math.round(g) });
      }
      continue;
    }
    if (!/油揚げ|あぶらあげ|厚揚げ|あつあげ|油かす/.test(name) && /^(?:(?:炒め|植物|サラダ|ごま|胡麻|オリーブ|米|こめ|ラー|揚げ|キャノーラ|なたね|菜種)?油|.*オイル)(?:[(（].*)?$/.test(name)) {
      if (pq.invalid || pq.unit === "some" || pq.val <= 0) {
        hasUnquantifiedMacro = true;
        unmatchedItems.push({ name, amount: amt || "適量", reason: "分量が特定できないためエネルギー加算を保留" });
      } else {
        const g = pq.unit === "g" || pq.unit === "ml" ? pq.val : pq.unit === "tbsp" ? 12 * pq.val : pq.unit === "tsp" ? 4 * pq.val : 8;
        totalKcal += g * 9.0;
        matchedMacroItems += 1;
        matchedItems.push({ name, amount: amt, category: "oil", foodId: "oil", grams: Math.round(g) });
      }
      continue;
    }

    // 1. 調味料の塩分計算（無塩調味料より先に判定し、「ポン酢」等が「酢」に吸われるのを防ぐ）
    let matchedRule = null;
    for (const rule of SEASONING_SALT_RULES) {
      if (rule.re.test(name)) {
        matchedRule = rule;
        break;
      }
    }
    if (matchedRule) {
      const isGranuleExplicit = /の素|顆粒|粉末|ほんだし|ウェイパー|創味シャンタン|キューブ|固形/.test(name);
      const isLiquidBroth = Boolean(
        matchedRule.isStockRule &&
        !isGranuleExplicit &&
        (pq.unit === "ml" || (pq.unit === "g" && pq.val >= 50) || /スープ|だし汁|出し汁/.test(name))
      );
      if (isLiquidBroth) {
        hasUnquantifiedSalt = true;
        unmatchedItems.push({
          name,
          amount: amt || "未記載",
          reason: "水で溶いたスープ・だし汁は希釈倍率が特定できないため塩分加算を保留",
        });
        assumptions.push(`${name}（${amt}）は希釈済みの液体スープと判定し、顆粒の素としては数えていません`);
        continue;
      }
      if (pq.invalid || pq.unit === "some" || pq.val <= 0) {
        hasUnquantifiedSalt = true;
        if (matchedRule.kcalPerGram) {
          hasUnquantifiedMacro = true;
        }
        unmatchedItems.push({ name, amount: amt || "適量", reason: "分量が特定できないため塩分・エネルギー加算を保留" });
        continue;
      }
      let salt = 0;
      let grams = 0;
      if (pq.unit === "tbsp") {
        salt = matchedRule.tbspSalt * pq.val;
        grams = 15 * pq.val;
      } else if (pq.unit === "tsp") {
        salt = matchedRule.tspSalt * pq.val;
        grams = 5 * pq.val;
      } else if (pq.unit === "ml") {
        salt = (matchedRule.tbspSalt / 15) * pq.val;
        grams = pq.val;
      } else if (pq.unit === "g") {
        salt = matchedRule.gramSalt * pq.val;
        grams = pq.val;
      } else if (pq.unit === "pinch") {
        salt = /塩/.test(matchedRule.label) ? pq.val : matchedRule.tspSalt * 0.25;
        grams = pq.val;
      } else if (matchedRule.isStockRule && pq.unit === "piece" && pq.val <= 4) {
        // コンソメキューブ 1個（約5g、食塩相当量約2.4g）
        salt = 2.4 * pq.val;
        grams = 5 * pq.val;
      } else {
        hasUnquantifiedSalt = true;
        if (matchedRule.kcalPerGram) {
          hasUnquantifiedMacro = true;
        }
        unmatchedItems.push({ name, amount: amt, reason: "単位不明のため塩分加算を保留" });
        continue;
      }
      matchedSeasonings += 1;
      totalSaltG += salt;
      if (matchedRule.kcalPerGram && grams > 0) {
        totalKcal += grams * matchedRule.kcalPerGram;
      }
      const perServingSalt = servings ? Math.round((salt / servings) * 10) / 10 : null;
      saltSources.push({
        name: name || matchedRule.label,
        amount: amt,
        totalSalt: Math.round(salt * 10) / 10,
        perServingSalt,
      });
      const foodId = matchedRule.foodId || "seasoning";
      matchedItems.push({ name, amount: amt, category: "seasoning", foodId, grams: Math.round(grams), saltG: Math.round(salt * 10) / 10 });
      continue;
    }

    // 1-b. 塩分を含まない調味料・粉類・香辛料（ポン酢等は上で処理済み）
    if (/料理酒|^酒$|日本酒|みりん|本みりん|砂糖|きび砂糖|上白糖|はちみつ|^(?:酢|米酢|穀物酢|黒酢|りんご酢|ワインビネガー)$|レモン汁|片栗粉|小麦粉|薄力粉|強力粉|米粉|パン粉|すりごま|いりごま|白ごま|黒ごま|こしょう|コショウ|黒こしょう|ブラックペッパー|一味|七味|鷹の爪|カレー粉|山椒|わさび|からし/.test(name) && !/塩こしょう|塩コショウ/.test(name)) {
      if (pq.invalid || pq.unit === "some" || pq.val <= 0) {
        if (/砂糖|きび砂糖|上白糖|はちみつ|みりん|本みりん|料理酒|^酒$|日本酒|片栗粉|小麦粉|薄力粉|強力粉|米粉|パン粉|ごま/.test(name)) {
          hasUnquantifiedMacro = true;
          unmatchedItems.push({ name, amount: amt || "適量", reason: "分量が特定できないためエネルギー加算を保留" });
        }
        continue;
      }
      const g = pq.unit === "g" || pq.unit === "ml" ? pq.val : pq.unit === "tbsp" ? 12 * pq.val : pq.unit === "tsp" ? 4 * pq.val : 6;
      if (/砂糖|きび砂糖|上白糖|はちみつ|みりん|本みりん|料理酒|^酒$|日本酒|片栗粉|小麦粉|薄力粉|強力粉|米粉|パン粉/.test(name)) {
        totalKcal += g * (/料理酒|^酒$|日本酒/.test(name) ? 1.0 : /みりん/.test(name) ? 2.4 : 3.5);
        matchedMacroItems += 1;
      } else if (/ごま/.test(name)) {
        totalKcal += g * 5.8;
        totalProteinG += g * 0.2;
        matchedMacroItems += 1;
      }
      const foodId = /パン粉/.test(name) ? "panko" : /米粉/.test(name) ? "rice_flour" : /みりん/.test(name) ? "mirin" : /酢/.test(name) ? "vinegar" : "seasoning_unsalted";
      matchedItems.push({ name, amount: amt, category: "seasoning_unsalted", foodId, grams: Math.round(g) });
      continue;
    }

    if (pq.invalid || pq.unit === "some" || pq.val <= 0) {
      if (/ベーコン|ウインナー|ソーセージ|ハム|ちくわ|カニカマ|かまぼこ|塩鮭|塩サバ|塩さば|干物|しらす|明太子|たらこ|キムチ|漬物|梅干し|ザーサイ|ツナ|サバ缶|さば缶|チーズ|うどん|中華麺|焼きそば|そうめん|食パン|バゲット|^パン$|牛乳|豆乳|卵|たまご|玉子|鶏|豚|牛|肉|ひき肉|合いびき|合挽き|鮭|サーモン|さば|サバ|ぶり|ブリ|たら|タラ|えび|エビ|いか|たこ/.test(name)) {
        hasUnquantifiedSalt = true;
      }
      hasUnquantifiedMacro = true;
      unmatchedItems.push({ name, amount: amt || "適量", reason: "分量が数値化できないため除外" });
      continue;
    }

    let itemMatched = false;

    // 2. 牛乳・豆乳（牛肉や大豆の重さ誤認を防ぐ）
    if (/牛乳|豆乳/.test(name)) {
      const g = pq.unit === "g" || pq.unit === "ml" ? pq.val : pq.unit === "tbsp" ? 15 * pq.val : 150 * pq.val;
      totalProteinG += g * 0.035;
      totalKcal += g * 0.6;
      totalSaltG += g * 0.001;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "dairy_soy", foodId: /牛乳/.test(name) ? "milk" : "soy_milk", grams: Math.round(g) });
      continue;
    }

    // 3. 塩分を含む加工食品
    if (/ベーコン|ウインナー|ソーセージ|ハム|ちくわ|カニカマ|かまぼこ/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 60 * pq.val;
      const s = g * 0.02;
      totalSaltG += s;
      totalProteinG += g * 0.13;
      totalKcal += g * 2.2;
      matchedSaltyFoods += 1;
      matchedMacroItems += 1;
      saltSources.push({ name, amount: amt, totalSalt: Math.round(s * 10) / 10, perServingSalt: servings ? Math.round((s / servings) * 10) / 10 : null });
      matchedItems.push({ name, amount: amt, category: "processed_meat_fish", foodId: "processed_meat_fish", grams: Math.round(g), saltG: Math.round(s * 10) / 10 });
      itemMatched = true;
    } else if (/塩鮭|塩サバ|塩さば|干物|しらす|明太子|たらこ/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 80 * pq.val;
      const s = g * 0.022;
      totalSaltG += s;
      totalProteinG += g * 0.22;
      totalKcal += g * 1.6;
      matchedSaltyFoods += 1;
      matchedMacroItems += 1;
      saltSources.push({ name, amount: amt, totalSalt: Math.round(s * 10) / 10, perServingSalt: servings ? Math.round((s / servings) * 10) / 10 : null });
      matchedItems.push({ name, amount: amt, category: "salted_fish", foodId: "salted_fish", grams: Math.round(g), saltG: Math.round(s * 10) / 10 });
      itemMatched = true;
    } else if (/キムチ|漬物|梅干し|ザーサイ/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 50 * pq.val;
      const s = g * 0.028;
      totalSaltG += s;
      totalVegG += g;
      matchedSaltyFoods += 1;
      matchedMacroItems += 1;
      saltSources.push({ name, amount: amt, totalSalt: Math.round(s * 10) / 10, perServingSalt: servings ? Math.round((s / servings) * 10) / 10 : null });
      matchedItems.push({ name, amount: amt, category: "pickled_veg", foodId: "pickled_veg", grams: Math.round(g), saltG: Math.round(s * 10) / 10 });
      itemMatched = true;
    } else if (/ツナ|サバ缶|さば缶/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 70 * pq.val;
      const s = g * 0.008;
      totalSaltG += s;
      totalProteinG += g * 0.18;
      totalKcal += g * 1.8;
      matchedSaltyFoods += 1;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "canned_fish", foodId: "canned_fish", grams: Math.round(g), saltG: Math.round(s * 10) / 10 });
      itemMatched = true;
    } else if (/チーズ/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 30 * pq.val;
      const s = g * 0.025;
      totalSaltG += s;
      totalProteinG += g * 0.22;
      totalKcal += g * 3.3;
      matchedSaltyFoods += 1;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "cheese", foodId: "cheese", grams: Math.round(g), saltG: Math.round(s * 10) / 10 });
      itemMatched = true;
    }

    // 4. 主菜たんぱく質（肉・魚・卵・大豆製品。牛乳・鶏ガラスープ等の誤マッチを除外済み）
    if (!itemMatched && /(?:鶏|豚|牛|ひき肉|合いびき|合挽き|ラム)(?!乳|脂|ガラ|がら)/.test(name)) {
      const g = pq.unit === "g" ? pq.val : pq.unit === "piece" ? 120 * pq.val : 200 * pq.val;
      if (pq.unit !== "g") assumptions.push(`${name}（${amt}）を約${Math.round(g)}gとして換算`);
      totalProteinG += g * 0.19;
      totalKcal += g * 2.1;
      totalSaltG += g * 0.001;
      matchedMacroItems += 1;
      const foodId = /牛/.test(name) ? "beef" : /豚/.test(name) ? "pork" : /鶏/.test(name) ? "chicken" : "meat";
      matchedItems.push({ name, amount: amt, category: "meat", foodId, grams: Math.round(g) });
      itemMatched = true;
    } else if (!itemMatched && /鮭|サーモン|さば|サバ|ぶり|ブリ|たら|タラ|さわら|かじき|まぐろ|かつお|あじ|いわし|えび|エビ|いか|たこ|ホタテ/.test(name)) {
      const g = pq.unit === "g" ? pq.val : pq.unit === "piece" ? 80 * pq.val : 160 * pq.val;
      if (pq.unit !== "g") assumptions.push(`${name}（${amt}）を約${Math.round(g)}gとして換算`);
      totalProteinG += g * 0.2;
      totalKcal += g * 1.5;
      totalSaltG += g * 0.002;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "fish", foodId: "fish", grams: Math.round(g) });
      itemMatched = true;
    } else if (!itemMatched && /卵|たまご|玉子/.test(name)) {
      const count = pq.unit === "g" ? pq.val / 50 : pq.val;
      totalProteinG += count * 6.2;
      totalKcal += count * 76;
      totalSaltG += count * 0.2;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "egg", foodId: "egg", grams: Math.round(count * 50) });
      itemMatched = true;
    } else if (!itemMatched && /豆腐|厚揚げ|油揚げ|納豆|おから|高野豆腐/.test(name)) {
      const g = pq.unit === "g" ? pq.val : /納豆/.test(name) ? 45 * pq.val : /油揚げ/.test(name) ? 30 * pq.val : 300 * pq.val;
      if (pq.unit !== "g") assumptions.push(`${name}（${amt}）を約${Math.round(g)}gとして換算`);
      totalProteinG += g * 0.07;
      totalKcal += g * 0.8;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "soy", foodId: "soy", grams: Math.round(g) });
      itemMatched = true;
    }

    // 5. 野菜・きのこ・海藻・いも類
    if (!itemMatched && /キャベツ|白菜|レタス|小松菜|ほうれん草|チンゲン菜|水菜|ニラ|にら|ねぎ|ネギ|玉ねぎ|たまねぎ|にんじん|人参|大根|(?<!め)かぶ(?!り)|なす|ナス|茄子|ピーマン|パプリカ|トマト|ミニトマト|ブロッコリー|アスパラ|オクラ|きゅうり|ゴーヤ|もやし|豆苗|かいわれ|きのこ|しめじ|えのき|エリンギ|しいたけ|椎茸|まいたけ|舞茸|れんこん|ごぼう|かぼちゃ|じゃがいも|さつまいも|里芋|長芋|わかめ|ひじき|のり|しょうが|にんにく|コーン|とうもろこし/.test(name)) {
      let g = 80 * pq.val;
      if (pq.unit === "g") g = pq.val;
      else if (/もやし|豆苗|小松菜|ほうれん草/.test(name)) g = 180 * pq.val;
      else if (/きのこ|しめじ|えのき|エリンギ|まいたけ|しいたけ|椎茸/.test(name)) g = 100 * pq.val;
      else if (/キャベツ|白菜|大根/.test(name)) g = pq.val <= 1 ? 1000 * pq.val : 160 * pq.val;
      else if (/玉ねぎ|たまねぎ|トマト|にんじん|人参|じゃがいも/.test(name)) g = 150 * pq.val;
      else if (/なす|ナス|茄子|きゅうり|ピーマン/.test(name)) g = 75 * pq.val;
      else if (/しょうが|にんにく/.test(name)) g = 10 * pq.val;
      if (pq.unit !== "g") assumptions.push(`${name}（${amt}）を約${Math.round(g)}gとして換算`);
      totalVegG += g;
      totalKcal += g * 0.25;
      matchedMacroItems += 1;
      matchedItems.push({ name, amount: amt, category: "vegetable", foodId: "vegetable", grams: Math.round(g) });
      itemMatched = true;
    }

    // 6. ごはん・麺・パン（米油・みりん・パン粉は上で除外済み）
    if (!itemMatched && /ごはん|ご飯|白米|^米$|うどん|中華麺|焼きそば|パスタ|スパゲッティ|そうめん|そば|春雨|はるさめ|餅|食パン|バゲット|^パン$/.test(name)) {
      const g = pq.unit === "g" ? pq.val : 180 * pq.val;
      if (pq.unit !== "g") assumptions.push(`${name}（${amt}）を約${Math.round(g)}gとして換算`);
      totalProteinG += g * 0.03;
      totalKcal += g * 1.5;
      if (/うどん|中華麺|焼きそば|そうめん|食パン|バゲット|^パン$/.test(name)) {
        const s = g * 0.003;
        totalSaltG += s;
        matchedSaltyFoods += 1;
      }
      matchedMacroItems += 1;
      const foodId = /食パン|バゲット|^パン$/.test(name) ? "bread" : /ごはん|ご飯|白米|^米$/.test(name) ? "rice" : "noodle";
      matchedItems.push({ name, amount: amt, category: "staple", foodId, grams: Math.round(g) });
      itemMatched = true;
    }

    if (!itemMatched) {
      hasUnquantifiedSalt = true;
      hasUnquantifiedMacro = true;
      unmatchedItems.push({ name, amount: amt, reason: "成分換算辞書に未登録の材料" });
    }
  }

  const hasSaltBasis = servings !== null && (matchedSeasonings > 0 || matchedSaltyFoods > 0);
  const hasMacroBasis = servings !== null && matchedMacroItems > 0;

  const rawSaltPerServing = hasSaltBasis ? Math.round((totalSaltG / servings) * 10) / 10 : null;
  const rawProteinPerServing = hasMacroBasis ? Math.round(totalProteinG / servings) : null;
  const rawVegPerServing = hasMacroBasis ? Math.round(totalVegG / servings) : null;
  const rawKcalPerServing = hasMacroBasis ? Math.round(totalKcal / servings) : null;

  // 1人前としてありえない異常値（塩分10g超、エネルギー2500kcal超など）は誤解釈を防ぐため「不明（null）」にする
  const saneSalt = rawSaltPerServing != null && rawSaltPerServing <= 10 ? rawSaltPerServing : null;
  const saneProtein = rawProteinPerServing != null && rawProteinPerServing <= 150 ? rawProteinPerServing : null;
  const saneVeg = rawVegPerServing != null && rawVegPerServing <= 1200 ? rawVegPerServing : null;
  const saneKcal = rawKcalPerServing != null && rawKcalPerServing <= 2500 ? rawKcalPerServing : null;

  if (rawSaltPerServing != null && rawSaltPerServing > 10) {
    assumptions.push(`1人前の食塩相当量が異常値（${rawSaltPerServing}g）となったため「不明」としました`);
  }

  // 未確定の塩分・主材料が1つでもある時は、料理全体の合計値（saltG 等）を null（不明）とし、判明分小計（partial*）に分ける
  const saltG = !hasUnquantifiedSalt ? saneSalt : null;
  const proteinG = !hasUnquantifiedMacro ? saneProtein : null;
  const vegG = !hasUnquantifiedMacro ? saneVeg : null;
  const kcal = !hasUnquantifiedMacro ? saneKcal : null;

  const partialSaltG = hasUnquantifiedSalt ? saneSalt : null;
  const partialProteinG = hasUnquantifiedMacro ? saneProtein : null;
  const partialVegG = hasUnquantifiedMacro ? saneVeg : null;
  const partialKcal = hasUnquantifiedMacro ? saneKcal : null;

  const status = saltG !== null && kcal !== null
    ? "estimated"
    : (saneSalt !== null || saneKcal !== null)
      ? "partial"
      : "unknown";
  const statusLabel = status === "estimated"
    ? "材料から推定（主菜1品）"
    : status === "partial"
      ? "一部材料が分量未確定のため全体は不明（判明分小計あり）"
      : "不明（材料・人数の記載不足）";

  // 断定的な数値（約0.5g等）や医療・健康評価は出さず、主な塩分源の事実のみを穏やかに伝える
  const topSaltSource = [...saltSources].sort((a, b) => (b.totalSalt || 0) - (a.totalSalt || 0))[0];
  const lowSaltTip = topSaltSource && topSaltSource.perServingSalt != null
    ? `判明している主な塩分源は「${topSaltSource.name}」（1人前あたり推定 ${topSaltSource.perServingSalt}g）です。味見しながら加減できます。`
    : "材料の分量記載がある項目のみから推定しています（汁の残し方や製品差で変わります）。";

  const out = {
    servings,
    totalSaltG: Math.round(totalSaltG * 10) / 10,
    saltG,
    proteinG,
    vegG,
    kcal,
    partialSaltG,
    partialProteinG,
    partialVegG,
    partialKcal,
    status,
    statusLabel,
    foodDbSource: NUTRITION_FOOD_DB_SOURCE,
    calcVersion: NUTRITION_CALC_VERSION,
    saltSources: saltSources.slice(0, 4),
    matchedItems,
    unmatchedItems,
    ambiguousItems,
    assumptions,
    lowSaltTip,
  };
  if (revKey) setBoundedMemo(NUTRITION_MEMO, revKey, out);
  return out;
}

// カードの基本表示スペックを算出（メモ化対応・第1段階は自動カード番号を非表示）
function recipeCardSpec(recipe) {
  if (!recipe) return null;
  const specKey = `${recipeRevisionKey(recipe)}|${evalsSignature()}`;
  if (CARD_SPEC_MEMO.has(specKey)) return CARD_SPEC_MEMO.get(specKey);

  const t = Lifestyle.traits(recipe || {});
  const tags = Lifestyle.tags(recipe || {});
  const sk = Skills.rate(recipe || {});
  const minutes = recipe?.planning?.minutes || 20;
  const cooks = cardCookCount(recipe);
  const love = loveScore(recipe);
  const nutrition = estimateRecipeNutrition(recipe);
  const imageInfo = cardImageInfo(recipe);

  // 第1段階：自動採番（No.001〜）は衝突するため非表示。明示的に catalog.cardNo がある場合のみ表示
  const cardNo = recipe?.catalog?.cardNo ? String(recipe.catalog.cardNo) : "";

  const proteinMap = { meat: ["🥩", "お肉"], fish: ["🐟", "お魚"], eggtofu: ["🥚", "卵・豆腐"], veg: ["🥬", "野菜"] };
  const stapleMap = { rice: ["🍚", "丼・飯"], noodle: ["🍜", "麺"], bread: ["🍞", "パン"], other: ["🍳", "おかず"] };
  const [pIcon, pName] = proteinMap[t.protein] || ["🍽", "主菜"];
  const [sIcon, sName] = stapleMap[t.staple] || ["🍳", "おかず"];
  const typeText = `${pIcon}${pName}・${sIcon}${sName}`;

  const eq = recipe?.planning?.equipment || [];
  const easyTool = tags.includes("microwave") || (eq.includes("電子レンジ") && !eq.includes("コンロ"))
    ? "♨️レンジ"
    : sk.skills.includes("hand") && !sk.skills.includes("knife")
      ? "✂️包丁なし"
      : eq.includes("フライパン") && !eq.includes("鍋")
        ? "🍳フライパン"
        : eq.includes("鍋") && !eq.includes("フライパン")
          ? "🍲鍋1つ"
          : "";
  const timeIcon = minutes <= 10 ? "⚡" : "⏱";
  const speedText = `${timeIcon}${minutes}分`;
  const speedTier = minutes <= 10 ? "high" : minutes <= 15 ? "mid" : "normal";
  const moodWord = tags.includes("light") ? "🍋さっぱり" : tags.includes("spicy") ? "🌶ピリ辛" : tags.includes("rich") ? "🔥こってり" : "🍵定番";

  const shortSkillNames = {
    mix: "和える", hand: "ちぎる", microwave: "レンジ", boil: "ゆでる", knife: "切る",
    stirfry: "炒める", simmer: "煮る", steam: "蒸す", egg: "卵とじ", mince: "みじん切り",
    sear: "焼き目", glaze: "照り煮", butterfly: "切り開く", shallowfry: "揚げ焼き",
    shape: "成形", emulsify: "乳化", deepfry: "揚げる", fillet: "おろす", dough: "生地"
  };
  const topSkillId = sk.skills[0] || "mix";
  const topSkillWord = shortSkillNames[topSkillId] || sk.label;
  const stars = "★".repeat(sk.level) + "☆".repeat(Math.max(0, 5 - sk.level));
  const skillText = `技 ${stars.slice(0, 3)} ${topSkillWord}`;

  // わが家の育成度（未調理＝未調理カード、1回〜＝作ったカード）
  let rank = "draft", rankBadge = "未調理", sealText = "";
  if (cooks >= 3 || (cooks >= 1 && love >= 4)) {
    rank = "gold";
    rankBadge = `👑 わが家の定番（${cooks}回）`;
    sealText = "👑 定番";
  } else if (cooks === 2) {
    rank = "silver";
    rankBadge = "★★ 常連（2回）";
    sealText = "★★ 常連";
  } else if (cooks >= 1) {
    rank = "bronze";
    rankBadge = "★ 作ってGET済";
    sealText = "★ GET";
  }

  const out = {
    cardNo,
    artUrl: imageInfo.url,
    imageKind: imageInfo.kind,
    imageLabel: imageInfo.label,
    typeText,
    pIcon,
    pName,
    sIcon,
    sName,
    speedText,
    easyTool,
    minutes,
    speedTier,
    moodWord,
    nutrition,
    skillLevel: sk.level,
    skillStars: stars,
    skillWord: topSkillWord,
    skillText,
    cooks,
    love,
    rank,
    isCollected: cooks > 0,
    rankBadge,
    sealText,
    // 表面の「図鑑の情報」：技の星（3段）・材料の数・作り手
    skillStars3: "★".repeat(Math.max(1, Math.min(3, sk.level))) + "☆".repeat(Math.max(0, 3 - Math.max(1, Math.min(3, sk.level)))),
    ingredientCount: (recipe?.ingredients || []).filter((i) => i && String(i.name || "").trim()).length,
    creator: (typeof creatorName === "function" ? creatorName(recipe) : "") || "",
  };
  return setBoundedMemo(CARD_SPEC_MEMO, specKey, out);
}

// トレイに並べた料理の「使い回し野菜・主役の重なり」の事実まとめ（選択画面の4ゲージ・健康コンボは廃止）
function computeTrayCombo(days) {
  const targetDays = days || trayTargetDays();
  const placed = targetDays
    .map((d) => ({ day: d, recipe: trayDayRecipe(d) }))
    .filter((x) => !!x.recipe);
  const count = placed.length;
  if (!count) {
    return {
      count: 0,
      totalSlots: targetDays.length,
      avgMinutes: 0,
      sharedVegList: [],
      proteinSummary: "",
    };
  }
  const specs = placed.map((x) => ({ ...x, spec: recipeCardSpec(x.recipe), traits: Lifestyle.traits(x.recipe) }));
  const totalMin = specs.reduce((s, x) => s + x.spec.minutes, 0);
  const avgMinutes = Math.round(totalMin / count);
  const vegFreq = new Map();
  for (const x of specs) {
    for (const v of Lifestyle.useUpKeys(x.recipe)) {
      vegFreq.set(v, (vegFreq.get(v) || 0) + 1);
    }
  }
  const sharedVegList = [...vegFreq.entries()].filter(([, c]) => c >= 2).map(([v]) => v);
  const proteinSummary = specs.map((x) => x.spec.pName).join("・");
  return {
    count,
    totalSlots: targetDays.length,
    avgMinutes,
    sharedVegList,
    proteinSummary,
  };
}

// トレイの対象となる日（今のブロックの料理する日、または直近3日分）
function trayTargetDays() {
  const plan = dailyPlan();
  const locks = lockedDates(plan);
  let days = plan.filter((d) => !d.off && !d.prestart && !locks.has(d.date) && d.slot?.status !== "cooked" && d.slot?.status !== "off");
  if (rhythmOn()) {
    const blocks = planPageBlocks();
    const current = blocks.find((b) => b.key === planPage) || blocks.find((b) => b.end >= today()) || blocks[0];
    if (current) {
      const bDays = days.filter((d) => current.dates.includes(d.date));
      if (bDays.length) days = bDays;
    }
  }
  // 献立タブの中のトレイなので、表示している日はすべて対象（7日でも、決定ボタンで全部の日を決められるように。Codex review #240）
  return days;
}

function findDinnerRecipeById(recipeId) {
  if (!recipeId) return null;
  return (
    allDinnerRecipes().find((r) => r.id === recipeId) ||
    (typeof recipeById === "function" ? recipeById(recipeId) : null) ||
    (typeof findDiscover === "function" ? findDiscover(recipeId) : null) ||
    (Lifestyle.curated || []).find((r) => r.id === recipeId) ||
    null
  );
}

// トレイの下書き（trayDraft）を開く時点で初期化する。
// 各日の最初のレシピIDを trayDraft に固定するため、月曜だけ変えても火曜・水曜が勝手に別料理へ再計算されない。
function initTrayDraft(days) {
  const targetDays = days || trayTargetDays();
  trayDraft = {};
  trayInitialDraft = {};
  trayBasePlan = {};
  trayTargetDates = targetDays.map((d) => d.date);
  trayUndoStack = [];
  trayClearedDates = new Set();
  TRAY_CANDIDATE_BASE_MEMO.clear();
  const snap = typeof planSnapshot === "function" ? planSnapshot(state) : {};
  for (const d of targetDays) {
    const r = d.slot?.recipe || d.candidate?.recipe || null;
    const id = r?.id || null;
    trayDraft[d.date] = id;
    trayInitialDraft[d.date] = id;
    trayBasePlan[d.date] = snap[d.date] ? clone(snap[d.date]) : null;
    if (!id) trayClearedDates.add(d.date);
  }
}

function pushTrayUndo() {
  trayUndoStack.push({
    draft: { ...trayDraft },
    activeDate: trayActiveDate,
  });
  if (trayUndoStack.length > 20) trayUndoStack.shift();
}

function syncTrayClearedSet() {
  trayClearedDates = new Set(
    Object.entries(trayDraft)
      .filter(([, id]) => !id)
      .map(([date]) => date)
  );
}

// トレイ上でその日にいま入っているレシピ（トレイ編集中は trayDraft を参照し、決定するまで本体の献立を書き換えない）
function trayDayRecipe(day) {
  if (!day) return null;
  if (trayOpen && Object.prototype.hasOwnProperty.call(trayDraft, day.date)) {
    const draftId = trayDraft[day.date];
    if (!draftId) return null;
    return findDinnerRecipeById(draftId) || (day.slot?.recipe?.id === draftId ? day.slot.recipe : day.candidate?.recipe?.id === draftId ? day.candidate.recipe : null);
  }
  if (trayClearedDates.has(day.date)) return null;
  return day.slot?.recipe || day.candidate?.recipe || null;
}

// トレイの棚スイッチ定義
const TRAY_SHELVES = [
  ["", "✨ おすすめ", () => true],
  ["fav", "😋 好物・GET済", (r) => cardCookCount(r) > 0 || loveScore(r) >= 4],
  ["quick", "⚡ 15分以内", (r) => (r.planning?.minutes || 99) <= 15],
  ["meat", "🥩 お肉", (r) => Lifestyle.traits(r).protein === "meat"],
  ["fish", "🐟 お魚", (r) => Lifestyle.traits(r).protein === "fish"],
  ["bowl", "🍜 麺・丼", (r) => ["rice", "noodle"].includes(Lifestyle.traits(r).staple)],
  ["light", "🍋 さっぱり", (r) => Lifestyle.tags(r).includes("light")],
];

// 「🔍 似た皿」でなぜ近いかを短い日本語で返す
function similarReasonText(anchor, target) {
  if (!anchor || !target || anchor.id === target.id) return "";
  const at = Lifestyle.traits(anchor);
  const tt = Lifestyle.traits(target);
  const atags = new Set(Lifestyle.tags(anchor));
  const ttags = Lifestyle.tags(target);
  const parts = [];
  const pNames = { meat: "お肉", fish: "お魚", eggtofu: "卵・豆腐", veg: "野菜" };
  const sNames = { rice: "丼・ごはん", noodle: "麺", bread: "パン", other: "おかず" };
  if (at.protein === tt.protein && pNames[tt.protein]) parts.push(`同じ${pNames[tt.protein]}`);
  if (at.staple === tt.staple && sNames[tt.staple]) parts.push(sNames[tt.staple]);
  if (ttags.includes("light") && atags.has("light")) parts.push("さっぱり");
  else if (ttags.includes("spicy") && atags.has("spicy")) parts.push("ピリ辛");
  else if (ttags.includes("rich") && atags.has("rich")) parts.push("こってり");
  return parts.slice(0, 2).join("・") || "近いタイプ";
}

// トレイでいま選んでいる日に出す候補カード一覧（他枠とのバランス・使い回し・似た料理を考慮）
function trayCandidateList(activeDate, days) {
  const p = dailyProfile();
  const otherRecipes = days
    .filter((d) => d.date !== activeDate)
    .map((d) => trayDayRecipe(d))
    .filter(Boolean);
  const otherIds = new Set(otherRecipes.map((r) => r.id));
  const otherParents = new Set(otherRecipes.map((r) => parentKeyOf(r)).filter(Boolean));
  const otherProteins = new Set(otherRecipes.map((r) => Lifestyle.traits(r).protein));
  const otherStaples = new Set(otherRecipes.map((r) => Lifestyle.traits(r).staple));
  const sharedVeg = new Set();
  for (const r of otherRecipes) {
    for (const v of Lifestyle.useUpKeys(r)) sharedVeg.add(v);
  }
  const currentOnDay = trayDayRecipe(days.find((d) => d.date === activeDate));
  const shelf = TRAY_SHELVES.find(([k]) => k === trayMood) || TRAY_SHELVES[0];
  const anchor = trayAnchorId ? findDinnerRecipeById(trayAnchorId) : null;
  const anchorTraits = anchor ? Lifestyle.traits(anchor) : null;
  const anchorTags = anchor ? new Set(Lifestyle.tags(anchor)) : null;

  const all = allDinnerRecipes();
  const baseKey = `${activeDate}|${all.length}|${state?.recipes?.length || 0}|${evalsSignature()}|${state?.foodProfile?.updatedAt || ""}|${state?.householdProfile?.updatedAt || ""}`;
  let fitBase = TRAY_CANDIDATE_BASE_MEMO.get(baseKey);
  if (!fitBase) {
    fitBase = all
      .filter((r) => !Object.values(recipeRatings(r)).includes("never"))
      .map((r) => {
        const fit = Lifestyle.fit(r, p, activeDate);
        if (!fit.ok) return null;
        return {
          r,
          fit,
          pk: parentKeyOf(r),
          traits: Lifestyle.traits(r),
          tags: Lifestyle.tags(r),
          useUpKeys: Lifestyle.useUpKeys(r),
        };
      })
      .filter(Boolean);
    setBoundedMemo(TRAY_CANDIDATE_BASE_MEMO, baseKey, fitBase);
  }

  const seenParents = new Set();
  const scored = [];
  for (const x of fitBase) {
    if (otherIds.has(x.r.id)) continue;
    if (x.r.id !== trayAnchorId && x.r.id === currentOnDay?.id) continue;
    if (x.r.id !== trayAnchorId && !shelf[2](x.r)) continue;
    const pk = x.pk;
    if (pk && x.r.id !== trayAnchorId) {
      if (otherParents.has(pk) || seenParents.has(pk)) continue;
      seenParents.add(pk);
    }
    const t = x.traits;
    const tags = x.tags;
    let score = (x.fit.score || 0) + (x.r.curated ? 0 : 3);
    if (!otherProteins.has(t.protein)) score += 8;
    if (!otherStaples.has(t.staple)) score += 5;
    let sharedVegHit = "";
    for (const v of x.useUpKeys) {
      if (sharedVeg.has(v)) { score += 6; sharedVegHit = v; break; }
    }
    let simReason = "";
    if (anchor && x.r.id === anchor.id) {
      score += 10000;
      simReason = "起点の料理";
    } else if (anchorTraits) {
      if (t.protein === anchorTraits.protein) score += 25;
      if (t.staple === anchorTraits.staple) score += 20;
      if (t.cuisine === anchorTraits.cuisine) score += 10;
      for (const tg of tags) if (anchorTags.has(tg)) score += 6;
      simReason = similarReasonText(anchor, x.r);
    }
    scored.push({ r: x.r, score, sharedVegHit, simReason });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

// トレーディングカード1枚のHTML
// 表面は「料理の絵・料理名・調理時間」が中心。栄養ジェム・王冠は出さず、裏面に置く。
function renderRecipeTradingCard(recipe, opts = {}) {
  if (!recipe) return "";
  const spec = recipeCardSpec(recipe);
  const {
    activeDate = "",
    dayWord = "",
    sharedVegHit = "",
    simReason = "",
    isAnchor = false,
    mode = "tray",
  } = opts;
  const rankClass = spec.isCollected ? `is-collected is-rank-${spec.rank}` : "is-draft";
  // 理由の札は写真に重ねない。全員に同じ理由が並ぶ時は、呼び出し側でよはくの一言にまとめて、ここには違いだけを渡す。
  const reasonChip = opts.reasonChip != null
    ? opts.reasonChip
    : isAnchor ? "🔍 起点" : simReason ? `🔍 ${simReason}` : sharedVegHit ? `🥬 ${sharedVegHit}使い回し` : spec.love >= 4 ? "😋 好物" : "";
  const tagWords = [spec.moodWord, `${spec.sIcon}${spec.sName}`, spec.easyTool].filter(Boolean);
  const stats = [
    ["作った", spec.cooks > 0 ? `${spec.cooks}回` : "まだ", spec.cooks > 0 ? "is-done" : ""],
    ["技", spec.skillStars3, ""],
    ["材料", spec.ingredientCount ? `${spec.ingredientCount}品` : "—", ""],
  ];

  return `<div class="rc-unit ${isAnchor ? "is-anchor-unit" : ""}">
    <article class="rc-card ${rankClass} ${isAnchor ? "is-anchor" : ""}" data-recipe-id="${escapeAttr(recipe.id)}">
      <button type="button" class="rc-corner-peel" data-action="life-card-flip" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}の裏面をめくる（材料・作り方・動画）" title="裏面（材料・作り方・動画）を見る">
        <span class="rc-peel-flap" aria-hidden="true"><i>↺</i></span>
      </button>

      <div class="rc-card-inner">
        <div class="rc-top-row">
          ${spec.cardNo ? `<span class="rc-card-no">${escapeHtml(spec.cardNo)}</span>` : ""}
          <span class="rc-speed-badge is-${spec.speedTier}">${escapeHtml(spec.speedText)}</span>
          <span class="rc-type-badge">${escapeHtml(spec.pIcon + spec.pName)}</span>
        </div>

        <button type="button" class="rc-art-btn" data-action="life-card-flip" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}の詳細（裏面）を見る">
          <div class="rc-plate-wrap ${spec.imageKind === "photo" ? "is-photo" : ""}">
            <img class="rc-plate-img" src="${escapeAttr(spec.artUrl)}" alt="${escapeAttr(recipe.title)}" loading="lazy">
            ${spec.imageKind === "placeholder" && spec.imageLabel ? `<span class="rc-img-kind">${escapeHtml(spec.imageLabel)}</span>` : ""}
            ${spec.sealText ? `<span class="rc-foil-seal"><b>${escapeHtml(spec.sealText)}</b></span>` : ""}
          </div>
          <div class="rc-title-block">
            <h4 class="rc-dish-title">${recipeTitleHtml(recipe)}</h4>
            ${reasonChip ? `<span class="rc-reason-chip">${escapeHtml(reasonChip)}</span>` : ""}
          </div>
          <p class="rc-tag-line">${tagWords.map((w) => `<span>${escapeHtml(w)}</span>`).join("")}</p>
          <dl class="rc-stats">${stats.map(([k, v, cls]) => `<div class="${cls}"><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>
          ${spec.creator ? `<p class="rc-creator">by ${escapeHtml(spec.creator)}</p>` : ""}
        </button>
      </div>
    </article>

    ${mode === "tray" ? `<div class="rc-dock" role="group" aria-label="${escapeAttr(recipe.title)}の操作">
      <button type="button" class="rc-dock-place" data-action="life-tray-place" data-recipe="${escapeAttr(recipe.id)}" data-date="${escapeAttr(activeDate)}" aria-label="${escapeAttr(recipe.title)}を${escapeAttr(dayWord)}に並べる">
        <span aria-hidden="true">📥</span> <b>${escapeHtml(dayWord)}へ</b>
      </button>
      <button type="button" class="rc-dock-icon ${isAnchor ? "is-active" : ""}" data-action="life-tray-similar" data-recipe="${escapeAttr(recipe.id)}" aria-pressed="${isAnchor}" title="この料理と似たカードを集める" aria-label="${escapeAttr(recipe.title)}と似た料理を集める">
        <span aria-hidden="true">🔍</span><small>似た皿</small>
      </button>
    </div>` : ""}
  </div>`;
}

// 献立タブの中の献立トレイ（2026-11-11 のユーザーの判断：別の画面に切り替えず、献立カードの下に置く）
// 下書きは、何かを変えた時に初めて作る（変えていない間は、家族の同期などで献立が変わってもそのまま追いかける）。
function prepareInlineTray(days) {
  trayOpen = true;
  const dates = days.map((d) => d.date);
  const sameDates = trayTargetDates.length === dates.length && trayTargetDates.every((d, i) => d === dates[i]);
  if (!isTrayDraftActive() && (!sameDates || !trayUndoStack.length)) {
    if (Object.keys(trayDraft).length || !sameDates) {
      trayDraft = {};
      trayInitialDraft = {};
      trayBasePlan = {};
      trayClearedDates = new Set();
      TRAY_CANDIDATE_BASE_MEMO.clear();
    }
    trayTargetDates = dates;
  }
  if (!trayActiveDate || !dates.includes(trayActiveDate)) {
    const firstEmpty = days.find((d) => !trayDayRecipe(d));
    trayActiveDate = (firstEmpty || days[0]).date;
  }
  // 自動で選んだ料理（まだ決めていない日）がある時だけ、よはくが1.5秒「考える」（同じ顔ぶれでは1回だけ。動きを減らす設定・テストでは出さない）
  const autoPicked = days.some((d) => !d.slot && d.candidate);
  const thinkKey = `${dates.join(",")}|${days.map((d) => trayDayRecipe(d)?.id || "").join(",")}`;
  const canAnimate = typeof globalThis.matchMedia === "function" && !globalThis.matchMedia("(prefers-reduced-motion: reduce)")?.matches && typeof setTimeout === "function";
  if (autoPicked && canAnimate && !trayThinking && !trayThoughtKeys.has(thinkKey) && !isTrayDraftActive()) {
    trayThoughtKeys.add(thinkKey);
    trayThinking = true;
    const token = ++trayThinkToken;
    setTimeout(() => {
      if (token !== trayThinkToken) return;
      trayThinking = false;
      trayRevealFresh = true;
      if (state.view === "plan" && typeof render === "function") render();
    }, 1500);
  }
}

// 献立カードのすぐ下：決定・空にする・戻す
function renderTrayActionBar(days) {
  if (!days?.length || trayThinking) return "";
  const filled = days.filter((d) => !!trayDayRecipe(d)).length;
  const all = filled === days.length;
  const dirty = isTrayDraftActive();
  const needConfirm = dirty || days.some((d) => !d.slot);
  const main = all && needConfirm
    ? `<button type="button" class="primary-button tray-confirm-btn" data-action="life-tray-confirm-all">✓ この${days.length}日分で決定・買い物へ</button>`
    : !all
      ? `<p class="tray-need" role="status">あと${days.length - filled}日分、下のカードから選んでね</p>`
      : `<p class="tray-need is-done">${days.length}日分は決定済み ✓</p>`;
  const clear = filled > 0 ? `<button type="button" class="secondary-button tray-clear-all-btn" data-action="life-tray-clear-all">🧹 空にする</button>` : "";
  const sub = [
    trayUndoStack.length ? `<button type="button" class="text-button" data-action="life-tray-undo">↩ 1つ戻す</button>` : "",
    dirty ? `<button type="button" class="text-button" data-action="life-tray-close">元の献立に戻す</button>` : "",
  ].filter(Boolean).join("");
  return `<div class="tray-action-bar"><div class="tray-action-row">${main}${clear}</div>${sub ? `<div class="tray-action-sub">${sub}</div>` : ""}</div>`;
}

// 献立カードの下：棚・候補カード。よはくは候補の外（画面全体の下）に貼りつけ、献立カードを見ている時も目に入るようにする
function renderCardTraySheet() {
  const days = trayTargetDays();
  if (!days.length) return "";
  if (!trayOpen) prepareInlineTray(days);
  if (!trayActiveDate || !days.some((d) => d.date === trayActiveDate)) {
    const firstEmpty = days.find((d) => !trayDayRecipe(d));
    trayActiveDate = (firstEmpty || days[0]).date;
  }
  const activeDay = days.find((d) => d.date === trayActiveDate) || days[0];
  const activeWd = `${weekdayLabel(activeDay.date)}曜`;
  const filledCount = days.filter((d) => !!trayDayRecipe(d)).length;
  const allFilled = filledCount === days.length;
  const combo = computeTrayCombo(days);
  const thinking = trayThinking;

  // 候補カード（理由の札をまとめるため、先に決める）
  const anchorRecipe = trayAnchorId ? findDinnerRecipeById(trayAnchorId) : null;
  const size = 6;
  const candidates = thinking ? [] : trayCandidateList(activeDay.date, days);
  const startIdx = candidates.length ? (trayPage * size) % Math.max(1, candidates.length) : 0;
  const pageItems = [];
  if (candidates.length) {
    for (let i = 0; i < Math.min(size, candidates.length); i += 1) {
      pageItems.push(candidates[(startIdx + i) % candidates.length]);
    }
  }
  // 「似た皿」の時、2枚以上に同じ理由が並ぶなら、その理由はよはくが1回だけ言い、カードには違う理由だけを出す
  const reasonCount = new Map();
  for (const item of pageItems) if (item.simReason && item.r.id !== trayAnchorId) reasonCount.set(item.simReason, (reasonCount.get(item.simReason) || 0) + 1);
  const [commonReason = "", commonCount = 0] = [...reasonCount.entries()].sort((a, b) => b[1] - a[1])[0] || [];
  const sharedReason = commonCount >= 2 ? commonReason : "";
  // 使い回せる野菜も、2枚以上で同じならカードからは外し、よはくが1回だけ言う
  const vegCount = new Map();
  for (const item of pageItems) if (!item.simReason && item.sharedVegHit) vegCount.set(item.sharedVegHit, (vegCount.get(item.sharedVegHit) || 0) + 1);
  const sharedVeg = [...vegCount.entries()].filter(([, c]) => c >= 2).map(([v]) => v);

  let yohakuPose = "normal";
  let yohakuWords = `${activeWd}に入れる一皿を選ぼう（あと${Math.max(0, days.length - filledCount)}日分）`;
  if (thinking) {
    yohakuPose = "wait";
    yohakuWords = `${days.length}日分の献立を考えてるよ…`;
  } else if (trayLastPlaced) {
    yohakuPose = "happy";
    yohakuWords = allFilled
      ? `${trayLastPlaced.wd}曜は「${trayLastPlaced.title}」にしたよ！ ${days.length}日分そろったから「決定」で買い物へ`
      : `${trayLastPlaced.wd}曜は「${trayLastPlaced.title}」にしたよ！ 次は${activeWd}の1皿`;
  } else if (anchorRecipe) {
    yohakuPose = "happy";
    yohakuWords = sharedReason
      ? `🔍「${anchorRecipe.title}」に近い、${sharedReason}の料理を集めたよ`
      : `🔍「${anchorRecipe.title}」に近い料理を集めたよ`;
  } else if (trayRevealFresh && filledCount > 0) {
    yohakuPose = "happy";
    yohakuWords = allFilled
      ? `考えてみたよ！ このままでよければ「決定」。変えたい日は「🔄 選び直す」を押してね`
      : `考えてみたよ！ 空いている${activeWd}の1皿を下から選んでね`;
  } else if (allFilled) {
    yohakuPose = "happy";
    yohakuWords = trayActiveChosen ? `${activeWd}を入れ替えるよ。下のカードから選んでね` : `${days.length}日分そろってるよ。変えたい日は「🔄 選び直す」を押してね`;
  } else if (filledCount === 0) {
    yohakuPose = "wave";
    yohakuWords = `まずは${activeWd}の1皿を選ぼう`;
  } else if (sharedVeg.length > 0) {
    yohakuPose = "happy";
    yohakuWords = `🥬 ${sharedVeg.slice(0, 2).join("・")}を使い回せる料理を先に並べたよ。${activeWd}の1皿を選んでね`;
  } else if (combo.sharedVegList.length > 0) {
    yohakuPose = "happy";
    yohakuWords = `🥬 ${combo.sharedVegList[0]}を使い回せる組み合わせ！次は${activeWd}へ`;
  } else {
    yohakuPose = "happy";
    yohakuWords = `次は${activeWd}の一皿を選ぼう（重ならない候補にしたよ）`;
  }

  const cardsHtml = thinking
    ? `<div class="rc-grid is-thinking" aria-hidden="true">${Array.from({ length: 4 }, () => `<div class="rc-skeleton"></div>`).join("")}</div>`
    : pageItems.length
    ? `<div class="rc-grid">${pageItems.map((item) => renderRecipeTradingCard(item.r, {
        reasonChip: item.r.id === trayAnchorId
          ? "🔍 起点"
          : item.simReason
            ? (item.simReason === sharedReason ? "" : `🔍 ${item.simReason}`)
            : item.sharedVegHit ? (sharedVeg.includes(item.sharedVegHit) ? "" : `🥬 ${item.sharedVegHit}使い回し`) : undefined,
        activeDate: activeDay.date,
        dayWord: activeWd,
        sharedVegHit: item.sharedVegHit,
        simReason: item.simReason,
        isAnchor: item.r.id === trayAnchorId,
        mode: "tray",
      })).join("")}</div>`
    : `<p class="swap-empty">この棚に合う料理がありません。別の棚を選んでみてね。</p>`;

  return `<section class="tray-inline" id="tray-cards" aria-label="${escapeAttr(activeWd)}に入れる候補">
    <h3 class="tray-inline-head">${thinking ? "候補を集めています…" : allFilled && !trayActiveChosen ? `🃏 ほかの候補（「${escapeHtml(activeWd)}へ」で入れ替え）` : `🃏 ${escapeHtml(activeWd)}に入れる候補`}${trayAnchorId && !thinking ? ` <button type="button" class="tray-sim-reset-btn" data-action="life-tray-similar-clear">元の候補に戻る</button>` : ""}</h3>
    <div class="tray-shelves" role="group" aria-label="料理の棚">
      ${TRAY_SHELVES.map(([k, label]) => `<button type="button" class="chip-button tray-shelf-chip" data-action="life-tray-mood" data-mood="${k}" aria-pressed="${trayMood === k}" ${thinking ? "disabled" : ""}>${label}</button>`).join("")}
    </div>
    ${cardsHtml}
    <div class="tray-bottom-bar">
      ${!thinking && candidates.length > size ? `<button type="button" class="secondary-button swap-more" data-action="life-tray-next-page">🔄 別の${size}皿を見る（全${candidates.length}品）</button>` : ""}
    </div>
  </section>
  <div class="tray-yohaku-bar is-dock" data-say="${escapeAttr(yohakuWords)}">
    ${yohaku(yohakuPose, "swap-yohaku")}
    <p class="swap-bubble tray-bubble" role="status"><span class="sr-only">${escapeHtml(yohakuWords)}</span><span class="tray-bubble-text" aria-hidden="true">${escapeHtml(yohakuWords)}</span></p>
  </div>`;
}

// カード裏面モーダル（材料・作り方・投稿者・動画リンク・検証可能な栄養推定）
function renderCardFlipModal() {
  const r = findDinnerRecipeById(trayFlipId);
  if (!r) return "";
  const spec = recipeCardSpec(r);
  const n = spec.nutrition;
  const days = trayTargetDays();
  const activeDay = days.find((d) => d.date === trayActiveDate) || days[0];
  const activeWd = activeDay ? `${weekdayLabel(activeDay.date)}曜` : "献立";
  const servings = dailyProfile().servings || 2;
  const thumb = typeof recipeThumbnail === "function" ? recipeThumbnail(r) : "";
  const creator = (typeof creatorName === "function" && creatorName(r)) || (typeof authorOf === "function" && authorOf(r)) || r.author || r.channelTitle || "";
  const ingList = (r.ingredients || []).map((i) => `<li><span>${escapeHtml(i.name)}</span><b>${escapeHtml(scaleAmountForServings(i.amount, servings, r.sourceServings))}</b></li>`).join("");
  const stepList = (r.steps || []).slice(0, 8).map((s, idx) => `<li><b>${idx + 1}</b><span>${escapeHtml(s)}</span></li>`).join("");

  const fmtVal = (v, partial, unit) => {
    if (v != null && Number.isFinite(v)) return `約${v}${unit}`;
    if (partial != null && Number.isFinite(partial)) return `不明 <small class="rc-partial-sub">（判明分 小計 約${partial}${unit}）</small>`;
    return "不明";
  };
  const saltBreakdownHtml = n.saltSources.length
    ? n.saltSources.map((s) => `<span class="rc-salt-chip">${escapeHtml(s.name)}（${escapeHtml(s.amount)}）${s.perServingSalt != null ? `：約${s.perServingSalt}g/人` : ""}</span>`).join("")
    : `<span class="rc-salt-chip">調味料の分量が特定できないため内訳は不明</span>`;

  const uncalcNote = n.unmatchedItems.length || n.ambiguousItems.length
    ? `<p class="small muted rc-nutri-caveat">※ 分量あいまい・対象外の材料：${escapeHtml([...n.unmatchedItems.map((x) => x.name), ...n.ambiguousItems.map((x) => x.name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).join("・"))}</p>`
    : "";

  return `<div class="rc-flip-overlay" role="dialog" aria-modal="true" tabindex="-1" aria-label="${escapeAttr(r.title)}のカード裏面">
    <div class="rc-flip-backdrop" data-action="life-card-flip-close"></div>
    <div class="rc-flip-card">
      <div class="rc-flip-head">
        <span class="rc-flip-tag">📖 カード裏面（材料・作り方・出典）</span>
        <button type="button" class="round-icon" data-action="life-card-flip-close" aria-label="裏面を閉じる">✕</button>
      </div>
      <div class="rc-flip-hero">
        <img class="rc-flip-art" src="${escapeAttr(spec.artUrl)}" alt="">
        <div>
          <span class="rc-rank-pill">${escapeHtml(spec.rankBadge)}</span>
          <h3>${recipeTitleHtml(r)}</h3>
          <p class="small muted">${escapeHtml(spec.typeText)} · ${escapeHtml(spec.speedText)} · ${escapeHtml(spec.skillText)}</p>
          ${creator ? `<p class="small muted rc-flip-creator">🎬 投稿者：${escapeHtml(creator)}</p>` : ""}
        </div>
      </div>

      ${r.videoUrl ? `<div class="rc-flip-video">
        ${thumb ? `<img src="${escapeAttr(thumb)}" alt="${escapeAttr(r.title)}の動画サムネイル" loading="lazy">` : ""}
        <div class="rc-flip-video-body">
          ${creator ? `<small class="muted">${escapeHtml(creator)}</small>` : ""}
          <a href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noopener noreferrer" class="secondary-button">▶ YouTubeで元の動画を見る</a>
        </div>
      </div>` : ""}

      <div class="rc-flip-columns">
        <div class="rc-flip-sec">
          <h4>🥕 材料（${servings}人分${r.sourceServings ? `・元レシピ${r.sourceServings}人分` : "・元人数不明"}）</h4>
          <ul class="rc-flip-ings">${ingList || "<li>材料データなし</li>"}</ul>
        </div>
        <div class="rc-flip-sec">
          <h4>🍳 作り方（全${(r.steps || []).length}工程）</h4>
          <ol class="rc-flip-steps">${stepList || "<li>動画を見ながら作れます</li>"}</ol>
        </div>
      </div>

      <details class="rc-flip-nutri-box">
        <summary class="rc-flip-nutri-head">
          <strong>📊 1人前の栄養・塩分目安（${escapeHtml(n.statusLabel)}）</strong>
        </summary>
        <div class="rc-param-grid">
          <div class="rc-param-cell"><small>💪 たんぱく質</small><strong>${fmtVal(n.proteinG, n.partialProteinG, "g")}</strong></div>
          <div class="rc-param-cell"><small>🥬 野菜量</small><strong>${fmtVal(n.vegG, n.partialVegG, "g")}</strong></div>
          <div class="rc-param-cell is-salt"><small>🧂 食塩相当量</small><strong>${fmtVal(n.saltG, n.partialSaltG, "g")}</strong></div>
          <div class="rc-param-cell"><small>🔥 エネルギー</small><strong>${fmtVal(n.kcal, n.partialKcal, "kcal")}</strong></div>
        </div>
        <div class="rc-salt-sources">${saltBreakdownHtml}</div>
        <p class="rc-lowsalt-tip">💡 ${escapeHtml(n.lowSaltTip)}</p>
        ${uncalcNote}
        <p class="small muted rc-nutri-source">参考：${escapeHtml(n.foodDbSource)}（版 ${escapeHtml(n.calcVersion)}）</p>
      </details>

      <div class="rc-flip-foot">
        ${activeDay && trayOpen && state.view === "plan" ? `<button type="button" class="primary-button" data-action="life-tray-place" data-recipe="${escapeAttr(r.id)}" data-date="${escapeAttr(activeDay.date)}">📥 ${escapeHtml(activeWd)}のトレイに並べる</button>` : ""}
        <button type="button" class="secondary-button" data-action="life-card-flip-close">閉じる</button>
      </div>
    </div>
  </div>`;
}

// 食後の1タップ評価（§54）を邪魔しない、コンパクトなカード獲得・進化バナー（今日タブ内）
function renderCardGetBanner(recipe) {
  if (!cardGetBannerRecipeId) return "";
  const target = recipe || findDinnerRecipeById(cardGetBannerRecipeId);
  const bannerRec = findDinnerRecipeById(cardGetBannerRecipeId);
  if (!target || (target.id !== cardGetBannerRecipeId && target.starterId !== cardGetBannerRecipeId && bannerRec?.starterId !== target.id)) return "";
  const spec = recipeCardSpec(target);
  if (!spec || !spec.isCollected || spec.cooks > 3) return "";
  const label = spec.cooks === 3
    ? `👑 3回目の調理で「わが家の定番カード」に進化しました！`
    : spec.cooks === 2
      ? `★★ 2回目の調理で「常連カード」に進化しました！`
      : `✨ 初調理！「${target.title}」のカードをGETしました！`;
  return `<div class="rc-get-inline-banner" role="status">
    <span class="rc-get-inline-text">${escapeHtml(label)}</span>
    <button type="button" class="text-button rc-get-inline-btn" data-action="life-card-book-open">📖 図鑑を見る ›</button>
  </div>`;
}

// スタンドアロンのカードGETお祝いモーダル（データを一切書き換えず表示のみ行う）
function renderCardGetModal() {
  if (!cardGetRecipeId) return "";
  const r = findDinnerRecipeById(cardGetRecipeId);
  if (!r) return "";
  const baseSpec = recipeCardSpec(r);
  const cooks = Math.max(1, baseSpec.cooks);
  const rank = cooks >= 3 ? "gold" : cooks === 2 ? "silver" : "bronze";
  const seal = cooks >= 3 ? "👑 定番" : cooks === 2 ? "★★ 常連" : "★ GET";

  return `<div class="rc-get-overlay" role="dialog" aria-modal="true" tabindex="-1" aria-label="レシピカードGET！">
    <div class="rc-get-backdrop" data-action="life-card-get-close"></div>
    <div class="rc-get-stage">
      <h3 class="rc-get-heading">🎉「${escapeHtml(r.title)}」の<br>レシピカードをGETしました！</h3>
      <p class="rc-get-sub">わが家のカード図鑑にコレクションされました（通算 ${cooks}回調理）</p>

      <div class="rc-get-showcase">
        <article class="rc-card is-collected is-rank-${rank} is-celebrating">
          <div class="rc-card-inner">
            <div class="rc-top-row">
              <span class="rc-speed-badge is-${baseSpec.speedTier}">${escapeHtml(baseSpec.speedText)}</span>
              <span class="rc-type-badge">${escapeHtml(baseSpec.pIcon + baseSpec.pName)}</span>
            </div>
            <div class="rc-plate-wrap ${baseSpec.imageKind === "photo" ? "is-photo" : ""}">
              <img class="rc-plate-img" src="${escapeAttr(baseSpec.artUrl)}" alt="${escapeAttr(r.title)}">
              <span class="rc-foil-seal"><b>${escapeHtml(seal)}</b></span>
            </div>
            <div class="rc-title-block">
              <h4 class="rc-dish-title">${recipeTitleHtml(r)}</h4>
            </div>
          </div>
        </article>
      </div>

      <div class="rc-get-actions">
        <button type="button" class="primary-button" data-action="life-card-book-open">📖 わが家のカード図鑑を見る</button>
        <button type="button" class="secondary-button" data-action="life-card-get-close">閉じる</button>
      </div>
    </div>
  </div>`;
}

// 「📖 わが家のカード図鑑」シート（GET済のカードと、これから作れる未調理カードを一覧）
// わが家のカード図鑑：振り返りタブの「わたしの食卓」の見せ方の1つ（カレンダー・写真・図鑑。2026-11-11 のユーザーの判断）
function renderCardBookInline() {
  const all = allDinnerRecipes();
  const collected = all.filter((r) => cardCookCount(r) > 0);
  const drafts = all.filter((r) => cardCookCount(r) === 0).slice(0, 12);
  return `<div class="rc-book">
    <p class="small muted">献立で選んで「作った！」を記録すると、カードが集まります（GET済 ${collected.length}枚）。</p>
    ${collected.length ? `<h4 class="rc-book-sec-title">✨ 作ってGETしたカード（${collected.length}枚）</h4>
      <div class="rc-grid">${collected.map((r) => renderRecipeTradingCard(r, { mode: "book" })).join("")}</div>`
    : `<div class="rc-book-empty"><p>まだGETしたカードがありません。献立を作って「作った！」を押すと、ここにカードが集まります。</p></div>`}
    <h4 class="rc-book-sec-title">📝 これから作ってGETできるカード（一部）</h4>
    <div class="rc-grid">${drafts.map((r) => renderRecipeTradingCard(r, { mode: "book" })).join("")}</div>
  </div>`;
}
// 古い呼び名（テスト・ほかの場所から）
function renderCardBookSheet() { return renderCardBookInline(); }

// 開発者コンソール等から実データを一切汚さずにGET演出だけを確認するための純粋プレビュー関数
function previewCardGetModal(recipeId) {
  const r = findDinnerRecipeById(recipeId) || allDinnerRecipes()[0];
  if (!r) return false;
  cardGetRecipeId = r.id;
  if (typeof render === "function") render();
  return true;
}

// トレイ＆カード関連のアクション処理
function handleCardTrayAction(action, data, before) {
  // 「考えてみたよ！」は、開いた直後だけ。何か操作したら、ふつうの案内に戻す（裏面を見るだけなら残す）
  if (trayRevealFresh && /^life-tray-(?!open)/.test(action)) trayRevealFresh = false;
  if (trayLastPlaced && /^life-tray-/.test(action)) trayLastPlaced = null;
  // 考えている間は、トレイの操作を受け付けない（閉じるのはOK）
  if (trayThinking && /^life-tray-/.test(action) && !["life-tray-open", "life-tray-close"].includes(action)) return true;
  const mutationActions = new Set([
    "life-tray-open",
    "life-tray-place",
    "life-tray-clear-all",
    "life-tray-clear-one",
    "life-tray-undo",
    "life-tray-confirm-all",
  ]);
  if (mutationActions.has(action) && isViewer()) {
    showToast("見るだけモードです。食べたいものは🙋で送ってね。");
    return true;
  }

  if (action === "life-tray-open") {
    // 献立トレイは献立タブの中にある。ほかの場所から呼ばれたら、献立タブへ移って、その日を選ぶ
    if (swapDate) {
      swapCommit();
      swapDate = "";
    }
    cardBookOpen = false;
    trayAnchorId = "";
    trayFlipId = "";
    trayPage = 0;
    // 先に献立タブへ（タブを変えると重なった画面が閉じるため、下書きはそのあとで作る）
    if (state.view !== "plan") {
      if (typeof setView === "function") setView("plan");
      else state.view = "plan";
    }
    const days = trayTargetDays();
    prepareInlineTray(days);
    // 呼ばれた時点の献立を下書きの元として固定する（変えていなければ、次に描く時に献立を追いかける形へ戻る）
    if (!isTrayDraftActive() && days.length) initTrayDraft(days);
    if (data.date && days.some((d) => d.date === String(data.date))) trayActiveDate = String(data.date);
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-tray-close") {
    // 「元の献立に戻す」：下書き（trayDraft）を捨てる。献立・買い物・同期は何も変えていない
    trayFlipId = "";
    trayAnchorId = "";
    trayDraft = {};
    trayInitialDraft = {};
    trayBasePlan = {};
    trayUndoStack = [];
    trayClearedDates = new Set();
    trayOpen = false;
    trayThinking = false;
    trayThinkToken += 1;
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-tray-select-day" && data.date) {
    trayActiveDate = String(data.date);
    trayActiveChosen = true;
    trayPage = 0;
    // 「🔄 選び直す」から来た時は、下の候補カードまで送る
    if (data.scroll === "cards" && typeof setTimeout === "function" && typeof document !== "undefined") {
      setTimeout(() => document.getElementById?.("tray-cards")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 30);
    }
    return true;
  }
  if (action === "life-tray-undo") {
    const prev = trayUndoStack.pop();
    if (prev) {
      trayDraft = { ...prev.draft };
      if (prev.activeDate) trayActiveDate = prev.activeDate;
      syncTrayClearedSet();
      showToast("↩ 1つ前の状態に戻しました");
    }
    return true;
  }
  if (action === "life-tray-clear-all") {
    const days = trayTargetDays();
    if (!Object.keys(trayDraft).length) initTrayDraft(days);
    pushTrayUndo();
    for (const d of days) {
      trayDraft[d.date] = null;
    }
    syncTrayClearedSet();
    if (days[0]) trayActiveDate = days[0].date;
    trayActiveChosen = false;
    trayAnchorId = "";
    trayPage = 0;
    return true;
  }
  if (action === "life-tray-clear-one" && data.date) {
    const targetDate = String(data.date);
    if (!Object.keys(trayDraft).length) initTrayDraft(trayTargetDays());
    if (Object.prototype.hasOwnProperty.call(trayDraft, targetDate)) {
      pushTrayUndo();
      trayDraft[targetDate] = null;
      syncTrayClearedSet();
      trayActiveDate = targetDate;
    }
    return true;
  }
  if (action === "life-tray-mood") {
    trayMood = trayMood === data.mood ? "" : String(data.mood || "");
    trayPage = 0;
    return true;
  }
  if (action === "life-tray-similar" && data.recipe) {
    trayAnchorId = trayAnchorId === data.recipe ? "" : String(data.recipe);
    trayPage = 0;
    return true;
  }
  if (action === "life-tray-similar-clear") {
    trayAnchorId = "";
    trayPage = 0;
    return true;
  }
  if (action === "life-tray-next-page") {
    trayPage += 1;
    return true;
  }
  if (action === "life-tray-place" && data.recipe) {
    const plan = dailyPlan();
    const locks = lockedDates(plan);
    const days = trayTargetDays();
    if (!Object.keys(trayDraft).length) initTrayDraft(days);
    const targetDate = String(data.date || trayActiveDate || days[0]?.date || "");
    const dayObj = plan.find((d) => d.date === targetDate);
    if (!targetDate || !dayObj || locks.has(targetDate) || dayObj.off || dayObj.prestart || dayObj.slot?.status === "cooked" || dayObj.slot?.status === "off") {
      showToast("この日は変更できません。");
      return true;
    }
    const r = findDinnerRecipeById(data.recipe);
    if (!r) return true;
    const fit = Lifestyle.fit(r, dailyProfile(), targetDate);
    if (!fit.ok) {
      showToast("条件（食べられない食材・器具・時間）に合わないため並べられません。");
      return true;
    }
    pushTrayUndo();
    trayDraft[targetDate] = r.id;
    syncTrayClearedSet();
    trayFlipId = "";
    trayAnchorId = "";
    trayPage = 0;

    // 次の空席（または次の日）へフォーカスを移動
    const curIdx = days.findIndex((d) => d.date === targetDate);
    const nextEmpty = days.slice(curIdx + 1).find((d) => !trayDayRecipe(d))
      || days.find((d) => !trayDayRecipe(d))
      || days[curIdx + 1]
      || days[curIdx];
    if (nextEmpty) trayActiveDate = nextEmpty.date;
    trayActiveChosen = false;
    trayLastPlaced = { wd: weekdayLabel(targetDate), title: r.title };
    return true;
  }
  if (action === "life-tray-confirm-all") {
    const plan = dailyPlan();
    const locks = lockedDates(plan);
    const currentDays = trayTargetDays();
    if (!Object.keys(trayDraft).length && currentDays.length) initTrayDraft(currentDays);
    const targetDates = trayTargetDates.length
      ? [...trayTargetDates]
      : Object.keys(trayInitialDraft).length
        ? Object.keys(trayInitialDraft)
        : currentDays.map((d) => d.date);
    if (!targetDates.length) return true;

    // 1. 事前検証（トレイを開いた時点の全対象日について、1日でもお休み・調理済み・ロック・空席・制約違反があれば部分確定せず中断）
    const p = dailyProfile();
    const validated = [];
    for (const date of targetDates) {
      const latestDay = plan.find((x) => x.date === date);
      if (!latestDay || locks.has(date) || latestDay.off || latestDay.prestart || latestDay.slot?.status === "cooked" || latestDay.slot?.status === "off") {
        showToast(`${formatDate(date)}は変更できない状態のため、決定を中断しました。`);
        return true;
      }
      const rid = trayDraft[date];
      if (!rid) {
        showToast("すべての日の料理を並べてから決定してください。");
        return true;
      }
      const r = findDinnerRecipeById(rid);
      if (!r || !Lifestyle.fit(r, p, date).ok) {
        showToast(`「${r?.title || "選択中の料理"}」が条件に合わないため、決定を中断しました。`);
        return true;
      }
      validated.push({ date, day: latestDay, recipe: r });
    }

    // 2. 家族共有でトレイ編集中の間に他端末から同じ日が書き換えられていないか検査（無言上書きの防止）
    // 競合を検出した時点では saveOwnRecipe を呼ばず、トレイの下書き（他日の変更を含む）も破棄せず保持する
    if (typeof planSnapshot === "function" && typeof samePlan === "function") {
      const currentSnap = planSnapshot(state);
      const conflictDates = [];
      for (const item of validated) {
        const baseSnap = trayBasePlan[item.date] || null;
        const nowSnap = currentSnap[item.date] || null;
        if (Object.prototype.hasOwnProperty.call(trayBasePlan, item.date) && !samePlan(baseSnap, nowSnap)) {
          const previewSlot = confirmedSlot(item.date, clone(item.recipe));
          const localSnap = { slot: previewSlot };
          if (!samePlan(localSnap, nowSnap)) {
            state.sync = state.sync || {};
            state.sync.conflicts = state.sync.conflicts || {};
            state.sync.conflicts[item.date] = { local: localSnap, remote: nowSnap };
            conflictDates.push(item.date);
          }
        }
      }
      if (conflictDates.length) {
        trayOpen = false;
        trayFlipId = "";
        syncHasSheetBodyClass();
        showToast("家族の端末で同じ日の献立が更新されたため、残す献立を選んでください。");
        return true;
      }
    }

    // 3. 既存の life-confirm と同じ確定パイプラインを通す
    // 開いた時と同じ料理のまま・すでに確定済みの日は confirmDaily を呼ばない（買い物済み食材がリストに復活するのを防ぐ）
    if (rhythmOn()) {
      const blocks = planPageBlocks();
      const currentBlock = blocks.find((b) => b.key === planPage) || blocks.find((b) => b.end >= today()) || blocks[0];
      if (currentBlock) {
        planPage = currentBlock.key;
        shopPage = currentBlock.key;
        shopCombineNext = false;
      }
    }
    trackDaily("plan_confirmed", {
      days: validated.length,
      via: "tray",
    });

    const hadConfirmed = targetDates.some((date) => state.mealSlots?.[date]?.status === "confirmed");
    state.planOverrides = state.planOverrides || {};
    let changedAnyConfirmed = false;
    for (const item of validated) {
      const existingSlot = state.mealSlots?.[item.date];
      const unchangedConfirmed =
        existingSlot?.status === "confirmed" &&
        trayDraft[item.date] === trayInitialDraft[item.date] &&
        (existingSlot.recipe?.id === item.recipe.id || existingSlot.recipe?.starterId === item.recipe.id);
      if (unchangedConfirmed) continue;
      state.planOverrides[item.date] = item.recipe.id;
      confirmDaily({ date: item.date }, item.recipe);
      changedAnyConfirmed = true;
    }
    if (hadConfirmed && changedAnyConfirmed) changedShopping(before || []);
    else if (!hadConfirmed) shoppingNotice = "";

    trayOpen = false;
    trayFlipId = "";
    trayAnchorId = "";
    trayDraft = {};
    trayInitialDraft = {};
    trayBasePlan = {};
    trayTargetDates = [];
    trayUndoStack = [];
    trayClearedDates = new Set();
    if (typeof setView === "function") setView("shopping");
    else state.view = "shopping";
    syncHasSheetBodyClass();
    showToast(`🎉 ${validated.length}日分の献立を決定しました！買い物リストへ進みます`);
    return true;
  }
  if (action === "life-card-flip" && data.recipe) {
    flipTriggerSelector = `[data-action="life-card-flip"][data-recipe="${typeof CSS !== "undefined" && CSS?.escape ? CSS.escape(String(data.recipe)) : String(data.recipe)}"]`;
    lastModalTriggerSelector = flipTriggerSelector;
    trayFlipId = String(data.recipe);
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-card-flip-close") {
    trayFlipId = "";
    lastModalTriggerSelector = flipTriggerSelector || lastModalTriggerSelector;
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-card-get-demo" && data.recipe) {
    // 第1段階：保存レシピ・調理記録・評価・同期データを一切書き換えない純粋プレビューのみ
    previewCardGetModal(String(data.recipe));
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-card-get-close") {
    cardGetRecipeId = "";
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-card-book-open") {
    // 図鑑は振り返りタブで見る
    cardGetRecipeId = "";
    trayFlipId = "";
    cardBookOpen = false;
    reflView = "book";
    try { localStorage.setItem("ripigochi-refl-view", reflView); } catch {}
    if (typeof setView === "function") setView("repeat");
    else state.view = "repeat";
    syncHasSheetBodyClass();
    return true;
  }
  if (action === "life-card-book-close") {
    cardBookOpen = false;
    trayFlipId = "";
    syncHasSheetBodyClass();
    return true;
  }
  return false;
}
