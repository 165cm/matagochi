import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemorySyncStore } from '../src/syncStore.js';
import { createPushDesk, cleanSchedule, validSubscription } from '../src/push.js';

const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'BExampleKey_-', auth: 'authKey_-' } };

test('push: only real push services; schedules are cleaned and bounded', () => {
  assert.throws(() => validSubscription({ ...sub, endpoint: 'https://evil.example.com/x' }), { code: 'invalid_subscription' });
  assert.throws(() => validSubscription({ ...sub, endpoint: 'http://fcm.googleapis.com/x' }), { code: 'invalid_subscription' });
  assert.equal(validSubscription({ ...sub, endpoint: 'https://web.push.apple.com/QAbc' }).endpoint, 'https://web.push.apple.com/QAbc');
  const now = Date.parse('2026-10-01T00:00:00Z');
  const s = cleanSchedule([
    { id: 'a', at: '2026-10-01T08:00:00Z', title: '今夜は', body: 'x', url: '?view=today' },
    { id: 'a', at: '2026-10-01T09:00:00Z', title: 'dup' },
    { id: 'old', at: '2026-09-29T00:00:00Z', title: 'old' },
    { id: 'far', at: '2026-11-30T00:00:00Z', title: 'far' },
    { id: 'bad', at: '2026-10-01T08:00:00Z', title: 'u', url: 'https://evil' },
  ], now);
  assert.deepEqual(s.map((x) => [x.id, x.url]), [['a', '?view=today'], ['bad', '']]);
});

test('push: subscribe, tick sends each due item once, gone subscriptions are removed', async () => {
  const store = createMemorySyncStore();
  let t = Date.parse('2026-10-01T07:00:00Z');
  const sent = [];
  let status = 201;
  const desk = createPushDesk(store, { now: () => t, send: async (s, payload, o) => { if (status >= 400) { const e = new Error('x'); e.statusCode = status; throw e; } sent.push([s.endpoint, JSON.parse(payload).title, !!o.vapidDetails.privateKey]); } });
  const { publicKey } = await desk.publicKey();
  assert.ok(publicKey.length > 60);
  assert.equal((await desk.publicKey()).publicKey, publicKey, 'the same key every time');
  await desk.subscribe({ subscription: sub, schedule: [{ id: 'tonight-1', at: '2026-10-01T07:30:00Z', title: '今夜は豚こまキャベツ丼', body: '20分' }, { id: 'shop-1', at: '2026-10-01T08:00:00Z', title: '17時は買い物' }] }, 'home-1');
  assert.deepEqual(await desk.tick(), { sent: 0, gone: 0, subs: 1 }, 'nothing due yet');
  t += 31 * 60_000;
  assert.deepEqual(await desk.tick(), { sent: 1, gone: 0, subs: 1 });
  assert.deepEqual(sent[0], [sub.endpoint, '今夜は豚こまキャベツ丼', true]);
  t += 60_000;
  assert.deepEqual(await desk.tick(), { skipped: true }, 'ticks closer than 4 minutes do nothing');
  t += 5 * 60_000;
  assert.equal((await desk.tick()).sent, 0, 'not sent twice');
  await desk.subscribe({ subscription: sub, schedule: [{ id: 'tonight-1', at: '2026-10-01T07:30:00Z', title: '今夜は豚こまキャベツ丼' }, { id: 'shop-1', at: '2026-10-01T08:00:00Z', title: '17時は買い物' }] }, 'home-1');
  t = Date.parse('2026-10-01T08:10:00Z');
  assert.equal((await desk.tick()).sent, 1, 'a re-upload keeps what was sent');
  assert.equal(sent.length, 2);
  await desk.subscribe({ subscription: sub, schedule: [{ id: 'x', at: '2026-10-01T08:20:00Z', title: 'x' }] }, 'home-1');
  status = 410; t += 15 * 60_000;
  assert.deepEqual(await desk.tick(), { sent: 0, gone: 1, subs: 1 });
  t += 15 * 60_000;
  assert.equal((await desk.tick()).subs, 0, 'the dead subscription left the index');
});

test('push: a test notification, three a day', async () => {
  const store = createMemorySyncStore();
  let n = 0;
  const desk = createPushDesk(store, { send: async () => { n++; } });
  await assert.rejects(desk.test({ endpoint: sub.endpoint }), { code: 'not_subscribed' });
  await desk.subscribe({ subscription: sub, schedule: [] });
  for (let i = 0; i < 3; i++) await desk.test({ endpoint: sub.endpoint });
  await assert.rejects(desk.test({ endpoint: sub.endpoint }), { code: 'push_test_quota' });
  assert.equal(n, 3);
  await desk.unsubscribe({ endpoint: sub.endpoint });
  await assert.rejects(desk.test({ endpoint: sub.endpoint }), { code: 'not_subscribed' });
});

// 2026-11-02：「⚡️ 異議あり」を運営の端末へ（APP_MAP §52-12）。
test('push: admin devices get objection notices, at most one per 15 minutes; the rest are counted and sent by the tick', async () => {
  const store = createMemorySyncStore();
  let t = Date.parse('2026-11-02T07:00:00Z');
  const sent = [];
  let failing = false;
  const desk = createPushDesk(store, { now: () => t, send: async (s, payload) => { if (failing) throw Object.assign(new Error('x'), { statusCode: 503 }); sent.push([s.endpoint, JSON.parse(payload)]); } });
  assert.deepEqual(await desk.notifyAdmins({ title: '⚡️ 異議あり：人数' }), { sent: 0 }, 'no admin device yet');
  await desk.adminSubscribe({ subscription: sub });
  await desk.adminSubscribe({ subscription: sub });
  assert.equal((await desk.adminDevices()).devices, 1, 'same device once');
  assert.deepEqual(await desk.notifyAdmins({ title: '⚡️ 異議あり：人数', body: '鶏むね肉' }), { sent: 1 });
  assert.equal(sent[0][1].title, '⚡️ 異議あり：人数');
  assert.equal(sent[0][1].url, 'admin/catalog.html#objections');
  t += 60_000;
  assert.deepEqual(await desk.notifyAdmins({ title: '⚡️ 異議あり：手順' }), { queued: true });
  assert.deepEqual(await desk.notifyAdmins({ title: '⚡️ 異議あり：時刻' }), { queued: true });
  assert.equal(sent.length, 1);
  t += 15 * 60_000;
  await desk.tick();
  assert.equal(sent.length, 2);
  assert.match(sent[1][1].body, /2件/);
  // 送れなかった時は数に足し、定期実行で送り直す（Claude review #217）
  t += 15 * 60_000;
  failing = true;
  assert.deepEqual(await desk.notifyAdmins({ title: '⚡️ 異議あり：その他' }), { sent: 0 });
  failing = false;
  await desk.tick();
  assert.match(sent.at(-1)[1].body, /1件/);
  // 試しの通知は、その端末にだけ
  const other = { ...sub, endpoint: 'https://fcm.googleapis.com/fcm/send/other' };
  await desk.adminSubscribe({ subscription: other });
  const n = sent.length;
  await desk.adminTest({ endpoint: other.endpoint });
  assert.deepEqual(sent.slice(n).map((x) => x[0]), [other.endpoint]);
  await desk.adminUnsubscribe({ endpoint: other.endpoint });
  await desk.adminUnsubscribe({ endpoint: sub.endpoint });
  assert.equal((await desk.adminDevices()).devices, 0);
});
