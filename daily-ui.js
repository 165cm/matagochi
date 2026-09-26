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
function renderWelcome() {
  document.body.classList.add("is-onboarding");
  document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard welcome-card"><h2 tabindex="-1">🍽️ 今夜の一品を、すぐ決めよう</h2><p>人数・献立のリズム・料理スキル・平日の時間・食べられないものの5つに答えると、最初の献立ができます。</p><div class="welcome-actions">${dailyButton("life-quick", "5問ではじめる（約1分）", "", true)}${dailyButton("life-preview", "設定せずに見てみる")}</div><button type="button" class="text-button" data-action="life-detailed">好み・器具・常備品まで詳しく設定する</button></section>`;
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
  const single = p.quickSetupIndex !== null ? [0, 3].includes(p.quickSetupIndex) : p.step === 0;
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
    ...(showStarters() ? Lifestyle.curated.filter((r) => !originals.has(r.id)) : []),
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
    recipes: allDinnerRecipes(),
    profile: p,
    slots: state.mealSlots || {},
    start: today(),
    length: rhythmOn() ? rhythmPlanDays() : state.planLength || p.period,
    addDays,
    overrides: state.planOverrides,
    cyclesOf: (r) => ({ ...likedCycles(r), ...recipeRatings(r) }),
    offUntil: prestartUntil(),
    requestOf: openRequestFor,
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
// Why this dish on this day, most important first: request, variety, repeat timing.
function planReason(day) {
  const c = day.candidate;
  if (day.slot) return [openRequestFor(day.slot.recipe || {}) && `${openRequestFor(day.slot.recipe).from}のリクエスト`, day.rotation?.reason].find(Boolean) || "";
  return c ? [c.request && `${c.request.from}のリクエスト`, c.challenge && `ちょっと挑戦 ${"★".repeat(c.skillNeed)}`, c.rotation?.reason, c.repeat?.reason].find(Boolean) || "" : "";
}
// The last time someone pressed 買い物完了. Meals confirmed before it were bought on that trip.
function lastShoppedAt() {
  const done = Object.values(state.shopDone || {});
  if (state.round?.status === "done" && state.round.updatedAt) done.push(state.round.updatedAt);
  return done.sort().pop() || "";
}
function tripSlots() {
  const since = lastShoppedAt();
  return Object.fromEntries(Object.entries(state.mealSlots || {}).filter(([, s]) => !since || (s.updatedAt || "") > since));
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
  const n = state.planLength || 3;
  const cardList = plan
    .map((day) => {
      const recipe = day.slot?.recipe || day.candidate?.recipe;
      const dateLabel = `${formatDate(day.date)}（${weekdayLabel(day.date)}）`;
      const badge = day.date === today() ? '<span class="today-badge">今夜</span>' : "";
      if (day.prestart) return `<article class="plan-card is-off"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>🛒</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">いつもどおりで</strong><p class="plan-time">献立は${formatDate(prestartUntil())}から</p></div></article>`;
      if (day.slot?.status === "off" || day.off)
        return `<article class="plan-card is-off"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>🌙</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">自炊はお休み</strong><div class="plan-controls"><button type="button" class="plan-icon" data-action="life-reopen" data-date="${day.date}">料理する</button></div></div></article>`;
      if (!recipe)
        return `<article class="plan-card"><div class="plan-photo"><span class="dish-tile dish-art-tile" aria-hidden="true"><span>🤔</span></span>${badge}</div><div class="plan-body"><p class="plan-date">${dateLabel}</p><strong class="plan-title">条件に合う候補がありません</strong><p class="plan-time">時間・食材・器具をゆるめるか、レシピを追加してください。</p>${dailyButton("life-profile", "条件を確認")}</div></article>`;
      const status = day.slot?.status === "cooked" ? "作った" : day.slot ? "確定" : "";
      const note = planReason(day) || (bothLike(recipe) ? "ふたりとも好き" : lastEatenLabel(recipe) === "はじめて" ? "はじめての一皿" : lastEatenLabel(recipe));
      const minutes = recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "";
      const more = day.slot?.status === "cooked" || isViewer() ? "" : `<details class="plan-more"><summary aria-label="${dateLabel}のその他の操作">⋯</summary><div>${day.slot?.status === "confirmed" && slotHasUpdates(day.slot) ? dailyButton("life-refresh", "今のレシピ・人数を反映", `data-date="${day.date}"`) : ""}<button class="text-button" data-action="life-off" data-date="${day.date}">この日は自炊お休み</button></div></details>`;
      const swap = day.slot?.status === "cooked" ? "" : `<button type="button" class="plan-icon plan-swap" data-action="${swapDate === day.date ? "life-close-swap" : "life-swap"}" data-date="${day.date}" aria-expanded="${swapDate === day.date}" aria-label="${swapDate === day.date ? "候補を閉じる" : `${dateLabel}の料理を入れ替える`}">${swapDate === day.date ? "閉じる" : isViewer() ? '<span aria-hidden="true">🙋</span><span class="plan-icon-label">別のがいい</span>' : '<span aria-hidden="true">⇄</span><span class="plan-icon-label">入れ替え</span>'}</button>`;
      return `<article class="plan-card ${swapDate === day.date ? "is-swapping" : ""}"><button type="button" class="plan-photo plan-main" data-action="life-cook" data-date="${day.date}" aria-label="${dateLabel} ${escapeAttr(recipe.title)}の作り方を見る">${dishTile(recipe)}${badge}</button><div class="plan-body"><p class="plan-date">${dateLabel}${status ? ` · <b class="plan-status">${status}</b>` : ""}</p><button type="button" class="plan-title" data-action="life-cook" data-date="${day.date}">${escapeHtml(recipe.title)}</button>${minutes ? `<p class="plan-time"><span class="marker">${minutes}</span></p>` : ""}<p class="hand plan-note">${escapeHtml(note)}</p><div class="plan-controls">${swap}${more}</div></div>${day.slot ? conditionWarning(recipe, day.date) : ""}${renderSwapRequests(day.date)}</article>${swapDate === day.date ? renderSwapChoices() : ""}`;
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
    const needs = plan.some((d) => b.dates.includes(d.date) && d.candidate);
    const foot = last && needs && !isViewer() ? `<div class="block-foot">${dailyButton("life-confirm", `${blockRange(b)}をこれで決定`, `data-block="${b.key}"`, true)}</div>` : "";
    return head + html + foot;
  }).join("");
  const ready = plan.filter((d) => d.candidate).length;
  return `${renderFirstPlanReveal()}<section class="plan-top"><div class="plan-tools page-actions">${rhythmOn() ? "" : `<div class="segmented" role="group" aria-label="献立の日数">${[3, 7].map((d) => `<button class="choice-button" aria-pressed="${n === d}" data-action="life-length" data-length="${d}">${d}日</button>`).join("")}</div>`}${isViewer() ? "" : `<button type="button" class="round-icon" data-action="${!state.foodProfile?.completed ? "life-quick" : "life-profile"}" aria-label="条件を調整"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>`}</div></section>${renderRhythmInvite()}${renderRoundCard()}${renderWeekBoard()}${isViewer() ? "" : renderRequests()}${!isViewer() && !state.foodProfile?.completedAt ? '<p class="muted small plan-trial">お試しの提案です。食材制限・調理時間・器具は、作る前に確認してください。</p>' : ""}<section class="plan-list">${cards}${ready && !isViewer() ? `<p class="hand plan-hint">＼ 気分に合わせて、入れ替えOK ／</p>${rhythmOn() ? "" : dailyButton("life-confirm", "これで決定・買い物へ", "", true)}` : ""}<p class="muted small">食材制限がある場合は、作り方と市販品の表示も確認してください。</p></section>${renderShareInvite()}`;
}
let swapShowAll = false;
function renderSwapChoices() {
  const p = dailyProfile();
  const current = dailyPlan().find((d) => d.date === swapDate);
  const id = current?.slot?.recipe?.id || current?.candidate?.recipe.id;
  const used = new Set(
    dailyPlan()
      .filter((d) => d.date !== swapDate)
      .map((d) => d.slot?.recipe?.id || d.candidate?.recipe.id),
  );
  const options = allDinnerRecipes()
    .filter((r) => r.id !== id && !Object.values(recipeRatings(r)).includes("never"))
    .map((r) => ({ r, fit: Lifestyle.fit(r, p, swapDate) }))
    .filter(({ r, fit }) => fit.ok || (!r.curated && Lifestyle.reviewable(r, p, swapDate)))
    .sort((a, b) => Number(!!a.r.curated) - Number(!!b.r.curated) || Number(used.has(a.r.id)) - Number(used.has(b.r.id)) || Number(!a.fit.ok) - Number(!b.fit.ok) || (b.fit.score || 0) - (a.fit.score || 0))
    .slice(0, 12);
  const shown = swapShowAll ? options : options.slice(0, 4);
  const option = ({ r, fit }) => isViewer()
    ? (fit.ok ? `<button type="button" class="swap-option" data-action="life-request-swap" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(lastEatenLabel(r))}</small></span><b aria-hidden="true">送る</b></button>` : "")
    : fit.ok
    ? `<button type="button" class="swap-option" data-action="life-choose" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(planMeta(r, fit.reasons) || "保存したレシピ")}${used.has(r.id) ? " · ほかの日と同じ" : ""}</small></span><b aria-hidden="true">選ぶ</b></button>`
    : `<button type="button" class="swap-option needs-review" data-action="life-review-saved" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${escapeHtml(r.title)}</strong><small>確認が必要 · 時間と材料を確認すると選べます</small></span><b aria-hidden="true">確認</b></button>`;
  return `<section class="swap-panel" tabindex="-1" aria-label="${formatDate(swapDate)}の別の一品">${shown.map(option).join("") || "<p>別の候補がありません。条件をゆるめるかレシピを追加してください。</p>"}${options.length > shown.length ? `<button type="button" class="text-button" data-action="life-swap-more">ほかの候補を見る（あと${options.length - shown.length}品）</button>` : ""}</section>`;
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
  const servings = slot?.servings || dailyProfile().servings;
  const reason = (day && planReason(day)) || "";
  const tonightNeeds = slot?.status === "confirmed" ? dailyShopping().filter((i) => i.status === "buy" && i.uses?.includes(slot.recipe.title)).length : 0;
  let actions = "";
  if (off) actions = dailyButton("life-reopen", "今夜は料理する", `data-date="${today()}"`, true);
  else if (!slot || slot.status === "removed")
    actions = `${recipe ? dailyButton("life-confirm-one", "これにする", `data-date="${today()}"`, true) : dailyButton("life-profile", "条件をゆるめる", "", true)}${recipe ? `<button type="button" class="text-button swap-link" data-action="life-swap" data-date="${today()}">⇄ ほかの一皿</button>` : ""}`;
  else if (slot.status === "cooked") actions = "";
  else actions = `${dailyButton("life-cook", "作り方を見る", `data-date="${today()}"`, true)}${tonightNeeds ? dailyButton("go-view", `🛒 この料理の買うもの あと${tonightNeeds}品`, 'data-view="shopping"') : ""}`;
  const pre = !slot && day?.prestart ? prestartUntil() : "";
  const firstBlock = pre ? currentBlocks()[0] : null;
  if (pre) actions = dailyButton("go-view", "最初の献立を見る", 'data-view="plan"', true);
  const label = pre ? `献立は${formatDate(pre)}（${weekdayLabel(pre)}）から` : off ? "今日はお休み" : slot?.status === "cooked" ? "ごちそうさま！" : slot ? "今夜の一品" : "今夜のおすすめ";
  const tomorrow = plan[1];
  const tr = tomorrow?.slot?.recipe || tomorrow?.candidate?.recipe;
  const tomorrowOff = tomorrow?.off || tomorrow?.slot?.status === "off";
  return `${renderPreferencePrompt()}
  <section class="hero-card today-dish tonight-card"><div class="tonight-head"><p class="tonight-label"><span class="marker">${label}</span></p><p class="today-date">${formatDate(today())}（${weekdayLabel(today())}）· ${servings}人分</p></div>
    ${pre ? `<p class="tonight-off">最初の買い物は <b>${firstBlock ? deadlineLabel(firstBlock.shopAt) : ""}</b>。<br>それまでは、いつもどおりで大丈夫！ 🍳</p>` : off ? '<p class="tonight-off">また次の夜ごはんで。🌙</p>' : recipe ? `${dishTile(recipe, "tonight-photo")}<h3 class="tonight-title">${escapeHtml(recipe.title)}</h3>${reason && slot?.status !== "cooked" ? `<p class="tonight-reason hand"><span class="marker">${escapeHtml(reason)}</span></p>` : ""}<p class="tonight-meta">${[recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "", `${servings}人分`, bothLike(recipe) ? "😋 ふたりとも好き" : lastEatenLabel(recipe) === "はじめて" ? "はじめての一皿" : lastEatenLabel(recipe)].filter(Boolean).map(escapeHtml).join(" · ")}</p>` : '<p class="tonight-off">条件に合う料理が見つかりません。</p>'}
    ${slot?.status === "confirmed" ? conditionWarning(recipe, today()) : ""}
    ${actions || (!off && !slot) ? `<div class="tonight-actions">${actions}${!off && !pre && slot?.status !== "cooked" && recipe ? `<button class="text-button" data-action="life-off" data-date="${today()}">今日は自炊お休み</button>` : ""}</div>` : ""}</section>
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
  if (!skillProfile() && !isViewer()) rows.push(`<div class="todo-row"><span>🔪</span><p><b>料理スキル診断</b>（1分）で、作れる料理だけの献立に</p>${dailyButton("life-quiz-start", "診断する")}</div>`);
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
function renderPreferencePrompt() {
  const e = state.evaluations.find(e=>e.id===preferencePromptId && e.preferencePending);
  if (!e) return "";
  const names = raterNames();
  const rows = names.map((name) => renderCyclePicker(name, e.familyRepeatCycles?.[name], (cycle) => `data-action="life-rate" data-id="${escapeAttr(e.id)}" data-member="${escapeAttr(name)}" data-cycle="${cycle}"`)).join("");
  return `<section class="panel rate-card" role="region" aria-label="次に食べたい頃"><p class="hand rate-note">おつかれさま！</p><h3>${escapeHtml(e.recipeTitle)}、次はいつ食べたい？</h3><p class="muted small">${names.length > 1 ? "ひとりずつタップ。ふたりが食べたくなる頃に、また献立に入ります。" : "えらんだ頃に、また献立に入ります。"}</p>${rows}${dailyButton("life-frequency-close","あとで")}</section>`;
}
// Latest rating per person for a recipe (own copy or starter).
function recipeRatings(recipe) {
  const ids = new Set([recipe.id, recipe.starterId].filter(Boolean));
  state.recipes.forEach((r) => { if (r.starterId === recipe.id) ids.add(r.id); });
  const e = state.evaluations.filter((x) => ids.has(x.recipeId) && !x.preferencePending).sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))[0];
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
  if (!recipe)
    return `<section class="panel"><h2>料理を選び直してください</h2>${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</section>`;
  const servings = slot?.servings || dailyProfile().servings;
  const meta = [`${servings}人分`, recipe.planning?.minutes ? `⏱ ${recipe.planning.minutes}分（炊飯は別）` : "時間は未確認", recipe.planning?.equipment?.length ? `器具：${recipe.planning.equipment.join("・")}` : ""].filter(Boolean).join(" · ");
  const primary = slot?.status === "confirmed" && canRecordDate(cookingDate) ? dailyButton("life-cooked", "作った！", "", true) : !slot || slot.status === "removed" ? dailyButton("life-confirm-one", "この日の献立に確定", `data-date="${cookingDate}"`, true) : "";
  return `<section class="hero-card cooking-card"><button type="button" class="text-button cooking-back" data-action="go-view" data-view="plan">‹ 献立へ戻る</button><div class="cooking-head">${planThumb(recipe)}<div><p class="eyebrow">${formatDate(cookingDate)}（${weekdayLabel(cookingDate)}） · ${slot?.recipe ? "確定" : "提案中"}</p><h2>${escapeHtml(recipe.title)}</h2><p class="muted small">${escapeHtml(meta)}</p></div></div>
  <details class="cooking-safety"><summary>⚠️ 市販品の原材料と、中までの火の通りを確認してください</summary><p class="small">食材制限がある場合は市販品の原材料表示も確認してください。ごはんは炊いたものを用意し、加熱時間は様子を見て調整してください。中心温度の確認には食品用温度計を使い、2人分のレンジ加熱は途中で混ぜて追加加熱してください。</p></details>
  ${canAnalyzeRecipe(recipe) ? `<p>${dailyButton("life-analyze", analyzingDate ? "作成中…" : "動画の説明文から下書きを作る",`data-date="${cookingDate}" ${analyzingDate ? "disabled" : ""}`)}</p>` : ""}
  <h3>材料 <small class="muted">そろえたらタップ</small></h3><ul class="cooking-ingredients cooking-check">${recipe.ingredients.map((i, index) => `<li><label>${cookingCheck("ingredient", index, recipe, servings)}<span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, recipe.sourceServings))}</span></label></li>`).join("")}</ul>
  <h3>作り方 <small class="muted">終わったらタップ</small></h3><ol class="cooking-steps cooking-check">${recipe.steps.map((st, index) => `<li><label>${cookingCheck("step", index, recipe, servings)}<span>${escapeHtml(st)}</span></label></li>`).join("")}</ol>
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
  const photo = d.photo ? `<img class="dish-tile record-photo" src="${escapeAttr(d.photo)}" alt="">` : dishTile(r, "record-photo");
  return `<section class="record-editor">
    <button type="button" class="text-button cooking-back" data-action="life-record-back">‹ ふりかえりへ</button>
    <div class="record-head">${photo}<div><p class="eyebrow">${d.isNew ? "作った記録をつける" : "記録を編集"}</p><h2>${escapeHtml(r.title)}</h2><p class="muted small">${escapeHtml(lastEatenLabel(r) === "はじめて" ? "はじめての記録" : lastEatenLabel(r))}</p></div></div>
    <label class="record-field">食べた日<input id="record-date" class="input" type="date" max="${today()}" value="${escapeAttr(d.cookedAt)}" ${fixedDate ? "readonly" : ""}></label>
    <h3 class="record-h">次はいつ食べたい？</h3>
    <p class="muted small">ふたりとも食べたくなる頃に、また献立に入ります。</p>
    ${raterNames().map((name) => renderCyclePicker(name, d.familyRepeatCycles[name], (cycle) => `data-action="life-record-cycle" data-member="${escapeAttr(name)}" data-cycle="${cycle}"`)).join("")}
    <label class="record-field">メモ<textarea id="record-memo" class="textarea" maxlength="400" placeholder="例：次は具を多めに">${escapeHtml(d.memo || "")}</textarea></label>
    <div class="record-photo-actions"><label class="secondary-button" for="record-photo">📷 写真を${d.photo ? "変える" : "追加"}</label><input id="record-photo" type="file" accept="image/*" hidden>${d.photo ? '<button type="button" class="text-button" data-action="life-record-photo-remove">写真を外す</button>' : ""}</div>
    ${dailyButton("life-record-save", "記録を保存", "", true)}
    ${d.isNew ? "" : '<button type="button" class="text-button danger full-button" data-action="life-record-delete">この記録を削除</button>'}
  </section>`;
}

let reflMonth = 0; // 0 = this month, -1 = last month, ...
function reflectionMonth() {
  const [y, m] = today().split("-").map(Number);
  const d = new Date(y, m - 1 + reflMonth, 1);
  return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${d.getFullYear()}年${d.getMonth() + 1}月` };
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
    const photo = e.photo ? `<img class="dish-tile" src="${escapeAttr(e.photo)}" alt="" loading="lazy">` : dishTile(r);
    return `<button type="button" class="table-tile" data-action="life-edit-record" data-id="${escapeAttr(e.id)}" aria-label="${escapeAttr(`${formatDate(e.cookedAt)} ${r.title}の記録を開く`)}">${photo}<span class="day-num">${Number(e.cookedAt.slice(8, 10))}</span>${loved(e) ? '<span class="tile-love" aria-hidden="true">😍</span>' : ""}<small>${escapeHtml(r.title)}</small></button>`;
  }).join("");
  return `<div class="page-actions">${nav}</div>
  ${list.length ? `<div class="refl-stats"><p><strong>${list.length}</strong><small>回つくった</small></p><p><strong>${tally.size}</strong><small>種類の料理</small></p><p><strong>${lovedCount}</strong><small>また食べたい</small></p></div>` : ""}
  ${fav ? `<section class="fav-card"><p class="eyebrow">${reflMonth === 0 ? "今月" : "この月"}の偏愛</p><div class="fav-body">${dishTile(favRecipe, "fav-photo")}<div><h3>${escapeHtml(favRecipe.title)}</h3><p class="hand"><span class="marker">${escapeHtml(favNote)}</span></p></div></div></section>` : ""}
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
    savedAt: today(),
    updatedAt: nowIso(),
    catalog: null,
  };
  state.recipes.unshift(own);
  return own;
}
function confirmDaily(day, recipe = day.candidate?.recipe) {
  if (!recipe) return;
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
    preferencePromptId = id;
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
  }
  completeRequests(slot.recipe);
  state.mealSlots[slot.date] = {
    ...slot,
    status: "cooked",
    updatedAt: nowIso(),
  };
}
function bindDailyEvents() {
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
    // The rhythm step starts on the recommended 3-day rhythm if nothing was picked.
    if (profileDraft().quickSetupIndex === 1 && !rhythmOn()) {
      state.rhythm = { preset: "3day", shopTime: document.querySelector("#rhythm-time")?.value || "17:00", updatedAt: nowIso() };
      state.rhythm.startFrom = firstFullBlock()?.start || "";
    }
    profileDraft().quickSetupIndex = Math.min(QUICK_STEPS - 1, profileDraft().quickSetupIndex + 1);
  }
  if (action === "life-quick-skill") {
    state.skillProfile = { level: Number(data.level), growth: state.skillProfile?.growth || "steady", updatedAt: nowIso() };
    profileDraft().quickSetupIndex = 3;
  }
  if (action === "life-quick-back") profileDraft().quickSetupIndex=Math.max(0,profileDraft().quickSetupIndex-1);
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
    touchSettings();
  }
  if (action === "life-length")
    state.planLength = Number(data.length) === 7 ? 7 : 3;
  if (action === "life-confirm") {
    const only = data.block ? currentBlocks().find((b) => b.key === data.block)?.dates || [] : null;
    trackDaily("plan_confirmed", {
      days: dailyPlan().filter((d) => d.candidate).length,
    });
    dailyPlan()
      .filter((d) => d.candidate && (!only || only.includes(d.date)))
      .forEach((d) => confirmDaily(d));
    changedShopping(before);
    state.view = "shopping";
  }
  if (action === "life-confirm-one") {
    const d = dailyPlan().find((d) => d.date === data.date);
    if (d?.candidate) confirmDaily(d);
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
  if (action === "life-recipe-tab") recipeTab = ["saved", "starter"].includes(data.tab) ? data.tab : "all";
  if (action === "life-save-starter") {
    const r = Lifestyle.curated.find((x) => x.id === data.recipe);
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
    cookingDate = data.date;
    state.view = "cooking";
  }
  if (action === "life-analyze") { analyzeCookingRecipe(data.date); return true; }
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
  if (action === "life-rate") {
    const e = state.evaluations.find(e=>e.id===data.id);
    if (e?.preferencePending && CYCLE_CHOICES.some(r=>r.cycle===data.cycle) && raterNames().includes(data.member)) {
      if (!state.family.includes(data.member)) state.family.push(data.member);
      e.familyRepeatCycles = {...e.familyRepeatCycles, [data.member]:data.cycle};
      e.updatedAt = nowIso();
      if (raterNames().every(n => e.familyRepeatCycles[n])) {
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
  if (!state.draft.planning) state.draft.planning = Lifestyle.suggestPlanning({ingredients:state.extractedIngredients, steps:state.extractedSteps});
  const p = state.draft.planning;
  const chips = (values,field) => `<div class="planning-chips">${values.map(v=>`<label class="planning-chip"><input type="checkbox" data-planning-field="${field}" value="${escapeAttr(v)}" ${(p[field]||[]).includes(v)?"checked":""}><span>${escapeHtml(v)}</span></label>`).join("")}</div>`;
  const summary = planningSummaryText(p);
  return `<section id="planning-panel" class="planning-panel"><h3>🍳 献立に使う条件</h3><p class="muted small">材料と手順から読み取りました。違うところだけ直してください。</p>
  <div class="planning-row"><span>時間</span><div class="planning-options">${[10,15,20,30,45,60].map(n=>`<button type="button" class="choice-button" data-planning-minute="${n}" aria-pressed="${p.minutes===n}">${n}分</button>`).join("")}</div></div>
  <div class="planning-row"><span>手間</span><div class="planning-options"><input id="planning-easy" type="hidden" value="${p.easy===true?"true":p.easy===false?"false":""}"><button type="button" class="choice-button" data-planning-easy="true" aria-pressed="${p.easy===true}">😊 かんたん</button><button type="button" class="choice-button" data-planning-easy="false" aria-pressed="${p.easy===false}">🍳 手間をかける</button></div></div>
  <dl class="planning-summary"><div><dt>器具</dt><dd data-planning-summary="equipment">${escapeHtml(summary.equipment)}</dd></div><div><dt>含む食材</dt><dd data-planning-summary="contains">${escapeHtml(summary.contains)}</dd></div><div><dt>作業</dt><dd data-planning-summary="tasks">${escapeHtml(summary.tasks)}</dd></div></dl>
  <details class="planning-edit" ${p.equipment?.length || p.noEquipment ? "" : "open"}><summary>器具・食材・作業を直す</summary>${p.equipment?.length || p.noEquipment ? "" : '<p class="notice small">使う器具を選んでください（なければ「特別な器具は使わない」）。</p>'}
  <label class="field">時間を直接入力（分）<input id="planning-minutes" class="input" type="number" inputmode="numeric" min="1" max="300" value="${escapeAttr(p.minutes||"")}"></label>
  <h4>使う器具</h4>${chips([...new Set([...Lifestyle.equipment, ...(p.equipment||[])])],"equipment")}<label class="profile-choice"><input id="planning-no-equipment" type="checkbox" ${p.noEquipment?"checked":""}>特別な器具は使わない</label>
  <h4>含む・市販品によって含む食材</h4>${chips(Lifestyle.restrictionOptions,"contains")}
  <h4>必要な作業</h4>${chips(["肉を切る","揚げる","長く煮込む"],"tasks")}
  <h4>味の分類</h4>${chips(["和風","洋風","中華風"],"tastes")}
  ${dailyButton("life-planning-suggest","材料・手順から読み取り直す")}</details>
  <label class="profile-choice planning-confirm"><input id="planning-verified" type="checkbox" ${p.ingredientsVerified && p.conditionsConfirmed?"checked":""}>材料・市販品の表示と、上の条件を確認した</label>
  <p class="muted small">わからなければ未確認のまま保存できます。自動の献立には使わず、入れ替え時に確認します。</p><button type="button" class="text-button" data-action="save-recipe-unreviewed">未確認で保存する</button></section>`;
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

// 初回のかんたん設定（5問・約1分）：人数 → 献立のリズム → 料理スキル → 平日の時間 → 食べられないもの・苦手
const COMMON_DISLIKES = ["パクチー", "ピーマン", "なす", "セロリ", "しいたけ", "トマト", "納豆", "レバー", "さば", "ゴーヤ"];
const QUICK_STEPS = 5;
function renderQuickSetup() {
  const p = profileDraft(), i = p.quickSetupIndex;
  const rhythmNow = state.rhythm?.preset || "3day";
  const skillNow = state.skillProfile?.level || 0;
  const content = [
    `<div class="profile-options">${optionInput("servings", 1, "ひとり分")}${optionInput("servings", 2, "ふたり分")}</div>`,
    `<p>決める日と買い物の日が、曜日で決まります。</p><div class="rhythm-options">${Object.entries(RHYTHMS).map(([id, r]) => `<button type="button" class="rhythm-option" data-action="life-rhythm" data-preset="${id}" aria-pressed="${rhythmNow === id}"><strong>${r.label}${id === "3day" ? "（おすすめ）" : ""}</strong><small>${r.note}</small></button>`).join("")}</div><label class="rhythm-time">買い物の時間（まとまりの前日）<select id="rhythm-time" class="input">${SHOP_TIMES.map((t) => `<option ${(state.rhythm?.shopTime || "17:00") === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>`,
    `<p>作れる料理だけで献立を組みます。近いものをタップ。</p><div class="skill-picks">${[1, 2, 3, 4, 5].map((l) => `<button type="button" class="rhythm-option" data-action="life-quick-skill" data-level="${l}" aria-pressed="${skillNow === l}"><strong><span class="skill-stars">${Skills.stars(l)}</span> ${SKILL_TYPES[l].name}</strong><small>${SKILL_PICK_HINT[l]}</small></button>`).join("")}</div><button type="button" class="text-button" data-action="life-quiz-start">わからない → 1分で診断する</button>`,
    `<div class="profile-options">${[10, 20, 30, 60].map((n) => optionInput("weekdayMinutes", n, `${n}分以内`)).join("")}${optionInput("weekdayMinutes", "null", "未指定")}</div><p class="muted small">休日の時間はあとで設定できます。炊飯時間は別です。</p>`,
    `<h3 class="quick-sub">アレルギー・食べられないもの</h3><div class="profile-options">${Lifestyle.restrictionOptions.map((n) => optionInput("restrictions", n, n, true)).join("")}</div>${textInput("restrictions", "一覧にない食材", "例：キウイ、山いも")}
     <h3 class="quick-sub">苦手なもの</h3><div class="profile-options">${COMMON_DISLIKES.map((n) => optionInput("dislikes", n, n, true)).join("")}</div>${textInput("dislikes", "ほかの苦手", "例：セロリ、らっきょう")}
     <p class="muted small">選んだものは献立に入りません。市販品の原材料と、調理器具を確認してから作ってください。</p>`,
  ][i];
  const titles = ["🍽️ 何人分つくる？", "🗓 献立は、どのリズムで決める？", "🔪 料理は、どのくらいする？", "⏱️ 平日は何分くらい？", "🔎 食べられないもの・苦手なものは？"];
  document.body.classList.toggle("is-onboarding", !state.onboarded);
  document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard"><div class="wizard-progress"><span>はじめの5問</span><span>${i + 1} / ${QUICK_STEPS}</span></div><progress max="${QUICK_STEPS}" value="${i + 1}" aria-label="初回設定の進捗"></progress><h2>${titles[i]}</h2>${content}<div class="wizard-footer"><button class="text-button" data-action="life-quick-back" ${i === 0 ? "disabled" : ""}>戻る</button><button class="primary-button" data-action="${i === QUICK_STEPS - 1 ? "life-finish" : "life-quick-next"}">${i === QUICK_STEPS - 1 ? "最初の献立を見る" : "次へ"}</button></div><p class="muted small">好み・器具・常備品はあとで調整できます。</p></section>`;
  document.querySelectorAll("[data-profile]").forEach((el) => el.addEventListener("input", () => captureProfile(el)));
  bindAutoAdvance();
  document.querySelectorAll("[data-action]").forEach((el) => el.addEventListener("click", handleAction));
}
const SKILL_PICK_HINT = { 1: "混ぜてチン、が中心", 2: "切って炒める・煮るならOK", 3: "照り焼きやガパオも作れる", 4: "ハンバーグや揚げ焼きも", 5: "揚げ物も魚をおろすのも" };

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
    state.draft.planning = undefined;
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
  return Lifestyle.curated
    .filter((r) => !saved.has(r.id))
    // Browsing only needs the safety filter; tools are checked again before a dish is planned.
    .filter((r) => Lifestyle.fit(r, dailyProfile(), today()).ok)
    .filter((r) => !query || [r.title, ...r.ingredients.map((i) => i.name), ...(r.planning?.tastes || [])].join(" ").toLowerCase().includes(query));
}

// ----- レシピの詳細（閲覧が基本。編集は「編集する」から） -----
let recipeDetailId = "";
function detailRecipe() {
  return recipeById(recipeDetailId) || Lifestyle.curated.find((r) => r.id === recipeDetailId) || null;
}
function tagLabels(recipe) {
  const labels = new Map(Lifestyle.FACETS.flatMap((f) => f.options));
  return Lifestyle.tags(recipe).map((t) => labels.get(t)).filter(Boolean);
}
function renderRecipeDetail() {
  const r = detailRecipe();
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
    ${dishTile(r, "detail-photo")}
    <h2 class="detail-title">${escapeHtml(r.title)}</h2>
    <p class="detail-meta">${meta.map(escapeHtml).join(" · ")}</p>
    <div class="detail-tags">${tagLabels(r).map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join("")}</div>
    ${renderSkillLine(r)}
    <p class="detail-history">${last === "はじめて" ? "まだ作っていません" : `前回：${escapeHtml(last)}`}${Object.keys(ratings).length ? ` · ${Object.entries(ratings).map(([n, c]) => `${escapeHtml(n)}：${escapeHtml(cycleLabel(c))}`).join(" / ")}` : ""}</p>
    <div class="detail-actions">${requestButton(r)}${edit ? (saved ? dailyButton("edit-recipe", "✏️ 編集する", `data-recipe="${escapeAttr(r.id)}"`) : dailyButton("life-save-starter", "🔖 自分のレシピに保存", `data-recipe="${escapeAttr(r.id)}"`)) : ""}${r.videoUrl ? `<a class="secondary-button link-button" href="${escapeAttr(r.videoUrl)}" target="_blank" rel="noreferrer">▶ 動画を開く</a>` : ""}</div>
    <h3 class="detail-h">材料 <small>${servings}人分</small></h3>
    ${r.ingredients?.length ? `<ul class="detail-ingredients">${r.ingredients.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, r.sourceServings))}</span></li>`).join("")}</ul>` : '<p class="muted small">材料が登録されていません。</p>'}
    <h3 class="detail-h">作り方</h3>
    ${r.steps?.length ? `<ol class="detail-steps">${r.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` : '<p class="muted small">作り方が登録されていません。</p>'}
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
  return { show: raw?.show !== false, asked: !!raw?.asked, updatedAt: normalizeTimestamp(raw?.updatedAt) };
}
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
