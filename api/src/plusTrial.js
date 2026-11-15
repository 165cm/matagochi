import { ApiError } from "./errors.js";

// リピごちプラスの無料お試し（2026-11-15。docs/FREE_PAID_BOUNDARY.md・APP_MAP §75）。
// お金を払うのは献立を考える本人なので、お試しは本人（ログインしたアカウント）ごとに1回。開始と終了はサーバーで持つ
// （端末の時計・入れ直し・別の端末で延びない）。
// ・長さ：始めた日から次の月曜までの半端な日＋月曜から2週間（アプリの trialPlan と同じ）
// ・延長：1回だけ、最大2週間。終わる3日前から、終わって30日までに頼める（「続けない」を選んだ人に出す）
// ・ログインする前に端末で始めていたお試しは、始めた日を引き継ぐ（30日より前の日は受け取らない）。もうあるお試しは上書きしない
const DAY = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TRIAL_EXTEND_DAYS = 14;
const EXTEND_FROM_DAYS_BEFORE = 3;
const EXTEND_UNTIL_DAYS_AFTER = 30;
const CARRY_MAX_DAYS = 30;

// 日付は日本の暦で数える（サーバーの時計は UTC）。
export const tokyoDate = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export function trialEndOf(start) {
  let monday = start;
  while (dow(monday) !== 1) monday = addDays(monday, 1);
  return addDays(monday, 13);
}

export function createPlusTrials(store, { now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "plus_not_configured", "お試しの保存先が未設定です。"); };
  const key = (uid) => `plus/trials/${uid}`;
  const view = (t, today = tokyoDate(now())) => {
    if (!t) return { trial: null, today, canExtend: false };
    const canExtend = !t.extended && daysBetween(today, t.end) <= EXTEND_FROM_DAYS_BEFORE && daysBetween(t.end, today) <= EXTEND_UNTIL_DAYS_AFTER;
    return { trial: { start: t.start, end: t.end, extended: !!t.extended }, today, active: today <= t.end, canExtend };
  };
  async function update(uid, change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.get(key(uid));
      const next = change(entry?.envelope || null);
      if (!next) return entry?.envelope || null;
      if (await store.put(key(uid), next, { ifGeneration: entry?.generation ?? 0 })) return next;
    }
    throw new ApiError(429, "plus_busy", "混雑しています。もう一度お試しください。");
  }
  return {
    async status(uid) {
      required();
      return view((await store.get(key(uid)))?.envelope || null);
    },
    // お試しを始める（何度呼んでも同じ）。from：ログインの前に端末で始めていた日（30日より前・未来の日は使わない）
    async start(uid, body = {}) {
      required();
      const today = tokyoDate(now());
      const from = typeof body.from === "string" && DATE_RE.test(body.from) && body.from <= today && daysBetween(body.from, today) <= CARRY_MAX_DAYS ? body.from : today;
      const t = await update(uid, (cur) => (cur ? null : { start: from, end: trialEndOf(from), extended: false, createdAt: new Date(now()).toISOString() }));
      return view(t, today);
    },
    // 1回だけの延長（最大2週間）。まだ終わっていなければ終わりの日から、終わっていれば今日から数える
    async extend(uid) {
      required();
      const today = tokyoDate(now());
      const t = await update(uid, (cur) => {
        if (!cur) throw new ApiError(404, "trial_not_started", "お試しがまだ始まっていません。");
        const v = view(cur, today);
        if (cur.extended) throw new ApiError(409, "trial_already_extended", "お試しの延長は1回までです。");
        if (!v.canExtend) throw new ApiError(409, "trial_extend_not_yet", "延長は、お試しが終わる3日前から頼めます。");
        const base = cur.end >= today ? cur.end : addDays(today, -1);
        return { ...cur, end: addDays(base, TRIAL_EXTEND_DAYS), extended: true, extendedAt: new Date(now()).toISOString() };
      });
      return view(t, today);
    },
  };
}
