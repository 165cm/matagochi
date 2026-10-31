const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const CookMode = require("../cook-mode.js");

test("CookMode.refineTimes and segment: subdivides coarse chapter duplicates and repairs inverted timestamps for saved recipes", () => {
  const steps = ["野菜を切る", "豚肉を炒める", "野菜を加えてさらに炒める", "合わせ調味料を入れる", "盛り付ける"];
  // 同じ章時刻（90秒）が3手順続くケース：架空の按分時刻は捏造せず、元の時刻を維持する（2026-10-31方針）
  CookMode.setRecipe({ title: "野菜炒め", steps, timesOf: () => [10, 90, 90, 90, 180], ingredients: [] });
  const s0 = CookMode.segment(0);
  const s1 = CookMode.segment(1);
  const s4 = CookMode.segment(4);
  assert.deepEqual(s0, { start: 10, end: 90 });
  assert.equal(s1.start, 90);
  assert.deepEqual(s4, { start: 180, end: null });

  // 順番が逆転しているケース（[10, 200, 100, 300]）は、外れ値（200）が null に補正され架空補間されない
  const repaired = CookMode.refineTimes(["a", "b", "c", "d"], [10, 200, 100, 300]);
  assert.deepEqual(repaired, [10, null, 100, 300]);

  // "MM:SS" 形式の文字列が混ざっていても秒数に変換される
  const fromStrings = CookMode.refineTimes(["a", "b", "c"], ["00:12", "01:25", "02:40"]);
  assert.deepEqual(fromStrings, [12, 85, 160]);

  // review fix (#152): 短尺動画の [0, 5, 10, 14] は密集（cluster）として後ろへ勝手に広げない
  assert.deepEqual(CookMode.refineTimes(["a", "b", "c", "d"], [0, 5, 10, 14]), [0, 5, 10, 14]);
  // review fix (#152): 末尾の重複があっても架空の按分時刻を捏造せず、元の時刻を維持する
  const cappedDup = CookMode.refineTimes(["a", "b", "c", "d"], [10, 50, 90, 90]);
  assert.deepEqual(cappedDup, [10, 50, 90, 90]);
});

