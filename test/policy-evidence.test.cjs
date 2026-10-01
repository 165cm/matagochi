const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const L = require("../lifestyle.js");
const T = require("../profile-talk.js");

// PR 6b（docs/PERSONALIZE_PLAN.md §10）：方針と最近の評価を比べ、根拠（品数・料理名）つきで「〜を増やしますか？」「見直しますか？」。
// 決めるのは本人。採用したら方針の版に「記録から」と根拠を残す。
const byId = (id) => L.curated.find((r) => r.id === id);
const ev = (id, recipeId, cookedAt, cycles) => ({ id, recipeId, cookedAt, familyRepeatCycles: cycles, updatedAt: cookedAt + "T12:00:00Z" });
const FISH = [
  ev("f1", "starter-04", "2026-09-20", { わたし: "weekly", パパ: "monthly" }),
  ev("f2", "starter-02", "2026-09-22", { わたし: "tomorrow" }),
  ev("f3", "starter-19", "2026-09-25", { わたし: "monthly" }),
];
const opts = (evaluations, extra = {}) => ({ evaluations, recipeOf: byId, today: "2026-10-01", limit: 10, ...extra });
const fishOf = (list) => list.find((x) => x.id === "fish");

test("PR 6b: 2 of 3 fish dishes loved → suggests more easy fish, with the evidence (count and names)", () => {
  const got = fishOf(T.evidence(T.empty(), "わたし", opts(FISH)));
  assert.equal(got.kind, "add");
  assert.equal(got.lean, "fish-easy");
  assert.equal(got.note, "魚料理3品のうち2品が「また食べたい」");
  assert.deepEqual(got.names.sort(), [byId("starter-04").title, byId("starter-02").title].sort());
  assert.match(got.ask, /蒸し・レンジの魚料理を増やしますか？/);
  // パパは1品しか答えていない → パパには出さない（その人の評価だけで見る）
  assert.equal(fishOf(T.evidence(T.empty(), "パパ", opts(FISH))), undefined);
  // 2品だけでは出さない・古い記録（90日より前）は数えない
  assert.equal(fishOf(T.evidence(T.empty(), "わたし", opts(FISH.slice(0, 2)))), undefined);
  assert.equal(fishOf(T.evidence(T.empty(), "わたし", opts(FISH.map((e) => ({ ...e, cookedAt: "2026-05-01" }))))), undefined);
  // 本人が「違う」にした方針は、記録があっても勧めない
  const no = T.decide(T.empty(), { member: "わたし", id: "fish-easy", status: "rejected", at: "2026-09-30T00:00:00Z" });
  assert.equal(fishOf(T.evidence(no, "わたし", opts(FISH))), undefined);
});

test("PR 6b: uses each person's latest rating — a newer record by someone else does not hide mine", () => {
  const more = [...FISH, ev("f4", "starter-04", "2026-09-28", { パパ: "never" })];
  assert.equal(fishOf(T.evidence(T.empty(), "わたし", opts(more))).loved, 2);
  // 自分の新しい記録は効く：starter-04 を「月1回」にしたら、3品のうち1品 → 出さない
  const mine = [...FISH, ev("f5", "starter-04", "2026-09-29", { わたし: "monthly" })];
  assert.equal(fishOf(T.evidence(T.empty(), "わたし", opts(mine))), undefined);
});

test("PR 6b: adopting records a policy version with reason 'evidence' and the note; the plan uses it", () => {
  const item = fishOf(T.evidence(T.empty(), "わたし", opts(FISH)));
  const p = T.adoptEvidence(T.empty(), { member: "わたし", item, at: "2026-10-01T01:00:00Z" });
  const it = T.interpret(p, "わたし").find((x) => x.id === "fish-easy");
  assert.equal(it.status, "confirmed");
  assert.equal(it.source, "records");
  const snap = p.snapshots.at(-1);
  assert.equal(snap.reason, "evidence");
  assert.equal(snap.note, "魚料理3品のうち2品が「また食べたい」");
  assert.deepEqual(snap.items, [{ id: "fish-easy", status: "confirmed" }]);
  assert.equal(T.history(p, "わたし")[0].note, snap.note);
  assert.ok(T.leaner(p, "わたし")(byId("starter-11")), "the plan gives a boost to steamed fish");
  // 保存し直しても残る（via・理由・根拠）
  const back = T.normalize(JSON.parse(JSON.stringify(p)));
  assert.equal(T.interpret(back, "わたし").find((x) => x.id === "fish-easy").source, "records");
  assert.equal(back.snapshots.at(-1).reason, "evidence");
  assert.equal(back.snapshots.at(-1).note, snap.note);
  // 採用したら、もう「増やしますか？」は出ない
  assert.equal(fishOf(T.evidence(p, "わたし", opts(FISH))), undefined);
  // 書きかえた提案（テーマと方針の組が違う）は受け付けない
  assert.equal(T.adoptEvidence(T.empty(), { member: "わたし", item: { ...item, lean: "life-knife" }, at: "x" }).snapshots.length, 0);
});

