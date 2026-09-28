import { ApiError } from "./errors.js";

// チケット。家庭（同期ルームか端末）ごとにサーバーで数える。内部は半枚単位の整数（以前の0.5枚が残っている家のため）。
// 配り方：
//   ・はじめに10枚
//   ・はじめの3日で、保存した動画を3本取り込むと +5枚（1度だけ）
//   ・はじめの4週：晩ごはんを作るたびに +1枚（1週5枚・合計20枚まで）
//   ・そのあと：3回作るごとに +1枚
//   ・プラス：4週ごとに30枚（持っているのが60枚をこえない分だけ）
//   ・購入：10枚
// 購入分とプラスの分は、受け取ってから6か月で期限が切れる。使う時は、期限の近いものから。
const DAY = 86_400_000;
export const START_TICKETS = 10;
export const CHALLENGE_WEEKS = 4;
export const COOK_PER_WEEK = 5;
export const COOK_MAX = 20;
export const COOKS_PER_TICKET = 3;
export const IMPORT_BONUS = 5;
export const IMPORT_NEED = 3;
export const IMPORT_DAYS = 3;
export const PLUS_TICKETS = 30;
export const PLUS_CAP = 60;
export const PACK_TICKETS = 10;
export const EXPIRE_DAYS = 183;
const COOK_RE = /^cook-(\d{4}-\d{2}-\d{2})$/;

