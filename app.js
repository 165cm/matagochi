const STORAGE_KEY = "matagochi-mvp-v1";
const IDB_NAME = "matagochi";
const IDB_STORE = "state";
const API_BASE_URL = (globalThis.MATAGOCHI_API_BASE_URL || "").replace(/\/$/, "");
const SYNC_ROOM_SALT = "matagochi-sync-v1";
const SYNC_MIN_CODE_LENGTH = 6;
const SYNC_DEBOUNCE_MS = 8000;
const SYNC_ROOM_ID_PATTERN = /^[a-f0-9]{64}$/;

const defaultFamily = ["自分"];
const APP_VERSION = "20260926-fetchfix";
const emptyDraft = { sourceServings: null, catalog: null, title: "", videoUrl: "", source: "", author: "", mealType: "dinner", caption: "", note: "" };
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
  { id: "breakfast", label: "朝ごはん", featured: false },
  { id: "lunch", label: "昼ごはん", featured: false },
  { id: "dinner", label: "夜ごはん", featured: true },
  { id: "bento", label: "お弁当", featured: false },
  { id: "side", label: "副菜", featured: false },
  { id: "prep", label: "作り置き", featured: false },
  { id: "snack", label: "おやつ", featured: false },
  { id: "soup", label: "汁物", featured: false }
];

const demoState = {
  view: "today",
  foodProfile: null,
  onboardingDraft: null,
  householdProfile: null,
  mealSlots: {},
  shoppingMarks: {},
  manualShopping: {},
  planLength: 3,
  onboarded: false,
  selectedRecipeId: "r2",
  editingRecipeId: null,
  draftExpanded: true,
  searchText: "",
  mealFilter: "all",
  showAllMealTypes: false,
  servingCount: defaultFamily.length,
  family: [...defaultFamily],
  originalIngredients: [],
  extractedIngredients: [],
  extractedSteps: [],
  fetchStatus: "",
  draftThumbnailUrl: "",
  planOverrides: {},
  shopping: { week: "", checked: {} },
  lastBackupAt: "",
  backupRemindSnoozedAt: "",
  settingsUpdatedAt: "",
  tombstones: { recipes: {}, evaluations: {} },
  me: "",
  requests: {},
  roles: { members: {}, updatedAt: "" },
  memberPrefs: {},
  round: { deadline: "", status: "", lastDeadline: "", updatedAt: "" },
  rhythm: { preset: "", shopTime: "17:00", dismissed: false, updatedAt: "" },
  shopDone: {},
  aisleOverrides: {},
  starterPref: { show: true, asked: false, updatedAt: "" },
  skillProfile: null,
  sync: { code: "", roomId: "", lastSyncAt: "" },
  draft: {
    sourceServings: null,
    catalog: null,
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

let state = null;
let toastTimer = null;
let isCaptionImporting = false;
let sharedRecipeComparison = null;
let imageSession = null;
function getImageSession() { return imageSession ||= new globalThis.RecipeImageSession(); }
let idbAvailable = typeof indexedDB !== "undefined";
let syncTimer = null;
let syncInFlight = false;
let syncQueued = false;
let lastSyncedFingerprint = "";
let syncRuntimeStatus = "";

function ingredient(name, amount, category) {
  return { name, amount, category };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE)) {
        request.result.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRead() {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get("state");
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  }));
}

function idbWrite(serialized) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(serialized, "state");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

function idbClear() {
  if (!idbAvailable) return Promise.resolve();
  return openDatabase().then((db) => new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete("state");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
  })).catch(() => {});
}

async function loadStateAsync() {
  let indexed = null, pending = null;
  try { pending = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch {}
  if (idbAvailable) {
    try { const stored = await idbRead(); if (stored) indexed = JSON.parse(stored); }
    catch { idbAvailable = false; }
  }
  const saved = pending && (!indexed || (pending.savedAtMs || 0) >= (indexed.savedAtMs || 0)) ? pending : indexed;
  if (!saved) return freshState();
  try { return normalizeState(saved); } catch { return freshState(); }
}

function requestPersistentStorage() {
  navigator.storage?.persist?.().catch(() => {});
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

function freshState() {
  return normalizeState({...clone(demoState), recipes: [], evaluations: [], draft: clone(emptyDraft), selectedRecipeId: null});
}

function normalizeState(saved) {
  const base = clone(demoState);
  const family = Array.isArray(saved.family) && saved.family.length ? saved.family : base.family;
  const savedView = saved.view === "ratings" ? "repeat" : saved.view;
  const view = ["today", "register", "playlist", "collection", "recipe", "plan", "shopping", "repeat", "recordDetails", "cooking", "settings", "pantry"].includes(savedView) ? savedView : base.view;
  return {
    ...base,
    ...saved,
    family,
    view,
    onboarded: saved.onboarded ?? true,
    editingRecipeId: null,
    draftExpanded: Boolean(saved.draftExpanded),
    servingCount: normalizeServingCount(saved.servingCount ?? family.length),
    draft: { ...base.draft, ...(saved.draft || {}) },
    draftThumbnailUrl: typeof saved.draftThumbnailUrl === "string" ? saved.draftThumbnailUrl : "",
    foodProfile: saved.foodProfile ? Lifestyle.profile(saved.foodProfile) : null,
    onboardingDraft: saved.onboardingDraft ? Lifestyle.profile(saved.onboardingDraft) : null,
    householdProfile: saved.householdProfile ? {equipment:Lifestyle.profile(saved.householdProfile).equipment,pantry:Lifestyle.profile(saved.householdProfile).pantry,updatedAt:normalizeTimestamp(saved.householdProfile.updatedAt)} : null,
    mealSlots: Lifestyle.normalizeSlots(saved.mealSlots),
    shoppingMarks: normalizeShoppingMarks(saved.shoppingMarks),
    manualShopping: normalizeManualShopping(saved.manualShopping),
    planLength: Number(saved.planLength) === 7 ? 7 : 3,
    planOverrides: normalizePlanOverrides(saved.planOverrides),
    shopping: normalizeShopping(saved.shopping),
    lastBackupAt: normalizeDateInput(saved.lastBackupAt),
    backupRemindSnoozedAt: normalizeDateInput(saved.backupRemindSnoozedAt),
    settingsUpdatedAt: normalizeTimestamp(saved.settingsUpdatedAt),
    tombstones: normalizeTombstones(saved.tombstones),
    sync: normalizeSyncSettings(saved.sync),
    me: typeof saved.me === "string" ? saved.me.slice(0, 20) : "",
    requests: normalizeRequests(saved.requests),
    roles: normalizeRoles(saved.roles),
    memberPrefs: normalizeMemberPrefs(saved.memberPrefs),
    round: normalizeRound(saved.round),
    rhythm: normalizeRhythm(saved.rhythm),
    shopDone: normalizeShopDone(saved.shopDone),
    aisleOverrides: normalizeAisleOverrides(saved.aisleOverrides),
    starterPref: normalizeStarterPref(saved.starterPref),
    skillProfile: normalizeSkillProfile(saved.skillProfile),
    originalIngredients: normalizeIngredientList(saved.originalIngredients || []),
    extractedIngredients: normalizeIngredientList(saved.extractedIngredients || []),
    repeatDraft: normalizeRepeatDraft(saved.repeatDraft || saved.ratingDraft || base.repeatDraft, family),
    recipes: normalizeRecipes(Array.isArray(saved.recipes) ? saved.recipes : base.recipes),
    evaluations: normalizeEvaluations(Array.isArray(saved.evaluations) ? saved.evaluations : base.evaluations, family)
  };
}

function normalizePlanOverrides(overrides) {
  if (!overrides || typeof overrides !== "object") return {};
  return Object.fromEntries(
    Object.entries(overrides).filter(([date, recipeId]) => (
      normalizeDateInput(date) && typeof recipeId === "string" && date >= today()
    ))
  );
}

function normalizeShoppingMarks(raw) {
  return Object.fromEntries(Object.entries(raw || {}).filter(([,v])=>v && ['buy','have','purchased'].includes(v.status)).map(([k,v])=>[k,{status:v.status,signature:String(v.signature||''),updatedAt:normalizeTimestamp(v.updatedAt)}]));
}
function normalizeManualShopping(raw) {
  return Object.fromEntries(Object.entries(raw || {}).filter(([k,v])=>k.startsWith('manual-') && v && typeof v.name==='string').map(([k,v])=>[k,{name:v.name.slice(0,100),amount:String(v.amount||'').slice(0,80),deleted:!!v.deleted,updatedAt:normalizeTimestamp(v.updatedAt)}]));
}

function normalizeShopping(shopping) {
  if (!shopping || typeof shopping !== "object") return { week: "", checked: {} };
  return {
    week: normalizeDateInput(shopping.week),
    checked: shopping.checked && typeof shopping.checked === "object" ? { ...shopping.checked } : {}
  };
}

function normalizeRecipes(recipes) {
  return recipes.map((recipe) => {
    const ingredients = normalizeIngredientList(recipe.ingredients);
    const originalIngredients = normalizeIngredientList(recipe.originalIngredients || recipe.sourceIngredients || ingredients);
    return {
      ...recipe,
      sourceServings: recipe.sourceServings === undefined ? 1 : normalizeSourceServings(recipe.sourceServings),
      ingredients,
      originalIngredients: originalIngredients.length ? originalIngredients : clone(ingredients),
      steps: Array.isArray(recipe.steps) ? recipe.steps.map((step) => String(step || "").trim()).filter(Boolean) : [],
      author: String(recipe.author || "").trim().slice(0, 60)
    };
  });
}

function normalizeIngredientList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ingredient(item?.name || "", item?.amount || "適量", item?.category || "その他"))
    .filter((item) => item.name);
}

function normalizeSourceServings(value) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= 100 ? count : null;
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
    familyRepeatCycles: evaluation.preferencePending ? {} : evaluation.personalPreference ? Object.fromEntries(Object.entries(evaluation.familyRepeatCycles || {}).filter(([name,cycle])=>family.includes(name) && normalizeRepeatCycle(cycle))) : normalizeFamilyRepeatCycles(
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

function normalizeTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : "";
}

function normalizeTombstones(tombstones) {
  // 消したことの記録は半年で掃除する（それ以降に届いた古いバックアップからは復活しうる）
  const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
  const pick = (entries) => {
    if (!entries || typeof entries !== "object") return {};
    return Object.fromEntries(
      Object.entries(entries).filter(([, deletedAt]) => normalizeTimestamp(deletedAt) && deletedAt >= cutoff)
    );
  };
  return { recipes: pick(tombstones?.recipes), evaluations: pick(tombstones?.evaluations) };
}

function normalizeAisleOverrides(raw) {
  const ids = Aisles.AISLES.map(([id]) => id);
  return Object.fromEntries(Object.entries(raw && typeof raw === "object" ? raw : {}).filter(([k, v]) => k && ids.includes(v?.aisle)).map(([k, v]) => [k.slice(0, 60), { aisle: v.aisle, updatedAt: normalizeTimestamp(v.updatedAt) }]));
}

