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
  const bodies=[]; const s=session(async(url,options)=>{bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({title:'rice'})};});
  await s.analyze('http://localhost');await s.analyze('http://localhost');
  assert.equal(bodies[0].clientKey,bodies[1].clientKey); assert.equal(bodies[0].images[0].preview,undefined);
  assert.equal(s.busy,false);
});

test('cancel ignores a late result and prevents concurrent duplicate submission',async()=>{
  let resolve; const s=session(async()=>new Promise(r=>resolve=r));
  const work=s.analyze('http://localhost');await assert.rejects(s.analyze('http://localhost'));
  s.cancel(); resolve({ok:true,json:async()=>({title:'late'})}); assert.equal(await work,null); assert.equal(s.busy,false);
});

test('reorder, remove and clear keep image bytes outside application state',()=>{
  const s=session();s.images.push({data:'second'});s.move(1,-1);assert.equal(s.images[0].data,'second');
  s.remove(0);assert.equal(s.images.length,1);s.clear();assert.equal(s.images.length,0);
});
