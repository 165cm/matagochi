import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { createTicketBook } from '../src/tickets.js';
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
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store);
  await tickets.get('h1');
  const catalog = createRecipeCatalog(store, async (u, o) => { calls++; seen.push(!!o.forceVideo); return { ...sample(), analyzedFrom: o.forceVideo ? 'video' : 'description' }; }, { tickets });
  assert.equal((await catalog.import(url)).analyzedFrom, 'description');
  const again = await catalog.import(url, { forceVideo: true, household: 'h1' });
  assert.equal(again.analyzedFrom, 'video'); assert.equal(again.cacheHit, false); assert.equal(again.ticketUsed, true);
  const cached = await catalog.import(url, { forceVideo: true, household: 'h1' });
  assert.equal(cached.cacheHit, true, 'no second paid video read'); assert.equal(cached.ticketUsed, undefined);
  assert.equal(calls, 2); assert.deepEqual(seen, [false, true]);
  assert.equal((await tickets.get('h1')).balance, 24, 'one ticket for one new video read');
});

test('importing keeps a result without steps (the video is read on request); a video read costs a ticket, refunded when it fails', async () => {
  const store = createMemorySyncStore();
  const tickets = createTicketBook(store, { startTickets: 1 });
  await tickets.get('h1');
  let fail = false;
  const catalog = createRecipeCatalog(store, async (u, o) => {
    if (o.forceVideo && fail) throw Object.assign(new Error('boom'), { code: 'ai_failed' });
    return o.forceVideo ? { ...sample(), analyzedFrom: 'video' } : { ...sample(), steps: [], videoSkipped: true };
  }, { tickets });
  const urls = ['aaaaaaaaaaa', 'bbbbbbbbbbb'].map((id) => `https://youtu.be/${id}`);
  for (const u of urls) { const r = await catalog.import(u); assert.deepEqual(r.steps, []); assert.equal(r.videoSkipped, true); }
  fail = true;
  await assert.rejects(catalog.import(urls[0], { forceVideo: true, household: 'h1' }), { code: 'ai_failed' });
  assert.equal((await tickets.get('h1')).balance, 1, 'a failed read gives the ticket back');
  fail = false;
  assert.equal((await catalog.import(urls[0], { forceVideo: true, household: 'h1' })).analyzedFrom, 'video');
  await assert.rejects(catalog.import(urls[1], { forceVideo: true, household: 'h1' }), { code: 'no_tickets' });
  assert.deepEqual((await catalog.import(urls[1])).steps, [], 'the saved result survives a refused read');
  assert.equal((await catalog.import(urls[1], { forceVideo: true, household: 'h1', unlimited: true })).analyzedFrom, 'video', 'the developer code needs no ticket');
  assert.equal((await tickets.get('h1')).balance, 0);
  await tickets.get('h2');
  await catalog.import(urls[0], { forceVideo: true, household: 'h2' });
  assert.equal((await tickets.get('h2')).balance, 1, 'videos someone already read are free');
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
