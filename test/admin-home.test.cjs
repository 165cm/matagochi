const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 管理画面の整理（2026-11-03）：🎯 進み具合を最初に・毎日見る順にタブ・レシピと親の料理名を1つの表に・手順の時刻の全体像。
const html = fs.readFileSync(path.join(__dirname, "..", "admin", "catalog.html"), "utf8");

test("tabs are ordered by how often they are checked, the progress tab opens first, and the dish-name tab is merged into recipes", () => {
  const order = [...html.matchAll(/role="tab" id="tab-(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["home", "objections", "recipes", "seed", "adopt", "creators"]);
  assert.match(html, /const TABS = \["home", "objections", "recipes", "seed", "adopt", "creators"\]/);
  assert.match(html, /id="tab-home" aria-controls="panel-home" aria-selected="true"/);
  assert.match(html, /<div id="panel-home" role="tabpanel" aria-labelledby="tab-home" style=/, "the progress panel is visible by default");
  assert.doesNotMatch(html, /panel-dishes|tab-dishes|showTab\("dishes"\)/);
  const recipes = html.slice(html.indexOf('<div id="panel-recipes"'), html.indexOf('<div id="panel-objections"'));
  for (const id of ["rl-list", "backfill", "dish-rule", "dish-candidates", "dish-alias", "dish-other", "tc-check"]) assert.match(recipes, new RegExp(`id="${id}"`), id);
});

test("the progress tab has the goal, the to-do list, the timecode overview, the ideal 12, the shares and the parents to refill", () => {
  const panel = html.slice(html.indexOf('<div id="panel-home"'), html.indexOf('<div id="panel-seed"'));
  for (const id of ["goal", "todo", "tc-overview", "ideal", "shares", "parents"]) assert.match(panel, new RegExp(`id="${id}"`), id);
  assert.match(html, /function renderHome\(\) \{ renderGoal\(\); renderTodo\(\); renderTcOverview\(\); renderIdeal\(\); renderShares\(\); renderLack\(\); \}/);
  assert.match(html.slice(html.indexOf("function renderObjections"), html.indexOf("function renderObjections") + 600), /renderTodo\(\)/);
  assert.match(html.slice(html.indexOf("async function loadRecipes"), html.indexOf("function showParent(")), /renderTodo\(\); renderTcOverview\(\)/);
  assert.match(html, /function renderAll\(\) \{ renderHome\(\); if \(!rlState\.withStock\) renderRecipeList\(\);/);
});

test("timecode levels: all / some / none / no steps, with the source", () => {
  const src = html.slice(html.indexOf("const TC_SRC"), html.indexOf("const timeCell"));
  const tcLevel = new Function(`${src}; return tcLevel;`)();
  assert.equal(tcLevel({}), null, "an older server without tc");
  assert.equal(tcLevel({ tc: { n: 0, k: 0 } }), "nosteps");
  assert.equal(tcLevel({ tc: { n: 5, k: 5 } }), "full");
  assert.equal(tcLevel({ tc: { n: 5, k: 2 } }), "part");
  assert.equal(tcLevel({ tc: { n: 5, k: 0 } }), "none");
  const tcCell = new Function(`${src}; return tcCell;`)();
  assert.deepEqual(tcCell({ tc: { n: 5, k: 4, source: "transcript" } }), { text: "4/5 字幕", value: 0.8 });
});

test("the recipe list is one row per parent with aligned, sortable columns; rows open their recipes", () => {
  for (const v of ["ideal", "short", "tcnone", "tcpart", "expiring", "nominutes", "noparent"]) assert.match(html, new RegExp(`<option value="${v}">`), v);
  assert.doesNotMatch(html, /id="rl-sort"/, "sorting moved to the column headings");
  const cols = html.slice(html.indexOf("const PCOLS = ["), html.indexOf("function parentRow"));
  for (const h of ["順", "親料理", "品数", "目標", "20分以内不足", "30分以上不足", "⏱ 時刻すべて", "⏱ 時刻なし", "⏳ 7日以内", "献立", "投稿者", "辞書"]) assert.ok(cols.includes(`"${h}"`), h);
  assert.match(html, /sortState\["rl-parents"\] \|\| \[0, "asc"\]/, "refill order is the default");
  assert.match(html, /rlState\.openKeys\.has\(g\.key\)/, "open rows stay open when the list is redrawn");
  assert.match(html, /actionButton\("外す", \{ op: "remove", key: g\.key \}\)/, "the dish-name remove button moved into the row");
  assert.match(html, /"⏱ 時刻"/, "each recipe shows its timecode level");
});

test("review fixes kept: counts match, empty parents explain themselves, the demo does not change the saved tab", () => {
  assert.match(html, /nominutes: \(r\) => r\.trend && !r\.minutes,/);
  const sp = html.slice(html.indexOf("function showParent("), html.indexOf("function showParent(") + 1200);
  assert.match(sp, /まだ1品もありません/);
  assert.match(html, /rlState\.withStock = false;/);
  assert.match(html, /showTab\("adopt", \{ save: false \}\)/);
  assert.match(html, /ps\.idealMissing/);
});

test("logout clears the new progress areas", () => {
  const handler = html.slice(html.indexOf('getElementById("logout").addEventListener'), html.indexOf("load();\n</script>"));
  const cleared = JSON.parse(handler.match(/for \(const id of (\[[^\]]*\])\)/)[1]);
  for (const id of ["goal", "todo", "tc-overview", "ideal", "shares", "parents"]) assert.ok(cleared.includes(id), id);
  for (const id of cleared) assert.match(html, new RegExp(`id="${id}"`), `${id} still exists`);
});
