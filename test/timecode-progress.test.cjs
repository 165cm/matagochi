const { test } = require('node:test');
const assert = require('node:assert/strict');
const { markdown } = require('../scripts/timecode-progress.cjs');
test('補完進捗は動画の重複を除き、失敗を成功に数えない', () => {
  const md = markdown({ enabled:true, pilot:true, dailyRecipes:10, totalYen:500, totalReservedYen:52, measuredYen:2, attempts:[{videoId:'a',tries:2,improved:true,reason:'complete'},{videoId:'a',tries:1,improved:true,reason:'complete'},{videoId:'b',tries:1,reason:'temporary_error'}] }, {done:true,reason:'monthly_limit'});
  assert.match(md,/試した動画 \| 2本/);
  assert.match(md,/時刻が増えた動画 \| 1本/);
  assert.match(md,/試行回数（再試行を含む） \| 4回/);
  assert.match(md,/52.00円 \/ 500.00円/);
  assert.match(md,/今回の停止理由 \| 月または累計の予算上限/);
});
test('取得失敗は0件0円と報告せず、未測定費用も不明', () => {
  assert.match(markdown(null),/取得できません/);
  assert.match(markdown({attempts:[]}),/今月の実測費用.*不明/);
});
