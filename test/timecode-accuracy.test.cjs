const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const CookMode = require("../cook-mode.js");

test("CookMode.refineTimes and segment: subdivides coarse chapter duplicates and repairs inverted timestamps for saved recipes", () => {
  const steps = ["野菜を切る", "豚肉を炒める", "野菜を加えてさらに炒める", "合わせ調味料を入れる", "盛り付ける"];
  // 同じ章時刻（90秒）が3手順続くケース
  CookMode.setRecipe({ title: "野菜炒め", steps, timesOf: () => [10, 90, 90, 90, 180], ingredients: [] });
  const s0 = CookMode.segment(0);
  const s1 = CookMode.segment(1);
  const s2 = CookMode.segment(2);
  const s3 = CookMode.segment(3);
  const s4 = CookMode.segment(4);
  assert.deepEqual(s0, { start: 10, end: 90 });
  assert.equal(s1.start, 90);
  assert.ok(s1.end > 90 && s1.end < 180, "step 1 ends before 180 so it does not loop the entire 90s chapter");
  assert.equal(s2.start, s1.end);
  assert.ok(s2.end > s2.start && s2.end < 180);
  assert.equal(s3.start, s2.end);
  assert.equal(s3.end, 180);
  assert.deepEqual(s4, { start: 180, end: null });

  // 順番が逆転しているケース（[10, 200, 100, 300]）も単調増加に補正される
  const repaired = CookMode.refineTimes(["a", "b", "c", "d"], [10, 200, 100, 300]);
  assert.deepEqual(repaired, [10, 55, 100, 300]);

  // "MM:SS" 形式の文字列が混ざっていても秒数に変換される
  const fromStrings = CookMode.refineTimes(["a", "b", "c"], ["00:12", "01:25", "02:40"]);
  assert.deepEqual(fromStrings, [12, 85, 160]);

  // review fix (#152): 短尺動画の [0, 5, 10, 14] は密集（cluster）として後ろへ勝手に広げない
  assert.deepEqual(CookMode.refineTimes(["a", "b", "c", "d"], [0, 5, 10, 14]), [0, 5, 10, 14]);
  // review fix (#152): 動画の長さが不明な時は、末尾の重複や逆転があっても既存の最大時刻を超えない
  const cappedDup = CookMode.refineTimes(["a", "b", "c", "d"], [10, 50, 90, 90]);
  assert.equal(cappedDup[3], 90);
  assert.ok(cappedDup[2] > 50 && cappedDup[2] < 90);
});

test("CookMode nudgeTime and voice commands: adjusts loop start by -5s / +5s / here and triggers onTimeFix", () => {
  const fixes = [];
  CookMode.setRecipe({
    title: "豚キムチ",
    steps: ["豚肉を切る", "炒める", "盛り付ける"],
    timesOf: () => [20, 60, 120],
    videoId: "abcdefghijk",
    ingredients: [],
    onTimeFix: (idx, sec) => fixes.push([idx, sec]),
  });
  CookMode.openMode();
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });

  // 音声コマンドの認識確認
  assert.deepEqual(CookMode.parseVoice("5秒前"), { act: "time-minus", label: "5秒前へ" });
  assert.deepEqual(CookMode.parseVoice("少し後ろ"), { act: "time-plus", label: "5秒後へ" });
  assert.deepEqual(CookMode.parseVoice("ここを始まりに"), { act: "time-here", label: "ここを始まりに" });

  // -5秒微調整
  CookMode.nudgeTime("time-minus");
  assert.deepEqual(CookMode.segment(0), { start: 15, end: 60 });
  assert.deepEqual(fixes.at(-1), [0, 15]);

  // +5秒微調整
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });
  assert.deepEqual(fixes.at(-1), [0, 20]);

  CookMode.closeMode();
  CookMode._clearTimers();
});

