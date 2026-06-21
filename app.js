const STORAGE_KEY = "matagochi-mvp-v1";

const family = ["ママ", "パパ", "子ども1", "子ども2"];
const mealTypes = [
  { id: "breakfast", label: "朝ごはん" },
  { id: "lunch", label: "昼ごはん" },
  { id: "dinner", label: "夜ごはん" },
  { id: "side", label: "副菜" }
];

const demoState = {
  view: "collection",
  selectedRecipeId: "r2",
  searchText: "",
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
  ratingDraft: {
    familyRatings: { "ママ": 5, "パパ": 4, "子ども1": 4, "子ども2": 3 },
    nextTiming: "2週間後",
    memo: "魚の日としてリピート候補。子ども用はしょうゆ少なめ。"
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
      familyRatings: { "ママ": 4, "パパ": 5, "子ども1": 4, "子ども2": 4 },
      nextTiming: "来週でもいい",
      memo: "キャベツ多めでもよく食べた。次はにんじん細め。",
      photoLabel: "夕食写真"
    },
    {
      id: "e2",
      recipeId: "r1",
      cookedAt: "2026-06-18",
      familyRatings: { "ママ": 5, "パパ": 4, "子ども1": 3, "子ども2": 3 },
      nextTiming: "月2回",
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
  return {
    ...base,
    ...saved,
    draft: { ...base.draft, ...(saved.draft || {}) },
    ratingDraft: { ...base.ratingDraft, ...(saved.ratingDraft || {}) }
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function setView(view) {
  state.view = view;
  saveState();
  render();
}

function render() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.view);
  });

  const views = {
    collection: renderCollection,
    ratings: renderRatings
  };
  document.querySelector("#app").innerHTML = views[state.view]();
  bindEvents();
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
          <p>SNSで見つけたレシピ動画を保存して、家族の「また」を残します。</p>
        </div>
        <span class="badge">${state.recipes.length}件</span>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${favoriteCount()}</strong><span>高評価候補</span></div>
        <div class="hero-stat"><strong>${uncookedCount()}</strong><span>未評価</span></div>
        <div class="hero-stat"><strong>${countIngredientNames()}</strong><span>材料メモ</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>リンクを保存</h3>
          <p>URLとキャプションだけで、後から探せる形に。</p>
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
          <button class="primary-button" type="button" data-action="save-recipe">保存する</button>
          <button class="secondary-button" type="button" data-action="fetch-caption">URLから取得</button>
        </div>
        <button class="secondary-button full-button" type="button" data-action="extract-caption">キャプションから材料・作り方を抽出</button>
        ${state.fetchStatus ? `<p class="notice">${state.fetchStatus}</p>` : ""}
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
            <strong>${item.name}</strong>
            <span class="muted small">${item.amount}・${item.category}</span>
          </div>
        `).join("")}
      </div>
      <h3 class="subhead">調理方法</h3>
      <ol class="step-list">
        ${steps.map((step) => `<li>${step}</li>`).join("") || "<li>キャプション内の作り方を確認してください。</li>"}
      </ol>
    </section>

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>保存済み</h3>
          <p>評価が増えるほど、リピート判断が楽になります。</p>
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
  const summary = getRecipeSummary(recipe.id);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${recipe.title}</strong>
          <p class="muted small">${mealLabel(recipe.mealType)} / ${recipe.source} / 保存 ${recipe.savedAt}</p>
        </div>
        <span class="badge ${summary.count ? "hot" : ""}">${summary.count ? `★ ${summary.average.toFixed(1)}` : "未評価"}</span>
      </div>
      <p class="muted small">${recipe.note}</p>
      <div class="chip-row">
        ${recipe.ingredients.slice(0, 5).map((item) => `<span class="chip">${item.name}</span>`).join("")}
      </div>
      <div class="actions">
        <a class="primary-button link-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>
        <button class="secondary-button" type="button" data-action="rate-recipe" data-recipe="${recipe.id}">評価する</button>
      </div>
    </article>
  `;
}

