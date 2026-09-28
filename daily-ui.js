/* Daily experience. Existing recipe importing/editing remains in app.js. */
let profileEditing = false;
let swapDate = "";
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
  "ごはんの好み診断",
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
  return state.onboardingDraft;
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
  return `<dl class="profile-summary">${rows.map(([k, v], i) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd>${dailyButton("life-section", "変更", `data-step="${[0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14][i]}"`)}</div>`).join("")}</dl>`;
}
// ベータ版の目印：いまは晩ごはんだけ（朝ごはん・お弁当はこれから）。
const betaBadge = () => `<span class="beta-badge">ベータ版 <i>for 晩ごはん</i></span>`;
const betaNote = () => `<p class="beta-note">${betaBadge()}${tip("朝ごはん・お弁当は準備中です")}</p>`;
function renderWelcome() {
  document.body.classList.add("is-onboarding");
  // 質問の前に、何ができるアプリかを見せる（文脈がわかってから答えてもらう）。
  document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard welcome-card"><p class="eyebrow">リピごち ${betaBadge()}</p><h2 tabindex="-1">保存した料理動画が、<br><span class="marker">来週の献立</span>になる。</h2>
    <ol class="welcome-flow" aria-label="リピごちでできること"><li><span aria-hidden="true">📱</span><b>動画を貼る</b><small>YouTube・TikTok</small></li><li><span aria-hidden="true">🤖</span><b>AIが読む</b><small>材料・作り方・時間</small></li><li><span aria-hidden="true">🗓</span><b>献立が決まる</b><small>かぶらず自動で</small></li><li><span aria-hidden="true">🛒</span><b>買い物リスト</b><small>まとめて1回</small></li></ol>
    <p class="small">いくつかの質問に答えると、<b>あなたの家族専用</b>の献立を作ります。</p><p class="muted small beta-line">いまは<b>晩ごはん</b>の献立だけ。朝ごはん・お弁当は準備中です。</p><div class="welcome-actions">${dailyButton("life-quick", "はじめる（約3分）", "", true)}${dailyButton("life-preview", "設定せずに見てみる")}</div><button type="button" class="text-button" data-action="life-detailed">好み・器具・常備品まで詳しく設定する</button></section>`;
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
    ...(skillProfile() && !isViewer() ? { skillLevel: state.skillProfile.level, skillGrowth: state.skillProfile.growth } : {}),
    servings: state.servingCount,
  });
}
function allDinnerRecipes() {
  const personal = state.recipes.filter((r) => r.mealType === "dinner");
  const originals = new Set(personal.map((r) => r.starterId));
  return [
    ...personal,
    ...(showStarters() ? [...discoverRecipes(), ...Lifestyle.curated.filter((r) => !originals.has(r.id) && !starterHidden().has(r.id))] : []),
  ];
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
function dailyPlan() {
  const p = dailyProfile();
  return Lifestyle.propose({
    history: mealHistory(120),
    recipes: planRecipes(),
    profile: p,
    slots: state.mealSlots || {},
    start: today(),
    length: rhythmOn() ? rhythmPlanDays() : state.planLength || p.period,
    addDays,
    overrides: state.planOverrides,
    cyclesOf: (r) => ({ ...likedCycles(r), ...recipeRatings(r) }),
    offUntil: prestartUntil(),
    requestOf: openRequestFor,
    // 1回の買い物で作る日。日持ちしない食材の料理を、買い物のすぐあとに回すのに使う。
    rounds: rhythmOn() ? currentBlocks().map((b) => b.dates) : null,
    pins: folderPins(),
  });
}
// ----- 最近のごはんカレンダー（日曜はじまり、今週を含む3週・今日まで写真、先は予定） -----
let calPick = "";
function renderMealCalendar() {
  const eaten = new Map();
  mealHistory(21).slice().reverse().forEach((m) => eaten.set(m.date, m.recipe));
  const planned = new Map(dailyPlan().map((d) => [d.date, d.slot?.status === "off" || d.off ? null : d.slot?.recipe || d.candidate?.recipe]));
  const t = today();
  const dow = new Date(t + "T12:00:00").getDay();
  const start = addDays(addDays(t, -dow), -14);
  const cells = Array.from({ length: 21 }, (_, i) => {
    const date = addDays(start, i);
    const future = date > t;
    const r = future ? planned.get(date) : eaten.get(date) || (date === t ? planned.get(date) : null);
    const cls = ["cal-cell", date === t ? "is-today" : "", future ? "is-future" : "", calPick === date ? "is-picked" : ""].filter(Boolean).join(" ");
    const day = Number(date.slice(8, 10));
    return r
      ? `<button type="button" class="${cls}" data-action="life-cal-pick" data-date="${date}" aria-label="${escapeAttr(`${formatDate(date)} ${r.title}`)}">${dishTile(r)}<span>${day}</span></button>`
      : `<span class="${cls} is-empty"><span>${day}</span></span>`;
  }).join("");
  const pickRecipe = calPick ? (calPick > t ? planned.get(calPick) : eaten.get(calPick) || planned.get(calPick)) : null;
  return `<section class="meal-cal" aria-label="最近のごはん"><h3 class="section-title"><span class="marker">最近のごはん</span><small>3週間</small></h3>
    <div class="cal-head">${["日", "月", "火", "水", "木", "金", "土"].map((w) => `<span>${w}</span>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
    <p class="cal-caption">${pickRecipe ? `${formatDate(calPick)}（${weekdayLabel(calPick)}）${calPick > t ? "の予定" : ""}：<b>${escapeHtml(pickRecipe.title)}</b>` : "写真をタップすると料理名が出ます。点線は予定です。"}</p></section>`;
}
// Why this dish on this day, most important first: request, who wants it again (and when), variety, season.
function planReason(day) {
  const c = day.candidate;
  if (day.slot) return [openRequestFor(day.slot.recipe || {}) && `${openRequestFor(day.slot.recipe).from}のリクエスト`, day.repeat?.reason, day.rotation?.reason, day.season?.reason].find(Boolean) || "";
  return c ? [c.request && `${c.request.from}のリクエスト`, c.warn, c.chosen && "✋ 自分で決めた一皿", c.challenge && `ちょっと挑戦 ${"★".repeat(c.skillNeed)}`, c.repeat?.reason, c.rotation?.reason, c.season?.reason].find(Boolean) || "" : "";
}
// The last time someone pressed 買い物完了. Meals confirmed before it were bought on that trip.
function lastShoppedAt() {
  const done = Object.values(state.shopDone || {});
  if (state.round?.status === "done" && state.round.updatedAt) done.push(state.round.updatedAt);
  return done.sort().pop() || "";
}
function tripSlots() {
  const since = lastShoppedAt();
  return Object.fromEntries(Object.entries(state.mealSlots || {}).filter(([, s]) => !s.bought && (!since || (s.updatedAt || "") > since)));
}
// Meals this shopping trip is for (confirmed, not cooked, not bought on an earlier trip).
function tripMeals() {
  return Object.values(tripSlots()).filter((s) => s.status === "confirmed" && s.date >= today() && s.recipe).sort((a, b) => a.date.localeCompare(b.date));
}
function renderTripMeals() {
  const meals = tripMeals();
  if (!meals.length) return "";
  const first = meals[0].date, last = meals[meals.length - 1].date;
  const range = first === last ? `${formatDate(first)}（${weekdayLabel(first)}）` : `${formatDate(first)}（${weekdayLabel(first)}）〜${formatDate(last)}（${weekdayLabel(last)}）`;
  return `<section class="trip-meals" aria-label="この買い物で作るごはん"><p class="trip-range"><b>${range}</b> ${meals.length}食分</p><div class="trip-row">${meals.map((m) => `<button type="button" class="trip-meal" data-action="life-cook" data-date="${m.date}" aria-label="${escapeAttr(`${formatDate(m.date)} ${m.recipe.title}`)}">${dishTile(m.recipe)}<small>${WD[new Date(m.date + "T12:00:00").getDay()]}</small></button>`).join("")}</div></section>`;
}
function dailyShopping() {
  const p = dailyProfile();
  const length = rhythmOn() ? rhythmPlanDays() :
    p.shoppingFrequency === "daily"
      ? 1
      : p.shoppingFrequency === "weekly"
        ? 7
        : state.planLength || 3;
  return Lifestyle.shopping({
    slots: tripSlots(),
    start: today(),
    end: addDays(today(), length - 1),
    scale: scaleAmountForServings,
    combine: combineAmounts,
    pantry: p.pantry,
    marks: state.shoppingMarks || {},
    manual: state.manualShopping || {},
  });
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
function renderDailyPlan() {
  const plan = dailyPlan();
  const locks = lockedDates(plan);
  const n = state.planLength || 3;
  const cardList = plan
    .map((day) => {
      const recipe = day.slot?.recipe || day.candidate?.recipe;
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
      if (!recipe)
        return `<article class="plan-card"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>🤔</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">条件に合う候補がありません</strong><p class="plan-time">時間・食材・器具をゆるめるか、レシピを追加してください。</p>${dailyButton("life-profile", "条件を確認")}</div></article>`;
      const status = day.slot?.status === "cooked" ? "作った" : day.slot ? "確定" : "";
      const note = carryNote(day.slot) || planReason(day) || (bothLike(recipe) ? "ふたりとも好き" : lastEatenLabel(recipe) === "はじめて" ? "はじめての一皿" : lastEatenLabel(recipe));
      const minutes = recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "";
      // 「⋯」はカードの下にメニューを開く（カードの外にはみ出すと、スマホでは押せない）。
      const more = day.slot?.status === "cooked" || isViewer() ? "" : `<button type="button" class="plan-icon plan-more-btn" data-action="life-more" data-date="${day.date}" aria-expanded="${moreDate === day.date}" aria-label="${dateLabel}のその他の操作">${moreDate === day.date ? "×" : "⋯"}</button>`;
      const swap = day.slot?.status === "cooked" ? "" : `<button type="button" class="plan-icon plan-swap" data-action="${swapDate === day.date ? "life-close-swap" : "life-swap"}" data-date="${day.date}" aria-expanded="${swapDate === day.date}" aria-label="${swapDate === day.date ? "候補を閉じる" : `${dateLabel}の料理を入れ替える`}">${swapDate === day.date ? "閉じる" : isViewer() ? '<span aria-hidden="true">🙋</span><span class="plan-icon-label">別のがいい</span>' : '<span aria-hidden="true">☰</span><span class="plan-icon-label">選択</span>'}</button>`;
      return `<article class="plan-card ${swapDate === day.date ? "is-swapping" : ""}"><button type="button" class="plan-photo plan-main" data-action="life-cook" data-date="${day.date}" aria-label="${dateLabel} ${escapeAttr(recipe.title)}の作り方を見る">${dishTile(recipe)}${badge}</button><div class="plan-body"><p class="plan-date">${dateLabel}${status ? ` · <b class="plan-status">${status}</b>` : ""}</p><button type="button" class="plan-title" data-action="life-cook" data-date="${day.date}">${recipeTitleHtml(recipe)}</button>${minutes ? `<p class="plan-time"><span class="marker">${minutes}</span></p>` : ""}<p class="hand plan-note">${escapeHtml(note)}</p>${!isViewer() && !recipe.steps?.length && canRereadRecipe(recipe) ? `<button type="button" class="text-button plan-fill" data-action="life-fill-video" data-recipe="${escapeAttr(recipe.id)}" ${rereadingId ? "disabled" : ""}>${rereadingId === recipe.id ? "動画を読んでいます…" : `🎬 動画で作り方をそろえる${ticketPrice()}`}</button>` : ""}<div class="plan-controls">${swap}${more}</div></div>${day.slot ? conditionWarning(recipe, day.date) : ""}${renderSwapRequests(day.date)}</article>${swapDate === day.date ? renderSwapChoices() : ""}${renderPlanMenu(plan, day)}${renderSkipPanel(day.date)}`;
    })
    ;
  const cards = cardList.map((html, i) => {
    if (!rhythmOn()) return html;
    const date = plan[i].date;
    const b = currentBlocks().find((x) => x.dates.includes(date));
    if (!b) return html;
    const first = date === b.dates.find((d) => d >= today());
    const last = date === b.end;
    const st = blockStatus(b);
    const label = { open: `受付中・${deadlineLabel(b.shopAt)}に買い物`, late: "買い物の予定を過ぎました", decided: "決定 ✓", shopped: "買い物済み ✓" }[st];
    const head = first ? `<h3 class="block-head is-${st}"><span>${blockRange(b)}</span><small>${label}</small></h3>` : "";
    const needs = plan.some((d) => b.dates.includes(d.date) && d.candidate && !locks.has(d.date));
    const foot = last && needs && !isViewer() ? `<div class="block-foot">${dailyButton("life-confirm", `${blockRange(b)}をこれで決定`, `data-block="${b.key}"`, true)}</div>` : "";
    return head + html + foot;
  }).join("");
  const ready = plan.filter((d) => d.candidate && !locks.has(d.date)).length;
  return `${renderFirstPlanReveal()}<section class="plan-top"><div class="plan-tools page-actions">${rhythmOn() ? "" : `<div class="segmented" role="group" aria-label="献立の日数">${[3, 7].map((d) => `<button class="choice-button" aria-pressed="${n === d}" data-action="life-length" data-length="${d}">${d}日</button>`).join("")}</div>`}${isViewer() ? "" : `<button type="button" class="round-icon" data-action="${!state.foodProfile?.completed ? "life-quick" : "life-profile"}" aria-label="条件を調整"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>`}</div></section>${renderFreeUsedCard(plan)}${renderTicketNudge("plan")}${renderRhythmInvite()}${plan.some((d) => d.candidate && !d.slot) ? renderRoundReview({ where: "plan" }) : ""}${renderRoundCard()}${renderWeekBoard()}${isViewer() ? "" : renderRequests()}${!isViewer() && !state.foodProfile?.completedAt ? `<p class="muted small plan-trial">お試しの提案 ${tip("食材制限・調理時間・器具は、作る前に確認してください")}</p>` : ""}<section class="plan-list">${cards}${ready && !isViewer() && !rhythmOn() ? dailyButton("life-confirm", "これで決定・買い物へ", "", true) : ""}<p class="plan-foot">${tip("食材制限がある時は、作り方と市販品の表示も確認してください")}</p></section>${renderShareInvite()}`;
}
let swapShowAll = false;
// 好きの度合い（評価）：「明日でも」がいちばん。家族の中でいちばん低い評価で比べる。
const LOVE = { tomorrow: 5, weekly: 4, twice_month: 3, monthly: 2, pause: 1 };
function loveScore(r) {
  const c = Object.values(recipeRatings(r)).filter((x) => LOVE[x]);
  return c.length ? Math.min(...c.map((x) => LOVE[x])) : 0;
}
// 「選択」：まだ作っていないレシピの上位3件 → 評価順のベスト3 → ほかの候補。
// 定番フォルダの料理なら、フォルダの中の「まだ作っていない作り方」と「ランキング」。
// 🔗 動画のURLから、その日の献立に入れる。YouTubeは説明文をその場で読む（チケットは使わない）。
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
    done(recipe, (recipe.steps || []).length ? "" : "（作り方は、作る画面の📹で動画から読めます）");
  } catch (error) {
    urlInsert = { date, status: "error", message: error.code === "no_tickets" ? "チケットが足りません" : (error.message || "読み取れませんでした") };
    render();
  }
}
function renderUrlInsert() {
  if (isViewer()) return "";
  const u = urlInsert.date === swapDate ? urlInsert : { status: "idle" };
  if (u.status === "loading") return `<div class="swap-url is-busy" aria-live="polite">🤖 動画を読んでいます…</div>`;
  return `<div class="swap-url"><input id="swap-url" class="input" type="url" inputmode="url" placeholder="🔗 動画のURLを貼って入れる" aria-label="動画のURL"><button type="button" class="primary-button" data-action="life-url-insert" data-date="${swapDate}">入れる</button></div>${u.status === "error" ? `<p class="form-error small">${escapeHtml(u.message)}</p>` : ""}`;
}
function renderSwapChoices() {
  const p = dailyProfile();
  const current = dailyPlan().find((d) => d.date === swapDate);
  const currentRecipe = current?.slot?.recipe || current?.candidate?.recipe;
  const id = currentRecipe?.id;
  const used = new Set(
    dailyPlan()
      .filter((d) => d.date !== swapDate)
      .map((d) => d.slot?.recipe?.id || d.candidate?.recipe.id),
  );
  const all = allDinnerRecipes()
    .filter((r) => r.id !== id && !Object.values(recipeRatings(r)).includes("never"))
    .map((r) => ({ r, fit: Lifestyle.fit(r, p, swapDate) }))
    .filter(({ r, fit }) => fit.ok || (!r.curated && Lifestyle.reviewable(r, p, swapDate)))
    .sort((a, b) => Number(!!a.r.curated) - Number(!!b.r.curated) || Number(used.has(a.r.id)) - Number(used.has(b.r.id)) || Number(!a.fit.ok) - Number(!b.fit.ok) || (b.fit.score || 0) - (a.fit.score || 0));
  const option = ({ r, fit }, medal = "") => isViewer()
    ? (fit.ok ? `<button type="button" class="swap-option" data-action="life-request-swap" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${recipeTitleHtml(r)}</strong><small>${escapeHtml(lastEatenLabel(r))}</small></span><b aria-hidden="true">送る</b></button>` : "")
    : fit.ok
    ? `<button type="button" class="swap-option" data-action="life-choose" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${medal ? `<i class="swap-medal">${medal}</i>` : ""}${recipeTitleHtml(r)}</strong><small>${escapeHtml(planMeta(r, fit.reasons) || "保存したレシピ")}${used.has(r.id) ? " · ほかの日と同じ" : ""}</small></span><b aria-hidden="true">選ぶ</b></button>`
    : `<button type="button" class="swap-option needs-review" data-action="life-review-saved" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${recipeTitleHtml(r)}</strong><small>確認が必要 · 時間と材料を確認すると選べます</small></span><b aria-hidden="true">確認</b></button>`;
  const group = (title, items, medals = false) => items.length ? `<p class="swap-group">${title}</p>${items.map((x, i) => option(x, medals ? MEDALS[i] : "")).join("")}` : "";
  const folder = currentRecipe && folderOfRecipe(currentRecipe);
  const shownIds = new Set();
  const take = (list, n) => list.filter((x) => !shownIds.has(x.r.id)).slice(0, n).map((x) => (shownIds.add(x.r.id), x));
  let head = "";
  if (folder && !isViewer()) {
    const mine = all.filter((x) => x.r.folder === folder.key);
    const ranked = folderRanking(folder).map((r) => mine.find((x) => x.r.id === r.id)).filter(Boolean);
    head = `<p class="swap-folder">📁 <b>${escapeHtml(folder.name)}</b>の作り方</p>${group("🆕 まだ作っていない", take(mine.filter((x) => !cookCount(x.r)), 3))}${group("🏆 ランキング", take(ranked, 3), true)}
      <button type="button" class="text-button" data-action="life-folder-open" data-folder="${folder.key}" data-search="true">🔍 ほかの作り方を探す</button>`;
  } else if (!isViewer()) {
    head = `${group("🆕 まだ作っていない", take(all.filter((x) => x.fit.ok && lastEatenLabel(x.r) === "はじめて"), 3))}${group("⭐ 評価順ベスト3", take(all.filter((x) => x.fit.ok && loveScore(x.r)).sort((a, b) => loveScore(b.r) - loveScore(a.r) || cookCount(b.r) - cookCount(a.r)), 3))}`;
  }
  const rest = all.filter((x) => !shownIds.has(x.r.id)).slice(0, 12);
  // 確認が必要な自分のレシピは、畳まずに見せる（確認すれば選べるので）。
  const shown = swapShowAll || !head ? rest.slice(0, swapShowAll ? 12 : 4) : rest.filter((x) => !x.fit.ok).slice(0, 2);
  const more = rest.length > shown.length ? `<button type="button" class="text-button" data-action="life-swap-more">${folder ? "別の料理にする" : "ほかの候補を見る"}（${rest.length - shown.length}品）</button>` : "";
  return `<section class="swap-panel" tabindex="-1" aria-label="${formatDate(swapDate)}の料理を選ぶ">${renderUrlInsert()}${head}${shown.length ? `${head ? '<p class="swap-group">ほかの候補</p>' : ""}${shown.map((x) => option(x)).join("")}` : ""}${!head && !shown.length ? "<p>別の候補がありません。条件をゆるめるかレシピを追加してください。</p>" : ""}${more}</section>`;
}
// Photo when we have one, otherwise a warm tile with a staple emoji (clearly labelled as an image).
function dishTile(recipe, cls = "") {
  const photo = recipe ? recipeThumbnail(recipe) : "";
  if (photo) return `<img class="dish-tile ${cls}" src="${escapeAttr(photo)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  // No photo of its own: a generic dish photo by staple, marked as an image only.
  const t = Lifestyle.traits(recipe || {});
  const fallback = { rice: "rice", noodle: "noodle", bread: "bread", other: "okazu" }[t.staple] || "okazu";
  return `<span class="dish-tile dish-fallback ${cls}" role="img" aria-label="料理のイメージ写真" style="background-image:url('assets/dishes/fallback-${fallback}.webp')"><small aria-hidden="true">イメージ</small></span>`;
}
const dayWordFor = (date) => { const g = daysBetween(date, today()); return g === 0 ? "今日" : g === 1 ? "昨日" : g === 2 ? "一昨日" : `${g}日前`; };
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
  else actions = `${dailyButton("life-cook", "作り方を見る", `data-date="${today()}"`, true)}${tonightNeeds ? dailyButton("go-view", `🛒 この料理の買うもの あと${tonightNeeds}品`, 'data-view="shopping"') : ""}`;
  const pre = !slot && day?.prestart ? prestartUntil() : "";
  const firstBlock = pre ? currentBlocks()[0] : null;
  if (pre) actions = dailyButton("go-view", "最初の献立を見る", 'data-view="plan"', true);
  const label = pre ? `献立は${formatDate(pre)}（${weekdayLabel(pre)}）から` : off ? (SKIP_OF[slot?.kind] ? `今日は${SKIP_OF[slot.kind].label}` : "今日はお休み") : slot?.status === "cooked" ? "ごちそうさま！" : slot ? "今夜の一品" : "今夜のおすすめ";
  const tomorrow = plan[1];
  const tr = tomorrow?.slot?.recipe || tomorrow?.candidate?.recipe;
  const tomorrowOff = tomorrow?.off || tomorrow?.slot?.status === "off";
  return `${renderRequestNews()}${renderPreferencePrompt() || renderRankPrompt() || renderRoundReview()}
  <section class="hero-card today-dish tonight-card"><div class="tonight-head"><p class="tonight-label"><span class="marker">${label}</span></p><p class="today-date">${formatDate(today())}（${weekdayLabel(today())}）· ${servings}人分</p></div>
    ${pre ? `<p class="tonight-off">🛒 最初の買い物は <b>${firstBlock ? deadlineLabel(firstBlock.shopAt) : ""}</b></p>` : locked ? `<p class="tonight-off">${LOCK_TITLE} ${tip("無料は週3日まで")}</p>` : off ? `<p class="tonight-off">${SKIP_OF[slot?.kind]?.icon || "🌙"} また次の晩ごはんで</p>` : recipe ? `${dishTile(recipe, "tonight-photo")}<h3 class="tonight-title">${recipeTitleHtml(recipe)}</h3>${reason && slot?.status !== "cooked" ? `<p class="tonight-reason hand"><span class="marker">${escapeHtml(reason)}</span></p>` : ""}<p class="tonight-meta">${[recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "", /好物|日ぶり/.test(reason) ? "" : bothLike(recipe) ? "😋 ふたりとも好き" : lastEatenLabel(recipe) === "はじめて" ? "はじめての一皿" : lastEatenLabel(recipe)].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : '<p class="tonight-off">条件に合う料理が見つかりません。</p>'}
    ${slot?.status === "confirmed" ? conditionWarning(recipe, today()) : ""}
    ${actions || (!off && !slot) ? `<div class="tonight-actions">${actions}${!off && !pre && slot?.status !== "cooked" && recipe ? `<button class="text-button" data-action="life-skip" data-date="${today()}">🍽 今日は外食・中食にする</button>` : ""}</div>` : ""}</section>
  ${renderSkipPanel(today())}
  ${renderWeeklyStamps()}
  ${renderInstallCard()}
  ${renderTicketNudge("cook")}
  ${renderTodayTodos()}
  ${tomorrow ? `<button type="button" class="tomorrow-line" data-action="go-view" data-view="plan"><span>明日は</span><b>${tomorrow.prestart ? "いつもどおり（献立の前）" : tomorrowOff ? "お休み 🌙" : tr ? escapeHtml(tr.title) : "未定"}</b><i aria-hidden="true">›</i></button>` : ""}`;
}
// Only things that need doing today; each row is one tap to the place where it gets done.
function renderTodayTodos() {
  const rows = [];
  Object.values(state.mealSlots || {}).filter((s) => s.status === "confirmed" && s.date < today() && canRecordDate(s.date)).sort((a, b) => b.date.localeCompare(a.date))
    .forEach((s) => rows.push(`<div class="todo-row"><span>🍳</span><p><b>${formatDate(s.date)}の${escapeHtml(s.recipe.title)}</b>、作った？</p>${dailyButton("life-record-past", "作った", `data-date="${s.date}"`)}</div>`));
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
  if (!skillProfile() && !isViewer()) rows.push(`<div class="todo-row"><span>🔪</span><p><b>スキル試験</b>（10問）→ 作れる料理だけに</p>${dailyButton("life-quiz-start", "受ける")}</div>`);
  else if (examReady()) rows.push(`<div class="todo-row"><span>🎖</span><p><b>★${skillProfile().level + 1}の昇級試験</b>が受けられます（5問）</p>${dailyButton("life-exam-start", "受ける")}</div>`);
  if (!state.foodProfile?.completed) rows.push(`<div class="todo-row"><span>✍️</span><p>好みとキッチンを教えると、提案があなた向けに（2分）</p>${dailyButton("life-profile", state.onboardingDraft ? "続きから" : "教える")}</div>`);
  return rows.length ? `<section class="today-todos" aria-label="今日やること"><h3 class="section-title"><span class="marker">今日やること</span></h3>${rows.join("")}</section>` : "";
}
function plan0Undecided() {
  return dailyPlan().slice(1).some((d) => d.candidate && !d.slot);
}
function canRecordDate(date) { return date >= addDays(today(), -3) && date <= today(); }
function renderRecentMeals() {
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
  const ask = solo ? "" : `<button type="button" class="text-button" data-action="life-rate-ask">💬 LINEなどで聞く</button>`;
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
  // 途中まで（ひとりだけ）の評価も使う。
  const e = state.evaluations.filter((x) => ids.has(x.recipeId) && Object.keys(x.familyRepeatCycles || {}).length).sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))[0];
  return e?.familyRepeatCycles || {};
}
function bothLike(recipe) {
  const values = Object.values(recipeRatings(recipe));
  return values.length >= 2 && values.every((c) => c === "weekly" || c === "tomorrow");
}
let aisleEdit = false;
let shopDoneLater = false;
// Vertical aisle tags: three characters at most so a one-item aisle stays one row tall.
const AISLE_SHORT = { veg: "野菜", fish: "魚", meat: "肉", daily: "日配", chilled: "乳・卵", frozen: "冷凍", staple: "主食", dry: "乾物", seasoning: "調味料", other: "他" };
// Small dish photos: just enough to feel which meal an item is for.
function useIcons(uses) {
  const meals = tripMeals();
  return (uses || []).slice(0, 3).map((title) => {
    const r = meals.find((m) => m.recipe.title === title)?.recipe || (state.recipes || []).find((x) => x.title === title);
    const photo = r ? recipeThumbnail(r) : "";
    return photo ? `<img class="use-icon" src="${escapeAttr(photo)}" alt="" title="${escapeAttr(title)}" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="use-icon use-letter" title="${escapeAttr(title)}">${escapeHtml([...title][0] || "")}</span>`;
  }).join("");
}
function renderDailyShopping() {
  const items = dailyShopping();
  const aisle = (i) => Aisles.aisleLabel(Aisles.aisleOf(i.name, i.category, state.aisleOverrides || {}));
  const order = Aisles.AISLES.map(([, label]) => label);
  const count = (status) => items.filter((i) => i.status === status).length;
  const fix = (i) => aisleEdit ? `<select class="aisle-select" data-aisle-name="${escapeAttr(i.name)}" aria-label="${escapeAttr(i.name)}の売り場">${Aisles.AISLES.map(([id, label]) => `<option value="${id}" ${Aisles.aisleOf(i.name, i.category, state.aisleOverrides || {}) === id ? "selected" : ""}>${label}</option>`).join("")}</select>` : "";
  const uses = (i) => i.uses?.length ? `<span class="use-icons" aria-label="${escapeAttr(i.uses.join("・"))}に使う">${useIcons(i.uses)}</span>` : "";
  const row = (i, status) => `<div class="daily-shopping-row ${aisleEdit ? "is-fixing" : ""}">${fix(i)}<label class="daily-shopping-check"><input type="checkbox" data-shopping-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を購入済みにする" ${status==="purchased" ? "checked" : ""}><span class="shop-line"><strong>${escapeHtml(i.name)}</strong><small>${escapeHtml(i.amount)}</small>${i.recheck ? '<small class="notice">要確認</small>' : ""}</span></label>${uses(i)}${status === "purchased" || isViewer() ? "" : `<button type="button" class="shopping-inline" data-action="life-shopping-status" data-id="${escapeAttr(i.id)}" data-status="${status==="have" ? "buy" : "have"}" aria-label="${escapeAttr(i.name)}を${status==="have" ? "買うものに戻す" : "家にあるにする"}">${status==="have" ? "買う" : "🏠"}</button>`}${i.id.startsWith("manual-") && !isViewer() ? `<button type="button" class="shopping-inline" data-action="life-remove-item" data-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を削除">✕</button>` : ""}</div>`;
  const groups = (status) => order.map((category) => {
    const list = items.filter((i) => i.status === status && aisle(i) === category);
    return list.length ? `<section class="aisle-group"><h4 class="aisle-tag" title="${escapeAttr(category)}"><span class="sr-only">${category}</span><span aria-hidden="true">${AISLE_SHORT[Aisles.AISLES.find(([, l]) => l === category)?.[0]] || category}</span></h4><div class="aisle-items">${list.map((i) => row(i, status)).join("")}</div></section>` : "";
  }).join("");
  const buy = count("buy"), purchased = count("purchased"), total = buy + purchased;
  const all = total > 0 && !buy;
  if (buy) shopDoneLater = false;
  const progress = total ? `<div class="shop-progress" role="status"><span>${buy ? `あと<strong>${buy}</strong>` : "そろった！"}</span><span class="shop-bar"><i style="width:${Math.round((purchased / total) * 100)}%"></i></span><small>${purchased}/${total}</small></div>` : "";
  const folded = (status, title, hint) => count(status) ? `<details class="shopping-fold"><summary><h3>${title} <span class="badge">${count(status)}</span></h3><small class="muted">${hint}</small></summary>${groups(status)}</details>` : "";
  const done = renderShoppingDone(items);
  const menu = items.length ? `<div class="page-actions"><details class="shop-menu"><summary aria-label="買い物メニュー">⋯</summary><div class="shop-menu-list">${dailyButton("copy-shopping", "リストをコピー")}${dailyButton("share-shopping", "共有")}<button type="button" class="secondary-button" data-action="life-aisle-edit">${aisleEdit ? "売り場の直しを終える" : "売り場を直す"}</button>${isViewer() ? "" : '<button type="button" class="secondary-button" data-action="life-pantry-open">常備品</button>'}${done}</div></details></div>` : "";
  const sheet = all && done && !shopDoneLater ? `<div class="shop-done-sheet" role="dialog" aria-label="買い物完了"><p><b>全部そろった！</b>買い物完了にする？</p><div>${done}<button type="button" class="text-button" data-action="life-shop-later">あとで</button></div></div>` : "";
  return `<section class="shop-head">${renderTripMeals()}${progress}${menu}</section>
  ${!items.length ? `<section class="panel shop-empty"><p>献立が決まると、必要な材料だけのリストができます。</p>${dailyButton("go-view", isViewer() ? "献立を見る" : "献立を決める", 'data-view="plan"', true)}</section>` : ""}
  ${aisleEdit ? '<button type="button" class="primary-button full-button" data-action="life-aisle-edit">売り場の直しを終える</button>' : ""}
  ${buy ? `<div class="shop-list">${groups("buy")}</div>` : ""}
  ${isViewer() ? "" : `<details class="shop-add"><summary>＋ 買い足す</summary><div class="shopping-add"><input id="manual-name" class="input" maxlength="100" placeholder="品名（例：牛乳）" aria-label="品名"><input id="manual-amount" class="input" maxlength="80" placeholder="数量" aria-label="数量"><button type="button" class="primary-button" data-action="life-add-item" aria-label="買い足すものに追加">追加</button></div></details>`}
  ${folded("purchased", "購入済み", "チェックを外すと戻ります")}${folded("have", "家にある", "調味料は残量も確認してください")}${sheet}`;
}
// 常備品だけを直すページ。設定ウィザードと同じデータ（householdProfile / foodProfile / 下書き）を書き換える。
let pantryReturn = "shopping";
function setPantry(name, value) {
  const base = dailyProfile();
  const pantry = { ...base.pantry, [name]: value };
  state.householdProfile = { equipment: base.equipment, pantry, updatedAt: nowIso() };
  if (state.foodProfile) state.foodProfile = { ...state.foodProfile, pantry };
  if (state.onboardingDraft) state.onboardingDraft.pantry = { ...state.onboardingDraft.pantry, [name]: value };
  touchSettings();
}
function renderPantryPage() {
  const pantry = dailyProfile().pantry;
  const known = Object.values(Lifestyle.pantry).flat();
  const extras = Object.keys(pantry).filter((n) => !known.includes(n));
  const card = (name) => { const v = pantry[name] || "unknown"; return `<button type="button" class="equipment-choice" data-action="life-pantry-set" data-name="${escapeAttr(name)}" aria-pressed="${v === "unknown" ? "mixed" : v === "have"}">${emojiMark(itemEmojis[name] || "🫙")}<span>${escapeHtml(name)}</span><strong>${v === "have" ? "ある" : v === "none" ? "ない" : "未確認"}</strong></button>`; };
  const groups = [...Object.entries(Lifestyle.pantry), ...(extras.length ? [["追加したもの", extras]] : [])];
  return `<section class="pantry-page"><div class="pantry-head"><button type="button" class="text-button" data-action="life-pantry-back">← もどる</button><h2>常備品</h2></div><p class="muted small">「ある」ものは買い物リストで「家にある」に回ります。ここでの変更は設定にもそのまま反映されます。</p>
  ${groups.map(([label, names]) => `<h3 class="pantry-group">${escapeHtml(label)}</h3><div class="equipment-grid pantry-grid" role="group" aria-label="${escapeAttr(label)}">${names.map(card).join("")}</div>`).join("")}
  <div class="shopping-add pantry-add"><input id="pantry-name" class="input" maxlength="99" placeholder="一覧にないもの（例：白だし）" aria-label="常備品の名前"><button type="button" class="primary-button" data-action="life-pantry-add">追加</button></div></section>`;
}
// Device-local progress: never share cooking checkmarks with another household member.
let cookingProgress = (() => {
  try { const value = JSON.parse(localStorage.getItem("ripigochi-cooking-progress") || "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
})();
function cookingCheck(kind, index, recipe, servings) {
  const key = JSON.stringify([cookingDate, recipe.id, servings, kind, index, kind === "ingredient" ? recipe.ingredients[index] : recipe.steps[index]]);
  return `<input type="checkbox" data-cooking-check="${escapeAttr(key)}" ${cookingProgress[key] ? "checked" : ""}>`;
}
function renderCooking() {
  const day = dailyPlan().find((d) => d.date === cookingDate);
  const slot = state.mealSlots?.[cookingDate];
  const recipe = slot?.recipe || day?.candidate?.recipe;
  ensureTimecodes(recipe);
  if (!recipe)
    return `<section class="panel"><h2>料理を選び直してください</h2>${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</section>`;
  const servings = slot?.servings || dailyProfile().servings;
  const meta = [`${servings}人分`, recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分（炊飯は別）` : "時間は未確認", recipe.planning?.equipment?.length ? `器具：${recipe.planning.equipment.join("・")}` : ""].filter(Boolean).join(" · ");
  const primary = slot?.status === "confirmed" && canRecordDate(cookingDate) ? dailyButton("life-cooked", "作った！", "", true) : !slot || slot.status === "removed" ? dailyButton("life-confirm-one", "この日の献立に確定", `data-date="${cookingDate}"`, true) : "";
  return `<section class="hero-card cooking-card"><button type="button" class="text-button cooking-back" data-action="go-view" data-view="plan">‹ 献立へ戻る</button><div class="cooking-head">${planThumb(recipe)}<div><p class="eyebrow">${formatDate(cookingDate)}（${weekdayLabel(cookingDate)}） · ${slot?.recipe ? "確定" : "提案中"}</p><h2>${escapeHtml(recipe.title)}</h2><p class="muted small">${escapeHtml(meta)}</p></div></div>
  <details class="cooking-safety"><summary>⚠️ 原材料・火の通りを確認</summary><p class="small">食材制限がある場合は市販品の原材料表示も確認してください。ごはんは炊いたものを用意し、加熱時間は様子を見て調整してください。中心温度の確認には食品用温度計を使い、2人分のレンジ加熱は途中で混ぜて追加加熱してください。</p></details>
  ${renderCreatorCredit(recipe)}
  ${canAnalyzeRecipe(recipe) ? `<p>${dailyButton("life-analyze", analyzingDate ? "作成中…" : "動画の説明文から下書きを作る",`data-date="${cookingDate}" ${analyzingDate ? "disabled" : ""}`)}</p>` : ""}
  ${servingsUnknownBanner(recipe, !isViewer() && state.recipes.some((x) => x.id === recipe.id))}
  <h3>材料 <small class="muted">${recipe.sourceServings == null ? "動画の分量のまま・" : ""}タップで✓</small></h3><ul class="cooking-ingredients cooking-check">${recipe.ingredients.map((i, index) => `<li><label>${cookingCheck("ingredient", index, recipe, servings)}<span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, recipe.sourceServings))}</span></label></li>`).join("")}</ul>
  <h3>作り方 <small class="muted">タップで✓${timecodeHintHtml(recipe, "・")}</small></h3><ol class="cooking-steps cooking-check" data-steps-of="${escapeAttr(recipe.id)}">${recipe.steps.map((st, index) => `<li><label>${cookingCheck("step", index, recipe, servings)}<span>${stepTimeSlot(recipe, index)}${escapeHtml(st)}</span></label></li>`).join("")}</ol>${timeFixBar(recipe)}
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
function renderRecordEditor() {
  const d = recordDraft;
  if (!d) return `<section class="panel"><p>記録が見つかりません。</p>${dailyButton("go-view", "ふりかえりへ", 'data-view="repeat"')}</section>`;
  const r = recordRecipe(d);
  const fixedDate = d.id.startsWith("meal-");
  const photo = isDataPhoto(d.photo) ? `<img class="dish-tile record-photo" src="${escapeAttr(d.photo)}" alt="">` : dishTile(r, "record-photo");
  return `<section class="record-editor">
    <button type="button" class="text-button cooking-back" data-action="life-record-back">‹ ふりかえりへ</button>
    <div class="record-head">${photo}<div><p class="eyebrow">${d.isNew ? "作った記録をつける" : "記録を編集"}</p><h2>${escapeHtml(r.title)}</h2><p class="muted small">${escapeHtml(lastEatenLabel(r) === "はじめて" ? "はじめての記録" : lastEatenLabel(r))}</p></div></div>
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
  return `<section class="insight-card"><h3>💡 わかってきたこと ${tip("評価から見えた好み。献立の提案にも使っています")}</h3>${body}</section>`;
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
  const tiles = list.slice(0, 31).map((e) => {
    const r = recipeOf(e);
    const photo = isDataPhoto(e.photo) ? `<img class="dish-tile" src="${escapeAttr(e.photo)}" alt="" loading="lazy">` : dishTile(r);
    return `<button type="button" class="table-tile" data-action="life-edit-record" data-id="${escapeAttr(e.id)}" aria-label="${escapeAttr(`${formatDate(e.cookedAt)} ${r.title}の記録を開く`)}">${photo}<span class="day-num">${Number(e.cookedAt.slice(8, 10))}</span>${loved(e) ? '<span class="tile-love" aria-hidden="true">😍</span>' : ""}<small>${escapeHtml(r.title)}</small></button>`;
  }).join("");
  return `<div class="page-actions">${nav}</div>
  ${list.length ? `<div class="refl-stats"><p><strong>${list.length}</strong><small>回つくった</small></p><p><strong>${tally.size}</strong><small>種類の料理</small></p><p><strong>${lovedCount}</strong><small>また食べたい</small></p></div>` : ""}
  ${reflMonth === 0 ? renderInsights(recipeOf, favRecipe?.id) : ""}
  ${fav ? `<section class="fav-card"><p class="eyebrow">${reflMonth === 0 ? "今月" : "この月"}の偏愛</p><div class="fav-body">${dishTile(favRecipe, "fav-photo")}<div><h3>${escapeHtml(favRecipe.title)}</h3><p class="hand"><span class="marker">${escapeHtml(favNote)}</span></p></div></div></section>` : ""}
  ${reflMonth === 0 ? renderMenuAlbum() : ""}
  <section class="table-section"><div class="table-head"><h3>わたしの食卓</h3>${list.length ? '<small class="muted">タップで編集</small>' : ""}</div>
  ${tiles ? `<div class="table-grid">${tiles}</div>` : `<p class="muted">${reflMonth === 0 ? "「作った」を押すと、ここに食卓の記録がたまっていきます。好きな一品が、次の献立につながります。" : "この月の記録はありません。"}</p>`}</section>`;
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
  state.recipes.unshift(own);
  return own;
}
function confirmDaily(day, recipe = day.candidate?.recipe) {
  if (!recipe) return;
  // 今週の人気・みんなの定番は、献立に入れた時点で自分のレシピとして保存する（28日で消えても献立は残る）。
  if (recipe.discover) recipe = saveOwnRecipe(recipe);
  sharePopular(recipe, "planned");
  state.mealSlots[day.date] = {
    date: day.date,
    mealType: "dinner",
    servings: dailyProfile().servings,
    recipe: clone(recipe),
    status: "confirmed",
    updatedAt: nowIso(),
  };
}
function changedShopping(before) {
  const after = dailyShopping();
  const added = after.filter((x) => !before.some((b) => b.id === x.id)).length;
  const removed = before.filter(
    (x) => !after.some((b) => b.id === x.id),
  ).length;
  const changed = after.filter((x) =>
    before.some((b) => b.id === x.id && b.signature !== x.signature),
  ).length;
  shoppingNotice = `買い物を更新しました：追加${added}品・不要${removed}品・数量等の変更${changed}品。`;
}
function dailyRecord(slot) {
  if (!slot || slot.status !== "confirmed" || !canRecordDate(slot.date)) return;
  const own = saveOwnRecipe(slot.recipe);
  const id = `meal-${slot.date}`;
  if (!state.evaluations.some((e) => e.id === id)) {
    const before = cookStats();
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
    celebrateCook(before);
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
}
function bindDailyEvents() {
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
      const item = dailyShopping().find((i) => i.id === el.dataset.shoppingId);
      if (!item) return;
      state.shoppingMarks[item.id] = {
        status: el.checked ? "purchased" : "buy",
        signature: item.signature,
        updatedAt: nowIso(),
      };
      if (!dailyShopping().some((i) => i.status === "buy"))
        trackDaily("shopping_completed");
      saveState();
      render();
    }),
  );
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
  if (action === "life-quick-skill") {
    state.skillProfile = { level: Number(data.level), growth: state.skillProfile?.growth || "steady", diagnosed: false, updatedAt: nowIso() };
    profileDraft().quickSetupIndex = FUNNEL.indexOf(2) + 1;
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
  if (action === "life-funnel-commit") profileDraft().quickSetupIndex = FUNNEL.indexOf("building");
  if (action === "life-quick-back") { profileDraft().quickSetupIndex=Math.max(0,profileDraft().quickSetupIndex-1); pledgeCount = 0; }
  if (action === "life-preview" && !state.onboarded) {
    state.onboarded=true;state.planLength=3;state.view="plan";profileEditing=false;
  }
  if (action === "life-profile") {
    profileEditing = true;
    profileDraft();
    state.view = "today";
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
    const chosen = [...finishFunnelPicks(), ...(funnelDemo.result ? [funnelDemo.result] : [])];
    trackDaily("profile_completed");
    const p = Lifestyle.profile(profileDraft());
    // 外食で選んだお店の味（和風・洋風・中華風）を、献立の好みに入れる。
    const liked = chainTastes(p);
    if (liked.length) p.tastes = [...new Set([...liked, ...(p.tastes || [])])];
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
    if (paywallPreview()) openPaywall();
    touchSettings();
  }
  if (action === "life-length")
    state.planLength = Number(data.length) === 7 ? 7 : 3;
  if (action === "life-confirm") {
    const only = data.block ? currentBlocks().find((b) => b.key === data.block)?.dates || [] : null;
    trackDaily("plan_confirmed", {
      days: dailyPlan().filter((d) => d.candidate).length,
    });
    const plan = dailyPlan(), locks = lockedDates(plan);
    plan
      .filter((d) => d.candidate && !locks.has(d.date) && (!only || only.includes(d.date)))
      .forEach((d) => confirmDaily(d));
    changedShopping(before);
    state.view = "shopping";
  }
  if (action === "life-confirm-one") {
    const plan = dailyPlan(), d = plan.find((d) => d.date === data.date);
    if (d?.candidate && !lockedDates(plan).has(d.date)) confirmDaily(d);
    changedShopping(before);
  }
  if (action === "life-refresh") {
    const slot = state.mealSlots[data.date];
    const r = slot && latestSlotRecipe(slot);
    if (r) {
      confirmDaily({ date: data.date }, r);
      changedShopping(before);
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
  if (action === "life-swap") {
    swapShowAll = false;
    swapDate = data.date;
    state.view = "plan";
  }
  if (action === "life-close-swap") swapDate = "";
  if (action === "life-swap-more") swapShowAll = true;
  if (action === "life-starter-more") starterShowAll = true;
  if (action === "life-facet" && data.facet in recipeFacets) recipeFacets[data.facet] = recipeFacets[data.facet] === data.value ? "" : data.value;
  if (action === "life-facet-clear") recipeFacets = { home: "", staple: "", main: "", style: "", author: "" };
  if (action === "life-month") reflMonth = Math.min(0, reflMonth + (Number(data.delta) || 0));
  if (action === "life-recipe-tab") { recipeTab = ["saved", "starter", "creators", "folders"].includes(data.tab) ? data.tab : "all"; folderOpen = ""; }
  if (action === "life-creator") { recipeFacets = { home: "", staple: "", main: "", style: "", author: data.name || "" }; recipeTab = "saved"; }
  if (action === "life-creator-edit") { creatorEditing = data.key || ""; globalThis.setTimeout?.(() => document.querySelector("#creator-alias")?.select?.(), 30); }
  if (action === "life-creator-save" && data.key) {
    const alias = data.reset === "true" ? "" : (document.querySelector("#creator-alias")?.value || "").trim().slice(0, 16);
    state.creatorNames = { ...(state.creatorNames || {}), [data.key]: { alias, updatedAt: nowIso() } };
    creatorEditing = "";
  }
  if (action === "life-save-starter") {
    const r = findDiscover(data.recipe) || Lifestyle.curated.find((x) => x.id === data.recipe);
    if (r) {
      const own = saveOwnRecipe(r);
      if (state.view === "recipe") recipeDetailId = own.id;
      showToast(`「${r.title}」をレシピに保存しました。`);
    }
  }
  if (action === "life-choose") {
    trackDaily("plan_swapped");
    const r = allDinnerRecipes().find((r) => r.id === data.recipe);
    if (r && Lifestyle.fit(r, dailyProfile(), data.date).ok) {
      if (state.mealSlots[data.date]?.status === "confirmed")
        confirmDaily({ date: data.date }, r);
      else state.planOverrides[data.date] = r.id;
      changedShopping(before);
    }
    swapDate = "";
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
  if (action === "life-reread") { askTicket(() => rereadRecipe(data.recipe), recipeById(data.recipe)?.videoUrl); return true; }
  if (action === "life-fill-video") { askTicket(() => fillRecipeFromVideo(data.recipe), recipeById(data.recipe)?.videoUrl); return true; }
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
    if (e?.preferencePending && CYCLE_CHOICES.some(r=>r.cycle===data.cycle) && raterNames().includes(data.member)) {
      if (!state.family.includes(data.member)) state.family.push(data.member);
      e.familyRepeatCycles = {...e.familyRepeatCycles, [data.member]:data.cycle};
      e.updatedAt = nowIso();
      trackDaily("meal_rated");
      const left = raterNames().filter((n) => !e.familyRepeatCycles[n]);
      if (!left.length && data.batch) { e.personalPreference = true; e.preferencePending = false; if (!reviewPending().length) showToast("🎉 評価しました。次の献立に反映します"); }
      else if (!left.length) {
        e.personalPreference = true; e.preferencePending = false;
        preferencePromptId = "";
        showToast(bothLike({id:e.recipeId}) ? "ふたりとも好き！ちょうどいい頃に、また提案します。" : "記録しました。えらんだ頃に、また提案します。");
      }
    }
  }
  if (action === "life-frequency") {
    const e = state.evaluations.find(e=>e.id===data.id);
    if (e?.preferencePending && e.id === preferencePromptId && repeatOptions.some(o=>o.id===data.cycle)) {
      e.familyRepeatCycles = {...e.familyRepeatCycles, [state.family[0]]:data.cycle};
      e.personalPreference = true; e.preferencePending = false; e.updatedAt = nowIso();
      preferencePromptId = "";
    }
  }
  if (action === "life-shopping-status" && ["buy","have"].includes(data.status)) {
    const item = dailyShopping().find(i=>i.id===data.id);
    if (item) state.shoppingMarks[item.id] = {status:data.status, signature:item.signature, updatedAt:nowIso()};
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
  if (action === "life-pantry-set") { const v = dailyProfile().pantry[data.name]; setPantry(data.name, v === "have" ? "none" : "have"); }
  if (action === "life-pantry-add") { const name = document.querySelector("#pantry-name")?.value.trim().slice(0, 99); if (name) setPantry(name, "have"); }
  if (action === "life-recipe-open") { recipeDetailId = data.recipe; state.view = "recipe"; }
  if (action === "life-recipe-back") state.view = "collection";
  if (action === "life-starters" && !isViewer()) {
    state.starterPref = { show: data.show === "true", asked: true, updatedAt: nowIso() };
    showToast(data.show === "true" ? "おすすめレシピを表示します。" : "おすすめを隠しました。自分のレシピだけで献立を作ります。");
  }
  if (action === "life-share-stats") { try { localStorage.setItem("ripigochi-share-stats", shareStatsOn() ? "off" : "on"); } catch {} }
  if (action === "life-starters-unhide" && !isViewer()) { state.starterPref = { ...normalizeStarterPref(state.starterPref), hidden: [], updatedAt: nowIso() }; showToast("非表示にしたおすすめを戻しました。"); }
  if (action === "life-starters-keep") state.starterPref = { ...normalizeStarterPref(state.starterPref), asked: true, updatedAt: nowIso() };
  if (action === "life-skill-growth" && state.skillProfile) { state.skillProfile = { ...state.skillProfile, growth: data.value === "grow" ? "grow" : "steady", updatedAt: nowIso() }; state.planOverrides = {}; }
  // The first-plan welcome stays until the next real action on the plan.
  if (!["life-finish", "life-cal-pick", "life-week", "life-rhythm"].includes(action)) firstPlanReveal = false;
  if (action === "life-reveal-close") firstPlanReveal = false;
  if (action === "life-cal-pick") calPick = calPick === data.date ? "" : data.date;
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
    recordDraft = null;
    state.view = "repeat";
    showToast("記録を削除しました。");
  }
  if (action === "life-add-item") {
    const name = document
      .querySelector("#manual-name")
      ?.value.trim()
      .slice(0, 100);
    if (name)
      state.manualShopping[generateId("manual-")] = {
        name,
        amount: document
          .querySelector("#manual-amount")
          .value.trim()
          .slice(0, 80),
        updatedAt: nowIso(),
      };
  }
  if (action === "life-remove-item")
    state.manualShopping[data.id] = {
      ...state.manualShopping[data.id],
      deleted: true,
      updatedAt: nowIso(),
    };
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
    document.querySelector(".swap-panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
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
  <p class="muted small">わからなければ未確認でOK ${tip("未確認のレシピは自動の献立に使わず、入れ替える時に確認します")}</p><button type="button" class="text-button" data-action="save-recipe-unreviewed">未確認で保存する</button>`;
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
const FUNNEL = ["pain", 0, "eaters", 4, "equipment", "ratio", "staple", "chains", "priority", 2, "type", "videos", "demo", "loss", "goal", 1, "remind", 3, "picks", "commit", "building"];
const EATERS = [["me", "🧑", "自分"], ["partner", "💑", "パートナー"], ["kids", "🧒", "子ども（小学生まで）"], ["teens", "🧑‍🎓", "子ども（中学生から）"], ["parents", "👵", "親"], ["friends", "🏠", "同居の友人など"]];
const EATER_OF = Object.fromEntries(EATERS.map(([id, , label]) => [id, label.replace(/（.*$/, "")]));
const OPTIONAL_TOOLS = ["炊飯器", "トースター", "オーブン", "電気ケトル", "圧力鍋", "ホットプレート", "ミキサー", "はかり"];
const personaOf = (p) => { const r = cookTypeOf(p); return r ? { title: r.name } : null; };
const QUICK_STEPS = FUNNEL.length;
const FUNNEL_PART2 = FUNNEL.indexOf("goal");
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
  const preset = RHYTHMS[state.rhythm?.preset || "weekday"];
  const days = preset.blocks.map((b) => (b[0] + 6) % 7);
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
// AIの読み取りを試す（説明欄から読むのでチケットは使わない）。
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
  if (key === "commit") {
    const lines = PLEDGES[p.goal] || PLEDGES.time;
    const read = pledgeCount;
    return [`あなたの宣言`, `<div class="pledge" role="group" aria-label="宣言">
      <p class="pl-text">${lines.map((l) => `<span>${escapeHtml(l)}</span>`).join("")}</p>
      <p class="pl-guide">声に出して（心の中でも）、ゆっくり<b>3回</b>。<br>1回読むごとに、指を置いてください。</p>
      <button type="button" class="funnel-hold is-print is-pledge" data-hold="900" data-pledge="1" aria-label="読んだら、指を置いて長押し（${read} / 3）"><span class="fh-ring" aria-hidden="true"></span>${FINGERPRINT}</button>
      <p class="pl-dots" aria-live="polite">${[0, 1, 2].map((k) => `<i class="${k < read ? "is-on" : ""}"></i>`).join("")}<span>${read} / 3</span></p></div>`];
  }
  if (key === "building") return [`🍳 あなた専用の献立を、つくっています`, `<div class="funnel-building"><p class="fb-pct" aria-live="polite">0%</p><progress max="100" value="0" aria-label="作成中"></progress><ul class="fb-list">${buildingLines(p).map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></div>`];
  return ["", ""];
}
function bindFunnel() {
  const hold = document.querySelector(".funnel-hold");
  if (hold) {
    let timer = null;
    const done = () => {
      hold.classList.remove("is-holding");
      globalThis.navigator?.vibrate?.(30);
      // 宣言は3回読んでから（1回ごとに指を置く）。
      if (hold.dataset.pledge && ++pledgeCount < 3) { render(); document.querySelector(".pledge")?.classList.add("is-read"); return; }
      pledgeCount = 0;
      handleDailyAction("life-funnel-commit", {}); saveState({ scheduleSync: false }); render();
    };
    const start = (ev) => { ev.preventDefault(); hold.classList.add("is-holding"); timer = setTimeout(done, Number(hold.dataset.hold) || 1200); };
    const stop = () => { clearTimeout(timer); hold.classList.remove("is-holding"); };
    hold.addEventListener("pointerdown", start);
    ["pointerup", "pointerleave", "pointercancel"].forEach((e) => hold.addEventListener(e, stop));
    // キーボードで押した時は、長押しなしで進める。
    hold.addEventListener("click", (ev) => { if (ev.detail === 0) done(); });
  }
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
  const building = document.querySelector(".funnel-building");
  if (building) {
    const pct = building.querySelector(".fb-pct"), bar = building.querySelector("progress"), items = building.querySelectorAll("li");
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    let n = reduce ? 100 : 0;
    const tick = () => {
      n = Math.min(100, n + 2);
      pct.textContent = `${n}%`; bar.value = n;
      items.forEach((li, k) => li.classList.toggle("is-done", n >= ((k + 1) * 100) / items.length));
      if (n < 100) setTimeout(tick, 80);
      else setTimeout(() => { if (FUNNEL[profileDraft().quickSetupIndex] === "building") { handleDailyAction("life-finish", {}); saveState(); render(); } }, 450);
    };
    tick();
  }
}
// 声に出して読みたい宣言（目標ごと）。
const PLEDGES = {
  smile: ["今日のひと皿が、", "明日の笑顔になる。", "わたしは、この食卓に", "「おいしい」を灯しつづける。"],
  save: ["買ったものは、", "ひとつ残らず、いただく。", "わたしは、台所の小さなムダを", "やさしく手放していく。"],
  time: ["迷う時間を、そっと手放す。", "取り戻した夕暮れは、", "わたしと、", "大切な人のために。"],
  grow: ["昨日の自分より、", "ひと皿ぶん先へ。", "わたしは、台所で", "少しずつ、たしかに育っていく。"],
};
let pledgeCount = 0;
const FINGERPRINT = `<svg class="fh-print" viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 22a17 17 0 0 1 28 0"/><path d="M14 32a18 18 0 0 1 36 0v4"/><path d="M20 44c2-4 3-8 3-12a9 9 0 0 1 18 0c0 6-1 11-3 15"/><path d="M32 32c0 7-2 14-6 19"/><path d="M26 32a6 6 0 0 1 12 0c0 3 0 6-1 9"/><path d="M44 42c-1 4-2 7-4 10"/><path d="M14 44c1-2 2-5 2-8"/></g></svg>`;
// 作成中の画面：答えを1つずつ反映していく様子を見せる（あなたのために作っている、が伝わる）。
function buildingLines(p) {
  const avoid = [...(p.restrictions || []), ...(p.dislikes || [])];
  const tools = OPTIONAL_TOOLS.filter((t) => p.equipment?.[t] === "have");
  const persona = personaOf(p);
  const sp = state.skillProfile;
  const eaters = (p.eaters || []).filter((x) => x !== "me").map((x) => EATER_OF[x]);
  return [
    `${p.servings >= 5 ? "5人以上" : `${p.servings || 1}人分`}に、分量をそろえています`,
    avoid.length ? `${avoid.slice(0, 3).join("・")}${avoid.length > 3 ? "など" : ""}を外しています` : "食べられないものを確かめています",
    tools.length ? `${tools.slice(0, 2).join("・")}も使える料理を探しています` : "手持ちの道具で作れる料理に絞っています",
    sp ? `★${sp.level}までの、作れる料理に絞っています` : "作りやすい料理を選んでいます",
    `平日${p.weekdayMinutes || 20}分以内の料理を選んでいます`,
    persona ? `「${persona.title}」の好みで並べています` : "好きそうな料理を上に並べています",
    (p.picks || []).length ? `選んだ${p.picks.length}品を入れています` : eaters.length ? `${eaters.join("・")}と食べる献立にしています` : "かぶらない組み合わせを考えています",
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
  // 3か所の案内（ロックの日・3日を使い切った・チケット不足）から開いた時：プラスでできることを、絵文字と短い言葉で。
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
// 上の進み具合：13のブロックが1つずつ色づく。
function funnelProgress(i) {
  const block = (k) => `<li class="${k < i ? "is-done" : k === i ? "is-current" : ""}"></li>`;
  const part = (from, to, label, n) => `<div class="fs-part${i >= from && i < to ? " is-active" : i >= to ? " is-done" : ""}"><span class="fs-label">${n}. ${label}</span><ol class="funnel-steps" style="--n:${to - from}">${FUNNEL.slice(from, to).map((_, k) => block(from + k)).join("")}</ol></div>`;
  return `<div class="funnel-parts" role="progressbar" aria-label="初回設定の進み具合" aria-valuemin="1" aria-valuemax="${QUICK_STEPS}" aria-valuenow="${i + 1}" aria-valuetext="${i < FUNNEL_PART2 ? "第1部 いまのあなた" : "第2部 これからのあなた"}（${i + 1} / ${QUICK_STEPS}）">${part(0, FUNNEL_PART2, "いまのあなた", 1)}${part(FUNNEL_PART2, QUICK_STEPS, "これからのあなた", 2)}</div>`;
}
// 自分で選ぶ時のスキル（診断しない人向け）。
const SKILL_PICK_HINT = { 1: "混ぜてチン、が中心", 2: "切って炒める・煮るならOK", 3: "照り焼きやガパオも作れる", 4: "ハンバーグや揚げ焼きも", 5: "揚げ物も魚をおろすのも" };
// 料理スキル：写真のAI判定と10問の試験の両方で、総合的に判断する（片方だけでも進める）。
function renderSkillStep() {
  const sp = state.skillProfile;
  const levels = [1, 2, 3, 4, 5].map((l) => `<button type="button" class="rhythm-option" data-action="life-quick-skill" data-level="${l}" aria-pressed="${sp?.level === l && !sp?.diagnosed}"><strong><span class="skill-stars">${Skills.stars(l)}</span> ${SKILL_TYPES[l].name}</strong><small>${SKILL_PICK_HINT[l]}</small></button>`).join("");
  const quiz = sp?.quizLevel
    ? `<div class="skill-part is-done"><p class="sp-head">📝 テスト <b>${Skills.stars(sp.quizLevel)}</b></p><p class="small">${sp.score !== undefined ? `${sp.score}点・${kyuOfScore(sp.score)}` : "受験ずみ"}</p><button type="button" class="link-inline" data-action="life-quiz-start">もう一度</button></div>`
    : `<button type="button" class="skill-part quiz-start" data-action="life-quiz-start"><span aria-hidden="true">📝</span><b>スキル試験</b><small>10問・4択の知識問題</small></button>`;
  const both = sp?.quizLevel && sp?.photoLevel;
  const total = sp?.diagnosed ? `<div class="skill-total"><p class="st-label">${both ? "写真 ＋ テストの総合" : "いまの判定（もう片方もやると、より正確に）"}</p><p class="quiz-stars">${Skills.stars(sp.level)}</p><p class="st-name">${SKILL_TYPES[sp.level].name}</p>${both ? '<p class="cc-badge">✓ 写真とテストで診断ずみ・ぴったり度 高</p>' : ""}</div>` : "";
  return `<p class="small">作れる料理だけ出します ${tip("写真とテスト、両方やると精度が上がります")}</p>
    <div class="skill-parts">${renderPhotoJudge()}${quiz}</div>${total}
    <details class="skill-self" ${sp && !sp.diagnosed ? "open" : ""}><summary>どちらもしないで、自分で選ぶ</summary><div class="skill-picks">${levels}</div></details>`;
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
  if (key === "equipment") p.equipment = Lifestyle.equipmentDefaults(p.equipment);
  if (typeof key === "string") {
    const [title, body] = renderFunnelStep(key);
    // 主食・お店は、選ぶまで「次へ」の代わりに「スキップ」。
    if ((key === "staple" && !(p.staples || []).length) || (key === "chains" && !(p.chains || []).length)) return shell(title, body, `<button class="text-button" data-action="life-quick-next">スキップ</button>`);
    const next = ["commit", "building", "goal", "pain", "videos", "priority"].includes(key) ? "" : key === "remind" ? `<button class="primary-button is-quiet" data-action="life-quick-next">${p.remindAdded ? "次へ" : "あとで"}</button>` : nextButton;
    return shell(title, body, next);
  }
  if (key === 3 && !p.weekdayMinutes) p.weekdayMinutes = 20;
  const rhythmNow = state.rhythm?.preset || "weekday";
  const content = [
    `<div class="funnel-picks is-servings">${SERVINGS.map(([n, label]) => `<button type="button" class="funnel-pick" data-action="life-servings" data-count="${n}" aria-pressed="${Number(p.servings) === n}"><span class="fp-icon" aria-hidden="true">${"🧑".repeat(Math.min(n, 4))}${n >= 5 ? "＋" : ""}</span>${label}</button>`).join("")}</div>`,
    `<div class="rhythm-options">${Object.entries(RHYTHMS).map(([id, r]) => `<button type="button" class="rhythm-option" data-action="life-rhythm" data-preset="${id}" aria-pressed="${rhythmNow === id}"><strong>${r.label}${id === "weekday" ? " ⭐おすすめ" : ""}</strong><small>${r.note}</small></button>`).join("")}</div><label class="rhythm-time">買い物の時間（まとまりの前日）<select id="rhythm-time" class="input">${SHOP_TIMES.map((t) => `<option ${(state.rhythm?.shopTime || "17:00") === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>`,
    renderSkillStep(),
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
      : "動画からは作り方を読み取れませんでした（チケットは戻しました）。動画を見ながら、このまま直して「更新する」を押してください。";
    showToast(`読み直しました。確かめて保存してください。${ticketNote(result)}`);
  } catch (error) {
    if (error.code === "no_tickets") openTicketSheet({ need: true, retry: () => rereadRecipe(id) });
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
    if (!steps.length) { showToast("動画からも作り方を読み取れませんでした。レシピを開いて手で入れてください。"); return; }
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
    showToast(`「${own.title}」の作り方をそろえました。${ticketNote(result)}`);
  } catch (error) {
    if (error.code === "no_tickets") openTicketSheet({ need: true, retry: () => fillRecipeFromVideo(id) });
    else showToast(error.message || "読み取れませんでした。");
  } finally {
    rereadingId = "";
    saveState(); render();
  }
}
// ボタンに添える値札。開発モードでは使わない。
function ticketPrice() { return ticketState?.unlimited ? "" : " 🎟1"; }
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

let starterShowAll = false;
// Starter recipes are browsable and searchable from the Recipes tab, one tap to save.
function starterRecipeList() {
  if (!showStarters()) return [];
  const saved = new Set(state.recipes.map((r) => r.starterId).filter(Boolean));
  const query = (state.searchText || "").trim().toLowerCase();
  const hidden = starterHidden();
  return [...rankByTaste(discoverRecipes()), ...Lifestyle.curated]
    .filter((r) => !saved.has(r.id) && !hidden.has(r.id))
    // Browsing only needs the safety filter; tools are checked again before a dish is planned.
    .filter((r) => (r.discover ? discoverSafe(r) : Lifestyle.fit(r, dailyProfile(), today()).ok))
    .filter((r) => !query || [r.title, ...r.ingredients.map((i) => i.name), ...(r.planning?.tastes || [])].join(" ").toLowerCase().includes(query));
}

// ----- レシピの詳細（閲覧が基本。編集は「編集する」から） -----
let recipeDetailId = "";
function detailRecipe() {
  return recipeById(recipeDetailId) || findDiscover(recipeDetailId) || Lifestyle.curated.find((r) => r.id === recipeDetailId) || null;
}
function tagLabels(recipe) {
  const labels = new Map(Lifestyle.FACETS.flatMap((f) => f.options));
  return Lifestyle.tags(recipe).map((t) => labels.get(t)).filter(Boolean);
}
// 元レシピの人数が未確認なら、材料ごとではなく1か所だけ赤いバナーで知らせる。
function servingsUnknownBanner(recipe, canEdit) {
  if (recipe?.sourceServings != null) return "";
  return `<div class="servings-banner" role="note"><p><b>元のレシピが何人分か未確認です</b><br>分量は動画のまま。${dailyProfile().servings || getServingCount()}人分に合わせるには、人数を設定してください。</p>${canEdit ? `<button type="button" class="secondary-button" data-action="edit-recipe" data-recipe="${escapeAttr(recipe.id)}">人数を設定</button>` : ""}</div>`;
}
function renderRecipeDetail() {
  const r = detailRecipe();
  ensureTimecodes(r);
  if (!r) return `<section class="panel"><p>レシピが見つかりません。</p>${dailyButton("go-view", "レシピ一覧へ", 'data-view="collection"')}</section>`;
  const saved = !r.curated;
  const servings = dailyProfile().servings;
  const ratings = recipeRatings(r);
  const cycleLabel = (c) => CYCLE_CHOICES.find((x) => x.cycle === c)?.label || "";
  const meta = [r.planning?.minutes ? `⏱ ${r.planning.minutes}分` : "", r.planning?.equipment?.length ? r.planning.equipment.join("・") : "", r.author ? `@${r.author}` : "", saved ? r.source : "おすすめ"].filter(Boolean);
  const last = lastEatenLabel(r);
  const edit = !isViewer();
  return `<section class="recipe-detail">
    <button type="button" class="text-button cooking-back" data-action="life-recipe-back">‹ レシピ一覧</button>
    ${renderCreatorCredit(r) || dishTile(r, "detail-photo")}
    <h2 class="detail-title">${escapeHtml(r.title)}</h2>
    <p class="detail-meta">${meta.map(escapeHtml).join(" · ")}</p>
    <div class="detail-tags">${tagLabels(r).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>
    ${renderSkillLine(r)}
    ${saved || edit ? renderFolderLine(r) : ""}
    <p class="detail-history">${last === "はじめて" ? "まだ作っていません" : `前回：${escapeHtml(last)}`}${Object.keys(ratings).length ? ` · ${Object.entries(ratings).map(([n, c]) => `${escapeHtml(n)}：${escapeHtml(cycleLabel(c))}`).join(" / ")}` : ""}</p>
    <div class="detail-actions">${requestButton(r)}${edit ? (saved ? dailyButton("edit-recipe", "✏️ 編集する", `data-recipe="${escapeAttr(r.id)}"`) : dailyButton("life-save-starter", "🔖 自分のレシピに保存", `data-recipe="${escapeAttr(r.id)}"`)) : ""}${r.videoUrl ? `<a class="secondary-button link-button" href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noreferrer">▶ 動画を開く</a>` : ""}</div>
    ${edit && saved && canRereadRecipe(r) ? `<div class="reread-row${r.steps?.length ? "" : " is-empty"}">${r.steps?.length ? "" : "<p><b>作り方がまだありません</b>動画を見て読み取れます。</p>"}<button type="button" class="${r.steps?.length ? "text-button" : "primary-button"}" data-action="life-reread" data-recipe="${escapeAttr(r.id)}" ${rereadingId ? "disabled" : ""}>${rereadingId === r.id ? "動画を読んでいます…（最大2分）" : r.steps?.length ? `🎬 作り方がおかしい？動画から読み直す${ticketPrice()}` : `🎬 動画から読み取る${ticketPrice()}`}</button></div>` : ""}
    ${servingsUnknownBanner(r, saved && edit)}
    <h3 class="detail-h">材料 <small>${r.sourceServings == null ? "動画の分量のまま" : `${servings}人分`}</small></h3>
    ${r.ingredients?.length ? `<ul class="detail-ingredients">${r.ingredients.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, r.sourceServings))}</span></li>`).join("")}</ul>` : '<p class="muted small">材料が登録されていません。</p>'}
    <h3 class="detail-h">作り方 <small class="muted">${timecodeHintHtml(r)}</small></h3>
    ${r.steps?.length ? `<ol class="detail-steps" data-steps-of="${escapeAttr(r.id)}">${r.steps.map((s, i) => `<li>${stepTimeSlot(r, i)}${escapeHtml(s)}</li>`).join("")}</ol>${timeFixBar(r)}` : '<p class="muted small">作り方が登録されていません。</p>'}
    ${r.note ? `<p class="detail-note">📝 ${escapeHtml(r.note)}</p>` : ""}
    ${edit && saved ? `<div class="detail-foot">${dailyButton("life-new-record", "作った記録をつける", `data-recipe="${escapeAttr(r.id)}"`)}<button type="button" class="text-button danger" data-action="delete-recipe" data-recipe="${escapeAttr(r.id)}">このレシピを削除</button></div>` : ""}
  </section>`;
}

// ----- 最初から入っているおすすめレシピの表示 ON/OFF（家庭で共有） -----
const STARTER_HIDE_HINT = 15;
function showStarters() {
  return state.starterPref?.show !== false;
}
function normalizeStarterPref(raw) {
  const hidden = Array.isArray(raw?.hidden) ? [...new Set(raw.hidden.filter((id) => typeof id === "string" && id.length < 80))] : [];
  return { show: raw?.show !== false, asked: !!raw?.asked, hidden, updatedAt: normalizeTimestamp(raw?.updatedAt) };
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
    ${state.starterPref?.hidden?.length ? `<p class="small starter-hidden">非表示にしたおすすめ <b>${state.starterPref.hidden.length}品</b> <button type="button" class="text-button" data-action="life-starters-unhide">すべて戻す</button></p>` : ""}
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
