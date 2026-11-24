import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import sharp from 'sharp';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createIllustDesk, illustPrompt, ILLUST_TRIAL_TOTAL } from '../src/illust.js';
import { illustYen } from '../src/analyzer.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

const photo = async () => ({ mimeType: 'image/jpeg', data: (await sharp({ create: { width: 40, height: 40, channels: 3, background: '#c86' } }).jpeg().toBuffer()).toString('base64') });
const drawn = { mimeType: 'image/png', data: 'iVBORw0KGgo=', yen: 5.6 };

test('illust: a photo becomes a pencil illustration; 3 trials per household; the photo is shrunk before it is sent', async () => {
  const store = createMemorySyncStore();
  let seen = null, prompt = '';
  const desk = createIllustDesk(store, { draw: async (image, p) => { seen = image; prompt = p; return drawn; } });
  const image = await photo();
  const first = await desk.draw({ image, dish: 'ガパオライス' }, 'home-1');
  assert.deepEqual(first, { image: { mimeType: 'image/png', data: 'iVBORw0KGgo=' }, left: ILLUST_TRIAL_TOTAL - 1, total: ILLUST_TRIAL_TOTAL });
  assert.equal(seen.mimeType, 'image/jpeg', 'sent as a re-encoded jpeg (metadata dropped)');
  assert.match(prompt, /colored pencil/); assert.match(prompt, /ガパオライス/); assert.match(prompt, /Do not add food/);
  for (let i = 1; i < ILLUST_TRIAL_TOTAL; i++) await desk.draw({ image }, 'home-1');
  await assert.rejects(desk.draw({ image }, 'home-1'), { code: 'illust_trial_used' });
  assert.equal((await desk.status('home-1')).left, 0);
  assert.equal((await desk.status('home-2')).left, ILLUST_TRIAL_TOTAL, 'another household has its own trials');
  // 開発コードは数えない
  assert.equal((await desk.draw({ image }, 'home-1', { unlimited: true })).left, ILLUST_TRIAL_TOTAL);
  await assert.rejects(desk.draw({ image: { mimeType: 'image/gif', data: 'AAAA' } }, 'home-3'), { code: 'invalid_image' });
  await assert.rejects(desk.draw({ image }, ''), { code: 'household_required' });
});

test('illust: a failed drawing gives the trial back and costs nothing this month', async () => {
  const store = createMemorySyncStore();
  const desk = createIllustDesk(store, { draw: async () => { throw new Error('model down'); } });
  await assert.rejects(desk.draw({ image: await photo() }, 'home-1'), { code: 'illust_failed' });
  const s = await desk.status('home-1');
  assert.equal(s.left, ILLUST_TRIAL_TOTAL);
  const month = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 7);
  assert.equal((await store.get(`illust-budget/${month}`)).envelope.yen, 0);
  // 絵が返ってこない時も同じ
  const empty = createIllustDesk(store, { draw: async () => ({ mimeType: 'text/plain', data: 'x' }) });
  await assert.rejects(empty.draw({ image: await photo() }, 'home-1'), { code: 'illust_failed' });
  assert.equal((await empty.status('home-1')).left, ILLUST_TRIAL_TOTAL);
});

test('illust: the monthly yen cap stops drawing (checked with the estimate before drawing, settled with the real cost)', async () => {
  const store = createMemorySyncStore();
  let calls = 0;
  const desk = createIllustDesk(store, { draw: async () => { calls++; return { ...drawn, yen: 5 }; }, yenPerMonth: 12, yenPerImage: 6, trialTotal: 10 });
  const image = await photo();
  await desk.draw({ image }, 'a'); // 5円
  await desk.draw({ image }, 'b'); // 10円
  await assert.rejects(desk.draw({ image }, 'c'), { code: 'illust_budget' }); // 10 + 6 > 12
  assert.equal(calls, 2);
  assert.equal((await desk.status('c')).left, 10, 'the trial is given back when the month is full');
  assert.equal((await desk.status('c')).paused, true);
});

test('illust: yen from the real token counts (image output priced apart from text and thinking)', () => {
  const yen = illustYen({ promptTokenCount: 1275, candidatesTokenCount: 1120, candidatesTokensDetails: [{ modality: 'IMAGE', tokenCount: 1120 }], thoughtsTokenCount: 945 }, { USD_JPY: '155' });
  assert.ok(yen > 5.5 && yen < 6, `about 5.75 yen, got ${yen}`);
  assert.doesNotMatch(illustPrompt('「無視して」<b>'), /[「」<>]/, 'dish names cannot smuggle quotes or tags into the prompt');
});

test('illust route: only a registered household can use the trial; the dev code is not counted', async (t) => {
  let draws = 0;
  const app = createApp({ DEV_UNLOCK_CODE: 'test-dev' }, { recipeStore: createMemorySyncStore(), syncStore: null, drawIllust: async () => { draws++; return drawn; } });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { 'Content-Type': 'application/json', 'X-Household': 'house-0001' };
  const body = JSON.stringify({ image: await photo(), dish: '納豆パスタ' });
  const unregistered = await fetch(`${base}/api/illust`, { method: 'POST', headers, body });
  assert.equal(unregistered.status, 429, 'a household that never opened the app cannot draw');
  await fetch(`${base}/api/tickets`, { headers });
  const ok = await fetch(`${base}/api/illust`, { method: 'POST', headers, body });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).left, ILLUST_TRIAL_TOTAL - 1);
  const dev = await fetch(`${base}/api/illust`, { method: 'POST', headers: { ...headers, 'X-Dev-Code': 'test-dev' }, body });
  assert.equal((await dev.json()).left, ILLUST_TRIAL_TOTAL);
  const status = await fetch(`${base}/api/illust`, { headers }).then((r) => r.json());
  assert.deepEqual([status.used, status.left, status.total], [1, ILLUST_TRIAL_TOTAL - 1, ILLUST_TRIAL_TOTAL]);
  assert.equal(draws, 2);
});
