const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const L = require("../lifestyle.js");

const meta = (minutes, extra = {}) => ({
  ingredientsVerified: true,
  minutes,
  easy: true,
  tasks: [],
  noEquipment: true,
  conditionsConfirmed: true,
  ...extra,
});
const recipe = (id, title, minutes, extra = {}) => ({
  id,
  title,
  mealType: "dinner",
  sourceServings: 2,
  ingredients: [{ name: "鶏もも肉", amount: "1" }],
  steps: ["焼く"],
  planning: meta(minutes, extra),
});

test("Lifestyle.widenHints: detects weekdayMinutes bottlenecks and never touches restrictions", () => {
  const r10 = recipe("r10", "10分料理", 10);
  const r15 = recipe("r15", "15分料理", 15);
  const r20 = recipe("r20", "20分料理", 20);
  const r30 = recipe("r30", "30分料理", 30);
  const all = [r10, r15, r20, r30];

  const p = L.profile({ completed: true, weekdayMinutes: 10, restrictions: ["卵"] });
  const hints = L.widenHints({ recipes: all, profile: p, dates: ["2026-10-01"] }); // 10/1 is Thursday (weekday)
  assert.equal(hints.length, 1);
  assert.equal(hints[0].key, "weekdayMinutes");
  assert.equal(hints[0].value, 15);
  assert.equal(hints[0].gain, 1);
  assert.match(hints[0].label, /平日10分→15分（＋1品）/);

  // restrictions are never loosened or suggested
  assert.ok(!hints.some((h) => h.key === "restrictions"));
});

test("Lifestyle.widenHints: detects skillLevel and skill: easy bottlenecks", () => {
  const rEasy = recipe("rEasy", "かんたん料理", 15, { easy: true });
  const rHard = recipe("rHard", "本格料理", 15, { easy: false });
  const hints = L.widenHints({
    recipes: [rEasy, rHard],
    profile: L.profile({ completed: true, skill: "easy" }),
    dates: ["2026-10-01"],
  });
  assert.ok(hints.some((h) => h.key === "skill" && h.value === "any" && h.gain === 1));
});

function app(now = "2026-10-01T03:00:00Z") {
  const t = Date.parse(now);
  const D = class extends Date {
    constructor(...a) {
      if (a.length) super(...a);
      else super(t);
    }
    static now() {
      return t;
    }
  };
  const ctx = vm.createContext({
    console,
    URL,
    Date: D,
    document: { querySelector: () => null, querySelectorAll: () => [] },
  });
  for (const f of [
    "dinner-persona.js",
    "taste.js",
    "taste-ui.js",
    "starter-recipes.js",
    "skills.js",
    "aisles.js",
    "lifestyle.js",
    "profile-talk.js",
    "talk-ui.js",
    "daily-ui.js",
    "playlist-import.js",
    "household.js",
    "skill-quiz.js",
    "cook-level.js",
    "weekly.js",
    "cook-type.js",
    "plan-moves.js",
    "plus.js",
    "cook-mode.js",
    "folders.js",
    "install.js",
    "push.js",
    "tickets.js",
    "account.js",
    "discover.js",
    "app.js",
  ]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}

test("renderDailyPlan shows life-widen button when dishes repeat and clicking relaxes condition", () => {
  const run = app();
  // 卵・乳・小麦・魚なし ＋ 15分以内の厳しい条件で料理が重複する
  run('state.foodProfile = Lifestyle.profile({ completed: true, restrictions: ["卵", "乳", "小麦", "魚"], weekdayMinutes: 15, weekendMinutes: 10 });');
  const html = run("renderDailyPlan()");
  assert.match(html, /data-action="life-widen"/);
  assert.match(html, /平日15分→20分/);

  // life-widen action updates profile
  run('handleDailyAction("life-widen", { key: "weekdayMinutes", value: "20" });');
  assert.equal(run("state.foodProfile.weekdayMinutes"), 20);

  // viewer is blocked
  run("isViewer = () => true;");
  assert.doesNotMatch(run("renderDailyPlan()"), /data-action="life-widen"/);
  assert.equal(run('handleDailyAction("life-widen", { key: "weekdayMinutes", value: "30" });'), true);
  assert.equal(run("state.foodProfile.weekdayMinutes"), 20); // unchanged
});
