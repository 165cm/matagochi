// 好きな味：料理名の写真12枚（2026-10-28 のユーザーの判断「1 料理名の写真で選ぶ＋3 行動から学ぶ」に一本化）。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const L = require("../lifestyle.js");
const F = require("../taste.js");
const T = require("../profile-talk.js");

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};");
  return run;
}
const day = "2026-10-01";

test("the 12 photos are the ideal set the server collects first (same names, same order)", async () => {
  const ideal = await import(require("node:url").pathToFileURL(path.join(__dirname, "..", "api", "src", "ideal.js")).href);
  assert.deepEqual(F.IDEAL.map((d) => d.name), ideal.IDEAL_DISHES.map((d) => d.name));
  assert.deepEqual(F.IDEAL.map((d) => d.label), ideal.IDEAL_DISHES.map((d) => d.label));
  assert.deepEqual(F.normalizePicks(["mabo", "mabo", "constructor", "nope", 3, "omurice"]), ["mabo", "omurice"]);
});

test("a dish is matched by its dish name first, by its title only when it has none", () => {
  assert.equal(F.dishOf({ dish: "麻婆豆腐", title: "ご飯がすすむ！" })?.id, "mabo");
  assert.equal(F.dishOf({ title: "豚のしょうが焼き丼" })?.id, "shogayaki");
  assert.equal(F.dishOf({ dish: "麻婆なす", title: "麻婆豆腐風なす" }), null, "another dish name is not the picked dish");
  assert.equal(F.dishOf({ title: "鮭のホイル蒸し" })?.id, "salmonfoil");
});

test("score: +10 for the picked dish, +3 for each axis shared with at least a third of the picks (plain taste not counted)", () => {
  const picks = ["mabo", "hoikoro", "salmonfoil"];
  const mabo = { dish: "麻婆豆腐", title: "麻婆豆腐" };
  assert.deepEqual(F.pickScore(mabo, { protein: "eggtofu", cuisine: "chinese", mood: "spicy" }, picks), { score: 10 + 3 + 3 + 3, direct: true, axis: 9, label: "麻婆豆腐" });
  // 麻婆なす：中華・ピリ辛は選んだ2品と同じ。主役（肉）は回鍋肉だけ（3分の1）
  assert.equal(F.pickScore({ dish: "麻婆なす" }, { protein: "meat", cuisine: "chinese", mood: "spicy" }, picks).score, 9);
  assert.equal(F.pickScore({ title: "肉じゃが" }, { protein: "veg", cuisine: "western", mood: "plain" }, picks), null);
  assert.equal(F.pickScore(mabo, { protein: "eggtofu", cuisine: "chinese", mood: "spicy" }, []), null, "nothing picked: nothing added");
});

test("planning: picked dishes come first with a reason; before picking, the old answers still work", () => {
  const ginger = L.curated.find((r) => F.dishOf(r)?.id === "shogayaki");
  const burger = L.curated.find((r) => F.dishOf(r)?.id === "hamburg");
  const base = L.profile({ servings: 2 });
  const picked = L.profile({ servings: 2, dishPicks: ["shogayaki"], dishPicksAt: "2026-10-28T00:00:00Z" });
  const before = L.fit(ginger, base, day), after = L.fit(ginger, picked, day);
  assert.ok(after.reasons.includes("💛 選んだ豚の生姜焼き"), after.reasons.join());
  assert.equal(after.score - before.score, 10 + 3 + 3, "the dish, meat, Japanese");
  assert.ok(!L.fit(burger, picked, day).reasons.some((x) => x.startsWith("💛")));
  // 選ぶ前：以前の8枚の写真（likes）のまま
  const voted = L.profile({ servings: 2, tasteVotes: [{ id: "pork", vote: "like" }] });
  assert.equal(L.fit(ginger, voted, day).score, L.fit(ginger, L.profile({ servings: 2, tasteVotes: [{ id: "pork", vote: "like" }], dishPicks: ["omurice"] }), day).score, "picks without the time they were chosen are not used yet");
  // 保存して読み直しても残る
  assert.deepEqual(L.profile(JSON.parse(JSON.stringify(picked))).dishPicks, ["shogayaki"]);
  assert.equal(L.profile(JSON.parse(JSON.stringify(picked))).dishPicksAt, "2026-10-28T00:00:00Z");
});

test("old answers are carried over as a first selection on the photo screen", () => {
  assert.deepEqual(F.fromOld({ talkTastes: ["spicy"] }), ["hoikoro", "mabo"]);
  assert.deepEqual(F.fromOld({ tastes: ["洋風"], tasteVotes: [{ id: "salmon", vote: "like" }, { id: "udon", vote: "pass" }] }), ["hamburg", "omurice", "salmonfoil"]);
  assert.deepEqual(F.fromOld({}), []);
});

