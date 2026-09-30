const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 動画の取り込み：止まった理由ごとの案内・AI の上限でも保存できる・埋め込み再生ができない動画（docs/PERSONALIZE_PLAN.md §6）。
function app() {
  const ctx = vm.createContext({ console, URL, Date, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.recipes=[];saveState=()=>{};render=()=>{};globalThis.toasts=[];showToast=(m)=>toasts.push(m);captureDraft=()=>{};");
  // サーバーの答えを差しかえる。
  run(`globalThis.reply = null; fetchWithTimeout = async () => ({ ok: reply.status < 400, status: reply.status, json: async () => reply.body });`);
  return run;
}
const importUrl = async (run, url, reply) => {
  run(`reply = ${JSON.stringify(reply)}; state.draft = { ...clone(emptyDraft), videoUrl: ${JSON.stringify(url)} };`);
  await run(`handleAction({ currentTarget: { dataset: { action: "fetch-caption" } } })`);
};

test("a deleted or private video says so plainly (no raw error code), with no video button, and the recipe can still be saved by name", async () => {
  const run = app();
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 404, body: { error: { code: "video_not_found", message: "YouTube動画が見つかりませんでした。" } } });
  assert.equal(run("state.fetchStatus"), "動画が見つかりません（削除されたか、URLが違います）。URLを確かめてください。");
  let html = run("renderReadSteps(false)");
  assert.match(html, /動画を見られません/);
  assert.match(html, /read-reason/);
  assert.doesNotMatch(html, /video_not_found|draft-video/);
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 422, body: { error: { code: "non_public_video", message: "x" } } });
  assert.match(run("state.fetchStatus"), /非公開・限定公開の動画は読み取れません。料理名を入れれば、URLだけで保存できます/);
  // 料理名だけで保存できる（材料・作り方は空のまま）
  run(`state.draft.title = "親子丼"; state.extractedIngredients = []; state.extractedSteps = [];`);
  await run(`handleAction({ currentTarget: { dataset: { action: "save-recipe" } } })`);
  assert.equal(run("state.recipes.length"), 1);
  assert.equal(run("state.recipes[0].videoUrl"), "https://www.youtube.com/watch?v=abcdefghijk");
  // 知らないコードは、サーバーの文のまま（コードは付けない）
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 500, body: { error: { code: "something_new", message: "うまくいきませんでした。" } } });
  assert.match(run("state.fetchStatus"), /^うまくいきませんでした。 動画の説明文をコピーして/);
});

