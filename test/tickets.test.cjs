const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const T = require("../tickets.js");

// 2026-10-28：チケットをやめて1日の上限に。知らせるのは「半分に達した時」と「残り1回の時」だけ（その日に1度ずつ）。
test("daily limit notices: half used, then the last one, each once a day; none for the developer code", () => {
  const v = (used, limit = 10) => ({ used, limit, left: limit - used, day: "2026-10-28" });
  assert.equal(T.notice(v(4)), "", "under half");
  assert.equal(T.notice(v(5)), "half");
  assert.equal(T.notice(v(6), ["half"]), "", "half only once");
  assert.equal(T.notice(v(9), ["half"]), "last");
  assert.equal(T.notice(v(9), ["half", "last"]), "");
  assert.equal(T.notice(v(10), ["half", "last"]), "", "at the limit the action itself says so");
  assert.equal(T.notice(v(9), []), "last", "the last one wins over half");
  assert.equal(T.notice({ ...v(9), unlimited: true }), "");
  assert.equal(T.notice(v(1, 2)), "last", "a limit of 2: the first use leaves one");
});

test("daily limit in the app: the notice shows once, the limit stops the video read, and no ticket screens are left", () => {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
  const src = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  vm.runInContext(src.slice(0, src.lastIndexOf('document.querySelectorAll(".tab")')), ctx);
  const run = (code) => vm.runInContext(code, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{};showToast=()=>{};");
  const day = run("limitToday()");
  run(`setTickets({ used: 5, limit: 10, left: 5, day: ${JSON.stringify(day)} })`);
  assert.match(run("renderLimitNotice()"), /今日の上限の半分を使いました[\s\S]*あと5回/);
  run("handleTicketAction('limit-ok')");
  assert.equal(run("renderLimitNotice()"), "");
  run(`setTickets({ used: 6, limit: 10, left: 4, day: ${JSON.stringify(day)} })`);
  assert.equal(run("renderLimitNotice()"), "", "not again the same day");
  run(`setTickets({ used: 9, limit: 10, left: 1, day: ${JSON.stringify(day)} })`);
  assert.match(run("renderLimitNotice()"), /今日は、あと1回です/);
  run("handleTicketAction('limit-ok')");
  // 上限：押した時に知らせて、読みにいかない
  run(`setTickets({ used: 10, limit: 10, left: 0, day: ${JSON.stringify(day)} }); globalThis.ran = false;`);
  run("withDailyLimit(() => { globalThis.ran = true; })");
  assert.equal(run("globalThis.ran"), false);
  assert.match(run("renderLimitNotice()"), /今日の上限に達しました/);
  // 昨日の記録なら、そのまま読む（数えるのはサーバー）
  run(`ticketState = { ...ticketState, day: "2000-01-01" }; withDailyLimit(() => { globalThis.ran = true; })`);
  assert.equal(run("globalThis.ran"), true);
  for (const gone of ["renderTicketPage", "renderTicketSheet", "renderTicketAsk", "renderTicketParty", "renderTicketChip", "renderTicketNudge", "askTicket", "ticketPrice", "queueTicketClaim"]) assert.equal(run(`typeof ${gone}`), "undefined", gone);
  run("state.view = 'today'");
  assert.ok(!/🎟|チケット/.test(run("renderToday()") + run("renderDailyPlan()")), "no tickets on the main screens");
});
