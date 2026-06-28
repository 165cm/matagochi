const STORAGE_KEY = "matagochi-mvp-v1";
const API_BASE_URL = (globalThis.MATAGOCHI_API_BASE_URL || "").replace(/\/$/, "");

const defaultFamily = ["ママ", "パパ", "子ども1", "子ども2"];
const emptyDraft = { title: "", videoUrl: "", source: "", mealType: "dinner", caption: "", note: "" };
const defaultRepeatCycle = "weekly";
const repeatOptions = [
  { id: "tomorrow", label: "明日でも", days: 1, tone: "hot" },
  { id: "weekly", label: "毎週", days: 7, tone: "good" },
  { id: "twice_month", label: "月２回", days: 14, tone: "good" },
  { id: "monthly", label: "月１回", days: 30, tone: "calm" },
  { id: "pause", label: "しばらくいい", days: 90, tone: "calm" },
  { id: "never", label: "リピなし", days: null, tone: "stop" }
];
const mealTypes = [
  { id: "breakfast", label: "朝ごはん", featured: true },
  { id: "lunch", label: "昼ごはん", featured: true },
  { id: "dinner", label: "夜ごはん", featured: true },
  { id: "bento", label: "お弁当", featured: true },
  { id: "side", label: "副菜", featured: false },
  { id: "prep", label: "作り置き", featured: false },
  { id: "snack", label: "おやつ", featured: false },
  { id: "soup", label: "汁物", featured: false }
];

const demoState = {
  view: "collection",
  onboarded: false,
  selectedRecipeId: "r2",
  editingRecipeId: null,
  searchText: "",
  mealFilter: "all",
  showAllMealTypes: false,
  servingCount: 1,
  family: [...defaultFamily],
  extractedIngredients: [],
  extractedSteps: [],
  fetchStatus: "",
  draft: {
    title: "鮭ときのこの包み焼き",
    videoUrl: "https://www.instagram.com/reel/example-salmon/",
    source: "Instagram",
    mealType: "dinner",
    caption: "鮭 3切れ、しめじ 1袋、玉ねぎ 1個、バター 20g、しょうゆ 大さじ1。1. 玉ねぎを薄切り。2. 鮭としめじをホイルにのせる。3. バターとしょうゆを入れて包む。4. フライパンで12分蒸し焼き。",
    note: "平日夜に良さそう。ホイルなら洗い物が少ない。"
  },
  repeatDraft: {
    familyRepeatCycles: { "ママ": "weekly", "パパ": "weekly", "子ども1": "twice_month", "子ども2": "twice_month" },
    memo: "",
    photo: ""
  },
  recipes: [
    {
      id: "r1",
      title: "小松菜と卵の朝スープ",
      videoUrl: "https://short.example/komatsuna-egg",
      source: "TikTok",
      mealType: "breakfast",
      caption: "小松菜 1束、卵 2個、豆腐 1丁、だし 600ml。朝に温まるスープ。",
      ingredients: [
        ingredient("小松菜", "1束", "野菜"),
        ingredient("卵", "2個", "卵・乳製品"),
        ingredient("豆腐", "1丁", "大豆・加工品"),
        ingredient("だし", "600ml", "調味料")
      ],
      steps: ["小松菜と豆腐を食べやすく切る", "だしで煮る", "卵を回し入れて火を止める"],
      tags: ["朝", "野菜", "10分"],
      savedAt: "2026-06-16",
      note: "朝ごはんの固定枠にできそう。"
    },
    {
      id: "r2",
      title: "豚こまとキャベツの塩だれ炒め",
      videoUrl: "https://short.example/pork-cabbage",
      source: "Instagram",
      mealType: "dinner",
      caption: "豚こま 350g、キャベツ 半玉、にんじん 1本、塩だれ 大さじ3。夜の主菜。",
      ingredients: [
        ingredient("豚こま", "350g", "肉"),
        ingredient("キャベツ", "半玉", "野菜"),
        ingredient("にんじん", "1本", "野菜"),
        ingredient("塩だれ", "大さじ3", "調味料")
      ],
      steps: ["豚こまを炒める", "キャベツとにんじんを加える", "塩だれで味を整える"],
      tags: ["夜", "フライパン", "満足"],
      savedAt: "2026-06-15",
      note: "疲れた日の主菜。ごはんが進む。"
    },
    {
      id: "r3",
      title: "ツナときゅうりの冷やしうどん",
      videoUrl: "https://short.example/tuna-udon",
      source: "YouTube Shorts",
      mealType: "lunch",
      caption: "うどん 3玉、ツナ缶 2缶、きゅうり 2本、めんつゆ 適量。暑い日の昼。",
      ingredients: [
        ingredient("うどん", "3玉", "主食"),
        ingredient("ツナ缶", "2缶", "缶詰"),
        ingredient("きゅうり", "2本", "野菜"),
        ingredient("めんつゆ", "適量", "調味料")
      ],
      steps: ["うどんをゆでて冷やす", "きゅうりを切る", "ツナときゅうりをのせてめんつゆをかける"],
      tags: ["昼", "冷たい", "15分"],
      savedAt: "2026-06-14",
      note: "休日昼にも使える。"
    }
  ],
  evaluations: [
    {
      id: "e1",
      recipeId: "r2",
      cookedAt: "2026-06-17",
      familyRepeatCycles: { "ママ": "weekly", "パパ": "tomorrow", "子ども1": "weekly", "子ども2": "weekly" },
      memo: "キャベツ多めでもよく食べた。次はにんじん細め。",
      photoLabel: "夕食写真"
    },
    {
      id: "e2",
      recipeId: "r1",
      cookedAt: "2026-06-18",
      familyRepeatCycles: { "ママ": "twice_month", "パパ": "twice_month", "子ども1": "monthly", "子ども2": "monthly" },
      memo: "大人は好き。子どもには卵を多めに。",
      photoLabel: "朝スープ"
    }
  ]
};

let state = loadState();
let toastTimer = null;
let isCaptionImporting = false;

function ingredient(name, amount, category) {
  return { name, amount, category };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return clone(demoState);
  try {
    return normalizeState(JSON.parse(saved));
  } catch {
    return clone(demoState);
  }
}

function normalizeState(saved) {
  const base = clone(demoState);
  const family = Array.isArray(saved.family) && saved.family.length ? saved.family : base.family;
  const savedView = saved.view === "ratings" ? "repeat" : saved.view;
  const view = ["collection", "plan", "repeat", "settings"].includes(savedView) ? savedView : base.view;
  return {
    ...base,
    ...saved,
    family,
    view,
    onboarded: saved.onboarded ?? true,
    editingRecipeId: null,
    servingCount: normalizeServingCount(saved.servingCount),
    draft: { ...base.draft, ...(saved.draft || {}) },
    repeatDraft: normalizeRepeatDraft(saved.repeatDraft || saved.ratingDraft || base.repeatDraft, family),
    evaluations: normalizeEvaluations(Array.isArray(saved.evaluations) ? saved.evaluations : base.evaluations, family)
  };
}

function normalizeServingCount(value) {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(count, 1), 12);
}

function getServingCount() {
  return normalizeServingCount(state.servingCount);
}

function normalizeRepeatDraft(draft, family) {
  return {
    familyRepeatCycles: normalizeFamilyRepeatCycles(draft?.familyRepeatCycles, draft?.familyRatings, family, draft?.nextTiming),
    memo: draft?.memo || "",
    photo: draft?.photo || "",
    cookedAt: normalizeDateInput(draft?.cookedAt) || today(),
    mealType: normalizeRepeatMealType(draft?.mealType) || "dinner"
  };
}

function normalizeEvaluations(evaluations, family) {
  return evaluations.map((evaluation) => ({
    ...evaluation,
    mealType: normalizeRepeatMealType(evaluation.mealType) || "",
    familyRepeatCycles: normalizeFamilyRepeatCycles(
      evaluation.familyRepeatCycles,
      evaluation.familyRatings,
      family,
      evaluation.nextTiming
    ),
    memo: evaluation.memo || "",
    photo: evaluation.photo || ""
  }));
}

function normalizeDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? value : "";
}

function normalizeRepeatMealType(value) {
  return mealSlots().some((meal) => meal.id === value) ? value : "";
}

