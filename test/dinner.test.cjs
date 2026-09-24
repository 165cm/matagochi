const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fullSource = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
function app() {
  const context = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
  for (const file of ['dinner-persona.js','taste.js','taste-ui.js','starter-recipes.js','lifestyle.js','daily-ui.js','playlist-import.js','household.js']) vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(source, context);
  return (code) => vm.runInContext(code, context);
}

test('dinner plan excludes other meal types and incompatible overrides without deleting saved recipes', () => {
  const run = app();
  run(`state = clone(demoState); state.evaluations = []; state.recipes = ['breakfast','lunch','side','soup','dinner','dinner'].map((mealType,i)=>({id:String(i),title:String(i),mealType})); state.planOverrides = {[today()]: '2'};`);
  assert.equal(run('getMealCandidates().length'), 2);
  assert.equal(run('buildWeeklyPlan().filter(day=>day.candidate).length'), 2);
  assert.equal(run('buildWeeklyPlan().some(day=>day.candidate && day.candidate.recipe.mealType !== "dinner")'), false);
  assert.equal(run('state.recipes.length'), 6);
});

test('scales source portions without assuming unknown serves one; qualitative amounts stay intact', () => {
  const run = app();
  assert.equal(run(`scaleAmountForServings('300g', 1, 2)`), '150g');
  assert.equal(run(`scaleAmountForServings('大さじ1/2', 2, 4)`), '大さじ0.25');
  assert.equal(run(`scaleAmountForServings('適量', 2, 2)`), '適量');
  assert.equal(run(`scaleAmountForServings('300g', 2, null)`), '300g（元の人数未確認）');
  assert.equal(run(`scaleAmountForServings('300g', 2)`), '600g');
});

test('saved recipe snapshots and catalog provenance survive state normalization', () => {
  const run = app();
  run(`state = clone(demoState); state.recipes[0].catalog = {id:'youtube-abcdefghijk', revision:'v1'}; state.recipes[0].sourceServings = 2; state.recipes[0].ingredients[0].amount = '自分用'; state = normalizeState(JSON.parse(JSON.stringify(state)));`);
  assert.equal(run('state.recipes[0].catalog.revision'), 'v1');
  assert.equal(run('state.recipes[0].sourceServings'), 2);
  assert.equal(run('state.recipes[0].ingredients[0].amount'), '自分用');
});

test('capture keeps provenance on unchanged URL and captures edited steps and original portions', () => {
  const run = app();
  run(`state = clone(demoState); state.draft.catalog = {revision:'v1'}; const inputs = {'#recipe-url': state.draft.videoUrl, '#recipe-steps':'切る\\n焼く', '#source-servings':'2'}; document.querySelector = (key) => key in inputs ? {value:inputs[key]} : null; captureDraft();`);
  assert.equal(run('state.draft.catalog.revision'), 'v1');
  assert.equal(run('state.extractedSteps.join(",")'), '切る,焼く');
  assert.equal(run('state.draft.sourceServings'), 2);
  run(`inputs['#recipe-url'] = 'https://youtu.be/12345678901'; captureDraft();`);
  assert.equal(run('state.draft.catalog'), null);
});

test('shopping scales each saved recipe independently of an unrelated draft', () => {
  const run = app();
  run(`state = clone(demoState); state.evaluations=[]; state.servingCount=1; state.draft.sourceServings=10;
    state.recipes = [{id:'a',title:'A',mealType:'dinner',sourceServings:2,ingredients:[{name:'米',amount:'300g'}]},
    {id:'b',title:'B',mealType:'dinner',sourceServings:4,ingredients:[{name:'米',amount:'400g'}]}]; state.mealSlots=Object.fromEntries(state.recipes.map((recipe,i)=>[addDays(today(),i),{date:addDays(today(),i),recipe,servings:1,status:'confirmed'}]));`);
  assert.equal(run('buildShoppingList()[0].amount'), '250g');
  run('state.draft.sourceServings = null');
  assert.equal(run('buildShoppingList()[0].amount'), '250g');
});

test('invalid imported portion metadata never divides by zero', () => {
  const run = app();
  assert.equal(run(`scaleAmountForServings('300g', 1, 0)`), '300g（元の人数未確認）');
});

