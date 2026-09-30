import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createCreatorAuth, YOUTUBE_READONLY } from '../src/creatorAuth.js';
import { createCreatorDesk } from '../src/creators.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

const CLIENT = 'ripigochi-client.apps.googleusercontent.com';
const mineCh = 'UC' + 'm'.repeat(22), otherCh = 'UC' + 'o'.repeat(22);
const TOKEN = 'ya29.' + 'a'.repeat(40), OTHER_APP = 'ya29.' + 'b'.repeat(40), NO_SCOPE = 'ya29.' + 'c'.repeat(40), NO_CHANNEL = 'ya29.' + 'd'.repeat(40);
// Google と YouTube の代わり（本物には通信しない）。
function fakeGoogle() {
  const calls = [];
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const fetch = async (url, init = {}) => {
    calls.push(String(url));
    const u = new URL(url);
    if (u.pathname === '/tokeninfo') {
      const t = u.searchParams.get('access_token');
      if (t === TOKEN || t === NO_CHANNEL) return json(200, { aud: CLIENT, azp: CLIENT, scope: `openid ${YOUTUBE_READONLY}`, expires_in: '3500' });
      if (t === OTHER_APP) return json(200, { aud: 'someone-else', azp: 'someone-else', scope: YOUTUBE_READONLY, expires_in: '3500' });
      if (t === NO_SCOPE) return json(200, { aud: CLIENT, scope: 'openid email', expires_in: '3500' });
      return json(400, { error: 'invalid_token' });
    }
    if (u.pathname === '/youtube/v3/channels') {
      assert.equal(u.searchParams.get('mine'), 'true');
      const auth = init.headers?.Authorization;
      if (auth === `Bearer ${TOKEN}`) return json(200, { items: [{ id: mineCh, snippet: { title: 'わたしの台所' } }] });
      if (auth === `Bearer ${NO_CHANNEL}`) return json(200, { items: [] });
      return json(401, {});
    }
    return json(404, {});
  };
  return { fetch, calls };
}

test('creator verification: only a token issued to this app, with the YouTube scope, for a real channel; the Google token is not stored', async () => {
  const store = createMemorySyncStore();
  let now = Date.parse('2026-09-30T00:00:00Z');
  const g = fakeGoogle();
  const auth = createCreatorAuth(store, { clientId: CLIENT, fetch: g.fetch, now: () => now });
  const ok = await auth.verify(TOKEN);
  assert.deepEqual(ok.channels, [{ channelId: mineCh, title: 'わたしの台所' }]);
  assert.deepEqual(await auth.channelsOf(`Bearer ${ok.token}`), [mineCh]);
  await assert.rejects(auth.verify(OTHER_APP), { code: 'wrong_audience' });
  await assert.rejects(auth.verify(NO_SCOPE), { code: 'missing_scope' });
  await assert.rejects(auth.verify(NO_CHANNEL), { code: 'no_channel' });
  await assert.rejects(auth.verify('ya29.' + 'z'.repeat(40)), { code: 'invalid_token' });
  await assert.rejects(auth.verify('bad token'), { code: 'invalid_token' });
  await assert.rejects(createCreatorAuth(store, { clientId: '' }).verify(TOKEN), { code: 'google_not_configured' });
  // 合い鍵の改ざん・期限切れは通さない。
  const [body, mac] = ok.token.split('.');
  const forged = Buffer.from(JSON.stringify({ ch: [otherCh], exp: now + 1e9 })).toString('base64url');
  await assert.rejects(auth.channelsOf(`${forged}.${mac}`), { code: 'creator_signed_out' });
  await assert.rejects(auth.channelsOf(`${body}.x${mac}`), { code: 'creator_signed_out' });
  now += 3 * 3_600_000;
  await assert.rejects(auth.channelsOf(ok.token), { code: 'creator_signed_out' });
  assert.ok(!JSON.stringify(await store.get('creators/secret')).includes('ya29'), 'the Google token is never saved');
});