function normalizeFamilyRepeatCycles(cycles, ratings, family, nextTiming = "") {
  const fallbackCycle = repeatCycleFromTiming(nextTiming);
  return family.reduce((result, name) => {
    const cycle = cycles?.[name];
    const rating = ratings?.[name];
    result[name] = normalizeRepeatCycle(cycle) || repeatCycleFromRating(rating) || fallbackCycle || defaultRepeatCycle;
    return result;
  }, {});
}

function normalizeRepeatCycle(value) {
  if (!value) return "";
  if (repeatOptions.some((option) => option.id === value)) return value;
  const option = repeatOptions.find((item) => item.label === value);
  return option?.id || "";
}

function repeatCycleFromRating(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return "";
  if (rating <= 1) return "never";
  if (rating === 2) return "pause";
  if (rating === 3) return "monthly";
  if (rating === 4) return "twice_month";
  return "weekly";
}

function repeatCycleFromTiming(value) {
  if (/リピなし|なし|もういい/.test(value)) return "never";
  if (/しばらく|当分/.test(value)) return "pause";
  if (/明日|すぐ/.test(value)) return "tomorrow";
  if (/毎週|来週|1週間|１週間/.test(value)) return "weekly";
  if (/月2|月２|2週間|２週間/.test(value)) return "twice_month";
  if (/月1|月１|1か月|１か月|1ヶ月|１ヶ月/.test(value)) return "monthly";
  return "";
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    showToast("保存容量が上限に達しました。写真を減らすか、書き出して整理してください。");
  }
}

function setView(view) {
  state.view = view;
  saveState();
  render();
}

function render() {
  if (!state.onboarded) {
    renderOnboarding();
    return;
  }
  document.body.classList.remove("is-onboarding");

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.view);
  });

  const views = {
    collection: renderCollection,
    plan: renderMealPlan,
    repeat: renderRepeatCycles,
    settings: renderSettings
  };
  document.querySelector("#app").innerHTML = views[state.view]();
  bindEvents();
}

function renderOnboarding() {
  document.body.classList.add("is-onboarding");
  document.querySelector("#app").innerHTML = `
    <section class="hero-card onboarding">
      <p class="eyebrow">ようこそ</p>
      <h2>リピごちをはじめましょう</h2>
      <p class="muted">家族の「また食べたい周期」を残して、献立候補を整えるごはんメモです。<br>まずは始め方を選んでください。あとからいつでも切り替えられます。</p>
      <div class="onboarding-actions">
        <button class="primary-button full-button" type="button" data-action="start-empty">空ではじめる</button>
        <button class="secondary-button full-button" type="button" data-action="start-demo">サンプルを見てみる</button>
      </div>
      <p class="muted small">サンプルには操作を試すためのレシピとリピ記録が入っています。「設定」からいつでもリセットできます。</p>
    </section>
  `;
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", handleAction);
  });
}

function renderCollection() {
  const filteredRecipes = getFilteredRecipes();
  const extracted = state.extractedIngredients.length ? state.extractedIngredients : parseIngredients(state.draft.caption);
  const steps = state.extractedSteps.length ? state.extractedSteps : parseCookingSteps(state.draft.caption);
  const platform = detectPlatform(state.draft.videoUrl);
  const servingCount = getServingCount();

  return `
    <section class="hero-card">
      <div class="section-head">
        <div>
          <h2>動画レシピコレクション</h2>
          <p>SNSで見つけたレシピ動画を保存して、家族のリピ周期につなげます。</p>
        </div>
        <span class="badge">${state.recipes.length}件</span>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${repeatReadyCount()}</strong><span>今週候補</span></div>
        <div class="hero-stat"><strong>${unrecordedCount()}</strong><span>未リピ記録</span></div>
        <div class="hero-stat"><strong>${countIngredientNames()}</strong><span>材料メモ</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>${state.editingRecipeId ? "レシピを編集" : "リンクを保存"}</h3>
          <p>${state.editingRecipeId ? "内容を直して更新できます。" : "URLとキャプションだけで、後から探せる形に。"}</p>
        </div>
      </div>
      <div class="form-grid">
        <div class="field">
          <label for="recipe-title">レシピ名</label>
          <input id="recipe-title" class="input" value="${escapeAttr(state.draft.title)}">
        </div>
        <div class="field">
          <label for="recipe-url">ショート動画リンク</label>
          <input id="recipe-url" class="input" value="${escapeAttr(state.draft.videoUrl)}">
        </div>
        <div class="source-card">
          <div>
            <strong>${platform.label}</strong>
            <p class="muted small">${platform.help}</p>
          </div>
          <span class="badge ${platform.supported ? "" : "warn"}">${platform.supported ? "対応URL" : "未判定"}</span>
        </div>
        <div class="two-col">
          <div class="field">
            <label for="recipe-source">動画元</label>
            <input id="recipe-source" class="input" value="${escapeAttr(state.draft.source)}">
          </div>
          <div class="field">
            <label>タグ</label>
            ${renderMealTypePicker(state.draft.mealType)}
          </div>
        </div>
        <div class="field">
          <label for="recipe-caption">キャプション</label>
          <textarea id="recipe-caption" class="textarea">${escapeHtml(state.draft.caption)}</textarea>
        </div>
        <div class="field">
          <label for="recipe-note">自分用メモ</label>
          <input id="recipe-note" class="input" value="${escapeAttr(state.draft.note)}">
        </div>
        <div class="actions">
          <button class="primary-button" type="button" data-action="save-recipe">${state.editingRecipeId ? "更新する" : "保存する"}</button>
          <button class="secondary-button" type="button" data-action="fetch-caption" ${isCaptionImporting ? "disabled" : ""}>${isCaptionImporting ? "取得中" : "URLから取得"}</button>
        </div>
        <button class="secondary-button full-button" type="button" data-action="extract-caption">キャプションから材料・作り方を抽出</button>
        ${state.editingRecipeId ? `<button class="text-button full-button" type="button" data-action="cancel-edit">編集をやめる</button>` : ""}
        ${state.fetchStatus ? `<p class="notice">${escapeHtml(state.fetchStatus)}</p>` : ""}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>抽出プレビュー</h3>
          <p>材料は1人前で保存し、表示人数に合わせて換算します。</p>
        </div>
        <span class="badge">${servingCount}人分</span>
      </div>
      <h3 class="subhead">材料</h3>
      <div class="ingredient-list">
        ${extracted.map((item) => `
          <div class="ingredient-row">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="muted small">${escapeHtml(displayIngredientAmount(item))}・${escapeHtml(item.category)}</span>
          </div>
        `).join("")}
      </div>
      <h3 class="subhead">調理方法</h3>
      <ol class="step-list">
        ${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("") || "<li>キャプション内の作り方を確認してください。</li>"}
      </ol>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>保存済み</h3>
          <p>リピ周期が増えるほど、献立候補が選びやすくなります。</p>
        </div>
      </div>
      <input id="recipe-search" class="input" placeholder="レシピ名・材料・メモで検索" value="${escapeAttr(state.searchText)}">
      ${renderMealFilter()}
      <div class="recipe-list mvp-list">
        ${filteredRecipes.map(renderRecipeCard).join("") || renderEmpty("保存済みレシピがありません。")}
      </div>
    </section>
  `;
}

function renderMealTypePicker(selectedId) {
  const featured = mealTypes.filter((type) => type.featured);
  const hidden = mealTypes.filter((type) => !type.featured);
  return `
    <div class="meal-picker" role="group" aria-label="レシピタグ">
      ${featured.map((type) => renderMealTypeButton(type, selectedId)).join("")}
      <button class="choice-button meal-more-button ${state.showAllMealTypes ? "is-expanded" : ""}" type="button" data-action="toggle-meal-types">
        その他
      </button>
    </div>
    ${state.showAllMealTypes ? `
      <div class="meal-picker meal-picker-secondary" role="group" aria-label="その他のレシピタグ">
        ${hidden.map((type) => renderMealTypeButton(type, selectedId)).join("")}
      </div>
    ` : ""}
  `;
}

function renderMealTypeButton(type, selectedId) {
  return `
    <button class="choice-button ${type.id === selectedId ? "is-active" : ""}" type="button" data-action="set-meal-type" data-meal="${type.id}">
      ${escapeHtml(type.label)}
    </button>
  `;
}