test("daily-ui & discover: already-saved recipes refine coarse times, guide steps inherit non-null member times, and saveQuickTimeFix persists & shares", async () => {
  const puts = [];
  const ctx = vm.createContext({
    console,
    URL,
    Date,
    fetch: (url, opts) => {
      if (opts?.method === "PUT") puts.push({ url, body: JSON.parse(opts.body) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    MATAGOCHI_API_BASE_URL: "https://api.test",
    window: { scrollTo() {} },
    document: { querySelector: () => null, querySelectorAll: () => [] },
  });
  for (const f of [
    "dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js",
    "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js",
    "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js",
    "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js",
  ]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;globalThis.saved=0;saveState=()=>{globalThis.saved+=1};render=()=>{};showToast=()=>{}");

  // 1. すでに保存済みのレシピ（state.recipes）で同じ章時刻が重なっていても、recipeStepTimes で自動分割される
  run(`state.recipes.push({
    id: "saved-coarse",
    title: "回鍋肉",
    videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    steps: ["キャベツを切る", "豚肉を炒める", "野菜を炒める", "タレを絡める"],
    stepTimes: [10, 60, 60, 120]
  })`);
  const refinedSaved = JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[0]))"));
  assert.equal(refinedSaved[0], 10);
  assert.equal(refinedSaved[1], 60);
  assert.ok(refinedSaved[2] > 60 && refinedSaved[2] < 120, "saved recipe duplicate timestamp is automatically subdivided");
  assert.equal(refinedSaved[3], 120);

  // 2. 書き直した手順（guide）で、まとめた先頭の手順に時刻がなく2番目に時刻がある場合も引き継ぐ
  const steps = ["キャベツを切る", "豚こまに塩をする", "フライパンで焼く", "皿に盛る"];
  const key = run(`stepsKey(${JSON.stringify(steps)})`);
  run(`globalThis.gRecipe = {
    id: "guide-fallback",
    title: "豚キャベツ",
    videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    ingredients: [{ name: "豚こま", amount: "200g" }],
    steps: ${JSON.stringify(steps)},
    stepTimes: [null, 25, 70, 110],
    guide: [
      { text: "下ごしらえ：キャベツを切り、豚こまに塩。", from: [0, 1] },
      { text: "仕上げ：フライパンで焼いて盛る。", from: [2, 3] }
    ],
    guideOf: ${JSON.stringify(key)}
  }`);
  run("globalThis.cm = null; const _set = CookMode.setRecipe; CookMode.setRecipe = (x) => { globalThis.cm = x; return _set(x); }");
  const html = run("cookSections(gRecipe, 2).steps");
  assert.match(html, /data-guide-slot="1"[^>]*><button[^>]*data-seconds="25"/, "uses original step 2's timestamp when step 1 is null");
  assert.deepEqual(JSON.parse(run("JSON.stringify(cm.timesOf())")), [25, 70]);

  // 3. 料理モード内の微調整（onTimeFix）で state.recipes とサーバー共有の両方に保存される
  run("saveQuickTimeFix(state.recipes[0], 1, 55)");
  assert.equal(run("state.recipes[0].stepTimes[1]"), 55);
  assert.equal(run("saved"), 1);
  assert.equal(puts.length, 1);
  assert.deepEqual(puts[0].body.stepTimes[1], 55);

  // 4. review fix (#152): 人が修正した時刻（source === "fix" / stepTimesFrom === "admin"）は料理モードでも再補正されない
  run(`globalThis.fixedRecipe = {
    id: "human-fixed",
    title: "短尺または手動修正レシピ",
    videoUrl: "https://www.youtube.com/watch?v=fixfixfix11",
    ingredients: [{ name: "卵", amount: "2個" }],
    steps: ["割る", "混ぜる", "焼く", "盛る"],
    stepTimes: [0, 5, 5, 15],
    stepTimesFrom: "fix"
  }`);
  run("cookSections(fixedRecipe, 2)");
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(fixedRecipe))")), [0, 5, 5, 15]);
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(0))")), { start: 0, end: 5 });
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(1))")), { start: 5, end: 15 });
});
