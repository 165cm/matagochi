/* Daily experience. Existing recipe importing/editing remains in app.js. */
let profileEditing = false;
let swapDate = "";
let cookingDate = "";
let editingEvaluationId = "";
let shoppingNotice = "";
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
  "何人分の夜ごはんを作りますか？",
  "自炊する日を教えてください",
  "食べられない食材はありますか？",
  "苦手な食材も避けましょう",
  "好きな味は、どれですか？",
  "料理に使える時間は？",
  "無理なくできる作り方で",
  "キッチンの持ちもの",
  ...Object.keys(Lifestyle.pantry),
  "買い物のスタイルは？",
  "先に使いたい食材はありますか？",
  "あなたの夜ごはん設定",
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
function optionInput(field, value, label, multiple = false) {
  const p = profileDraft();
  const selected = multiple
    ? (p[field] || []).includes(value)
    : String(p[field]) === String(value);
  return `<label class="profile-choice"><input type="${multiple ? "checkbox" : "radio"}" name="${field}" data-profile="${field}" ${multiple ? 'data-multiple="true"' : ""} value="${escapeAttr(value)}" ${selected ? "checked" : ""}><span>${escapeHtml(label)}</span></label>`;
}
function textInput(field, label, placeholder) {
  return `<label class="field">${label}<input class="input" data-profile="${field}" data-list="true" value="${escapeAttr(profileDraft()[field].join("、"))}" placeholder="${escapeAttr(placeholder)}"><small>複数ある場合は「、」で区切れます。</small></label>`;
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
  return `<p class="muted">基本は「ある」、ほかは「ない」からスタート。違うものだけタップしてください。</p>
    <div class="equipment-groups" role="group" aria-label="調理器具のグループ">${Lifestyle.equipmentGroups.map((g,index) => `<button type="button" class="equipment-group" data-action="life-equipment-group" data-group="${index}" aria-pressed="${index === equipmentGroupIndex}"><small>${index + 1}</small><span>${g.label}</span></button>`).join('')}</div>
    <p class="equipment-hint">${group.hint}</p>
    <div class="equipment-grid" role="group" aria-label="${group.label}">${names.map(name => {
      const value = p.equipment[name] || 'unknown';
      return `<button type="button" class="equipment-choice" data-action="life-equipment-toggle" data-name="${escapeAttr(name)}" aria-pressed="${value === 'unknown' ? 'mixed' : value === 'have'}"><span>${escapeHtml(name)}</span><strong>${value === 'have' ? '✓ ある' : value === 'none' ? '− ない' : '未確認'}</strong></button>`;
    }).join('')}</div>
    ${equipmentGroupIndex < 2 ? `<button class="text-button full-button" type="button" data-action="life-equipment-group" data-group="${equipmentGroupIndex + 1}">次のグループを見る →</button>` : ''}
    <details class="equipment-custom"><summary>一覧にない道具を追加</summary><label class="field">道具の名前<input id="custom-owned" class="input" maxlength="99" placeholder="例：蒸し器"></label><button class="secondary-button" data-action="life-custom" data-field="equipment" type="button">持っているものとして追加</button></details>`;
}
function ownershipFields(field, names) {
  const p = profileDraft();
  return `<p class="muted">「ある・ない・未確認」を選べます。選んでいないものは未確認のまま残ります。</p><div class="ownership-list">${names
    .map(
      (name) =>
        `<label><span>${escapeHtml(name)}</span><select class="input" data-profile="${field}" data-owned="${escapeAttr(name)}">${[
          ["unknown", "未確認"],
          ["have", "ある"],
          ["none", "ない"],
        ]
          .map(
            ([v, l]) =>
              `<option value="${v}" ${(p[field][name] || "unknown") === v ? "selected" : ""}>${l}</option>`,
          )
          .join("")}</select></label>`,
    )
    .join("")}</div>
    <label class="field">一覧にないもの<input id="custom-owned" class="input" placeholder="名前を入力"></label><button class="secondary-button" data-action="life-custom" data-field="${field}" type="button">持っているものとして追加</button>`;
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
    ["好きな味", p.tastes.join("、") || "未指定"],
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
function renderProfileWizard() {
  const p = profileDraft(),
    step = p.step;
  let content = "";
  if (step === 0)
    content = `<p>最初に好みやキッチンのことを教えてください。回答は途中でも保存されます。</p><div class="profile-options">${optionInput("servings", 1, "1人分")}${optionInput("servings", 2, "2人分")}</div>`;
  if (step === 1)
    content = `<p>選んだ曜日に夜ごはんを提案します。未指定なら毎日が対象です。</p><div class="profile-options">${[1, 2, 3, 4, 5, 6, 0].map((d) => optionInput("days", String(d), "日月火水木金土"[d] + "曜日", true)).join("")}</div><h3>まず決めたい日数</h3><div class="profile-options">${optionInput("period", 3, "3日分")}${optionInput("period", 7, "7日分")}</div>`;
  if (step === 2)
    content = `<p>含まれる料理を提案から外します。市販品の原材料・注意表示も調理前に確認してください。</p><div class="profile-options">${Lifestyle.restrictionOptions.map((n) => optionInput("restrictions", n, n, true)).join("")}</div><p class="muted small">その他の制限は次の入力欄へ。自動照合できない制限がある場合は候補を確定せず、確認を案内します。</p>${textInput("restrictions", "食べられない食材の一覧", "例：卵、乳")}`;
  if (step === 3)
    content = `<p>嫌いなものを我慢せず、楽しめる料理を。</p>${textInput("dislikes", "苦手な食材", "例：なす、パクチー")}`;
  if (step === 4)
    content = `<p>複数選べます。料理の候補を並べる順番に使います。</p><div class="profile-options">${["和風", "洋風", "中華風"].map((n) => optionInput("tastes", n, n, true)).join("")}</div>`;
  if (step === 5)
    content =
      ["weekdayMinutes", "weekendMinutes"]
        .map(
          (f, i) =>
            `<fieldset><legend>${i ? "休日" : "平日"}</legend><div class="profile-options">${[10, 20, 30, 60].map((n) => optionInput(f, n, `${n}分以内`)).join("")}${optionInput(f, "null", "未指定")}</div></fieldset>`,
        )
        .join("") +
      '<p class="muted small">時間は調理の目安です。ごはんを炊く時間などは別途必要です。</p>';
  if (step === 6)
    content = `<div class="profile-options">${optionInput("skill", "easy", "かんたんな料理が安心")}${optionInput("skill", "any", "難易度は気にしない")}${optionInput("skill", "unknown", "まだ決めない")}</div><h3>避けたい作業</h3><div class="profile-options">${["肉を切る", "揚げる", "長く煮込む"].map((n) => optionInput("avoidTasks", n, n, true)).join("")}</div>`;
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
    content = `<div class="profile-options">${optionInput("shoppingFrequency", "daily", "その日ごとに買う")}${optionInput("shoppingFrequency", "3days", "数日分まとめたい")}${optionInput("shoppingFrequency", "weekly", "週に一度まとめたい")}${optionInput("shoppingFrequency", "unknown", "まだ決めない")}</div><label class="profile-choice"><input type="checkbox" data-profile="savings" ${p.savings ? "checked" : ""}><span>同じ食材を使い回して、買う種類を減らしたい</span></label><p class="muted small">価格の比較や節約額の計算は行いません。</p>`;
  if (step === 14)
    content = `<p>ここは任意です。今回の献立で優先し、7日後には優先設定が切れます。</p>${textInput("useUp", "冷蔵庫で使い切りたいもの", "例：キャベツ、豆腐")}`;
  if (step === 15)
    content = `<p>この条件で最初の献立を提案します。未確認のものは、わかったときに設定できます。</p>${profileSummary(p)}<p class="muted small">個人の好み・食材制限はこの端末に保存します。バックアップには含まれます。</p>`;
  document.body.classList.toggle("is-onboarding", !state.onboarded);
  document.querySelector("#app").innerHTML =
    `<section class="hero-card profile-wizard"><p class="eyebrow">あなたの夜ごはんを、一緒に。</p><div class="wizard-progress"><span>${profileChapters[step]}</span><span>${step + 1} / 16</span></div><progress max="16" value="${step + 1}" aria-label="初回設定の進捗"></progress><h2 tabindex="-1">${profileTitles[step]}</h2>${content}<div class="wizard-footer"><button type="button" class="text-button" data-action="life-back" ${step === 0 ? "disabled" : ""}>戻る</button><button type="button" class="primary-button" data-action="${step === 15 ? "life-finish" : "life-next"}">${step === 15 ? "この条件で献立を見る" : "保存して次へ"}</button></div>${step < 15 && state.foodProfile?.completed ? '<button type="button" class="secondary-button full-button" data-action="life-review">設定一覧に戻る</button>' : ""}${step < 15 && step !== 7 ? '<button type="button" class="text-button full-button" data-action="life-next">今わからない項目は保留して進む</button>' : ""}${state.onboarded ? '<button type="button" class="text-button full-button" data-action="life-pause">保存して設定を閉じる</button>' : '<p class="muted small">ここで閉じても、次回は続きから再開できます。</p>'}</section>`;
  document
    .querySelectorAll("[data-profile]")
    .forEach((el) => el.addEventListener("input", () => captureProfile(el)));
  document
    .querySelectorAll("[data-action]")
    .forEach((el) => el.addEventListener("click", handleAction));
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
function renderDailyPlan() {
  const plan = dailyPlan();
  const cards = plan
    .map((day) => {
      const recipe = day.slot?.recipe || day.candidate?.recipe;
      if (day.slot?.status === "off" || day.off)
        return `<article class="daily-plan-row"><p>${formatDate(day.date)}（${weekdayLabel(day.date)}）</p><h3>自炊はお休み</h3>${dailyButton("life-reopen", "この日は料理する", `data-date="${day.date}"`)}</article>`;
      return `<article class="daily-plan-row"><p class="eyebrow">${formatDate(day.date)}（${weekdayLabel(day.date)}） · ${day.slot?.status === "cooked" ? "作った" : day.slot ? "確定済み" : "提案"}</p>${recipe ? `<h3>${escapeHtml(recipe.title)}</h3>${day.slot ? conditionWarning(recipe, day.date) : ""}<p class="muted small">${day.slot ? `${day.slot.servings}人分・確定時の内容を保存しています` : escapeHtml(day.candidate.reasons.join(" · "))}</p><div class="actions">${dailyButton("life-cook", "作り方", `data-date="${day.date}"`)}${day.slot?.status === "confirmed" && slotHasUpdates(day.slot) ? dailyButton("life-refresh", "今のレシピ・人数を反映", `data-date="${day.date}"`) : ""}${day.slot?.status === "cooked" ? "" : dailyButton("life-swap", "入れ替える", `data-date="${day.date}"`)}</div>` : `<h3>条件に合う候補がありません</h3><p>調理時間・食材・器具の設定を確認するか、レシピを追加してください。</p>${dailyButton("life-profile", "条件を確認")}`}${day.slot?.status === "cooked" ? "" : `<button class="text-button" data-action="life-off" data-date="${day.date}">この日は自炊お休み</button>`}</article>`;
    })
    .join("");
  const ready = plan.filter((d) => d.candidate).length;
  return `<section class="hero-card"><p class="eyebrow">LESS THINKING, MORE TASTING</p><h2>数日先まで、ほっとする。</h2><p>${dailyProfile().servings}人分の夜ごはん。気に入ったら確定しましょう。</p><div class="actions">${[3, 7].map((n) => `<button class="choice-button" aria-pressed="${(state.planLength || 3) === n}" data-action="life-length" data-length="${n}">${n}日分</button>`).join("")}${dailyButton("life-profile", "条件を調整")}</div></section><section class="panel">${cards}${ready ? dailyButton("life-confirm", `提案${ready}日分をまとめて確定`, "", true) : ""}<p class="muted small">食材制限・未確認の器具は、作り方と市販品の表示も確認してください。</p></section>${swapDate ? renderSwapChoices() : ""}`;
}
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
    .filter(
      (r) =>
        r.id !== id &&
        !used.has(r.id) &&
        Lifestyle.fit(r, p, swapDate).ok &&
        !getRecipeRepeatSummary(r.id).excluded,
    )
    .slice(0, 3);
  return `<section class="panel swap-panel" tabindex="-1"><h3>${formatDate(swapDate)}の別の一品</h3>${options.map((r) => `<div class="daily-plan-row"><h4>${escapeHtml(r.title)}</h4>${dailyButton("life-choose", "この料理にする", `data-recipe="${escapeAttr(r.id)}" data-date="${swapDate}"`)}</div>`).join("") || "<p>別の候補がありません。条件を調整するかレシピを追加してください。</p>"}<div class="actions">${dailyButton("go-view", "レシピを見る", 'data-view="collection"')}${dailyButton("life-close-swap", "閉じる")}</div></section>`;
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
  return `<section class="today-heading"><p class="eyebrow">${formatDate(today())}（${weekdayLabel(today())}） · ${slot?.servings || dailyProfile().servings}人分</p><h2>${off ? "今日は、ひと休み。" : slot?.status === "cooked" ? "今日も、ごちそうさま。" : "今夜も、おいしく。"}</h2></section>
  ${!state.foodProfile?.completed ? `<section class="setup-invitation"><p>好みとキッチンを教えると、提案があなた向けに。</p>${dailyButton("life-profile", state.onboardingDraft ? "初回設定の続きをする" : "食生活を設定する")}</section>` : ""}
  <section class="hero-card today-dish">${off ? "" : dishVisual(recipe, true)}<div class="today-dish-body"><p class="eyebrow">${off ? "自炊お休み" : slot?.status === "cooked" ? "作った一品" : slot ? "今夜の一品" : "今夜の候補"}</p><h3>${off ? "また次の夜ごはんで。" : recipe ? escapeHtml(recipe.title) : "あなたに合う一品を探しましょう"}</h3>${!off && day?.candidate ? `<p class="muted">${escapeHtml(day.candidate.reasons.join(" · "))}</p>` : ""}${slot?.status === "confirmed" ? conditionWarning(recipe, today()) : ""}${cta}${slot?.status === "confirmed" ? dailyButton("life-cook", "すぐ作り方を見る", `data-date="${today()}"`) : ""}${slot?.status === "cooked" ? dailyButton("life-again", "また食べたい", `data-date="${today()}"`) : ""}${!off && slot?.status !== "cooked" ? `<button class="text-button" data-action="life-off" data-date="${today()}">今日は自炊お休み</button>` : ""}</div></section>
  <section class="panel"><div class="section-head"><h3>買うもの</h3><span class="badge">残り${remaining}品</span></div>${dailyButton("go-view", "買い物リストを開く", 'data-view="shopping"')}</section>
  <section class="panel"><h3>この先の夜ごはん</h3>${dailyPlan()
    .slice(1, 3)
    .map(
      (d) =>
        `<p>${formatDate(d.date)} · ${escapeHtml(d.slot?.recipe?.title || d.candidate?.recipe.title || (d.off || d.slot?.status === "off" ? "お休み" : "未定"))}</p>`,
    )
    .join(
      "",
    )}${dailyButton("go-view", "献立を見る", 'data-view="plan"')}</section>
  <section class="panel"><h3>今週のごちそう</h3><p>${recent.length}回の「作った」を記録しました。</p>${dailyButton("go-view", "ふりかえる", 'data-view="repeat"')}${!state.recipes.length ? dailyButton("go-view", "お気に入りのレシピを追加", 'data-view="register"') : ""}</section>`;
}
function renderDailyShopping() {
  const items = dailyShopping();
  const group = (status, title) =>
    `<section class="panel"><h3>${title} <span class="badge">${items.filter((i) => i.status === status).length}</span></h3>${
      items
        .filter((i) => i.status === status)
        .map(
          (i) =>
            `<div class="daily-shopping-row"><div><strong>${escapeHtml(i.name)}</strong><p>${escapeHtml(i.amount)}</p>${i.recheck ? '<small class="notice">献立の変更で必要量を再確認してください</small>' : ""}</div><select class="input" data-shopping-id="${escapeAttr(i.id)}" aria-label="${escapeAttr(i.name)}の買い物状態">${[
              ["buy", "買う"],
              ["have", "家にある"],
              ["purchased", "購入済み"],
            ]
              .map(
                ([v, l]) =>
                  `<option value="${v}" ${v === status ? "selected" : ""}>${l}</option>`,
              )
              .join(
                "",
              )}</select>${i.id.startsWith("manual-") ? dailyButton("life-remove-item", "削除", `data-id="${escapeAttr(i.id)}"`) : ""}</div>`,
        )
        .join("") || '<p class="muted">ありません</p>'
    }</section>`;
  return `<section class="hero-card"><p class="eyebrow">SHOP JUST ENOUGH</p><h2>必要なものだけ、さっと。</h2><p>確定した献立の材料です。買い物頻度の設定に合わせた期間でまとめます。</p>${shoppingNotice ? `<p role="status" class="notice">${escapeHtml(shoppingNotice)}</p>` : ""}<p class="muted small">調味料の「家にある」は数量を保証しません。残量も確認してください。</p>${dailyButton("life-profile", "常備品・買い物頻度を変更")}</section>${!items.length ? `<section class="panel"><p>献立を確定すると買い物リストができます。</p>${dailyButton("go-view", "献立を決める", 'data-view="plan"', true)}</section>` : ""}${group("buy", "買うもの")}${group("have", "家にある")}${group("purchased", "購入済み")}<section class="panel"><h3>買い足すもの</h3><label class="field">品名<input id="manual-name" class="input" maxlength="100"></label><label class="field">数量<input id="manual-amount" class="input" maxlength="80" placeholder="例：1袋"></label>${dailyButton("life-add-item", "追加する")}<div class="actions">${dailyButton("copy-shopping", "リストをコピー")}${dailyButton("share-shopping", "共有する")}</div></section>`;
}
function renderCooking() {
  const day = dailyPlan().find((d) => d.date === cookingDate);
  const slot = state.mealSlots?.[cookingDate];
  const recipe = slot?.recipe || day?.candidate?.recipe;
  if (!recipe)
    return `<section class="panel"><h2>料理を選び直してください</h2>${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</section>`;
  const servings = slot?.servings || dailyProfile().servings;
  return `<section class="hero-card">${dishVisual(recipe)}<h2>${escapeHtml(recipe.title)}</h2><p>${servings}人分 · ${slot?.recipe ? "確定時の内容" : "提案中"}</p>${recipe.planning ? `<p class="muted small">${recipe.planning.minutes}分目安（炊飯は別途） / 器具：${escapeHtml(recipe.planning.equipment.join("、"))}</p>` : "<p>調理時間・必要な器具は未確認です。</p>"}<p class="notice small">食材制限がある場合は市販品の原材料表示も確認してください。ごはんは炊いたものを用意し、加熱時間は様子を見て調整してください。</p><h3>材料</h3><ul class="cooking-ingredients">${recipe.ingredients.map((i) => `<li><span>${escapeHtml(i.name)}</span><span>${escapeHtml(scaleAmountForServings(i.amount, servings, recipe.sourceServings))}</span></li>`).join("")}</ul><h3>作り方</h3><ol class="cooking-steps">${recipe.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol><div class="actions">${slot?.status === "confirmed" && cookingDate === today() ? dailyButton("life-cooked", "作った", "", true) : !slot || slot.status === "removed" ? dailyButton("life-confirm-one", "この日の献立に確定", `data-date="${cookingDate}"`, true) : ""}${dailyButton("life-save-copy", "自分のレシピに保存", `data-recipe="${escapeAttr(recipe.id)}"`)}${dailyButton("go-view", "献立へ戻る", 'data-view="plan"')}</div></section>`;
}
function renderReflection() {
  return `<section class="hero-card"><p class="eyebrow">YOUR DELICIOUS DAYS</p><h2>また食べたい、を育てよう。</h2><p>食べた記録は${state.evaluations.length}回。好きな一品が、次の献立につながります。</p>${dailyButton("life-record-details", "記録・写真・好みを編集")}</section><section class="panel">${
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
  const own = saveOwnRecipe(slot.recipe);
  const id = `meal-${slot.date}`;
  if (!state.evaluations.some((e) => e.id === id))
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
  state.mealSlots[slot.date] = {
    ...slot,
    status: "cooked",
    updatedAt: nowIso(),
  };
}
function bindDailyEvents() {
  document.querySelectorAll("[data-shopping-id]").forEach((el) =>
    el.addEventListener("change", () => {
      const item = dailyShopping().find((i) => i.id === el.dataset.shoppingId);
      if (!item) return;
      state.shoppingMarks[item.id] = {
        status: el.value,
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
  if (action === "life-profile") {
    profileEditing = true;
    profileDraft();
    state.view = "today";
  }
  if (action === "life-equipment-group") equipmentGroupIndex = Math.max(0, Math.min(2, Number(data.group) || 0));
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
    p.step = Math.max(
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
    p.completed = true;
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
    swapDate = data.date;
    state.view = "plan";
  }
  if (action === "life-close-swap") swapDate = "";
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
  if (action === "life-cooked") {
    trackDaily("meal_cooked");
    const slot = state.mealSlots[cookingDate];
    if (slot?.status === "confirmed" && cookingDate === today())
      dailyRecord(slot);
    state.view = "today";
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
      "life-back",
      "life-custom",
      "life-equipment-group",
      "life-equipment-toggle",
      "life-profile",
      "life-pause",
      "life-section",
      "life-review",
    ].includes(action),
  });
  render();
  if (action === "life-equipment-toggle") [...document.querySelectorAll('[data-action="life-equipment-toggle"]')].find(el => el.dataset.name === data.name)?.focus({preventScroll:true});
  if (action === "life-equipment-group") document.querySelector(`[data-action="life-equipment-group"][data-group="${equipmentGroupIndex}"]`)?.focus({preventScroll:true});
  if (oldView !== state.view)
    globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  if (action === "life-swap")
    document.querySelector(".swap-panel")?.scrollIntoView({ block: "start" });
  else if (
    [
      "life-next",
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

function renderPlanningFields() {
  const p = state.draft.planning || {};
  const value = (key) =>
    escapeAttr(Array.isArray(p[key]) ? p[key].join("、") : p[key] || "");
  return `<details class="entry-extra"><summary>献立に使う調理条件（任意）</summary><p class="muted small">ここで確認した情報を、時間・器具・食材制限の絞り込みに使います。未入力の情報は推測しません。</p><label class="field">調理時間の目安（分）<input id="planning-minutes" class="input" type="number" min="1" max="300" value="${value("minutes")}"></label><label class="field">必要な器具（「、」区切り）<input id="planning-equipment" class="input" value="${value("equipment")}" placeholder="例：コンロ、フライパン、計量スプーン"></label><label class="field">作業（「、」区切り）<input id="planning-tasks" class="input" value="${value("tasks")}" placeholder="例：肉を切る、揚げる"></label><label class="field">味（和風・洋風・中華風）<input id="planning-tastes" class="input" value="${value("tastes")}"></label><label class="profile-choice"><input id="planning-easy" type="checkbox" ${p.easy ? "checked" : ""}><span>かんたんな料理</span></label><label class="field">含まれる食材区分（「、」区切り）<input id="planning-contains" class="input" value="${value("contains")}" placeholder="例：卵、小麦、大豆"></label><p class="muted small">対象：${Lifestyle.restrictionOptions.join("・")}。調味料の原材料も確認してください。</p><label class="profile-choice"><input id="planning-verified" type="checkbox" ${p.ingredientsVerified ? "checked" : ""}><span>材料一覧と、含まれる食材区分を確認した</span></label></details>`;
}
function capturePlanningFields() {
  const minutes = document.querySelector("#planning-minutes");
  if (!minutes) return;
  const list = (id) =>
    (document.querySelector(id)?.value || "")
      .split(/[、,，\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  state.draft.planning = {
    minutes:
      Number(minutes.value) > 0 && Number(minutes.value) <= 300
        ? Number(minutes.value)
        : null,
    equipment: list("#planning-equipment"),
    tasks: list("#planning-tasks"),
    tastes: list("#planning-tastes"),
    contains: list("#planning-contains"),
    easy: !!document.querySelector("#planning-easy")?.checked,
    ingredientsVerified:
      !!document.querySelector("#planning-verified")?.checked,
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