function renderMealFilter() {
  const featured = mealTypes.filter((type) => type.featured);
  return `
    <div class="meal-filter" role="group" aria-label="保存済みレシピの絞り込み">
      <button class="choice-button ${state.mealFilter === "all" ? "is-active" : ""}" type="button" data-action="filter-meal" data-meal="all">すべて</button>
      ${featured.map((type) => `
        <button class="choice-button ${state.mealFilter === type.id ? "is-active" : ""}" type="button" data-action="filter-meal" data-meal="${type.id}">
          ${escapeHtml(type.label)}
        </button>
      `).join("")}
      <button class="choice-button ${state.mealFilter === "other" ? "is-active" : ""}" type="button" data-action="filter-meal" data-meal="other">その他</button>
    </div>
  `;
}

function renderRecipeCard(recipe) {
  const summary = getRecipeRepeatSummary(recipe.id);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${escapeHtml(recipe.title)}</strong>
          <p class="muted small">${mealLabel(recipe.mealType)} / ${escapeHtml(recipe.source)} / 保存 ${escapeHtml(recipe.savedAt)}</p>
        </div>
        <span class="badge ${summary.badgeClass}">${escapeHtml(summary.badgeLabel)}</span>
      </div>
      <p class="muted small">${escapeHtml(recipe.note)}</p>
      <div class="chip-row">
        ${recipe.ingredients.slice(0, 5).map(renderIngredientChip).join("")}
      </div>
      <div class="actions">
        <a class="primary-button link-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>
        <button class="secondary-button" type="button" data-action="record-repeat" data-recipe="${escapeAttr(recipe.id)}">リピ記録</button>
      </div>
      <div class="actions">
        <button class="secondary-button" type="button" data-action="edit-recipe" data-recipe="${escapeAttr(recipe.id)}">編集</button>
        <button class="secondary-button danger" type="button" data-action="delete-recipe" data-recipe="${escapeAttr(recipe.id)}">削除</button>
      </div>
    </article>
  `;
}

function renderIngredientChip(item) {
  return `<span class="chip">${escapeHtml(item.name)} ${escapeHtml(displayIngredientAmount(item))}</span>`;
}

function renderMealPlan() {
  const plan = buildWeeklyPlan();
  const dueCount = getMealCandidates().filter((candidate) => !candidate.summary.unrecorded && candidate.daysUntil <= 7).length;
  const excludedCount = excludedRepeatCount();

  return `
    <section class="hero-card">
      <div class="section-head">
        <div>
          <h2>今週の献立</h2>
          <p>家族のリピ周期から、食べ頃のレシピを並べます。</p>
        </div>
        <span class="badge">${plan.filter((day) => day.candidate).length}/7日</span>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${dueCount}</strong><span>今週食べ頃</span></div>
        <div class="hero-stat"><strong>${unrecordedCount()}</strong><span>周期未設定</span></div>
        <div class="hero-stat"><strong>${excludedCount}</strong><span>リピなし</span></div>
      </div>
    </section>

    <section class="panel meal-board">
      <div class="section-head">
        <div>
          <h3>7日分の提案</h3>
          <p>同じレシピが重ならないよう、食べ頃が近い順に入れます。</p>
        </div>
      </div>
      <div class="weekday-list">
        ${plan.map(renderPlanDay).join("")}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>食べ頃候補</h3>
          <p>リピなし以外のレシピを、優先度順に表示します。</p>
        </div>
      </div>
      <div class="recipe-list">
        ${getMealCandidates().slice(0, 8).map(renderCandidateCard).join("") || renderEmpty("リピ周期を記録すると候補が表示されます。")}
      </div>
    </section>
  `;
}

function renderPlanDay(day) {
  if (!day.candidate) {
    return `
      <div class="day-row">
        <div class="day-label">${escapeHtml(day.label)}</div>
        <div class="slot is-empty">
          <span class="slot-meal">${escapeHtml(day.dateLabel)}</span>
          <strong class="slot-title">候補なし</strong>
          <span class="slot-meta">レシピを追加するか、リピ周期を記録してください</span>
        </div>
      </div>
    `;
  }

  const { recipe, summary, reason } = day.candidate;
  return `
    <div class="day-row">
      <div class="day-label">${escapeHtml(day.label)}</div>
      <div class="slot">
        <span class="slot-meal">${escapeHtml(day.dateLabel)} / ${escapeHtml(mealLabel(recipe.mealType))}</span>
        <strong class="slot-title">${escapeHtml(recipe.title)}</strong>
        <span class="slot-meta">${escapeHtml(summary.badgeLabel)}・${escapeHtml(reason)}</span>
      </div>
    </div>
  `;
}

function renderCandidateCard(candidate) {
  const { recipe, summary, reason } = candidate;
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${escapeHtml(recipe.title)}</strong>
          <p class="muted small">${escapeHtml(reason)}</p>
        </div>
        <span class="badge ${summary.badgeClass}">${escapeHtml(summary.badgeLabel)}</span>
      </div>
      <p class="muted small">${escapeHtml(recipe.note)}</p>
      <div class="actions">
        <button class="secondary-button" type="button" data-action="record-repeat" data-recipe="${escapeAttr(recipe.id)}">リピ記録</button>
        <a class="primary-button link-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>
      </div>
    </article>
  `;
}

function renderRepeatCycles() {
  const repeatRecipes = getRepeatRecipes();
  const weekReview = buildRepeatWeekReview();
  const todayCandidate = weekReview.days.find((day) => day.date === today())?.slots.find((slot) => slot.candidate)?.candidate
    || buildWeeklyPlan()[0]?.candidate;
  const firstMissing = weekReview.missing[0]?.candidate;
  const focusCandidate = firstMissing || todayCandidate;
  const todayRecipe = focusCandidate?.recipe;
  const selected = repeatRecipes.find((recipe) => recipe.id === state.selectedRecipeId)
    || repeatRecipes.find((recipe) => recipe.id === todayRecipe?.id)
    || repeatRecipes[0]
    || state.recipes[0];
  if (selected && state.selectedRecipeId !== selected.id) state.selectedRecipeId = selected.id;
  const history = selected ? getRecipeEvaluationHistory(selected.id) : [];
  const summary = selected ? getRecipeRepeatSummary(selected.id) : null;

  return `
    <section class="hero-card repeat-week-card">
      <div class="section-head compact-head">
        <div>
          <h2>直近1週間の記録</h2>
          <p>献立候補の記入漏れを朝昼晩で確認します。</p>
        </div>
        <span class="badge ${weekReview.missing.length ? "warn" : ""}">未記入 ${weekReview.missing.length}件</span>
      </div>
      ${renderRepeatWeekGrid(weekReview.days)}
      <div class="missing-strip">
        <strong>評価未記入のごちそう</strong>
        <div class="missing-chip-row">
          ${weekReview.missing.slice(0, 3).map(renderMissingChip).join("") || `<span class="chip">記入漏れなし</span>`}
        </div>
      </div>
    </section>

    <section class="hero-card repeat-focus-card">
      <span class="badge">${firstMissing ? "次に評価" : "今日の候補"}</span>
      ${focusCandidate ? `
        <div class="repeat-focus-main">
          <div>
            <h2>${escapeHtml(focusCandidate.recipe.title)}</h2>
            <p>${escapeHtml(focusCandidate.reason)} / ${escapeHtml(repeatRecipeMeta(focusCandidate.recipe))}</p>
          </div>
          <button class="secondary-button" type="button" data-action="select-repeat-recipe" data-recipe="${escapeAttr(focusCandidate.recipe.id)}">評価する</button>
        </div>
      ` : `
        <div class="repeat-focus-main">
          <div>
            <h2>今日の候補なし</h2>
            <p>レシピを保存すると、ここからすぐ評価できます。</p>
          </div>
        </div>
      `}
    </section>

    ${selected ? `
      <section class="panel repeat-entry-panel">
        <div class="rating-target">
          <div>
            <span class="badge">${escapeHtml(summary?.badgeLabel || "未記録")}</span>
            <strong>${escapeHtml(selected.title)}</strong>
            <p class="muted small">${escapeHtml(repeatRecipeMeta(selected))}</p>
          </div>
          ${renderRepeatPhotoPicker(selected.id)}
        </div>
        <div class="repeat-date-row">
          <label for="repeat-cooked-at">食べた日</label>
          <input id="repeat-cooked-at" class="input" type="date" value="${escapeAttr(state.repeatDraft.cookedAt || today())}">
          <span class="muted small">${escapeHtml(firstDateText(history))}</span>
        </div>
        ${renderRepeatMealPicker(state.repeatDraft.mealType || selected.mealType)}
        <div class="feedback-list">
          ${state.family.map((name) => renderRepeatInput(name)).join("")}
        </div>
        <div class="repeat-compact-fields">
          <textarea id="repeat-memo" class="textarea compact-textarea" placeholder="メモ（例: 次は具を多めに）">${escapeHtml(state.repeatDraft.memo)}</textarea>
        </div>
        <input id="repeat-photo" type="file" accept="image/*" hidden>
        ${state.repeatDraft.photo ? `<button class="secondary-button danger full-button compact-remove" type="button" data-action="remove-photo">写真を外す</button>` : ""}
        <button class="primary-button full-button" type="button" data-action="save-repeat">リピ記録を保存</button>
      </section>

      <section class="panel">
        <details class="repeat-picker">
          <summary>ほかのレシピを選ぶ</summary>
          ${renderMealFilter()}
          <div class="repeat-recipe-list">
            ${repeatRecipes.map((recipe) => renderRepeatRecipeRow(recipe, selected?.id)).join("") || renderEmpty("表示できるレシピがありません。")}
          </div>
        </details>
        <details class="repeat-picker">
          <summary>直近5回の履歴</summary>
          <div class="recipe-list compact-history">
            ${history.slice(0, 5).map(renderEvaluationCard).join("") || renderEmpty("まだリピ記録がありません。")}
          </div>
        </details>
      </section>
    ` : ""}
  `;
}

