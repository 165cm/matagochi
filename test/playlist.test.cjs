const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../lifestyle.js");

function app(apiUrl="") {
  const ctx = vm.createContext({ console, URL, Date, MATAGOCHI_API_BASE_URL:apiUrl, window:{scrollTo(){}}, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const f of ["dinner-persona.js", "taste.js", "taste-ui.js", "starter-recipes.js", "skills.js", "aisles.js", "lifestyle.js", "daily-ui.js", "playlist-import.js", "household.js", "skill-quiz.js", "tickets.js", "app.js"]) {
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
  assert.match(html, /1品を保存して条件を確認/);
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
  assert.equal(added.planning.conditionsConfirmed, false);
  assert.equal(added.planning.ingredientsVerified, false);
});

test("descriptions without ingredient amounts produce no placeholder shopping items", () => {
  const run = app();
  const recipe = JSON.parse(run(`JSON.stringify(playlistRecipe(${JSON.stringify(listing.items[1])}, {id:"PL",title:"t"}))`));
  assert.deepEqual(recipe.ingredients, []);
});

test("playlist drafts require review before entering automatic meal plans", () => {
 const saved={id:"r1",title:"保存した丼",mealType:"dinner",ingredients:[],steps:[]};
 const busy=L.profile({weekdayMinutes:20,skill:"easy",avoidTasks:["揚げる"]});
 assert.equal(L.fit(saved,busy,"2026-09-23").ok,false);
 assert.equal(L.reviewable(saved,busy,"2026-09-23"),true);
 assert.equal(L.fit(saved,L.profile({restrictions:["卵"]}),"2026-09-23").ok,false);
 const run=app();
 run('state.onboarded=true;state.recipes=[{id:"r1",title:"未確認",mealType:"dinner",ingredients:[],steps:[]}];swapDate=today()');
 assert.match(run('renderSwapChoices()'),/確認が必要/);
 assert.match(run('renderSwapChoices()'),/life-review-saved/);
});

test("cooking screen offers per-dish analysis only for unanalysed YouTube recipes", () => {
  const run = app();
  // No API configured in tests: never offer analysis.
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.youtube.com/watch?v=aaaaaaaaaaa",catalog:null})'), false);
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.youtube.com/watch?v=aaaaaaaaaaa",catalog:{id:"c"}})'), false);
  assert.equal(run('canAnalyzeRecipe({videoUrl:"https://www.instagram.com/reel/abc/"})'), false);
});

test("analysis creates a review draft without changing saved recipes or confirmed meals",async()=>{
 const run=app('https://api.test');
 run(`state.onboarded=true;const original={...clone(Lifestyle.curated[0]),id:'saved',videoUrl:'https://youtube.com/watch?v=abcdefghijk',planning:undefined,curated:undefined,catalog:null};state.recipes=[original];confirmDaily({date:today()},original);cookingDate=today();state.view='cooking';const before=JSON.stringify(state.recipes);const slotBefore=JSON.stringify(state.mealSlots);importRecipeFromYouTube=async()=>({title:'AI',ingredients:[{name:'トマト',amount:'1個'}],steps:['切る'],sourceServings:1,catalog:{id:'youtube-abcdefghijk'}});`);
 await run('analyzeCookingRecipe(today())');
 assert.equal(run('JSON.stringify(state.recipes)===before'),true);
 assert.equal(run('JSON.stringify(state.mealSlots)===slotBefore'),true);
 assert.equal(run('state.view'),'register');assert.equal(run('state.extractedIngredients[0].name'),'トマト');
});
test("late analysis never overwrites edits or rerenders another active form",async()=>{
 const run=app('https://api.test');
 run(`state.onboarded=true;const r={...clone(Lifestyle.curated[0]),id:'saved',videoUrl:'https://youtube.com/watch?v=abcdefghijk',planning:undefined,curated:undefined,catalog:null};state.recipes=[r];confirmDaily({date:today()},r);cookingDate=today();state.view='cooking';let finish,calls=0,renders=0;render=()=>{renders++};importRecipeFromYouTube=()=>{calls++;return new Promise(resolve=>{finish=resolve})};const pending=analyzeCookingRecipe(today());analyzeCookingRecipe(today());state.view='register';state.recipes[0].note='new edit';finish({ingredients:[{name:'卵'}]});`);
 await run('pending');assert.equal(run('calls'),1);assert.equal(run('renders'),1);
 assert.equal(run('state.recipes[0].note'),'new edit');
});
test("unlisted videos are stored without offering shared AI analysis",()=>{
 const run=app('https://api.test');
 assert.equal(run('canAnalyzeRecipe({videoUrl:"https://youtube.com/watch?v=abcdefghijk",bulkImport:{privacyStatus:"unlisted"}})'),false);
});
