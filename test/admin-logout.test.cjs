const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// review fix (#144)：合言葉を消したら、管理の画面に数字・名前を残さない（新しく分けた欄・畳んだ見出しの要点の数字も）。
test("logout clears every data area of the admin page, including the goal card and the fold summaries", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "admin", "catalog.html"), "utf8");
  const handler = html.slice(html.indexOf('getElementById("logout").addEventListener'), html.indexOf("load();\n</script>"));
  const cleared = JSON.parse(handler.match(/for \(const id of (\[[^\]]*\])\)/)[1]);
  // 管理の数字を描く欄（id のある div・section）は全部消す対象に入っている
  const areas = ["goal", "stage", "stages", "sources", "parents", "portfolio", "learn", "added", "queries", "stage-progress", "waves-left", "items", "cost", "ask", "rl-list", "tc-check"];
  for (const id of areas) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists`);
    assert.ok(cleared.includes(id), `${id} is cleared on logout`);
  }
  assert.match(handler, /getElementById\("goal"\)\.hidden = true/);
  assert.match(handler, /summary \.sum"\)\.forEach\(\(x\) => x\.remove\(\)\)/);
});