test("CookMode nudgeTime and voice commands: adjusts loop start/end by -5s / +5s / here and triggers onTimeFix", () => {
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
  assert.equal(CookMode._mode().timeTarget, "start");
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });

  // 音声コマンドの認識確認
  assert.deepEqual(CookMode.parseVoice("5秒前"), { act: "time-minus", label: "5秒前へ" });
  assert.deepEqual(CookMode.parseVoice("少し後ろ"), { act: "time-plus", label: "5秒後へ" });
  assert.deepEqual(CookMode.parseVoice("ここを始まりに"), { act: "time-here", label: "ここを始まりに" });
  assert.deepEqual(CookMode.parseVoice("ここを終わりに"), { act: "time-here-end", label: "ここを終わりに" });
  assert.deepEqual(CookMode.parseVoice("ここまで"), { act: "time-here-end", label: "ここを終わりに" });

  // 開始時刻の -5秒微調整
  CookMode.nudgeTime("time-minus");
  assert.deepEqual(CookMode.segment(0), { start: 15, end: 60 });
  assert.deepEqual(fixes.at(-1), [0, 15]);

  // 開始時刻の +5秒微調整
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });
  assert.deepEqual(fixes.at(-1), [0, 20]);

  // 終了位置チップへの切り替え（timeTarget = "end"）
  // review fix: チップ切り替えや終了時刻の調整では手順の先頭へ巻き戻らず、再生位置を維持すること
  CookMode.setTimeTarget("end");
  assert.equal(CookMode._mode().timeTarget, "end");

  // 終了時刻の -5秒微調整（step 1 の開始時刻 60 -> 55）
  CookMode.nudgeTime("time-minus");
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 55 });
  assert.deepEqual(fixes.at(-1), [1, 55]);

  // 終了時刻の +5秒微調整（step 1 の開始時刻 55 -> 60）
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });
  assert.deepEqual(fixes.at(-1), [1, 60]);

  // 逆転防止クランプの確認
  // 1. 開始時刻を +5秒 していった場合、終了時刻（60）- 1 = 59 を超えない
  CookMode.setTimeTarget("start");
  for (let i = 0; i < 15; i++) CookMode.nudgeTime("time-plus");
  assert.equal(CookMode.segment(0).start, 59);

  // 2. 終了時刻を -5秒 していった場合、開始時刻（59）+ 1 = 60 を下回らない
  CookMode.setTimeTarget("end");
  for (let i = 0; i < 15; i++) CookMode.nudgeTime("time-minus");
  assert.equal(CookMode.segment(0).end, 60);

  // 3. 終了時刻を +5秒 していった場合、後続手順の時刻（120）- 1 = 119 を超えない（次の区間の保護）
  for (let i = 0; i < 20; i++) CookMode.nudgeTime("time-plus");
  assert.equal(CookMode.segment(0).end, 119);

  // 4. 音声操作で「ここを終わりに」後に「ここを始まりに」と言った場合に対象が開始に戻ること
  CookMode._hear("ここを終わりに");
  assert.equal(CookMode._mode().timeTarget, "end");
  assert.equal(fixes.at(-1)[0], 1);
  CookMode._hear("ここを始まりに");
  assert.equal(CookMode._mode().timeTarget, "start");
  assert.equal(fixes.at(-1)[0], 0);

  // 5. 終了時刻がない最終手順で「ここを終わりに」を発話しても、開始時刻を上書きしない（review fix）
  CookMode._hear("次へ");
  CookMode._hear("次へ"); // step 2（最終手順：盛る、start 120, end null）へ移動
  assert.equal(CookMode._mode().at, 2);
  assert.equal(CookMode.segment(2).end, null);
  const fixCountBefore = fixes.length;
  CookMode.setTimeTarget("end");
  CookMode.nudgeTime("time-here");
  assert.equal(fixes.length, fixCountBefore, "last step without end timestamp must not touch start timestamp");
  CookMode._hear("ここを終わりに");
  assert.equal(fixes.length, fixCountBefore, "voice time-here-end on last step must not trigger onTimeFix");

  CookMode.closeMode();
  assert.equal(CookMode._mode().timeTarget, "start");
  CookMode._clearTimers();

  // 6. 時刻未設定のレシピでも開始位置を設定できること（review fix）
  const uncalFixes = [];
  CookMode.setRecipe({
    title: "未設定レシピ",
    steps: ["準備", "調理"],
    timesOf: () => [null, null],
    videoId: "uncalibrated1",
    ingredients: [],
    onTimeFix: (idx, sec) => uncalFixes.push([idx, sec]),
  });
  CookMode.openMode();
  assert.equal(CookMode.segment(0), null);
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(uncalFixes.at(-1), [0, 5], "uncalibrated recipe must allow adjusting start timestamp");
  CookMode.closeMode();

  // 7. 字幕由来などで隣り合う手順が同じ時刻を持つ場合でも開始の「+5秒」が逆戻りしないこと（review fix）
  const dupFixes = [];
  CookMode.setRecipe({
    title: "重複時刻レシピ",
    steps: ["準備", "加熱", "盛付"],
    timesOf: () => [20, 20, 60],
    timesFixed: true,
    videoId: "duptimes1",
    ingredients: [],
    onTimeFix: (idx, sec) => dupFixes.push([idx, sec]),
  });
  CookMode.openMode();
  assert.deepEqual(CookMode.segment(0), { start: 20, end: 60 });
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(dupFixes.at(-1), [0, 25], "start time +5s advances forward instead of shrinking to next duplicate");
  CookMode.closeMode();

  // 8. 字幕由来の小数秒で手順間が1秒未満の場合でも終了の「+5秒」が後続手順を越えないこと（review fix）
  const denseFixes = [];
  CookMode.setRecipe({
    title: "小数密集レシピ",
    steps: ["準備", "加熱", "盛付"],
    timesOf: () => [20, 20.5, 20.8],
    timesFixed: true,
    videoId: "densetimes1",
    ingredients: [],
    onTimeFix: (idx, sec) => denseFixes.push([idx, sec]),
  });
  CookMode.openMode();
  CookMode.setTimeTarget("end");
  CookMode.nudgeTime("time-plus");
  assert.ok(denseFixes.at(-1)[1] < 20.8, "end time must not exceed next step timestamp 20.8");
  assert.ok(denseFixes.at(-1)[1] >= 20.5, "end time remains valid");
  CookMode.closeMode();
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
  // 架空の時刻（80秒など）を捏造せず、元の根拠ある時刻を維持する
  assert.equal(refinedSaved[2], 60);
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

  // review fix: 小数第1位の微調整も Math.floor で切り捨てられずに正確に保存・共有される
  run("saveQuickTimeFix(state.recipes[0], 2, 85.5)");
  assert.equal(run("state.recipes[0].stepTimes[2]"), 85.5);
  assert.deepEqual(puts.at(-1).body.stepTimes[2], 85.5);

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

  // 5. review fix: サーバーから届いた YouTube 字幕（transcript）由来の時刻は、レシピの古い時刻より優先して保存・表示される
  run(`state.recipes.push({
    id: "transcript-target",
    title: "生姜焼き",
    videoUrl: "https://www.youtube.com/watch?v=transvid001",
    steps: ["肉を切る", "タレに漬ける", "焼く"],
    stepTimes: [0, 10, 20]
  })`);
  // ensureTimecodes で peek: true で問い合わせ、サーバーから source: "transcript" で届いたケース
  run(`timecodes.set(timecodeKey(state.recipes[1]), {
    status: "done",
    at: Date.now(),
    times: [15, 45, 90],
    source: "transcript"
  })`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[1]))")), [15, 45, 90], "transcript source overrides older recipe.stepTimes");
  assert.equal(run("timecodeHint(state.recipes[1])"), "▶ は動画の字幕から合わせた時刻です");

  // 6. [P1 fix] 字幕由来の検証済み時刻（例: [10.5, 15.5, 20.5, 25.5]）は短尺で工程が密集していても架空時刻へ按分補間されない
  run(`globalThis.transcriptRecipe = {
    id: "transcript-short-dense",
    title: "スピードたまご焼き",
    videoUrl: "https://www.youtube.com/watch?v=densevideo1",
    ingredients: [{ name: "卵", amount: "2個" }],
    steps: ["割る", "混ぜる", "焼く", "巻く"],
    stepTimes: [10.5, 15.5, 20.5, 25.5],
    stepTimesFrom: "transcript"
  }`);
  run("cookSections(transcriptRecipe, 2)");
  assert.deepEqual(
    JSON.parse(run("JSON.stringify(recipeStepTimes(transcriptRecipe))")),
    [10.5, 15.5, 20.5, 25.5],
    "transcript source preserves dense accurate timestamps without interpolating fake times"
  );
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(0))")), { start: 10.5, end: 15.5 });
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(1))")), { start: 15.5, end: 20.5 });

  // 7. [P2 fix] 取得 → 端末保存 → メモリ初期化（再起動相当） → 再表示まで通し、字幕時刻が再補間されずに保持される
  run(`state.recipes.push({
    id: "restart-persist-test",
    title: "時短オムレツ",
    videoUrl: "https://www.youtube.com/watch?v=persreboot1",
    ingredients: [{ name: "卵", amount: "2個" }],
    steps: ["割る", "混ぜる", "焼く", "盛る"],
    stepTimes: [null, null, null, null]
  })`);
  // サーバーAPIのモック（字幕由来の密集時刻を返す）
  ctx.fetch = (url) => {
    if (url.includes("/api/import/youtube/timecodes")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          stepTimes: [10.5, 15.5, 20.5, 25.5],
          source: "transcript"
        })
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  };
  // サーバーから取得実行（ensureTimecodes）
  run("ensureTimecodes(state.recipes[2], { peek: false })");
  // 取得直後の保存状態を確認
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(run("state.recipes[2].stepTimesFrom"), "transcript", "own.stepTimesFrom must be saved as transcript");
  assert.deepEqual(
    JSON.parse(run("JSON.stringify(state.recipes[2].stepTimes)")),
    [10.5, 15.5, 20.5, 25.5]
  );

  // 再起動相当のメモリ初期化：timecodes マップをクリアし、サーバー未応答・オフライン状態を再現
  run("timecodes.clear()");
  // 再起動後の recipeStepTimes および料理モードでの再表示
  run("cookSections(state.recipes[2], 2)");
  const afterRebootTimes = JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[2]))"));
  assert.deepEqual(
    afterRebootTimes,
    [10.5, 15.5, 20.5, 25.5],
    "preserved transcript stepTimesFrom prevents fake interpolation after app reboot"
  );
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(0))")), { start: 10.5, end: 15.5 });
  assert.deepEqual(JSON.parse(run("JSON.stringify(CookMode.segment(1))")), { start: 15.5, end: 20.5 });

  // 8. [P2 fix] URL取り込み（applyImportedRecipe ➔ 保存）でも stepTimesFrom: "transcript" が保持される
  run(`applyImportedRecipe({
    title: "ハイブリッド豚こま",
    videoUrl: "https://www.youtube.com/watch?v=hybriddraft1",
    channelTitle: "料理チャンネル",
    ingredients: [{ name: "豚こま", amount: "300g" }],
    steps: ["揉み込む", "片栗粉まぶす", "焼く", "和える"],
    stepTimes: [10.5, 15.5, 20.5, 25.5],
    stepTimesFrom: "transcript",
    source: "YouTube"
  })`);
  assert.equal(run("state.draft.stepTimesFrom"), "transcript", "draft must retain stepTimesFrom: transcript");
  assert.deepEqual(
    JSON.parse(run("JSON.stringify(state.draft.stepTimes)")),
    [10.5, 15.5, 20.5, 25.5]
  );

  // 9. [P2 fix] おすすめ・新着・人気（discoverRecipe）経由でも stepTimesFrom: "transcript" が保持され、重複時刻が推測値へ補間されない
  run(`globalThis.discRecipe = discoverRecipe({
    videoId: "poptranscript1",
    title: "定番ハイブリッド炒め",
    videoUrl: "https://www.youtube.com/watch?v=poptranscript1",
    channelTitle: "定番チャンネル",
    ingredients: [{ name: "豚肉", amount: "200g" }],
    steps: ["準備する", "下味をつける", "炒める", "盛る"],
    stepTimes: [10, 10, 10, 90],
    stepTimesFrom: "transcript"
  }, "pop")`);
  assert.equal(run("discRecipe.stepTimesFrom"), "transcript", "discoverRecipe must retain stepTimesFrom: transcript");
  const discTimes = JSON.parse(run("JSON.stringify(recipeStepTimes(discRecipe))"));
  assert.deepEqual(discTimes, [10, 10, 10, 90], "transcript timestamps must not be interpolated to [10, 31, 51, 90]");
  // 自分のレシピとして保存した場合も出所が維持される
  run("globalThis.ownFromDisc = saveOwnRecipe(discRecipe)");
  assert.equal(run("ownFromDisc.stepTimesFrom"), "transcript");
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(ownFromDisc))")), [10, 10, 10, 90]);
});

