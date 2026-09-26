import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { createMemorySyncStore } from '../src/syncStore.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

async function fixture(t, env = {}) {
  let calls = 0;
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'test-only-admin', ...env }, {
    recipeStore: createMemorySyncStore(), syncStore: null,
    analyzeImages: async () => ({title:"画像の丼",ingredients:[{name:"米",amount:null}],steps:[]}),
    importRecipe: async () => { calls++; return { title: '丼', ingredients: [{ name:'米', amount:'2合' }], steps:['炊く'], sourceServings:2 }; }
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls: () => calls, request: (path, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${path}`, body === undefined ? {} : { method:'POST', headers:{'Content-Type':'application/json',...headers}, body:JSON.stringify(body) }) };
}

test('HTTP import, correction approval authentication, comparison and original snapshot isolation', async t => {
  const f = await fixture(t);
  const result = await f.request('/api/import/youtube', {url:'https://youtu.be/abcdefghijk'}).then(r=>r.json());
  const cached = await f.request('/api/import/youtube', {url:'https://youtube.com/shorts/abcdefghijk?si=abc'}).then(r=>r.json());
  assert.equal(cached.cacheHit, true); assert.equal(f.calls(),1);
  const proposalResponse = await f.request('/api/recipes/corrections', { catalogId:result.catalog.id,baseRevision:result.catalog.revision,reason:'元の材料は1合',recipe:{...result,ingredients:[{name:'米',amount:'1合'}]} });
  assert.equal(proposalResponse.status,201);
  const {proposalId} = await proposalResponse.json();
  assert.equal((await f.request(`/api/admin/corrections/${proposalId}/review`, {decision:'approve'})).status,403);
  assert.equal((await f.request(`/api/admin/corrections/${proposalId}/review`, {decision:'approve'}, {Authorization:'Bearer test-only-admin'})).status,200);
  const common = await f.request(`/api/recipes/${result.catalog.id}`).then(r=>r.json());
  assert.equal(common.ingredients[0].amount,'1合');
  assert.equal(result.ingredients[0].amount,'2合');
});

test('HTTP oversize errors return JSON and rate limiting includes allowed CORS', async t => {
  const f = await fixture(t, {ALLOWED_ORIGINS:'https://example.com'});
  const oversized = await f.request('/api/recipes/corrections', {reason:'a'.repeat(70000)});
  assert.equal(oversized.status,413); assert.equal((await oversized.json()).error.code,'request_too_large');
  let limited;
  for(let i=0;i<61;i++) limited=await f.request('/api/import/youtube',{url:'invalid'},{Origin:'https://example.com'});
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get('Access-Control-Allow-Origin'),'https://example.com');
  assert.equal(limited.headers.get('Retry-After'),'60');
});


test('HTTP image import accepts bounded images above normal JSON limit and returns private review draft', async t => {
  const f = await fixture(t);
  const bytes = await sharp(randomBytes(200*200*3),{raw:{width:200,height:200,channels:3}}).png().toBuffer();
  assert.ok(bytes.length > 65536);
  const body={clientKey:'a'.repeat(64),images:[{mimeType:'image/png',data:bytes.toString('base64')}]};
  const response=await f.request('/api/import/images',body);assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.requiresReview,true);assert.equal(result.catalog,null);assert.equal(result.ingredients[0].amount,'不明');
  assert.equal((await f.request('/api/import/images',body).then(r=>r.json())).cacheHit,true);
  assert.equal((await f.request('/api/import/images',{...body,images:[]})).status,400);
});

test('playlist route validates the URL and returns items without AI analysis', async t => {
  const app = createApp({}, { recipeStore: createMemorySyncStore(), syncStore: null,
    importRecipe: async () => { throw new Error('AI must not run'); },
    fetchPlaylist: async (id) => ({ playlist: { id, title: 'list' }, items: [{ videoId: 'abcdefghijk' }], skipped: 0, truncated: false }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (url) => fetch(`http://127.0.0.1:${server.address().port}/api/import/youtube/playlist`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
  const ok = await post('https://www.youtube.com/playlist?list=PLabcdefghijklmnop').then(r => r.json());
  assert.equal(ok.playlist.id, 'PLabcdefghijklmnop'); assert.equal(ok.items.length, 1);
  const bad = await post('https://www.youtube.com/playlist?list=WL');
  assert.equal(bad.status, 422);
});

test('playlist requests are coalesced and separately rate limited; health advertises capability',async t=>{
 let calls=0,release;
 const wait=new Promise(r=>{release=r});
 const app=createApp({}, {recipeStore:createMemorySyncStore(),syncStore:null,fetchPlaylist:async id=>{calls++;await wait;return {playlist:{id},items:[]}}});
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=()=>fetch(base+'/api/import/youtube/playlist',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://youtube.com/playlist?list=PLabcdefghijklmnop'})});
 const requests=[post(),post()];release();
 assert.ok((await Promise.all(requests)).every(r=>r.status===200));assert.equal(calls,1);
 for(let i=0;i<4;i++) assert.equal((await post()).status,200);
 assert.equal((await post()).status,429);assert.equal(calls,1);
 assert.notEqual((await fetch(base+'/api/recipes/invalid')).status,429);
 assert.equal((await fetch(base+'/health').then(r=>r.json())).capabilities.playlistImport,true);
});

test('youtube import still returns the title and description when AI analysis fails', async (t) => {
  const app = createApp({}, { recipeStore: createMemorySyncStore(), syncStore: null,
    importRecipe: async () => { const e = new Error('AIの応答を確認できませんでした。'); e.code = 'analysis_uncertain'; throw e; },
    fetchYouTubeSnippet: async (id) => ({ title: '豚こま丼', description: '材料（2人分）\n豚こま 200g', channelTitle: 'テストごはん' }) });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise((r) => server.close(r)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/import/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://youtube.com/shorts/abcdefghijk?si=x' }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.title, '豚こま丼'); assert.match(body.caption, /豚こま 200g/); assert.equal(body.channelTitle, 'テストごはん');
  assert.deepEqual(body.ingredients, []); assert.equal(body.analysis.ok, false); assert.equal(body.analysis.code, 'analysis_uncertain');
  const bad = await fetch(`http://127.0.0.1:${server.address().port}/api/import/youtube`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/x' }) });
  assert.equal(bad.status, 400);
});