function renderRepeatInput(name) {
  const cycle = normalizeRepeatCycle(state.repeatDraft.familyRepeatCycles[name]) || defaultRepeatCycle;
  const timeOptions = repeatOptions.filter((option) => option.id !== "never");
  const noRepeat = repeatOptions.find((option) => option.id === "never");
  return `
    <div class="rating-row repeat-meter-row">
      <div class="repeat-person">
        <span class="family-avatar" aria-hidden="true">${escapeHtml(familyInitial(name))}</span>
        <strong>${escapeHtml(name)}</strong>
        <span>${escapeHtml(repeatLabel(cycle))}</span>
      </div>
      <div class="repeat-choice-wrap" role="group" aria-label="${name}のリピ周期">
        <div class="mood-meter" aria-label="${name}の食べたい気持ちメーター">
          ${timeOptions.map((option, index) => `
            <button class="mood-button mood-${option.id} ${option.id === cycle ? "is-active" : ""}" type="button" data-action="set-cycle" data-person="${escapeAttr(name)}" data-cycle="${option.id}" aria-label="${name} ${option.label}">
              <span class="mood-dot" aria-hidden="true"></span>
              <span>${option.label}</span>
              <small>${repeatMoodHint(index)}</small>
            </button>
          `).join("")}
        </div>
        <button class="no-repeat-button ${noRepeat.id === cycle ? "is-active" : ""}" type="button" data-action="set-cycle" data-person="${escapeAttr(name)}" data-cycle="${noRepeat.id}" aria-label="${name} ${noRepeat.label}">
          ${noRepeat.label}
        </button>
      </div>
    </div>
  `;
}

function repeatMoodHint(index) {
  return ["すぐ", "好き", "ほどよく", "たまに", "お休み"][index] || "";
}

function renderRepeatMealPicker(selectedId) {
  return `
    <div class="repeat-meal-picker" role="group" aria-label="食べた時間帯">
      <span>時間帯</span>
      ${mealSlots().map((meal) => `
        <button class="choice-button ${meal.id === selectedId ? "is-active" : ""}" type="button" data-action="set-repeat-meal" data-meal="${meal.id}">
          ${meal.icon} ${escapeHtml(meal.shortLabel)}
        </button>
      `).join("")}
    </div>
  `;
}

function renderRepeatWeekGrid(days) {
  return `
    <div class="repeat-week-grid" aria-label="直近1週間の朝昼晩の記録">
      <div class="week-corner"></div>
      ${days.map((day) => `<div class="week-day ${day.date === today() ? "is-today" : ""}">${escapeHtml(shortDateLabel(day.date))}</div>`).join("")}
      ${mealSlots().map((meal) => `
        <div class="week-meal-label">${meal.icon}<span>${escapeHtml(meal.shortLabel)}</span></div>
        ${days.map((day) => renderWeekCell(day, meal.id)).join("")}
      `).join("")}
    </div>
  `;
}

function renderWeekCell(day, mealId) {
  const slot = day.slots.find((item) => item.mealId === mealId);
  if (!slot?.candidate) return `<div class="week-cell is-empty">-</div>`;
  const status = slot.completed ? "済" : "未";
  const className = slot.completed ? "is-done" : "is-missing";
  return `
    <button class="week-cell ${className}" type="button" data-action="select-repeat-recipe" data-recipe="${escapeAttr(slot.candidate.recipe.id)}">
      <span>${status}</span>
      <small>${escapeHtml(shortRecipeTitle(slot.candidate.recipe.title))}</small>
    </button>
  `;
}

function renderMissingChip(item) {
  return `
    <button class="missing-chip" type="button" data-action="select-repeat-recipe" data-recipe="${escapeAttr(item.candidate.recipe.id)}">
      ${escapeHtml(shortDateLabel(item.date))} ${escapeHtml(item.meal.icon)} ${escapeHtml(shortRecipeTitle(item.candidate.recipe.title))}
    </button>
  `;
}

function renderRepeatPhotoPicker(recipeId) {
  const latest = getRecipeEvaluationHistory(recipeId).find((evaluation) => evaluation.photo);
  const photo = state.repeatDraft.photo || latest?.photo || "";
  return `
    <label class="repeat-photo-tap" for="repeat-photo" title="写真を追加">
      ${photo ? `<img src="${escapeAttr(photo)}" alt="料理写真">` : `<span>写真<br>追加</span>`}
    </label>
  `;
}

function renderRepeatRecipeRow(recipe, selectedId) {
  const summary = getRecipeRepeatSummary(recipe.id);
  return `
    <button class="repeat-recipe-row ${recipe.id === selectedId ? "is-active" : ""}" type="button" data-action="select-repeat-recipe" data-recipe="${escapeAttr(recipe.id)}">
      ${renderLatestPhoto(recipe.id)}
      <span>
        <strong>${escapeHtml(recipe.title)}</strong>
        <small>${escapeHtml(repeatRecipeMeta(recipe))}</small>
      </span>
      <span class="badge ${summary.badgeClass}">${escapeHtml(summary.count ? `${summary.count}回` : "未記録")}</span>
    </button>
  `;
}

function renderLatestPhoto(recipeId) {
  const latest = getRecipeEvaluationHistory(recipeId).find((evaluation) => evaluation.photo);
  return latest?.photo
    ? `<img class="repeat-thumb" src="${escapeAttr(latest.photo)}" alt="料理写真">`
    : `<span class="repeat-thumb is-empty" aria-hidden="true">写真</span>`;
}

function repeatRecipeMeta(recipe) {
  const history = getRecipeEvaluationHistory(recipe.id);
  const latest = history[0];
  const lastDate = latest ? formatDate(latest.cookedAt) : "まだ食べた記録なし";
  return `${mealLabel(recipe.mealType)} / 直近 ${lastDate} / ${history.length}回`;
}

function firstDateText(history) {
  if (!history.length) return "初回として記録";
  const first = history[history.length - 1];
  return `初回 ${formatDate(first.cookedAt)} / ${history.length}回`;
}

function getRecipeEvaluationHistory(recipeId) {
  return state.evaluations
    .filter((evaluation) => evaluation.recipeId === recipeId)
    .sort((a, b) => dateValue(b.cookedAt) - dateValue(a.cookedAt));
}

function evaluationMealType(evaluation) {
  const recipe = recipeById(evaluation.recipeId);
  return normalizeRepeatMealType(evaluation.mealType) || normalizeRepeatMealType(recipe?.mealType) || "dinner";
}

