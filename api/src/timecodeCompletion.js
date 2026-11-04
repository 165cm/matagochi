import { parseChapters, timesFromChapterIndexes, parseTimeValue } from './chapters.js';
import { formatTranscriptForPrompt, resolveTranscriptTimes } from './transcript.js';

// 既存値を動かさず、空いている位置だけに根拠のある候補を入れる。補間はしない。
export function mergeMissingTimes(steps, existing, proposed, duration) {
  const out = steps.map((s,i) => s && Number.isFinite(existing?.[i]) ? existing[i] : null);
  for (let i = 0; i < steps.length; i++) {
    if (!steps[i] || out[i] !== null) continue;
    const t = parseTimeValue(proposed?.[i]);
    if (t === null || !(duration > 0) || t >= duration) continue;
    const prev = out.slice(0,i).filter(Number.isFinite).at(-1);
    const next = out.slice(i+1).find(Number.isFinite);
    if ((prev !== undefined && t <= prev) || (next !== undefined && t >= next)) continue;
    out[i] = t;
  }
  return out;
}
export const timedCount = (steps, times) => steps.filter((s,i) => String(s || '').trim() && Number.isFinite(times?.[i])).length;

// 呼び出し元が永続の排他・予算を確保する。手順は書き換えず、残った穴だけを次の経路へ送る。
export async function completeStepTimes({ url, videoId, steps, stepTimes, source, stepTimeSources, durationSeconds, description }, deps) {
  let times = [...stepTimes], sources = steps.map((s,i) => Number.isFinite(times[i]) ? (stepTimeSources?.[i] || source) : null);
  const stages = [];
  const full = () => timedCount(steps, times) === steps.filter(Boolean).length;
  const merge = (proposed, from) => {
    const next = mergeMissingTimes(steps, times, proposed, durationSeconds);
    next.forEach((t,i) => { if (times[i] === null && t !== null) sources[i] = from; });
    times = next;
  };
  if (!(durationSeconds > 0) || durationSeconds > 1800) return { stepTimes: times, sources, stages, reason: durationSeconds > 1800 ? 'duration_unsupported' : 'duration_unknown' };
  if (full()) return { stepTimes: times, sources, stages, reason: 'complete' };
  const missingSteps = () => steps.map((s,i) => Number.isFinite(times[i]) ? '' : s);
  try {
    const transcript = await deps.fetchTranscript(videoId);
    stages.push({ stage: 'transcript_fetch', status: transcript?.status || 'unknown', reason: transcript?.reason || transcript?.error || '' });
    if (transcript?.status === 'ok' && transcript.items?.length) {
      const { text, cues, truncated } = formatTranscriptForPrompt(transcript.items, { maxSeconds: durationSeconds });
      const raw = await deps.paid('transcript', () => deps.matchTranscript(missingSteps(), text));
      merge(resolveTranscriptTimes(cues, raw).stepTimes, 'transcript');
      stages.push({ stage: 'transcript_match', timed: timedCount(steps,times), truncated });
    }
    if (!full()) {
      const chapters = parseChapters(description);
      if (chapters.length) {
        const raw = await deps.paid('chapters', () => deps.matchChapters(missingSteps(), chapters));
        merge(timesFromChapterIndexes(raw?.chapterIndex, chapters, steps.length), 'chapters');
        stages.push({ stage: 'chapters', timed: timedCount(steps,times) });
      }
    }
    if (!full()) {
      const raw = await deps.paid('video', () => deps.analyze(url, missingSteps(), { durationSeconds, clipSeconds: null, beforeRetry: () => { throw Object.assign(new Error('retry deferred'), { code: 'retry_deferred' }); } }));
      merge(raw?.stepTimes, 'video');
      stages.push({ stage: 'video', timed: timedCount(steps,times) });
    }
    return { stepTimes: times, sources, stages, reason: full() ? 'complete' : 'partial_or_no_match' };
  } catch (error) {
    return { stepTimes: times, sources, stages, reason: error?.code || 'temporary_error' };
  }
}
