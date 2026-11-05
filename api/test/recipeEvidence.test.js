import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvidenceRecipe, evidenceVideoPrompt } from '../src/recipeEvidence.js';
import { importYouTubeRecipe } from '../src/importRecipe.js';
const row = (text, time, kind = 'action') => ({ text, time, evidence: { kind, detail: '手元で作業している' } });

test('evidence: preserve observed operation order, never sort timestamps to disguise inversion or duplicates', () => {
  const result = parseEvidenceRecipe({ stepsComplete: true, steps: [row('切り込み', '01:43'), row('塩を当てる', '00:20'), row('薬味', '00:20')] });
  assert.deepEqual(result.stepTimes, [103, 20, 20]);
  assert.deepEqual(result.steps, ['切り込み', '塩を当てる', '薬味']);
});
test('evidence: missing, explanation-only, or invalid evidence never produces a time', () => {
  const result = parseEvidenceRecipe({ stepsComplete: true, steps: [row('塩', '00:20', 'unknown'), { text: '生姜', time: '00:45' }, row('ねぎ', 'invalid'), row('切り込み', '01:43', 'explanation')] });
  assert.deepEqual(result.stepTimes, [null, null, null, null]);
});
test('evidence: use exact integer cue IDs and source time, not model-invented seconds', () => {
  const rows = [1, '1', null, 2].map(cueId => ({ ...row('調理する', '09:00'), cueId }));
  const r = parseEvidenceRecipe({ stepsComplete: true, steps: rows }, { cues: [{ id: 1, start: 20, text: '塩を振ります' }] });
  assert.deepEqual(r.stepTimes, [20, null, null, null]);
  assert.equal(r.stepEvidence[0].quote, '塩を振ります');
});
test('evidence: reject absent completion marker, truncated or empty steps instead of silently dropping the ending', () => {
  for (const raw of [{ steps: [row('a', 1), row('b', 2)] }, { stepsComplete: false, steps: [row('a', 1), row('b', 2)] }, { stepsComplete: true, steps: [row('a', 1), row('', 2)] }, { stepsComplete: true, steps: Array.from({length:31}, () => row('a',1)) }]) {
    assert.throws(() => parseEvidenceRecipe(raw), { code: 'evidence_recipe_incomplete' });
  }
});
test('candidate import: video evidence cannot be overwritten by chapter matching; description materials survive', async () => {
  let chapterCalls = 0;
  const r = await importYouTubeRecipe('https://www.youtube.com/watch?v=KiQXMVnlXVo', {
    fetchYouTubeSnippet: async () => ({title:'サバ味噌',description:'材料 サバ2枚\n0:20 塩\n1:43 切り込み',durationSeconds:383}),
    analyzeRecipeDescription: async () => ({title:'サバ味噌', ingredients:[{name:'サバ',amount:'2枚'}],steps:['切る','塩']}),
    analyzeRecipeVideo: async (url, snippet, opts) => { assert.equal(opts.candidateEvidence, true); return parseEvidenceRecipe({stepsComplete:true,steps:[row('塩', '00:20'),row('切り込み', '01:43', 'unknown')]}); },
    matchStepsToChapters: async () => { chapterCalls++; return {chapterIndex:[0,1]}; }
  }, { forceVideo:true,videoFullOnly:true,videoMaxSeconds:1800,candidateEvidence:true });
  assert.equal(chapterCalls, 0);
  assert.deepEqual(r.stepTimes, [20,null]);
  assert.equal(r.ingredients[0].amount, '2枚');
  assert.equal(r.evidenceVersion, 1);
  assert.equal(r.stepEvidence[1].kind, 'unknown');
});
test('candidate prompt retains the later part of the description beyond the old 3000-character cutoff', () => {
  assert.match(evidenceVideoPrompt({description:'a'.repeat(3100)+'仕上げの味噌・みりん・盛り付け'}), /仕上げの味噌・みりん・盛り付け/);
});
