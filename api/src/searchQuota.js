import { ApiError } from "./errors.js";

// YouTube の検索（search.list）の1日の枠を、プロジェクト全体で1つの数で守る（2026-10-03・review fix #131）。
// YouTube 側の1日は太平洋時間の0時に切り替わる。search.list は既定で1日100回まで（ほかの API とは別の枠）。
// 呼ぶ直前に1回分を予約する（保存できなければ呼ばない）。一括収集（seed）は、毎日の新着集め・チャンネル検索・ほかの作り方の分を残して使う。
export const YT_SEARCH_PER_DAY = 95; // 100回のうち5回は余裕に残す
export const YT_SEARCH_KEEP_FOR_OTHERS = 30; // 一括収集が使わずに残す回数（毎日の新着集め9回・チャンネル検索5回・ほかの作り方）

const PACIFIC = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
// 太平洋時間の日付（YYYY-MM-DD）。
export const pacificDay = (ms) => PACIFIC.format(new Date(ms));
// 次に太平洋時間の0時になる時刻（ms）。夏時間の切り替えも Intl に任せる（1時間ずつ進めて日付が変わる所を探す）。
export function nextPacificMidnight(ms) {
  const today = pacificDay(ms);
  let t = Math.floor(ms / 3_600_000) * 3_600_000;
  // 太平洋時間は UTC から時の単位でずれるので、日付が変わった最初の「ちょうどの時」が0時。
  for (let i = 0; i < 30 && pacificDay(t) === today; i++) t += 3_600_000;
  return t;
}

export function createSearchQuota(store, { now = Date.now, perDay = YT_SEARCH_PER_DAY, keepForOthers = YT_SEARCH_KEEP_FOR_OTHERS } = {}) {
  const KEY = "youtube/search-quota";
  const read = async () => {
    const entry = await store.get(KEY);
    const day = pacificDay(now());
    const doc = entry?.envelope?.day === day ? entry.envelope : { day, n: 0, by: {} };
    return { entry, doc };
  };
  const api = {
    // 1回分を予約する。kind が "seed" の時は、ほかの分（keepForOthers）を残す。予約できたら true。
    async take(kind = "other") {
      const cap = kind === "seed" ? perDay - keepForOthers : perDay;
      for (let attempt = 0; attempt < 3; attempt++) {
        let entry, doc;
        try { ({ entry, doc } = await read()); } catch { return false; }
        if (doc.n >= cap) return false;
        const next = { day: doc.day, n: doc.n + 1, by: { ...doc.by, [kind]: (doc.by?.[kind] || 0) + 1 } };
        let ok;
        try { ok = await store.put(KEY, next, { ifGeneration: entry?.generation ?? 0 }); } catch { return false; }
        if (ok) return true;
      }
      return false;
    },
    async status() {
      const { doc } = await read().catch(() => ({ doc: { day: pacificDay(now()), n: 0, by: {} } }));
      return { day: doc.day, used: doc.n, by: doc.by || {}, perDay, seedCap: perDay - keepForOthers, resetAt: new Date(nextPacificMidnight(now())).toISOString() };
    },
    // search 関数を包む：呼ぶ前に予約。予約できなければ ApiError（429）。opts.quotaKind で種類を分ける（YouTube には送らない）。
    wrap(search, kind = "other") {
      return async (q, opts = {}) => {
        const { quotaKind, ...rest } = opts || {};
        if (!(await api.take(quotaKind || kind))) throw new ApiError(429, "youtube_search_quota", "今日の YouTube の検索はここまでです。あとでまた試してください。");
        return search(q, rest);
      };
    },
  };
  return api;
}
