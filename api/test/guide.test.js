import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMemorySyncStore } from '../src/syncStore.js';
import { guideLimit, numbersIn, checkGuide, rewriteGuide, listedGuide, stepsKey, retryNotes } from '../src/rewrite.js';
import { localizeStep } from '../src/units.js';
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
  assert.deepEqual(numbersIn('600Wのレンジで２分３０秒、180℃のオーブンで15分。大さじ１と1/2'), ['600W', '2分', '30秒', '180℃', '15分', '大さじ1と1/2']);
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
  assert.ok(asked[1].retry.some((x) => /元の手順2 がどの手順の from にも入っていない/.test(x)), asked[1].retry.join('\n')); assert.equal(budget, 1);
  await assert.rejects(rewriteGuide({ steps: ORIG }, { write: async () => answers[0] }), (e) => e.code === 'guide_invalid' && e.status === 422 && e.issues.length > 0);
});

test('catalog: the rewrite is kept beside the original steps; reading the recipe again drops it; the list shows it only while the step count matches', async () => {
  const store = createMemorySyncStore();
  const cat = createRecipeCatalog(store, async () => ({ title: '豚キャベツ', ingredients: [{ name: '豚こま' }], steps: ORIG }));
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  await cat.setGuide(url, { steps: [{ text: '全部まとめて作る：3cm幅・2分・1分・大さじ1。', from: [0, 1, 2, 3, 4, 5] }], limit: 7, of: stepsKey(ORIG) });
  const r = await cat.peek(url);
  assert.deepEqual(r.steps, ORIG, 'original steps stay');
  assert.equal(listedGuide(r).length, 1);
  assert.equal(listedGuide({ ...r, steps: ORIG.slice(1) }), null, 'steps changed → not shown');
  await cat.setStepTimes(url, [1, 2, 3, 4, 5, 6]);
  assert.ok((await cat.peek(url)).guide, 'fixing times keeps the rewrite');
  await cat.import(url, { reread: true });
  assert.equal((await cat.peek(url)).guide, undefined, 'a re-read drops it');
  await cat.setGuide(url, { steps: [{ text: 'x', from: [0, 1, 2, 3, 4, 5] }], limit: 7, of: stepsKey(ORIG) });
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

test('review fix (#139): changed, dropped or added numbers fail the check (counts, ranges, mixed fractions, full-width units)', () => {
  const one = (orig, text) => codes(checkGuide([orig], [{ text, from: [0] }], { limit: 7 }));
  assert.deepEqual(one('卵を2個入れて5分焼く', '卵を入れて5分焼き、200℃にする'), ['number_added', 'number_lost']);
  assert.deepEqual(one('卵を2個入れる', '卵を入れる'), ['number_lost']);
  assert.deepEqual(one('しょうゆ大さじ1と1/2を入れる', 'しょうゆ大さじ1を入れる'), ['number_added', 'number_lost']);
  assert.deepEqual(one('10〜15分煮る', '15分煮る'), ['number_added', 'number_lost']);
  assert.deepEqual(one('600Ｗで2分温める', 'レンジで2分温める'), ['number_lost']);
  assert.deepEqual(one('にんじん1本を4等分に切る', 'にんじんを切る'), ['number_lost']);
  assert.deepEqual(one('10～15分煮る（600ｗなら２分）', '煮る：10〜15分（600Wなら2分）'), [], 'same numbers written differently are fine');
  // 2つの手順の「2分」を1つにまとめると、数が減る
  assert.deepEqual(codes(checkGuide(['肉を2分焼く', '裏返して2分焼く'], [{ text: '両面を2分ずつ焼く', from: [0, 1] }], { limit: 7 })), ['number_lost']);
  assert.equal(stepsKey(['キャベツを切る', '豚こまに塩', '豚こまを2分焼く', 'キャベツを入れて1分炒める']), '72b45ce8', 'the app (discover.js stepsKey) uses the same value');
});

test('review fix (#139): a rewrite made for older steps is not saved or shown, even when the step count is the same', async () => {
  const store = createMemorySyncStore();
  let steps = ['肉を切る', '肉を焼く'];
  const cat = createRecipeCatalog(store, async () => ({ title: '料理', ingredients: [{ name: '肉' }], steps }));
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  const of = stepsKey((await cat.peek(url)).steps);
  steps = ['魚を洗う', '魚を煮る'];
  await cat.import(url, { reread: true });
  await assert.rejects(cat.setGuide(url, { steps: [{ text: '肉を切って焼く', from: [0, 1] }], limit: 7, of }), { code: 'catalog_conflict' });
  assert.equal((await cat.peek(url)).guide, undefined);
  assert.equal(listedGuide({ steps: ['魚を洗う', '魚を煮る'], guide: { steps: [{ text: 'x', from: [0, 1] }], of } }), null);
});

test('review fix (#139): °F is converted once — reading again never nests "175℃（175℃（350°F））"', async () => {
  const once1 = localizeStep('350°Fで20分焼く');
  assert.equal(once1, '175℃（350°F）で20分焼く');
  assert.equal(localizeStep(once1), once1);
  const store = createMemorySyncStore();
  const cat = createRecipeCatalog(store, async () => ({ title: '料理', ingredients: [{ name: '肉' }], steps: ['350°Fのオーブンで20分焼く', '冷ます'] }));
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  await cat.import(url);
  const r = await cat.peek(url);
  assert.equal(r.steps[0], '175℃（350°F）のオーブンで20分焼く');
  await cat.setGuide(url, { steps: [{ text: '焼く：175℃（350°F）のオーブンで20分焼いて冷ます。', from: [0, 1] }], limit: 7, of: stepsKey(r.steps) });
  const again = await cat.peek(url);
  assert.equal(again.steps[0], r.steps[0]);
  assert.equal(again.guide.steps[0].text, '焼く：175℃（350°F）のオーブンで20分焼いて冷ます。');
  assert.ok(listedGuide(again));
});

test('review fix (#139): the same recipe is not rewritten twice at once; a failed-check mark survives a write conflict', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  await store.put('youtube-abcdefghijk', { status: 'ready', result: { title: '料理', videoUrl: 'https://www.youtube.com/watch?v=abcdefghijk', channelTitle: 'ch', channelId: 'UCabcdefghijk', ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: ['肉を切る', '肉を2分焼く', '盛る'], planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await store.put('youtube-zzzzzzzzzzz', { status: 'ready', result: { title: '失敗料理', videoUrl: 'https://www.youtube.com/watch?v=zzzzzzzzzzz', channelTitle: 'ch', channelId: 'UCzzzzzzzzzzz', ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'], planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: [{ videoId: 'zzzzzzzzzzz' }], skipped: {} }] }, { ifGeneration: 0 });
  let calls = 0, release;
  const write = async ({ title }) => { calls++; if (title === '失敗料理') return { steps: [{ text: 'x', from: [1] }] }; await new Promise((r) => { release = r; }); return { steps: [{ text: '肉を切って2分焼き、盛る。', from: [1, 2, 3] }] }; };
  // guide/tried の最初の書き込みだけ、ほかの書き込みと重なった扱いにする
  const put = store.put.bind(store);
  let clash = true;
  store.put = async (key, ...rest) => { if (key === 'guide/tried-v2' && clash) { clash = false; await put(key, { ids: ['someone'] }, { ifGeneration: 0 }); return null; } return put(key, ...rest); };
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [], rewriteRecipeSteps: write,
    videoDetails: async (list) => Object.fromEntries(list.map((id) => [id, { status: 'public', durationSeconds: 600 }])) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p) => fetch(`${base}${p}`, { method: 'POST', headers: { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' }, body: '{}' });
  const first = post('/api/admin/recipes/abcdefghijk/guide');
  while (!release) await new Promise((r) => setTimeout(r, 5));
  const second = await post('/api/admin/recipes/abcdefghijk/guide');
  assert.equal(second.status, 409); assert.equal((await second.json()).error.code, 'guide_pending');
  release();
  assert.equal((await first).status, 200); assert.equal(calls, 1);
  assert.equal(await store.get('guide-lock/abcdefghijk'), null, 'the lock is released');
  // 失敗の印：重なっても読み直して残す
  const p = await (await post('/api/admin/guide/pilot')).json();
  assert.equal(p.done[0].error, 'guide_invalid');
  assert.deepEqual((await store.get('guide/tried-v2')).envelope.ids.sort(), ['someone', 'zzzzzzzzzzz']);
});

test('review fix (#139 r2): swapping times or temperatures inside merged steps fails; numbers of different kinds may change places', () => {
  const c = (orig, text) => codes(checkGuide(orig, [{ text, from: orig.map((_, i) => i) }], { limit: 7 }));
  assert.deepEqual(c(['200℃で10分焼く', 'その後5分休ませる'], '200℃で5分焼き、その後10分休ませる'), ['number_order']);
  assert.deepEqual(c(['600Wで2分', '200Wで5分'], '600Wで5分、200Wで2分'), ['number_order']);
  assert.deepEqual(c(['600Wで2分', '200Wで5分'], '200Wで2分、600Wで5分'), ['number_order']);
  assert.deepEqual(c(['180℃で5分', '200℃で5分'], '200℃で5分、180℃で5分'), ['number_order']);
  assert.deepEqual(c(['2分（600W）チンする', '混ぜる'], '600Wで2分チンして混ぜる'), [], 'a different kind may come first');
  assert.deepEqual(c(['200℃で10分焼く', 'その後5分休ませる'], '200℃で10分焼き、その後5分休ませる'), []);
});

test('review fix (#139 r2): the pilot stops when the failed-check mark cannot be saved (no charge again next time)', async (t) => {
  const store = createMemorySyncStore();
  const NOW = Date.now();
  const mk = (v) => store.put(`youtube-${v}`, { status: 'ready', result: { title: `料理${v}`, videoUrl: `https://www.youtube.com/watch?v=${v}`, channelTitle: 'ch', channelId: `UC${v}`, ingredients: [{ name: '豚肉' }, { name: 'キャベツ' }, { name: '塩' }], steps: Array.from({ length: 9 }, (_, i) => `手順${i + 1}`), planning: { minutes: 10 }, snippetFetchedAt: new Date().toISOString(), catalog: { analyzedAt: new Date().toISOString(), extractorVersion: 99 } } }, { ifGeneration: 0 });
  await mk('badaaaaaaa1'); await mk('badaaaaaaa2');
  await store.put('trends/index', { weeks: [{ week: weekOf(NOW), startedAt: new Date(NOW).toISOString(), candidates: [], tried: [], items: [{ videoId: 'badaaaaaaa1' }, { videoId: 'badaaaaaaa2' }], skipped: {} }] }, { ifGeneration: 0 });
  let calls = 0;
  const put = store.put.bind(store);
  store.put = async (key, ...rest) => (key === 'guide/tried-v2' ? null : put(key, ...rest));
  const app = createApp({ RECIPE_ADMIN_TOKEN: 'admin-test-token' }, { recipeStore: store, syncStore: null, photoStore: null, resolveChannel: async () => null, searchRecipes: async () => [],
    rewriteRecipeSteps: async () => { calls++; return { steps: [{ text: 'x', from: [1] }] }; },
    videoDetails: async (list) => Object.fromEntries(list.map((id) => [id, { status: 'public', durationSeconds: 600 }])) });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/guide/pilot`, { method: 'POST', headers: { Authorization: 'Bearer admin-test-token', 'Content-Type': 'application/json' }, body: '{"max":5}' });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'guide_tried_not_saved');
  assert.equal(calls, 2, 'stopped after the first recipe (2 tries), the second is not charged');
});

test('review fix (#139 r3): "4等分" and "3分の1" are amounts, not times — a correct rewrite is not refused', () => {
  const c = (orig, text) => codes(checkGuide([orig], [{ text, from: [0] }], { limit: 7 }));
  assert.deepEqual(c('生地を4等分にして5分休ませる', '休ませる時間は5分。生地を4等分にしてから休ませる'), []);
  assert.deepEqual(numbersIn('全体の3分の1を加える'), ['1/3']);
  assert.deepEqual(c('全体の3分の1を加える', '全体の1/3を加える'), []);
  assert.deepEqual(c('全体の3分の1を加える', '全体の半分を加える'), ['number_lost']);
  assert.deepEqual(c('全体の3分の1を加えて3分煮る', '全体の1/3を加えて3分煮る'), []);
  assert.deepEqual(c('3分煮て2分蒸らす', '2分煮て3分蒸らす'), ['number_order'], 'real times are still checked');
});

test('review fix (#139 r4): "2分の1個" and "1/2個", "大さじ2分の1" and "大さじ1/2" are the same amount', () => {
  const c = (orig, text) => codes(checkGuide([orig], [{ text, from: [0] }], { limit: 7 }));
  assert.deepEqual(numbersIn('玉ねぎを2分の1個切る'), ['1/2個']);
  assert.deepEqual(numbersIn('大さじ2分の1を加える'), ['大さじ1/2']);
  assert.deepEqual(c('玉ねぎを2分の1個切る', '玉ねぎを1/2個切る'), []);
  assert.deepEqual(c('にんじん2分の1本を切る', 'にんじん1/2本を切る'), []);
  assert.deepEqual(c('牛乳2分の1カップを加える', '牛乳1/2カップを加える'), []);
  assert.deepEqual(c('大さじ2分の1を加える', '大さじ1/2を加える'), []);
  assert.deepEqual(c('玉ねぎを2分の1個切る', '玉ねぎを1個切る'), ['number_added', 'number_lost'], 'a changed amount still fails');
  assert.deepEqual(numbersIn('5分のあいだ煮る'), ['5分'], 'a time followed by の stays a time');
});

test('2026-10-04 pilot: the retry tells the AI exactly which numbers and steps to fix; the admin sees the numbers too', async () => {
  const issues = checkGuide(['豚肉を炒める', '塩をふる'], [{ text: '豚肉200gを3分炒める', from: [0] }, { text: '塩をふる', from: [1] }], { limit: 7 }).issues;
  const notes = retryNotes(issues, { limit: 7 });
  assert.equal(notes.length, 1);
  assert.match(notes[0], /元の手順にない数字（200g・3分）を書かない。材料の分量/);
  assert.match(retryNotes([{ code: 'text_long', item: 2 }])[0], /書き直した手順3を90字以内/);
  await assert.rejects(rewriteGuide({ steps: ['豚肉を炒める', '塩をふる'] }, { write: async () => ({ steps: [{ text: '豚肉200gを炒める', from: [1] }, { text: '塩をふる', from: [2] }] }) }),
    (e) => e.code === 'guide_invalid' && /元の手順にない数字（時間・温度・分量）がある（200g）/.test(e.message));
});
