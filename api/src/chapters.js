// 説明欄のタイムスタンプ（「0:00 材料」「2:15 炒める」など）を読む。投稿者がつけた正確な時刻なので、AIが動画から探すより優先する。
const STAMP = /(?:^|[\s(（【\[])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=[\s)）】\]\-–—:：・|｜]|$)/;
const toSeconds = (stamp) => stamp.split(":").map(Number).reduce((total, n) => total * 60 + n, 0);

export function parseChapters(description) {
  const seen = new Set();
  const chapters = [];
  for (const line of String(description || "").split(/\r?\n/)) {
    const m = line.match(STAMP);
    if (!m) continue;
    const seconds = toSeconds(m[1]);
    const label = line.replace(m[1], "").replace(/^[\s\-–—:：・|｜)）】\]]+|[\s\-–—:：・|｜(（【\[]+$/g, "").trim().slice(0, 80);
    if (!label || seconds >= 36_000 || seen.has(seconds)) continue;
    seen.add(seconds);
    chapters.push({ seconds, label });
  }
  chapters.sort((a, b) => a.seconds - b.seconds);
  return chapters.length >= 2 ? chapters.slice(0, 60) : [];
}

// AIには章の番号だけを選ばせる（時刻を作らせない）。番号 → 章の時刻。
export function timesFromChapterIndexes(indexes, chapters, stepCount) {
  const list = Array.isArray(indexes) ? indexes : [];
  return Array.from({ length: stepCount }, (_, i) => {
    const n = Number(list[i]);
    return list[i] !== null && Number.isInteger(n) && n >= 1 && n <= chapters.length ? chapters[n - 1].seconds : null;
  });
}
