import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { guideLimit, numbersIn, checkGuide, rewriteGuide, listedGuide } from '../src/rewrite.js';
import { createRecipeCatalog } from '../src/recipeCatalog.js';
import { weekOf } from '../src/trends.js';
process.env.NODE_ENV = 'test';
const { createApp } = await import('../src/server.js');

// 2026-10-04：手順の書き直し（覚えやすい手順。APP_MAP §49）。まず10品で試す。
const codes = (r) => [...new Set(r.issues.map((i) => i.code))].sort();
const ORIG = ['キャベツを3cm幅に切る', '豚こまに塩こしょうをする', 'フライパンを中火で熱し、豚こまを2分焼く', 'キャベツを入れて1分炒める', '大さじ1の醤油を回しかける', '皿に盛る'];

test('step limits by cooking time: up to 20 min → 7, 30 min → 10, 45 min or more → 15, unknown → 10', () => {
  assert.deepEqual([10, 15, 20, 30, 45, 60, null].map(guideLimit), [7, 7, 7, 10, 15, 15, 10]);
});

test('numbers that must not change: time, temperature, watts, amounts (full-width too)', () => {
  assert.deepEqual(numbersIn('600Wのレンジで２分３０秒、180℃のオーブンで15分。大さじ１と1/2'), ['600W', '2分', '30秒', '180℃', '15分', '大さじ1']);
  assert.deepEqual(numbersIn('塩少々'), []);
});

test('0-yen check: a good rewrite passes; too many, missing, out of order, lost numbers and bad numbers are caught', () => {
  const good = [
    { text: '下ごしらえ：キャベツを3cm幅に切り、豚こまに塩こしょう。', from: [0, 1] },
    { text: '焼く：中火で豚こまを2分、キャベツを足して1分炒める。', from: [2, 3] },
    { text: '仕上げ：大さじ1の醤油を回しかけて盛る。', from: [4, 5] },
  ];
  assert.equal(checkGuide(ORIG, good, { limit: 7 }).ok, true);
  assert.deepEqual(codes(checkGuide(ORIG, good, { limit: 2 })), ['too_many']);
  assert.deepEqual(codes(checkGuide(ORIG, [good[0], good[2]], { limit: 7 })), ['missing']);
  assert.deepEqual(codes(checkGuide(ORIG, [good[1], good[0], good[2]], { limit: 7 })), ['order']);
  assert.deepEqual(codes(checkGuide(ORIG, [good[0], { ...good[1], text: '焼く：豚こまとキャベツを炒める。' }, good[2]], { limit: 7 })), ['number_lost']);
  assert.deepEqual(codes(checkGuide(ORIG, [good[0], { ...good[1], from: [3, 2] }, good[2]], { limit: 7 })), ['from_bad', 'missing']);
  assert.deepEqual(codes(checkGuide(ORIG, [good[0], { ...good[1], from: [2, 9] }, good[2]], { limit: 7 })), ['from_bad', 'missing']);
  // 1つの元の手順を2つに分けるのはよい（数字はどちらかにあればよい）
  const split = [good[0], { text: '中火で豚こまを2分焼く。', from: [2] }, { text: 'キャベツを足して1分炒める。', from: [3] }, good[2]];
  assert.equal(checkGuide(ORIG, split, { limit: 7 }).ok, true);
  assert.equal(checkGuide(['切る', '焼く'], [{ text: 'あ'.repeat(91), from: [0, 1] }], { limit: 7 }).ok, false);
});

test('rewrite: a failed check is sent back once with the reasons (through the AI budget); a second failure is not saved', async () => {
  const asked = [];
  let budget = 0;
  const answers = [{ steps: [{ text: '全部やる', from: [1] }] }, { steps: [{ text: '下ごしらえ：3cm幅に切って塩こしょう。', from: [1, 2] }, { text: '中火で2分、キャベツを足して1分炒め、大さじ1の醤油で仕上げて盛る。', from: [3, 4, 5, 6] }] }];
  const g = await rewriteGuide({ title: '豚キャベツ', steps: ORIG, planning: { minutes: 10 } }, { write: async (x) => { asked.push(x); return answers[asked.length - 1]; }, beforeRetry: async () => { budget++; } });
  assert.equal(g.steps.length, 2); assert.deepEqual(g.steps[1].from, [2, 3, 4, 5]); assert.equal(g.limit, 7); assert.equal(g.tries, 2);
  assert.equal(asked[0].limit, 7); assert.equal(asked[0].retry, null);
  assert.ok(asked[1].retry.some((x) => x.code === 'missing')); assert.equal(budget, 1);
  await assert.rejects(rewriteGuide({ steps: ORIG }, { write: async () => answers[0] }), (e) => e.code === 'guide_invalid' && e.status === 422 && e.issues.length > 0);
});

