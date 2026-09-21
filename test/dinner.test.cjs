const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const fullSource = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const source = fullSource.slice(0, fullSource.lastIndexOf('document.querySelectorAll(".tab")'));
function app() {
  const context = vm.createContext({ console, URL, Date, document: { querySelector: () => null, querySelectorAll: () => [] } });
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
    {id:'b',title:'B',mealType:'dinner',sourceServings:4,ingredients:[{name:'米',amount:'400g'}]}];`);
  assert.equal(run('buildShoppingList()[0].amount'), '250g');
  run('state.draft.sourceServings = null');
  assert.equal(run('buildShoppingList()[0].amount'), '250g');
});

test('invalid imported portion metadata never divides by zero', () => {
  const run = app();
  assert.equal(run(`scaleAmountForServings('300g', 1, 0)`), '300g（元の人数未確認）');
});