export function createTicketBook(store, { now = Date.now, startTickets = START_TICKETS } = {}) {
  const key = (household) => `tickets/${household}`;
  const fresh = () => ({ halves: startTickets * 2, lots: [], startedAt: new Date(now()).toISOString(), claims: {}, rewards: [], imported: {}, spent: 0 });
  const live = (w) => (w.lots || []).filter((l) => l.h > 0 && Date.parse(l.exp) > now());
  const balanceHalves = (w) => (w.halves || 0) + live(w).reduce((a, l) => a + l.h, 0);
  const reward = (w, id, n) => { w.rewards = [...(w.rewards || []), { id, n, at: new Date(now()).toISOString() }].slice(-50); };
  function cookStats(w) {
    const start = Date.parse(w.startedAt);
    const got = Object.entries(w.claims || {}).filter(([id, v]) => COOK_RE.test(id) && v?.n);
    const inChallenge = (id) => Date.parse(COOK_RE.exec(id)[1] + "T12:00:00Z") < start + CHALLENGE_WEEKS * 7 * DAY;
    const total = got.filter(([id]) => inChallenge(id)).length;
    const week = Math.floor((now() - start) / (7 * DAY));
    const weekGot = got.filter(([id]) => inChallenge(id) && Math.floor((Date.parse(COOK_RE.exec(id)[1] + "T12:00:00Z") - start) / (7 * DAY)) === week).length;
    return { challenge: now() < start + CHALLENGE_WEEKS * 7 * DAY, week, weekGot, total, perWeek: COOK_PER_WEEK, max: COOK_MAX, towardNext: (w.laterCooks || 0) % COOKS_PER_TICKET, every: COOKS_PER_TICKET };
  }
  function view(wallet, unlimited = false) {
    const start = Date.parse(wallet.startedAt);
    const lots = live(wallet).sort((a, b) => a.exp.localeCompare(b.exp));
    const importUntil = new Date(start + IMPORT_DAYS * DAY).toISOString();
    return {
      balance: balanceHalves(wallet) / 2,
      startedAt: wallet.startedAt,
      challengeEndsAt: new Date(start + CHALLENGE_WEEKS * 7 * DAY).toISOString(),
      claims: Object.keys(wallet.claims || {}).sort(),
      rewards: (wallet.rewards || []).map((r) => ({ id: r.id, n: r.n })),
      cook: cookStats(wallet),
      importBonus: { got: !!wallet.claims?.import, have: Object.keys(wallet.imported || {}).length, need: IMPORT_NEED, until: importUntil, open: now() < Date.parse(importUntil) && !wallet.claims?.import, bonus: IMPORT_BONUS },
      expiring: lots.length ? { n: lots[0].h / 2, at: lots[0].exp, total: lots.reduce((a, l) => a + l.h, 0) / 2 } : null,
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
          const moved = await store.put(key(prev), { ...old.envelope, halves: 0, lots: [], movedTo: household }, { ifGeneration: old.generation });
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
      next.lots = live(next);
      if (await store.put(key(household), next, { ifGeneration: generation })) return next;
    }
    throw new ApiError(429, "analysis_busy", "混雑しています。しばらくしてからお試しください。");
  }
  const addLot = (w, halves, kind) => { if (halves > 0) w.lots = [...live(w), { h: halves, kind, at: new Date(now()).toISOString(), exp: new Date(now() + EXPIRE_DAYS * DAY).toISOString() }]; };
  return {
    view,
    async get(household, { prev = "", unlimited = false, create = true } = {}) {
      const { wallet, created } = await load(household, prev, create);
      return { ...view(wallet, unlimited), created: !!created };
    },
    // count枚まとめて使う。足りなければ1枚も使わない。期限の近いものから使う。
    async spend(household, { unlimited = false, count = 1 } = {}) {
      if (unlimited) return null;
      if (!household) throw new ApiError(402, "no_tickets", "チケットがありません。");
      return update(household, (w) => {
        const need = 2 * count;
        if (balanceHalves(w) < need) throw new ApiError(402, "no_tickets", count > 1 ? `チケットが${count}枚いります（いま${balanceHalves(w) / 2}枚）。` : "チケットがありません。");
        let left = need;
        const lots = live(w).sort((a, b) => a.exp.localeCompare(b.exp));
        for (const l of lots) { const take = Math.min(l.h, left); l.h -= take; left -= take; if (!left) break; }
        w.lots = lots;
        w.halves -= left;
        w.spent = (w.spent || 0) + count;
        return w;
      });
    },
    async refund(household, { unlimited = false, count = 1 } = {}) {
      if (unlimited || !household) return null;
      return update(household, (w) => ({ ...w, halves: w.halves + 2 * count, spent: Math.max(0, (w.spent || 0) - count) }));
    },
    // 動画の取り込みを数える（はじめの3日だけ。取り込みボーナスのため）。
    async noteImport(household, videoId) {
      if (!household || !videoId) return null;
      return update(household, (w) => {
        if (now() > Date.parse(w.startedAt) + IMPORT_DAYS * DAY || w.imported?.[videoId] || Object.keys(w.imported || {}).length >= 20) return null;
        return { ...w, imported: { ...(w.imported || {}), [videoId]: new Date(now()).toISOString() } };
      }).catch(() => null);
    },
    // 端末からの申告：「cook-日付」（作った日）と「import」。同じものは1度だけ。条件はサーバーが決める。
    async claim(household, claims = []) {
      const granted = [];
      const wallet = await update(household, (w) => {
        w.claims ||= {};
        const start = Date.parse(w.startedAt), t = now();
        let changed = false;
        for (const raw of Array.isArray(claims) ? claims.slice(0, 16) : []) {
          const id = String(raw || "");
          if (w.claims[id]) continue;
          if (id === "import") {
            if (t > start + (IMPORT_DAYS + 1) * DAY || Object.keys(w.imported || {}).length < IMPORT_NEED) continue;
            w.claims[id] = { at: new Date(t).toISOString(), n: IMPORT_BONUS };
            w.halves += IMPORT_BONUS * 2; reward(w, id, IMPORT_BONUS); granted.push(id); changed = true;
            continue;
          }
          const m = COOK_RE.exec(id);
          if (!m) continue;
          const day = Date.parse(m[1] + "T12:00:00Z");
          // 作った日は、はじめた日の前日から今日（時差で1日ゆるめる）まで、7日前までの分だけ。
          if (Number.isNaN(day) || day < start - 2 * DAY || day > t + 1.5 * DAY || day < t - 8 * DAY) continue;
          let n = 0;
          if (day < start + CHALLENGE_WEEKS * 7 * DAY) {
            const s = cookStats(w);
            const week = Math.max(0, Math.floor((day - start) / (7 * DAY)));
            const inWeek = Object.entries(w.claims).filter(([k, v]) => COOK_RE.test(k) && v?.n && Math.max(0, Math.floor((Date.parse(COOK_RE.exec(k)[1] + "T12:00:00Z") - start) / (7 * DAY))) === week).length;
            if (inWeek < COOK_PER_WEEK && s.total < COOK_MAX) n = 1;
          } else {
            w.laterCooks = (w.laterCooks || 0) + 1;
            if (w.laterCooks % COOKS_PER_TICKET === 0) n = 1;
          }
          w.claims[id] = { at: new Date(t).toISOString(), n };
          if (n) { w.halves += 2 * n; reward(w, id, n); granted.push(id); }
          changed = true;
        }
        return changed ? w : null;
      });
      return { granted, wallet };
    },
    // プラス：4週ごとに30枚。持っているのが60枚をこえない分だけ（期限6か月）。period は決済の請求ごとのID。
    async grantPlus(household, period) {
      return update(household, (w) => {
        const id = `plus-${period}`;
        if (!period || w.claims?.[id]) return null;
        const halves = Math.max(0, Math.min(PLUS_TICKETS * 2, PLUS_CAP * 2 - balanceHalves(w)));
        addLot(w, halves, "plus");
        w.claims = { ...(w.claims || {}), [id]: { at: new Date(now()).toISOString(), n: halves / 2 } };
        if (halves) reward(w, id, halves / 2);
        return w;
      });
    },
    // 購入：10枚（期限6か月）。ref は決済のID（同じ決済で2度もらえない）。
    async grantPurchase(household, ref, count = PACK_TICKETS) {
      return update(household, (w) => {
        const id = `buy-${ref}`;
        if (!ref || w.claims?.[id]) return null;
        addLot(w, count * 2, "buy");
        w.claims = { ...(w.claims || {}), [id]: { at: new Date(now()).toISOString(), n: count } };
        reward(w, id, count);
        return w;
      });
    }
  };
}