test('catalog: the rewrite is kept beside the original steps; reading the recipe again drops it; the list shows it only while the step count matches', async () => {
  const store = createMemorySyncStore();
  const cat = createRecipeCatalog(store, async () => ({ title: '豚キャベツ', ingredients: [{ name: '豚こま' }], steps: ORIG }));
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  await cat.setGuide(url, { steps: [{ text: '全部まとめて作る：3cm幅・2分・1分・大さじ1。', from: [0, 1, 2, 3, 4, 5] }], limit: 7 });
  const r = await cat.peek(url);
  assert.deepEqual(r.steps, ORIG, 'original steps stay');
  assert.equal(listedGuide(r).length, 1);
  assert.equal(listedGuide({ ...r, steps: ORIG.slice(1) }), null, 'steps changed → not shown');
  await cat.setStepTimes(url, [1, 2, 3, 4, 5, 6]);
  assert.ok((await cat.peek(url)).guide, 'fixing times keeps the rewrite');
  await cat.import(url, { reread: true });
  assert.equal((await cat.peek(url)).guide, undefined, 'a re-read drops it');
  await cat.setGuide(url, { steps: [{ text: 'x', from: [0, 1, 2, 3, 4, 5] }], limit: 7 });
  await cat.setGuide(url, null);
  assert.equal((await cat.peek(url)).guide, undefined);
});

test('admin: rewrite one recipe, pilot picks recipes over the limit first, marks failed checks, remove; the app list carries the rewrite', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const mk = (v, n, minutes) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: Array.from({ length: n }, (_, i) => `手順${i + 1}をする`), planning: { minutes }, analyzedFrom: 'description', snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  const ids = ['shortaaaaa1', 'longaaaaaa2', 'longbbbbbb3', 'badaaaaaaa4'];
  await mk(ids[0], 4, 10); await mk(ids[1], 12, 10); await mk(ids[2], 9, 10); await mk(ids[3], 14, 10);
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: ids.map((videoId) => ({ videoId })), skipped: {} }] }, { ifGeneration: 0 });
  const asked = [];
  // 1手順ずつまとめずに、上限の数に詰める書き直し（badaaaaaaa4 だけは手順を落とす）
  const write = async ({ title, steps, limit }) => {
    asked.push(title);
    if (title.includes('badaaaaaaa4')) return { steps: [{ text: 'まとめて作る', from: [1] }] };
    const per = Math.ceil(steps.length / limit);
    const out = [];
    for (let i = 0; i < steps.length; i += per) out.push({ text: steps.slice(i, i + per).join('、'), from: Array.from({ length: Math.min(per, steps.length - i) }, (_, k) => i + k + 1) });
    return { steps: out };
  };
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    videoDetails: async (list) => Object.fromEntries(list.map((id) => [id, { status: 'public', durationSeconds: 600 }])), rewriteRecipeSteps: write });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const admin = { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' };
  const post = (p, body = {}) => fetch(`${base}${p}`, { method: 'POST', headers: admin, body: JSON.stringify(body) });
  assert.equal((await fetch(`${base}/api/admin/guide/pilot`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${base}/api/admin/recipes/${ids[0]}/guide`, { method: 'POST' })).status, 403);
  // お試し：手順が上限（10分 → 7）より多い料理から（14 → 12 → 9 → 4 の順）
  const a = await (await post('/api/admin/guide/pilot', { max: 3 })).json();
  assert.deepEqual(a.done.map((x) => [x.videoId, x.error || x.after]), [[ids[3], 'guide_invalid'], [ids[1], 6], [ids[2], 5]]);
  assert.equal(a.left, 1);
  const b = await (await post('/api/admin/guide/pilot', { max: 3 })).json();
  assert.deepEqual(b.done.map((x) => x.videoId), [ids[0]], 'already rewritten and failed-check recipes are not tried again');
  assert.equal(asked.filter((x) => x.includes('badaaaaaaa4')).length, 2, 'one retry, then marked');
  // アプリの一覧に書き直しが載る（元の手順もそのまま）
  const list = await (await fetch(`${base}/api/trends`)).json();
  const long = list.items.find((x) => x.videoId === ids[1]);
  assert.equal(long.steps.length, 12); assert.equal(long.guide.length, 6); assert.deepEqual(long.guide[0].from, [0, 1]);
  // レシピの画面（管理）にも
  const one = await (await fetch(`${base}/api/admin/recipes/${ids[1]}`, { headers: { Authorization: admin.Authorization } })).json();
  assert.equal(one.guide.length, 6); assert.equal(one.guideLimit, 7);
  // 外す
  assert.equal((await post(`/api/admin/recipes/${ids[1]}/guide/remove`)).status, 200);
  const after = await (await fetch(`${base}/api/trends`)).json();
  assert.equal(after.items.find((x) => x.videoId === ids[1]).guide, undefined);
  // 1品だけ書き直す
  const re = await (await post(`/api/admin/recipes/${ids[1]}/guide`)).json();
  assert.equal(re.after, 6); assert.equal(re.limit, 7);
});
