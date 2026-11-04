// 読み取り専用。AI・時刻探索POSTは呼ばない。公開一覧の状態と実行履歴を混同しない。
import { writeFile } from 'node:fs/promises';
import { sampleRecipes } from '../api/src/timecodeSample.js';

async function main() {
  const api = process.env.API || 'https://matagochi-api-292190013809.us-central1.run.app';
  async function get(path) {
    const res = await fetch(api + path, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  const listing = await get('/api/trends');
  const rows = [];
  for (const r of sampleRecipes(listing.items || [])) {
    let detail, error;
    try { detail = await get(`/api/recipes/youtube-${r.videoId}`); } catch (e) { error = e.message; }
    const recipe = detail?.steps ? detail : r;
    const steps = recipe.steps || [];
    rows.push({ videoId: r.videoId, title: r.title, channel: r.channelTitle, steps: steps.length,
      timed: steps.filter((s,i) => s && Number.isFinite(recipe.stepTimes?.[i])).length,
      analyzedFrom: recipe.analyzedFrom || r.analyzedFrom || 'unknown', source: recipe.stepTimesFrom || r.stepTimesFrom || 'unknown',
      executionReason: 'unknown_public_api_has_no_attempt_history', ...(error ? { readError: error } : {}) });
  }
  const report = { at: new Date().toISOString(), population: listing.items.length, sample: rows.length,
    method: '35 none / 10 partial / 5 full; channel round-robin; descriptive sample, not population success estimate',
    aiCalls: 0, aiYen: 0, rows };
  await writeFile(process.argv[2] || 'timecode-audit.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ population: report.population, sample: rows.length, full: rows.filter(r=>r.timed===r.steps).length, part: rows.filter(r=>r.timed>0 && r.timed<r.steps).length, none: rows.filter(r=>!r.timed).length, readErrors: rows.filter(r=>r.readError).length, aiYen: 0 }));
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) await main();
