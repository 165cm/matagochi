// 手順の時刻（▶ 2:15）の0円の点検（2026-10-03 のユーザーの判断：まず0円の点検で「要確認」を出し、手で直せる量かを見る）。
// AI も YouTube の検索も使わない。動画の長さ（videos.list・50本で1単位）が分かれば、それも使う。
import { parseTimeValue } from "./chapters.js";

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
  unseen: "AI が見た範囲より後の時刻（根拠がない）",
  sparse: "時刻のない手順が半分より多い",
  cluster: "時刻が短い間に固まっている",
  steps10: "手順がちょうど10個（以前の上限で切れているかも）",
};

const num = (t) => (t === null || t === undefined || t === "" || !Number.isFinite(Number(t)) ? null : Number(t));

// 手順の文の長さや調理動作から、その手順にかかる相対的な重みを見積もる（同じ章時刻の分割や補間に使う）。
export function stepWeight(step) {
  const s = String(step || "").trim();
  if (!s) return 0;
  const action = /(切る|炒める|焼く|煮る|揚げる|茹でる|ゆでる|蒸す|混ぜる|こねる|包む|盛る|漬ける|冷やす|温める)/.test(s) ? 15 : 0;
  return 10 + Math.min(60, s.length) + action;
}

// 0円の自動補正：順番の逆転（order）・同じ時刻の重複（same/coarse）・動画長超過（beyond）・30秒内の密集（cluster）・空白（fillGaps時）を
// 前後の確かな時刻と手順の重み（文字量・動作）から按分して滑らかに整える。
export function refineStepTimes(steps = [], times = [], { durationSeconds = null, fillGaps = false } = {}) {
  const list = (Array.isArray(steps) ? steps : []).map((s) => String(s || "").trim());
  const n = list.length;
  if (!n) return [];
  const dur = Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.floor(durationSeconds) : null;
  const t = list.map((s, i) => (!s ? null : parseTimeValue(Array.isArray(times) ? times[i] : null)));
  if (!t.some((x) => x !== null)) return t;

  const needsFill = new Set();

  // 1. 動画の長さを超えている時刻（beyond）を補間対象にする
  if (dur !== null) {
    t.forEach((x, i) => {
      if (x !== null && x >= dur) {
        t[i] = null;
        needsFill.add(i);
      }
    });
  }

  // 2. 順番の逆転（前の時刻より小さい）があれば、最長非減少部分列（LNDS）を残して外れ値を補間対象にする
  const validIdx = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
  if (validIdx.length >= 2) {
    let hasInversion = false;
    for (let k = 1; k < validIdx.length; k++) {
      if (t[validIdx[k]] < t[validIdx[k - 1]]) { hasInversion = true; break; }
    }
    if (hasInversion) {
      const m = validIdx.length;
      const dp = new Array(m).fill(1);
      const prev = new Array(m).fill(-1);
      let bestEnd = 0;
      for (let i = 1; i < m; i++) {
        for (let j = 0; j < i; j++) {
          if (t[validIdx[j]] <= t[validIdx[i]] && dp[j] + 1 >= dp[i]) {
            dp[i] = dp[j] + 1;
            prev[i] = j;
          }
        }
        if (dp[i] >= dp[bestEnd]) bestEnd = i;
      }
      const keep = new Set();
      for (let cur = bestEnd; cur >= 0; cur = prev[cur]) keep.add(validIdx[cur]);
      for (const idx of validIdx) {
        if (!keep.has(idx)) {
          t[idx] = null;
          needsFill.add(idx);
        }
      }
    }
  }

  // 3. 4手順以上が30秒未満に密集している場合（cluster）、先頭アンカーを残して後ろを広げる
  const afterOrder = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k + 3 < afterOrder.length; k++) {
    const i0 = afterOrder[k], i3 = afterOrder[k + 3];
    if (t[i0] !== null && t[i3] !== null && t[i3] - t[i0] < CHECK_CLUSTER_SECONDS) {
      let endIdx = k + 3;
      while (endIdx + 1 < afterOrder.length && t[afterOrder[endIdx + 1]] - t[i0] < CHECK_CLUSTER_SECONDS) endIdx += 1;
      for (let c = k + 1; c <= endIdx; c++) {
        const idx = afterOrder[c];
        t[idx] = null;
        needsFill.add(idx);
      }
      k = endIdx;
    }
  }

  // 4. 同じ時刻が続く手順（same / coarse chapters）の2番目以降を補間対象にする
  let lastSeenTime = null;
  for (let i = 0; i < n; i++) {
    if (t[i] === null) continue;
    if (lastSeenTime !== null && t[i] === lastSeenTime) {
      t[i] = null;
      needsFill.add(i);
    } else {
      lastSeenTime = t[i];
    }
  }

  // 5. fillGaps 指定時は、時刻のある手順に挟まれた空白（または全体の空白）も補間対象にする
  if (fillGaps) {
    const anchorsNow = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
    if (anchorsNow.length >= 2) {
      const firstA = anchorsNow[0], lastA = anchorsNow[anchorsNow.length - 1];
      for (let i = firstA + 1; i < lastA; i++) {
        if (list[i] && t[i] === null) needsFill.add(i);
      }
    }
    const nonEmptyCount = list.filter(Boolean).length;
    const expectedFound = t.filter((x) => x !== null).length + needsFill.size;
    if (expectedFound * 2 < nonEmptyCount) {
      for (let i = 0; i < n; i++) {
        if (list[i] && t[i] === null) needsFill.add(i);
      }
    }
  }

  if (!needsFill.size) return t;

  // 6. アンカー（確定している時刻）の間を、手順の重み（stepWeight）で按分して補間する
  const anchors = t.map((x, i) => (x !== null ? i : -1)).filter((i) => i >= 0);
  if (!anchors.length) {
    // すべて beyond 等で消えた場合は 10秒から動画長（または標準間隔）で配分
    const span = dur ? Math.max(n * 5, dur - 15) : n * 35;
    let acc = 10;
    const totalW = list.reduce((s, x) => s + stepWeight(x), 0) || 1;
    for (let i = 0; i < n; i++) {
      if (!list[i]) continue;
      t[i] = dur ? Math.min(dur - 1, Math.round(acc)) : Math.round(acc);
      acc += (span * stepWeight(list[i])) / totalW;
    }
    return t;
  }

  // (a) 最初のアンカーより前の補間
  const firstA = anchors[0];
  const leading = [];
  for (let i = 0; i < firstA; i++) if (needsFill.has(i) && list[i]) leading.push(i);
  if (leading.length) {
    const endT = t[firstA];
    const startT = Math.max(0, endT - leading.length * 25);
    const group = [...leading, firstA];
    const weights = group.map((idx) => stepWeight(list[idx]) || 10);
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    let wAcc = 0;
    for (let k = 0; k < leading.length; k++) {
      const rawT = startT + ((endT - startT) * wAcc) / totalW;
      const prevT = k === 0 ? startT : t[leading[k - 1]] + 1;
      t[leading[k]] = Math.max(0, Math.min(Math.max(0, endT - (leading.length - k)), Math.max(prevT, Math.round(rawT))));
      wAcc += weights[k];
    }
  }

  // (b) アンカーどうしの間の補間
  for (let aIdx = 0; aIdx + 1 < anchors.length; aIdx++) {
    const left = anchors[aIdx], right = anchors[aIdx + 1];
    const mid = [];
    for (let i = left + 1; i < right; i++) if (needsFill.has(i) && list[i]) mid.push(i);
    if (!mid.length) continue;
    const startT = t[left], endT = t[right];
    const span = Math.max(mid.length + 1, endT - startT);
    const group = [left, ...mid];
    const weights = group.map((idx) => stepWeight(list[idx]) || 10);
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    let wAcc = weights[0];
    for (let k = 0; k < mid.length; k++) {
      const rawT = startT + (span * wAcc) / totalW;
      const prevT = k === 0 ? startT + 1 : t[mid[k - 1]] + 1;
      const maxAllowed = Math.max(prevT, endT - (mid.length - k));
      t[mid[k]] = Math.min(maxAllowed, Math.max(prevT, Math.round(rawT)));
      wAcc += weights[k + 1];
    }
  }

  // (c) 最後のアンカーより後ろの補間
  const lastA = anchors[anchors.length - 1];
  const trailing = [];
  for (let i = lastA + 1; i < n; i++) if (needsFill.has(i) && list[i]) trailing.push(i);
  if (trailing.length) {
    const startT = t[lastA];
    const defaultSpan = (trailing.length + 1) * 35;
    const endT = dur !== null && dur > startT + 2 ? Math.min(dur - 1, startT + defaultSpan) : Math.min(35_999, startT + defaultSpan);
    const span = Math.max(trailing.length + 1, endT - startT);
    const group = [lastA, ...trailing];
    const weights = group.map((idx) => stepWeight(list[idx]) || 10);
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    let wAcc = weights[0];
    for (let k = 0; k < trailing.length; k++) {
      const rawT = startT + (span * wAcc) / totalW;
      const prevT = k === 0 ? startT + 1 : t[trailing[k - 1]] + 1;
      const clamped = dur !== null ? Math.min(dur - 1, Math.max(prevT, Math.round(rawT))) : Math.max(prevT, Math.round(rawT));
      t[trailing[k]] = Math.min(35_999, clamped);
      wAcc += weights[k + 1];
    }
  }

  return t;
}

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
  // AI が見た長さ。見た長さのない以前の保存は、最初の10分だけを見た扱い（unseen・clip で同じ値。review fix #138 r2）。
  const seen = seenSeconds > 0 ? seenSeconds : CHECK_CLIP_SECONDS;
  let prev = null, sameCount = 0;
  t.forEach((x, i) => {
    if (x === null) return;
    if (prev !== null && x + CHECK_ORDER_SLACK <= prev) add("order", i);
    else if (prev !== null && x === prev && list[i] !== list[i - 1]) { if (chapters) sameCount += 1; else add("same", i); }
    if (Number.isFinite(durationSeconds) && durationSeconds > 0 && x >= durationSeconds) add("beyond", i);
    // AI が見た長さより後の時刻は、AI が見ていない場面の時刻（動画の長さを超える時は beyond だけ。review fix #138）。
    else if (source === "video" && x >= seen) add("unseen", i);
    prev = x;
  });
  if (found.length * 2 < list.filter(Boolean).length) add("sparse");
  // AI が最初の10分だけを見た時：10分を超える動画（長さが分からない時も）で、最後の時刻が10分の手前・その後の手順に時刻がない。
  const lastIdx = t.reduce((a, x, i) => (x !== null ? i : a), -1);
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
