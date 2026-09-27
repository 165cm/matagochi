import { createHash } from "node:crypto";
import { ApiError } from "./errors.js";

// 定番フォルダの「ほかの作り方を探す」：料理名でYouTubeを探す。
// 検索は1回100単位と重いので、同じ料理名は3日使い回し、1家庭1日10回まで。
export const VARIANT_SEARCHES_PER_DAY = 10;
const TTL = 3 * 86_400_000;
const decode = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

export function createVariantSearch(store, { search, optedOut = async () => new Set(), now = Date.now } = {}) {
  return {
    async find(body, household = "") {
      if (!store) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。");
      const q = String(body?.q || "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 30);
      if (q.length < 2) throw new ApiError(400, "query_required", "料理名が短すぎます。");
      const key = `variant-search/${createHash("sha256").update(q).digest("hex").slice(0, 24)}`;
      const cached = await store.get(key);
      let items = cached && now() - Date.parse(cached.envelope.at) < TTL ? cached.envelope.items : null;
      if (!items) {
        const dayKey = `variant-search-quota/${new Date(now()).toISOString().slice(0, 10)}/${household || "anon"}`;
        const quota = await store.get(dayKey);
        const used = quota?.envelope.used || 0;
        if (used >= VARIANT_SEARCHES_PER_DAY) throw new ApiError(429, "search_quota", "今日の検索はここまでです。明日また探せます。");
        await store.put(dayKey, { used: used + 1 }, { ifGeneration: quota?.generation ?? 0 }).catch(() => {});
        const found = await search(`${q} 作り方`, { maxResults: 15, videoDuration: "medium" });
        items = found.map((x) => ({ videoId: x.videoId, channelId: x.channelId || "", channelTitle: decode(x.channelTitle).slice(0, 60), title: decode(x.title).slice(0, 100) }));
        await store.put(key, { items, at: new Date(now()).toISOString() }, { ifGeneration: cached?.generation ?? 0 }).catch(() => {});
      }
      const blocked = await optedOut().catch(() => new Set());
      return { items: items.filter((x) => !blocked.has(x.channelId)).slice(0, 8) };
    }
  };
}
