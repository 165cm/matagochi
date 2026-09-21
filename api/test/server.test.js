import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

async function fixture(t, env = {}) {
  let calls = 0;
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'test-only-admin', ...env }, {
    recipeStore: createMemorySyncStore(), syncStore: null,
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
