const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('browser error:',e.message)});
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8001');
 await page.waitForSelector('#app button');
 await page.evaluate(()=>{
  profileEditing=false;state=freshState();state.onboarded=true;state.foodProfile=Lifestyle.profile({completed:true,completedAt:today(),weekdayMinutes:20,weekendMinutes:20,skill:'easy',restrictions:['卵'],equipment:Lifestyle.equipmentDefaults(),pantry:{米:'have'}});
  state.view='register';state.draft={...emptyDraft,title:'保存した鶏ごはん',sourceServings:1};state.draftExpanded=true;
  state.extractedIngredients=[ingredient('鶏肉','100g','肉'),ingredient('しょうゆ','小さじ1','調味料')];state.extractedSteps=['フライパンで中心まで焼く'];render();
 });
 await page.locator('[data-action="save-recipe"]').click();
 assert.equal(await page.evaluate(()=>state.recipes.length),0);
 await page.locator('[data-planning-minute="20"]').click();
 await page.locator('[data-planning-easy="true"]').click();
 await page.locator('#planning-verified').check();await page.locator('#planning-confirmed').check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/ux-planning.png',fullPage:true});
 await page.locator('[data-action="save-recipe"]').click();
 assert.equal(await page.evaluate(()=>state.recipes.length),1);
 assert.equal(await page.evaluate(()=>Lifestyle.fit(state.recipes[0],dailyProfile(),today()).ok),true);
 await page.evaluate(()=>{confirmDaily({date:today()},Lifestyle.curated[2]);state.view='shopping';render();});
 await page.getByRole('checkbox',{name:'豚こまを購入済みにする',exact:true}).check();
 assert.equal(await page.evaluate(()=>dailyShopping().find(i=>i.name==='豚こま').status),'purchased');
 assert.equal(await page.evaluate(()=>dailyShopping().find(i=>i.name==='ごはん').status),'have');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/ux-shopping.png',fullPage:true});
 await page.evaluate(()=>{confirmDaily({date:addDays(today(),-1)},Lifestyle.curated[0]);state.view='today';render();});
 await page.locator('[data-action="life-record-past"]').click();
 await page.locator('[data-action="life-frequency"][data-cycle="twice_month"]').click();
 assert.equal(await page.evaluate(()=>state.evaluations[0].familyRepeatCycles[state.family[0]]),'twice_month');
 assert.equal(await page.locator('[data-action="life-frequency"]').count(),0);
 assert.equal(await page.evaluate(()=>state.evaluations[0].cookedAt),await page.evaluate(()=>addDays(today(),-1)));
 // Unknown saved dish is visible in swaps but must be reviewed before selection.
 await page.evaluate(()=>{state.recipes.unshift({...clone(Lifestyle.curated[0]),planning:undefined,curated:undefined,id:'unreviewed-test',title:'未確認トマトごはん',mealType:'dinner',ingredients:[ingredient('トマト','1個','野菜')],steps:['切る']});state.view='plan';swapDate=addDays(today(),1);render();});
 assert.equal(await page.locator('[data-action="life-review-saved"][data-recipe="unreviewed-test"]').count(),1);
 await page.locator('[data-action="life-review-saved"][data-recipe="unreviewed-test"]').click();
 await page.locator('[data-planning-minute="10"]').click();await page.locator('[data-planning-easy="true"]').click();
 await page.locator('#planning-verified').check();await page.locator('#planning-confirmed').check();
 await page.locator('[data-action="save-recipe"]').click();
 assert.equal(await page.evaluate(()=>state.view),'plan');
 assert.equal(await page.locator('[data-action="life-choose"][data-recipe="unreviewed-test"]').count(),1);
 assert.deepEqual(errors,[]);console.log('Mobile UX: save confirmation, shopping checkbox, rice pantry, retrospective rating, swap review passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
