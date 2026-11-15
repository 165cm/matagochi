import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { trialEndOf, tokyoDate } from '../src/plusTrial.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// リピごちプラスの無料お試し（APP_MAP §75）：本人ごとに1回・サーバーで管理・延長は1回だけ最大2週間。
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const googleToken = (email, ms = Date.now()) => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-1', exp: Math.floor(ms / 1000) + 600, email, email_verified: true })).toString('base64url');
  return `${h}.${p}.${rsaSign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
};
const DAY = 86_400_000;
async function server(t) {
  const clock = { ms: Date.parse('2026-11-18T03:00:00Z') }; // 日本の 11/18（水）12時
  const fetchStub = async (url, init) => url.includes('googleapis.com/oauth2/v3/certs') ? { ok: true, json: async () => ({ keys: [jwk] }) } : globalThis.fetch(url, init);
  const app = createApp({ GOOGLE_CLIENT_ID: 'client-1' }, { recipeStore: createMemorySyncStore(), syncStore: null, fetch: fetchStub, now: () => clock.ms });
  const s = app.listen(0, '127.0.0.1'); await once(s, 'listening'); t.after(() => new Promise((r) => s.close(r)));
  const base = `http://127.0.0.1:${s.address().port}/api`;
  const call = (path, body, token, method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  const signIn = async (email) => (await call('/auth/google', { credential: googleToken(email, clock.ms) })).token;
  return { call, signIn, clock };
}

test('trial length: the odd days until Monday, then two weeks; dates are counted in Japan', () => {
  assert.equal(trialEndOf('2026-11-18'), '2026-12-06', 'Wed → Mon 11/23 + 13 days');
  assert.equal(trialEndOf('2026-11-23'), '2026-12-06', 'a Monday start is just two weeks');
  assert.equal(tokyoDate(Date.parse('2026-11-17T16:00:00Z')), '2026-11-18', 'after 9pm UTC is the next day in Japan');
});

test('the trial needs sign-in, starts once per person, and keeps the start an earlier device used (30 days at most)', async (t) => {
  const { call, signIn } = await server(t);
  assert.equal((await call('/plus/status')).status, 401);
  assert.equal((await call('/plus/trial/start', {})).status, 401);
  const a = await signIn('hana@example.com');
  const none = await call('/plus/status', undefined, a);
  assert.equal(none.trial, null);
  const started = await call('/plus/trial/start', { from: '2026-11-16' }, a);
  assert.deepEqual(started.trial, { start: '2026-11-16', end: '2026-11-29', extended: false }, 'the start on the device carries over');
  assert.equal(started.active, true);
  const again = await call('/plus/trial/start', { from: '2026-11-18' }, a);
  assert.deepEqual(again.trial, started.trial, 'starting again changes nothing');
  // 別の端末（同じメール）でも同じお試し
  const a2 = await signIn('hana@example.com');
  assert.deepEqual((await call('/plus/status', undefined, a2)).trial, started.trial);
  // 古すぎる日・未来の日は使わない
  const b = await signIn('taro@example.com');
  assert.equal((await call('/plus/trial/start', { from: '2026-09-01' }, b)).trial.start, '2026-11-18');
  const c = await signIn('jiro@example.com');
  assert.equal((await call('/plus/trial/start', { from: '2026-12-01' }, c)).trial.start, '2026-11-18');
});

test('one extension of up to two weeks, from 3 days before the end until 30 days after', async (t) => {
  const { call, signIn, clock } = await server(t);
  const a = await signIn('hana@example.com');
  assert.equal((await call('/plus/trial/extend', {}, a)).status, 404, 'not started');
  const s = await call('/plus/trial/start', {}, a);
  assert.equal(s.trial.end, '2026-12-06');
  assert.equal(s.canExtend, false);
  assert.equal((await call('/plus/trial/extend', {}, a)).status, 409, 'too early');
  clock.ms = Date.parse('2026-12-04T03:00:00Z'); // 終わる2日前
  assert.equal((await call('/plus/status', undefined, a)).canExtend, true);
  const e = await call('/plus/trial/extend', {}, a);
  assert.deepEqual(e.trial, { start: '2026-11-18', end: '2026-12-20', extended: true }, 'two more weeks from the end');
  assert.equal((await call('/plus/trial/extend', {}, a)).status, 409, 'only once');
  // 終わったあとに頼んだ人は、今日から2週間
  const b = await signIn('taro@example.com');
  clock.ms = Date.parse('2026-11-18T03:00:00Z');
  await call('/plus/trial/start', {}, b);
  clock.ms = Date.parse('2026-12-16T03:00:00Z'); // 終わって10日
  const st = await call('/plus/status', undefined, b);
  assert.equal(st.active, false);
  assert.equal(st.canExtend, true);
  assert.equal((await call('/plus/trial/extend', {}, b)).trial.end, '2026-12-29');
  // 終わって30日を過ぎたら頼めない
  const c = await signIn('jiro@example.com');
  clock.ms = Date.parse('2026-11-18T03:00:00Z');
  await call('/plus/trial/start', {}, c);
  clock.ms = Date.parse('2026-12-06T03:00:00Z') + 31 * DAY;
  assert.equal((await call('/plus/trial/extend', {}, c)).status, 409);
});
