const test = require("node:test");
const assert = require("node:assert/strict");
const { judge, markdown } = require("../scripts/trends-health.cjs");

// 毎朝の新着集めの健康診断（scripts/trends-health.cjs）。返事は本番の実行記録（2026-10）の形のまま。
const NOW = Date.parse("2026-10-28T00:00:00Z");
const DAY = 86_400_000;
const items = (n, expiresInDays = 20) => Array.from({ length: n }, (_, i) => ({ videoId: `v${i}`, expiresAt: new Date(NOW + expiresInDays * DAY).toISOString() }));
const AI = { today: 0, week: 0, perDay: 6, perWeek: 30, month: 985, monthCap: 1000, yen: 985, yenCap: 1000 };

test("2026-10-18〜27 の止まり方（AI の利用枠で0品）は赤にする", () => {
  const refresh = { week: "2026-10-26", day: "2026-10-27", items: 0, today: 0, tried: 0, ai: AI, paused: "ai_budget", done: false };
  const r = judge({ refresh, refill: null, list: { items: items(250) }, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /AI の利用枠/);
  assert.equal(r.numbers.added, 0);
  assert.equal(r.numbers.monthYen, 985);
});

test("その日の分が集まり、見えている品数が足りていれば緑", () => {
  const refresh = { today: 2, ai: { ...AI, yen: 300 }, done: true };
  const refill = { day: "2026-10-28", ai: 20, added: 9, done: true, ran: { ai: 5, added: 2 } };
  const r = judge({ refresh, refill, list: { items: items(260) }, now: NOW });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  // 補充はその日の合計（added）で数える（最後の1回の ran ではない）
  assert.equal(r.numbers.added, 11);
});

test("今月の予算切れ（新着集め・補充のどちらでも）は赤", () => {
  const month = judge({ refresh: { today: 0, limited: "trend_month_budget", done: false, ai: AI }, list: { items: items(300) }, now: NOW });
  assert.equal(month.ok, false);
  assert.match(month.problems.join(), /今月の新着集めの予算/);
  const refill = judge({ refresh: { today: 2, done: true, ai: AI }, refill: { added: 7, reason: "month_budget", done: true }, list: { items: items(300) }, now: NOW });
  assert.equal(refill.ok, false);
  assert.match(refill.problems.join(), /親料理の補充：今月/);
});

test("見えている品数が目安より少ない・一覧が読めない・返事がない時は赤", () => {
  const few = judge({ refresh: { today: 2, done: true }, list: { items: items(120) }, now: NOW });
  assert.equal(few.ok, false);
  assert.match(few.problems.join(), /120品/);
  const noList = judge({ refresh: { today: 2, done: true }, list: null, now: NOW });
  assert.match(noList.problems.join(), /一覧を読めませんでした/);
  const silent = judge({ refresh: {}, list: { items: items(300) }, now: NOW });
  assert.match(silent.problems.join(), /返事がありませんでした/);
});

test("決まりどおりの1日・1週の上限や、途中で時間切れは赤にしない（メモだけ）", () => {
  const capped = judge({ refresh: { today: 1, limited: "trend_ai_budget", done: false }, list: { items: items(300) }, now: NOW });
  assert.equal(capped.ok, true);
  assert.match(capped.notes.join(), /決まりどおり/);
  const unfinished = judge({ refresh: { today: 1, done: false, busy: true }, refill: { added: 3, done: false, reason: "wait" }, list: { items: items(300) }, now: NOW });
  assert.equal(unfinished.ok, true);
  assert.equal(unfinished.notes.length, 2);
});

test("7日以内に見えなくなる品数を数え、要約に日本語で出す", () => {
  const list = { items: [...items(150, 3), ...items(100, 20)] };
  const r = judge({ refresh: { today: 2, done: true, ai: AI }, list, now: NOW });
  assert.equal(r.numbers.soon, 150);
  const text = markdown(r);
  assert.match(text, /✅ 問題なし/);
  assert.match(text, /いま見えている新着.*\| 250品 \|/);
  assert.match(text, /985円 \/ 1000円/);
  assert.match(markdown(judge({ refresh: null, list: null, now: NOW })), /❌ 問題あり[\s\S]*不明/);
});
