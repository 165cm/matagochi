import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as rsaSign } from 'node:crypto';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const googleToken = (claims) => {
  const h = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'k1' })).toString('base64url');
  const p = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-1', exp: Math.floor(Date.now() / 1000) + 600, email: 'Hana@Example.com', email_verified: true, ...claims })).toString('base64url');
  return `${h}.${p}.${rsaSign('RSA-SHA256', Buffer.from(`${h}.${p}`), privateKey).toString('base64url')}`;
};
async function server(t) {
  const mails = [];
  const fetchStub = async (url, init) => url.includes('googleapis.com/oauth2/v3/certs') ? { ok: true, json: async () => ({ keys: [jwk] }) } : globalThis.fetch(url, init);
  const app = createApp({ GOOGLE_CLIENT_ID: 'client-1' }, { recipeStore: createMemorySyncStore(), syncStore: null, fetch: fetchStub, sendMail: async (to, code) => mails.push({ to, code }) });
  const s = app.listen(0, '127.0.0.1'); await once(s, 'listening'); t.after(() => new Promise((r) => s.close(r)));
  const base = `http://127.0.0.1:${s.address().port}/api/auth`;
  const call = (path, body, token, method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
  return { call, mails };
}

test('Google and e-mail code sign in to the same account, which remembers the device and the family code', async (t) => {
  const { call, mails } = await server(t);
  assert.deepEqual(await call('/config').then(({ status, ...c }) => c), { google: 'client-1', email: true });
  const g = await call('/google', { credential: googleToken({}) });
  assert.equal(g.status, 200); assert.equal(g.account.email, 'hana@example.com');
  assert.equal((await call('/google', { credential: googleToken({ aud: 'someone-else' }) })).status, 401);
  assert.equal((await call('/google', { credential: googleToken({}).slice(0, -4) + 'AAAA' })).status, 401);
  const linked = await call('/me', { deviceId: 'dev-abc12345', syncCode: 'たなかけ・ごはん', me: 'はな' }, g.token, 'PUT');
  assert.equal(linked.deviceId, 'dev-abc12345');
  assert.equal((await call('/email/start', { email: 'hana@example.com' })).sent, true);
  assert.equal((await call('/email/start', { email: 'hana@example.com' })).status, 429, 'one code a minute');
  assert.equal((await call('/email/verify', { email: 'hana@example.com', code: '000000' === mails[0].code ? '111111' : '000000' })).status, 401);
  const e = await call('/email/verify', { email: 'HANA@example.com', code: mails[0].code });
  assert.equal(e.status, 200); assert.equal(e.account.syncCode, 'たなかけ・ごはん', 'same account as the Google sign-in');
  assert.equal((await call('/email/verify', { email: 'hana@example.com', code: mails[0].code })).status, 401, 'a code works once');
  assert.equal((await call('/me', undefined, e.token)).me, 'はな');
  assert.equal((await call('/me', undefined, 'bogus.token')).status, 401);
});