test('owners stop and resume only their own channel; applications wait for the admin; consents are separate and withdrawals apply at once', async () => {
  const store = createMemorySyncStore();
  const desk = createCreatorDesk(store, { resolveChannel: async () => ({ channelId: mineCh, title: 'わたしの台所' }) });
  const owned = [mineCh];
  // 第三者の申し込みで一時的に外れていても、持ち主は戻せる。
  await desk.request({ channel: '@x' });
  assert.equal((await desk.mine(owned)).channels[0].listing, 'pending');
  await desk.ownerResume(mineCh, owned);
  assert.equal((await desk.optedOut()).has(mineCh), false);
  assert.equal((await desk.request({ channel: '@x' })).status, 'review', 'a later third-party request does not hide it again');
  await desk.ownerStop(mineCh, owned);
  assert.equal((await desk.mine(owned)).channels[0].listing, 'stopped');
  assert.equal((await desk.list()).confirmed[0].by, 'owner');
  for (const act of [() => desk.ownerStop(otherCh, owned), () => desk.ownerResume(otherCh, owned), () => desk.apply(otherCh, owned, { consents: { store: true } }), () => desk.withdraw(otherCh, owned)])
    await assert.rejects(act(), { code: 'not_your_channel' });
  // 参加申請
  await assert.rejects(desk.apply(mineCh, owned, { consents: {} }), { code: 'no_consent' });
  const sent = await desk.apply(mineCh, owned, { consents: { aiExtract: true, store: true, publicCatalog: true, hack: true }, message: 'よろしくお願いします', contact: 'me@example.com' });
  assert.equal(sent.status, 'pending');
  assert.equal(Object.values(await desk.consentsFor(mineCh)).some(Boolean), false, 'nothing is usable before approval');
  const app0 = (await desk.applications()).items[0];
  assert.deepEqual(Object.keys(app0.consents).sort(), ['aiExtract', 'publicCatalog', 'scale', 'store', 'summary'], 'unknown consent keys are dropped');
  await desk.decideApplication(mineCh, { decision: 'approve' });
  assert.deepEqual(await desk.consentsFor(mineCh), { aiExtract: true, store: true, summary: false, scale: false, publicCatalog: true });
  // 同意を減らす申請：承認を待たずに、減らした分はすぐ使えなくなる。増やした分は承認まで使えない。
  await desk.apply(mineCh, owned, { consents: { aiExtract: true, summary: true } });
  assert.deepEqual(await desk.consentsFor(mineCh), { aiExtract: true, store: false, summary: false, scale: false, publicCatalog: false });
  // 却下しても、前に承認した同意（のうち、いまも同意しているもの）はそのまま。
  await desk.decideApplication(mineCh, { decision: 'reject', note: '要約は準備中' });
  assert.equal((await desk.applications()).items[0].status, 'approved');
  await assert.rejects(desk.decideApplication(mineCh, { decision: 'approve' }), { code: 'not_pending' });
  await desk.withdraw(mineCh, owned);
  assert.equal(Object.values(await desk.consentsFor(mineCh)).some(Boolean), false, 'withdrawing removes every consent at once');
  await assert.rejects(desk.decideApplication('bad', { decision: 'approve' }), { code: 'invalid_decision' });
});

test('HTTP: verify → my channels → apply; another channel is refused; admin screens need the token', async (t) => {
  const g = fakeGoogle();
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', GOOGLE_CLIENT_ID: CLIENT }, { recipeStore: createMemorySyncStore(), syncStore: null, photoStore: null, fetch: g.fetch, resolveChannel: async () => null });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const v = await (await post('/api/creators/verify', { accessToken: TOKEN })).json();
  const me = { Authorization: `Bearer ${v.token}` };
  assert.equal((await (await fetch(base + '/api/creators/me', { headers: me })).json()).channels[0].listing, 'listed');
  assert.equal((await fetch(base + '/api/creators/me')).status, 401);
  assert.equal((await post(`/api/creators/me/${otherCh}/stop`, {}, me)).status, 403);
  assert.equal((await post(`/api/creators/me/${mineCh}/constructor`, {}, me)).status, 404);
  assert.equal((await (await post(`/api/creators/me/${mineCh}/apply`, { consents: { store: true } }, me)).json()).status, 'pending');
  assert.equal((await fetch(base + '/api/admin/creators/applications')).status, 403);
  const admin = { Authorization: 'Bearer admin-test-token' };
  assert.equal((await (await fetch(base + '/api/admin/creators/applications', { headers: admin })).json()).items[0].channelId, mineCh);
  assert.equal((await (await post(`/api/admin/creators/applications/${mineCh}/decide`, { decision: 'approve' }, admin)).json()).status, 'approved');
  assert.ok(g.calls.every((u) => /oauth2\.googleapis\.com\/tokeninfo|googleapis\.com\/youtube\/v3\/channels/.test(u)), 'only the two Google endpoints are called');
});

