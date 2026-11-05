import test from 'node:test';
import assert from 'node:assert/strict';
import { timecodeIssues, qualitySummary } from '../src/timecodeQuality.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { createMemorySyncStore } from '../src/syncStore.js';
test('逆転・同時刻・尺外・不正値を点検し、穴は勝手に埋めない',()=>{
 assert.deepEqual(timecodeIssues(['a','b','c','d','e'],[103,20,20,300,-1],300).map(x=>x.code),['order','same','beyond','invalid']);
 assert.deepEqual(timecodeIssues(['a','b','c'],[0,null,10]),[]);
 const q=qualitySummary([{issues:[],reviewed:false,durationKnown:false}]);
 assert.equal(q.structurePassed,1);assert.equal(q.reviewed,0);assert.equal(q.durationUnknown,1);
});
test('補完の保存直前にも検査し、不正な候補は保存データを変えない',async()=>{
 const url='https://youtu.be/abcdefghijk';
 const c=createRecipeCatalog(createMemorySyncStore(),async()=>({title:'料理',steps:['切る','焼く'],ingredients:[{name:"魚",amount:"1切れ"}]}));
 await c.import(url);
 const before=await c.peek(url);
 await assert.rejects(c.setStepTimes(url,[20,10],{from:'completion'}),e=>e.code==='timecode_quality_failed');
 assert.deepEqual(await c.peek(url),before);
});
