import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { createMemorySyncStore } from '../src/syncStore.js';
const url = 'https://youtu.be/abcdefghijk?si=tracking';
const sample = () => ({ title: '丼', ingredients: [{ name: '米', amount: '2合' }], steps: ['炊く'], sourceServings: 2 });

test('URL variants and concurrent requests call AI only once; returned copies are isolated', async () => {
  let calls = 0;
  const catalog = createRecipeCatalog(createMemorySyncStore(), async () => { calls++; return sample(); });
  const [a, b] = await Promise.all([catalog.import(url), catalog.import('https://www.youtube.com/shorts/abcdefghijk')]);
  a.ingredients[0].name = 'personal edit';
  assert.equal(b.ingredients[0].name, '米');
  const cached = await catalog.import('https://m.youtube.com/watch?v=abcdefghijk&t=30');
  assert.equal(calls, 1);
  assert.equal(cached.cacheHit, true);
  assert.equal(cached.ingredients[0].name, '米');
});

test('independent instances share durable claim and completed results', async () => {
  const store = createMemorySyncStore();
  let finish, started;
  const ready = new Promise(resolve => { started = resolve; });
  const analyze = async () => { started(); return new Promise(resolve => { finish = () => resolve(sample()); }); };
  const a = createRecipeCatalog(store, analyze);
  const b = createRecipeCatalog(store, () => { throw new Error('must not run'); });
  const pending = a.import(url);
  await ready;
  await assert.rejects(b.import(url), { code: 'analysis_pending' });
  finish(); await pending;
  assert.equal((await b.import(url)).cacheHit, true);
});

test('invalid URL, unconfigured store, failure cooldown and incomplete result never become cache hits', async () => {
  let calls = 0, now = 0;
  const catalog = createRecipeCatalog(createMemorySyncStore(), async () => { calls++; return {}; }, { now: () => now });
  await assert.rejects(catalog.import('https://evil.test/watch?v=abcdefghijk'));
  await assert.rejects(catalog.import(url), { code: 'incomplete_recipe' });
  await assert.rejects(catalog.import(url), { code: 'analysis_cooldown' });
  now = 61_000;
  await assert.rejects(catalog.import(url), { code: 'incomplete_recipe' });
  assert.equal(calls, 2);
  await assert.rejects(createRecipeCatalog(null, sample).import(url), { code: 'catalog_not_configured' });
});

test('proposals do not change catalog; approval versions the shared copy and excludes private fields', async () => {
  const store = createMemorySyncStore();
  const catalog = createRecipeCatalog(store, sample);
  const original = await catalog.import(url);
  const { proposalId } = await catalog.propose({ catalogId: original.catalog.id, baseRevision: original.catalog.revision,
    reason: '原文は1合', recipe: { ...sample(), ingredients: [{ name: '米', amount: '1合' }], note: 'private', caption: 'private' } });
  assert.equal((await catalog.import(url)).ingredients[0].amount, '2合');
  assert.equal(await store.get(`proposals/${proposalId}`).then(e => e.envelope.changes.note), undefined);
  assert.equal((await catalog.review(proposalId, 'approve')).status, 'approved');
  const updated = await catalog.import(url);
  assert.equal(updated.ingredients[0].amount, '1合');
  assert.notEqual(updated.catalog.revision, original.catalog.revision);
  assert.equal(original.ingredients[0].amount, '2合');
  assert.equal((await store.get(`versions/${original.catalog.revision}`)).envelope.ingredients[0].amount, '2合');
  await assert.rejects(catalog.propose({ catalogId: original.catalog.id, baseRevision: original.catalog.revision }), { code: 'stale_revision' });
});

