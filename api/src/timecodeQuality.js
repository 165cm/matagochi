// 構造の点検。映像の作業場面との一致は管理者が別途確認する。
export function timecodeIssues(steps = [], times = [], durationSeconds = null) {
  const issues = []; let previous = null;
  steps.forEach((step, i) => {
    if (!String(step || '').trim()) return;
    const t = times[i];
    if (t === null || t === undefined) return;
    if (!Number.isFinite(t) || t < 0) { issues.push({code:'invalid',step:i}); return; }
    if (previous !== null && t < previous) issues.push({code:'order',step:i});
    if (previous !== null && t === previous) issues.push({code:'same',step:i});
    if (durationSeconds > 0 && t >= durationSeconds) issues.push({code:'beyond',step:i});
    previous = t;
  });
  return issues;
}
export function qualitySummary(rows) {
  return { checked: rows.length, needsReview:rows.filter(r=>r.issues.length).length,
    structurePassed:rows.filter(r=>!r.issues.length).length,
    reviewed:rows.filter(r=>r.reviewed).length, unreviewed:rows.filter(r=>!r.reviewed).length,
    durationUnknown:rows.filter(r=>!r.durationKnown).length, rows };
}
