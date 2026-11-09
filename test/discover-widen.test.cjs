const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

// 2026-10-01：集めた新着を献立の候補にほぼすべて入れる（40 → 120品）。
// あわせて、同じ点数の候補の並びを「献立の日付ごと」に（いつも id の順で同じ料理ばかり選ばれないように）。
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

test("the app keeps every new dish the server sends (was the first 120 by the daily draw; 2026-11-08)", async () => {
  const items = Array.from({ length: 420 }, (_, i) => ({ videoId: `v${String(i).padStart(10, "0")}`, title: `料理${i}`, videoUrl: `https://www.youtube.com/watch?v=v${String(i).padStart(10, "0")}`, ingredients: [{ name: "豚こま" }], steps: ["切る", "炒める"], expiresAt: "2099-01-01T00:00:00Z" }));
  const fetch = (url) => Promise.resolve({ ok: true, json: async () => (/\/api\/trends/.test(url) ? { items } : { items: [] }) });
  const ctx = vm.createContext({ console, URL, Date, fetch, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] }, AbortSignal, AbortController, setTimeout, clearTimeout });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  vm.runInContext("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{}", ctx);
  await vm.runInContext("loadDiscover({ force: true })", ctx);
  assert.equal(vm.runInContext("discover.trends.length", ctx), 420, "all of them, not 120");
  assert.equal(vm.runInContext("discover.trends[0].videoId", ctx), items[0].videoId, "in the server's order");
  // 上限（保険）を超えた時だけ：自分の条件に合う料理を先に残す。並びは届いた順のまま
  // 条件に合うかは Lifestyle.fit で決める（ここでは「えびが食べられない人」として、合うかどうかだけを差しかえる）
  vm.runInContext("Lifestyle.fit = (r) => ({ ok: !/えび/.test(r.title) })", ctx);
  const kept = JSON.parse(vm.runInContext(`JSON.stringify(keepTrends([
    { videoId: "a", title: "えびチリ", ingredients: [{ name: "えび" }], steps: ["炒める"] },
    { videoId: "b", title: "鮭の塩焼き", ingredients: [{ name: "鮭" }], steps: ["焼く"] },
    { videoId: "c", title: "えびフライ", ingredients: [{ name: "えび" }], steps: ["揚げる"] },
    { videoId: "d", title: "親子丼", ingredients: [{ name: "鶏もも肉" }, { name: "卵" }], steps: ["煮る"] },
  ], 2).map((x) => x.videoId))`, ctx));
  assert.deepEqual(kept, ["b", "d"], "the dishes you can eat stay when there are too many");
  assert.equal(JSON.parse(vm.runInContext(`JSON.stringify(keepTrends([{ videoId: "a", title: "豚丼", ingredients: [{ name: "豚こま" }], steps: ["焼く"] }], 2).length)`, ctx)), 1, "under the cap, nothing is dropped");
});

test("dishes with the same score are ordered per plan date, not always by id (stable for the same date)", () => {
  const base = L.curated.find((r) => L.fit(r, L.profile({}), "2026-10-05").ok);
  const many = Array.from({ length: 40 }, (_, i) => ({ ...base, id: `trend-${String(i).padStart(3, "0")}`, title: `新着の料理${i}` }));
  const plan = (start) => L.propose({ recipes: many, profile: L.profile({}), start, length: 3, addDays }).map((d) => d.candidate?.recipe.id);
  const a = plan("2026-10-05"), b = plan("2026-11-02");
  assert.deepEqual(plan("2026-10-05"), a, "same dates → same plan");
  assert.notDeepEqual(a, b, "different dates → different dishes among ties");
  assert.notDeepEqual(a, ["trend-000", "trend-001", "trend-002"], "not simply the first ids");
});