function getRepeatRecipes() {
  return state.recipes
    .filter(matchesMealFilter)
    .sort((a, b) => {
      const latestA = getRecipeEvaluationHistory(a.id)[0]?.cookedAt || "";
      const latestB = getRecipeEvaluationHistory(b.id)[0]?.cookedAt || "";
      const dateDiff = dateValue(latestB) - dateValue(latestA);
      if (dateDiff) return dateDiff;
      return a.title.localeCompare(b.title, "ja");
    });
}

function buildRepeatWeekReview() {
  const plan = buildWeeklyPlan();
  const slots = mealSlots();
  const start = addDays(today(), -6);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const daySlots = slots.map((meal) => ({ mealId: meal.id, meal, candidate: null, completed: false }));

    state.evaluations
      .filter((evaluation) => evaluation.cookedAt === date)
      .forEach((evaluation) => {
        const recipe = recipeById(evaluation.recipeId);
        if (!recipe) return;
        const mealId = normalizeRepeatMealType(evaluation.mealType) || (slots.some((meal) => meal.id === recipe.mealType) ? recipe.mealType : "dinner");
        const slot = daySlots.find((item) => item.mealId === mealId);
        if (slot && !slot.candidate) {
          slot.candidate = { recipe };
          slot.completed = true;
        }
      });

    const planDay = plan.find((day) => day.date === date);
    if (date === today() && planDay?.candidate) {
      const mealId = slots.some((meal) => meal.id === planDay.candidate.recipe.mealType)
        ? planDay.candidate.recipe.mealType
        : "dinner";
      const slot = daySlots.find((item) => item.mealId === mealId);
      if (slot && !slot.candidate) {
        slot.candidate = planDay.candidate;
        slot.completed = state.evaluations.some((evaluation) => (
          evaluation.recipeId === planDay.candidate.recipe.id && evaluation.cookedAt === date
        ));
      }
    }
    return { date, slots: daySlots };
  });
  return {
    days,
    missing: days.flatMap((day) => day.slots
      .filter((slot) => slot.candidate && !slot.completed)
      .map((slot) => ({ date: day.date, meal: slot.meal, candidate: slot.candidate })))
  };
}

function mealSlots() {
  return [
    { id: "breakfast", shortLabel: "朝", icon: "☀️" },
    { id: "lunch", shortLabel: "昼", icon: "🍙" },
    { id: "dinner", shortLabel: "夜", icon: "🌙" }
  ];
}

function shortDateLabel(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function shortRecipeTitle(title) {
  const value = String(title || "");
  return value.length > 5 ? `${value.slice(0, 5)}…` : value;
}

function familyInitial(name) {
  return String(name || "?").trim().slice(0, 1) || "?";
}

function renderEvaluationCard(evaluation) {
  const summary = summarizeRepeatCycles(evaluation.familyRepeatCycles);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${formatDate(evaluation.cookedAt)} / ${escapeHtml(mealLabel(evaluationMealType(evaluation)))}</strong>
          <p class="muted small">${escapeHtml(summary.description)}</p>
        </div>
        <span class="badge ${summary.badgeClass}">${escapeHtml(summary.shortLabel)}</span>
      </div>
      <p class="muted small">${escapeHtml(evaluation.memo)}</p>
      ${evaluation.photo ? `<img class="eval-photo" src="${escapeAttr(evaluation.photo)}" alt="料理写真">` : ""}
      <div class="chip-row">
        ${state.family.map((name) => `<span class="chip">${name}: ${escapeHtml(repeatLabel(evaluation.familyRepeatCycles?.[name]) || "-")}</span>`).join("")}
      </div>
      <button class="secondary-button danger full-button" type="button" data-action="delete-evaluation" data-eval="${escapeAttr(evaluation.id)}">この記録を削除</button>
    </article>
  `;
}

function renderSettings() {
  return `
    <section class="hero-card">
      <div class="section-head">
        <div>
          <h2>設定</h2>
          <p>家族メンバーとデータの管理をします。</p>
        </div>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${state.family.length}</strong><span>家族メンバー</span></div>
        <div class="hero-stat"><strong>${state.recipes.length}</strong><span>レシピ</span></div>
        <div class="hero-stat"><strong>${state.evaluations.length}</strong><span>リピ記録</span></div>
        <div class="hero-stat"><strong>${getServingCount()}</strong><span>表示人数</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>材料表示</h3>
          <p>材料メモは1人前で保存し、画面では人数分に換算します。</p>
        </div>
      </div>
      <div class="field">
        <label for="serving-count">表示人数</label>
        <input id="serving-count" class="input" type="number" min="1" max="12" step="1" value="${getServingCount()}">
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>家族メンバー</h3>
          <p>リピ周期を記録する家族を編集できます。</p>
        </div>
      </div>
      <div class="member-list">
        ${state.family.map((name, index) => `
          <div class="member-row">
            <input class="input member-name" data-index="${index}" value="${escapeAttr(name)}" aria-label="メンバー名">
            <button class="secondary-button danger" type="button" data-action="remove-member" data-index="${index}" ${state.family.length <= 1 ? "disabled" : ""}>削除</button>
          </div>
        `).join("")}
      </div>
      <button class="secondary-button full-button" type="button" data-action="add-member">メンバーを追加</button>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>データのバックアップ</h3>
          <p>端末を変えるときや、消えてしまう前の保険に。</p>
        </div>
      </div>
      <p class="notice">この端末のブラウザにだけ保存されています。書き出したファイルを保管しておくと、別の端末や再インストール後に読み込んで復元できます。</p>
      <div class="actions">
        <button class="primary-button" type="button" data-action="export-data">書き出す</button>
        <button class="secondary-button" type="button" data-action="import-data">読み込む</button>
      </div>
      <input id="import-file" type="file" accept="application/json,.json" hidden>
    </section>

    <section class="panel danger-zone">
      <div class="section-head">
        <div>
          <h3>全件削除</h3>
          <p>保存したレシピとリピ記録を空にします。家族メンバー設定は残ります。</p>
        </div>
      </div>
      <button class="secondary-button danger full-button" type="button" data-action="reset-all-data">レシピとリピ記録を全件削除</button>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", handleAction);
  });

  document.querySelector("#recipe-search")?.addEventListener("input", (event) => {
    state.searchText = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#serving-count")?.addEventListener("change", (event) => {
    state.servingCount = normalizeServingCount(event.target.value);
    saveState();
    render();
  });

  document.querySelector("#repeat-recipe")?.addEventListener("change", (event) => {
    state.selectedRecipeId = event.target.value;
    saveState();
    render();
  });

  document.querySelectorAll(".member-name").forEach((input) => {
    input.addEventListener("change", (event) => {
      renameMember(Number(event.target.dataset.index), event.target.value);
    });
  });

  document.querySelector("#import-file")?.addEventListener("change", handleImportFile);

  document.querySelector("#repeat-photo")?.addEventListener("change", handlePhotoFile);
}

