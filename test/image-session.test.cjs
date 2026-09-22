const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {webcrypto}=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../image-import.js'),'utf8');
function session(fetch){
  const context=vm.createContext({fetch,AbortController,setTimeout,clearTimeout,Uint8Array,crypto:webcrypto,sessionStorage:{getItem:()=>null,setItem:()=>{}}});
  vm.runInContext(source,context);
  const s=vm.runInContext('new RecipeImageSession()',context);
  s.images=[{mimeType:'image/jpeg',data:'test',preview:'private preview'}];
  return s;
}

test('client sends only image bytes and session secret; preserves identity on retry',async()=>{
  const bodies=[]; const s=session(async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({title:'rice',ingredients:[],steps:[]})};});
  await s.analyze('http://localhost');await s.analyze('http://localhost');
  assert.equal(bodies[0].clientKey,bodies[1].clientKey); assert.equal(bodies[0].images[0].preview,undefined);
  assert.equal(s.busy,false);
});

test('cancel ignores a late result and prevents concurrent duplicate submission',async()=>{
  let resolve; const s=session(async()=>new Promise(r=>resolve=r));
  const work=s.analyze('http://localhost');await assert.rejects(s.analyze('http://localhost'));
  s.cancel(); resolve({ok:true,json:async()=>({title:'late',ingredients:[],steps:[]})}); assert.equal(await work,null); assert.equal(s.busy,false);
});

test('reorder, remove and clear keep image bytes outside application state',()=>{
  const s=session();s.images.push({data:'second'});s.move(1,-1);assert.equal(s.images[0].data,'second');
  s.remove(0);assert.equal(s.images.length,1);s.clear();assert.equal(s.images.length,0);
});

test('HTTP failures preserve useful error code and release the busy state',async()=>{
  const s=session(async()=>({ok:false,status:409,json:async()=>({error:{code:'image_result_unavailable',message:'結果を取得できません'}})}));
  await assert.rejects(s.analyze('http://localhost'),error=>error.code==='image_result_unavailable');
  assert.equal(s.busy,false);
});

test('malformed successful response is an actionable error, not silent success',async()=>{
  const s=session(async()=>({ok:true,json:async()=>({})}));
  await assert.rejects(s.analyze('http://localhost'),error=>error.code==='invalid_response');
  assert.equal(s.busy,false);
});
