const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");
const { coverage, markdown } = require("../scripts/catalog-coverage.cjs");

// PR 4a（docs/PERSONALIZE_PLAN.md §7.2）：品ぞろえの棚卸し。実際にある料理だけを数え、条件で何品残るかを Lifestyle.fit で見る。
const meta = (minutes, extra = {}) => ({ ingredientsVerified: true, minutes, easy: true, tasks: [], noEquipment: true, conditionsConfirmed: true, ...extra });
const R = (id, title, ingredients, minutes, extra = {}) => ({ id, title, mealType: "dinner", sourceServings: 2, ingredients: ingredients.map((name) => ({ name, amount: "1" })), steps: [], planning: meta(minutes, extra) });
const FIXTURE = [
  R("a", "鶏の照り焼き", ["鶏もも肉", "しょうゆ"], 15, { contains: ["肉"] }),
  R("b", "豚のしょうが焼き", ["豚こま", "しょうが"], 20, { contains: ["肉"] }),
  R("c", "鮭のホイル蒸し", ["鮭", "きのこ"], 25, { contains: ["魚"] }),
  R("d", "卵とじ丼", ["卵", "ごはん"], 10, { contains: ["卵"] }),
  R("e", "肉じゃが", ["牛こま", "じゃがいも"], 40, { contains: ["肉"] }),
  { ...R("f", "お弁当のおにぎり", ["ごはん"], 5), mealType: "lunch" },
];

test("PR 4a: counts only the dishes that exist, by main ingredient × time, and flags thin cells", () => {
  const c = coverage(FIXTURE);
  assert.equal(c.total, 5, "lunch is not counted; nothing is padded");
  const row = (id) => c.grid.find((g) => g.id === id);
  assert.deepEqual([row("meat").t10, row("meat").t20, row("meat").t30, row("meat").t31], [0, 2, 0, 1]);
  assert.equal(row("fish").t30, 1);
  assert.equal(row("eggtofu").t10, 1);
  assert.deepEqual(row("meat").short, ["10分以内", "11〜20分", "21〜30分"], "fewer than 3 in each cell within 30 minutes");
  assert.equal(c.grid.reduce((n, g) => n + g.total, 0), 5);
});

test("PR 4a: how many dishes are left under common conditions uses Lifestyle.fit (conditions are never loosened)", () => {
  const c = coverage(FIXTURE);
  const n = (label) => c.conditions.find((x) => x.label === label).n;
  assert.equal(n("条件なし"), 5);
  assert.equal(n("平日20分以内"), 3, "25分・40分 are out");
  assert.equal(n("卵なし"), 4);
  assert.equal(n("魚なし"), 4);
  assert.equal(n("肉なし"), 2);
  assert.equal(c.conditions.find((x) => x.label === "条件なし").week, false, "5 dishes is not a week");
  // 確認していない料理（材料・時間が未確認）は、条件がなくても数えない
  const unverified = { ...FIXTURE[0], id: "u", planning: { minutes: 10 } };
  assert.equal(coverage([unverified]).conditions[0].n, 0);
});

test("PR 4a: docs/CATALOG_COVERAGE.md is the current output for the built-in dishes (run node scripts/catalog-coverage.cjs)", () => {
  const file = fs.readFileSync(path.join(__dirname, "..", "docs", "CATALOG_COVERAGE.md"), "utf8");
  assert.equal(file, markdown(coverage(L.curated), "アプリに最初から入っているおすすめ料理（`Lifestyle.curated`）"));
  assert.match(file, new RegExp(`\\*\\*${L.curated.length}品\\*\\*`));
});

function app(now = "2026-10-01T03:00:00Z") {
  const t = Date.parse(now);
  const D = class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
  const ctx = vm.createContext({ console, URL, Date: D, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}

test("PR 4a: when too few dishes fit and one repeats, the plan says so (and does not loosen the conditions)", () => {
  const run = app();
  assert.doesNotMatch(run("renderDailyPlan()"), /plan-short/, "enough dishes: no note");
  // 卵・乳・小麦・魚・肉なし ＋ 平日10分 → 合う料理はほとんどない
  run(`state.foodProfile = Lifestyle.profile({ completed: true, restrictions: ["卵", "乳", "小麦", "魚"], weekdayMinutes: 15, weekendMinutes: 10 });`);
  const plan = JSON.parse(run("JSON.stringify(dailyPlan().map((d) => ({ id: d.candidate?.recipe?.id || '', repeated: !!d.candidate?.repeated, ok: d.candidate ? Lifestyle.fit(d.candidate.recipe, dailyProfile(), d.date).ok : true })))"));
  assert.ok(plan.every((d) => d.ok), "every dish shown still fits the conditions");
  const repeats = plan.filter((d) => d.repeated).length;
  assert.ok(repeats > 0, JSON.stringify(plan));
  const html = run("renderDailyPlan()");
  assert.match(html, new RegExp(`同じ料理が${repeats}回出ています`));
  assert.match(html, /data-view="collection"[^>]*>レシピを足す/);
  run("isViewer = () => true");
  assert.doesNotMatch(run("renderDailyPlan()"), /plan-short/);
});
