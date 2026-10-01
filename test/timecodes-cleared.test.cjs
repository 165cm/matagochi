const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

// レビューの修正（#119）：運営が手順の時刻をすべて消した（サーバーの答えが cleared）時は、
// 「見つからなかった」とは分けて、手元の古い時刻も使わない・保存済みのレシピからも消す。
function app(reply) {
  const ctx = vm.createContext({ console, URL, Date, fetch: () => Promise.resolve({ ok: true, json: async () => reply }), localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;globalThis.saved=0;saveState=()=>{globalThis.saved+=1};render=()=>{};showToast=()=>{}");
  run(`state.recipes.push({ id: "own-1", title: "豚こま", videoUrl: "https://www.youtube.com/watch?v=abcdefghijk", steps: ["切る", "炒める"], stepTimes: [10, 20] })`);
  return run;
}
const settle = () => new Promise((r) => setTimeout(r, 10));

test("review fix (#119): times cleared by the admin replace the saved old times (shown and stored)", async () => {
  const run = app({ stepTimes: [null, null], source: "fix", cleared: true, cacheHit: true });
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[0]))")), [10, 20]);
  run("ensureTimecodes(state.recipes[0])");
  await settle();
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[0]))")), [null, null], "the old times are not shown");
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.recipes[0].stepTimes)")), [null, null], "and removed from the saved recipe");
  assert.equal(run("saved"), 1);
  assert.equal(run("timecodeHint(state.recipes[0])"), "");
});

test("review fix (#119): 'not found' (no cleared flag) still keeps the recipe's own times", async () => {
  const run = app({ stepTimes: [], source: "none", cacheHit: false });
  run("ensureTimecodes(state.recipes[0])");
  await settle();
  assert.deepEqual(JSON.parse(run("JSON.stringify(recipeStepTimes(state.recipes[0]))")), [10, 20]);
  assert.deepEqual(JSON.parse(run("JSON.stringify(state.recipes[0].stepTimes)")), [10, 20]);
});
