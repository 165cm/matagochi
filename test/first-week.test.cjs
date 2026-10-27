const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// 使い始めの週の見え方（2026-10-27 のユーザー目線のレビュー）：過去の週の帯・最初の買い物の時間・今日やること・保存の表示。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T10:00:00") { // 木曜・端末の時刻
  const ctx = vm.createContext({ console, URL, Date: fixedDate(now), document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
const startWeekday = (run) => run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "17:00" }); startRhythm(new Date());`);

test("week board: a week before the user started shows no 「決定 ✓」; a week whose days were all made still does", () => {
  const run = app();
  startWeekday(run);
  run("boardWeek = -1");
  assert.ok(!run("renderWeekBoard()").includes("決定"), "nothing was decided that week");
  run(`const r = allDinnerRecipes()[0]; for (const d of ["2026-09-21","2026-09-22","2026-09-23","2026-09-24","2026-09-25"]) state.mealSlots[d] = { date: d, status: "cooked", recipe: r };`);
  assert.ok(run("renderWeekBoard()").includes("決定 ✓"));
  run("boardWeek = 0");
  assert.ok(run("renderWeekBoard()").includes("受付中"), "the current week is unchanged");
});

test("first shopping uses the usual shopping time: today if it is still ahead, otherwise tomorrow — never late at night", () => {
  let run = app("2026-10-01T10:00:00");
  startWeekday(run);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.rhythm.kickoff)")), { start: "2026-10-02", dates: ["2026-10-02"], shopAt: "2026-10-01T17:00" });
  run = app("2026-10-01T23:10:00");
  startWeekday(run);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-02T17:00");
  run = app("2026-10-01T17:00:00");
  run(`state.rhythm = normalizeRhythm({ preset: "weekday", shopTime: "19:00" }); startRhythm(new Date());`);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-01T19:00", "the chosen time is used");
  // ちょうどその時刻に始めたら、もう間に合わないので明日。1分前なら今日。
  run = app("2026-10-01T17:00:00");
  startWeekday(run);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-02T17:00", "exactly at the shopping time → tomorrow");
  run = app("2026-10-01T16:59:00");
  startWeekday(run);
  assert.equal(run("state.rhythm.kickoff.shopAt"), "2026-10-01T17:00", "one minute before → today");
});

test("first shopping: when it falls at the same time as the next round's, the two rounds become one shopping trip", () => {
  const run = app("2026-09-29T23:10:00"); // 火曜の夜・3日＋3日（月火水／木金土）
  run(`state.rhythm = normalizeRhythm({ preset: "3day", shopTime: "17:00" }); startRhythm(new Date());`);
  const blocks = JSON.parse(run("JSON.stringify(currentBlocks().map((b) => ({ dates: b.dates, shopAt: b.shopAt })))"));
  assert.deepEqual(blocks[0], { dates: ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"], shopAt: "2026-09-30T17:00" });
  assert.equal(new Set(blocks.map((b) => b.shopAt)).size, blocks.length, "no two rounds share a shopping time");
  assert.deepEqual(JSON.parse(run("JSON.stringify(normalizeRhythm(JSON.parse(JSON.stringify(state.rhythm))).kickoff.dates)")), blocks[0].dates, "kept after saving");
});

test("joined first round: one shopping reminder, 「買い物済み」 covers all its days, and the next days stay in that round", () => {
  const run = app("2026-09-29T23:10:00"); // 火曜の夜・3日＋3日
  run(`state.rhythm = normalizeRhythm({ preset: "3day", shopTime: "17:00" }); startRhythm(new Date());`);
  const shops = JSON.parse(run("JSON.stringify(pushSchedule({ decide: true, shop: true }).filter((x) => x.id.startsWith('shop-')))"));
  const wed = shops.filter((x) => x.body.includes("水〜土"));
  assert.equal(wed.length, 1, "one reminder for the joined round");
  assert.equal(new Set(shops.map((x) => x.at)).size, shops.length, "no two shopping reminders at the same time");
  const decide = JSON.parse(run("JSON.stringify(pushSchedule({ decide: true, shop: true }).filter((x) => x.id.startsWith('decide-')))"));
  assert.equal(new Set(decide.map((x) => x.at)).size, decide.length, "no two 「決めよう」 reminders at the same time");
  // 買い物を済ませると、まとめた4日ぶんが「買い物済み」になり、次に決めるのは翌週の月〜水。
  const key = run("currentBlocks()[0].key");
  run(`state.shopDone = { [${JSON.stringify(key)}]: "2026-09-30T17:30" }`);
  assert.equal(run("blockStatus(currentBlocks()[0])"), "shopped");
  assert.deepEqual(JSON.parse(run("JSON.stringify(planningBlock().dates)")), ["2026-10-05", "2026-10-06", "2026-10-07"]);
  // 翌日（木曜）に開いても、木〜土は同じまとまりのまま（新しい買い物は増えない）。
  const saved = run("JSON.stringify({ rhythm: state.rhythm, shopDone: state.shopDone })");
  const later = app("2026-10-01T10:00:00");
  later(`Object.assign(state, ${saved}); state.rhythm = normalizeRhythm(state.rhythm);`);
  const b = JSON.parse(later("JSON.stringify(currentBlocks()[0])"));
  assert.deepEqual([b.dates, b.shopAt], [["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"], "2026-09-30T17:00"]);
  assert.equal(later("blockStatus(currentBlocks()[0])"), "shopped");
});

test("today's to-dos: only one of the extra questions at a time, and one already started comes first", () => {
  const run = app();
  const html = () => run("renderTodayTodos()");
  const count = (h) => ["スキル試験", "わが家のごはん方針", "好み・常備品まで教えると"].filter((w) => h.includes(w)).length;
  assert.equal(count(html()), 1);
  assert.ok(html().includes("スキル試験"));
  assert.ok(!html().includes("好みとキッチン"), "the kitchen was already asked in the first setup");
  run("state.skillProfile = { level: 2 }");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("わが家のごはん方針"));
  run("state.skillProfile = null; state.onboardingDraft = { step: 1 }");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("好み・常備品まで教えると"), "the detailed setup in progress comes first");
});

test("today's to-dos: a policy talk in progress comes first; once saved or closed, the next question shows", () => {
  const run = app();
  const html = () => run("renderTodayTodos()");
  const count = (h) => ["スキル試験", "わが家のごはん方針", "好み・常備品まで教えると"].filter((w) => h.includes(w)).length;
  run("talkProfile().session = { member: talkWho(), stage: 'ask', q: '', startedAt: '', updatedAt: '' }");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("わが家のごはん方針") && html().includes("続きから"), "the talk already started wins over the skill quiz");
  // 方針を保存し終えたら、方針の行は消えて次（スキル試験）へ。
  run("talkProfile().session = null; talkProfile().snapshots.push({ v: 1, at: '2026-10-01T00:00:00Z', member: talkWho(), reason: 'first', items: [] })");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("スキル試験") && !html().includes("わが家のごはん方針"));
  // 試験も済み、方針を ✕ で閉じた人には、詳しい設定が出る。
  run("state.skillProfile = { level: 2 }; talkProfile().snapshots = []; talkProfile().dismissedAt = '2026-10-01T00:00:00Z'");
  assert.equal(count(html()), 1);
  assert.ok(html().includes("好み・常備品まで教えると"));
  // 全部済んだら、追加の質問は出ない。
  run("state.foodProfile = Lifestyle.profile({ servings: 1, completed: true })");
  assert.equal(count(html()), 0);
});

test("save status: hidden while used alone on this device, shown once sharing is set up", () => {
  const run = app();
  assert.equal(run("renderSyncSavePanel()"), "");
  run("state.sync.roomId = 'room-1'");
  assert.ok(run("renderSyncSavePanel()").includes("sync-save-panel"));
});

test("save status: still shown when logged in, paused, in conflict, after a connection error, or with a restore point in settings", () => {
  const cases = {
    "logged in": "localStorage = { getItem: (k) => (k === 'ripigochi-session' ? 'token' : null), setItem() {}, removeItem() {} }",
    "paused": "state.sync.paused = true",
    "conflict": "state.sync.conflicts = { '2026-10-02': { remote: null } }",
    "connection error": "syncRuntimeStatus = 'つながりませんでした。'",
    "restore point": "state.view = 'settings'; state.sync.backupKey = 'backup-1'",
  };
  for (const [name, setup] of Object.entries(cases)) {
    const run = app();
    assert.equal(run("renderSyncSavePanel()"), "", `${name}: hidden before`);
    run(setup);
    assert.ok(run("renderSyncSavePanel()").includes("sync-save-panel"), `${name}: shown`);
  }
  const run = app();
  run("state.view = 'today'; state.sync.backupKey = 'backup-1'");
  assert.equal(run("renderSyncSavePanel()"), "", "the restore button lives only in settings");
});