function renderRatings() {
  const selected = recipeById(state.selectedRecipeId) || state.recipes[0];
  const history = selected ? state.evaluations.filter((evaluation) => evaluation.recipeId === selected.id) : [];
  const summary = selected ? getRecipeSummary(selected.id) : null;

  return `
    <section class="hero-card">
      <div class="section-head">
        <div>
          <h2>レシピ評価</h2>
          <p>「次いつ食べたい？」を家族ごとに残します。</p>
        </div>
        <span class="badge">${state.evaluations.length}件</span>
      </div>
      <div class="hero-row">
        <div class="hero-stat"><strong>${summary ? summary.average.toFixed(1) : "-"}</strong><span>選択中の平均</span></div>
        <div class="hero-stat"><strong>${summary ? summary.count : 0}</strong><span>作った回数</span></div>
        <div class="hero-stat"><strong>${repeatSoonCount()}</strong><span>早めに再登場</span></div>
      </div>
    </section>

    <section class="panel">
      <div class="field">
        <label for="rating-recipe">評価するレシピ</label>
        <select id="rating-recipe" class="select">
          ${state.recipes.map((recipe) => `<option value="${recipe.id}" ${selected?.id === recipe.id ? "selected" : ""}>${recipe.title}</option>`).join("")}
        </select>
      </div>
      ${selected ? `
        <div class="rating-target">
          <strong>${selected.title}</strong>
          <p class="muted small">${selected.note}</p>
          <div class="chip-row">
            ${selected.ingredients.slice(0, 5).map((item) => `<span class="chip">${item.name}</span>`).join("")}
          </div>
        </div>
      ` : renderEmpty("先にレシピを保存してください。")}
    </section>

    ${selected ? `
      <section class="panel">
        <div class="section-head">
          <div>
            <h3>今日の評価</h3>
            <p>星と次回希望を残すだけの軽い記録です。</p>
          </div>
        </div>
        <div class="feedback-list">
          ${family.map((name) => renderRatingInput(name)).join("")}
        </div>
        <div class="field">
          <label for="next-timing">次はいつ頃食べたい？</label>
          <input id="next-timing" class="input" value="${escapeAttr(state.ratingDraft.nextTiming)}">
        </div>
        <div class="field">
          <label for="rating-memo">評価メモ</label>
          <textarea id="rating-memo" class="textarea compact-textarea">${escapeHtml(state.ratingDraft.memo)}</textarea>
        </div>
        <button class="primary-button full-button" type="button" data-action="save-evaluation">評価を保存</button>
      </section>

      <section class="panel">
        <h3>評価履歴</h3>
        <div class="recipe-list">
          ${history.map(renderEvaluationCard).join("") || renderEmpty("まだ評価履歴がありません。")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderRatingInput(name) {
  const rating = Number(state.ratingDraft.familyRatings[name] || 4);
  return `
    <div class="rating-row">
      <strong>${name}</strong>
      <div class="rating-buttons" role="group" aria-label="${name}の評価">
        ${[1, 2, 3, 4, 5].map((value) => `
          <button class="star-button ${value <= rating ? "is-active" : ""}" type="button" data-action="set-rating" data-person="${name}" data-rating="${value}" aria-label="${name} ${value}点">★</button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderEvaluationCard(evaluation) {
  const average = averageRating(evaluation.familyRatings);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        <div>
          <strong>${formatDate(evaluation.cookedAt)}</strong>
          <p class="muted small">${evaluation.nextTiming}</p>
        </div>
        <span class="badge hot">★ ${average.toFixed(1)}</span>
      </div>
      <p class="muted small">${evaluation.memo}</p>
      <div class="chip-row">
        ${family.map((name) => `<span class="chip">${name}: ${evaluation.familyRatings[name] || "-"}点</span>`).join("")}
      </div>
    </article>
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

  document.querySelector("#rating-recipe")?.addEventListener("change", (event) => {
    state.selectedRecipeId = event.target.value;
    saveState();
    render();
  });
}

function handleAction(event) {
  const { action } = event.currentTarget.dataset;

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
    const ingredients = state.extractedIngredients.length ? state.extractedIngredients : parseIngredients(state.draft.caption);
    const steps = state.extractedSteps.length ? state.extractedSteps : parseCookingSteps(state.draft.caption);
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
    state.extractedIngredients = recipe.ingredients;
    state.extractedSteps = recipe.steps;
    saveState();
    showToast("ショート動画レシピを保存しました。");
    render();
  }

  if (action === "rate-recipe") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.view = "ratings";
    saveState();
    render();
  }

  if (action === "set-rating") {
    const person = event.currentTarget.dataset.person;
    const rating = Number(event.currentTarget.dataset.rating);
    state.ratingDraft.familyRatings[person] = rating;
    saveState();
    render();
  }

  if (action === "save-evaluation") {
    captureRatingDraft();
    const evaluation = {
      id: `e${Date.now()}`,
      recipeId: state.selectedRecipeId,
      cookedAt: today(),
      familyRatings: { ...state.ratingDraft.familyRatings },
      nextTiming: state.ratingDraft.nextTiming,
      memo: state.ratingDraft.memo,
      photoLabel: "食卓写真"
    };
    state.evaluations.unshift(evaluation);
    saveState();
    showToast("レシピ評価を保存しました。");
    render();
  }
}

function captureDraft() {
  const currentUrl = document.querySelector("#recipe-url")?.value.trim() || "";
  const platform = detectPlatform(currentUrl);
  state.draft = {
    title: document.querySelector("#recipe-title")?.value.trim() || "名前未設定レシピ",
    videoUrl: currentUrl,
    source: document.querySelector("#recipe-source")?.value.trim() || platform.label,
    mealType: document.querySelector("#recipe-meal")?.value || "dinner",
    caption: document.querySelector("#recipe-caption")?.value.trim() || "",
    note: document.querySelector("#recipe-note")?.value.trim() || ""
  };
}

function captureRatingDraft() {
  state.ratingDraft.nextTiming = document.querySelector("#next-timing")?.value.trim() || "また今度";
  state.ratingDraft.memo = document.querySelector("#rating-memo")?.value.trim() || "";
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

function getRecipeSummary(recipeId) {
  const evaluations = state.evaluations.filter((evaluation) => evaluation.recipeId === recipeId);
  if (!evaluations.length) return { count: 0, average: 0 };
  const average = evaluations.reduce((sum, evaluation) => sum + averageRating(evaluation.familyRatings), 0) / evaluations.length;
  return { count: evaluations.length, average };
}

function averageRating(ratings) {
  const values = Object.values(ratings || {}).map(Number);
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function favoriteCount() {
  return state.recipes.filter((recipe) => getRecipeSummary(recipe.id).average >= 4.2).length;
}

function uncookedCount() {
  return state.recipes.filter((recipe) => getRecipeSummary(recipe.id).count === 0).length;
}

function repeatSoonCount() {
  return state.evaluations.filter((evaluation) => /来週|すぐ|また|2週間/.test(evaluation.nextTiming)).length;
}

function countIngredientNames() {
  return new Set(state.recipes.flatMap((recipe) => recipe.ingredients.map((item) => item.name))).size;
}

function mealLabel(id) {
  return mealTypes.find((type) => type.id === id)?.label || "未分類";
}

function today() {
  return "2026-06-21";
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
  localStorage.removeItem(STORAGE_KEY);
  state = clone(demoState);
  showToast("MVPデモをリセットしました。");
  render();
});

render();