test("cook-mode refineTimes does not invent fake interpolated times for dense timestamps [10.5, 15.5, 20.5, 25.5]", () => {
  const steps = ["下準備", "炒める", "煮る", "盛り付け"];
  const rawTimes = [10.5, 15.5, 20.5, 25.5];
  const refined = CookMode.refineTimes(steps, rawTimes, { durationSeconds: 675 });
  // 架空の按分 [10.5, 46, 81, 116] ではなく、元の根拠ある時刻がそのまま維持されること
  assert.deepEqual(refined, [10.5, 15.5, 20.5, 25.5]);
});

test("review fix (2026-10-31): adjusting the end moves the step that actually ends the segment, not a step with no time or a duplicate", () => {
  const fixes = [];
  const open = (times, videoId) => {
    CookMode.setRecipe({ title: "鶏むね", steps: ["下ごしらえ", "野菜を切る", "焼く", "炒める"], timesOf: () => times, timesFixed: true, videoId, ingredients: [], onTimeFix: (idx, sec) => fixes.push([idx, sec]) });
    CookMode.openMode();
    CookMode.setTimeTarget("end");
  };
  // 途中の手順に時刻がない（要確認）：終わり（121）は手順3の時刻。手順2には書き込まない
  open([16, null, 121, 200], "oWLCye3SXu4");
  assert.deepEqual(CookMode.segment(0), { start: 16, end: 121 });
  CookMode.nudgeTime("time-minus");
  assert.deepEqual(fixes.at(-1), [2, 116]);
  assert.deepEqual(CookMode.segment(0), { start: 16, end: 116 });
  assert.equal(CookMode.segment(1), null);
  // 同じ時刻が並ぶ（章がおおまか）：終わり（121）を決めているのは手順3
  open([16, 16, 121, 200], "oWLCye3SXu5");
  CookMode.nudgeTime("time-plus");
  assert.deepEqual(fixes.at(-1), [2, 126]);
});
