const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../taste.js");
const L = require("../lifestyle.js");
const all = (vote) => T.deck.map((c) => ({ id: c.id, vote }));
test("pantry defaults seed source-supported items only and preserve deliberate answers", () => {
  const p = L.pantryDefaults(
    { 塩: "none", しょうゆ: "unknown", 白だし: "have" },
    Object.values(L.pantry).flat(),
  );
  assert.equal(p.塩, "none");
  assert.equal(p.しょうゆ, "unknown");
  assert.equal(p.こしょう, "have");
  assert.equal(p.白だし, "have");
  assert.equal(p.みりん, undefined);
  assert.equal(p.中濃ソース, undefined);
  assert.deepEqual(L.profile({}).pantry, {});
  assert.deepEqual(L.pantryDefaults({}, ["塩"]), { 塩: "have" });
});
test("untrusted, duplicated and unsupported votes are dropped on normalization", () => {
  assert.deepEqual(
    T.normalize([
      { id: "tofu", vote: "like" },
      { id: "tofu", vote: "pass" },
      { id: "bad", vote: "like" },
      null,
      { id: "udon", vote: "bad" },
    ]),
    [{ id: "tofu", vote: "like" }],
  );
  assert.deepEqual(
    L.profile({ tasteVotes: [{ id: "tofu", vote: "like" }] }).tasteVotes,
    [{ id: "tofu", vote: "like" }],
  );
});
test("insufficient evidence and all passes do not fabricate a confident type", () => {
  assert.equal(T.result(all("skip")).id, "unknown");
  assert.equal(T.result(all("pass")).id, "unknown");
  assert.equal(T.result(all("like").slice(0, 3)).id, "unknown");
  assert.equal(T.result(all("like")).id, "explorer");
  const votes = T.deck.map((c) => ({
    id: c.id,
    vote: c.style === "gentle" ? "like" : "pass",
  }));
  assert.equal(T.result(votes).id, "gentle");
});
test("liked dishes improve ranking but never override food restrictions", () => {
  const recipe = L.curated.find((r) => r.title === "豆腐と卵のやさしい丼");
  assert.ok(recipe);
  const plain = L.profile({}),
    liked = L.profile({ tasteVotes: [{ id: "tofu", vote: "like" }] });
  assert.ok(
    L.fit(recipe, liked, "2026-09-23").score >
      L.fit(recipe, plain, "2026-09-23").score,
  );
  assert.equal(
    L.fit(recipe, L.profile({ ...liked, restrictions: ["卵"] }), "2026-09-23")
      .ok,
    false,
  );
  assert.equal(
    L.fit(
      recipe,
      L.profile({ tasteVotes: [{ id: "tofu", vote: "pass" }] }),
      "2026-09-23",
    ).ok,
    true,
  );
});