test("ごはん方針: the taste question is the 12 photos; picking saves them to the settings and the dinner plan uses them", () => {
  const run = app();
  run("state.foodProfile = Lifestyle.profile({ servings: 2, completed: true }); handleDailyAction('life-talk-open',{}); handleDailyAction('life-talk-pick',{q:'want',value:'none'})");
  let html = run("renderTalk()");
  assert.ok(html.includes("食べたい料理は？"));
  assert.equal((html.match(/class="dp-tile"/g) || []).length, 12);
  assert.ok(!html.includes("よく食べたい味は？"), "the old taste question is not asked");
  run("handleDailyAction('life-talk-toggle',{q:'dishes',value:'shogayaki'}); handleDailyAction('life-talk-toggle',{q:'dishes',value:'mabo'}); handleDailyAction('life-talk-multi-done',{q:'dishes'})");
  assert.equal(run("state.foodProfile.dishPicks.join()"), "shogayaki,mabo");
  assert.ok(run("!!state.foodProfile.dishPicksAt"));
  assert.ok(run("renderTalk()").includes("平日の夜、ゆずれないのは？"));
  const ginger = L.curated.find((r) => F.dishOf(r)?.id === "shogayaki");
  assert.ok(JSON.parse(run(`JSON.stringify(Lifestyle.fit(Lifestyle.curated.find((r) => r.id === ${JSON.stringify(ginger.id)}), dailyProfile(), "${day}").reasons)`)).includes("💛 選んだ豚の生姜焼き"));
});

test("ごはん方針: someone who answered the old taste question sees their dishes already selected; deciding keeps them", () => {
  const run = app();
  const who = run("talkWho()");
  const old = T.answer(T.answer(T.empty(), { member: who, q: "want", value: "none", at: "2026-10-01T00:00:00Z" }), { member: who, q: "taste", value: ["light"], at: "2026-10-01T00:00:01Z" });
  run(`state.foodProfile = Lifestyle.profile({ servings: 2, completed: true }); state.tasteProfile = ${JSON.stringify(old)}; handleDailyAction('life-talk-open',{}); handleDailyAction('life-talk-ask',{})`);
  const html = run("renderTalk()");
  assert.ok(html.includes("以前の答えから選んでおきました"));
  assert.ok(html.includes('data-value="reishabu" aria-pressed="true"') && html.includes('data-value="salmonfoil" aria-pressed="true"'), "さっぱり → 冷しゃぶ・鮭のホイル焼き");
  assert.ok(!html.includes('data-action="life-talk-multi-done" data-q="dishes" disabled'));
  assert.equal(run("state.foodProfile.dishPicks.length"), 0, "nothing is saved until the person decides");
  run("handleDailyAction('life-talk-multi-done',{q:'dishes'})");
  assert.equal(run("state.foodProfile.dishPicks.join()"), "reishabu,salmonfoil");
  // 以前の答えから生まれた方針（さっぱり好き）は、そのまま（方針の画面で ✕ にできる）
  assert.ok(T.interpret(JSON.parse(run("JSON.stringify(state.tasteProfile)")), who).some((x) => x.id === "taste-light" && x.status === "confirmed"));
});

test("detailed settings: the 8 swipe cards are now the same 12 photos, then the 'which one?' questions", () => {
  const run = app();
  run("state.foodProfile = Lifestyle.profile({ servings: 2, completed: true }); profileDraft().step = 4");
  let html = run("renderTasteQuiz()");
  assert.equal((html.match(/class="dp-tile"/g) || []).length, 12);
  assert.ok(!html.includes("今夜、食べたい？"), "no swipe cards");
  run("dishPickDraft = ['omurice','meuniere']");
  run("handleDailyAction('life-next',{})");
  assert.equal(run("state.onboardingDraft.dishPicks.join()"), "omurice,meuniere", "going next keeps what was selected");
  assert.equal(run("ProfileTalk.answersOf(state.tasteProfile, talkWho()).dishes.join()"), "omurice,meuniere", "and the policy talk does not ask again");
  run("state.onboardingDraft.step = 4");
  html = run("renderTasteQuiz()");
  assert.ok(html.includes("迷ったら、どっち？"), "picked: on to the dinner-type questions");
});

test("the chain-shop genre is no longer turned into a taste when the first run ends", () => {
  const run = app();
  run("state.onboarded = false; handleDailyAction('life-quick',{}); state.onboardingDraft.chains = ['ohsho','hidakaya']; handleDailyAction('life-finish',{})");
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.foodProfile.tastes)")), []);
});

test("learning from records: Chinese, Western and egg/tofu dishes that keep being loved are suggested", () => {
  const recipes = [1, 2, 3].map((i) => ({ id: `c${i}`, title: `回鍋肉${i}`, ingredients: [{ name: "豚バラ" }, { name: "キャベツ" }, { name: "豆板醤" }], steps: [] }));
  const evaluations = recipes.map((r, i) => ({ recipeId: r.id, cookedAt: `2026-10-2${i}`, familyRepeatCycles: { わたし: "weekly" } }));
  const out = T.evidence(T.empty(), "わたし", { evaluations, recipeOf: (id) => recipes.find((r) => r.id === id), today: "2026-10-28", limit: 5 });
  assert.ok(out.some((x) => x.id === "chinese" && x.kind === "add" && x.lean === "taste-chinese"), JSON.stringify(out.map((x) => x.id)));
  assert.ok(T.LEANS["taste-chinese"].match(recipes[0]));
  assert.ok(!T.LEANS["taste-western"].match(recipes[0]));
});
