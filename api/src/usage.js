import { ApiError } from "./errors.js";

// 使われ方の集計（個人・家庭を特定しない）。端末ごとのランダムな番号で、1日1行：
//   何日目か（使い始めた日から）・その日に起きたこと（献立を決めた・作った・評価した…の回数）・同期しているか・家族の人数・レシピ数。
// 「1週間後にまた開いてくれているか」「ふたりの評価が何日目にたまるか」を確かめるため。設定から止められる。
export const USAGE_EVENTS = ["plan_confirmed", "plan_swapped", "plan_url_inserted", "meal_cooked", "meal_rated", "meal_skipped", "cooking_opened", "recipe_saved", "playlist_imported", "shopping_completed", "push_on", "feedback_sent", "paywall_view", "plus_view", "free_pick", "talk_started", "talk_followup", "talk_fixed", "talk_saved", "meal_replanned"];
const DAY_USERS = 20_000;
const DAY = 86_400_000;
const BUCKETS = [[0, 0], [1, 1], [2, 2], [3, 6], [7, 13], [14, 27], [28, 99999]];
const bucketOf = (n) => { const b = BUCKETS.find(([a, z]) => n >= a && n <= z); return b[0] === b[1] ? `d${b[0]}` : `d${b[0]}-${b[1] > 9999 ? "" : b[1]}`; };

export function createUsageBook(store, { now = Date.now } = {}) {
  const key = (day) => `usage/${day}`;
  return {
    async record(body) {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const anon = String(body?.anon || "");
      const day = String(body?.day || "");
      if (!/^[a-z0-9]{8,40}$/.test(anon)) throw new ApiError(400, "invalid_usage", "集計の形式が違います。");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Math.abs(Date.parse(day + "T12:00:00Z") - now()) > 2 * DAY) throw new ApiError(400, "invalid_usage", "日付が違います。");
      const n = Math.max(0, Math.min(3650, Math.floor(Number(body?.n) || 0)));
      const events = {};
      for (const name of USAGE_EVENTS) { const c = Math.floor(Number(body?.events?.[name]) || 0); if (c > 0) events[name] = Math.min(99, c); }
      const row = { n, e: events, s: body?.synced ? 1 : 0, m: Math.max(1, Math.min(9, Math.floor(Number(body?.members) || 1))), r: Math.max(0, Math.min(999, Math.floor(Number(body?.recipes) || 0))), v: String(body?.v || "").slice(0, 32) };
      for (let attempt = 0; attempt < 8; attempt++) {
        const entry = await store.get(key(day));
        const users = entry?.envelope.users || {};
        if (!users[anon] && Object.keys(users).length >= DAY_USERS) return { ok: true };
        const prev = users[anon];
        const merged = prev ? { ...row, n: Math.min(prev.n, row.n), e: Object.fromEntries(USAGE_EVENTS.map((k) => [k, Math.max(prev.e?.[k] || 0, row.e[k] || 0)]).filter(([, v]) => v)) } : row;
        if (await store.put(key(day), { users: { ...users, [anon]: merged } }, { ifGeneration: entry?.generation ?? 0 })) return { ok: true };
      }
      throw new ApiError(429, "usage_busy", "混み合っています。");
    },
    // 管理者：期間の集計。日ごとの人数、何日目ごとの人数（また開いてくれているか）、その日に作った・評価した人の割合。
    async report(from, to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new ApiError(400, "invalid_range", "from・to は YYYY-MM-DD です。");
      const days = [];
      for (let t = Date.parse(from + "T12:00:00Z"); t <= Date.parse(to + "T12:00:00Z") && days.length < 120; t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
      const byDay = [], byAge = {};
      for (const day of days) {
        const users = Object.values((await store.get(key(day)))?.envelope.users || {});
        const share = (ev) => users.length ? Math.round((users.filter((u) => u.e?.[ev]).length / users.length) * 100) : 0;
        byDay.push({ day, users: users.length, synced: users.filter((u) => u.s).length, cooked: share("meal_cooked"), rated: share("meal_rated"), decided: share("plan_confirmed"), replanned: share("meal_replanned") });
        for (const u of users) { const b = bucketOf(u.n); byAge[b] ||= { users: 0, cooked: 0, rated: 0, decided: 0 }; byAge[b].users += 1; for (const [k, ev] of [["cooked", "meal_cooked"], ["rated", "meal_rated"], ["decided", "plan_confirmed"]]) if (u.e?.[ev]) byAge[b][k] += 1; }
      }
      return { from, to, byDay, byAge };
    }
  };
}