test('review fix: rejecting a changed application never brings back a consent the creator removed', async () => {
  const desk = createCreatorDesk(createMemorySyncStore(), { resolveChannel: async () => null });
  const owned = [mineCh];
  const usable = async () => Object.entries(await desk.consentsFor(mineCh)).filter(([, v]) => v).map(([k]) => k).sort();
  const current = async () => (await desk.applications()).items[0];
  // 1. 「保存」「一般公開」に同意 → 承認
  await desk.apply(mineCh, owned, { consents: { store: true, publicCatalog: true } });
  await desk.decideApplication(mineCh, { decision: 'approve' });
  assert.deepEqual(await usable(), ['publicCatalog', 'store']);
  // 2. 「一般公開」を外して再申請 → すぐに使えなくなる
  await desk.apply(mineCh, owned, { consents: { store: true } });
  assert.deepEqual(await usable(), ['store']);
  // 3. 運営が見送る → 一般公開は戻らない
  await desk.decideApplication(mineCh, { decision: 'reject' });
  assert.deepEqual(await usable(), ['store'], 'the removed consent stays removed');
  assert.equal((await current()).consents.publicCatalog, false);
  assert.equal((await current()).status, 'approved');
  // 外して足した申請（一般公開を外し、要約を足す）を見送った時も、要約は足されず、一般公開も戻らない。
  await desk.apply(mineCh, owned, { consents: { store: true, summary: true } });
  await desk.decideApplication(mineCh, { decision: 'reject' });
  assert.deepEqual(await usable(), ['store']);
  // 前に承認した項目をすべて外した申請を見送ったら、使える同意はなくなる。
  await desk.apply(mineCh, owned, { consents: { summary: true } });
  await desk.decideApplication(mineCh, { decision: 'reject' });
  assert.deepEqual(await usable(), []);
  assert.equal((await current()).status, 'rejected');
  // どの順番で申請・承認・見送り・取り消しをしても、使える同意は「いま同意している項目」を超えない。
  const steps = [['apply', { store: true, publicCatalog: true, scale: true }], ['approve'], ['apply', { store: true }], ['reject'], ['apply', { store: true, publicCatalog: true }], ['approve'], ['apply', { scale: true }], ['reject'], ['withdraw'], ['apply', { aiExtract: true }], ['approve']];
  for (const [step, consents] of steps) {
    if (step === 'apply') await desk.apply(mineCh, owned, { consents });
    else if (step === 'withdraw') await desk.withdraw(mineCh, owned);
    else await desk.decideApplication(mineCh, { decision: step });
    const now = await current();
    for (const [k, v] of Object.entries(await desk.consentsFor(mineCh))) if (v) assert.equal(now.consents[k], true, `${step}: ${k} is usable but not consented`);
  }
});

test('corrections: anyone can send one; the owner gets the verified mark and can hide (and show) their own video at once; others cannot', async () => {
  let now = Date.parse('2026-10-01T00:00:00Z');
  const store = createMemorySyncStore();
  const byVideo = { mmmmmmmmmm1: { channelId: mineCh, title: 'わたしの台所' }, ooooooooooo: { channelId: otherCh, title: 'よその台所' } };
  const desk = createCreatorDesk(store, { resolveChannel: async (x) => byVideo[new URL(x).searchParams.get('v')] || null, now: () => now });
  await assert.rejects(desk.correction({ video: 'not a url', kind: 'amount', message: 'x' }), { code: 'video_required' });
  await assert.rejects(desk.correction({ video: 'https://youtu.be/mmmmmmmmmm1', kind: 'constructor', message: 'x' }), { code: 'kind_required' });
  await assert.rejects(desk.correction({ video: 'https://youtu.be/mmmmmmmmmm1', kind: 'amount', message: '   ' }), { code: 'message_required' });
  // ログインしていない人：受け付けるだけ（hide は無視）
  const anon = await desk.correction({ video: 'https://youtu.be/mmmmmmmmmm1', kind: 'amount', message: '醤油は大さじ1です', contact: 'a@example.com', hide: true });
  assert.deepEqual([anon.verified, anon.hidden, anon.channelId], [false, false, mineCh]);
  assert.equal((await desk.optedOut()).has('mmmmmmmmmm1'), false);
  // 持ち主：ご本人の印・自分の動画はその場で外せる
  const own = await desk.correction({ video: 'https://www.youtube.com/watch?v=mmmmmmmmmm1', kind: 'steps', message: '手順3が違います', hide: true }, [mineCh]);
  assert.deepEqual([own.verified, own.hidden], [true, true]);
  assert.ok((await desk.optedOut()).has('mmmmmmmmmm1'), 'hidden from the public lists');
  // 持ち主でも、よその動画は外せない
  const other = await desk.correction({ video: 'https://youtu.be/ooooooooooo', kind: 'credit', message: 'x', hide: true }, [mineCh]);
  assert.deepEqual([other.verified, other.hidden], [false, false]);
  const mine = (await desk.mine([mineCh])).channels[0];
  assert.deepEqual(mine.hidden.map((v) => [v.videoId, v.by]), [['mmmmmmmmmm1', 'owner']]);
  await assert.rejects(desk.ownerShow(otherCh, [mineCh], { videoId: 'mmmmmmmmmm1' }), { code: 'not_your_channel' });
  await assert.rejects(desk.ownerShow(mineCh, [mineCh], { videoId: 'constructor' }), { code: 'video_not_hidden' });
  assert.deepEqual(await desk.ownerShow(mineCh, [mineCh], { videoId: 'mmmmmmmmmm1' }), { videoId: 'mmmmmmmmmm1', hidden: false });
  now += 10 * 60_000;
  assert.equal((await desk.optedOut()).has('mmmmmmmmmm1'), false);
  // 管理者：一覧（新しい順）→ 外す → 対応済み（外したまま）→ 戻す
  const list = await desk.corrections();
  assert.equal(list.items.length, 3);
  assert.equal(list.items.find((x) => x.id === anon.id).message, '醤油は大さじ1です');
  await assert.rejects(desk.decideCorrection(anon.id, { decision: 'delete' }), { code: 'invalid_decision' });
  await assert.rejects(desk.decideCorrection('toString', { decision: 'done' }), { code: 'correction_not_found' });
  await desk.decideCorrection(other.id, { decision: 'hide' });
  now += 10 * 60_000;
  assert.ok((await desk.optedOut()).has('ooooooooooo'));
  assert.equal((await desk.decideCorrection(other.id, { decision: 'done', note: '分量を直した' })).status, 'done');
  assert.ok((await desk.corrections()).items.find((x) => x.id === other.id).hidden, 'done does not show it again by itself');
  await desk.decideCorrection(other.id, { decision: 'show' });
  now += 10 * 60_000;
  assert.equal((await desk.optedOut()).has('ooooooooooo'), false);
  // 運営が外した動画も、持ち主なら戻せる（よその持ち主は戻せない）
  await desk.decideCorrection(own.id, { decision: 'hide' });
  await assert.rejects(desk.ownerShow(otherCh, [otherCh], { videoId: 'mmmmmmmmmm1' }), { code: 'video_not_hidden' });
  assert.equal((await desk.ownerShow(mineCh, [mineCh], { videoId: 'mmmmmmmmmm1' })).hidden, false);
  // チャンネルの停止の管理（§38）と同じ文書でも、動画の印を消さない
  await desk.decideCorrection(anon.id, { decision: 'hide' });
  assert.equal((await desk.corrections()).hiddenVideos.length, 1);
});

