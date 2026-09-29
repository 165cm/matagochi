import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";

// 投稿者の方への窓口（掲載停止の申し込み）。
// 申し込みをした人がチャンネルの持ち主かは、ここでは確かめられない。だから申し込みだけでは停止を「確定」しない：
//   pending   … 申し込みがあったチャンネル。確認が済むまで、念のため「新着」「みんなの定番」から一時的に外す（一時対応）
//   confirmed … 運営が確かめて停止を確定したチャンネル（以前の版で外したチャンネル `channels` もここ。外したまま）
//   restored  … 運営が確かめて、掲載に戻したチャンネル。そのあとの確認前の申し込みは記録するが、自動では外さない
// 状態を変えられるのは管理者だけ（/api/admin/creators）。利用者が自分で取り込んだレシピには影響しない。
// 本人確認済みの投稿者が自分のチャンネルを管理する仕組み（持ち主の確認）は、この後のPRで足す。
const KEY = "creators/optout";
const clean = (s, n) => String(s || "").slice(0, n);
function readDoc(entry) {
  const doc = entry?.envelope || {};
  return { channels: { ...(doc.channels || {}) }, pending: { ...(doc.pending || {}) }, restored: { ...(doc.restored || {}) } };
}
export function createCreatorDesk(store, { resolveChannel, now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let cache = null;
  const iso = () => new Date(now()).toISOString();
  // 1つの文書を読み直しながら書く（同時の申し込み・審査でも、片方を消さない）。
  async function update(change) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const entry = await store.get(KEY);
      const doc = readDoc(entry);
      const out = change(doc);
      if (out === undefined) return doc;
      if (await store.put(KEY, doc, { ifGeneration: entry?.generation ?? 0 })) { cache = null; return out; }
    }
    throw new ApiError(409, "creators_busy", "混み合っています。少し待ってからお試しください。");
  }
  async function optedOut() {
    if (!store) return new Set();
    if (cache && cache.until > now()) return cache.value;
    const doc = readDoc(await store.get(KEY));
    // 確定した停止と、確認待ちの一時対応の両方を外す。
    cache = { value: new Set([...Object.keys(doc.channels), ...Object.keys(doc.pending)]), until: now() + 5 * 60_000 };
    return cache.value;
  }
  return {
    optedOut,
    async request({ channel, message = "", contact = "" } = {}) {
      required();
      const target = String(channel || "").trim().slice(0, 300);
      if (!target) throw new ApiError(400, "channel_required", "チャンネルか動画のURLを入れてください。");
      const found = await resolveChannel(target).catch(() => null);
      if (!found?.channelId) throw new ApiError(404, "channel_not_found", "チャンネルが見つかりませんでした。チャンネルのURLか、動画のURLを入れてください。");
      const id = found.channelId, title = clean(found.title, 200), at = iso();
      const status = await update((doc) => {
        if (doc.channels[id]) return "confirmed";
        if (doc.restored[id]) { doc.restored[id] = { ...doc.restored[id], requests: (doc.restored[id].requests || 0) + 1, lastAt: at }; return "review"; }
        doc.pending[id] = { title, at: doc.pending[id]?.at || at, lastAt: at, requests: (doc.pending[id]?.requests || 0) + 1 };
        return "pending";
      });
      await store.put(`creators/requests/${at.slice(0, 10)}-${randomUUID()}`, { channelId: id, title, input: target, message: clean(message, 1000), contact: clean(contact, 200), status, at }, { ifGeneration: 0 });
      // removed：いま「新着」「みんなの定番」から外れているか（以前の版の画面もこの項目を見る）。
      return { channelId: id, title, status, removed: status !== "review" };
    },
    // 管理者：確認待ち・確定・戻したチャンネルの一覧。
    async list() {
      required();
      const doc = readDoc(await store.get(KEY));
      const rows = (group) => Object.entries(doc[group]).map(([channelId, v]) => ({ channelId, ...v })).sort((a, b) => String(b.lastAt || b.at || "").localeCompare(String(a.lastAt || a.at || "")));
      return { pending: rows("pending"), confirmed: rows("channels"), restored: rows("restored") };
    },
    // 管理者：確かめた結果。confirm＝停止を確定、restore＝掲載に戻す（確定したものを戻すこともできる）。
    async decide(channelId, { decision, note = "" } = {}) {
      required();
      if (!/^UC[\w-]{22}$/.test(String(channelId || "")) || !["confirm", "restore"].includes(decision)) throw new ApiError(400, "invalid_decision", "チャンネルIDと判断（confirm か restore）を送ってください。");
      const at = iso();
      return update((doc) => {
        const before = doc.pending[channelId] || doc.channels[channelId] || doc.restored[channelId];
        if (!before) throw new ApiError(404, "channel_not_requested", "このチャンネルへの申し込みはありません。");
        const title = before.title || "";
        delete doc.pending[channelId];
        if (decision === "confirm") { delete doc.restored[channelId]; doc.channels[channelId] = { title, at: before.at || at, confirmedAt: at, ...(note ? { note: clean(note, 500) } : {}) }; }
        else { delete doc.channels[channelId]; doc.restored[channelId] = { title, at: before.at || at, restoredAt: at, requests: 0, ...(note ? { note: clean(note, 500) } : {}) }; }
        return { channelId, status: decision === "confirm" ? "confirmed" : "restored" };
      });
    }
  };
}
