const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 管理画面の整理（2026-11-03）：🎯 進み具合を最初に・毎日見る順にタブを並べる・レシピ一覧のしぼりこみと並べ方。
const html = fs.readFileSync(path.join(__dirname, "..", "admin", "catalog.html"), "utf8");

test("tabs are ordered by how often they are checked, and the progress tab opens first", () => {
  const order = [...html.matchAll(/role="tab" id="tab-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["home", "objections", "recipes", "seed", "dishes", "adopt", "creators"]);
  assert.match(html, /const TABS = \["home", "objections", "recipes", "seed", "dishes", "adopt", "creators"\]/);
  assert.match(html, /id="tab-home" aria-controls="panel-home" aria-selected="true"/);
  assert.match(html, /<div id="panel-home" role="tabpanel" aria-labelledby="tab-home" style=/, "the progress panel is visible by default");
  assert.match(html, /<div id="panel-seed" role="tabpanel" aria-labelledby="tab-seed" hidden/);
});

test("the progress tab has the goal, the to-do list, the ideal 12, the shares and the parents to refill", () => {
  const panel = html.slice(html.indexOf('<div id="panel-home"'), html.indexOf('<div id="panel-seed"'));
  for (const id of ["goal", "todo", "ideal", "shares", "parents"]) assert.match(panel, new RegExp(`id="${id}"`), id);
  assert.match(html, /function renderHome\(\) \{ renderGoal\(\); renderTodo\(\); renderIdeal\(\); renderShares\(\); renderLack\(\); \}/);
  // 遅れて届くデータ（異議・レシピ一覧）でも、いま確認することを描き直す
  assert.match(html.slice(html.indexOf("function renderObjections"), html.indexOf("function renderObjections") + 600), /renderTodo\(\)/);
  assert.match(html.slice(html.indexOf("async function loadRecipes"), html.indexOf("function showParent(")), /renderTodo\(\)/);
  // レシピ一覧が先に届いても、親の在庫が届いたら描き直す
  assert.match(html, /function renderAll\(\) \{ renderHome\(\); renderRecipeList\(\);/);
});

test("the recipe list can be narrowed to what needs checking and sorted by refill priority", () => {
  for (const v of ["ideal", "short", "expiring", "nominutes", "noparent"]) assert.match(html, new RegExp(`<option value="${v}">`), v);
  for (const v of ["priority", "few", "many", "planned"]) assert.match(html, new RegExp(`id="rl-sort"[\\s\\S]*?<option value="${v}">`), v);
  assert.match(html, /sort: "priority"/, "refill priority is the default order");
  for (const k of ["ideal", "short", "expiring", "nominutes", "noparent"]) assert.match(html, new RegExp(`\\b${k}: `), `filter ${k}`);
});

test("logout clears the new progress areas", () => {
  const handler = html.slice(html.indexOf('getElementById("logout").addEventListener'), html.indexOf("load();\n</script>"));
  const cleared = JSON.parse(handler.match(/for \(const id of (\[[^\]]*\])\)/)[1]);
  for (const id of ["goal", "todo", "ideal", "shares", "parents"]) assert.ok(cleared.includes(id), id);
});
