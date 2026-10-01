const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

// 親の料理名（APP_MAP §48・2026-10-01）：同じ親は自動の献立で週1回まで（自分で選ぶのは自由）・一覧は親ごとにまとめる。
const addDays = (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const base = L.curated.find((r) => L.fit(r, L.profile({}), "2026-10-05").ok);
const kids = (dish, n, from = 0) => Array.from({ length: n }, (_, i) => ({ ...base, id: `trend-${dish}-${i + from}`, title: `${dish}その${i + from}`, dish }));
const parentOf = (r) => (r.dish ? `d:${r.dish}` : "");

test("auto plan: one child per parent in a plan, and not again within 6 days of eating it; a chosen day is free", () => {
  const recipes = [...kids("八宝菜", 6), ...kids("肉じゃが", 6), ...kids("回鍋肉", 3), ...kids("餃子", 3), ...kids("酢豚", 3)];
  const plan = L.propose({ recipes, profile: L.profile({}), start: "2026-10-05", length: 4, addDays, parentOf });
  const dishes = plan.map((d) => d.candidate?.recipe.dish).filter(Boolean);
  assert.equal(new Set(dishes).size, dishes.length, `no parent twice in one plan: ${dishes}`);
  // 3日前に八宝菜を食べた → 自動では八宝菜を選ばない
  const history = [{ date: "2026-10-02", recipe: recipes[0] }];
  const later = L.propose({ recipes, profile: L.profile({}), start: "2026-10-05", length: 2, addDays, parentOf, history });
  assert.ok(later.every((d) => d.candidate?.recipe.dish !== "八宝菜"), "eaten 3 days ago → not picked automatically");
  // 7日たてばまた選べる
  const week = L.propose({ recipes: kids("八宝菜", 3), profile: L.profile({}), start: "2026-10-09", length: 1, addDays, parentOf, history });
  assert.equal(week[0].candidate?.recipe.dish, "八宝菜");
  // 食べ比べ：自分で選んだ日は、同じ親が続いても入る
  const overrides = { "2026-10-05": "trend-八宝菜-1", "2026-10-06": "trend-八宝菜-2", "2026-10-07": "trend-八宝菜-3" };
  const compare = L.propose({ recipes, profile: L.profile({}), start: "2026-10-05", length: 3, addDays, parentOf, overrides });
  assert.deepEqual(compare.map((d) => d.candidate?.recipe.id), ["trend-八宝菜-1", "trend-八宝菜-2", "trend-八宝菜-3"]);
});

function app(items) {
  const fetch = (url) => Promise.resolve({ ok: true, json: async () => (/\/api\/trends/.test(url) ? { items } : { items: [] }) });
  const ctx = vm.createContext({ console, URL, Date, fetch, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, MATAGOCHI_API_BASE_URL: "https://api.test", window: { scrollTo() {} }, document: { querySelector: () => null, querySelectorAll: () => [] }, AbortSignal, AbortController, setTimeout, clearTimeout });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "profile-talk.js", "talk-ui.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "cook-level.js", "weekly.js", "cook-type.js", "plan-moves.js", "plus.js", "cook-mode.js", "folders.js", "install.js", "push.js", "tickets.js", "account.js", "discover.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.onboarded=true;saveState=()=>{};render=()=>{}");
  return run;
}
const item = (n, title, dish) => ({ videoId: `v${String(n).padStart(10, "0")}`, title, videoUrl: `https://www.youtube.com/watch?v=v${String(n).padStart(10, "0")}`, ingredients: [{ name: "豚こま" }, { name: "白菜" }, { name: "しょうゆ" }], steps: ["切る", "炒める"], expiresAt: "2099-01-01T00:00:00Z", ...(dish ? { dish: { key: dish, name: dish } } : {}) });

test("collection: new dishes with the same parent show as one tile with 'ほか◯つの作り方'; tapping it searches the dish; own folder of the same name is the same parent", async () => {
  const run = app([item(1, "王将風 八宝菜", "八宝菜"), item(2, "陳健一さんの八宝菜", "八宝菜"), item(3, "プロが作る八宝菜", "八宝菜"), item(4, "お豆腐ふわふわ焼き")]);
  await run("loadDiscover({ force: true })");
  const html = run("recipeTab='starter';renderCollection()");
  assert.equal((html.match(/data-action="life-dish-variants"/g) || []).length, 1);
  assert.match(html, /八宝菜：ほか2つの作り方/);
  assert.equal((html.match(/八宝菜<\/button>/g) || []).length, 1, "only one 八宝菜 tile");
  assert.match(html, /お豆腐ふわふわ焼き/);
  run("handleDailyAction('life-dish-variants',{dish:'八宝菜'})");
  const searched = run("renderCollection()");
  assert.equal((searched.match(/八宝菜<\/button>/g) || []).length, 3, "searching shows every way to make it");
  // 自分の定番フォルダ「八宝菜」があれば、集めた八宝菜もそのフォルダが親
  run("state.folders={fabc:{key:'fabc',name:'八宝菜',ranking:[],pinDay:'',updatedAt:nowIso()}}");
  assert.equal(run("parentKeyOf(findDiscover(discoverRecipes()[0].id))"), "fabc");
  assert.equal(run("parentKeyOf(discoverRecipes().find((r)=>!r.dish))"), "");
});