async function handleAction(event) {
  const { action } = event.currentTarget.dataset;

  if (action === "start-demo") {
    state = clone(demoState);
    state.onboarded = true;
    saveState();
    showToast("サンプルデータを読み込みました。");
    render();
    return;
  }

  if (action === "start-empty") {
    state = clone(demoState);
    state.onboarded = true;
    state.recipes = [];
    state.evaluations = [];
    state.selectedRecipeId = null;
    state.draft = clone(emptyDraft);
    state.repeatDraft = normalizeRepeatDraft({}, state.family);
    state.extractedIngredients = [];
    state.extractedSteps = [];
    saveState();
    showToast("空の状態ではじめます。");
    render();
    return;
  }

  if (action === "extract-caption") {
    captureDraft();
    state.extractedIngredients = parseIngredients(state.draft.caption);
    state.extractedSteps = parseCookingSteps(state.draft.caption);
    saveState();
    showToast("材料と調理方法を抽出しました。");
    render();
  }

  if (action === "fetch-caption") {
    captureDraft();
    if (isCaptionImporting) return;

    if (!API_BASE_URL || !isYouTubePlatform(detectPlatform(state.draft.videoUrl))) {
      const result = prepareCaptionImport(state.draft.videoUrl);
      state.draft.source = result.platform.label;
      state.fetchStatus = result.message;
      state.extractedIngredients = parseIngredients(state.draft.caption);
      state.extractedSteps = parseCookingSteps(state.draft.caption);
      saveState();
      showToast(result.toast);
      render();
      return;
    }

    isCaptionImporting = true;
    state.fetchStatus = "YouTubeの説明文を取得して、材料メモを作成しています。";
    saveState();
    render();

    try {
      const result = await importRecipeFromYouTube(state.draft.videoUrl);
      applyImportedRecipe(result);
      state.fetchStatus = "YouTubeの説明文から材料メモを作成しました。保存前に内容を確認してください。";
      saveState();
      showToast("材料メモを作成しました。");
    } catch (error) {
      state.fetchStatus = `${error.message || "URLから取得できませんでした。"} キャプションを手動で貼り付けて抽出できます。`;
      state.extractedIngredients = parseIngredients(state.draft.caption);
      state.extractedSteps = parseCookingSteps(state.draft.caption);
      saveState();
      showToast("URL取得に失敗しました。");
    } finally {
      isCaptionImporting = false;
      render();
    }
  }

  if (action === "set-meal-type") {
    captureDraft();
    state.draft.mealType = event.currentTarget.dataset.meal || "dinner";
    saveState();
    render();
  }

  if (action === "toggle-meal-types") {
    captureDraft();
    state.showAllMealTypes = !state.showAllMealTypes;
    saveState();
    render();
  }

  if (action === "filter-meal") {
    state.mealFilter = event.currentTarget.dataset.meal || "all";
    saveState();
    render();
  }

  if (action === "save-recipe") {
    captureDraft();
    if (!state.draft.title) {
      showToast("レシピ名を入力してください。");
      render();
      return;
    }
    if (!state.draft.videoUrl) {
      showToast("ショート動画リンクを入力してください。");
      render();
      return;
    }
    const ingredients = state.extractedIngredients.length ? state.extractedIngredients : parseIngredients(state.draft.caption);
    const steps = state.extractedSteps.length ? state.extractedSteps : parseCookingSteps(state.draft.caption);
    const existing = state.editingRecipeId ? recipeById(state.editingRecipeId) : null;
    if (existing) {
      existing.title = state.draft.title;
      existing.videoUrl = state.draft.videoUrl;
      existing.source = state.draft.source;
      existing.mealType = state.draft.mealType;
      existing.caption = state.draft.caption;
      existing.ingredients = ingredients;
      existing.steps = steps;
      existing.tags = [mealLabel(state.draft.mealType), state.draft.source, "動画"];
      existing.note = state.draft.note;
      state.selectedRecipeId = existing.id;
      state.editingRecipeId = null;
      saveState();
      showToast("レシピを更新しました。");
      render();
    } else {
      const recipe = {
        id: `r${Date.now()}`,
        title: state.draft.title,
        videoUrl: state.draft.videoUrl,
        source: state.draft.source,
        mealType: state.draft.mealType,
        caption: state.draft.caption,
        ingredients,
        steps,
        tags: [mealLabel(state.draft.mealType), state.draft.source, "動画"],
        savedAt: today(),
        note: state.draft.note
      };
      state.recipes.unshift(recipe);
      state.selectedRecipeId = recipe.id;
      state.draft = clone(emptyDraft);
      state.extractedIngredients = [];
      state.extractedSteps = [];
      state.fetchStatus = "";
      saveState();
      showToast("ショート動画レシピを保存しました。");
      render();
    }
  }

  if (action === "edit-recipe") {
    const recipe = recipeById(event.currentTarget.dataset.recipe);
    if (recipe) {
      state.editingRecipeId = recipe.id;
      state.draft = {
        title: recipe.title,
        videoUrl: recipe.videoUrl,
        source: recipe.source,
        mealType: recipe.mealType,
        caption: recipe.caption,
        note: recipe.note
      };
      state.extractedIngredients = clone(recipe.ingredients);
      state.extractedSteps = [...recipe.steps];
      state.fetchStatus = "";
      state.view = "collection";
      saveState();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (action === "cancel-edit") {
    state.editingRecipeId = null;
    state.draft = clone(emptyDraft);
    state.extractedIngredients = [];
    state.extractedSteps = [];
    state.fetchStatus = "";
    saveState();
    render();
  }

  if (action === "delete-recipe") {
    const id = event.currentTarget.dataset.recipe;
    const recipe = recipeById(id);
    if (recipe && window.confirm(`「${recipe.title}」を削除します。関連するリピ記録も消えます。よろしいですか？`)) {
      state.recipes = state.recipes.filter((item) => item.id !== id);
      state.evaluations = state.evaluations.filter((item) => item.recipeId !== id);
      if (state.editingRecipeId === id) state.editingRecipeId = null;
      if (state.selectedRecipeId === id) state.selectedRecipeId = state.recipes[0]?.id || null;
      saveState();
      showToast("レシピを削除しました。");
      render();
    }
    return;
  }

  if (action === "delete-evaluation") {
    const id = event.currentTarget.dataset.eval;
    if (window.confirm("このリピ記録を削除します。よろしいですか？")) {
      state.evaluations = state.evaluations.filter((item) => item.id !== id);
      saveState();
      showToast("リピ記録を削除しました。");
      render();
    }
    return;
  }

  if (action === "add-member") {
    addMember();
  }

  if (action === "remove-member") {
    removeMember(Number(event.currentTarget.dataset.index));
  }

  if (action === "export-data") {
    exportData();
  }

  if (action === "import-data") {
    document.querySelector("#import-file")?.click();
    return;
  }

  if (action === "reset-all-data") {
    resetAllUserData();
    return;
  }

  if (action === "record-repeat") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || state.repeatDraft.mealType || "dinner";
    state.view = "repeat";
    saveState();
    render();
  }

  if (action === "select-repeat-recipe") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || state.repeatDraft.mealType || "dinner";
    saveState();
    render();
  }

  if (action === "set-repeat-meal") {
    state.repeatDraft.mealType = normalizeRepeatMealType(event.currentTarget.dataset.meal) || "dinner";
    saveState();
    render();
  }

  if (action === "set-cycle") {
    const person = event.currentTarget.dataset.person;
    const cycle = normalizeRepeatCycle(event.currentTarget.dataset.cycle) || defaultRepeatCycle;
    state.repeatDraft.familyRepeatCycles[person] = cycle;
    saveState();
    render();
  }

  if (action === "save-repeat") {
    captureRepeatDraft();
    const evaluation = {
      id: `e${Date.now()}`,
      recipeId: state.selectedRecipeId,
      cookedAt: state.repeatDraft.cookedAt || today(),
      mealType: state.repeatDraft.mealType || recipeById(state.selectedRecipeId)?.mealType || "dinner",
      familyRepeatCycles: { ...state.repeatDraft.familyRepeatCycles },
      memo: state.repeatDraft.memo,
      photo: state.repeatDraft.photo || "",
      photoLabel: "食卓写真"
    };
    state.evaluations.unshift(evaluation);
    state.repeatDraft.photo = "";
    state.repeatDraft.cookedAt = today();
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || "dinner";
    saveState();
    showToast("リピ記録を保存しました。");
    render();
  }

  if (action === "remove-photo") {
    state.repeatDraft.photo = "";
    saveState();
    render();
  }
}

function captureDraft() {
  const currentUrl = document.querySelector("#recipe-url")?.value.trim() || "";
  const platform = detectPlatform(currentUrl);
  state.draft = {
    title: document.querySelector("#recipe-title")?.value.trim() || "",
    videoUrl: currentUrl,
    source: document.querySelector("#recipe-source")?.value.trim() || platform.label,
    mealType: state.draft.mealType || "dinner",
    caption: document.querySelector("#recipe-caption")?.value.trim() || "",
    note: document.querySelector("#recipe-note")?.value.trim() || ""
  };
}

function captureRepeatDraft() {
  state.repeatDraft.memo = document.querySelector("#repeat-memo")?.value.trim() || "";
  state.repeatDraft.cookedAt = normalizeDateInput(document.querySelector("#repeat-cooked-at")?.value) || today();
  state.repeatDraft.mealType = normalizeRepeatMealType(state.repeatDraft.mealType) || "dinner";
}

function renameMember(index, rawValue) {
  const next = rawValue.trim();
  const previous = state.family[index];
  if (!next || next === previous) {
    render();
    return;
  }
  if (state.family.some((name, i) => i !== index && name === next)) {
    showToast("同じ名前のメンバーがいます。");
    render();
    return;
  }
  state.family[index] = next;
  migrateMemberKey(previous, next);
  saveState();
  showToast("メンバー名を変更しました。");
  render();
}

