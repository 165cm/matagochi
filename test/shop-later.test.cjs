const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// PR 5c（docs/PERSONALIZE_PLAN.md §9）：保存できる日数を推測で保証しない。傷みやすい食材を後半の日に使う時は「その前に買うと安心」、
// 「あとで買う」は本人が押す。人数を変えた時も、買った印は残して「要確認」。
function fixedDate(iso) {
  const t = Date.parse(iso);
  return class extends Date { constructor(...a) { if (a.length) super(...a); else super(t); } static now() { return t; } };
}
function app(now = "2026-10-01T03:00:00Z") { // 木曜
  const ctx = vm.createContext({ console, URL, Date: fixedDate(now), document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;state.planLength=7;saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
const J = (run, code) => JSON.parse(run(`JSON.stringify(${code})`));
const dish = (id, date, ingredients) => `state.mealSlots[${JSON.stringify(date)}] = { date: ${JSON.stringify(date)}, status: "confirmed", servings: 2, updatedAt: nowIso(), recipe: { id: ${JSON.stringify(id)}, title: ${JSON.stringify(id)}, sourceServings: 2, ingredients: ${JSON.stringify(ingredients)} } };`;
const setup = (run) => run([
  dish("もやし炒め", "2026-10-03", [{ name: "もやし", amount: "1袋" }]),        // 買い物（今日）から2日目：急ぎ度5 → 目安
  dish("麻婆豆腐", "2026-10-04", [{ name: "豆腐", amount: "1丁" }]),            // 3日目：急ぎ度3 → まだ
  dish("えびチリ", "2026-10-06", [{ name: "冷凍えび", amount: "200g" }, { name: "豚こま", amount: "200g" }]), // 冷凍・急がない
  dish("湯豆腐", "2026-10-05", [{ name: "絹豆腐", amount: "1丁" }]),            // 4日目：急ぎ度3 → 目安
].join("\n"));

test("PR 5c: perishables first used many days after the shopping day get a gentle note — never a promise of how long they keep", () => {
  const run = app();
  setup(run);
  const later = J(run, "Object.fromEntries(dailyShopping().map((i) => [i.name, freshLater(i)]))");
  assert.deepEqual(later["もやし"], { date: "2026-10-03", label: "もやし・豆苗" });
  assert.equal(later["豆腐"], null, "day 3 is fine for tofu (urgency 3 starts on day 4)");
  assert.deepEqual(later["絹豆腐"], { date: "2026-10-05", label: "豆腐" });
  assert.equal(later["冷凍えび"], null, "frozen food is not rushed");
  assert.equal(later["豚こま"], null);
  const html = run("renderDailyShopping()");
  assert.match(html, /10月3日（土）に使う・傷みやすいので、その前に買うと安心/);
  assert.match(html, /もやし・豆苗は傷みやすい食材です/);
  assert.equal((html.match(/data-action="life-shop-later"/g) || []).length, 2);
  assert.doesNotMatch(html, /日もつ|日持ちします/, "no promise of shelf life");
});

test("PR 5c: 'あとで' moves the item out of this trip (not 'at home') and keeps a dated reminder that survives '買い物完了'; it can be undone", () => {
  const run = app();
  setup(run);
  const id = run(`dailyShopping().find((i) => i.name === "もやし").id`);
  run(`handleDailyAction("life-shop-later", { id: ${JSON.stringify(id)} })`);
  const items = J(run, "dailyShopping().map((i) => ({ name: i.name, status: i.status }))");
  assert.equal(items.find((i) => i.name === "もやし").status, "later");
  assert.ok(items.some((i) => i.name === "もやし（10月3日の分）" && i.status === "buy"), JSON.stringify(items));
  let html = run("renderDailyShopping()");
  assert.match(html, /あとで買う/);
  // 今回の分を全部買ったら、買い物完了できる（「あとで」は数えない）
  run(`dailyShopping().filter((i) => i.status === "buy" && !i.id.startsWith("manual-")).forEach((i) => { state.shoppingMarks[i.id] = { status: "purchased", signature: i.signature, updatedAt: nowIso() }; })`);
  const left = J(run, "dailyShopping().filter((i) => i.status === 'buy').map((i) => i.name)");
  assert.deepEqual(left, ["もやし（10月3日の分）"], "only the dated reminder is still to buy");
  run(`state.shopDone = { [today()]: new Date(Date.now() + 1000).toISOString() };`);
  assert.deepEqual(J(run, "dailyShopping().map((i) => i.name)"), ["もやし（10月3日の分）"], "the reminder survives the trip");
  // 取り消し
  const run2 = app(); setup(run2);
  const id2 = run2(`dailyShopping().find((i) => i.name === "もやし").id`);
  run2(`handleDailyAction("life-shop-later", { id: ${JSON.stringify(id2)} }); shopUndo.undo();`);
  assert.equal(J(run2, `dailyShopping().find((i) => i.name === "もやし").status`), "buy");
  assert.equal(J(run2, "dailyShopping().some((i) => i.name.startsWith('もやし（'))"), false);
  // 目安のない品には効かない
  const pork = run2(`dailyShopping().find((i) => i.name === "豚こま").id`);
  run2(`handleDailyAction("life-shop-later", { id: ${JSON.stringify(pork)} })`);
  assert.equal(J(run2, `dailyShopping().find((i) => i.name === "豚こま").status`), "buy");
  // 保存・読み込み直しても「あとで」は残る
  run(`state = normalizeState(JSON.parse(JSON.stringify(state))); saveState=()=>{}; render=()=>{};`);
  assert.equal(J(run, `Object.values(state.shoppingMarks).some((m) => m.status === "later")`), true);
});

test("PR 5c: changing the number of servings keeps what was bought on record and asks to check the amount", () => {
  const run = app();
  setup(run);
  const item = J(run, `dailyShopping().find((i) => i.name === "豚こま")`);
  run(`state.shoppingMarks[${JSON.stringify(item.id)}] = { status: "purchased", signature: ${JSON.stringify(item.signature)}, updatedAt: nowIso() };`);
  assert.equal(J(run, `dailyShopping().find((i) => i.name === "豚こま").status`), "purchased");
  run(`state.mealSlots["2026-10-06"].servings = 4;`);
  const after = J(run, `dailyShopping().find((i) => i.name === "豚こま")`);
  assert.equal(after.recheck, true, "the amount changed: check if what was bought is enough");
  assert.equal(J(run, `state.shoppingMarks[${JSON.stringify(item.id)}].status`), "purchased", "the record of buying stays");
  assert.match(run("renderDailyShopping()"), /要確認/);
});

test("review fix (#108): undoing 'あとで' after a sync writes a newer 'buy' mark, so the old 'later' cannot come back", () => {
  const run = app();
  setup(run);
  const id = run(`dailyShopping().find((i) => i.name === "もやし").id`);
  run(`handleDailyAction("life-shop-later", { id: ${JSON.stringify(id)} })`);
  // 同期が済む（サーバーには later の印）。同期の組み合わせは買った印を Lifestyle.mergeMap で新しいほうにする
  const serverMarks = run("JSON.stringify(state.shoppingMarks)");
  run(`nowIso = (() => { let t = Date.now() + 5000; return () => new Date(t += 1000).toISOString(); })(); shopUndo.undo();`);
  assert.equal(J(run, `state.shoppingMarks[${JSON.stringify(id)}].status`), "buy", "the mark is kept as 'buy', not deleted");
  run(`state.shoppingMarks = Lifestyle.mergeMap(state.shoppingMarks, ${serverMarks})`); // 次の同期
  const items = J(run, "dailyShopping().map((i) => ({ name: i.name, status: i.status }))");
  assert.equal(items.find((i) => i.name === "もやし").status, "buy", "still to buy after the next sync");
  assert.equal(items.some((i) => i.name.startsWith("もやし（")), false);
});

test("review fix (#108): an item put off with 'あとで' is not 'already bought' when its dish is swapped after the trip", () => {
  const run = app();
  setup(run);
  const id = run(`dailyShopping().find((i) => i.name === "もやし").id`);
  run(`handleDailyAction("life-shop-later", { id: ${JSON.stringify(id)} }); state.shopDone = { [today()]: new Date(Date.now() + 1000).toISOString() };`);
  assert.equal(J(run, `plannedIngredients().get("もやし")`), false, "put off, so not bought");
  assert.equal(J(run, `plannedIngredients().get("豆腐")`), true, "the rest of the trip was bought");
  const egg = JSON.stringify({ id: "卵焼き", title: "卵焼き", sourceServings: 2, ingredients: [{ name: "卵", amount: "3個" }] });
  run(`const before = dailyShopping(); state.mealSlots["2026-10-03"] = { ...state.mealSlots["2026-10-03"], recipe: ${egg}, updatedAt: nowIso() }; changedShopping(before);`);
  const diff = J(run, "shoppingNotice || { bought: [] }");
  assert.equal(diff.bought.includes("もやし"), false, `bought: ${diff.bought}`);
  // 買ってあった品を入れ替えた時は、これまでどおり出る
  run(`const b2 = dailyShopping(); state.mealSlots["2026-10-04"] = { ...state.mealSlots["2026-10-04"], recipe: ${egg}, updatedAt: nowIso() }; changedShopping(b2);`);
  assert.ok(J(run, "shoppingNotice.bought").includes("豆腐"));
});