test('image drafts cannot be saved without explicit review; accepted text has no shared catalog', async () => {
  const run = app();
  run(`state=clone(demoState); state.recipes=[]; state.draft={...emptyDraft,requiresImageReview:true,catalog:null}; state.extractedIngredients=[ingredient('米','不明','主食')]; state.extractedSteps=['炊く'];
    const fields={'#recipe-title':{value:'画像の丼'},'#recipe-url':{value:''},'#image-reviewed':{checked:false}};
    document.querySelector=key=>fields[key]||null; showToast=()=>{};saveState=()=>{};render=()=>{};`);
  await run(`handleAction({currentTarget:{dataset:{action:'save-recipe'}}})`);
  assert.equal(run('state.recipes.length'),0);
  run(`fields['#image-reviewed'].checked=true;`);
  await run(`handleAction({currentTarget:{dataset:{action:'save-recipe-unreviewed'}}})`);
  assert.equal(run('state.recipes.length'),1);
  assert.equal(run('state.recipes[0].catalog'),null);
  assert.equal(run('state.recipes[0].ingredients[0].amount'),'不明');
});

test('image timeout restores manual entry status rather than leaving analysis progress', async () => {
  const run=app();
  run(`state=clone(demoState);state.view='register';state.draft={...emptyDraft};state.editingRecipeId=null;
    imageSession={version:0,analyze:async()=>{throw Object.assign(new Error('timeout'),{name:'AbortError'});}};
    saveState=()=>{};render=()=>{};`);
  await run(`handleAction({currentTarget:{dataset:{action:'analyze-images'}}})`);
  assert.match(run('state.fetchStatus'),/手動入力/);
  assert.equal(run('state.draftExpanded'),true);
});

test('late image analysis cannot replace edits made while waiting', async () => {
  const run=app();
  run(`state=clone(demoState);state.view='register';state.draft={...emptyDraft};state.editingRecipeId=null;
    const imageFields={'#recipe-title':{value:'自分の題名'},'#recipe-url':{value:''}};
    document.querySelector=key=>imageFields[key]||null;
    let finishImage;
    imageSession={version:0,analyze:()=>new Promise(resolve=>finishImage=resolve)};
    saveState=()=>{};render=()=>{};`);
  const work=run(`handleAction({currentTarget:{dataset:{action:'analyze-images'}}})`);
  run(`imageFields['#recipe-title'].value='待機中の編集';captureDraft();finishImage({title:'AIの題名'});`);
  await work;
  assert.equal(run('state.draft.title'),'待機中の編集');
  assert.match(run('state.fetchStatus'),/上書きを止めました/);
});

test('comparison aligns inserted ingredients and escapes user markup', () => {
  const run=app();
  const rows=JSON.parse(run(`JSON.stringify(recipeDiff(['米: 100g','塩: 適量','焼く'],['米: 100g','油: 小さじ1','塩: 適量','焼く']))`));
  assert.deepEqual(rows.filter(x=>x.kind!=='same'),[{kind:'common',text:'油: 小さじ1'}]);
  run(`state=clone(demoState);state.draft={title:'<img src=x onerror=alert(1)>',catalog:{id:'x'},sourceServings:1}; state.extractedIngredients=[];state.extractedSteps=[]; sharedRecipeComparison={title:'ご飯',catalog:{id:'x'},ingredients:[],steps:[],sourceServings:1};`);
  assert.match(run('renderCommonComparison()'), /&lt;img/);
  assert.doesNotMatch(run('renderCommonComparison()'), /<img src=x/);
});

test('unchanged draft capture during analysis does not discard successful image result', async () => {
  const run=app();
  run(`state=clone(demoState);state.view='register';state.editingRecipeId=null;state.draft=clone(emptyDraft);state.extractedIngredients=[];state.extractedSteps=[];
    const imageFields={'#recipe-title':{value:''},'#recipe-url':{value:''}};
    document.querySelector=key=>imageFields[key]||null;render=()=>{};saveState=()=>{};
    let finishImage;imageSession={version:0,analyze:()=>new Promise(resolve=>finishImage=resolve)};`);
  const work=run(`handleAction({currentTarget:{dataset:{action:'analyze-images'}}})`);
  run(`captureDraft();finishImage({title:'画像のごはん',ingredients:[{name:'米',amount:'100g'}],steps:['盛る']});`);
  await work;
  assert.equal(run('state.draft.title'),'画像のごはん');
  assert.equal(run('imageFeedback.tone'),'success');
});
