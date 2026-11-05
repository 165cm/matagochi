const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../admin/catalog.html'), 'utf8');
const source = html.slice(html.indexOf('  function candidateTimeTags('), html.indexOf('  const sec ='));
const tags = vm.runInNewContext(source + '; candidateTimeTags');
const labels = c => Array.from(tags(c, 0), t => t.label);
test('candidate tags distinguish video, transcript, administrator, chapters, description and absent evidence', () => {
  assert.ok(labels({stepTimes:[1], stepEvidence:[{kind:'action'}]}).includes('🎬 動画AI'));
  assert.ok(labels({stepTimes:[1], stepEvidence:[{kind:'action',cueId:0}]}).includes('💬 字幕AI'));
  assert.deepEqual(labels({stepTimes:[1], stepEvidence:[{kind:'admin'}]}), ['✏ 管理者修正']);
  assert.deepEqual(labels({stepTimes:[1],timesFrom:'chapters'}), ['📑 章','△ 場面を確認']);
  assert.deepEqual(labels({stepTimes:[1],timesFrom:'description'}), ['📄 説明欄','△ 場面を確認']);
  assert.ok(labels({stepTimes:[1],evidenceVersion:1,stepEvidence:[{kind:'unknown'}]}).includes('⚠ 根拠なし'));
});
test('warnings remain prominent alongside a valid source, including carried administrator times', () => {
  const c = {stepTimes:[1],stepEvidence:[{kind:'admin'}],suspectTimes:[0],duplicateTimes:[0]};
  assert.ok(labels(c).includes('⚠ 時刻重複'));
  assert.ok(!labels(c).includes('⚠ 順序を確認'));
  assert.ok(tags(c,0).some(t => t.tone === 'danger'));
  assert.ok(labels({...c,duplicateTimes:[]}).includes('⚠ 順序を確認'));
  assert.ok(labels({...c,stepTimes:[null]}).includes('⚠ 時刻なし'));
});