function migrateMemberKey(previous, next) {
  const move = (cycles) => {
    if (cycles && Object.prototype.hasOwnProperty.call(cycles, previous)) {
      cycles[next] = cycles[previous];
      delete cycles[previous];
    }
  };
  move(state.repeatDraft.familyRepeatCycles);
  state.evaluations.forEach((evaluation) => move(evaluation.familyRepeatCycles));
}

function addMember() {
  let index = state.family.length + 1;
  let name = `メンバー${index}`;
  while (state.family.includes(name)) {
    index += 1;
    name = `メンバー${index}`;
  }
  state.family.push(name);
  state.repeatDraft.familyRepeatCycles[name] = defaultRepeatCycle;
  saveState();
  showToast("メンバーを追加しました。名前を編集してください。");
  render();
}

function removeMember(index) {
  if (state.family.length <= 1) return;
  const name = state.family[index];
  if (!window.confirm(`「${name}」を家族メンバーから外します。よろしいですか？`)) return;
  state.family.splice(index, 1);
  delete state.repeatDraft.familyRepeatCycles[name];
  saveState();
  showToast("メンバーを削除しました。");
  render();
}

function resetAllUserData() {
  const message = "保存したレシピ、材料メモ、リピ記録、料理写真をすべて削除します。家族メンバー設定は残ります。よろしいですか？";
  if (!window.confirm(message)) return;
  state.recipes = [];
  state.evaluations = [];
  state.selectedRecipeId = null;
  state.editingRecipeId = null;
  state.searchText = "";
  state.mealFilter = "all";
  state.showAllMealTypes = false;
  state.draft = clone(emptyDraft);
  state.repeatDraft = normalizeRepeatDraft({}, state.family);
  state.extractedIngredients = [];
  state.extractedSteps = [];
  state.fetchStatus = "";
  state.view = "collection";
  state.onboarded = true;
  saveState();
  showToast("レシピとリピ記録を全件削除しました。");
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `matagochi-backup-${today()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("データを書き出しました。");
}

function handleImportFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!Array.isArray(parsed.recipes) || !Array.isArray(parsed.evaluations)) {
        throw new Error("invalid");
      }
      if (!window.confirm("読み込むと、今のデータはバックアップの内容で置き換わります。よろしいですか？")) return;
      state = normalizeState(parsed);
      saveState();
      showToast("データを読み込みました。");
      render();
    } catch {
      showToast("読み込めませんでした。書き出したJSONファイルを選んでください。");
    }
  };
  reader.readAsText(file);
}

function handlePhotoFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("画像ファイルを選んでください。");
    return;
  }
  resizeImage(file)
    .then((dataUrl) => {
      state.repeatDraft.photo = dataUrl;
      saveState();
      showToast("写真を追加しました。");
      render();
    })
    .catch(() => showToast("写真を読み込めませんでした。"));
}

function resizeImage(file, maxSize = 960, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const width = Math.round(image.width * scale);
        const height = Math.round(image.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function recipeById(id) {
  return state.recipes.find((recipe) => recipe.id === id);
}

function getFilteredRecipes() {
  const query = state.searchText.trim().toLowerCase();
  return state.recipes.filter((recipe) => {
    if (!matchesMealFilter(recipe)) return false;
    if (!query) return true;
    const haystack = [
      recipe.title,
      recipe.caption,
      recipe.note,
      recipe.source,
      mealLabel(recipe.mealType),
      ...recipe.ingredients.map((item) => item.name)
    ].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function matchesMealFilter(recipe) {
  if (!state.mealFilter || state.mealFilter === "all") return true;
  if (state.mealFilter === "other") {
    return !mealTypes.find((type) => type.id === recipe.mealType)?.featured;
  }
  return recipe.mealType === state.mealFilter;
}

function parseIngredients(caption) {
  const categories = [
    ["野菜", /小松菜|ほうれん草|キャベツ|にんじん|玉ねぎ|きゅうり|しめじ|トマト|野菜/],
    ["肉", /鶏|豚|牛|ひき肉|こま/],
    ["魚", /鮭|さば|ツナ|魚/],
    ["卵・乳製品", /卵|バター|牛乳|チーズ/],
    ["大豆・加工品", /豆腐|厚揚げ|納豆/],
    ["主食", /ごはん|うどん|麺|パン|米/],
    ["缶詰", /缶/],
    ["調味料", /しょうゆ|塩|だし|めんつゆ|カレー粉|たれ|油|砂糖|みそ/]
  ];
  const matches = caption.match(/[^、。,.]+?(?:\s|　)?(?:\d+[個本袋枚丁缶玉膳切れgml]+|半玉|適量|大さじ\d+|小さじ\d+)/g) || [];
  const parsed = matches.map((match) => {
    const cleaned = match.trim().replace(/^と/, "");
    const amountMatch = cleaned.match(/(\d+[個本袋枚丁缶玉膳切れgml]+|半玉|適量|大さじ\d+|小さじ\d+)$/);
    const amount = amountMatch ? amountMatch[0] : "適量";
    const name = cleaned.replace(amount, "").trim();
    const category = categories.find(([, pattern]) => pattern.test(name))?.[0] || "その他";
    return ingredient(name, amount, category);
  }).filter((item) => item.name);

  return parsed.length ? parsed : [ingredient("材料メモ", "キャプションを確認", "その他")];
}

function parseCookingSteps(caption) {
  const normalized = caption
    .replaceAll("\n", "。")
    .replace(/作り方[:：]/g, "。")
    .replace(/手順[:：]/g, "。");
  const numbered = normalized.match(/(?:\d+\.|[①②③④⑤⑥]|\d+[）)])\s*[^。]+/g);
  const candidates = numbered?.length ? numbered : normalized.split(/[。.!！]/);
  const cookingWords = /切|炒|焼|煮|蒸|混ぜ|和え|のせ|かけ|包|入れ|加え|ゆで|冷や|仕上げ|レンジ|チン|盛/;
  return candidates
    .map((step) => step.replace(/^(?:\d+\.|[①②③④⑤⑥]|\d+[）)])\s*/, "").trim())
    .filter((step) => step.length >= 5 && cookingWords.test(step))
    .slice(0, 6);
}

function detectPlatform(url) {
  const value = url.toLowerCase();
  if (/instagram\.com\/(reel|p)\//.test(value)) {
    return { label: "Instagram", supported: true, help: "Reel URLを保存できます。キャプション取得はバックエンド連携で有効化します。" };
  }
  if (/facebook\.com\/.*(reel|watch|videos)|fb\.watch/.test(value)) {
    return { label: "Facebook", supported: true, help: "Facebook動画URLを保存できます。公開投稿以外はログイン連携が必要です。" };
  }
  if (/tiktok\.com\/@.+\/video|vm\.tiktok\.com|vt\.tiktok\.com/.test(value)) {
    return { label: "TikTok", supported: true, help: "TikTok動画URLを保存できます。説明文取得はサーバー側の取得処理で対応します。" };
  }
  if (/youtube\.com\/shorts\/|youtu\.be\//.test(value)) {
    return { id: "youtube", label: "YouTube Shorts", supported: true, help: "Shorts URLを保存できます。API設定済み環境では説明文から材料メモを作成できます。" };
  }
  if (/youtube\.com\/watch\?/.test(value)) {
    return { id: "youtube", label: "YouTube", supported: true, help: "YouTube URLを保存できます。API設定済み環境では説明文から材料メモを作成できます。" };
  }
  if (!value) {
    return { label: "ショート動画", supported: false, help: "URLを入力すると対応サービスを判定します。" };
  }
  return { label: "その他", supported: false, help: "Instagram / Facebook / TikTok / YouTube Shorts のURLを想定しています。" };
}

function prepareCaptionImport(url) {
  const platform = detectPlatform(url);
  if (!platform.supported) {
    return {
      platform,
      toast: "対応サービスのURLを入力してください。",
      message: "対応URLを入力すると動画元を自動判定します。"
    };
  }
  return {
    platform,
    toast: `${platform.label}のURLを認識しました。`,
    message: `${platform.label} のURLを認識しました。静的MVPではSNSページから直接キャプション取得は行わず、貼り付けたキャプションから材料と調理方法を抽出します。バックエンド追加後はこのボタンを実取得に差し替えできます。`
  };
}

function isYouTubePlatform(platform) {
  return platform.id === "youtube" || /^YouTube/.test(platform.label);
}

async function importRecipeFromYouTube(videoUrl) {
  const response = await fetch(`${API_BASE_URL}/api/import/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: videoUrl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "YouTubeの説明文を取得できませんでした。");
  }
  return data;
}

