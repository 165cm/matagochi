import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";

// 投稿者の方への窓口：掲載停止の申し込みは、その場で「今週の人気」「みんなの定番」から外す（本人確認はしないが、外すだけなので害は小さい）。
// 申し込みの記録は残し、管理者があとで確かめられる。利用者が自分で取り込んだレシピには影響しない。
export function createCreatorDesk(store, { resolveChannel, now = Date.now } = {}) {
  const required = () => { if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let cache = null;
  async function optedOut() {
    if (!store) return new Set();
    if (cache && cache.until > now()) return cache.value;
    const doc = (await store.get("creators/optout"))?.envelope || { channels: {} };
    cache = { value: new Set(Object.keys(doc.channels || {})), until: now() + 5 * 60_000 };
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
      for (let attempt = 0; attempt < 5; attempt++) {
        const entry = await store.get("creators/optout");
        const doc = entry?.envelope || { channels: {} };
        if (doc.channels[found.channelId]) break;
        doc.channels[found.channelId] = { title: found.title || "", at: new Date(now()).toISOString() };
        if (await store.put("creators/optout", doc, { ifGeneration: entry?.generation ?? 0 })) break;
      }
      await store.put(`creators/requests/${new Date(now()).toISOString().slice(0, 10)}-${randomUUID()}`, { channelId: found.channelId, title: found.title || "", input: target, message: String(message).slice(0, 1000), contact: String(contact).slice(0, 200), at: new Date(now()).toISOString() }, { ifGeneration: 0 });
      cache = null;
      return { channelId: found.channelId, title: found.title || "", removed: true };
    }
  };
}