test('HTTP: corrections from the public page, the verified mark with the owner token, and the admin screen with its token', async (t) => {
  const g = fakeGoogle();
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token', GOOGLE_CLIENT_ID: CLIENT }, { recipeStore: createMemorySyncStore(), syncStore: null, photoStore: null, fetch: g.fetch, resolveChannel: async () => ({ channelId: mineCh, title: 'わたしの台所' }) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const anon = await (await post('/api/creators/corrections', { video: 'https://youtu.be/mmmmmmmmmm1', kind: 'amount', message: '分量が違います', hide: true })).json();
  assert.deepEqual([anon.verified, anon.hidden], [false, false]);
  assert.equal((await post('/api/creators/corrections', { video: 'https://youtu.be/mmmmmmmmmm1', kind: 'amount', message: 'x' }, { Authorization: 'Bearer broken' })).status, 401, 'a broken owner token is refused, not silently treated as anyone');
  const v = await (await post('/api/creators/verify', { accessToken: TOKEN })).json();
  const me = { Authorization: `Bearer ${v.token}` };
  const own = await (await post('/api/creators/corrections', { video: 'https://youtu.be/mmmmmmmmmm1', kind: 'steps', message: '手順が違います', hide: true }, me)).json();
  assert.deepEqual([own.verified, own.hidden], [true, true]);
  assert.equal((await (await post(`/api/creators/me/${mineCh}/show`, { videoId: 'mmmmmmmmmm1' }, me)).json()).hidden, false);
  assert.equal((await fetch(base + '/api/admin/creators/corrections')).status, 403);
  const admin = { Authorization: 'Bearer admin-test-token' };
  const list = await (await fetch(base + '/api/admin/creators/corrections', { headers: admin })).json();
  assert.equal(list.items.length, 2);
  assert.equal((await post(`/api/admin/creators/corrections/${anon.id}/decide`, { decision: 'done' })).status, 403);
  assert.equal((await (await post(`/api/admin/creators/corrections/${anon.id}/decide`, { decision: 'done' }, admin)).json()).status, 'done');
});

test('a hidden video (by its id) leaves the lists that read the opt-out set, while the rest of its channel stays', async () => {
  const { createVariantSearch } = await import('../src/variants.js');
  const search = async () => [{ videoId: 'mmmmmmmmmm1', channelId: mineCh, title: 'a', channelTitle: 'c' }, { videoId: 'mmmmmmmmmm2', channelId: mineCh, title: 'b', channelTitle: 'c' }];
  const found = await createVariantSearch(createMemorySyncStore(), { search, optedOut: async () => new Set(['mmmmmmmmmm1']) }).find({ q: '親子丼' }, 'home');
  assert.deepEqual(found.items.map((x) => x.videoId), ['mmmmmmmmmm2']);
});