function applyImportedRecipe(result) {
  const platform = detectPlatform(state.draft.videoUrl);
  state.draft = {
    ...state.draft,
    title: state.draft.title || result.title || "",
    videoUrl: result.videoUrl || state.draft.videoUrl,
    source: result.source || platform.label,
    caption: result.caption || state.draft.caption,
    note: state.draft.note || result.note || ""
  };
  state.extractedIngredients = normalizeImportedIngredients(result.ingredients);
  state.extractedSteps = Array.isArray(result.steps) && result.steps.length
    ? result.steps.map((step) => String(step || "").trim()).filter(Boolean)
    : parseCookingSteps(state.draft.caption);
}

function normalizeImportedIngredients(items) {
  if (!Array.isArray(items) || !items.length) return parseIngredients(state.draft.caption);
  return items
    .map((item) => ingredient(item.name || "", item.amount || "適量", item.category || "その他"))
    .filter((item) => item.name);
}

function displayIngredientAmount(item) {
  return scaleAmountForServings(item.amount, getServingCount());
}

function scaleAmountForServings(amount, servingCount) {
  const value = String(amount || "").trim();
  const count = normalizeServingCount(servingCount);
  if (!value || count === 1 || /適量|少々|お好み|ひとつまみ/.test(value)) return value || "適量";

  const halfMatch = value.match(/^半(.+)$/);
  if (halfMatch) {
    return `${formatScaledNumber(0.5 * count)}${halfMatch[1]}`;
  }

  return value.replace(/(\d+)\s*\/\s*(\d+)|\d+(?:\.\d+)?/g, (match, numerator, denominator) => {
    const base = numerator ? Number(numerator) / Number(denominator) : Number(match);
    return formatScaledNumber(base * count);
  });
}

function formatScaledNumber(value) {
  if (!Number.isFinite(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, "");
}

function getRecipeRepeatSummary(recipeId) {
  const evaluations = state.evaluations
    .filter((evaluation) => evaluation.recipeId === recipeId)
    .sort((a, b) => dateValue(b.cookedAt) - dateValue(a.cookedAt));
  if (!evaluations.length) {
    return {
      count: 0,
      averageDays: null,
      shortLabel: "未設定",
      badgeLabel: "未リピ記録",
      badgeClass: "warn",
      description: "まだ周期未設定",
      nextDate: today(),
      daysUntil: 0,
      excluded: false,
      unrecorded: true
    };
  }

  const latest = evaluations[0];
  const summary = summarizeRepeatCycles(latest.familyRepeatCycles);
  if (summary.excluded) {
    return {
      ...summary,
      count: evaluations.length,
      nextDate: "",
      daysUntil: Infinity,
      unrecorded: false
    };
  }

  const nextDate = addDays(latest.cookedAt, Math.round(summary.averageDays));
  const daysUntil = daysBetween(today(), nextDate);
  return {
    ...summary,
    count: evaluations.length,
    nextDate,
    daysUntil,
    description: `${formatDate(latest.cookedAt)}に記録 / 次は${formatDate(nextDate)}頃`,
    unrecorded: false
  };
}

function summarizeRepeatCycles(cycles) {
  const values = state.family
    .map((name) => normalizeRepeatCycle(cycles?.[name]))
    .filter(Boolean);
  if (!values.length) values.push(defaultRepeatCycle);
  const validOptions = values
    .map((cycle) => repeatOptions.find((option) => option.id === cycle))
    .filter((option) => option && option.days !== null);
  const neverCount = values.filter((cycle) => cycle === "never").length;
  if (!validOptions.length) {
    return {
      averageDays: null,
      shortLabel: "リピなし",
      badgeLabel: "リピなし",
      badgeClass: "stop",
      description: "家族全員がリピなし",
      excluded: true
    };
  }

  const averageDays = validOptions.reduce((sum, option) => sum + option.days, 0) / validOptions.length;
  const nearest = nearestRepeatOption(averageDays);
  const mixed = new Set(values).size > 1;
  const shortLabel = nearest.label;
  const badgeLabel = `${nearest.label}${mixed ? "平均" : ""}`;
  return {
    averageDays,
    shortLabel,
    badgeLabel,
    badgeClass: nearest.tone === "hot" ? "hot" : "",
    description: neverCount ? `${badgeLabel} / リピなし ${neverCount}人` : badgeLabel,
    excluded: false
  };
}

function nearestRepeatOption(days) {
  return repeatOptions
    .filter((option) => option.days !== null)
    .reduce((best, option) => {
      if (!best) return option;
      return Math.abs(option.days - days) < Math.abs(best.days - days) ? option : best;
    }, null);
}

function repeatLabel(id) {
  return repeatOptions.find((option) => option.id === normalizeRepeatCycle(id))?.label || "";
}

function buildWeeklyPlan() {
  const candidates = getMealCandidates();
  const used = new Set();
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today(), index);
    const candidate = candidates.find((item) => !used.has(item.recipe.id) && item.dueDate <= date)
      || candidates.find((item) => !used.has(item.recipe.id));
    if (candidate) used.add(candidate.recipe.id);
    return {
      date,
      label: weekdayLabel(date),
      dateLabel: formatDate(date),
      candidate
    };
  });
}

function getMealCandidates() {
  return state.recipes
    .map((recipe) => {
      const summary = getRecipeRepeatSummary(recipe.id);
      if (summary.excluded) return null;
      const dueDate = summary.unrecorded ? today() : summary.nextDate;
      const daysUntil = summary.unrecorded ? 0 : summary.daysUntil;
      return {
        recipe,
        summary,
        dueDate,
        daysUntil,
        reason: candidateReason(summary, dueDate, daysUntil)
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.summary.unrecorded !== b.summary.unrecorded) return a.summary.unrecorded ? 1 : -1;
      return a.daysUntil - b.daysUntil || a.recipe.title.localeCompare(b.recipe.title, "ja");
    });
}

function candidateReason(summary, dueDate, daysUntil) {
  if (summary.unrecorded) return "まだ周期未設定";
  if (daysUntil < 0) return `${Math.abs(daysUntil)}日過ぎています`;
  if (daysUntil === 0) return "今日が食べ頃";
  if (daysUntil <= 7) return `あと${daysUntil}日で食べ頃`;
  return `${formatDate(dueDate)}頃に再登場`;
}

function repeatReadyCount() {
  return getMealCandidates().filter((candidate) => candidate.daysUntil <= 7).length;
}

function unrecordedCount() {
  return state.recipes.filter((recipe) => getRecipeRepeatSummary(recipe.id).unrecorded).length;
}

function excludedRepeatCount() {
  return state.recipes.filter((recipe) => getRecipeRepeatSummary(recipe.id).excluded).length;
}

function countIngredientNames() {
  return new Set(state.recipes.flatMap((recipe) => recipe.ingredients.map((item) => item.name))).size;
}

function mealLabel(id) {
  return mealTypes.find((type) => type.id === id)?.label || "未分類";
}

function dateValue(date) {
  return new Date(`${date}T00:00:00`).getTime();
}

function addDays(date, days) {
  const next = new Date(dateValue(date));
  next.setDate(next.getDate() + days);
  const year = next.getFullYear();
  const month = String(next.getMonth() + 1).padStart(2, "0");
  const day = String(next.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(from, to) {
  return Math.round((dateValue(to) - dateValue(from)) / 86400000);
}

function weekdayLabel(date) {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[new Date(dateValue(date)).getDay()];
}

function today() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function renderEmpty(message) {
  return `<div class="empty-state"><p>${message}</p></div>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function showToast(message) {
  clearTimeout(toastTimer);
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.append(toast);
  toastTimer = setTimeout(() => toast.remove(), 2200);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

document.querySelector('[data-action="reset-demo"]').addEventListener("click", () => {
  if (!window.confirm("この端末に保存したレシピとリピ記録をすべて削除して、最初の状態に戻します。よろしいですか？")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = clone(demoState);
  showToast("データをリセットしました。");
  render();
});

render();