test("when the AI limit is reached, the description is still used, the reason is shown, and the video button is hidden for today", async () => {
  const run = app();
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 200, body: { title: "豚こま炒め", caption: "材料\n豚こま 200g\nキャベツ 1/4個", ingredients: [], steps: [], videoId: "abcdefghijk", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", channelTitle: "台所", analysis: { ok: false, code: "analysis_budget_exceeded" }, videoSkipped: true } });
  assert.equal(run("state.draft.title"), "豚こま炒め", "the name comes from YouTube, so it can be saved as is");
  assert.equal(run("state.draft.readInfo.aiLimited"), true);
  assert.match(run("state.fetchStatus"), /今日はAIで読み取れる上限に達しました/);
  const html = run("renderReadSteps(false)");
  assert.match(html, /今日のAIの上限/);
  assert.doesNotMatch(html, /data-action="draft-video"/, "pressing it would fail for the same reason");
  assert.match(html, /URLと料理名はこのまま保存でき/);
  // ふだんの「説明欄に作り方がない」では、動画のボタンを出す
  await importUrl(run, "https://www.youtube.com/watch?v=bbbbbbbbbbb", { status: 200, body: { title: "卵焼き", caption: "材料 卵 2個", ingredients: [{ name: "卵", amount: "2個" }], steps: [], videoId: "bbbbbbbbbbb" } });
  assert.equal(run("state.draft.readInfo.aiLimited"), undefined);
  assert.match(run("renderReadSteps(false)"), /data-action="draft-video"/);
  // 動画から読む：上限で止まったら、その日はボタンを消して理由を出す
  run(`state.draft.title = "卵焼き"; state.extractedSteps = [];`);
  run(`reply = { status: 429, body: { error: { code: "analysis_budget_exceeded", message: "AI分析の利用上限に達しました。" } } }`);
  await run("readDraftFromVideo()");
  assert.equal(run("state.draft.readInfo.aiLimited"), true);
  assert.doesNotMatch(run("renderReadSteps(false)"), /data-action="draft-video"/);
});

test("a video whose owner does not allow embedding is marked on save, opened on YouTube, and not played in cooking mode", async () => {
  const run = app();
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 200, body: { title: "親子丼", caption: "", ingredients: [{ name: "鶏もも", amount: "1枚" }], steps: ["煮る", "とじる"], videoId: "abcdefghijk", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", embeddable: false } });
  assert.match(run("renderReadSteps(false)"), /アプリの中では再生できません/);
  await run(`handleAction({ currentTarget: { dataset: { action: "save-recipe" } } })`);
  assert.equal(run("state.recipes[0].embeddable"), false);
  const credit = run("renderCreatorCredit(state.recipes[0])");
  assert.match(credit, /class="video-open"/);
  assert.doesNotMatch(credit, /<iframe/);
  assert.match(credit, /YouTube のその場面を開けます/);
  run(`state.recipes[0].stepTimes = [5, 42]`);
  assert.match(run("stepTimeButton(state.recipes[0], 1)"), /<a class="step-time" href="https:\/\/www\.youtube\.com\/watch\?v=abcdefghijk&t=42s"/);
  // 保存データを読み直しても残る。ふつうの動画には印をつけない
  run("state = normalizeState(JSON.parse(JSON.stringify(state))); saveState=()=>{}; render=()=>{};");
  assert.equal(run("state.recipes[0].embeddable"), false);
  assert.equal(run(`JSON.stringify(normalizeRecipes([{ id: "x", title: "a", embeddable: true }])[0]).includes("embeddable")`), false);
  assert.match(run(`renderCreatorCredit({ id: "y", title: "b", videoUrl: "https://youtu.be/abcdefghijk" })`), /<iframe/);
});

test("review fix (#105): reading from the video when the AI limit is reached answers 200 with the description; it still shows the limit and hides the video button", async () => {
  const run = app();
  await importUrl(run, "https://www.youtube.com/watch?v=abcdefghijk", { status: 200, body: { title: "卵焼き", caption: "材料 卵 2個", ingredients: [{ name: "卵", amount: "2個" }], steps: [], videoId: "abcdefghijk" } });
  assert.match(run("renderReadSteps(false)"), /data-action="draft-video"/);
  run(`reply = { status: 200, body: { title: "卵焼き", caption: "材料 卵 2個", ingredients: [{ name: "卵", amount: "2個" }], steps: [], videoId: "abcdefghijk", analysis: { ok: false, code: "analysis_budget_exceeded" }, videoSkipped: false } }`);
  await run("readDraftFromVideo()");
  assert.equal(run("state.draft.readInfo.aiLimited"), true);
  assert.match(run("state.fetchStatus"), /今日はAIで読み取れる上限に達しました/);
  const html = run("renderReadSteps(false)");
  assert.match(html, /今日のAIの上限/);
  assert.doesNotMatch(html, /data-action="draft-video"|動画からも作り方を読み取れませんでした/);
  // 上限でない理由（レシピがない など）は、これまでどおりの文
  await importUrl(run, "https://www.youtube.com/watch?v=bbbbbbbbbbb", { status: 200, body: { title: "卵焼き", caption: "材料 卵 2個", ingredients: [{ name: "卵", amount: "2個" }], steps: [], videoId: "bbbbbbbbbbb" } });
  run(`reply = { status: 200, body: { title: "卵焼き", ingredients: [], steps: [], videoId: "bbbbbbbbbbb", analysis: { ok: false, code: "incomplete_recipe" } } }`);
  await run("readDraftFromVideo()");
  assert.match(run("state.fetchStatus"), /動画からも作り方を読み取れませんでした/);
  assert.equal(run("state.draft.readInfo.aiLimited"), undefined);
});

test("review fix (#105): every way a saved recipe is filled from a video keeps the 'not embeddable' mark", async () => {
  const run = app();
  // 献立から「動画で作り方をそろえる」
  run(`state.recipes = [{ id: "r1", title: "親子丼", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", mealType: "dinner", ingredients: [], steps: [] }];
    reply = { status: 200, body: { title: "親子丼", ingredients: [{ name: "鶏もも", amount: "1枚" }], steps: ["煮る", "とじる"], videoId: "abcdefghijk", analyzedFrom: "video", embeddable: false } };`);
  await run(`fillRecipeFromVideo("r1")`);
  assert.equal(run("state.recipes[0].steps.length"), 2);
  assert.equal(run("state.recipes[0].embeddable"), false);
  assert.doesNotMatch(run("renderCreatorCredit(state.recipes[0])"), /<iframe/);
  // 献立に URL を貼って入れる・初回設定の「読んでみる」（discoverRecipe を通る）
  assert.equal(run(`discoverRecipe({ videoId: "abcdefghijk", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", title: "x", ingredients: [], steps: [], embeddable: false }, "url").embeddable`), false);
  assert.equal(run(`"embeddable" in discoverRecipe({ videoId: "abcdefghijk", title: "x", ingredients: [], steps: [] }, "url")`), false);
  // AI の上限で作り方を読めなかった時は、そう伝える
  run(`state.recipes.push({ id: "r2", title: "卵焼き", videoUrl: "https://www.youtube.com/watch?v=bbbbbbbbbbb", mealType: "dinner", ingredients: [], steps: [] });
    reply = { status: 200, body: { title: "卵焼き", ingredients: [], steps: [], videoId: "bbbbbbbbbbb", analysis: { ok: false, code: "analysis_budget_exceeded" } } }; toasts.length = 0;`);
  await run(`fillRecipeFromVideo("r2")`);
  assert.match(run("toasts.join()"), /今日はAIで読み取れる上限に達しました/);
});

test("review fix (#105, round 2): the mark is kept even when no steps come back, and the busy / paused reasons are not called 'the limit'", async () => {
  const run = app();
  run(`state.recipes = [{ id: "r1", title: "親子丼", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", mealType: "dinner", ingredients: [], steps: [] }];
    reply = { status: 200, body: { title: "親子丼", ingredients: [], steps: [], videoId: "abcdefghijk", embeddable: false, analysis: { ok: false, code: "analysis_budget_exceeded" } } }; toasts.length = 0;`);
  await run(`fillRecipeFromVideo("r1")`);
  assert.equal(run("state.recipes[0].embeddable"), false, "kept although no steps came back");
  assert.doesNotMatch(run("renderCreatorCredit(state.recipes[0])"), /<iframe/);
  assert.match(run("toasts.join()"), /上限に達しました/);
  for (const [code, want] of [["analysis_disabled", /お休み中/], ["analysis_busy", /混み合っています/]]) {
    run(`reply = { status: 200, body: { title: "親子丼", ingredients: [], steps: [], videoId: "abcdefghijk", analysis: { ok: false, code: "${code}" } } }; toasts.length = 0;`);
    await run(`fillRecipeFromVideo("r1")`);
    assert.match(run("toasts.join()"), want);
    assert.doesNotMatch(run("toasts.join()"), /上限|明日また/);
  }
});

test("review fix (#105, round 3): the 'not embeddable' mark saved without steps reaches the other device by sync", async () => {
  const A = app(), B = app();
  const base = { id: "r1", title: "親子丼", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", mealType: "dinner", ingredients: [], steps: [], savedAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" };
  for (const run of [A, B]) run(`state.recipes = normalizeRecipes([${JSON.stringify(base)}]);`);
  A(`reply = { status: 200, body: { title: "親子丼", ingredients: [], steps: [], videoId: "abcdefghijk", embeddable: false, analysis: { ok: false, code: "analysis_budget_exceeded" } } };`);
  await A(`fillRecipeFromVideo("r1")`);
  assert.equal(A("state.recipes[0].embeddable"), false);
  assert.notEqual(A("state.recipes[0].updatedAt"), base.updatedAt, "the change moves the update time");
  const server = A("JSON.stringify(buildSyncPayload())");
  B(`applySyncPayload(mergeSyncPayloads(buildSyncPayload(), ${server}))`);
  assert.equal(B("state.recipes[0].embeddable"), false, "B gets the mark");
  // もう印がある時は、更新日時を動かさない（同期を増やさない）
  const at = A("state.recipes[0].updatedAt");
  await A(`fillRecipeFromVideo("r1")`);
  assert.equal(A("state.recipes[0].updatedAt"), at);
});