function normalizeSyncSettings(sync) {
  const roomId = typeof sync?.roomId === "string" && SYNC_ROOM_ID_PATTERN.test(sync.roomId) ? sync.roomId : "";
  return {
    code: roomId && typeof sync?.code === "string" ? sync.code : "",
    roomId,
    lastSyncAt: roomId ? normalizeTimestamp(sync?.lastSyncAt) : ""
  };
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

let stateWriteQueue = Promise.resolve();
function saveState({ scheduleSync = true } = {}) {
  state.savedAtMs = Math.max(Date.now(), (state.savedAtMs || 0) + 1);
  const serialized = JSON.stringify(state);
  // A synchronous recovery copy protects the last keystroke on reload before IDB commits.
  let recoverySaved = false;
  try { localStorage.setItem(STORAGE_KEY, serialized); recoverySaved = true; } catch {}
  if (scheduleSync) scheduleAutoSync();
  if (idbAvailable) {
    stateWriteQueue = stateWriteQueue.catch(()=>{}).then(()=>idbWrite(serialized)).then(()=> {
      if (localStorage.getItem(STORAGE_KEY) === serialized) localStorage.removeItem(STORAGE_KEY);
    }).catch(()=>showToast("保存容量が上限に達しました。書き出して整理してください。"));
  } else if (!recoverySaved) showToast("保存できませんでした。書き出して整理してください。");
}

function nowIso() {
  return new Date().toISOString();
}

function touchSettings() {
  state.settingsUpdatedAt = nowIso();
}

function generateId(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function syncEnabled() {
  return Boolean(API_BASE_URL && state?.sync?.roomId);
}

function normalizeSyncCode(code) {
  return String(code || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

async function deriveSyncRoomId(code) {
  const bytes = new TextEncoder().encode(`${SYNC_ROOM_SALT}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// 端末間で共有するのはデータ本体だけ。画面状態や入力中の下書きは端末ごとに残す。
function buildSyncPayload() {
  return {
    version: 1,
    settingsUpdatedAt: state.settingsUpdatedAt || "",
    family: state.family,
    servingCount: getServingCount(),
    recipes: state.recipes,
    evaluations: state.evaluations,
    tombstones: state.tombstones,
    planOverrides: state.planOverrides,
    householdProfile: state.householdProfile,
    mealSlots: state.mealSlots,
    shoppingMarks: state.shoppingMarks,
    manualShopping: state.manualShopping,
    requests: state.requests || {},
    roles: state.roles || { members: {}, updatedAt: "" },
    memberPrefs: state.memberPrefs || {},
    round: state.round || {},
    rhythm: state.rhythm || {},
    shopDone: state.shopDone || {},
    aisleOverrides: state.aisleOverrides || {},
    starterPref: state.starterPref || {}
  };
}

function recipeStamp(recipe) {
  return recipe.updatedAt || recipe.savedAt || "";
}

function evaluationStamp(evaluation) {
  return evaluation.updatedAt || evaluation.cookedAt || "";
}

function mergeSyncPayloads(local, remote) {
  const tombstones = mergeTombstones(local.tombstones, remote.tombstones);
  const recipes = mergeItemsById(local.recipes, remote.recipes, tombstones.recipes, recipeStamp);
  recipes.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")));
  const evaluations = mergeItemsById(local.evaluations, remote.evaluations, tombstones.evaluations, evaluationStamp);
  evaluations.sort((a, b) => evaluationStamp(b).localeCompare(evaluationStamp(a)));
  const settingsSource = (local.settingsUpdatedAt || "") >= (remote.settingsUpdatedAt || "") ? local : remote;
  return {
    version: 1,
    settingsUpdatedAt: settingsSource.settingsUpdatedAt || "",
    family: Array.isArray(settingsSource.family) && settingsSource.family.length ? settingsSource.family : local.family,
    servingCount: settingsSource.servingCount,
    recipes,
    evaluations,
    tombstones,
    planOverrides: { ...(remote.planOverrides || {}), ...(local.planOverrides || {}) },
    householdProfile: Object.values(Lifestyle.mergeMap({household:local.householdProfile || {updatedAt:''}}, {household:remote.householdProfile || {updatedAt:''}}))[0],
    mealSlots: Lifestyle.mergeMap(local.mealSlots, remote.mealSlots),
    shoppingMarks: Lifestyle.mergeMap(local.shoppingMarks, remote.shoppingMarks),
    manualShopping: Lifestyle.mergeMap(local.manualShopping, remote.manualShopping),
    requests: Lifestyle.mergeMap(local.requests, remote.requests),
    roles: (remote.roles?.updatedAt || "") > (local.roles?.updatedAt || "") ? remote.roles : local.roles,
    memberPrefs: Lifestyle.mergeMap(local.memberPrefs, remote.memberPrefs),
    round: (remote.round?.updatedAt || "") > (local.round?.updatedAt || "") ? remote.round : local.round,
    rhythm: (remote.rhythm?.updatedAt || "") > (local.rhythm?.updatedAt || "") ? remote.rhythm : local.rhythm,
    shopDone: { ...(remote.shopDone || {}), ...(local.shopDone || {}) },
    aisleOverrides: Lifestyle.mergeMap(local.aisleOverrides, remote.aisleOverrides),
    starterPref: (remote.starterPref?.updatedAt || "") > (local.starterPref?.updatedAt || "") ? remote.starterPref : local.starterPref
  };
}

function mergeTombstones(local, remote) {
  const merge = (a = {}, b = {}) => {
    const result = { ...a };
    Object.entries(b).forEach(([id, deletedAt]) => {
      if (!result[id] || result[id] < deletedAt) result[id] = deletedAt;
    });
    return result;
  };
  return {
    recipes: merge(local?.recipes, remote?.recipes),
    evaluations: merge(local?.evaluations, remote?.evaluations)
  };
}

function mergeItemsById(localItems, remoteItems, tombstones, stampOf) {
  const byId = new Map();
  [...(Array.isArray(remoteItems) ? remoteItems : []), ...(Array.isArray(localItems) ? localItems : [])].forEach((item) => {
    if (!item?.id) return;
    const existing = byId.get(item.id);
    if (!existing || stampOf(item) >= stampOf(existing)) byId.set(item.id, item);
  });
  return Array.from(byId.values()).filter((item) => {
    const deletedAt = tombstones[item.id];
    // 削除より後に更新された記録だけ復活を許す
    return !deletedAt || stampOf(item) > deletedAt;
  });
}

function applySyncPayload(payload) {
  const family = Array.isArray(payload.family) && payload.family.length ? payload.family : state.family;
  state.family = family;
  state.servingCount = normalizeServingCount(payload.servingCount ?? family.length);
  state.settingsUpdatedAt = normalizeTimestamp(payload.settingsUpdatedAt);
  state.recipes = normalizeRecipes(Array.isArray(payload.recipes) ? payload.recipes : []);
  state.evaluations = normalizeEvaluations(Array.isArray(payload.evaluations) ? payload.evaluations : [], family);
  state.tombstones = normalizeTombstones(payload.tombstones);
  state.planOverrides = normalizePlanOverrides(payload.planOverrides);
  state.mealSlots = Lifestyle.normalizeSlots(payload.mealSlots || state.mealSlots);
  state.shoppingMarks = normalizeShoppingMarks(payload.shoppingMarks || state.shoppingMarks);
  state.manualShopping = normalizeManualShopping(payload.manualShopping || state.manualShopping);
  state.requests = normalizeRequests(payload.requests || state.requests);
  state.roles = normalizeRoles(payload.roles || state.roles);
  state.memberPrefs = normalizeMemberPrefs(payload.memberPrefs || state.memberPrefs);
  state.round = normalizeRound(payload.round || state.round);
  state.rhythm = normalizeRhythm(payload.rhythm || state.rhythm);
  state.shopDone = normalizeShopDone(payload.shopDone || state.shopDone);
  state.aisleOverrides = normalizeAisleOverrides(payload.aisleOverrides || state.aisleOverrides);
  state.starterPref = normalizeStarterPref(payload.starterPref || state.starterPref);
  if (payload.householdProfile) state.householdProfile = {equipment:Lifestyle.profile(payload.householdProfile).equipment,pantry:Lifestyle.profile(payload.householdProfile).pantry,updatedAt:normalizeTimestamp(payload.householdProfile.updatedAt)};
  // Personal preferences/restrictions and the onboarding draft never leave this device via sync.
  state.repeatDraft = normalizeRepeatDraft(state.repeatDraft, family);
  if (state.selectedRecipeId && !recipeById(state.selectedRecipeId)) {
    state.selectedRecipeId = state.recipes[0]?.id || null;
  }
  if (state.editingRecipeId && !recipeById(state.editingRecipeId)) {
    state.editingRecipeId = null;
  }
  Object.keys(state.planOverrides).forEach((date) => {
    if (!recipeById(state.planOverrides[date])) delete state.planOverrides[date];
  });
}

function scheduleAutoSync() {
  if (!syncEnabled()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (!syncEnabled()) return;
    if (JSON.stringify(buildSyncPayload()) === lastSyncedFingerprint) return;
    syncNow({ silent: true });
  }, SYNC_DEBOUNCE_MS);
}

// サーバーの最新を取り込み→マージ→書き戻し。他端末が先に書いた場合(409)は取り直して繰り返す。
async function syncOnce() {
  const roomUrl = `${API_BASE_URL}/api/sync/rooms/${state.sync.roomId}`;
  const response = await fetch(roomUrl);
  if (!response.ok) throw new Error("sync_fetch_failed");
  const remote = await response.json();
  let changedLocal = false;
  let payload = buildSyncPayload();
  if (remote.found) {
    const before = JSON.stringify(payload);
    const merged = mergeSyncPayloads(payload, remote.data || {});
    if (JSON.stringify(merged) !== before) {
      if (state.view === "register") captureDraft();
      applySyncPayload(merged);
      changedLocal = true;
    }
    payload = buildSyncPayload();
    if (JSON.stringify(payload) === JSON.stringify(remote.data)) {
      lastSyncedFingerprint = JSON.stringify(payload);
      return { done: true, changedLocal };
    }
  }
  const putResponse = await fetch(roomUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseRevision: remote.found ? remote.revision : "", data: payload })
  });
  if (putResponse.status === 409) return { done: false, changedLocal };
  if (!putResponse.ok) throw new Error("sync_push_failed");
  lastSyncedFingerprint = JSON.stringify(payload);
  return { done: true, changedLocal };
}

async function syncNow({ silent = false } = {}) {
  if (!syncEnabled()) return false;
  if (syncInFlight) {
    syncQueued = true;
    return false;
  }
  syncInFlight = true;
  let changedLocal = false;
  let succeeded = false;
  try {
    for (let attempt = 0; attempt < 3 && !succeeded; attempt += 1) {
      const result = await syncOnce();
      changedLocal = changedLocal || result.changedLocal;
      succeeded = result.done;
    }
    if (!succeeded) throw new Error("sync_conflict");
    state.sync.lastSyncAt = nowIso();
    syncRuntimeStatus = "";
    saveState({ scheduleSync: false });
    if (!silent) showToast("同期しました。");
  } catch {
    syncRuntimeStatus = "前回の同期に失敗しました。通信環境を確認してください。";
    if (changedLocal) saveState({ scheduleSync: false });
    if (!silent) showToast("同期に失敗しました。通信環境を確認してください。");
  } finally {
    syncInFlight = false;
    if (changedLocal) {
      if (state.view === "register") captureDraft();
      render();
    }
    if (syncQueued) {
      syncQueued = false;
      scheduleAutoSync();
    }
  }
  return succeeded;
}

async function connectSync() {
  const rawCode = document.querySelector("#sync-code")?.value || "";
  const code = normalizeSyncCode(rawCode);
  if (code.length < SYNC_MIN_CODE_LENGTH) {
    showToast(`合言葉は${SYNC_MIN_CODE_LENGTH}文字以上にしてください。`);
    return;
  }
  if (!crypto?.subtle) {
    showToast("この環境では同期機能を使えません。");
    return;
  }
  state.sync = { code: rawCode.trim(), roomId: await deriveSyncRoomId(code), lastSyncAt: "" };
  lastSyncedFingerprint = "";
  saveState({ scheduleSync: false });
  const succeeded = await syncNow({ silent: true });
  if (!succeeded) {
    state.sync = { code: "", roomId: "", lastSyncAt: "" };
    saveState({ scheduleSync: false });
    showToast("同期サーバーに接続できませんでした。時間をおいて試してください。");
    render();
    return;
  }
  showToast("合言葉でつながりました。同じ合言葉の端末とデータがそろいます。");
  render();
}

function disconnectSync() {
  if (!window.confirm("この端末の共有をやめます。データはこの端末に残り、家族の端末にも残ります。よろしいですか？")) return;
  clearTimeout(syncTimer);
  state.sync = { code: "", roomId: "", lastSyncAt: "" };
  lastSyncedFingerprint = "";
  syncRuntimeStatus = "";
  saveState({ scheduleSync: false });
  showToast("共有をやめました。");
  render();
}

function formatSyncTime(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "まだありません";
  return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function applySharedUrlFromLocation() {
  const params = new URLSearchParams(location.search);
  const sharedText = [params.get("url"), params.get("text"), params.get("title")]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (!sharedText) return false;
  history.replaceState(null, "", location.pathname);
  if (!startRecipeFromText(sharedText)) return false;
  state.fetchStatus = "共有からURLを受け取りました。読み取っています…";
  saveState();
  return true;
}
// 共有・コピーされた文章からURLを取り出し、登録画面の下書きにする。
function startRecipeFromText(text) {
  const urlMatch = String(text || "").match(/https?:\/\/\S+/);
  if (!urlMatch) return false;
  const sharedUrl = urlMatch[0];
  const sharedTitle = String(text).replace(sharedUrl, "").replace(/\s+/g, " ").trim();
  if (!state.onboarded) {
    // オンボーディング前の共有はデモデータを持ち込まず、空の状態で始める
    state.recipes = [];
    state.evaluations = [];
    state.selectedRecipeId = null;
    state.repeatDraft = normalizeRepeatDraft({}, state.family);
    state.onboarded = true;
  }
  state.view = "register";
  state.editingRecipeId = null;
  entryMethod = "url";
  state.draft = {
    ...clone(emptyDraft),
    title: "",
    shareTitle: sharedTitle.length >= 2 ? sharedTitle.slice(0, 100) : "",
    videoUrl: sharedUrl,
    source: detectPlatform(sharedUrl).label
  };
  state.draftThumbnailUrl = "";
  state.originalIngredients = [];
  state.extractedIngredients = [];
  state.extractedSteps = [];
  state.draftExpanded = false;
  return true;
}
const isIOSDevice = () => { const n = globalThis.navigator || {}; return /iP(hone|ad|od)/.test(n.userAgent || "") || (n.platform === "MacIntel" && n.maxTouchPoints > 1); };
const isInstalledApp = () => !!globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone === true;
let pasteNotice = "";
// iPhoneは共有メニューにWebアプリを出せないため、「リンクをコピー → ここで貼る」で保存する。
async function pasteRecipeUrl() {
  let text = "", denied = false;
  try { text = await navigator.clipboard.readText(); } catch { denied = true; }
  if (denied || !globalThis.navigator?.clipboard?.readText) {
    // 貼り付けが許可されない端末：URL欄を開いて、長押しで貼ってもらう。
    state.view = "register"; state.editingRecipeId = null; entryMethod = "url";
    state.draft = { ...clone(emptyDraft) }; state.extractedIngredients = []; state.extractedSteps = []; state.draftExpanded = false;
    state.fetchStatus = "この端末ではボタンから貼り付けできませんでした。URL欄を長押しして「ペースト」を選び、「読み取る」を押してください。";
    pasteNotice = "";
    saveState(); render();
    setTimeout(() => document.querySelector("#recipe-url")?.focus(), 60);
    return;
  }
  if (!startRecipeFromText(text)) {
    pasteNotice = "コピーしたURLが見つかりませんでした。SNSで「共有 → リンクをコピー」してから、もう一度押してください。";
    render();
    return;
  }
  pasteNotice = "";
  state.fetchStatus = "コピーしたURLを受け取りました。材料を読み取っています…";
  saveState();
  render();
  globalThis.scrollTo?.({ top: 0, behavior: "instant" });
  setTimeout(() => document.querySelector('[data-action="fetch-caption"]:not([disabled])')?.click(), 60);
}
let saveGuideOpen = null;
function saveGuideSeen() { try { return localStorage.getItem("ripigochi-save-guide") === "seen"; } catch { return false; } }
function renderSaveGuide() {
  if (isViewer()) return "";
  const open = saveGuideOpen ?? !saveGuideSeen();
  const strip = `<div class="save-strip"><button type="button" class="paste-button" data-action="paste-recipe-url">📋 コピーしたURLから保存</button><button type="button" class="text-button save-guide-link" data-action="save-guide" aria-expanded="${open}">${open ? "閉じる" : "保存のしかた"}</button></div>`;
  if (!open) return strip + (pasteNotice ? `<p class="notice small">${escapeHtml(pasteNotice)}</p>` : "");
  const ios = isIOSDevice();
  const steps = ios
    ? ["YouTube・TikTok・Instagramで、動画の<b>「共有」→「リンクをコピー」</b>", "リピごちに戻って <b>📋 コピーしたURLから保存</b>", "材料と作り方を確かめて保存"]
    : isInstalledApp()
      ? ["YouTube・TikTok・Instagramで、動画の<b>「共有」</b>", "一覧から <b>リピごち</b> を選ぶ（「リンクをコピー」→ 📋 でもOK）", "材料と作り方を確かめて保存"]
      : ["YouTube・TikTok・Instagramで、動画の<b>「共有」→「リンクをコピー」</b>", "リピごちに戻って <b>📋 コピーしたURLから保存</b>", "材料と作り方を確かめて保存"];
  const tip = !ios && !isInstalledApp() ? '<p class="save-guide-tip">ブラウザのメニューから「ホーム画面に追加」すると、SNSの共有メニューに<b>リピごち</b>が出ます。</p>' : "";
  return `<section class="save-guide" aria-label="レシピの保存のしかた"><p class="save-guide-title">見つけたレシピ動画を、そのまま保存</p><ol>${steps.map((x) => `<li>${x}</li>`).join("")}</ol>${tip}<div class="save-guide-actions"><button type="button" class="paste-button" data-action="paste-recipe-url">📋 コピーしたURLから保存</button><button type="button" class="text-button" data-action="save-guide-done">わかった</button></div>${pasteNotice ? `<p class="notice small">${escapeHtml(pasteNotice)}</p>` : ""}</section>`;
}

function setView(view) {
  imageSession?.cancel();
  if (imageFeedback?.tone === "pending") imageFeedback = null;
  if (state.view === "register") captureDraft();
  profileEditing = false;
  state.view = view;
  saveState();
  render();
  globalThis.scrollTo?.({top:0,behavior:"instant"});
}

function render() {
  cancelAutoAdvance();
  if (skillQuiz) {
    document.body.classList.add("is-onboarding");
    document.querySelector("#app").innerHTML = renderSkillQuiz();
    bindEvents();
    return;
  }
  if (joinInvite) {
    document.body.classList.add("is-onboarding");
    document.querySelector("#app").innerHTML = renderJoin();
    bindEvents();
    return;
  }
  if (!state.onboarded || profileEditing) {
    renderOnboarding();
    return;
  }
  document.body.classList.remove("is-onboarding");
  document.body.classList.toggle("is-viewer", isViewer());
  if (needsViewerSetup()) {
    document.body.classList.add("is-onboarding");
    document.querySelector("#app").innerHTML = renderViewerSetup();
    bindEvents();
    return;
  }
  if (isViewer() && state.view === "repeat") state.view = "today";

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.setAttribute("aria-current", tab.dataset.view === ({register:"collection",playlist:"collection",recipe:"collection",cooking:"plan",recordDetails:"repeat",pantry:"shopping"}[state.view] || state.view) ? "page" : "false");
    tab.classList.toggle("is-active", tab.dataset.view === ({register:"collection",playlist:"collection",recipe:"collection",cooking:"plan",recordDetails:"repeat",pantry:"shopping"}[state.view] || state.view));
  });

  const views = {
    today: renderToday,
    shopping: renderDailyShopping,
    cooking: renderCooking,
    recordDetails: renderRecordEditor,
    register: renderRecipeEntry,
    playlist: renderPlaylistImport,
    collection: renderCollection,
    recipe: renderRecipeDetail,
    plan: renderDailyPlan,
    repeat: renderReflection,
    settings: renderSettings,
    pantry: renderPantryPage
  };
  if (isViewer()) Object.assign(views, { today: renderViewerToday, plan: renderViewerPlan });
  document.querySelector("#app").innerHTML = views[state.view]();
  placePageChrome();
  bindEvents();
}

// App-bar pattern: the logo on 今日, the page name elsewhere; a page's own buttons sit at the right.
const PAGE_TITLES = { plan: "献立", shopping: "買い物", collection: "レシピ", recipe: "レシピ", register: "レシピを追加", playlist: "まとめて追加", repeat: "ふりかえり", recordDetails: "記録", cooking: "作る", settings: "設定", pantry: "常備品" };
function placePageChrome() {
  const title = state.view === "register" && state.editingRecipeId ? "レシピを編集" : PAGE_TITLES[state.view] || "";
  const el = document.querySelector("#page-title");
  if (el) el.textContent = title;
  document.body.classList.toggle("has-page-title", !!title);
  const slot = document.querySelector("#topbar-actions");
  if (!slot) return;
  slot.innerHTML = "";
  const actions = document.querySelector("#app .page-actions");
  if (actions) slot.appendChild(actions);
}

function renderOnboarding() { renderProfileWizard(); }

let entryMethod = "url";
let imageFeedback = null;

function renderRecipeEntry() {
  const extracted = getDraftIngredients();
  const steps = state.extractedSteps;
  const editing = !!state.editingRecipeId;
  const busy = isCaptionImporting || imageSession?.busy;
  const showDetails = shouldShowDraftDetails() && !isCaptionImporting;
  // 登録済みレシピの編集では「保存方法」は不要。新規だけ、まず取り込み方を選ぶ。
  const entry = editing ? "" : `
    <section class="hero-card register-hero">
      <div class="entry-methods" role="group" aria-label="保存方法">
        ${[["url", "リンク", "SNSの動画"], ["image", "画像", "スクショ"], ["manual", "手入力", "自分のレシピ"]].map(([method, label, hint]) => `<button type="button" data-action="entry-method" data-method="${method}" aria-pressed="${entryMethod === method}" ${busy ? "disabled" : ""}><strong>${label}</strong><small>${hint}</small></button>`).join("")}
      </div>
      <div ${entryMethod === "url" ? "" : "hidden"}>
      <div class="quick-url-row">
        <input id="recipe-url" class="input url-input" value="${escapeAttr(state.draft.videoUrl)}" placeholder="動画のURL（YouTube・TikTok・Instagram）" aria-label="動画のURL">
        <button class="primary-button fetch-button" type="button" data-action="fetch-caption" ${busy ? "disabled" : ""}>${isCaptionImporting ? "読み取り中…" : "読み取る"}</button>
      </div>
      ${state.draft.videoUrl ? "" : '<button type="button" class="text-button paste-inline" data-action="paste-recipe-url">📋 コピーしたURLを貼る</button>'}
      ${playlistAvailable ? '<button class="text-button paste-inline" type="button" data-action="go-view" data-view="playlist">📺 再生リストからまとめて追加</button>' : ""}
      </div>
      ${state.fetchStatus ? `<p class="notice small">${escapeHtml(state.fetchStatus)}</p>` : ""}
    </section>`;
  return `${entry}
    ${!editing && entryMethod === "image" ? renderImageImport() : ""}
    ${showDetails ? `
    <section class="panel entry-detail-panel">
      <input id="recipe-title" class="input title-input" value="${escapeAttr(state.draft.title)}" placeholder="料理名" aria-label="料理名">
      ${state.draft.requiresImageReview ? `<p class="notice">${escapeHtml((state.draft.imageWarnings || []).join(" / ") || "AIは読み違えることがあります。元画像と材料・分量・手順を照合してください。")}</p>
      <label><input id="image-reviewed" type="checkbox" ${state.draft.imageReviewed ? "checked" : ""}> 元画像と材料・分量・手順を確認しました</label>` : ""}
      ${renderSourceServingsPicker()}
      <div class="ingredient-head"><h3>材料 <small class="muted">元レシピの分量のまま</small></h3>
        <span><button class="text-button" type="button" data-action="add-ingredient">＋ 追加</button>${getOriginalIngredients().length ? '<button class="text-button" type="button" data-action="reset-ingredients">取得時に戻す</button>' : ""}</span></div>
      <div class="ingredient-editor-list">
        ${extracted.map((item, index) => renderIngredientEditorRow(item, index)).join("") || '<p class="muted small">＋ 追加 から材料を入れてください。</p>'}
      </div>
      <h3 class="subhead">作り方</h3>
      <textarea id="recipe-steps" class="textarea steps-input" placeholder="1行に1つずつ" aria-label="作り方（1行に1つ）">${escapeHtml(steps.join("\n"))}</textarea>
      <details class="entry-extra"><summary>出典・メモ・本文</summary>
        ${editing ? `<div class="field"><label for="recipe-url">動画のURL</label><input id="recipe-url" class="input" value="${escapeAttr(state.draft.videoUrl)}"></div>` : ""}
        <div class="two-col">
          <div class="field"><label for="recipe-source">動画元</label><input id="recipe-source" class="input" value="${escapeAttr(state.draft.source)}"></div>
          <div class="field"><label for="recipe-author">投稿者・チャンネル</label><input id="recipe-author" class="input" maxlength="60" placeholder="例：〇〇ごはん" value="${escapeAttr(state.draft.author || "")}"></div>
        </div>
        <div class="field"><label>種類</label>${renderMealTypePicker(state.draft.mealType)}</div>
        <div class="field"><label for="recipe-note">自分用メモ</label><input id="recipe-note" class="input" value="${escapeAttr(state.draft.note)}"></div>
        <div class="field"><label for="recipe-caption">動画の説明文</label><textarea id="recipe-caption" class="textarea">${escapeHtml(state.draft.caption)}</textarea>
          <button class="secondary-button" type="button" data-action="extract-caption">説明文から材料・作り方を読み直す</button></div>
      </details>
      ${state.draft.catalog && API_BASE_URL ? `<details class="entry-extra"><summary>共通レシピと比較・抽出ミスを報告</summary><div class="field">
        <label for="correction-reason">抽出ミスの報告理由（好みの変更は報告不要）</label>
        <input id="correction-reason" class="input" value="${escapeAttr(state.draft.correctionReason || '')}" placeholder="例：元動画では小さじ1でした">
        <p class="muted small">送信する内容はレシピ名・材料・手順・元の人数・報告理由です。理由に個人情報を書かないでください。運営が出典を確認してから共通レシピへ反映します。</p>
        <button class="secondary-button" type="button" data-action="report-correction">抽出ミスを報告</button>
        <button class="secondary-button" type="button" data-action="compare-common">共通レシピの最新版と比較</button>
      </div></details>` : ""}
      ${renderCommonComparison()}
    </section>
    <section class="panel ingredient-edit-panel">
      ${renderPlanningFields()}
      <button class="primary-button full-button save-recipe-button" type="button" data-action="save-recipe">${editing ? "更新する" : "このレシピを保存する"}</button>
      ${editing ? `<button class="text-button full-button" type="button" data-action="cancel-edit">編集をやめる</button>` : ""}
    </section>
    ` : ""}
  `;
}

// 元レシピの人数：数字をタップ。読み取れた時はそれを選択済みにし、未確認の時だけ赤で知らせる。
function renderSourceServingsPicker() {
  const n = state.draft.sourceServings;
  const options = [1, 2, 3, 4, 5, 6];
  return `<div class="servings-pick ${n == null ? "is-unknown" : ""}">
    <input id="source-servings" type="hidden" value="${escapeAttr(n ?? "")}">
    <p><b>元のレシピは何人分？</b>${n != null && state.draft.servingsDetected ? '<small>動画から読み取り</small>' : ""}</p>
    <div class="servings-options" role="group" aria-label="元のレシピの人数">${options.map((k) => `<button type="button" class="choice-button" data-action="set-source-servings" data-count="${k}" aria-pressed="${n === k}">${k}</button>`).join("")}<button type="button" class="choice-button" data-action="set-source-servings" data-count="" aria-pressed="${n == null}">不明</button></div>
    ${n == null ? '<p class="servings-warn">わからないと、分量を人数に合わせられません。動画の「材料（◯人分）」を確かめてください。</p>' : ""}
  </div>`;
}

function renderImageImport() {
  const images = imageSession?.images || [];
  const busy = imageSession?.busy || imageSession?.preparing || isCaptionImporting;
  return `<section class="panel image-import-panel">
    <h3>スクリーンショット・画像から取り込む</h3>
    <p class="muted small">材料や作り方が読めるスクショを、1品につき5枚まで。解析時にサーバーとGoogleのAIへ送信します。</p>
    <label for="recipe-images">画像を選ぶ（JPEG・PNG・WebP）</label>
    <input id="recipe-images" type="file" accept="image/jpeg,image/png,image/webp" multiple ${busy ? "disabled" : ""}>
    <label for="recipe-camera">写真を撮る</label>
    <input id="recipe-camera" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" ${busy ? "disabled" : ""}>
    ${imageSession?.preparing ? '<p role="status">画像を縮小しています…</p>' : ""}
    <div class="image-previews">${images.map((image, index) => `<figure>
      <img src="${image.preview}" alt="選択したレシピ画像 ${index + 1}">
      <figcaption>画像 ${index + 1}</figcaption>
      <div class="actions"><button class="secondary-button" type="button" data-action="image-up" data-index="${index}" ${busy || index === 0 ? "disabled" : ""}>前へ</button>
      <button class="secondary-button" type="button" data-action="image-down" data-index="${index}" ${busy || index === images.length - 1 ? "disabled" : ""}>後へ</button>
      <button class="secondary-button" type="button" data-action="image-remove" data-index="${index}" ${busy ? "disabled" : ""}>画像を外す</button></div>
    </figure>`).join("")}</div>
    ${imageFeedback ? `<div class="image-feedback ${imageFeedback.tone}" role="${imageFeedback.tone === "error" ? "alert" : "status"}"><strong>${escapeHtml(imageFeedback.title)}</strong><p>${escapeHtml(imageFeedback.message)}</p>${imageFeedback.code ? `<small>確認コード: ${escapeHtml(imageFeedback.code)}</small>` : ""}</div>` : ""}
    <div class="actions"><button class="primary-button" type="button" data-action="analyze-images" ${busy || !images.length || !API_BASE_URL ? "disabled" : ""}>${imageSession?.busy ? "解析中…" : "画像を解析する"}</button>
    ${imageSession?.busy || imageSession?.preparing ? '<button class="secondary-button" type="button" data-action="cancel-images">キャンセルして手動入力</button>' : ""}
    ${images.length ? '<button class="text-button" type="button" data-action="clear-images">画像をすべて外す</button>' : ""}</div>
    <details class="entry-extra"><summary>画像の扱い・再試行について</summary><p class="muted small">画像や抽出結果は共通レシピに登録しません。元画像はアプリ側で恒久保存しません。キャンセルしても開始済みの解析は続く場合があります。結果を再取得できない場合は重複課金を防ぐため自動再解析を停止します。</p></details>
    ${!API_BASE_URL ? '<p class="notice">画像解析APIが未設定です。手動入力をご利用ください。</p>' : ""}
  </section>`;
}

async function handleRecipeImages(event) {
  captureDraft();
  const files = [...event.target.files];
  if (!files.length) return;
  const session = getImageSession();
  imageFeedback = null;
  const pending = session.add(files);
  render();
  try { await pending; }
  catch (error) { state.fetchStatus = error.message; imageFeedback = {tone:"error",title:"画像を読み込めませんでした",message:error.message}; showToast(error.message); }
  render();
}

function renderCommonComparison() {
  if (!sharedRecipeComparison || sharedRecipeComparison.catalog.id !== state.draft.catalog?.id) return "";
  const common = sharedRecipeComparison;
  const lines = recipe => [recipe.title, `元の人数: ${recipe.sourceServings ?? "未確認"}`,
    ...recipe.ingredients.map(item => `${item.name}: ${item.amount}`), ...recipe.steps];
  const rows = recipeDiff(lines({ ...state.draft, ingredients: state.extractedIngredients, steps: state.extractedSteps }), lines(common));
  const changes = rows.filter(row => row.kind !== "same");
  const renderRows = values => values.map(row => `<li class="diff-line diff-${row.kind}"><span>${{same:"共通",mine:"− 自分だけ",common:"＋ 共通版だけ"}[row.kind]}</span><p>${escapeHtml(row.text)}</p></li>`).join("");
  return `<section class="panel comparison-panel">
    <h3>変わるところを確認</h3><p class="muted small">オレンジは自分の内容、緑は共通版の内容です。</p>
    ${changes.length ? `<ul class="recipe-diff">${renderRows(changes)}</ul>` : '<p class="notice">レシピの内容は同じです。</p>'}
    <details class="entry-extra"><summary>変更のない内容も見る</summary><ul class="recipe-diff">${renderRows(rows)}</ul></details>
    <p class="muted small">共通版で下書きを置き換えます。保存するまでは元のレシピは変わりません。自分用メモは残ります。</p>
    <button class="secondary-button full-button" type="button" data-action="apply-common">共通版を下書きに取り込む</button>
    <button class="text-button" type="button" data-action="dismiss-common">比較を閉じる</button>
  </section>`;
}

// LCS keeps insertions from making all subsequent ingredient lines look changed.
function recipeDiff(mine, common) {
  const lengths = Array.from({length:mine.length + 1}, () => Array(common.length + 1).fill(0));
  for (let i = mine.length - 1; i >= 0; i--) for (let j = common.length - 1; j >= 0; j--)
    lengths[i][j] = mine[i] === common[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const rows = []; let i = 0, j = 0;
  while (i < mine.length || j < common.length) {
    if (i < mine.length && j < common.length && mine[i] === common[j]) { rows.push({kind:"same",text:mine[i++]}); j++; }
    else if (i < mine.length && (j === common.length || lengths[i + 1][j] >= lengths[i][j + 1])) rows.push({kind:"mine",text:mine[i++]});
    else rows.push({kind:"common",text:common[j++]});
  }
  return rows;
}

function shouldShowDraftDetails() {
  return Boolean(
    state.draftExpanded
    || state.editingRecipeId
    || state.draft.title
    || state.draft.caption
    || state.draft.note
    || state.extractedIngredients.length
    || state.extractedSteps.length
  );
}

function getDraftIngredients() {
  return state.extractedIngredients;
}

function getOriginalIngredients() {
  return state.originalIngredients?.length ? state.originalIngredients : [];
}

function renderServingStepper(servingCount) {
  return `
    <div class="serving-controls"><div class="serving-stepper" role="group" aria-label="材料の表示人数">
      <button class="stepper-button" type="button" data-action="adjust-serving" data-delta="-1" aria-label="人数を減らす">−</button>
      <strong>${servingCount}人分</strong>
      <button class="stepper-button" type="button" data-action="adjust-serving" data-delta="1" aria-label="人数を増やす">＋</button>
    </div><div class="serving-presets">
      <button class="secondary-button" type="button" data-action="choose-serving" data-count="1">1人分</button>
      <button class="secondary-button" type="button" data-action="choose-serving" data-count="2">2人分</button>
    </div></div>
  `;
}

function renderIngredientEditorRow(item, index) {
  return `<div class="ingredient-editor-row" data-index="${index}" data-category="${escapeAttr(item.category || "")}">
      <input id="ingredient-name-${index}" class="input ingredient-name-input" data-index="${index}" value="${escapeAttr(item.name)}" placeholder="材料名" aria-label="材料名">
      <input class="input ingredient-amount-select" data-index="${index}" value="${escapeAttr(item.amount)}" placeholder="分量" aria-label="${escapeAttr(item.name)}の分量">
      <button class="ingredient-delete-button" type="button" data-action="remove-ingredient" data-index="${index}" aria-label="${escapeAttr(item.name)}を削除">✕</button>
    </div>`;
}

function renderCollection() {
  const allSaved = getFilteredRecipes({ allMeals: true });
  // Photographed dishes first, so the grid opens with pictures.
  const allStarters = recipeTab === "saved" || recipeTab === "creators" ? [] : starterRecipeList().sort((a, b) => !!STARTER_PHOTOS[b.id] - !!STARTER_PHOTOS[a.id]);
  const pool = [...(recipeTab === "starter" ? [] : allSaved), ...allStarters];
  const saved = allSaved.filter((r) => facetMatch(r));
  const starters = allStarters.filter((r) => facetMatch(r));
  const query = state.searchText.trim();
  const filtering = Object.values(recipeFacets).some(Boolean);
  const shownStarters = recipeTab === "starter" || starterShowAll || query || filtering ? starters : starters.slice(0, 6);
  const tab = (id, label, count) => `<button class="chip-tab" type="button" aria-pressed="${recipeTab === id}" data-action="life-recipe-tab" data-tab="${id}">${label}${count != null ? ` <small>${count}</small>` : ""}</button>`;
  const tiles = [
    ...(recipeTab === "starter" ? [] : saved.map(renderRecipeTile)),
    ...shownStarters.map(renderStarterTile),
  ].join("");
  const empty = query ? renderEmpty("一致するレシピはありません。") : recipeTab === "saved" ? '<p class="muted small">まだ保存したレシピはありません。おすすめの🔖で1タップ保存できます。</p>' : "";
  return `
    ${isViewer() ? '<p class="page-hint">食べたいのは🙋で送ろう</p>' : `<div class="page-actions"><button type="button" class="round-icon round-add" data-action="go-view" data-view="register" aria-label="レシピを追加する"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>`}
    <label class="search-pill"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg><input id="recipe-search" type="search" placeholder="料理名・材料で探す" aria-label="レシピを探す" value="${escapeAttr(state.searchText)}"></label>
    ${renderSaveGuide()}
    ${renderStarterHint()}
    ${isViewer() ? "" : `<div class="chip-tabs" role="group" aria-label="表示するレシピ">${tab("all", "すべて")}${tab("saved", "保存した", state.recipes.length)}${showStarters() ? tab("starter", "おすすめ") : ""}${creatorsIn(allSaved).length ? tab("creators", "投稿者") : ""}</div>`}
    ${recipeTab === "creators" ? renderCreators(allSaved) : `${renderFacets(pool)}
    <section class="recipe-grid">${tiles || (filtering ? '<p class="muted small">この組み合わせの料理はありません。条件をひとつ外してみてください。</p>' : empty)}</section>
    ${recipeTab !== "saved" && shownStarters.length < starters.length ? `<button type="button" class="text-button full-button" data-action="life-starter-more">おすすめをもっと見る（あと${starters.length - shownStarters.length}品）</button>` : ""}`}
    ${playlistAvailable && !isViewer() ? `<section class="add-card">
      <p class="hand">＼ 保存した動画を、まとめて ／</p>
      <button class="secondary-button full-button" type="button" data-action="go-view" data-view="playlist">📺 YouTubeの再生リストから追加</button>
    </section>` : ""}
    ${renderBackupReminder()}
  `;
}

let recipeTab = "all";
// 3 taps: 主食 → 素材 → 気分・作り方 (one choice per row; tap again to clear)
let recipeFacets = { home: "", staple: "", main: "", style: "", author: "" };
// わが家：repeat-aware shortcuts. 投稿者：names saved from YouTube / TikTok (or typed in).
const HOME_FACET = { id: "home", label: "わが家", options: [
  ["loved", "❤ 好き", (r) => Object.values({ ...likedCycles(r), ...recipeRatings(r) }).some((c) => c === "weekly" || c === "tomorrow")],
  ["long", "久しぶり", (r) => /^前回は(\d+)日前$/.test(lastEatenLabel(r)) && Number(lastEatenLabel(r).match(/\d+/)[0]) >= 14],
  ["new", "まだ作ってない", (r) => lastEatenLabel(r) === "はじめて"],
  ["request", "🙋 リクエスト", (r) => !!openRequestFor(r)],
] };
// 投稿者：保存した名前。無ければTikTokのURLにある @アカウント名。
const authorOf = (r) => (r.author || "").trim() || (String(r.videoUrl || "").match(/tiktok\.com\/(@[\w.]+)/i)?.[1] || "");
function sourceOf(r) {
  const u = String(r.videoUrl || "").toLowerCase();
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/instagram\.com/.test(u)) return "instagram";
  return "other";
}
const SOURCE_MARK = { youtube: ["▶", "YouTube"], tiktok: ["♪", "TikTok"], instagram: ["◎", "Instagram"], other: ["✎", "投稿者"] };
function creatorLabel(name, source) {
  const [mark, label] = SOURCE_MARK[source] || SOURCE_MARK.other;
  return `<span class="src-mark src-${source}" role="img" aria-label="${label}">${mark}</span>${escapeHtml(name)}`;
}
function creatorsIn(pool) {
  const map = new Map();
  for (const r of pool) {
    const name = authorOf(r);
    if (!name) continue;
    const c = map.get(name) || { name, source: sourceOf(r), recipes: [] };
    c.recipes.push(r);
    map.set(name, c);
  }
  return [...map.values()].sort((a, b) => b.recipes.length - a.recipes.length || a.name.localeCompare(b.name, "ja"));
}
function renderCreators(pool) {
  const list = creatorsIn(pool);
  if (!list.length) return '<p class="muted small">動画から保存したレシピが増えると、チャンネル・アカウントごとに並びます。</p>';
  return `<section class="creator-list" aria-label="チャンネル・アカウント">${list.map((c) => `<button type="button" class="creator-row" data-action="life-creator" data-name="${escapeAttr(c.name)}"><span class="creator-name">${creatorLabel(c.name, c.source)}</span><span class="creator-thumbs">${c.recipes.slice(0, 3).map((r) => dishTile(r, "creator-thumb")).join("")}</span><small>${c.recipes.length}品</small></button>`).join("")}</section>`;
}
const tagCache = new Map();
function recipeTags(recipe) {
  const key = recipe.id + "|" + (recipe.updatedAt || "");
  if (!tagCache.has(key)) tagCache.set(key, Lifestyle.tags(recipe));
  return tagCache.get(key);
}
function facetMatch(recipe, skip = "") {
  const t = recipeTags(recipe);
  return Object.entries(recipeFacets).every(([facet, value]) => {
    if (facet === skip || !value) return true;
    if (facet === "home") return HOME_FACET.options.find((o) => o[0] === value)?.[2](recipe);
    if (facet === "author") return authorOf(recipe) === value;
    return t.includes(value);
  });
}
function renderFacets(pool) {
  // 投稿者は「投稿者」タブで選ぶ。ここは料理の中身のタグだけ。
  const facets = [HOME_FACET, ...Lifestyle.FACETS];
  const rows = facets.map((f) => {
    const base = pool.filter((r) => facetMatch(r, f.id));
    const chips = f.options.map(([id, label, test]) => {
      const n = base.filter((r) => (test ? test(r) : recipeTags(r).includes(id))).length;
      const on = recipeFacets[f.id] === id;
      if (!n && !on) return "";
      return `<button type="button" class="facet-chip" data-action="life-facet" data-facet="${f.id}" data-value="${escapeAttr(id)}" aria-pressed="${on}">${label}<small>${n}</small></button>`;
    }).join("");
    if (!chips) return "";
    return `<div class="facet-row" data-facet="${f.id}"><span class="facet-label">${f.label}</span><div class="facet-chips" role="group" aria-label="${f.label}">${chips}</div></div>`;
  }).join("");
  const count = pool.filter((r) => facetMatch(r)).length;
  const any = Object.values(recipeFacets).some(Boolean);
  const author = recipeFacets.author ? `<button type="button" class="facet-chip facet-author" data-action="life-facet" data-facet="author" data-value="${escapeAttr(recipeFacets.author)}" aria-pressed="true">${escapeHtml(recipeFacets.author)} ✕</button>` : "";
  const legend = `<p class="facet-legend" aria-hidden="true">${facets.map((f) => `<span data-facet="${f.id}">${f.label}</span>`).join("")}</p>`;
  return `<section class="facets" aria-label="レシピを絞り込む">${author}${rows}${legend}${any ? `<p class="facet-result"><b>${count}品</b><button type="button" class="text-button" data-action="life-facet-clear">条件をクリア</button></p>` : ""}</section>`;
}
function tileMinutes(recipe) {
  return !isViewer() && recipe.planning?.minutes ? `<span class="tile-time">⏱ ${recipe.planning.minutes}分</span>` : "";
}
function renderRecipeTile(recipe) {
  const last = lastEatenLabel(recipe);
  return `
    <article class="recipe-tile recipe-card">
      <button type="button" class="tile-photo" data-action="life-recipe-open" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}のレシピを見る">${dishTile(recipe)}${tileMinutes(recipe)}</button>
      <span class="tile-mark is-saved" aria-label="保存済み"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg></span>
      <button type="button" class="tile-title" data-action="life-recipe-open" data-recipe="${escapeAttr(recipe.id)}">${escapeHtml(recipe.title)}</button>
      ${requestButton(recipe)}
      <div class="tile-foot"><small class="muted">${authorOf(recipe) ? `<span class="tile-creator">${creatorLabel(authorOf(recipe), sourceOf(recipe))}</span>` : escapeHtml(last === "はじめて" ? "まだ作っていない" : last)}</small>
        ${isViewer() ? "" : `<details class="plan-more tile-more"><summary aria-label="${escapeAttr(recipe.title)}のメニュー">⋯</summary><div class="plan-more-menu">
          ${recipe.videoUrl ? `<a class="text-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>` : ""}
          <button class="text-button" type="button" data-action="edit-recipe" data-recipe="${escapeAttr(recipe.id)}">編集</button>
          <button class="text-button" type="button" data-action="life-new-record" data-recipe="${escapeAttr(recipe.id)}">作った記録をつける</button>
          <button class="text-button danger" type="button" data-action="delete-recipe" data-recipe="${escapeAttr(recipe.id)}">削除</button>
        </div></details>`}</div>
    </article>`;
}
function renderStarterTile(recipe) {
  return `
    <article class="recipe-tile is-starter">
      <button type="button" class="tile-photo" data-action="life-recipe-open" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}のレシピを見る">${dishTile(recipe)}${tileMinutes(recipe)}</button>
      ${isViewer() ? "" : `<button type="button" class="tile-mark" data-action="life-save-starter" data-recipe="${escapeAttr(recipe.id)}" aria-label="${escapeAttr(recipe.title)}を保存"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg></button>`}
      <button type="button" class="tile-title" data-action="life-recipe-open" data-recipe="${escapeAttr(recipe.id)}">${escapeHtml(recipe.title)}</button>
      ${requestButton(recipe)}
      ${isViewer() ? "" : `<div class="tile-foot"><small class="muted">おすすめ${recipe.planning?.tastes?.length ? ` · ${escapeHtml(recipe.planning.tastes[0])}` : ""}</small></div>`}
    </article>`;
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

function youtubeVideoId(url) {
  const value = String(url || "");
  const match = value.match(/youtube\.com\/shorts\/([\w-]{6,})/)
    || value.match(/youtu\.be\/([\w-]{6,})/)
    || value.match(/youtube\.com\/watch\?[^#]*v=([\w-]{6,})/);
  return match ? match[1] : "";
}

// Photos for starter recipes (image only; the text is the recipe's own).
const STARTER_PHOTOS = {
  "starter-13": "assets/dishes/teriyaki.webp",
  "starter-02": "assets/dishes/tomato-pasta.webp",
  "starter-28": "assets/dishes/porkkimchi.webp",
  "starter-05": "assets/dishes/kinoko-udon.webp",
  "starter-01": "assets/dishes/tofu-egg.webp",
  "starter-06": "assets/dishes/tomato-cheese.webp",
};
// Split from AI-generated 3x2 sheets (scripts/split-dish-sheet.py); keep in sync with sw.js.
const STARTER_SHEET_PHOTOS = ["03", "04", "07", "08", "09", "10", "11", "12", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38"];
STARTER_SHEET_PHOTOS.forEach((n) => { STARTER_PHOTOS[`starter-${n}`] = `assets/dishes/starter-${n}.webp`; });
function recipeThumbnail(recipe) {
  if (recipe.thumbnailUrl) return recipe.thumbnailUrl;
  const starter = STARTER_PHOTOS[recipe.id] || STARTER_PHOTOS[recipe.starterId];
  if (starter) return starter;
  const videoId = youtubeVideoId(recipe.videoUrl);
  if (videoId) return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return getRecipeEvaluationHistory(recipe.id).find((evaluation) => evaluation.photo)?.photo || "";
}

function renderRecipeThumb(recipe) {
  const thumb = recipeThumbnail(recipe);
  if (!thumb) return "";
  return `
    <a class="recipe-thumb-link" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeAttr(recipe.title)}の動画を開く">
      <img class="recipe-thumb" src="${escapeAttr(thumb)}" alt="" loading="lazy" onerror="this.parentElement.remove()">
    </a>
  `;
}

function renderRecipeCard(recipe) {
  const summary = getRecipeRepeatSummary(recipe.id);
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        ${renderRecipeThumb(recipe)}
        <div>
          <strong>${escapeHtml(recipe.title)}</strong>
          <p class="muted small">${mealLabel(recipe.mealType)} / ${escapeHtml(recipe.source)} / 保存 ${escapeHtml(recipe.savedAt)}</p>
        </div>
        <span class="badge ${summary.badgeClass}">${escapeHtml(summary.badgeLabel)}</span>
      </div>
      <p class="muted small">${escapeHtml(recipe.note)}</p>
      <div class="chip-row">
        ${recipe.ingredients.slice(0, 5).map((item) => renderIngredientChip(item, recipe.sourceServings)).join("")}
      </div>
      <div class="actions">
        ${recipe.videoUrl ? `<a class="primary-button link-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>` : ""}
        <button class="secondary-button" type="button" data-action="record-repeat" data-recipe="${escapeAttr(recipe.id)}">食事の記録</button>
      </div>
      <div class="actions">
        <button class="secondary-button" type="button" data-action="edit-recipe" data-recipe="${escapeAttr(recipe.id)}">編集</button>
        <button class="secondary-button danger" type="button" data-action="delete-recipe" data-recipe="${escapeAttr(recipe.id)}">削除</button>
      </div>
    </article>
  `;
}

function renderIngredientChip(item, sourceServings) {
  return `<span class="chip">${escapeHtml(item.name)} ${escapeHtml(displayIngredientAmount(item, sourceServings))}</span>`;
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
          <p>夜ごはんを1日1品、また食べたい周期から提案します。</p>
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

    ${renderShoppingList()}

    <section class="panel">
      <div class="section-head">
        <div>
          <h3>食べ頃候補</h3>
          <p>夜ごはんの一品を、また食べたい順に表示します。</p>
        </div>
      </div>
      <div class="recipe-list">
        ${getMealCandidates().slice(0, 8).map(renderCandidateCard).join("") || renderEmpty("夜ごはんのレシピを保存すると候補が表示されます。")}
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
          <span class="slot-meta">夜ごはんのレシピを追加してください</span>
        </div>
      </div>
    `;
  }

  const { recipe, summary, reason } = day.candidate;
  const isToday = day.date === today();
  const hasHistory = getRecipeEvaluationHistory(recipe.id).length > 0;
  return `
    <div class="day-row">
      <div class="day-label">${escapeHtml(day.label)}</div>
      <div class="slot ${day.pinned ? "is-pinned" : ""}">
        <span class="slot-meal">${escapeHtml(day.dateLabel)} / ${escapeHtml(mealLabel(recipe.mealType))}${day.pinned ? " / 差し替え済み" : ""}</span>
        <strong class="slot-title">${escapeHtml(recipe.title)}</strong>
        <span class="slot-meta">${escapeHtml(summary.badgeLabel)}・${escapeHtml(reason)}</span>
        <div class="slot-actions">
          ${isToday ? `<button class="secondary-button slot-button" type="button" data-action="${hasHistory ? "quick-record" : "record-repeat"}" data-recipe="${escapeAttr(recipe.id)}">作った！</button>` : ""}
          <button class="text-button slot-button" type="button" data-action="swap-plan-day" data-date="${escapeAttr(day.date)}">差し替え</button>
          ${day.pinned ? `<button class="text-button slot-button" type="button" data-action="reset-plan-day" data-date="${escapeAttr(day.date)}">自動にもどす</button>` : ""}
        </div>
      </div>
    </div>
  `;
}

function shoppingWeekKey() {
  const offset = (new Date(dateValue(today())).getDay() + 6) % 7;
  return addDays(today(), -offset);
}

function getShoppingChecks() {
  if (state.shopping?.week !== shoppingWeekKey()) {
    state.shopping = { week: shoppingWeekKey(), checked: {} };
  }
  return state.shopping;
}

function buildShoppingList() { return dailyShopping(); }

function combineAmounts(amounts) {
  const parsedList = amounts.map((amount) => parseAmountParts(amount));
  const first = parsedList[0];
  if (first && parsedList.every((parts) => parts && parts.unit === first.unit && parts.prefix === first.prefix)) {
    const total = parsedList.reduce((sum, parts) => sum + parts.value, 0);
    return formatAmountFromParts(first, total);
  }
  return uniqueValues(amounts).join(" + ");
}

function renderShoppingList() {
  const items = buildShoppingList();
  if (!items.length) {
    return `
      <section class="panel">
        <div class="section-head">
          <div>
            <h3>買い物リスト</h3>
            <p>献立候補ができると、材料をまとめてここに出します。</p>
          </div>
        </div>
        ${renderEmpty("今週の候補がまだありません。")}
      </section>
    `;
  }
  const checks = getShoppingChecks();
  const remaining = items.filter((item) => !checks.checked[item.name]).length;
  let lastCategory = "";
  const rows = items.map((item) => {
    const heading = item.category !== lastCategory ? `<p class="shopping-category">${escapeHtml(item.category)}</p>` : "";
    lastCategory = item.category;
    const checked = Boolean(checks.checked[item.name]);
    return `
      ${heading}
      <label class="shopping-item ${checked ? "is-checked" : ""}">
        <input type="checkbox" class="shopping-check" data-name="${escapeAttr(item.name)}" ${checked ? "checked" : ""}>
        <span class="shopping-name">${escapeHtml(item.name)}</span>
        <span class="shopping-amount">${escapeHtml(item.amount)}</span>
      </label>
    `;
  }).join("");
  return `
    <section class="panel shopping-panel">
      <div class="section-head">
        <div>
          <h3>買い物リスト</h3>
          <p>今週の献立候補の材料を${getServingCount()}人分でまとめました。</p>
        </div>
        <span class="badge ${remaining ? "" : "hot"}">残り${remaining}品</span>
      </div>
      <div class="shopping-list">${rows}</div>
      <div class="actions">
        <button class="secondary-button" type="button" data-action="copy-shopping">リストをコピー</button>
        <button class="secondary-button" type="button" data-action="share-shopping">共有する</button>
      </div>
    </section>
  `;
}

function shoppingListText() {
  const items = dailyShopping().filter(item=>item.status==='buy');
  return items.length ? [`買い物リスト（リピごち ${formatDate(today())}）`,...items.map(item=>`・${item.name} ${item.amount}`)].join('\n') : '';
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
}

function renderCandidateCard(candidate) {
  const { recipe, summary, reason } = candidate;
  const hasHistory = getRecipeEvaluationHistory(recipe.id).length > 0;
  return `
    <article class="recipe-card">
      <div class="recipe-top">
        ${renderRecipeThumb(recipe)}
        <div>
          <strong>${escapeHtml(recipe.title)}</strong>
          <p class="muted small">${escapeHtml(reason)}</p>
        </div>
        <span class="badge ${summary.badgeClass}">${escapeHtml(summary.badgeLabel)}</span>
      </div>
      <p class="muted small">${escapeHtml(recipe.note)}</p>
      <div class="actions">
        <button class="secondary-button" type="button" data-action="${hasHistory ? "quick-record" : "record-repeat"}" data-recipe="${escapeAttr(recipe.id)}">${hasHistory ? "作った！" : "食事の記録"}</button>
        ${recipe.videoUrl ? `<a class="primary-button link-button" href="${escapeAttr(recipe.videoUrl)}" target="_blank" rel="noreferrer">動画を開く</a>` : ""}
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
          <input id="repeat-cooked-at" class="input" type="date" ${editingEvaluationId.startsWith("meal-") ? "readonly" : ""} value="${escapeAttr(state.repeatDraft.cookedAt || today())}">
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
        <button class="primary-button full-button" type="button" data-action="save-repeat">食事の記録を保存</button>
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
            ${history.slice(0, 5).map(renderEvaluationCard).join("") || renderEmpty("まだ食事の記録がありません。")}
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
      <div class="repeat-choice-wrap" role="group" aria-label="${name}の次に食べたい頃">
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
  const recipe = recipeById(recipeId);
  const photo = getRecipeEvaluationHistory(recipeId).find((evaluation) => evaluation.photo)?.photo
    || (recipe ? recipeThumbnail(recipe) : "");
  return photo
    ? `<img class="repeat-thumb" src="${escapeAttr(photo)}" alt="料理写真" loading="lazy" onerror="this.outerHTML='<span class=&quot;repeat-thumb is-empty&quot;>写真</span>'">`
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

// 設定：1行ずつ「項目｜今の設定」を並べ、タップしたものだけ開く（開くのは1つずつ）。
let settingsOpen = "";
function settingRow(id, icon, label, summary, body) {
  return `<details class="setting-row" id="setting-${id}" name="settings" ${settingsOpen === id ? "open" : ""}><summary><span class="setting-icon" aria-hidden="true">${icon}</span><span class="setting-text"><b>${label}</b><small>${escapeHtml(summary)}</small></span><i aria-hidden="true">›</i></summary><div class="setting-body">${body}</div></details>`;
}
function openSetting(id) {
  settingsOpen = id;
  render();
  document.querySelector(`#setting-${id}`)?.scrollIntoView({ block: "start" });
}

function renderSettings() {
  if (isViewer()) return `
    ${renderSharePanel()}
    <section class="panel settings-food"><h2>わたしの設定</h2>
      <p class="muted small">食べられないもの：${escapeHtml(memberPrefs().restrictions.join("・") || "なし")}</p>
      <button class="secondary-button full-button" type="button" data-action="life-viewer-redo">食べられないもの・好きなものを変える</button>
    </section>`;
  const p = dailyProfile();
  const sp = skillProfile();
  const leave = [...p.restrictions, ...p.dislikes];
  return `
    <section class="settings-list" aria-label="設定">
    ${settingRow("food", "🍽️", "食生活", `${getServingCount()}人分・平日${p.weekdayMinutes ? `${p.weekdayMinutes}分` : "未指定"}${leave.length ? `・${leave.slice(0, 3).join("、")}${leave.length > 3 ? " ほか" : ""}を除く` : ""}`, `<div class="settings-row"><span>人数</span><div class="settings-stepper"><button class="plan-icon" type="button" data-action="adjust-serving" data-delta="-1" aria-label="1人減らす" ${getServingCount() <= 1 ? "disabled" : ""}>−</button><strong aria-live="polite">${getServingCount()}人分</strong><button class="plan-icon" type="button" data-action="adjust-serving" data-delta="1" aria-label="1人増やす" ${getServingCount() >= 2 ? "disabled" : ""}>＋</button></div></div>
      ${(() => { const p = dailyProfile(); return `<dl class="planning-summary"><div><dt>平日の時間</dt><dd>${p.weekdayMinutes ? `${p.weekdayMinutes}分以内` : "未指定"}</dd></div><div><dt>食べられない</dt><dd>${escapeHtml(p.restrictions.join("・") || "未指定")}</dd></div><div><dt>苦手</dt><dd>${escapeHtml(p.dislikes.join("・") || "未指定")}</dd></div></dl>`; })()}
      <button class="primary-button full-button" data-action="life-profile">${state.onboardingDraft ? "設定の続きをする" : "好み・器具・常備品も変更する"}</button><button class="secondary-button full-button" data-action="life-pantry-open">🫙 常備品だけ変える</button><p class="muted small">材料は元レシピの人数から、この人数分に換算します。同期するのは器具・常備品・確定した献立・買い物で、食材制限と好みは共有しません。</p>`)}
    ${settingRow("rhythm", "🗓", "献立のリズム", rhythmOn() ? `${RHYTHMS[state.rhythm.preset].label}・買い物${state.rhythm.shopTime}` : "未設定", renderRhythmSettings())}
    ${isViewer() ? "" : settingRow("skill", "🔪", "料理スキル", sp ? `${Skills.stars(sp.level)} ${SKILL_TYPES[sp.level].name}・${sp.growth === "grow" ? "レベルアップ" : "ルーティン"}` : "未診断", renderSkillSettings())}
    ${isViewer() ? "" : settingRow("starters", "🍳", "おすすめレシピ", showStarters() ? "使う" : "使わない（自分のレシピだけ）", renderStarterSettings())}
    ${settingRow("share", "👫", "ふたりで使う", syncEnabled() ? `${state.family.join("・")}でつながっています` : "まだつながっていません", renderSharePanel() + (syncEnabled() ? "" : renderSyncPanel()))}
    ${settingRow("family", "👪", "家族メンバー", `${state.family.join("・")}（${state.family.length}人）`, `<div class="member-list">
        ${state.family.map((name, index) => `
          <div class="member-row">
            <input class="input member-name" data-index="${index}" value="${escapeAttr(name)}" aria-label="メンバー名">
            <button class="secondary-button danger" type="button" data-action="remove-member" data-index="${index}" ${state.family.length <= 1 ? "disabled" : ""}>削除</button>
          </div>
        `).join("")}
      </div>
      <button class="secondary-button full-button" type="button" data-action="add-member">メンバーを追加</button>`)}
    ${settingRow("backup", "💾", "バックアップ", `前回の書き出し：${state.lastBackupAt ? formatDate(state.lastBackupAt) : "まだありません"}`, `<p class="notice">この端末のブラウザにだけ保存されています。書き出したファイルを保管しておくと、別の端末や再インストール後に読み込んで復元できます。</p>
      <p class="muted small">前回の書き出し: ${state.lastBackupAt ? formatDate(state.lastBackupAt) : "まだありません"}</p>
      <div class="actions">
        <button class="primary-button" type="button" data-action="export-data">書き出す</button>
        <button class="secondary-button" type="button" data-action="import-data">読み込む</button>
      </div>
      <input id="import-file" type="file" accept="application/json,.json" hidden>`)}
    ${settingRow("reset", "⚠️", "全件削除", "レシピ・記録を消す／使い直す", `<button class="secondary-button danger full-button" type="button" data-action="reset-all-data">レシピと食事の記録を全件削除</button>
      <button class="secondary-button danger full-button" type="button" data-action="reset-everything">はじめから使い直す（全データ削除）</button>`)}
    </section>
    <p class="app-version">リピごち 版 ${APP_VERSION}</p>
  `;
}

// 以前からの「合言葉」でつなぐ方法。招待リンクと同じ同期ルームを使う。
function renderSyncPanel() {
  if (!API_BASE_URL) return "";
  return `
    <details class="panel legacy-sync">
      <summary>合言葉でつなぐ（以前の方法）</summary>
      <div class="field">
        <label for="sync-code">家族の合言葉（${SYNC_MIN_CODE_LENGTH}文字以上）</label>
        <input id="sync-code" class="input" type="text" placeholder="例: たなかけ・ごはん・2026" autocomplete="off">
      </div>
      <button class="secondary-button full-button" type="button" data-action="sync-connect">この合言葉でつなぐ</button>
      <p class="notice">合言葉を知っている人はだれでもこのデータを見たり変えたりできます。推測されにくい合言葉にしてください。</p>
    </details>`;
}

function bindEvents() {
  document.querySelectorAll("details.setting-row").forEach((el) => el.addEventListener("toggle", () => {
    const id = el.id.replace("setting-", "");
    if (el.open) {
      settingsOpen = id;
      document.querySelectorAll("details.setting-row[open]").forEach((other) => { if (other !== el) other.open = false; });
    } else if (settingsOpen === id) settingsOpen = "";
  }));
  bindDailyEvents();
  bindPlaylistEvents();
  document.querySelectorAll('.ingredient-name-input, #recipe-steps').forEach(input=>input.addEventListener('input',()=> {
    const checkbox=document.querySelector('#planning-verified'); if(checkbox)checkbox.checked=false;
    const conditions=document.querySelector('#planning-confirmed'); if(conditions)conditions.checked=false;
    if(state.draft.planning) { state.draft.planning.ingredientsVerified=false; state.draft.planning.conditionsConfirmed=false; }
  }));

  document.querySelectorAll("#recipe-url, #recipe-title, #recipe-source, #recipe-caption, #recipe-note, #recipe-steps, #source-servings, .ingredient-name-input, .ingredient-amount-select, .ingredient-category-input").forEach(input => {
    input.addEventListener("input", () => {
      // Keep edits made during image decoding/network work before its completion renders.
      if (imageSession?.busy || imageSession?.preparing) captureDraft();
    });
  });
  document.querySelector("#recipe-images")?.addEventListener("change", handleRecipeImages);
  document.querySelector("#recipe-camera")?.addEventListener("change", handleRecipeImages);
  document.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", handleAction);
  });

  const search = document.querySelector("#recipe-search");
  const applySearch = () => {
    const caret = search.selectionStart;
    state.searchText = search.value;
    saveState();
    render();
    const next = document.querySelector("#recipe-search");
    next?.focus();
    next?.setSelectionRange(caret, caret);
  };
  // Re-rendering mid-composition would break Japanese input; wait for the IME to commit.
  search?.addEventListener("input", (event) => { if (!event.isComposing) applySearch(); });
  search?.addEventListener("compositionend", applySearch);

  document.querySelector("#serving-count")?.addEventListener("change", (event) => {
    state.servingCount = normalizeServingCount(event.target.value);
    touchSettings();
    saveState();
    render();
  });

  document.querySelectorAll(".ingredient-name-input, .ingredient-amount-select, .ingredient-category-input, #source-servings").forEach((input) => {
    input.addEventListener("change", () => {
      captureDraft();
      state.draftExpanded = true;
      saveState();
      render();
    });
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

  document.querySelectorAll(".shopping-check").forEach((input) => {
    input.addEventListener("change", (event) => {
      const checks = getShoppingChecks();
      const name = event.target.dataset.name;
      if (event.target.checked) {
        checks.checked[name] = true;
      } else {
        delete checks.checked[name];
      }
      saveState();
      render();
    });
  });
}

async function handleAction(event) {
  cancelAutoAdvance();
  let { action } = event.currentTarget.dataset;
  const saveUnreviewed = action === "save-recipe-unreviewed";
  if (saveUnreviewed) action = "save-recipe";
  if (viewerBlocked(action)) return;
  if (handleDailyAction(action, event.currentTarget.dataset)) return;
  if (action === "paste-recipe-url") { await pasteRecipeUrl(); return; }
  if (action === "set-source-servings") { captureDraft(); const n = Number(event.currentTarget.dataset.count); state.draft.sourceServings = Number.isInteger(n) && n > 0 ? n : null; state.draft.servingsDetected = false; saveState(); render(); return; }
  if (action === "save-guide") { saveGuideOpen = !(saveGuideOpen ?? !saveGuideSeen()); render(); return; }
  if (action === "save-guide-done") { try { localStorage.setItem("ripigochi-save-guide", "seen"); } catch {} saveGuideOpen = false; render(); return; }
  if (handlePlaylistAction(action, event.currentTarget.dataset)) return;

  if (["image-up", "image-down", "image-remove", "clear-images", "cancel-images"].includes(action)) {
    captureDraft();
    const session = getImageSession();
    const index = Number(event.currentTarget.dataset.index);
    if (action === "image-up") session.move(index, -1);
    if (action === "image-down") session.move(index, 1);
    if (action === "image-remove") session.remove(index);
    if (action === "clear-images") { session.clear(); imageFeedback = null; }
    if (action === "cancel-images") { imageFeedback = {tone:"error",title:"受け取りを中止しました",message:"画像を見ながら手入力できます。"}; session.cancel(); state.draftExpanded = true; state.fetchStatus = "画像解析の受け取りを中止しました。画像を見ながら手動入力できます。"; }
    saveState(); render(); return;
  }
  if (action === "analyze-images") {
    captureDraft();
    if (isCaptionImporting || imageSession?.busy) return;
    const session = getImageSession();
    if (session.busy || session.preparing) return;
    const originalDraft = JSON.stringify([state.draft, state.extractedIngredients, state.extractedSteps]);
    const operationVersion = session.version;
    const originalUrl = state.draft.videoUrl;
    const editingId = state.editingRecipeId;
    const pending = session.analyze(API_BASE_URL);
    imageFeedback = {tone:"pending",title:"レシピを読み取っています…",message:"通常は数十秒かかります。この画面でお待ちください。"};
    state.fetchStatus = "画像を解析しています。送信後もキャンセルして手動入力できます。";
    render();
    try {
      const result = await pending;
      if (!result || state.view !== "register" || state.editingRecipeId !== editingId) return;
      captureDraft();
      if (JSON.stringify([state.draft, state.extractedIngredients, state.extractedSteps]) !== originalDraft) {
        state.fetchStatus = "解析中に入力が変更されたため、結果の上書きを止めました。同じ画像で再取得できます。";
        imageFeedback = {tone:"error",title:"入力内容を保護しました",message:state.fetchStatus};
        return;
      }
      captureDraft();
      if (state.draft.videoUrl !== originalUrl) return;
      state.draft = { ...state.draft, title: result.title || state.draft.title, catalog: null, sourceServings: result.sourceServings,
        planning: undefined, source: state.draft.videoUrl ? detectPlatform(state.draft.videoUrl).label : "画像から取り込み", requiresImageReview: true, imageReviewed: false, imageWarnings: result.warnings || [] };
      state.originalIngredients = clone(result.ingredients);
      state.extractedIngredients = clone(result.ingredients);
      state.extractedSteps = [...result.steps];
      state.draftExpanded = true;
      state.fetchStatus = result.cacheHit ? "直前の画像解析結果を再利用しました。元画像と照合して保存してください。" : "画像から下書きを作りました。元画像と照合して保存してください。";
      imageFeedback = {tone:"success",title:"読み取り完了",message:"下の材料・作り方を確認し、最後に保存してください。"};
      saveState();
    } catch (error) {
      if (state.view === "register" && state.editingRecipeId === editingId && state.draft.videoUrl === originalUrl && session.version === operationVersion) {
        captureDraft();
        state.fetchStatus = error.name === "AbortError" ? "受け取りを中止しました。同じ画像で再試行するか手動入力をご利用ください。" : error.message;
        imageFeedback = {tone:"error",title:"読み取りを完了できませんでした",message:state.fetchStatus || "通信を確認して、もう一度お試しください。",code:error.code || ""};
        state.draftExpanded = true; saveState();
      }
    } finally { render(); document.querySelector(".image-feedback")?.scrollIntoView?.({block:"nearest"}); }
    return;
  }
  if (["go-view", "edit-recipe", "cancel-edit", "start-empty", "start-demo"].includes(action)) { imageSession?.cancel(); imageFeedback = null; }


  if (action === "start-demo") {
    state = clone(demoState);
    state.extractedIngredients = parseIngredients(state.draft.caption);
      detectDraftServings();
    state.originalIngredients = clone(state.extractedIngredients);
    state.extractedSteps = parseCookingSteps(state.draft.caption);
    state.onboarded = true;
    state.view = "register";
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
    state.draftExpanded = false;
    state.repeatDraft = normalizeRepeatDraft({}, state.family);
    state.originalIngredients = [];
    state.extractedIngredients = [];
    state.extractedSteps = [];
    saveState();
    showToast("空の状態ではじめます。");
    render();
    return;
  }

  if (action === "extract-caption") {
    captureDraft();
    state.draftExpanded = true;
    state.extractedIngredients = parseIngredients(state.draft.caption);
      detectDraftServings();
    state.originalIngredients = clone(state.extractedIngredients);
    state.extractedSteps = parseCookingSteps(state.draft.caption);
    saveState();
    showToast("材料と調理方法を抽出しました。");
    render();
  }

  if (action === "fetch-caption") {
    captureDraft();
    state.draftExpanded = true;
    if (isCaptionImporting || imageSession?.busy) return;

    const platform = detectPlatform(state.draft.videoUrl);

    if (isTikTokPlatform(platform)) {
      isCaptionImporting = true;
      state.fetchStatus = "TikTokの動画情報を取得しています。";
      saveState();
      render();
      try {
        const preview = await fetchTikTokPreview(state.draft.videoUrl);
        // TikTokの「title」は説明文の全文。本文として読み取り、料理名は1行目から作る。
        if (preview.title && !state.draft.caption) state.draft.caption = preview.title;
        state.draft.title = tiktokTitle(preview.title) || state.draft.title || state.draft.shareTitle || "";
        if (preview.videoUrl) state.draft.videoUrl = preview.videoUrl;
        state.draft.source = "TikTok";
        state.draft.author = state.draft.author || preview.author.slice(0, 60);
        state.draftThumbnailUrl = preview.thumbnailUrl || "";
        state.fetchStatus = "TikTokの説明文から読み取りました。材料と作り方を確かめてください（説明文に材料がない動画もあります）。";
        showToast("動画情報を取得しました。");
      } catch {
        state.draft.source = platform.label;
        state.draft.title = state.draft.title || state.draft.shareTitle || "";
        state.fetchStatus = "TikTokの動画情報を取得できませんでした。キャプションを貼り付けて材料メモを作れます。";
        showToast("URL取得に失敗しました。");
      }
      state.extractedIngredients = parseIngredients(state.draft.caption);
      detectDraftServings();
      state.originalIngredients = clone(state.extractedIngredients);
      state.extractedSteps = parseCookingSteps(state.draft.caption);
      isCaptionImporting = false;
      saveState();
      render();
      return;
    }

    if (!API_BASE_URL || !isYouTubePlatform(platform)) {
      const result = prepareCaptionImport(state.draft.videoUrl);
      state.draft.source = result.platform.label;
      state.draft.title = state.draft.title || state.draft.shareTitle || "";
      state.fetchStatus = result.message;
      state.extractedIngredients = parseIngredients(state.draft.caption);
      detectDraftServings();
      state.originalIngredients = clone(state.extractedIngredients);
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

    const importingUrl = state.draft.videoUrl;
    try {
      const result = await importRecipeFromYouTube(importingUrl);
      if (state.draft.videoUrl !== importingUrl) return;
      applyImportedRecipe(result);
      state.fetchStatus = result.analysis?.ok === false
        ? "AIでの読み取りに失敗したため、説明文から直接読み取りました。材料と作り方を確かめてください。"
        : `${result.cacheHit ? "分析済みのレシピを再利用しました。" : "YouTubeの説明文から材料メモを作成しました。"} 保存前に内容を確認してください。`;
      saveState();
      showToast("材料メモを作成しました。");
    } catch (error) {
      if (state.draft.videoUrl !== importingUrl) return;
      state.fetchStatus = `${error.message || "読み取れませんでした。"} 動画の説明文をコピーして「出典・メモ・本文」の説明文欄に貼ると、そこから読み取れます。`;
      state.extractedIngredients = parseIngredients(state.draft.caption);
      detectDraftServings();
      state.originalIngredients = clone(state.extractedIngredients);
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
    state.draftExpanded = true;
    state.draft.mealType = event.currentTarget.dataset.meal || "dinner";
    saveState();
    render();
  }

  if (action === "toggle-meal-types") {
    captureDraft();
    state.draftExpanded = true;
    state.showAllMealTypes = !state.showAllMealTypes;
    saveState();
    render();
  }

  if (action === "filter-meal") {
    state.mealFilter = event.currentTarget.dataset.meal || "all";
    saveState();
    render();
  }

  if (action === "entry-method") {
    if (isCaptionImporting || imageSession?.busy || imageSession?.preparing) return;
    captureDraft();
    entryMethod = event.currentTarget.dataset.method;
    if (entryMethod === "manual") state.draftExpanded = true;
    render();
    return;
  }

  if (action === "show-manual-entry") {
    captureDraft();
    state.draftExpanded = true;
    state.fetchStatus = state.draft.videoUrl ? "URL取得できない場合は、キャプションを貼り付けて材料メモを作れます。" : "";
    saveState();
    render();
    return;
  }

  if (action === "go-view") {
    if (state.view === "register") captureDraft();
    setView(event.currentTarget.dataset.view || "collection");
    return;
  }

  if (action === "choose-serving") {
    if (state.view === "register") captureDraft();
    state.servingCount = Number(event.currentTarget.dataset.count);
    touchSettings(); saveState(); render(); return;
  }

  if (action === "adjust-serving") {
    if (state.view === "register") captureDraft();
    const delta = Number.parseInt(event.currentTarget.dataset.delta, 10) || 0;
    state.servingCount = normalizeServingCount(getServingCount() + delta);
    touchSettings();
    saveState();
    render();
    return;
  }

  if (action === "set-family-serving") {
    if (state.view === "register") captureDraft();
    state.servingCount = normalizeServingCount(state.family.length);
    touchSettings();
    saveState();
    render();
    return;
  }

  if (action === "add-ingredient") {
    captureDraft();
    state.draftExpanded = true;
    state.extractedIngredients.push(ingredient("新しい材料", "適量", "その他"));
    saveState();
    render();
    return;
  }

  if (action === "remove-ingredient") {
    captureDraft();
    const index = Number.parseInt(event.currentTarget.dataset.index, 10);
    if (Number.isInteger(index)) {
      state.extractedIngredients.splice(index, 1);
      saveState();
      render();
    }
    return;
  }

  if (action === "reset-ingredients") {
    captureDraft();
    const original = getOriginalIngredients();
    state.extractedIngredients = clone(original.length ? original : parseIngredients(state.draft.caption));
    state.draftExpanded = true;
    saveState();
    showToast("取得時の材料に戻しました。");
    render();
    return;
  }

  if (action === "adjust-ingredient-amount") {
    captureDraft();
    const index = Number.parseInt(event.currentTarget.dataset.index, 10);
    const delta = Number.parseInt(event.currentTarget.dataset.delta, 10) || 0;
    if (state.extractedIngredients[index]) {
      state.extractedIngredients[index].amount = adjustAmount(state.extractedIngredients[index].amount, delta);
      saveState();
      render();
    }
    return;
  }

  if (action === "compare-common") {
    captureDraft();
    if (!state.draft.catalog) return;
    const catalogId = state.draft.catalog.id;
    event.currentTarget.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/api/recipes/${encodeURIComponent(catalogId)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "取得できませんでした。");
      if (state.draft.catalog?.id === catalogId) sharedRecipeComparison = result;
    } catch (error) { showToast(error.message); }
    render(); return;
  }
  if (action === "dismiss-common") {
    captureDraft(); sharedRecipeComparison = null; render(); return;
  }
  if (action === "apply-common") {
    captureDraft();
    if (sharedRecipeComparison?.catalog.id !== state.draft.catalog?.id) return;
    const common = sharedRecipeComparison;
    state.draft = { ...state.draft, title: common.title, sourceServings: common.sourceServings, catalog: clone(common.catalog) };
    state.originalIngredients = clone(common.ingredients);
    state.extractedIngredients = clone(common.ingredients);
    state.extractedSteps = [...common.steps];
    sharedRecipeComparison = null;
    saveState(); render(); return;
  }

  if (action === "report-correction") {
    captureDraft();
    saveState();
    if (!state.draft.catalog || !state.draft.correctionReason?.trim()) {
      showToast("抽出ミスの理由を入力してください。");
      return;
    }
    event.currentTarget.disabled = true;
    try {
      const response = await fetch(`${API_BASE_URL}/api/recipes/corrections`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catalogId: state.draft.catalog.id, baseRevision: state.draft.catalog.revision,
          reason: state.draft.correctionReason,
          recipe: { title: state.draft.title, ingredients: state.extractedIngredients, steps: state.extractedSteps, sourceServings: state.draft.sourceServings } })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message || "報告できませんでした。");
      state.fetchStatus = "修正提案を送りました。自分の変更は「保存する／更新する」で保存してください。";
      state.draft.correctionReason = "";
      saveState();
      showToast("修正提案を送りました。");
    } catch (error) { showToast(error.message); }
    finally { render(); }
    return;
  }

  if (action === "save-recipe") {
    captureDraft();
    if (state.draft.requiresImageReview && !state.draft.imageReviewed) {
      showToast("元画像と材料・分量・手順を確認し、確認済みにチェックしてください。");
      return;
    }
    if (!state.draft.title) {
      showToast("レシピ名を入力してください。");
      render();
      return;
    }
    if (!state.draft.planning) state.draft.planning = Lifestyle.suggestPlanning({ingredients:state.extractedIngredients,steps:state.extractedSteps});
    const planning = state.draft.planning;
    if (state.draft.mealType === "dinner" && !saveUnreviewed &&
        (!planning?.conditionsConfirmed || !planning.minutes || planning.easy == null ||
         !(planning.equipment?.length || planning.noEquipment) || !planning.ingredientsVerified)) {
      showToast("献立に使う時間・器具・食材区分を確認してください。未確認のまま保存することもできます。");
      document.querySelector("#planning-panel")?.scrollIntoView({block:"start",behavior:"smooth"});
      return;
    }
    if (saveUnreviewed && planning) { planning.conditionsConfirmed=false; planning.ingredientsVerified=false; }
    const ingredients = clone(state.extractedIngredients);
    const originalIngredients = state.originalIngredients.length ? clone(state.originalIngredients) : clone(ingredients);
    const steps = state.extractedSteps;
    const existing = state.editingRecipeId ? recipeById(state.editingRecipeId) : null;
    if (existing) {
      existing.sourceServings = state.draft.sourceServings;
      existing.catalog = state.draft.catalog;
      existing.title = state.draft.title;
      existing.videoUrl = state.draft.videoUrl;
      existing.source = state.draft.source;
      existing.mealType = state.draft.mealType;
      existing.caption = state.draft.caption;
      existing.ingredients = ingredients;
      existing.originalIngredients = originalIngredients;
      existing.steps = steps;
      existing.tags = [mealLabel(state.draft.mealType), state.draft.source, "動画"];
      existing.author = state.draft.author || "";
      existing.note = state.draft.note;
      existing.planning = state.draft.planning || undefined;
      existing.thumbnailUrl = state.draftThumbnailUrl || existing.thumbnailUrl || "";
      existing.updatedAt = nowIso();
      state.selectedRecipeId = existing.id;
      state.editingRecipeId = null;
      state.draft = clone(emptyDraft);
      state.draftThumbnailUrl = "";
      state.draftExpanded = false;
      state.originalIngredients = [];
      state.extractedIngredients = [];
      state.extractedSteps = [];
      state.fetchStatus = "";
      state.view = reviewReturnDate ? "plan" : recipeDetailId === existing.id ? "recipe" : "collection";
      if (reviewReturnDate) { swapDate = reviewReturnDate; reviewReturnDate = ""; }
      imageSession?.clear();
      imageFeedback = null;
      saveState();
      showToast("レシピを更新しました。");
      render();
    } else {
      const recipe = {
        id: generateId("r"),
        sourceServings: state.draft.sourceServings,
        catalog: state.draft.catalog,
        title: state.draft.title,
        videoUrl: state.draft.videoUrl,
        source: state.draft.source,
        author: state.draft.author || "",
        mealType: state.draft.mealType,
        caption: state.draft.caption,
        ingredients,
        originalIngredients,
        steps,
        tags: [mealLabel(state.draft.mealType), state.draft.source, "動画"],
        savedAt: today(),
        updatedAt: nowIso(),
        note: state.draft.note,
        planning: state.draft.planning || undefined,
        thumbnailUrl: state.draftThumbnailUrl || ""
      };
      state.recipes.unshift(recipe);
      state.selectedRecipeId = recipe.id;
      state.draft = clone(emptyDraft);
      state.draftThumbnailUrl = "";
      state.draftExpanded = false;
      state.originalIngredients = [];
      state.extractedIngredients = [];
      state.extractedSteps = [];
      state.fetchStatus = "";
      state.view = "collection";
      imageSession?.clear();
      imageFeedback = null;
      saveState();
      showToast("レシピを保存しました。");
      render();
    }
  }

  if (action === "edit-recipe") {
    const recipe = recipeById(event.currentTarget.dataset.recipe);
    if (recipe) {
      sharedRecipeComparison = null;
      state.editingRecipeId = recipe.id;
      state.draft = {
        sourceServings: recipe.sourceServings === undefined ? 1 : recipe.sourceServings,
        catalog: recipe.catalog || null,
        title: recipe.title,
        videoUrl: recipe.videoUrl,
        source: recipe.source,
        author: recipe.author || "",
        mealType: recipe.mealType,
        caption: recipe.caption,
        note: recipe.note,
        planning: recipe.planning ? clone(recipe.planning) : undefined
      };
      state.originalIngredients = clone(recipe.originalIngredients || recipe.ingredients);
      state.extractedIngredients = clone(recipe.ingredients);
      state.extractedSteps = [...recipe.steps];
      state.draftThumbnailUrl = recipe.thumbnailUrl || "";
      state.fetchStatus = "";
      state.draftExpanded = true;
      state.view = "register";
      saveState();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  if (action === "cancel-edit") {
    reviewReturnDate = "";
    state.editingRecipeId = null;
    state.draft = clone(emptyDraft);
    state.draftThumbnailUrl = "";
    state.draftExpanded = false;
    state.originalIngredients = [];
    state.extractedIngredients = [];
    state.extractedSteps = [];
    state.fetchStatus = "";
    saveState();
    render();
  }

  if (action === "delete-recipe") {
    const id = event.currentTarget.dataset.recipe;
    const recipe = recipeById(id);
    if (recipe && window.confirm(`「${recipe.title}」を削除します。関連する食事の記録も消えます。${syncEnabled() ? "共有中の家族の端末からも消えます。" : ""}よろしいですか？`)) {
      const deletedAt = nowIso();
      state.tombstones.recipes[id] = deletedAt;
      state.evaluations.filter((item) => item.recipeId === id).forEach((item) => {
        state.tombstones.evaluations[item.id] = deletedAt;
      });
      state.recipes = state.recipes.filter((item) => item.id !== id);
      state.evaluations = state.evaluations.filter((item) => item.recipeId !== id);
      Object.keys(state.planOverrides).forEach((date) => {
        if (state.planOverrides[date] === id) delete state.planOverrides[date];
      });
      if (state.editingRecipeId === id) state.editingRecipeId = null;
      if (state.view === "recipe") state.view = "collection";
      if (state.selectedRecipeId === id) state.selectedRecipeId = state.recipes[0]?.id || null;
      saveState();
      showToast("レシピを削除しました。");
      render();
    }
    return;
  }

  if (action === "delete-evaluation") {
    const id = event.currentTarget.dataset.eval;
    if (window.confirm("この食事の記録を削除します。よろしいですか？")) {
      state.tombstones.evaluations[id] = nowIso();
      const date = id.startsWith('meal-') ? id.slice(5) : '';
      if (state.mealSlots[date]?.status === 'cooked') state.mealSlots[date] = {...state.mealSlots[date],status:'confirmed',updatedAt:nowIso()};
      state.evaluations = state.evaluations.filter((item) => item.id !== id);
      saveState();
      showToast("食事の記録を削除しました。");
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

  if (action === "sync-connect") {
    await connectSync();
    return;
  }

  if (action === "sync-now") {
    await syncNow();
    render();
    return;
  }

  if (action === "sync-disconnect") {
    disconnectSync();
    return;
  }

  if (action === "import-data") {
    document.querySelector("#import-file")?.click();
    return;
  }

  if (action === "reset-all-data") {
    resetAllUserData();
    return;
  }

  if (action === "reset-everything") {
    resetEverything();
    return;
  }

  if (action === "snooze-backup") {
    state.backupRemindSnoozedAt = today();
    saveState();
    showToast("2週間後にもう一度お知らせします。");
    render();
    return;
  }

  if (action === "swap-plan-day") {
    swapPlanDay(event.currentTarget.dataset.date);
    return;
  }

  if (action === "reset-plan-day") {
    delete state.planOverrides[event.currentTarget.dataset.date];
    saveState();
    render();
    return;
  }

  if (action === "quick-record") {
    quickRecordRepeat(event.currentTarget.dataset.recipe);
    return;
  }

  if (action === "copy-shopping" || action === "share-shopping") {
    const text = shoppingListText();
    if (!text) {
      showToast("買うものはすべてチェック済みです。");
      return;
    }
    if (action === "share-shopping" && navigator.share) {
      navigator.share({ text }).catch(() => {});
      return;
    }
    const copied = await copyTextToClipboard(text);
    showToast(copied ? "買い物リストをコピーしました。" : "コピーできませんでした。");
    return;
  }

  if (action === "record-repeat") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || state.repeatDraft.mealType || "dinner";
    applyRepeatDraftDefaults(state.selectedRecipeId);
    state.view = "recordDetails";
    saveState();
    render();
  }

  if (action === "select-repeat-recipe") {
    state.selectedRecipeId = event.currentTarget.dataset.recipe;
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || state.repeatDraft.mealType || "dinner";
    applyRepeatDraftDefaults(state.selectedRecipeId);
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
      id: generateId("e"),
      recipeId: state.selectedRecipeId,
      cookedAt: state.repeatDraft.cookedAt || today(),
      mealType: state.repeatDraft.mealType || recipeById(state.selectedRecipeId)?.mealType || "dinner",
      familyRepeatCycles: { ...state.repeatDraft.familyRepeatCycles },
      memo: state.repeatDraft.memo,
      photo: state.repeatDraft.photo || "",
      photoLabel: "食卓写真",
      updatedAt: nowIso()
    };
    const dailyEntry = state.evaluations.find(e=>e.id===editingEvaluationId) || state.evaluations.find(e=>e.id===`meal-${evaluation.cookedAt}` && e.recipeId===evaluation.recipeId);
    if (dailyEntry) Object.assign(dailyEntry, evaluation, {id:dailyEntry.id, preferencePending:false, personalPreference:false});
    else state.evaluations.unshift(evaluation);
    editingEvaluationId = "";
    state.repeatDraft.photo = "";
    state.repeatDraft.cookedAt = today();
    state.repeatDraft.mealType = recipeById(state.selectedRecipeId)?.mealType || "dinner";
    saveState();
    showToast("食事の記録を保存しました。");
    render();
  }

  if (action === "remove-photo") {
    state.repeatDraft.photo = "";
    saveState();
    render();
  }
}

function captureDraft() {
  capturePlanningFields();
  const urlInput = document.querySelector("#recipe-url");
  const currentUrl = urlInput ? urlInput.value.trim() : state.draft.videoUrl || "";
  const platform = detectPlatform(currentUrl);
  captureIngredientEdits();
  const stepsInput = document.querySelector("#recipe-steps");
  if (stepsInput) state.extractedSteps = stepsInput.value.split("\n").map((line) => line.trim()).filter(Boolean);
  const sourceInput = document.querySelector("#source-servings");
  const count = Number(sourceInput?.value);
  state.draft = {
    ...state.draft,
    catalog: currentUrl === state.draft.videoUrl ? state.draft.catalog : null,
    correctionReason: document.querySelector("#correction-reason")?.value || "",
    imageReviewed: document.querySelector("#image-reviewed")?.checked || false,
    sourceServings: sourceInput ? (Number.isInteger(count) && count > 0 && count <= 100 ? count : null) : state.draft.sourceServings,
    title: document.querySelector("#recipe-title") ? document.querySelector("#recipe-title").value.trim() : state.draft.title || "",
    videoUrl: currentUrl,
    source: document.querySelector("#recipe-source")?.value.trim() || platform.label,
    author: (document.querySelector("#recipe-author")?.value ?? state.draft.author ?? "").trim().slice(0, 60),
    mealType: state.draft.mealType || "dinner",
    caption: document.querySelector("#recipe-caption") ? document.querySelector("#recipe-caption").value.trim() : state.draft.caption || "",
    note: document.querySelector("#recipe-note") ? document.querySelector("#recipe-note").value.trim() : state.draft.note || ""
  };
}

function captureIngredientEdits() {
  const rows = Array.from(document.querySelectorAll(".ingredient-editor-row"));
  if (!rows.length) return;
  state.extractedIngredients = rows
    .map((row) => {
      const name = row.querySelector(".ingredient-name-input")?.value.trim() || "";
      const amount = row.querySelector(".ingredient-amount-select")?.value.trim() || "適量";
      const category = row.dataset.category || "その他";
      return ingredient(name, amount, category);
    })
    .filter((item) => item.name);
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
  touchSettings();
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
  state.evaluations.forEach((evaluation) => {
    if (evaluation.familyRepeatCycles && Object.prototype.hasOwnProperty.call(evaluation.familyRepeatCycles, previous)) {
      move(evaluation.familyRepeatCycles);
      // 改名を他端末の食事の記録にも同期で反映させる
      evaluation.updatedAt = nowIso();
    }
  });
}

function addMember() {
  const wasFamilySized = getServingCount() === state.family.length;
  let index = state.family.length + 1;
  let name = `メンバー${index}`;
  while (state.family.includes(name)) {
    index += 1;
    name = `メンバー${index}`;
  }
  state.family.push(name);
  if (wasFamilySized) state.servingCount = normalizeServingCount(state.family.length);
  state.repeatDraft.familyRepeatCycles[name] = defaultRepeatCycle;
  touchSettings();
  saveState();
  showToast("メンバーを追加しました。名前を編集してください。");
  render();
}

function removeMember(index) {
  if (state.family.length <= 1) return;
  const name = state.family[index];
  if (!window.confirm(`「${name}」を家族メンバーから外します。よろしいですか？`)) return;
  const wasFamilySized = getServingCount() === state.family.length;
  state.family.splice(index, 1);
  if (wasFamilySized) state.servingCount = normalizeServingCount(state.family.length);
  delete state.repeatDraft.familyRepeatCycles[name];
  touchSettings();
  saveState();
  showToast("メンバーを削除しました。");
  render();
}

function applyRepeatDraftDefaults(recipeId) {
  const latest = getRecipeEvaluationHistory(recipeId)[0];
  if (!latest) return;
  state.repeatDraft.familyRepeatCycles = normalizeFamilyRepeatCycles(latest.familyRepeatCycles, null, state.family);
}

function quickRecordRepeat(recipeId) {
  const recipe = recipeById(recipeId);
  if (!recipe) return;
  const latest = getRecipeEvaluationHistory(recipeId)[0];
  if (!latest) {
    state.selectedRecipeId = recipeId;
    state.repeatDraft.mealType = recipe.mealType || "dinner";
    state.view = "repeat";
    saveState();
    showToast("初回は家族の周期を選んで記録してください。");
    render();
    return;
  }
  state.evaluations.unshift({
    id: generateId("e"),
    recipeId,
    cookedAt: today(),
    mealType: normalizeRepeatMealType(recipe.mealType) || "dinner",
    familyRepeatCycles: normalizeFamilyRepeatCycles(latest.familyRepeatCycles, null, state.family),
    memo: "",
    photo: "",
    photoLabel: "食卓写真",
    updatedAt: nowIso()
  });
  saveState();
  showToast("前回の周期のまま記録しました。変更はリピ画面からできます。");
  render();
}

function swapPlanDay(date) {
  if (!date) return;
  const candidates = getMealCandidates();
  if (candidates.length < 2) {
    showToast("差し替えられる候補がまだありません。");
    return;
  }
  const plan = buildWeeklyPlan();
  const day = plan.find((item) => item.date === date);
  const currentId = day?.candidate?.recipe.id || "";
  // 自動配置の日は再構築で並び直せるので、差し替え済みの日のレシピだけ重複を避ける
  const pinnedElsewhere = new Set(
    plan.filter((item) => item.date !== date && item.pinned && item.candidate).map((item) => item.candidate.recipe.id)
  );
  const startIndex = Math.max(candidates.findIndex((item) => item.recipe.id === currentId), 0);
  for (let step = 1; step <= candidates.length; step += 1) {
    const next = candidates[(startIndex + step) % candidates.length];
    if (next.recipe.id !== currentId && !pinnedElsewhere.has(next.recipe.id)) {
      state.planOverrides[date] = next.recipe.id;
      saveState();
      showToast(`${formatDate(date)}を「${next.recipe.title}」に差し替えました。`);
      render();
      return;
    }
  }
  showToast("差し替えられる候補がまだありません。");
}

function resetEverything() {
  const message = `この端末に保存したレシピ、食事の記録、家族メンバー設定をすべて削除して、最初の状態に戻します。${syncEnabled() ? "共有はこの端末だけ解除され、家族の端末のデータは残ります。" : ""}よろしいですか？`;
  if (!window.confirm(message)) return;
  clearTimeout(syncTimer);
  lastSyncedFingerprint = "";
  syncRuntimeStatus = "";
  localStorage.removeItem(STORAGE_KEY);
  stateWriteQueue.catch(()=>{}).then(()=>idbClear()).then(() => {
    localStorage.removeItem(STORAGE_KEY);
    state = freshState();
    state.onboarded = false;
    profileEditing = false;
    showToast("データをリセットしました。");
    render();
  });
}

function resetAllUserData() {
  const message = `保存したレシピ、材料メモ、食事の記録、料理写真をすべて削除します。家族メンバー設定は残ります。${syncEnabled() ? "共有中の家族の端末からも消えます。" : ""}よろしいですか？`;
  if (!window.confirm(message)) return;
  const deletedAt = nowIso();
  state.recipes.forEach((recipe) => {
    state.tombstones.recipes[recipe.id] = deletedAt;
  });
  state.evaluations.forEach((evaluation) => {
    state.tombstones.evaluations[evaluation.id] = deletedAt;
  });
  state.recipes = [];
  state.evaluations = [];
  state.selectedRecipeId = null;
  state.editingRecipeId = null;
  state.searchText = "";
  state.mealFilter = "all";
  state.showAllMealTypes = false;
  state.draft = clone(emptyDraft);
  state.repeatDraft = normalizeRepeatDraft({}, state.family);
  state.draftExpanded = false;
  state.originalIngredients = [];
  state.extractedIngredients = [];
  state.extractedSteps = [];
  state.draftThumbnailUrl = "";
  Object.keys(state.mealSlots || {}).forEach(date=>state.mealSlots[date]={date,status:'removed',updatedAt:deletedAt});
  Object.keys(state.manualShopping || {}).forEach(id=>state.manualShopping[id]={...state.manualShopping[id],deleted:true,updatedAt:deletedAt});
  state.shoppingMarks = {};
  state.planOverrides = {};
  state.shopping = { week: "", checked: {} };
  state.fetchStatus = "";
  state.view = "collection";
  state.onboarded = true;
  saveState();
  showToast("レシピと食事の記録を全件削除しました。");
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
  state.lastBackupAt = today();
  saveState();
  showToast("データを書き出しました。");
  render();
}

function backupReminderDue() {
  if (!state.recipes.length && !state.evaluations.length) return false;
  // 同期済みならサーバー側にもコピーがあるので、バックアップ催促は控える
  if (syncEnabled() && state.sync.lastSyncAt) return false;
  const reference = [state.lastBackupAt, state.backupRemindSnoozedAt].filter(Boolean).sort().pop();
  if (!reference) return state.recipes.length + state.evaluations.length >= 3;
  return daysBetween(reference, today()) >= 14;
}

function renderBackupReminder() {
  if (!backupReminderDue()) return "";
  const lastText = state.lastBackupAt
    ? `前回の書き出しは${formatDate(state.lastBackupAt)}です。`
    : "まだ一度も書き出していません。";
  return `
    <section class="panel backup-reminder">
      <div class="section-head">
        <div>
          <h3>バックアップのおすすめ</h3>
          <p>データはこの端末にだけ保存されています。${lastText}</p>
        </div>
      </div>
      <div class="actions">
        <button class="primary-button" type="button" data-action="export-data">いま書き出す</button>
        <button class="secondary-button" type="button" data-action="snooze-backup">2週間後に再通知</button>
      </div>
    </section>
  `;
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

function getFilteredRecipes({ allMeals = false } = {}) {
  const query = state.searchText.trim().toLowerCase();
  return state.recipes.filter((recipe) => {
    if (!allMeals && !matchesMealFilter(recipe)) return false;
    if (!query) return true;
    const haystack = [
      recipe.title,
      recipe.caption,
      recipe.note,
      recipe.source,
      recipe.author,
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
  const categoryOf = (name) => categories.find(([, pattern]) => pattern.test(name))?.[0] || "その他";
  // 1行1材料の説明文（「鶏むね肉 500g」「塩 ひとつまみ」）は行ごとに読む。「作り方」以降は材料ではない。
  const AMOUNT = /(?:大さじ|小さじ|カップ)\s*[\d０-９./／½]+(?:\s*[〜~]\s*[\d./]+)?|[\d０-９./／]+\s*(?:kg|g|ml|mL|cc|L|個|本|袋|枚|丁|缶|玉|膳|切れ|片|かけ|合|束|房|株|パック|杯|尾|匹|cm)(?:\s*[（(][^）)]*[）)])?|少々|適量|ひとつまみ|一つまみ|お好みで|お好み|半玉|半分|1\/2個/;
  const lines = String(caption || "").split(/\n/).map((l) => l.trim());
  const stop = lines.findIndex((l) => /^[【\[■●◆<＜]?\s*(?:作り方|手順|つくり方)/.test(l));
  const byLine = (stop >= 0 ? lines.slice(0, stop) : lines).map((line) => {
    const clean = line.replace(/^[・\-－*●○◎■□◆◇☆★✓✔︎]+\s*/, "").replace(/^[A-ZＡ-Ｚa-z]\s*[.．:：]\s*/, "").trim();
    if (!clean || /^[【\[]?\s*(?:材料|用意するもの)/.test(clean) || /人分|人前/.test(clean) && !AMOUNT.test(clean.replace(/\d+\s*(?:人分|人前)/, ""))) return null;
    const m = clean.match(new RegExp(`^(.+?)[\\s　:：…･・\\.]*(${AMOUNT.source})\\s*$`));
    if (!m) return null;
    const name = m[1].replace(/[\s　:：…]+$/, "").trim();
    return name && name.length <= 30 ? ingredient(name, m[2].trim(), categoryOf(name)) : null;
  }).filter(Boolean);
  if (byLine.length >= 2) return byLine;
  const matches = caption.match(/[^、。,.]+?(?:\s|　)?(?:\d+[個本袋枚丁缶玉膳切れgml]+|半玉|適量|大さじ\d+|小さじ\d+)/g) || [];
  const parsed = matches.map((match) => {
    const cleaned = match.trim().replace(/^と/, "");
    const amountMatch = cleaned.match(/(\d+[個本袋枚丁缶玉膳切れgml]+|半玉|適量|大さじ\d+|小さじ\d+)$/);
    const amount = amountMatch ? amountMatch[0] : "適量";
    const name = cleaned.replace(amount, "").trim().replace(/^[【\[]?(?:材料|用意するもの)[】\]]?\s*(?:[（(][^）)]*[）)])?\s*[:：]?\s*/, "").trim();
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
  const numbered = normalized.match(/(?:^|。)\s*(?:\d+\.|[①②③④⑤⑥⑦⑧⑨]|\d+[）)])\s*[^。]+/g)?.map((x) => x.replace(/^。?\s*/, ""));
  const candidates = numbered?.length ? numbered : normalized.split(/[。.!！]/);
  const cookingWords = /切|炒|焼|煮|蒸|混ぜ|和え|のせ|かけ|包|入れ|加え|ゆで|冷や|仕上げ|レンジ|チン|盛/;
  // 番号つきの手順はそのまま採用（「焼く」のような短い手順も落とさない）。
  return candidates
    .map((step) => step.replace(/^(?:\d+\.|[①②③④⑤⑥]|\d+[）)])\s*/, "").trim())
    .filter((step) => numbered?.length ? step.length >= 2 : step.length >= 5 && cookingWords.test(step))
    .slice(0, 12);
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

function isTikTokPlatform(platform) {
  return platform.label === "TikTok";
}

function tiktokTitle(text) {
  const line = String(text || "").split(/\n/).map((l) => l.replace(/#[^\s#]+/g, "").trim()).find(Boolean) || "";
  return line.length > 40 ? line.slice(0, 40) + "…" : line;
}
// 応答が返らないまま「読み取り中」で止まらないよう、上限時間を決めて知らせる。
async function fetchWithTimeout(url, options = {}, ms = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new Error(error?.name === "AbortError" ? "読み取りに時間がかかっています。通信のよい所でもう一度お試しください。" : "サーバーに接続できませんでした。通信状態を確かめて、もう一度お試しください。");
  } finally {
    clearTimeout(timer);
  }
}
async function fetchTikTokPreview(videoUrl) {
  const endpoint = API_BASE_URL
    ? `${API_BASE_URL}/api/oembed/tiktok?url=${encodeURIComponent(videoUrl)}`
    : `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  const response = await fetchWithTimeout(endpoint, {}, 20_000);
  if (!response.ok) throw new Error("TikTokの動画情報を取得できませんでした。");
  const data = await response.json();
  return {
    title: String(data.title || "").trim(),
    thumbnailUrl: String(data.thumbnailUrl || data.thumbnail_url || "").trim(),
    author: String(data.author || data.author_name || "").trim(),
    videoUrl: String(data.videoUrl || "").trim()
  };
}

async function importRecipeFromYouTube(videoUrl) {
  const response = await fetchWithTimeout(`${API_BASE_URL}/api/import/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: videoUrl })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${data.error?.message || "YouTubeの説明文を取得できませんでした。"}${data.error?.code ? `（${data.error.code}）` : `（HTTP ${response.status}）`}`);
  }
  return data;
}

// 「材料（2人分）」「2人前」などを本文・タイトルから読み取る。読めなければ未確認のまま。
function detectSourceServings(text) {
  const m = String(text || "").normalize("NFKC").match(/(\d{1,2})\s*(?:[〜~-]\s*\d{1,2}\s*)?(?:人分|人前|人份|servings?)/i);
  const n = m ? Number(m[1]) : NaN;
  return Number.isInteger(n) && n > 0 && n <= 20 ? n : null;
}
function detectDraftServings() {
  if (state.draft.sourceServings != null) return;
  const n = detectSourceServings(`${state.draft.caption || ""} ${state.draft.title || ""}`);
  if (n) { state.draft.sourceServings = n; state.draft.servingsDetected = true; }
}

function applyImportedRecipe(result) {
  const platform = detectPlatform(state.draft.videoUrl);
  state.draft = {
    ...state.draft,
    planning: undefined,
    requiresImageReview: false,
    imageReviewed: false,
    imageWarnings: [],
    sourceServings: result.sourceServings ?? detectSourceServings(`${result.caption || ""} ${result.title || ""}`),
    servingsDetected: result.sourceServings == null && !!detectSourceServings(`${result.caption || ""} ${result.title || ""}`),
    catalog: result.catalog || null,
    title: result.title || state.draft.title || state.draft.shareTitle || "",
    videoUrl: result.videoUrl || state.draft.videoUrl,
    source: result.source || platform.label,
    author: state.draft.author || String(result.channelTitle || result.author || "").trim().slice(0, 60),
    caption: result.caption || state.draft.caption,
    note: state.draft.note || result.note || ""
  };
  // AI分析が失敗しても説明文は届く。材料はアプリ側で説明文から読み取る。
  const imported = normalizeImportedIngredients(result.ingredients);
  state.originalIngredients = imported.length ? imported : parseIngredients(state.draft.caption || "");
  state.extractedIngredients = clone(state.originalIngredients);
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

function displayIngredientAmount(item, sourceServings) {
  return scaleAmountForServings(item.amount, getServingCount(), sourceServings);
}

function buildAmountOptions(amount) {
  const current = String(amount || "適量").trim() || "適量";
  const parsed = parseAmountParts(current);
  if (!parsed) {
    return uniqueValues([current, "少々", "適量", "1個", "2個", "3個"]);
  }
  const values = [];
  for (let i = -3; i <= 5; i += 1) {
    const nextValue = parsed.value + parsed.step * i;
    if (nextValue > 0) values.push(formatAmountFromParts(parsed, nextValue));
  }
  values.push(current);
  return uniqueValues(values);
}

function adjustAmount(amount, delta) {
  const current = String(amount || "適量").trim() || "適量";
  const parsed = parseAmountParts(current);
  if (!parsed) return delta > 0 ? "1個" : current;
  return formatAmountFromParts(parsed, Math.max(parsed.step, parsed.value + parsed.step * delta));
}

function parseAmountParts(amount) {
  const value = String(amount || "").trim();
  const halfMatch = value.match(/^半(.+)$/);
  if (halfMatch) {
    return { prefix: "", value: 0.5, unit: halfMatch[1], step: 0.5 };
  }
  const match = value.match(/^(大さじ|小さじ)?(\d+(?:\.\d+)?)(.*)$/);
  if (!match) return null;
  const prefix = match[1] || "";
  const number = Number(match[2]);
  const unit = match[3] || "";
  if (!Number.isFinite(number)) return null;
  return { prefix, value: number, unit, step: amountStep(prefix, unit, number) };
}

function amountStep(prefix, unit, value) {
  if (prefix || /杯|合/.test(unit)) return 0.5;
  if (/g|ml|ｍｌ|グラム/.test(unit)) {
    if (value >= 100) return 25;
    if (value >= 20) return 10;
    return 5;
  }
  if (/玉|丁|袋|缶|束|本|枚|個|切れ|膳/.test(unit)) return 1;
  return 0.5;
}

function formatAmountFromParts(parts, value) {
  return `${parts.prefix}${formatScaledNumber(value)}${parts.unit}`;
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function scaleAmountForServings(amount, servingCount, sourceServings = 1) {
  const value = String(amount || "").trim();
  sourceServings = normalizeSourceServings(sourceServings);
  if (sourceServings === null) return value || "適量";
  const count = normalizeServingCount(servingCount) / sourceServings;
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
    .filter((evaluation) => evaluation.recipeId === recipeId && !evaluation.preferencePending)
    .sort((a, b) => dateValue(b.cookedAt) - dateValue(a.cookedAt));
  if (!evaluations.length) {
    return {
      count: 0,
      averageDays: null,
      shortLabel: "未設定",
      badgeLabel: "評価まだ",
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
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(today(), index);
    return {
      date,
      label: weekdayLabel(date),
      dateLabel: formatDate(date),
      candidate: null,
      pinned: false
    };
  });

  days.forEach((day) => {
    const overrideId = state.planOverrides?.[day.date];
    if (!overrideId || used.has(overrideId)) return;
    const candidate = candidates.find((item) => item.recipe.id === overrideId);
    if (candidate) {
      day.candidate = candidate;
      day.pinned = true;
      used.add(overrideId);
    }
  });

  days.forEach((day) => {
    if (day.candidate) return;
    const candidate = candidates.find((item) => !used.has(item.recipe.id) && item.dueDate <= day.date)
      || candidates.find((item) => !used.has(item.recipe.id));
    if (candidate) used.add(candidate.recipe.id);
    day.candidate = candidate;
  });

  return days;
}

function getMealCandidates() {
  return state.recipes
    .filter((recipe) => recipe.mealType === "dinner")
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

document.querySelector("#profile-button")?.addEventListener("click", () => setView("settings"));

document.addEventListener("visibilitychange", () => {
  // アプリに戻ってきたら、他の端末の変更を取り込む
  if (document.visibilityState === "visible" && state && syncEnabled()) syncNow({ silent: true });
});

(async function init() {
  registerServiceWorker();
  state = await loadStateAsync();
  state.view = "today";
  readInviteFromLocation();
  const skillParams = new URLSearchParams(location.search);
  if (skillParams.get("skill") === "1") {
    history.replaceState(null, "", location.pathname);
    startSkillQuiz(skillParams.get("from") === "lp");
  }
  const hasSharedUrl = applySharedUrlFromLocation();
  if (!hasSharedUrl && new URLSearchParams(location.search).get("quiz") === "1") {
    const draft = profileDraft();
    draft.tasteReturnStep = draft.step === 4 ? 5 : draft.step;
    draft.step = 4;
    profileEditing = state.onboarded;
    const query = new URLSearchParams(location.search);
    query.delete("quiz");
    history.replaceState(null, "", location.pathname + (query.size ? "?" + query : ""));
    saveState({scheduleSync:false});
  }
  if (!hasSharedUrl && new URLSearchParams(location.search).get("start") === "quick") {
    profileEditing=true;
    profileDraft().quickSetupIndex=0;
    profileDraft().period=3;
    history.replaceState(null,"",location.pathname);
    saveState({scheduleSync:false});
  }
  if (!hasSharedUrl && new URLSearchParams(location.search).get("start") === "preview") {
    state.onboarded=true;state.planLength=3;state.view="plan";
    saveState({scheduleSync:false});
  }
  requestPersistentStorage();
  render();
  checkPlaylistAvailability();
  if (hasSharedUrl) {
    showToast("共有されたURLを受け取りました。");
    setTimeout(() => document.querySelector('[data-action="fetch-caption"]:not([disabled])')?.click(), 300);
  }
  if (syncEnabled()) syncNow({ silent: true });
})();
// Like a browser toolbar: bars slide away while scrolling down, come back on scroll up.
(() => {
  let lastY = window.scrollY, ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY, dy = y - lastY;
      const atBottom = y + innerHeight >= document.documentElement.scrollHeight - 4;
      if (y < 48 || dy < -6 || atBottom) document.body.classList.remove("bars-hidden");
      else if (dy > 6) document.body.classList.add("bars-hidden");
      if (Math.abs(dy) > 6 || y < 48) lastY = y;
      ticking = false;
    });
  }, { passive: true });
})();