test('rejection leaves common recipe unchanged; review races cannot approve and reject together', async () => {
  const catalog = createRecipeCatalog(createMemorySyncStore(), sample);
  const original = await catalog.import(url);
  const proposal = await catalog.propose({ catalogId: original.catalog.id, baseRevision: original.catalog.revision, reason: 'check', recipe: sample() });
  await catalog.review(proposal.proposalId, 'reject');
  assert.equal((await catalog.import(url)).catalog.revision, original.catalog.revision);
  const p2 = await catalog.propose({ catalogId: original.catalog.id, baseRevision: original.catalog.revision, reason: 'check', recipe: sample() });
  const results = await Promise.allSettled([catalog.review(p2.proposalId, 'approve'), catalog.review(p2.proposalId, 'reject')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
});

test('shared budget prevents paid calls but keeps cached recipes usable; kill switch is fail closed', async () => {
  const store = createMemorySyncStore();
  let calls = 0;
  const catalog = createRecipeCatalog(store, async () => { calls++; return sample(); }, { dailyLimit: 1 });
  await catalog.import(url);
  await assert.rejects(catalog.import('https://youtu.be/12345678901'), { code: 'analysis_budget_exceeded' });
  assert.equal(calls, 1);
  const disabled = createRecipeCatalog(store, sample, { enabled: false });
  assert.equal((await disabled.import(url)).cacheHit, true);
  await assert.rejects(disabled.import('https://youtu.be/12345678902'), { code: 'analysis_disabled' });
});

test('ambiguous upstream completion keeps its claim to prevent duplicate paid calls', async () => {
  let calls=0;
  const store=createMemorySyncStore();
  const catalog=createRecipeCatalog(store, async()=>{calls++;throw Object.assign(new Error('unknown'),{code:'analysis_uncertain'});});
  await assert.rejects(catalog.import(url),{code:'analysis_uncertain'});
  await assert.rejects(catalog.import(url),{code:'analysis_pending'});
  assert.equal(calls,1);
});

test('stale approval can still be rejected without manual repair', async () => {
  const catalog=createRecipeCatalog(createMemorySyncStore(),sample);
  const original=await catalog.import(url);
  const body={catalogId:original.catalog.id,baseRevision:original.catalog.revision,reason:'fix',recipe:sample()};
  const a=await catalog.propose(body),b=await catalog.propose(body);
  await catalog.review(a.proposalId,'approve');
  await assert.rejects(catalog.review(b.proposalId,'approve'),{code:'stale_revision'});
  assert.equal((await catalog.review(b.proposalId,'reject')).status,'rejected');
});

test('a pending claim left by a lost AI response can be retried after 10 minutes', async () => {
  let now = Date.parse('2026-09-26T00:00:00Z');
  const store = createMemorySyncStore();
  const lost = createRecipeCatalog(store, async () => { const e = new Error('lost'); e.code = 'analysis_uncertain'; throw e; }, { now: () => now });
  await assert.rejects(lost.import(url), { code: 'analysis_uncertain' });
  const retry = createRecipeCatalog(store, async () => sample(), { now: () => now });
  await assert.rejects(retry.import(url), { code: 'analysis_pending' });
  now += 11 * 60_000;
  assert.equal((await retry.import(url)).title, sample().title);
});

test('results from the old extractor are analysed once more; new ones come from cache', async () => {
  let calls = 0;
  const store = createMemorySyncStore();
  await store.put('youtube-abcdefghijk', { status: 'ready', result: { ...sample(), catalog: { id: 'youtube-abcdefghijk', revision: 'r1', extractorVersion: 1 } } }, { ifGeneration: 0 });
  const catalog = createRecipeCatalog(store, async () => { calls++; return { ...sample(), analyzedFrom: 'video' }; });
  const first = await catalog.import(url);
  assert.equal(calls, 1); assert.equal(first.cacheHit, false); assert.equal(first.analyzedFrom, 'video');
  assert.equal((await catalog.import(url)).cacheHit, true); assert.equal(calls, 1);
});

test('re-reading from the video re-runs a description result once, then serves the video result from cache', async () => {
  let calls = 0; const seen = [];
  const catalog = createRecipeCatalog(createMemorySyncStore(), async (u, o) => { calls++; seen.push(!!o.forceVideo); return { ...sample(), analyzedFrom: o.forceVideo ? 'video' : 'description' }; });
  assert.equal((await catalog.import(url)).analyzedFrom, 'description');
  const again = await catalog.import(url, { forceVideo: true, household: 'h1' });
  assert.equal(again.analyzedFrom, 'video'); assert.equal(again.cacheHit, false);
  assert.equal((await catalog.import(url, { forceVideo: true, household: 'h1' })).cacheHit, true, 'no second paid video read');
  assert.equal(calls, 2); assert.deepEqual(seen, [false, true]);
});

test('video reads are limited per household per day; the developer code lifts the limit; a refused re-read keeps the saved result', async () => {
  const store = createMemorySyncStore();
  const urls = ['aaaaaaaaaaa', 'bbbbbbbbbbb', 'ccccccccccc', 'ddddddddddd'].map((id) => `https://youtu.be/${id}`);
  const catalog = createRecipeCatalog(store, async (u, o) => ({ ...sample(), analyzedFrom: o.forceVideo ? 'video' : 'description' }), { videoDailyLimit: 3 });
  for (const u of urls) await catalog.import(u);
  for (const u of urls.slice(0, 3)) await catalog.import(u, { forceVideo: true, household: 'h1' });
  await assert.rejects(catalog.import(urls[3], { forceVideo: true, household: 'h1' }), { code: 'video_quota' });
  assert.equal((await catalog.import(urls[3])).analyzedFrom, 'description', 'the saved result survives a refused re-read');
  assert.equal((await catalog.import(urls[3], { forceVideo: true, household: 'h1', unlimited: true })).analyzedFrom, 'video');
  assert.deepEqual(await catalog.videoQuota('h1', false), { used: 3, limit: 3, unlimited: false });
  await catalog.import(urls[0], { forceVideo: true, household: 'h2' });
  assert.equal((await catalog.videoQuota('h2', false)).used, 0, 'cached video results cost no quota');
});

test('description and channel older than 30 days are fetched again, or dropped', async () => {
  let now = Date.parse('2026-09-01T00:00:00Z');
  const store = createMemorySyncStore();
  let refreshes = 0;
  const catalog = createRecipeCatalog(store, async () => ({ ...sample(), caption: '説明文', channelTitle: 'ch' }), { now: () => now, refreshSnippet: async () => { refreshes++; return { caption: '新しい説明文', channelTitle: 'ch2' }; } });
  assert.equal((await catalog.import(url)).caption, '説明文');
  now += 31 * 86_400_000;
  const again = await catalog.import(url);
  assert.equal(again.caption, '新しい説明文'); assert.equal(refreshes, 1);
  const failing = createRecipeCatalog(store, async () => sample(), { now: () => now + 31 * 86_400_000, refreshSnippet: async () => { throw new Error('gone'); } });
  assert.equal((await failing.import(url)).caption, '');
});
