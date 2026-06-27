const STORAGE_KEY = "matagochi-mvp-v1";

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
  { id: "breakfast", label: "朝ごはん" },
  { id: "lunch", label: "昼ごはん" },
  { id: "dinner", label: "夜ごはん" },
  { id: "side", label: "副菜" }
];

const demoState = {
  view: "collection",
  onboarded: false,
  selectedRecipeId: "r2",
  editingRecipeId: null,
  searchText: "",
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
    memo: "魚の日としてリピート候補。子ども用はしょうゆ少なめ。",
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
    draft: { ...base.draft, ...(saved.draft || {}) },
    repeatDraft: normalizeRepeatDraft(saved.repeatDraft || saved.ratingDraft || base.repeatDraft, family),
    evaluations: normalizeEvaluations(Array.isArray(saved.evaluations) ? saved.evaluations : base.evaluations, family)
  };
}

function normalizeRepeatDraft(draft, family) {
  return {
    familyRepeatCycles: normalizeFamilyRepeatCycles(draft?.familyRepeatCycles, draft?.familyRatings, family, draft?.nextTiming),
    memo: draft?.memo || "",
    photo: draft?.photo || ""
  };
}

function normalizeEvaluations(evaluations, family) {
  return evaluations.map((evaluation) => ({
    ...evaluation,
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
            <label for="recipe-meal">分類</label>
            <select id="recipe-meal" class="select">
              ${mealTypes.map((type) => `<option value="${type.id}" ${state.draft.mealType === type.id ? "selected" : ""}>${type.label}</option>`).join("")}
            </select>
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
          <button class="secondary-button" type="button" data-action="fetch-caption">URLから取得</button>
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
          <p>材料と調理方法を保存前に確認できます。</p>
        </div>
      </div>
      <h3 class="subhead">材料</h3>
      <div class="ingredient-list">
        ${extracted.map((item) => `
          <div class="ingredient-row">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="muted small">${escapeHtml(item.amount)}・${escapeHtml(item.category)}</span>
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
      <div class="recipe-list mvp-list">
        ${filteredRecipes.map(renderRecipeCard).join("") || renderEmpty("保存済みレシピがありません。")}
      </div>
    </section>
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
        ${recipe.ingredients.slice(0, 5).map((item) => `<span class="chip">${escapeHtml(item.name)}</span>`).join("")}
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
  const selected = recipeById(state.selectedRecipeId) || state.recipes[0];
  const history = selected ? state.evaluations.filter((evaluation) => evaluation.recipeId === selected.id) : [];
  const summary = selected ? getRecipeRepeatSummary(selected.id) : null;

  return `
    <section class="hero-card">
      <div class="section-head">
        <div>
          <h2>リピ周期</h2>
          <p>「どのくらいの周期でリピートしたい？」を家族ごとに残します。</p>
        </div>
        <span class="badge">${state.evaluations.length}件</span>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${summary ? summary.shortLabel : "-"}</strong><span>選択中の周期</span></div>
        <div class="hero-stat"><strong>${summary ? summary.count : 0}</strong><span>作った回数</span></div>
        <div class="hero-stat"><strong>${repeatReadyCount()}</strong><span>今週候補</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="field">
        <label for="repeat-recipe">リピ周期を記録するレシピ</label>
        <select id="repeat-recipe" class="select">
          ${state.recipes.map((recipe) => `<option value="${escapeAttr(recipe.id)}" ${selected?.id === recipe.id ? "selected" : ""}>${escapeHtml(recipe.title)}</option>`).join("")}
        </select>
      </div>
      ${selected ? `
        <div class="rating-target">
          <strong>${escapeHtml(selected.title)}</strong>
          <p class="muted small">${escapeHtml(selected.note)}</p>
          <div class="chip-row">
            ${selected.ingredients.slice(0, 5).map((item) => `<span class="chip">${escapeHtml(item.name)}</span>`).join("")}
          </div>
        </div>
      ` : renderEmpty("先にレシピを保存してください。")}
    </section>

    ${selected ? `
      <section class="panel">
        <div class="section-head">
          <div>
            <h3>今日のリピ周期</h3>
            <p>家族それぞれの「また食べたい」ペースを選びます。</p>
          </div>
        </div>
        <div class="feedback-list">
          ${state.family.map((name) => renderRepeatInput(name)).join("")}
        </div>
        <div class="field">
          <label for="repeat-memo">メモ</label>
          <textarea id="repeat-memo" class="textarea compact-textarea">${escapeHtml(state.repeatDraft.memo)}</textarea>
        </div>
        <div class="field">
          <label for="repeat-photo">料理写真（任意）</label>
          ${state.repeatDraft.photo ? `
            <div class="photo-preview">
              <img src="${escapeAttr(state.repeatDraft.photo)}" alt="料理写真プレビュー">
              <button class="secondary-button danger" type="button" data-action="remove-photo">写真を外す</button>
            </div>
          ` : ""}
          <input id="repeat-photo" type="file" accept="image/*" class="input file-input">
        </div>
        <button class="primary-button full-button" type="button" data-action="save-repeat">リピ記録を保存</button>
      </section>

      <section class="panel">
        <h3>リピ記録履歴</h3>
        <div class="recipe-list">
          ${history.map(renderEvaluationCard).join("") || renderEmpty("まだリピ記録がありません。")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderRepeatInput(name) {
  const cycle = normalizeRepeatCycle(state.repeatDraft.familyRepeatCycles[name]) || defaultRepeatCycle;
  return `
    <div class="rating-row">
      <strong>${name}</strong>
      <div class="cycle-buttons" role="group" aria-label="${name}のリピ周期">
        ${repeatOptions.map((option) => `
          <button class="cycle-button ${option.id === cycle ? "is-active" : ""}" type="button" data-action="set-cycle" data-person="${escapeAttr(name)}" data-cycle="${option.id}" aria-label="${name} ${option.label}">${option.label}</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEvaluationCard(evaluation) {
  const summary = summarizeRepeatCycles(evaluation.familyRepeatCycles);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${formatDate(evaluation.cookedAt)}</strong>
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

function handleAction(event) {
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
    const result = prepareCaptionImport(state.draft.videoUrl);
    state.draft.source = result.platform.label;
    state.fetchStatus = result.message;
    state.extractedIngredients = parseIngredients(state.draft.caption);
    state.extractedSteps = parseCookingSteps(state.draft.caption);
    saveState();
    showToast(result.toast);
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
  }

  if (action === "delete-evaluation") {
    const id = event.currentTarget.dataset.eval;
    if (window.confirm("このリピ記録を削除します。よろしいですか？")) {
      state.evaluations = state.evaluations.filter((item) => item.id !== id);
      saveState();
      showToast("リピ記録を削除しました。");
      render();
    }
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
  }

  if (action === "record-repeat") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.view = "repeat";
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
      cookedAt: today(),
      familyRepeatCycles: { ...state.repeatDraft.familyRepeatCycles },
      memo: state.repeatDraft.memo,
      photo: state.repeatDraft.photo || "",
      photoLabel: "食卓写真"
    };
    state.evaluations.unshift(evaluation);
    state.repeatDraft.photo = "";
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
    mealType: document.querySelector("#recipe-meal")?.value || "dinner",
    caption: document.querySelector("#recipe-caption")?.value.trim() || "",
    note: document.querySelector("#recipe-note")?.value.trim() || ""
  };
}

function captureRepeatDraft() {
  state.repeatDraft.memo = document.querySelector("#repeat-memo")?.value.trim() || "";
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
  if (!query) return state.recipes;
  return state.recipes.filter((recipe) => {
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
    return { label: "YouTube Shorts", supported: true, help: "Shorts URLを保存できます。説明文取得はYouTube API連携で対応します。" };
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
