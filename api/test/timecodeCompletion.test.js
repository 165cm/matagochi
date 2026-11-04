import test from 'node:test';
import assert from 'node:assert/strict';
import { completeStepTimes, mergeMissingTimes } from '../src/timecodeCompletion.js';
import { createTimecodeBackfill } from '../src/timecodeBackfill.js';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createTimecodeBook } from '../src/timecodes.js';
const recipe = { videoId: 'abcdefghijk', url: 'https://youtu.be/abcdefghijk', steps: ['切る','焼く','盛る'], stepTimes: [10,null,null], source:'chapters', durationSeconds:300, description:'' };
test('merge fills only holes, rejects backwards, equal and out of duration times', () => {
 assert.deepEqual(mergeMissingTimes(recipe.steps,[10,null,100],[1,50,999],300),[10,50,100]);
 for (const t of [0,10,100,101,300,-1]) assert.deepEqual(mergeMissingTimes(recipe.steps,[10,null,100],[1,t,999],300),[10,null,100]);
});
test('partial transcript continues into video with only missing steps and retains sources', async () => {
 const asked=[];
 const result = await completeStepTimes(recipe,{
  fetchTranscript:async()=>({status:'ok',items:[{start:50,text:'焼く',duration:2}]}),
  matchTranscript:async steps=>{asked.push(steps);return {cueIds:[null,1,null]};},
  paid:async(stage,fn)=>fn(),
  analyze:async(url,steps)=>{asked.push(steps);return {stepTimes:[0,0,100]};}
 });
 assert.deepEqual(result.stepTimes,[10,50,100]);
 assert.deepEqual(asked,[['','焼く','盛る'],['','','盛る']]);
 assert.deepEqual(result.sources,['chapters','transcript','video']);
 assert.equal(result.reason,'complete');
});
test('video failure preserves newly found transcript times and diagnostic',async()=>{
 const result=await completeStepTimes(recipe,{fetchTranscript:async()=>({status:'ok',items:[{start:50,text:'焼く',duration:2}]}),matchTranscript:async()=>({cueIds:[null,1,null]}),paid:async(s,fn)=>fn(),analyze:async()=>{throw Object.assign(new Error(),{code:'video_failed'});}});
 assert.deepEqual(result.stepTimes,[10,50,null]);assert.equal(result.reason,'video_failed');
});
test('unknown and long durations never call paid work',async()=>{
 for(const durationSeconds of [null,0,1801]) {
 const result=await completeStepTimes({...recipe,durationSeconds},{paid:()=>assert.fail()});
 assert.equal(result.reason,durationSeconds>1800?'duration_unsupported':'duration_unknown');
 }
});
function setup(store,extra={}) {
 let calls=0,saves=0;
 const deps={list:async()=>[recipe],load:async()=>({...recipe,revision:'r1'}),reserveGlobal:async()=>{},measure:async fn=>({result:await fn(),yen:2}),complete:async(r,paid)=>{await paid('video',async()=>{calls++;});return {stepTimes:[10,50,100],reason:'complete',stages:[]};},save:async()=>{saves++;},...extra};
 return {deps,counts:()=>({calls,saves})};
}
test('disabled, budget and protected recipes never spend',async()=>{
 for(const options of [{enabled:false},{enabled:true,monthlyYen:0},{enabled:true,monthlyYen:100},{enabled:true,totalYen:100}]) {
 const store=createMemorySyncStore(),x=setup(store);
 await createTimecodeBackfill(store,x.deps,options).run();assert.equal(x.counts().calls,0);
 }
 const store=createMemorySyncStore(),x=setup(store,{load:async()=>({...recipe,protected:true})});
 await createTimecodeBackfill(store,x.deps,{enabled:true}).run();assert.equal(x.counts().calls,0);
});
test('two workers share lock and completed attempts are not paid again',async()=>{
 const store=createMemorySyncStore(),x=setup(store);
 const a=createTimecodeBackfill(store,x.deps,{enabled:true}),b=createTimecodeBackfill(store,x.deps,{enabled:true});
 await Promise.all([a.run(),b.run()]);await a.run();assert.deepEqual(x.counts(),{calls:1,saves:1});
 const state=await a.report();assert.equal(state.reservedYen,2);assert.equal(state.totalReservedYen,2);
});
test('uncertain cost stays reserved, retry is deferred and lifetime budget survives new month',async()=>{
 const store=createMemorySyncStore(),x=setup(store,{measure:async fn=>({result:await fn(),yen:null}),complete:async(r,paid)=>{await paid('video',async()=>{});throw new Error('lost');}});
 const a=createTimecodeBackfill(store,x.deps,{enabled:true,now:()=>Date.parse('2026-11-01')});
 await a.run();assert.equal((await a.report()).totalReservedYen,50);assert.equal((await a.run()).reason,'no_eligible_recipes');
 const b=createTimecodeBackfill(store,x.deps,{enabled:true,totalYen:150,now:()=>Date.parse('2026-12-01')});
 assert.equal((await b.run()).reason,'monthly_limit');
});
test('completion save cannot overwrite a concurrent manual correction or clear',async()=>{
 const store=createMemorySyncStore(),book=createTimecodeBook(store);
 await book.fix({...recipe,stepTimes:[10,40,90]},'',{admin:true});
 const old=await book.stored(recipe);
 await book.fix({...recipe,stepTimes:[null,null,null]},'',{admin:true});
 const result=await book.saveCompletion({...recipe,stepTimes:[10,50,100],generation:old.generation,guard:async()=>true});
 assert.equal(result.superseded,true);assert.equal((await book.stored(recipe)).cleared,true);
});
test('sample stays fixed and includes five fully timed controls without paying for them',async()=>{
 const {sampleRecipes}=await import('../src/timecodeSample.js');
 const rows=Array.from({length:70},(_,i)=>({...recipe,videoId:String(i).padStart(11,'0'),channelId:`ch${i%10}`,stepTimes:i<40?[]:i<55?[10]:[10,50,100]}));
 const selected=sampleRecipes(rows);
 assert.equal(selected.length,50);
 assert.equal(selected.filter(r=>!r.stepTimes.length).length,35);
 assert.equal(selected.filter(r=>r.stepTimes.length===1).length,10);
 assert.equal(selected.filter(r=>r.stepTimes.length===3).length,5);
});
test('admin backfill API writes a new recipe version, shares times, reports progress and enforces auth',async t=>{
 process.env.NODE_ENV='test';
 const {createApp}=await import('../src/server.js');
 const {weekOf}=await import('../src/trends.js');
 const {once}=await import('node:events');
 const store=createMemorySyncStore(),at=new Date().toISOString();
 const full={...recipe,title:'卵炒め',ingredients:[{name:'卵',amount:'1個'},{name:'豚肉',amount:'100g'},{name:'塩',amount:'少々'}],channelId:'UCtest',channelTitle:'test',videoUrl:recipe.url,planning:{minutes:10},snippetFetchedAt:at,catalog:{revision:'r1',analyzedAt:at,extractorVersion:99}};
 await store.put(`youtube-${recipe.videoId}`,{status:'ready',result:full});
 await store.put('trends/index',{weeks:[{week:weekOf(Date.now()),startedAt:at,candidates:[],tried:[],items:[{videoId:recipe.videoId}],skipped:{}}]});
 let calls=0;
 const app=createApp({RECIPE_ADMIN_TOKEN:'test-token',TIMECODE_BACKFILL_ENABLED:'true'},{recipeStore:store,syncStore:null,photoStore:null,resolveChannel:async()=>null,searchRecipes:async()=>[],fetchYouTubeSnippet:async()=>({durationSeconds:300,description:''}),fetchYouTubeTranscript:async()=>({status:'not_available',reason:'unplayable'}),analyzeStepTimes:async()=>{calls++;return {stepTimes:[999,50,100]};}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const base=`http://127.0.0.1:${server.address().port}`,path='/api/admin/timecodes/backfill',headers={Authorization:'Bearer test-token'};
 assert.equal((await fetch(base+path,{method:'POST'})).status,403);assert.equal(calls,0);
 const response=await fetch(base+path,{method:'POST',headers});const result=await response.json();
 assert.equal(response.status,200,JSON.stringify(result));assert.equal(result.after,3,JSON.stringify(result));
 const saved=(await store.get(`youtube-${recipe.videoId}`)).envelope.result;
 assert.deepEqual(saved.stepTimes,[10,50,100]);assert.notEqual(saved.catalog.revision,'r1');assert.equal(saved.stepTimesFrom,'completion');
 const book=createTimecodeBook(store);assert.deepEqual((await book.stored(recipe)).stepTimes,[10,50,100]);
 const next=await (await fetch(base+path,{method:'POST',headers})).json();assert.equal(next.done,true);assert.equal(calls,1);
 const report=await (await fetch(base+path,{headers})).json();assert.equal(report.attempts.length,1);assert.equal(report.attempts[0].stages[0].reason,'unplayable');
});
test('live mode admits new recipes after pilot, without resetting the lifetime budget',async()=>{
 const store=createMemorySyncStore(),x=setup(store);
 await createTimecodeBackfill(store,x.deps,{enabled:true}).run();
 const newRecipe={...recipe,videoId:'zzzzzzzzzzz'};
 x.deps.list=async()=>[newRecipe];
 x.deps.load=async()=>({...newRecipe,revision:'r2'});
 assert.equal((await createTimecodeBackfill(store,x.deps,{enabled:true}).run()).reason,'no_eligible_recipes');
 await createTimecodeBackfill(store,x.deps,{enabled:true,pilot:false}).run();
 assert.equal(x.counts().calls,2);
 assert.equal((await store.get('timecode-backfill/state')).envelope.totalReservedYen,4);
});
