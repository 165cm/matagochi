const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

// PR 5b（docs/PERSONALIZE_PLAN.md §9）：献立を変えた時の買い物の差分（品名）・残っている食材・後半の組み直し。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T03:00:00Z") {
  const ctx = vm.createContext({ console, URL, Date: fixedDate(now), document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};globalThis.toasts=[];showToast=(m)=>toasts.push(m)");
  return run;
}
const J = (run, code) => JSON.parse(run(`JSON.stringify(${code})`));

test("PR 5b: confirmed leftovers score like 'use up' (once, not twice), name the ingredient, and never relax restrictions", () => {
  const cabbage = L.curated.find((r) => r.ingredients.some((i) => /キャベツ/.test(i.name)));
  assert.ok(cabbage, "a starter recipe with cabbage");
  const base = L.profile({ servings: 2 });
  const plain = L.fit(cabbage, base, "2026-10-02");
  const left = L.fit(cabbage, L.profile({ servings: 2, leftovers: ["キャベツ"] }), "2026-10-02");
  assert.equal(left.score - plain.score, 20);
  assert.ok(left.reasons.includes("🧺 残りのキャベツを使う"));
  const both = L.fit(cabbage, L.profile({ servings: 2, leftovers: ["キャベツ"], useUp: ["キャベツ"], useUpUntil: "2026-10-09" }), "2026-10-02");
  assert.equal(both.score - plain.score, 20, "not counted twice");
  const blocked = L.fit(cabbage, L.profile({ servings: 2, leftovers: ["キャベツ"], restrictions: [cabbage.ingredients[0].name] }), "2026-10-02");
  assert.equal(blocked.ok, L.fit(cabbage, L.profile({ servings: 2, restrictions: [cabbage.ingredients[0].name] }), "2026-10-02").ok, "same verdict as without leftovers");
});

test("PR 5b: swapping a dish after buying shows the change by name — added, no longer needed, and bought-but-unused — and can put those into leftovers", () => {
  const run = app();
  run(`const plan = dailyPlan(); const d = plan.find((x) => x.candidate && x.date >= today()); confirmDaily(d); globalThis.day = d.date;`);
  const day = run("day");
  const before = J(run, "dailyShopping().filter((x) => x.status === 'buy').map((x) => ({ id: x.id, name: x.name, signature: x.signature }))");
  // 1品を買った印にする
  const bought = before[0];
  run(`state.shoppingMarks[${JSON.stringify(bought.id)}] = { status: "purchased", signature: ${JSON.stringify(bought.signature)}, updatedAt: nowIso() };`);
  // その食材を使わない別の料理に入れ替える
  const other = run(`allDinnerRecipes().find((r) => Lifestyle.fit(r, dailyProfile(), ${JSON.stringify(day)}).ok && !r.ingredients.some((i) => Lifestyle.shoppingName(i.name) === ${JSON.stringify(bought.name)}) && r.id !== state.mealSlots[${JSON.stringify(day)}].recipe.id)?.id`);
  assert.ok(other);
  run(`handleDailyAction("life-choose", { date: ${JSON.stringify(day)}, recipe: ${JSON.stringify(other)} })`);
  const diff = J(run, "shoppingNotice");
  assert.ok(diff.bought.includes(bought.name), "bought but no longer used");
  assert.ok(diff.added.length > 0);
  assert.match(run("toasts.at(-1)"), /買い物：/);
  const html = run("renderDailyShopping()");
  assert.match(html, /献立を変えたので、買い物が変わりました/);
  assert.match(html, /もう買ってあるのに、使わなくなった/);
  assert.ok(html.includes(bought.name));
  run(`handleDailyAction("life-shopdiff-leftover", {})`);
  assert.ok(J(run, "activeLeftovers()").includes(bought.name));
  assert.deepEqual(J(run, "shoppingNotice.bought"), []);
  run(`handleDailyAction("life-shopdiff-close", {})`);
  assert.doesNotMatch(run("renderDailyShopping()"), /献立を変えたので/);
});

