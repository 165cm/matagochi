import { ApiError } from "./errors.js";

// 1日の上限（2026-10-28 のユーザーの判断で、チケットの仕組みをやめて置き換えた）。
// 動画の読み取り・献立の絵など、AI の費用がかかる操作を、家庭（同期ルームか端末）ごとに1日 limit 回まで数える。
// 日の区切りは日本時間の0時。配る・買う・ためるはない。使いすぎを防ぐためだけ。
// 以前の財布（tickets/家庭 に残っている枚数）は読まない。次に使った時に、その日の回数で書きかえる。
const DAY = 86_400_000;
const JST = 9 * 3_600_000;
export const DAILY_USES = 10;

export function createTicketBook(store, { now = Date.now, limit = DAILY_USES } = {}) {
  const key = (household) => `tickets/${household}`;
  const today = () => new Date(now() + JST).toISOString().slice(0, 10);
  const usedToday = (w) => (w?.day === today() ? Math.max(0, Number(w.used) || 0) : 0);
  // 次の日本時間0時（UTC の文字列）。
  const resetsAt = () => new Date(Date.parse(`${today()}T00:00:00Z`) - JST + DAY).toISOString();
  function view(wallet, unlimited = false) {
    const used = usedToday(wallet);
    return { used, limit, left: Math.max(0, limit - used), day: today(), resetsAt: resetsAt(), unlimited };
  }
  async function read(household) {
    if (!store) throw new ApiError(503, "catalog_not_configured", "回数の保存先が未設定です。");
    if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
    const entry = await store.get(key(household));
    return { wallet: entry?.envelope || null, generation: entry?.generation || 0 };
  }
  // 使えるのは、登録した家庭だけ（get で作る。新しい家庭は接続元ごとに1日10個まで＝server.js）。
  // 家庭の識別子を作り直して回数を増やせないように。
  async function update(household, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { wallet, generation } = await read(household);
      if (!wallet) throw new ApiError(429, "wallet_limit", "準備ができませんでした。しばらくしてからお試しください。");
      const next = change({ day: today(), used: usedToday(wallet) });
      if (!next) return wallet || { day: today(), used: 0 };
      if (await store.put(key(household), next, { ifGeneration: generation })) return next;
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  return {
    view,
    // created は、新しい家庭の数を接続元ごとに抑えるため（server.js）。
    async get(household, { unlimited = false, create = true } = {}) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { wallet } = await read(household);
        if (wallet) return { ...view(wallet, unlimited), created: false };
        if (!create) throw new ApiError(429, "wallet_limit", "準備ができませんでした。しばらくしてからお試しください。");
        const fresh = { day: today(), used: 0 };
        if (await store.put(key(household), fresh, { ifGeneration: 0 })) return { ...view(fresh, unlimited), created: true };
      }
      throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
    },
    // count 回まとめて使う。上限をこえるなら1回も使わない。
    async spend(household, { unlimited = false, count = 1 } = {}) {
      if (unlimited) return null;
      if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
      return update(household, (w) => {
        if (w.used + count > limit) throw new ApiError(429, "daily_limit", `今日の上限（${limit}回）に達しました。明日また使えます。`);
        return { day: w.day, used: w.used + count };
      });
    },
    // 失敗した時は、使った回数を戻す（その日のうちだけ）。
    async refund(household, { unlimited = false, count = 1 } = {}) {
      if (unlimited || !household) return null;
      return update(household, (w) => (w.used ? { day: w.day, used: Math.max(0, w.used - count) } : null));
    },
    // 以前のチケットの呼び出し（古い版のアプリ）。何もしない。
    async claim(household) {
      const { wallet } = await read(household);
      return { granted: [], wallet };
    },
    async noteImport() { return null; },
  };
}
