const test = require("node:test"),
  assert = require("node:assert/strict");
const P = require("../dinner-persona.js"),
  L = require("../lifestyle.js");
function forCode(code) {
  return P.questions.map((q) => ({
    id: q.id,
    choice:
      (code[P.axes.findIndex((a) => a.id === q.axis)] === "L" ? -1 : 1) ===
      q.leftScore
        ? "left"
        : "right",
  }));
}
test("all eight combinations resolve to distinct characters with reversed questions scored correctly", () => {
  const titles = new Set();
  for (const code of Object.keys(P.characters)) {
    const r = P.result(forCode(code));
    assert.equal(r.code, code);
    assert.equal(
      r.dimensions.every((d) => Math.abs(d.score) === 3),
      true,
    );
    titles.add(r.title);
  }
  assert.equal(titles.size, 8);
});
test("neutral and skipped responses cannot invent a strong pole", () => {
  assert.equal(P.result([]).code, "???");
  assert.equal(
    P.result(P.questions.map((q) => ({ id: q.id, choice: "equal" }))).code,
    "===",
  );
  assert.equal(
    P.result(P.questions.map((q) => ({ id: q.id, choice: "skip" }))).code,
    "???",
  );
  const a = forCode("LLL").slice(0, 3);
  assert.equal(P.result(a).code, "???");
});
test("duplicates and unsupported questions/choices cannot multiply scoring", () => {
  const a = forCode("RRL");
  assert.deepEqual(
    P.normalize([...a, ...a, { id: "rogue", choice: "left" }, null]),
    a,
  );
  assert.deepEqual(P.normalize([{ id: "joy1", choice: "like" }]), []);
  assert.deepEqual(L.profile({ dinnerPriorities: a }).dinnerPriorities, a);
  assert.deepEqual(
    L.profile({ tasteVotes: [{ id: "pork", vote: "like" }] }).dinnerPriorities,
    [],
  );
});
test("planning uses verified duration and pantry count, never invents nutrition or price scores", () => {
  assert.equal(P.planning(forCode("RRR"), { minutes: 15 }, 3).score, 0);
  assert.equal(P.planning(forCode("LLL"), {}, 0).score, 0);
  assert.equal(P.planning(forCode("LLL"), { minutes: 15 }, 3).score, 10);
  const dish = L.curated.find((r) => r.title === "豆腐と卵のやさしい丼");
  const profile = L.profile({
    dinnerPriorities: forCode("LLL"),
    restrictions: ["卵"],
  });
  assert.equal(L.fit(dish, profile, "2026-09-23").ok, false);
});
