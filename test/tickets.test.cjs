const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../tickets.js");
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const start = "2026-10-01";
const slots = (list) => Object.fromEntries(list.map(([o, status]) => { const date = addDays(start, o); return [date, { date, status }]; }));

test("cooked days in the last week are claimed once; plans, nights off and old days are not", () => {
  const s = slots([[0, "cooked"], [1, "confirmed"], [2, "off"], [3, "cooked"], [9, "cooked"]]);
  const today = addDays(start, 9);
  assert.deepEqual(T.cookClaims({ slots: s, startDate: start, today, addDays }), ["cook-2026-10-04", "cook-2026-10-10"], "10/1 is more than 7 days ago");
  assert.deepEqual(T.cookClaims({ slots: s, startDate: start, today, addDays, claims: ["cook-2026-10-04"] }), ["cook-2026-10-10"]);
  const records = [{ cookedAt: "2026-10-08", mealType: "dinner" }, { cookedAt: "2026-10-07T20:00:00", mealType: "lunch" }];
  assert.ok(T.cookClaims({ slots: {}, evaluations: records, startDate: start, today, addDays }).includes("cook-2026-10-08"), "a dinner record counts");
  assert.deepEqual(T.cookClaims({ slots: slots([[1, "cooked"]]), startDate: start, today: addDays(start, 0), addDays }), [], "a future day is not claimed");
});

test("the next line: the import bonus first, then 1 per cook in the first 4 weeks, then every 3 cooks", () => {
  const cook = { challenge: true, weekGot: 2, perWeek: 5, total: 7, max: 20, towardNext: 0, every: 3 };
  assert.match(T.nextLine({ importBonus: { open: true, have: 1, need: 3, bonus: 5 }, cook }), /あと2本.*\+5枚/);
  assert.match(T.nextLine({ importBonus: { open: false }, cook }), /今週あと3枚/);
  assert.equal(T.nextLine({ cook: { ...cook, weekGot: 5 } }), "", "this week is full");
  assert.match(T.nextLine({ cook: { ...cook, challenge: false, towardNext: 1 } }), /あと2回作ると/);
  assert.equal(T.nextLine({ unlimited: true, cook }), "");
});