test("PR 6b: a confirmed policy with no loved dishes in 3+ tries → asks to review it; 'このまま' waits until 2 more dishes", () => {
  let p = T.answer(T.empty(), { member: "わたし", q: "want", value: "fish", at: "2026-09-01T00:00:00Z" });
  p = T.answer(p, { member: "わたし", q: "why", value: "clean", at: "2026-09-01T00:00:01Z" });
  p = T.decide(p, { member: "わたし", id: "fish-easy", status: "confirmed", at: "2026-09-01T00:00:02Z" });
  const cool = FISH.map((e) => ({ ...e, familyRepeatCycles: { わたし: e.id === "f2" ? "twice_month" : "pause" } }));
  const item = fishOf(T.evidence(p, "わたし", opts(cool)));
  assert.equal(item.kind, "drop");
  assert.equal(item.note, "魚料理3品に「また食べたい」がまだありません");
  assert.match(item.ask, /見直しますか？/);
  const kept = T.skipEvidence(p, { member: "わたし", item, at: "2026-10-01T00:00:00Z" });
  assert.equal(T.interpret(kept, "わたし").find((x) => x.id === "fish-easy").status, "confirmed", "the policy is unchanged");
  assert.equal(fishOf(T.evidence(kept, "わたし", opts(cool))), undefined);
  const plus = [...cool, ev("f6", "starter-11", "2026-09-29", { わたし: "never" }), ev("f7", "starter-30", "2026-09-30", { わたし: "monthly" })];
  assert.equal(fishOf(T.evidence(T.normalize(JSON.parse(JSON.stringify(kept))), "わたし", opts(plus))).kind, "drop", "asks again after 2 more fish dishes");
  const dropped = T.adoptEvidence(p, { member: "わたし", item, at: "2026-10-01T00:00:00Z" });
  assert.equal(T.interpret(dropped, "わたし").find((x) => x.id === "fish-easy").status, "rejected");
  assert.equal(T.leaner(dropped, "わたし")(byId("starter-11")), null);
});

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  }
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};toasts=[];showToast=(m)=>toasts.push(m);");
  return run;
}
const seed = (run) => {
  const list = FISH.map((e, i) => ({ ...e, familyRepeatCycles: { [run("talkWho()")]: e.familyRepeatCycles.わたし } }));
  run(`state.evaluations = ${JSON.stringify(list)}.map((e, i) => ({ ...e, cookedAt: addDays(today(), -3 - i) }));`);
};

test("PR 6b: the reflection shows one suggestion; '増やす' updates the policy and the plan without opening a conversation", () => {
  const run = app();
  seed(run);
  const html = run("renderReflection()");
  assert.match(html, /💬 方針に入れる？/);
  assert.match(html, /魚料理3品のうち2品が「また食べたい」/);
  assert.equal((html.match(/class="evidence-card"/g) || []).length, 1, "one at a time");
  run(`handleDailyAction("life-talk-evidence", { id: "fish", kind: "add", answer: "yes" })`);
  assert.equal(run("state.tasteProfile.session"), null, "no half-finished conversation is left behind");
  assert.equal(run(`ProfileTalk.interpret(state.tasteProfile, talkWho()).find((x) => x.id === "fish-easy").status`), "confirmed");
  assert.match(run("toasts.at(-1)"), /方針に入れました（版1）/);
  assert.doesNotMatch(run("renderReflection()"), /魚料理3品/);
  const view = run("openTalk('view'); renderTalkView()");
  assert.match(view, /（記録から）/);
  assert.match(view, /版1<\/b> <span>[^<]*・記録から<\/span><small>魚料理3品のうち2品が「また食べたい」<\/small>/);
  assert.equal(run("ProfileTalk.leaner(state.tasteProfile, talkWho())(Lifestyle.curated.find((r) => r.id === 'starter-11')) !== null"), true);
});

test("PR 6b: 'いまはいい' leaves the policy alone; a forged button or a viewer cannot change it", () => {
  const run = app();
  seed(run);
  run(`handleDailyAction("life-talk-evidence", { id: "fish", kind: "add", answer: "no" })`);
  assert.equal(run("state.tasteProfile.snapshots.length"), 0);
  assert.equal(run(`ProfileTalk.interpret(state.tasteProfile, talkWho()).some((x) => x.id === "fish-easy")`), false);
  assert.doesNotMatch(run("renderReflection()"), /魚料理3品/);
  const run2 = app();
  seed(run2);
  run2(`handleDailyAction("life-talk-evidence", { id: "spicy", kind: "add", answer: "yes" })`);
  run2(`handleDailyAction("life-talk-evidence", { id: "fish", kind: "drop", answer: "yes" })`);
  assert.equal(run2("(state.tasteProfile?.snapshots || []).length"), 0, "only suggestions the records support can be adopted");
  run2(`isViewer = () => true`);
  assert.doesNotMatch(run2("renderReflection()"), /方針に入れる？/);
  run2(`handleDailyAction("life-talk-evidence", { id: "fish", kind: "add", answer: "yes" })`);
  assert.equal(run2("(state.tasteProfile?.snapshots || []).length"), 0);
});

test("review fix (#110): what came only from the records ('増やす' or 'いまはいい') can be erased with '答えを消す'", () => {
  for (const answer of ["yes", "no"]) {
    const run = app();
    seed(run);
    run(`handleDailyAction("life-talk-evidence", { id: "fish", kind: "add", answer: ${JSON.stringify(answer)} })`);
    run(`handleDailyAction("life-talk-view", {}); handleDailyAction("life-talk-open-check", {})`);
    assert.match(run("renderTalkCheck()"), /data-action="life-talk-reset"/, answer);
    run(`handleDailyAction("life-talk-reset", {})`);
    const p = JSON.parse(run("JSON.stringify(state.tasteProfile)"));
    assert.deepEqual([p.snapshots.length, Object.keys(p.decisions).length, Object.keys(p.evidence || {}).length], [0, 0, 0], answer);
    // 消したあとは、もう消すものがないのでボタンは出ない
    run(`handleDailyAction("life-talk-open", {}); handleDailyAction("life-talk-open-check", {})`);
    assert.doesNotMatch(run("renderTalkCheck()"), /life-talk-reset/, answer);
  }
});
