import { ApiError } from "./errors.js";

// 動画読み取りのチケット。家庭（同期ルームか端末）ごとにサーバーで数える。
// 0.5枚があるので、内部では半枚単位の整数で持つ。
const DAY = 86_400_000;
export const START_TICKETS = 25;
export const CHALLENGE_WEEKS = 4;
const REWARD_HALVES = 5; // 1つの達成で2.5枚
const GRACE_DAYS = 3;

export function claimId({ week, kind, step }) { return `w${week}-${kind}-${step}`; }
const CLAIM_RE = /^w([0-3])-(plan|cook)-([12])$/;

export function createTicketBook(store, { now = Date.now, startTickets = START_TICKETS } = {}) {
  const key = (household) => `tickets/${household}`;
  const fresh = () => ({ halves: startTickets * 2, startedAt: new Date(now()).toISOString(), claims: {}, spent: 0 });
  function view(wallet, unlimited = false) {
    const start = Date.parse(wallet.startedAt);
    return {
      balance: wallet.halves / 2,
      startedAt: wallet.startedAt,
      challengeEndsAt: new Date(start + CHALLENGE_WEEKS * 7 * DAY).toISOString(),
      claims: Object.keys(wallet.claims || {}).sort(),
      earned: Object.keys(wallet.claims || {}).length * REWARD_HALVES / 2,
      spent: wallet.spent || 0,
      unlimited
    };
  }
  // 家庭の財布を読む。なければ作る。同期ルームを作った時は、それまでの端末の財布を1度だけ引き継ぐ。
  async function load(household, prev = "", create = true) {
    if (!store) throw new ApiError(503, "catalog_not_configured", "チケットの保存先が未設定です。");
    if (!household) throw new ApiError(400, "household_required", "家庭の識別子がありません。");
    for (let attempt = 0; attempt < 8; attempt++) {
      const entry = await store.get(key(household));
      if (entry) return { wallet: entry.envelope, generation: entry.generation };
      if (!create) throw new ApiError(429, "wallet_limit", "チケットの準備ができませんでした。しばらくしてからお試しください。");
      let wallet = fresh();
      if (prev && prev !== household) {
        const old = await store.get(key(prev));
        if (old && !old.envelope.movedTo) {
          const moved = await store.put(key(prev), { ...old.envelope, halves: 0, movedTo: household }, { ifGeneration: old.generation });
          if (moved) wallet = { ...old.envelope, movedTo: undefined };
        }
      }
      const created = await store.put(key(household), wallet, { ifGeneration: 0 });
      if (created) return { wallet, generation: created.generation, created: true };
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  async function update(household, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { wallet, generation } = await load(household, "", false);
      const next = change(structuredClone(wallet));
      if (!next) return wallet;
      if (await store.put(key(household), next, { ifGeneration: generation })) return next;
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  return {
    view,
    async get(household, { prev = "", unlimited = false, create = true } = {}) {
      const { wallet, created } = await load(household, prev, create);
      return { ...view(wallet, unlimited), created: !!created };
    },
    async spend(household, { unlimited = false } = {}) {
      if (unlimited) return;
      if (!household) throw new ApiError(402, "no_tickets", "チケットがありません。");
      await update(household, (w) => {
        if (w.halves < 2) throw new ApiError(402, "no_tickets", "チケットがありません。献立を決めたり作ったりすると、チケットがもらえます。");
        return { ...w, halves: w.halves - 2, spent: (w.spent || 0) + 1 };
      });
    },
    async refund(household, { unlimited = false } = {}) {
      if (unlimited || !household) return;
      await update(household, (w) => ({ ...w, halves: w.halves + 2, spent: Math.max(0, (w.spent || 0) - 1) }));
    },
    // 最初の4週間：週ごとに「献立を3日・7日決めた」「3日作った・7日そろった」で2.5枚ずつ。
    // 端末の申告を受けるが、同じ達成は1度だけ・期間内だけ・最大40枚なので、ずるをしても上限は変わらない。
    async claim(household, claims = []) {
      const granted = [];
      const wallet = await update(household, (w) => {
        const start = Date.parse(w.startedAt);
        const t = now();
        let changed = false;
        for (const raw of Array.isArray(claims) ? claims.slice(0, 16) : []) {
          const id = typeof raw === "string" ? raw : claimId(raw || {});
          const m = CLAIM_RE.exec(id);
          if (!m || w.claims[id]) continue;
          const week = Number(m[1]), kind = m[2], step = Number(m[3]);
          if (t > start + (CHALLENGE_WEEKS * 7 + GRACE_DAYS) * DAY) continue;
          // 献立は1週先まで決められる。作った記録は、その日数が過ぎてから（時差ぶん1日ゆるめる）。
          const earliest = kind === "plan" ? start + (week - 1) * 7 * DAY : start + (week * 7 + (step === 1 ? 2 : 6) - 1) * DAY;
          if (t < earliest) continue;
          w.claims[id] = new Date(t).toISOString();
          w.halves += REWARD_HALVES;
          granted.push(id);
          changed = true;
        }
        return changed ? w : null;
      });
      return { granted, wallet };
    }
  };
}