test("PR 5b: leftovers are chosen by the person (candidates are only suggestions), expire after 7 days, and sync as a whole, newer wins", () => {
  const run = app();
  run(`state.shopDone = { "2026-09-28": "2026-09-27T09:00:00.000Z" };
    state.shoppingMarks = { "もやし": { status: "purchased", signature: "x", updatedAt: "2026-09-29T00:00:00.000Z" }, "古い品": { status: "purchased", signature: "x", updatedAt: "2026-09-01T00:00:00.000Z" } };
    state.mealSlots["2026-09-30"] = { date: "2026-09-30", status: "confirmed", recipe: { id: "r1", title: "豚キャベツ", ingredients: [{ name: "豚こま", amount: "200g" }, { name: "水", amount: "100ml" }] }, updatedAt: "2026-09-27T10:00:00.000Z" };`);
  const cand = J(run, "leftoverCandidates()");
  assert.ok(cand.includes("もやし") && cand.includes("豚こま"), cand.join());
  assert.ok(!cand.includes("古い品") && !cand.includes("水"), "old marks and water are not suggested");
  assert.deepEqual(J(run, "activeLeftovers()"), [], "nothing is used until chosen");
  let html = run("renderDailyPlan()");
  assert.match(html, /家に残っている食材/);
  assert.doesNotMatch(html, /組み直す/, "no rebuild button before choosing");
  run(`handleDailyAction("life-leftover", { name: "もやし" })`);
  assert.deepEqual(J(run, "activeLeftovers()"), ["もやし"]);
  assert.equal(J(run, "dailyProfile().leftovers").join(), "もやし");
  run(`handleDailyAction("life-leftover", { name: "もやし" })`);
  assert.deepEqual(J(run, "activeLeftovers()"), [], "tap again to remove");
  // 7日を過ぎたものは使わない
  run(`state.leftovers = normalizeLeftovers({ items: { "キャベツ": { at: "2026-09-20T00:00:00.000Z" }, "豆腐": { at: "2026-09-30T00:00:00.000Z" } }, updatedAt: "2026-09-30T00:00:00.000Z" })`);
  assert.deepEqual(J(run, "activeLeftovers()"), ["豆腐"]);
  // 形の検査・同期
  const messy = J(run, `normalizeLeftovers({ items: { "  ": {}, ["x".repeat(50)]: { at: "bad" }, "卵": { at: "2026-09-30T00:00:00.000Z" } }, updatedAt: 5 })`);
  assert.deepEqual(Object.keys(messy.items), ["x".repeat(30), "卵"]);
  assert.deepEqual(J(run, `normalizeLeftovers(${JSON.stringify(messy)})`), messy);
  const newer = { items: { "にんじん": { at: "2026-10-01T00:00:00.000Z" } }, updatedAt: "2026-10-01T01:00:00.000Z" };
  run(`applySyncPayload(mergeSyncPayloads(buildSyncPayload(), { ...buildSyncPayload(), leftovers: ${JSON.stringify(newer)} }))`);
  assert.deepEqual(Object.keys(J(run, "state.leftovers.items")), ["にんじん"]);
  run(`applySyncPayload(mergeSyncPayloads(buildSyncPayload(), { ...buildSyncPayload(), leftovers: { items: {}, updatedAt: "2026-09-01T00:00:00.000Z" } }))`);
  assert.deepEqual(Object.keys(J(run, "state.leftovers.items")), ["にんじん"], "an older one does not overwrite");
});

test("PR 5b: rebuilding with leftovers redraws only the undecided days (confirmed ones stay) and the list keeps the item with a hint", () => {
  const run = app();
  run(`state.shopDone = { "2026-09-28": "2026-09-27T09:00:00.000Z" };`);
  const plan = J(run, "dailyPlan().filter((d) => d.candidate && !d.off).map((d) => d.date)");
  assert.ok(plan.length >= 2);
  run(`confirmDaily(dailyPlan().find((d) => d.date === ${JSON.stringify(plan[0])}))`);
  const fixed = run(`state.mealSlots[${JSON.stringify(plan[0])}].recipe.id`);
  run(`state.planOverrides[${JSON.stringify(plan[1])}] = allDinnerRecipes()[0].id;`);
  // 残っている食材：どれかの定番に入っている食材
  const name = run(`Lifestyle.shoppingName(allDinnerRecipes().find((r) => Lifestyle.fit(r, dailyProfile(), ${JSON.stringify(plan[1])}).ok).ingredients[0].name)`);
  run(`handleDailyAction("life-leftover-add", {})`); // 入力が空なら何もしない
  assert.deepEqual(J(run, "activeLeftovers()"), []);
  run(`setLeftover(${JSON.stringify(name)}, true)`);
  assert.match(run("renderDailyPlan()"), /この食材で組み直す[\s\S]*まだ決めていない\d+日だけ/);
  run(`handleDailyAction("life-leftover-rebuild", {})`);
  assert.equal(run(`state.planOverrides[${JSON.stringify(plan[1])}]`), undefined, "the undecided day is redrawn");
  assert.equal(run(`state.mealSlots[${JSON.stringify(plan[0])}].recipe.id`), fixed, "a confirmed dinner is never replaced");
  assert.match(run("toasts.at(-1)"), /決めた献立はそのまま/);
  const reasons = J(run, "dailyPlan().filter((d) => !d.slot && d.candidate).map((d) => d.candidate.reasons).flat()");
  assert.ok(reasons.some((r) => r === `🧺 残りの${name}を使う`), "a proposal uses the leftover");
  // 買い物リスト：残っていても買う物から勝手に外さない。「残りあり」と出す
  run(`dailyPlan().filter((d) => d.candidate && !d.slot).forEach((d) => confirmDaily(d))`);
  const row = J(run, `dailyShopping().find((x) => x.name === ${JSON.stringify(name)})`);
  if (row) {
    assert.equal(row.status === "buy" || row.status === "have", true);
    assert.match(run("renderDailyShopping()"), /🧺 残りあり/);
  }
});
