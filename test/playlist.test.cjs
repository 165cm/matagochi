const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

function app() {
  const ctx = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "lifestyle.js", "daily-ui.js", "playlist-import.js", "app.js"]) {
    let s = fs.readFileSync(path.join(__dirname, "..", f), "utf8");
    if (f === "app.js") s = s.slice(0, s.lastIndexOf('document.querySelectorAll(".tab")'));
    vm.runInContext(s, ctx);
  }
  const run = (s) => vm.runInContext(s, ctx);
  run("state=freshState();state.recipes=[];saveState=()=>{};render=()=>{};showToast=()=>{}");
  return run;
}
const listing = {
  playlist: { id: "PLtest12345678", title: "作りたい" },
  items: [
    { videoId: "aaaaaaaaaaa", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa", title: "豚こまキャベツのレンジ蒸し", description: "材料 豚こま 100g キャベツ 150g\\n1. キャベツをちぎる", thumbnailUrl: "https://i.ytimg.com/a.jpg" },
    { videoId: "bbbbbbbbbbb", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb", title: "Vlog 休日", description: "旅行に行きました" },
    { videoId: "ccccccccccc", url: "https://www.youtube.com/watch?v=ccccccccccc", title: "すでに保存済みの丼", description: "材料 卵 1個" },
  ],
  skipped: 1, truncated: false, maxItems: 200,
};

test("playlist import preselects cooking videos, skips saved ones and adds dinner recipes", () => {
  const run = app();
  run(`state.recipes=[{id:"r0",title:"保存済み",videoUrl:"https://youtu.be/ccccccccccc",mealType:"dinner",ingredients:[],steps:[]}]`);
  run(`playlistImport={status:"ready",url:"x",result:${JSON.stringify(listing)},selected:{}};
       const owned=ownedYouTubeIds();
       playlistImport.selected=Object.fromEntries(playlistImport.result.items.map(i=>[i.videoId,!owned.has(i.videoId)&&looksLikeCooking(i)]))`);
  assert.deepEqual(JSON.parse(run("JSON.stringify(playlistImport.selected)")), { aaaaaaaaaaa: true, bbbbbbbbbbb: false, ccccccccccc: false });
  const html = run("renderPlaylistImport()");
  assert.match(html, /1品をレシピに追加して献立へ/);
  assert.match(html, /登録済み/);
  assert.match(html, /料理以外かも/);
  run("playlistImport.selected.ccccccccccc=true; addPlaylistRecipes()");
  assert.equal(run("state.recipes.length"), 2);
  assert.equal(run("state.view"), "plan");
  const added = JSON.parse(run("JSON.stringify(state.recipes[0])"));
  assert.equal(added.mealType, "dinner");
  assert.equal(added.videoUrl, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  assert.equal(added.bulkImport.playlistId, "PLtest12345678");
  assert.ok(added.ingredients.some((i) => i.name.includes("豚こま")));
  assert.equal(added.planning, undefined);
});

test("descriptions without ingredient amounts produce no placeholder shopping items", () => {
  const run = app();
  const recipe = JSON.parse(run(`JSON.stringify(playlistRecipe(${JSON.stringify(listing.items[1])}, {id:"PL",title:"t"}))`));
  assert.deepEqual(recipe.ingredients, []);
});

test("unconfirmed saved recipes stay plannable with visible notes, but food restrictions still exclude them", () => {
  const saved = { id: "r1", title: "保存した丼", mealType: "dinner", ingredients: [], steps: [] };
  const busy = L.profile({ weekdayMinutes: 20, skill: "easy", avoidTasks: ["揚げる"] });
  const fit = L.fit(saved, busy, "2026-09-23");
  assert.equal(fit.ok, true);
  assert.equal(fit.needsReview, true);
  for (const note of ["調理時間は未確認", "難しさは未確認", "作業は未確認", "材料は未確認"]) assert.ok(fit.reasons.includes(note), note);
  assert.equal(L.fit({ ...saved, planning: { minutes: 45 } }, busy, "2026-09-23").ok, false);
  assert.equal(L.fit(saved, L.profile({ restrictions: ["卵"] }), "2026-09-23").ok, false);
  const plan = L.propose({ recipes: [...L.curated, saved], profile: busy, start: "2026-09-23", length: 3,
    addDays: (d, n) => { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); } });
  assert.ok(plan.some((d) => d.candidate?.recipe.id === "r1"));
});

test("cooking screen offers per-dish analysis only for unanalysed YouTube recipes", () => {
  const run = app();
  // No API configured in tests: never offer analysis.
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.youtube.com/watch?v=aaaaaaaaaaa",catalog:null})'), false);
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.youtube.com/watch?v=aaaaaaaaaaa",catalog:{id:"c"}})'), false);
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.instagram.com/reel/abc/"})'), false);
});
