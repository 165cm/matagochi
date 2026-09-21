import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createImageImporter, normalizeImageResult, prepareImages } from '../src/imageImport.js';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
const clientKey='a'.repeat(64);
const fixture=async()=>({mimeType:'image/png',data:(await sharp({create:{width:50,height:30,channels:3,background:'white'}}).png().toBuffer()).toString('base64')});
const recipe=()=>({title:'PRIVATE rice',ingredients:[{name:'rice',amount:null}],steps:[],sourceServings:null});

test('image validation re-encodes, strips metadata and rejects MIME spoofing and corrupt data',async()=>{
  const png=await sharp({create:{width:2000,height:100,channels:3,background:'white'}}).withMetadata().png().toBuffer();
  const [prepared]=await prepareImages([{buffer:png,mimeType:'image/png'}]);
  const metadata=await sharp(Buffer.from(prepared.data,'base64')).metadata();
  assert.equal(metadata.width,1600); assert.equal(metadata.format,'jpeg'); assert.equal(metadata.exif,undefined);
  await assert.rejects(prepareImages([{buffer:png,mimeType:'image/jpeg'}]),{code:'invalid_image'});
  await assert.rejects(prepareImages([{buffer:Buffer.from('not image'),mimeType:'image/png'}]),{code:'invalid_image'});
});

test('same session/image concurrent requests call AI once; no images, secret or text are persisted',async()=>{
  const store=createMemorySyncStore(), writes=[];
  const originalPut=store.put; store.put=async(...args)=>{writes.push(JSON.stringify(args));return originalPut(...args);};
  let calls=0;
  const importer=createImageImporter({store,reserveBudget:async()=>{},analyze:async()=>{calls++;return recipe();}});
  const body={clientKey,images:[await fixture()]};
  const [a,b]=await Promise.all([importer(body),importer(body)]);
  a.ingredients[0].name='changed'; assert.equal(b.ingredients[0].name,'rice');
  assert.equal((await importer(body)).cacheHit,true); assert.equal(calls,1);
  const persisted=writes.join('');
  assert.ok(!persisted.includes(clientKey)); assert.ok(!persisted.includes(body.images[0].data)); assert.ok(!persisted.includes('PRIVATE'));
  assert.equal((await importer({...body,clientKey:'b'.repeat(64)})).cacheHit,false); assert.equal(calls,2);
});

test('restart/expiry cannot cause duplicate analysis; another instance sees pending',async()=>{
  const store=createMemorySyncStore();let calls=0,now=0,resolve,started;
  const ready=new Promise(r=>started=r);
  const importer=createImageImporter({store,now:()=>now,reserveBudget:async()=>{},analyze:async()=>{calls++;started();return new Promise(r=>resolve=r);}});
  const second=createImageImporter({store,reserveBudget:async()=>{},analyze:recipe});
  const body={clientKey,images:[await fixture()]}; const work=importer(body); await ready;
  await assert.rejects(second(body),{code:'image_result_unavailable'});
  resolve(recipe()); await work;
  await assert.rejects(second(body),{code:'image_result_unavailable'});
  now=11*60_000; await assert.rejects(importer(body),{code:'image_result_unavailable'}); assert.equal(calls,1);
});

test('failed/ambiguous AI results cannot be automatically billed again',async()=>{
  let calls=0; const importer=createImageImporter({store:createMemorySyncStore(),reserveBudget:async()=>{},analyze:async()=>{calls++;throw new Error('timeout');}});
  const body={clientKey,images:[await fixture()]};
  await assert.rejects(importer(body),/timeout/); await assert.rejects(importer(body),{code:'image_result_unavailable'}); assert.equal(calls,1);
});

test('invalid count, MIME, base64, oversized data and non-image bytes do not consume AI budget',async()=>{
  let budget=0;const importer=createImageImporter({store:createMemorySyncStore(),reserveBudget:async()=>budget++,analyze:recipe});
  const valid=await fixture();
  for(const images of [[],Array(6).fill(valid),[{mimeType:'text/plain',data:'abcd'}],[{mimeType:'image/png',data:'***'}],[{mimeType:'image/png',data:'a'.repeat(1_500_000)}],[{mimeType:'image/png',data:Buffer.from('fake').toString('base64')}]]) await assert.rejects(importer({clientKey,images}));
  assert.equal(budget,0);
});

test('image and URL analysis share global budget; cached private result remains usable',async()=>{
  const store=createMemorySyncStore(); const catalog=createRecipeCatalog(store,recipe,{dailyLimit:1});
  const importer=createImageImporter({store,reserveBudget:()=>catalog.reserveAnalysisBudget(),analyze:recipe});
  const body={clientKey,images:[await fixture()]}; await importer(body);
  await assert.rejects(catalog.import('https://youtu.be/abcdefghijk'),{code:'analysis_budget_exceeded'});
  assert.equal((await importer(body)).cacheHit,true);
});

test('unknown amounts remain unknown and multiple dishes are not blended',()=>{
  const result=normalizeImageResult(recipe());
  assert.equal(result.ingredients[0].amount,'不明'); assert.equal(result.sourceServings,null); assert.equal(result.requiresReview,true);
  assert.ok(result.warnings.length);assert.equal(result.catalog,null);
  assert.throws(()=>normalizeImageResult({...recipe(),multipleRecipes:true}),{code:'multiple_recipes'});
  assert.throws(()=>normalizeImageResult(null),{code:'invalid_image_analysis'});
});
