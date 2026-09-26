const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../tickets.js");
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const start = "2026-10-01";
const slots = (list) => Object.fromEntries(list.map(([o, status]) => { const date = addDays(start, o); return [date, { date, status }]; }));

test("4-week challenge: plan 3/7 days, cook 3 days, a full week counts nights off", () => {
  const s = slots([[0, "cooked"], [1, "cooked"], [2, "cooked"], [3, "off"], [4, "confirmed"], [5, "confirmed"], [6, "confirmed"], [7, "confirmed"], [30, "confirmed"]]);
  const weeks = T.progress(s, start, addDays);
  assert.equal(weeks.length, 4); assert.equal(weeks[0].plan, 7); assert.equal(weeks[0].cooked, 3); assert.equal(weeks[1].plan, 1);
  assert.deepEqual(T.eligible(weeks, [], addDays(start, 0)), ["w0-plan-1", "w0-plan-2"], "cooking rewards wait until the days have passed");
  assert.deepEqual(T.eligible(weeks, ["w0-plan-1"], addDays(start, 2)), ["w0-plan-2", "w0-cook-1"]);
  assert.deepEqual(T.eligible(weeks, [], addDays(start, 6)).filter((c) => c.includes("cook")), ["w0-cook-1"], "4 cooked-or-off of 7 is not a full week");
  const full = T.progress({ ...s, ...slots([[4, "cooked"], [5, "off"], [6, "cooked"]]) }, start, addDays);
  assert.ok(T.eligible(full, [], addDays(start, 6)).includes("w0-cook-2"), "cooked + nights off make a full week");
});

test("the next goal is the closest reachable one; unreachable ones are skipped; nothing after 4 weeks", () => {
  const s = slots([[0, "cooked"], [1, "confirmed"]]);
  const weeks = T.progress(s, start, addDays);
  let g = T.nextGoal(weeks, [], addDays(start, 1));
  assert.equal(g.id, "w0-plan-1"); assert.equal(g.remaining, 1);
  g = T.nextGoal(weeks, [], addDays(start, 1), "cook");
  assert.equal(g.id, "w0-cook-1"); assert.equal(g.remaining, 2);
  g = T.nextGoal(T.progress(slots([[0, "cooked"]]), start, addDays), [], addDays(start, 6));
  assert.equal(g.id, "w1-plan-1", "2 more days cannot fit into the 1 left this week, so next week's plan is the goal"); assert.equal(g.thisWeek, false);
  assert.equal(T.nextGoal(weeks, [], addDays(start, 28)), null);
  assert.equal(T.goalOf("w2-cook-2").label, "1週間やりきった"); assert.equal(T.goalOf("w2-cook-2").week, 2);
});
