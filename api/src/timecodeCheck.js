// 手順の時刻（▶ 2:15）の0円の点検（2026-10-03 のユーザーの判断：まず0円の点検で「要確認」を出し、手で直せる量かを見る）。
// AI も YouTube の検索も使わない。動画の長さ（videos.list・50本で1単位）が分かれば、それも使う。
export const CHECK_ORDER_SLACK = 5; // 前の手順より5秒以上前に戻っていたら（ちょうど5秒も）「順番が逆」
export const CHECK_CLIP_SECONDS = 600; // AI が動画から探す時は最初の10分だけを見ている（timecodes.js maxSeconds）
export const CHECK_CLUSTER_SECONDS = 30; // 4手順以上の時刻が30秒の中に固まっていたら「固まりすぎ」
export const STEPS_CUT_OLD = 10; // 以前は手順を10個で切っていた（2026-10-03 に30へ）

export const ISSUE_LABEL = {
  order: "時刻が手順の順に並んでいない",
  same: "前の手順と同じ時刻",
  coarse: "説明欄の章が大まか（いくつかの手順が同じ章の時刻）",
  beyond: "動画の長さを超えている",
  clip: "AI が見ていない後半の手順に時刻がない（以前は最初の10分だけを見ていた）",
  sparse: "時刻のない手順が半分より多い",
  cluster: "時刻が短い間に固まっている",
  steps10: "手順がちょうど10個（以前の上限で切れているかも）",
};

const num = (t) => (t === null || t === undefined || t === "" || !Number.isFinite(Number(t)) ? null : Number(t));

// steps と times（手順と同じ並び）から、要確認の理由を返す。status：ok（▶ があって問題なし）／warn（要確認）／none（▶ がない）。
// seenSeconds：AI が動画のどこまでを見たか（保存した時刻にある時。なければ以前の10分）。
export function checkStepTimes(steps = [], times = [], { durationSeconds = null, source = "", seenSeconds = null } = {}) {
  const list = (Array.isArray(steps) ? steps : []).map((s) => String(s || ""));
  const t = list.map((_, i) => num(Array.isArray(times) ? times[i] : null));
  const issues = [];
  const add = (code, step = null) => { if (!issues.some((x) => x.code === code && x.step === step)) issues.push({ code, ...(step !== null ? { step } : {}) }); };
  if (list.length === STEPS_CUT_OLD) add("steps10");
  const found = t.filter((x) => x !== null);
  if (!found.length) return { status: issues.length ? "warn" : "none", issues, found: 0, steps: list.length };
  // 説明欄の章の時刻は、章が手順より大まかだと、いくつかの手順が同じ章の始まりを指す（間違いではない）。
  // 「同じ時刻」「固まり」は要確認にせず、「大まか」（情報）として数える（2026-10-04：点検の76品の多くがこれだった）。
  const chapters = source === "chapters";
  let prev = null, sameCount = 0;
  t.forEach((x, i) => {
    if (x === null) return;
    if (prev !== null && x + CHECK_ORDER_SLACK <= prev) add("order", i);
    else if (prev !== null && x === prev && list[i] !== list[i - 1]) { if (chapters) sameCount += 1; else add("same", i); }
    if (Number.isFinite(durationSeconds) && durationSeconds > 0 && x >= durationSeconds) add("beyond", i);
    prev = x;
  });
  if (found.length * 2 < list.filter(Boolean).length) add("sparse");
  // AI が最初の10分だけを見た時：10分を超える動画（長さが分からない時も）で、最後の時刻が10分の手前・その後の手順に時刻がない。
  const lastIdx = t.reduce((a, x, i) => (x !== null ? i : a), -1);
  const seen = seenSeconds > 0 ? seenSeconds : CHECK_CLIP_SECONDS;
  if (source === "video" && lastIdx < list.length - 1 && Math.max(...found) < seen && (!(durationSeconds > 0) || durationSeconds > seen)) add("clip");
  // どこか4つの時刻が30秒の中に固まっていたら（並べて、続く4つごとの幅を見る。一部だけの固まりも。review fix #136）。
  const sorted = [...found].sort((a, b) => a - b);
  // 固まりは章でも数える（章なら要確認にせず「大まか」に入れる。review fix #137）。
  let packed = false;
  for (let i = 0; i + 3 < sorted.length; i++) if (sorted[i + 3] - sorted[i] < CHECK_CLUSTER_SECONDS) { packed = true; break; }
  if (packed && !chapters) add("cluster");
  // coarse：章の時刻で「同じ時刻」の数（固まりだけの時は1以上にする）。
  const coarse = chapters && (sameCount || packed) ? Math.max(sameCount, 1) : 0;
  return { status: issues.length ? "warn" : "ok", issues, found: found.length, steps: list.length, ...(coarse ? { coarse } : {}) };
}
