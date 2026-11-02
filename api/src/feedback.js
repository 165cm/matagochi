import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";

// ご意見・お問い合わせ。β版の「お気持ち」から送ってくれた人には、正式版で3か月無料の招待コードを届ける。
// 日ごとに1つの文書へ追記する（1日500件まで・1家庭1日5件まで）。読むのは管理者だけ。
export const FEEDBACK_PER_DAY = 5;
export const OBJECTION_PER_DAY = 20;
export const OBJECTION_CATEGORIES = ["servings", "ingredients", "steps", "times", "other"];
const DAY_CAP = 500;
const text = (v, n) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, n) : "");
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function createFeedbackDesk(store, { now = Date.now } = {}) {
  const dayKey = (day) => `feedback/${day}`;
  async function update(key, change) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const entry = await store.get(key);
      const next = change(entry ? structuredClone(entry.envelope) : null);
      if (!next) return null;
      if (await store.put(key, next, { ifGeneration: entry?.generation ?? 0 })) return next;
    }
    throw new ApiError(429, "feedback_busy", "混み合っています。少し待ってお試しください。");
  }
  return {
    async send(body, household = "") {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const message = text(body?.message, 2000);
      if (message.length < 2) throw new ApiError(400, "feedback_empty", "ご意見を入力してください。");
      const contact = text(body?.contact, 254);
      if (contact && !EMAIL_RE.test(contact)) throw new ApiError(400, "invalid_email", "メールアドレスを確かめてください。");
      const day = new Date(now()).toISOString().slice(0, 10);
      const id = randomUUID().slice(0, 8);
      await update(dayKey(day), (doc) => {
        const items = doc?.items || [];
        if (items.length >= DAY_CAP) throw new ApiError(429, "feedback_limit", "今日はたくさんのご意見をいただいています。明日またお送りください。");
        if (household && items.filter((x) => x.household === household).length >= FEEDBACK_PER_DAY) throw new ApiError(429, "feedback_limit", "今日はここまでです。明日またお送りください。");
        return { items: [...items, { id, at: new Date(now()).toISOString(), household: text(household, 128), contact, where: text(body?.where, 40), version: text(body?.version, 40), message }] };
      });
      await update("feedback/days", (doc) => (doc?.days?.includes(day) ? null : { days: [...(doc?.days || []), day].slice(-400) })).catch(() => {});
      return { ok: true, id };
    },
    // 「⚡️ 異議あり」：レシピの間違い（人数・材料・手順・時刻）の知らせ。construction2nd の「異議あり」をまねた（APP_MAP §52-11）。
    // 日ごとに1つの文書へ追記（1日500件まで・1家庭1日20件まで）。読むのは管理者だけ。
    async objection(body, household = "") {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const category = OBJECTION_CATEGORIES.includes(body?.category) ? body.category : "";
      if (!category) throw new ApiError(400, "invalid_category", "どこが違うかを選んでください。");
      const videoId = typeof body?.videoId === "string" && /^[\w-]{11}$/.test(body.videoId) ? body.videoId : "";
      const title = text(body?.title, 120);
      if (!videoId && !title) throw new ApiError(400, "invalid_recipe", "レシピがわかりません。");
      const count = (v) => (Number.isInteger(v) && v > 0 && v <= 100 ? v : null);
      const servings = category === "servings" ? { shown: count(body?.servings?.shown), by: body?.servings?.by === "manual" ? "manual" : "", suggested: count(body?.servings?.suggested) } : undefined;
      const comment = text(body?.comment, 500);
      if (category === "other" && comment.length < 2) throw new ApiError(400, "objection_empty", "どこが違うか、ひとこと書いてください。");
      const day = new Date(now()).toISOString().slice(0, 10);
      const id = randomUUID().slice(0, 8);
      await update(`objections/${day}`, (doc) => {
        const items = doc?.items || [];
        if (items.length >= DAY_CAP) throw new ApiError(429, "objection_limit", "今日はたくさんの知らせをいただいています。明日またお送りください。");
        if (household && items.filter((x) => x.household === household).length >= OBJECTION_PER_DAY) throw new ApiError(429, "objection_limit", "今日はここまでです。明日またお送りください。");
        return { items: [...items, { id, at: new Date(now()).toISOString(), status: "open", household: text(household, 128), videoId, title, category, ...(servings ? { servings } : {}), comment, where: text(body?.where, 40), version: text(body?.version, 40) }] };
      });
      await update("objections/days", (doc) => (doc?.days?.includes(day) ? null : { days: [...(doc?.days || []), day].slice(-400) })).catch(() => {});
      return { ok: true, id };
    },
    // 管理者：異議の一覧（day なしなら日の一覧）と、対応済み・戻す。
    async objections(day = "") {
      if (!day) return { days: (await store.get("objections/days"))?.envelope.days || [] };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(400, "invalid_day", "日付は YYYY-MM-DD です。");
      return { day, items: (await store.get(`objections/${day}`))?.envelope.items || [] };
    },
    async closeObjection(day, id, status = "done") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[a-f0-9]{8}$/.test(id) || !["open", "done"].includes(status)) throw new ApiError(400, "invalid_objection", "知らせの指定が正しくありません。");
      let found = null;
      await update(`objections/${day}`, (doc) => {
        const items = doc?.items || [];
        const i = items.findIndex((x) => x.id === id);
        if (i < 0) throw new ApiError(404, "objection_not_found", "知らせが見つかりません。");
        found = { ...items[i], status, ...(status === "done" ? { doneAt: new Date(now()).toISOString() } : { doneAt: undefined }) };
        if (items[i].status === status) return null;
        return { items: items.map((x, k) => (k === i ? found : x)) };
      });
      return { ok: true, item: found };
    },
    // 管理者：日ごと（day なしなら日の一覧）。
    async list(day = "") {
      if (!day) return { days: (await store.get("feedback/days"))?.envelope.days || [] };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new ApiError(400, "invalid_day", "日付は YYYY-MM-DD です。");
      return { day, items: (await store.get(dayKey(day)))?.envelope.items || [] };
    }
  };
}
