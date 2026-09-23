const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/health',route=>route.fulfill({json:{ok:true,capabilities:{playlistImport:true}}}));
 await page.route('**/api/import/youtube/playlist',route=>route.fulfill({json:{playlist:{id:'PLabcdefghijklmnop',title:'作りたい料理'},items:[
 {videoId:'aaaaaaaaaaa',url:'https://youtube.com/watch?v=aaaaaaaaaaa',title:'卵のフライパンごはん',description:'材料 卵 1個\n1. フライパンで卵を焼く',channelTitle:'料理チャンネル',privacyStatus:'public'},
 {videoId:'bbbbbbbbbbb',url:'https://youtube.com/watch?v=bbbbbbbbbbb',title:'Vlog',description:'散歩',channelTitle:'生活'},
 {videoId:'ccccccccccc',url:'https://youtube.com/watch?v=ccccccccccc',title:'保存済み',description:'材料 鶏肉 100g',channelTitle:'料理'}],skipped:0,truncated:false,maxItems:200}}));
 await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8001');
 await page.waitForSelector('#app button');await page.waitForFunction(()=>playlistAvailable);
 await page.evaluate(()=>{profileEditing=false;state=freshState();state.onboarded=true;state.foodProfile=Lifestyle.profile({completed:true,completedAt:today(),weekdayMinutes:20,weekendMinutes:20,equipment:Lifestyle.equipmentDefaults()});state.recipes=[{...clone(Lifestyle.curated[0]),id:'owned',curated:undefined,videoUrl:'https://youtu.be/ccccccccccc'}];state.view='collection';render();});
 await page.locator('[data-view="playlist"]').click();
 await page.locator('#playlist-url').fill('https://youtube.com/playlist?list=PLabcdefghijklmnop');
 await page.locator('[data-action="playlist-load"]').click();
 await page.waitForSelector('[data-action="playlist-add"]');
 assert.equal(await page.locator('[data-playlist-video="aaaaaaaaaaa"]').isChecked(),true);
 assert.equal(await page.locator('[data-playlist-video="bbbbbbbbbbb"]').isChecked(),false);
 assert.equal(await page.locator('[data-playlist-video="ccccccccccc"]').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'/tmp/pr6-playlist.png',fullPage:true});
 await page.locator('[data-action="playlist-add"]').click();
 assert.equal(await page.evaluate(()=>state.recipes.length),2);
 assert.equal(await page.evaluate(()=>dailyPlan().some(d=>d.candidate?.recipe.bulkImport)),false);
 await page.locator('[data-action="life-review-saved"]').click();
 await page.locator('[data-planning-minute="10"]').click();await page.locator('[data-planning-easy="true"]').click();
 await page.locator('#planning-verified').check();
 await page.locator('[data-action="save-recipe"]').click();
 assert.equal(await page.evaluate(()=>state.view),'plan');
 assert.equal(await page.evaluate(()=>state.recipes[0].planning.conditionsConfirmed),true);
 assert.deepEqual(errors,[]);
 console.log('Playlist mobile flow passed: capability, preview, duplicate exclusion, unverified hold, review and save');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
