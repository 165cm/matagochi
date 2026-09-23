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
  "今夜のときめき診断",
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
  document.querySelector("#app").innerHTML = `<section class="hero-card profile-wizard welcome-card"><h2 tabindex="-1">🍽️ 今夜の一品を、すぐ決めよう</h2><p>人数・平日の調理時間・食べられないものの3つに答えると、3日分の夜ごはんを提案します。</p><div class="welcome-actions">${dailyButton("life-quick", "3問ではじめる（約30秒）", "", true)}${dailyButton("life-preview", "設定せずに見てみる")}</div><button type="button" class="text-button" data-action="life-detailed">好み・器具・常備品まで詳しく設定する</button></section>`;
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
function bindAutoAdvance() {
  const p = profileDraft();
  const single = p.quickSetupIndex !== null ? p.quickSetupIndex < 2 : p.step === 0;
  if (!single) return;
  document.querySelectorAll('.profile-wizard input[type="radio"][data-profile]').forEach((el) =>
    el.addEventListener("click", () => {
      if (autoAdvancing) return;
      autoAdvancing = true;
      captureProfile(el);
      setTimeout(() => {
        autoAdvancing = false;
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
    servings: state.servingCount,
  });
}
function allDinnerRecipes() {
  const personal = state.recipes.filter((r) => r.mealType === "dinner");
  const originals = new Set(personal.map((r) => r.starterId));
  return [
    ...personal,
    ...Lifestyle.curated.filter((r) => !originals.has(r.id)),
  ];
}
function dailyPlan() {
  const p = dailyProfile();
  return Lifestyle.propose({
    recipes: allDinnerRecipes(),
    profile: p,
    slots: state.mealSlots || {},
    start: today(),
    length: state.planLength || p.period,
    addDays,
    overrides: state.planOverrides,
    repeatScore: (r) => {
      const summary = getRecipeRepeatSummary(r.id);
      return summary.excluded
        ? -Infinity
        : summary.unrecorded
          ? 0
          : Math.max(1, 12 - Math.max(0, summary.daysUntil));
    },
  });
}
function dailyShopping() {
  const p = dailyProfile();
  const length =
    p.shoppingFrequency === "daily"
      ? 1
      : p.shoppingFrequency === "weekly"
        ? 7
        : state.planLength || 3;
  return Lifestyle.shopping({
    slots: state.mealSlots || {},
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
  const photo = recipe ? recipeThumbnail(recipe) : "";
  return photo ? `<img class="plan-thumb" src="${escapeAttr(photo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'plan-thumb',textContent:'🍳'}))">` : '<span class="plan-thumb" aria-hidden="true">🍳</span>';
}
function planMeta(recipe, reasons = []) {
  const minutes = recipe?.planning?.minutes ? `⏱ ${recipe.planning.minutes}分` : "";
  return [minutes, ...reasons.filter((r) => !/分目安$|器具を確認/.test(r)).slice(0, 2)].filter(Boolean).join(" · ");
}
function renderDailyPlan() {
  const plan = dailyPlan();
  const cards = plan
    .map((day) => {
      const recipe = day.slot?.recipe || day.candidate?.recipe;
      const dateLabel = `${formatDate(day.date)}（${weekdayLabel(day.date)}）`;
      if (day.slot?.status === "off" || day.off)
        return `<article class="plan-card is-off"><div class="plan-main"><span class="plan-thumb" aria-hidden="true">🌙</span><span><small>${dateLabel}</small><strong>自炊はお休み</strong></span></div><button type="button" class="plan-icon" data-action="life-reopen" data-date="${day.date}">料理する</button></article>`;
      if (!recipe)
        return `<article class="plan-card"><div class="plan-main"><span class="plan-thumb" aria-hidden="true">🤔</span><span><small>${dateLabel}</small><strong>条件に合う候補がありません</strong><small>時間・食材・器具の条件をゆるめるか、レシピを追加してください。</small></span></div>${dailyButton("life-profile", "条件を確認")}</article>`;
      const status = day.slot?.status === "cooked" ? "作った" : day.slot ? "確定" : "提案";
      const meta = day.slot ? `${day.slot.servings}人分${recipe.planning?.minutes ? ` · ⏱ ${recipe.planning.minutes}分` : ""}` : planMeta(recipe, day.candidate.reasons);
      const more = day.slot?.status === "cooked" ? "" : `<details class="plan-more"><summary aria-label="${dateLabel}のその他の操作">⋯</summary><div>${day.slot?.status === "confirmed" && slotHasUpdates(day.slot) ? dailyButton("life-refresh", "今のレシピ・人数を反映", `data-date="${day.date}"`) : ""}<button class="text-button" data-action="life-off" data-date="${day.date}">この日は自炊お休み</button></div></details>`;
      return `<article class="plan-card ${swapDate === day.date ? "is-swapping" : ""}"><button type="button" class="plan-main" data-action="life-cook" data-date="${day.date}" aria-label="${dateLabel} ${escapeAttr(recipe.title)}の作り方を見る">${planThumb(recipe)}<span><small>${dateLabel} · <b class="plan-status">${status}</b></small><strong>${escapeHtml(recipe.title)}</strong><small>${escapeHtml(meta)}</small></span></button>${day.slot?.status === "cooked" ? "" : `<button type="button" class="plan-icon" data-action="${swapDate === day.date ? "life-close-swap" : "life-swap"}" data-date="${day.date}" aria-expanded="${swapDate === day.date}" aria-label="${swapDate === day.date ? "候補を閉じる" : `${dateLabel}の料理を入れ替える`}">${swapDate === day.date ? "閉じる" : '<span aria-hidden="true">⇄</span><span class="plan-icon-label">変更</span>'}</button>`}${more}${day.slot ? conditionWarning(recipe, day.date) : ""}</article>${swapDate === day.date ? renderSwapChoices() : ""}`;
    })
    .join("");
  const ready = plan.filter((d) => d.candidate).length;
  return `<section class="hero-card plan-hero"><div class="plan-hero-head"><h2>📅 夜ごはんの献立</h2><span class="muted small">${dailyProfile().servings}人分</span></div>${!state.foodProfile?.completedAt ? '<p class="muted small">お試しの提案です。食材制限・調理時間・器具は、作る前に確認してください。</p>' : ""}<div class="plan-toolbar"><div class="segmented" role="group" aria-label="献立の日数">${[3, 7].map((n) => `<button class="choice-button" aria-pressed="${(state.planLength || 3) === n}" data-action="life-length" data-length="${n}">${n}日分</button>`).join("")}</div><button type="button" class="text-button" data-action="${!state.foodProfile?.completed ? "life-quick" : "life-profile"}">条件を調整</button></div></section><section class="panel plan-list">${cards}${ready ? dailyButton("life-confirm", `${ready}日分を確定して買い物へ`, "", true) : ""}<p class="muted small">食材制限がある場合は、作り方と市販品の表示も確認してください。</p></section>`;
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
    .filter((r) => r.id !== id && !getRecipeRepeatSummary(r.id).excluded)
    .map((r) => ({ r, fit: Lifestyle.fit(r, p, swapDate) }))
    .filter(({ r, fit }) => fit.ok || (!r.curated && Lifestyle.reviewable(r, p, swapDate)))
    .sort((a, b) => Number(!!a.r.curated) - Number(!!b.r.curated) || Number(used.has(a.r.id)) - Number(used.has(b.r.id)) || Number(!a.fit.ok) - Number(!b.fit.ok) || (b.fit.score || 0) - (a.fit.score || 0))
    .slice(0, 12);
  const shown = swapShowAll ? options : options.slice(0, 4);
  const option = ({ r, fit }) => fit.ok
    ? `<button type="button" class="swap-option" data-action="life-choose" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${escapeHtml(r.title)}</strong><small>${escapeHtml(planMeta(r, fit.reasons) || "保存したレシピ")}${used.has(r.id) ? " · ほかの日と同じ" : ""}</small></span><b aria-hidden="true">選ぶ</b></button>`
    : `<button type="button" class="swap-option needs-review" data-action="life-review-saved" data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}">${planThumb(r)}<span><strong>${escapeHtml(r.title)}</strong><small>確認が必要 · 時間と材料を確認すると選べます</small></span><b aria-hidden="true">確認</b></button>`;
  return `<section class="swap-panel" tabindex="-1" aria-label="${formatDate(swapDate)}の別の一品">${shown.map(option).join("") || "<p>別の候補がありません。条件をゆるめるかレシピを追加してください。</p>"}${options.length > shown.length ? `<button type="button" class="text-button" data-action="life-swap-more">ほかの候補を見る（あと${options.length - shown.length}品）</button>` : ""}</section>`;
}
function renderToday() {
  const day = dailyPlan()[0],
    slot = state.mealSlots?.[today()],
    recipe = slot?.recipe || day?.candidate?.recipe;
  const remaining = dailyShopping().filter((i) => i.status === "buy").length;
  const off = slot?.status === "off" || (!slot && day?.off);
  let cta;
  if (off)
    cta = dailyButton(
      "life-reopen",
      "今夜は料理する",
      `data-date="${today()}"`,
      true,
    );
  else if (!slot || slot.status === "removed")
    cta = dailyButton(
      "go-view",
      `${state.planLength || 3}日分を確認する`,
      'data-view="plan"',
      true,
    );
  else if (slot.status === "cooked")
    cta = dailyButton(
      "go-view",
      "明日のごはんを見る",
      'data-view="plan"',
      true,
    );
  else if (remaining)
    cta = dailyButton(
      "go-view",
      "買うものを確認する",
      'data-view="shopping"',
      true,
    );
  else
    cta = dailyButton(
      "life-cook",
      "作り方を見る",
      `data-date="${today()}"`,
      true,
    );
  const recent = state.evaluations.filter(
    (e) =>
      daysBetween(e.cookedAt, today()) >= 0 &&
      daysBetween(e.cookedAt, today()) < 7,
  );
  return `${renderPreferencePrompt()}${renderRecentMeals()}<section class="today-heading"><p class="eyebrow">${formatDate(today())}（${weekdayLabel(today())}） · ${slot?.servings || dailyProfile().servings}人分</p><h2>${off ? "今日は、ひと休み。" : slot?.status === "cooked" ? "今日も、ごちそうさま。" : "今夜も、おいしく。"}</h2></section>
  ${!state.foodProfile?.completed ? `<section class="setup-invitation"><p>好みとキッチンを教えると、提案があなた向けに。</p>${dailyButton("life-profile", state.onboardingDraft ? "初回設定の続きをする" : "食生活を設定する")}</section>` : ""}
  <section class="hero-card today-dish">${off ? "" : dishVisual(recipe, true)}<div class="today-dish-body"><p class="eyebrow">${off ? "自炊お休み" : slot?.status === "cooked" ? "作った一品" : slot ? "今夜の一品" : "今夜の候補"}</p><h3>${off ? "また次の夜ごはんで。" : recipe ? escapeHtml(recipe.title) : "あなたに合う一品を探しましょう"}</h3>${!off && day?.candidate ? `<p class="muted">${escapeHtml(day.candidate.reasons.join(" · "))}</p>` : ""}${slot?.status === "confirmed" ? conditionWarning(recipe, today()) : ""}${cta}${slot?.status === "confirmed" ? dailyButton("life-cook", "すぐ作り方を見る", `data-date="${today()}"`) : ""}${slot?.status === "cooked" ? dailyButton("life-again", "また食べたい", `data-date="${today()}"`) : ""}${!off && slot?.status !== "cooked" ? `<button class="text-button" data-action="life-off" data-date="${today()}">今日は自炊お休み</button>` : ""}</div></section>
  <section class="panel"><div class="section-head"><h3>🛒 買うもの</h3><span class="badge">残り${remaining}品</span></div>${dailyButton("go-view", "買い物リストを開く", 'data-view="shopping"')}</section>
  <section class="panel"><h3>📅 この先の夜ごはん</h3>${dailyPlan()
    .slice(1, 3)
    .map(
      (d) =>
        `<p>${formatDate(d.date)} · ${escapeHtml(d.slot?.recipe?.title || d.candidate?.recipe.title || (d.off || d.slot?.status === "off" ? "お休み" : "未定"))}</p>`,
    )
    .join(
      "",
    )}${dailyButton("go-view", "献立を見る", 'data-view="plan"')}</section>
  ${playlistAvailable && state.recipes.length < 5 ? `<section class="panel"><h3>📺 保存した料理動画をまとめて追加</h3><p>公開・限定公開の再生リストから保存し、条件を確認して献立に使えます。</p>${dailyButton("go-view","再生リストから取り込む",'data-view="playlist"')}</section>` : ""}
  ${recent.length ? `<section class="panel"><h3>😋 今週のごちそう</h3><p>今週は${recent.length}回「作った」を記録しました。</p>${dailyButton("go-view", "ふりかえる", 'data-view="repeat"')}</section>` : ""}${!state.recipes.length ? `<section class="panel"><h3>📖 お気に入りのレシピ</h3><p>SNSで見つけたレシピを保存すると、献立に使えます。</p>${dailyButton("go-view", "レシピを追加", 'data-view="register"')}</section>` : ""}`;
}
function canRecordDate(date) { return date >= addDays(today(), -3) && date <= today(); }
function renderRecentMeals() {
  const slots = Object.values(state.mealSlots || {}).filter(s => s.status === "confirmed" && s.date < today() && canRecordDate(s.date)).sort((a,b)=>b.date.localeCompare(a.date));
  return slots.length ? `<section class="panel"><h3>🍳 作った？</h3>${slots.map(s=>`<div class="daily-plan-row"><p>${formatDate(s.date)} · ${escapeHtml(s.recipe.title)}</p>${dailyButton("life-record-past","作った",`data-date="${s.date}"`)}</div>`).join("")}</section>` : "";
}
function renderPreferencePrompt() {
  const e = state.evaluations.find(e=>e.id===preferencePromptId && e.preferencePending);
  if (!e) return "";
  const emoji = ["😍","😋","😊","🙂","😌","🙅"];
  return `<section class="panel" role="region" aria-label="また食べたい頻度"><h3>また食べたいのは、いつ？</h3><p>${escapeHtml(e.recipeTitle)}</p><div class="actions">${repeatOptions.map((o,i)=>dailyButton("life-frequency",`${emoji[i]} ${o.label}`,`data-id="${escapeAttr(e.id)}" data-cycle="${o.id}"`)).join("")}</div>${dailyButton("life-frequency-close","あとで")}</section>`;
}
function renderDailyShopping() {
  const items = dailyShopping();
  const aisle = i => /野菜/.test(i.category) ? "🥬 野菜" : /肉|魚/.test(i.category) ? "🥩 肉・魚" : /卵|乳|大豆|豆腐|チーズ|牛乳|バター/.test(i.category + i.name) ? "🥚 卵・乳製品・豆腐" : "🥫 主食・乾物・調味料";
  const order = ["🥬 野菜", "🥩 肉・魚", "🥚 卵・乳製品・豆腐", "🥫 主食・乾物・調味料"];
  const count = (status) => items.filter((i) => i.status === status).length;
  const row = (i, status) => `<div class="daily-shopping-row"><label class="daily-shopping-check"><input type="checkbox" data-shopping-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を購入済みにする" ${status==="purchased" ? "checked" : ""}><span><strong>${escapeHtml(i.name)}</strong><small>${escapeHtml(i.amount)}</small>${i.recheck ? '<small class="notice">必要量を再確認</small>' : ""}</span></label>${status === "purchased" ? "" : `<button type="button" class="shopping-inline" data-action="life-shopping-status" data-id="${escapeAttr(i.id)}" data-status="${status==="have" ? "buy" : "have"}" aria-label="${escapeAttr(i.name)}を${status==="have" ? "買うものに戻す" : "家にあるにする"}">${status==="have" ? "買う" : "家にある"}</button>`}${i.id.startsWith("manual-") ? `<button type="button" class="shopping-inline" data-action="life-remove-item" data-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}を削除">✕</button>` : ""}</div>`;
  const rows = (status) => order.map((category) => {
    const list = items.filter((i) => i.status === status && aisle(i) === category);
    return list.length ? `<h4>${category}</h4>${list.map((i) => row(i, status)).join("")}` : "";
  }).join("");
  const buyPanel = items.length ? `<section class="panel"><h3>買うもの <span class="badge">${count("buy")}</span></h3>${count("buy") ? rows("buy") : '<p>🎉 全部そろいました。</p>'}</section>` : "";
  const folded = (status, title, hint) => count(status) ? `<details class="panel shopping-fold"><summary><h3>${title} <span class="badge">${count(status)}</span></h3><small class="muted">${hint}</small></summary>${rows(status)}</details>` : "";
  return `<section class="hero-card shopping-hero"><h2>🛒 買い物リスト</h2>${items.length ? `<p>買うもの <strong>${count("buy")}品</strong> · 家にある ${count("have")}品 · 購入済み ${count("purchased")}品</p><div class="actions">${dailyButton("copy-shopping", "コピー")}${dailyButton("share-shopping", "共有")}</div>` : ""}${shoppingNotice ? `<p role="status" class="notice">${escapeHtml(shoppingNotice)}</p>` : ""}<button type="button" class="text-button" data-action="life-profile">常備品・買い物の頻度を変える</button></section>${!items.length ? `<section class="panel"><p>献立を確定すると、必要な材料だけのリストができます。</p>${dailyButton("go-view", "献立を決める", 'data-view="plan"', true)}</section>` : ""}${buyPanel}<section class="panel"><h3>買い足すもの</h3><div class="shopping-add"><input id="manual-name" class="input" maxlength="100" placeholder="品名（例：牛乳）" aria-label="品名"><input id="manual-amount" class="input" maxlength="80" placeholder="数量" aria-label="数量"><button type="button" class="primary-button" data-action="life-add-item" aria-label="買い足すものに追加">追加</button></div></section>${folded("have", "家にある", "調味料は残量も確認してください")}${folded("purchased", "購入済み", "チェックを外すと買うものに戻ります")}`;
}
function renderCooking() {
  const day = dailyPlan().find((d) => d.date === cookingDate);
  const slot = state.mealSlots?.[cookingDate];
  const recipe = slot?.recipe || day?.candidate?.recipe;
  if (!recipe)
    return `<section class="panel"><h2>料理を選び直してください</h2>${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</section>`;
  const servings = slot?.servings || dailyProfile().servings;
  return `<section class="hero-card">${dishVisual(recipe)}<h2>${escapeHtml(recipe.title)}</h2><p>${servings}人分 · ${slot?.recipe ? "確定時の内容" : "提案中"}</p>${recipe.planning ? `<p class="muted small">${recipe.planning.minutes}分目安（炊飯は別途） / 器具：${escapeHtml(recipe.planning.equipment.join("、"))}</p>` : "<p>調理時間・必要な器具は未確認です。</p>"}<p class="notice small">食材制限がある場合は市販品の原材料表示も確認してください。ごはんは炊いたものを用意し、加熱時間は様子を見て調整してください。中心温度の確認には食品用温度計を使い、2人分のレンジ加熱は途中で混ぜて追加加熱してください。</p>${canAnalyzeRecipe(recipe) ? `<p>${dailyButton("life-analyze", analyzingDate ? "作成中…" : "動画の説明文から下書きを作る",`data-date="${cookingDate}" ${analyzingDate ? "disabled" : ""}`)}</p>` : ""}<h3>材料</h3><ul class="cooking-ingredients">${recipe.ingredients.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, recipe.sourceServings))}</span></li>`).join("")}</ul><h3>作り方</h3><ol class="cooking-steps">${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol><div class="actions">${slot?.status === "confirmed" && canRecordDate(cookingDate) ? dailyButton("life-cooked", "作った", "", true) : !slot || slot.status === "removed" ? dailyButton("life-confirm-one", "この日の献立に確定", `data-date="${cookingDate}"`, true) : ""}${dailyButton("life-save-copy", "自分のレシピに保存", `data-recipe="${escapeAttr(recipe.id)}"`)}${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</div></section>`;
}
function renderReflection() {
  return `<section class="hero-card"><p class="eyebrow">YOUR DELICIOUS DAYS</p><h2>😋 また食べたい記録。</h2>${state.evaluations.length ? `<p>食べた記録は${state.evaluations.length}回。好きな一品が、次の献立につながります。</p>${dailyButton("life-record-details", "記録・写真・好みを編集")}` : "<p>「作った」を押すと、ここに記録がたまり、次の献立に活かされます。</p>"}</section><section class="panel">${
    [...state.evaluations]
      .sort((a, b) => b.cookedAt.localeCompare(a.cookedAt))
      .slice(0, 20)
      .map(
        (e) =>
          `<article class="daily-plan-row"><p>${formatDate(e.cookedAt)}</p>${e.photo ? `<img class="daily-photo" src="${escapeAttr(e.photo)}" alt="食卓の記録" loading="lazy">` : ""}<h3>${escapeHtml(e.recipeTitle || recipeById(e.recipeId)?.title || "保存済みの料理")}</h3>${e.memo ? `<p>${escapeHtml(e.memo)}</p>` : ""}${dailyButton("life-edit-record", "写真・メモ・好みを編集", `data-id="${escapeAttr(e.id)}"`)}</article>`,
      )
      .join("") || "<p>今夜の「作った」から、思い出が増えていきます。</p>"
  }</section>`;
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
  state.mealSlots[slot.date] = {
    ...slot,
    status: "cooked",
    updatedAt: nowIso(),
  };
}
function bindDailyEvents() {
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
  if (action === "life-quick-next") profileDraft().quickSetupIndex=Math.min(2,profileDraft().quickSetupIndex+1);
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
    touchSettings();
  }
  if (action === "life-length")
    state.planLength = Number(data.length) === 7 ? 7 : 3;
  if (action === "life-confirm") {
    trackDaily("plan_confirmed", {
      days: dailyPlan().filter((d) => d.candidate).length,
    });
    dailyPlan()
      .filter((d) => d.candidate)
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
  if (action === "life-record-details") {
    editingEvaluationId = "";
    state.view = "recordDetails";
  }
  if (action === "life-edit-record") {
    const e = state.evaluations.find((e) => e.id === data.id);
    if (e && recipeById(e.recipeId)) {
      editingEvaluationId = e.id;
      state.selectedRecipeId = e.recipeId;
      state.repeatDraft = {
        ...clone(e),
        familyRepeatCycles: normalizeFamilyRepeatCycles(
          e.familyRepeatCycles,
          null,
          state.family,
        ),
      };
      state.view = "recordDetails";
    }
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

function renderQuickSetup() {
 const p=profileDraft(),i=p.quickSetupIndex;
 const content=[
 `<div class="profile-options">${optionInput('servings',1,'1人分')}${optionInput('servings',2,'2人分')}</div>`,
 `<div class="profile-options">${[10,20,30,60].map(n=>optionInput('weekdayMinutes',n,`${n}分以内`)).join('')}${optionInput('weekdayMinutes','null','未指定')}</div><p class="muted small">休日の時間はあとで設定できます。炊飯時間は別です。</p>`,
 `<p>食べられない食材を選んでください。未選択は制限未指定として提案します。</p><div class="profile-options">${Lifestyle.restrictionOptions.map(n=>optionInput('restrictions',n,n,true)).join('')}</div>${textInput('restrictions','一覧にない食材','例：卵、乳')}<p class="muted small">市販品の原材料と、調理器具を確認してから作ってください。</p>`
 ][i];
 document.body.classList.toggle('is-onboarding',!state.onboarded);
 document.querySelector('#app').innerHTML=`<section class="hero-card profile-wizard"><div class="wizard-progress"><span>まずは3問</span><span>${i+1} / 3</span></div><h2>${['🍽️ 何人分つくる？','⏱️ 平日は何分くらい？','🔎 食べられないものは？'][i]}</h2>${content}<div class="wizard-footer"><button class="text-button" data-action="life-quick-back" ${i===0?'disabled':''}>戻る</button><button class="primary-button" data-action="${i===2?'life-finish':'life-quick-next'}">${i===2?'3日分の提案を見る':'次へ'}</button></div><p class="muted small">好み・器具・常備品はあとで調整できます。</p></section>`;
 document.querySelectorAll('[data-profile]').forEach(el=>el.addEventListener('input',()=>captureProfile(el)));
 bindAutoAdvance();
 document.querySelectorAll('[data-action]').forEach(el=>el.addEventListener('click',handleAction));
}

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
