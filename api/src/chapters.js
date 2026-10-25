// 説明欄のタイムスタンプ（「0:00 材料」「2:15 炒める」など）を読む。投稿者がつけた正確な時刻なので、AIが動画から探すより優先する。
const STAMP = /(?:^|[\s(（【\[])((?:\d{1,2}:)?\d{1,2}:\d{2})(?=[\s)）】\]\-–—:：・|｜]|$)/;
const toSeconds = (stamp) => stamp.split(":").map(Number).reduce((total, n) => total * 60 + n, 0);

// AI や入力の時刻（「02:15」「1:02:05」「2分15秒」「135s」や秒数の数値）を秒数（0〜35999の整数）に揃える。
export function parseTimeValue(raw) {
  const val = raw && typeof raw === "object" ? (raw.time ?? raw.seconds ?? raw.start ?? null) : raw;
  if (val === null || val === undefined || val === "" || typeof val === "boolean") return null;
  if (typeof val === "number") return Number.isFinite(val) && val >= 0 && val < 36_000 ? Math.floor(val) : null;
  if (typeof val !== "string") return null;
  const s = val.normalize("NFKC").trim();
  if (!s) return null;
  const colon = s.match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})(?:\.\d+)?$/);
  if (colon) {
    const [, h, m, sec] = colon;
    if (Number(sec) >= 60) return null;
    const total = (h ? Number(h) * 3600 : 0) + Number(m) * 60 + Number(sec);
    return total >= 0 && total < 36_000 ? Math.floor(total) : null;
  }
  const jp = s.match(/^(?:(\d{1,3})\s*分)?\s*(?:(\d{1,2})\s*秒)?$/);
  if (jp && (jp[1] || jp[2])) {
    const total = Number(jp[1] || 0) * 60 + Number(jp[2] || 0);
    return total >= 0 && total < 36_000 ? Math.floor(total) : null;
  }
  const num = s.match(/^(\d+(?:\.\d+)?)\s*s?$/i);
  if (num) {
    const n = Number(num[1]);
    return Number.isFinite(n) && n >= 0 && n < 36_000 ? Math.floor(n) : null;
  }
  return null;
}

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
