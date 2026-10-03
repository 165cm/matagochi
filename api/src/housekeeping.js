import { pruneIcons } from "./trends.js";
import { sweepChannelStats } from "./channelStats.js";

// 1日1回の後片付け（新着集めの定期実行 POST /api/trends/refresh のあとに呼ぶ）。docs/APP_MAP.md §41。
// YouTube API で取った情報を、決めた期間を超えて持たない：
//   読み取り結果（youtube-*）… 25日ごとに確かめ直し、削除・非公開は外して30日で消す（recipeCatalog.sweep）
//   「ほかの作り方」の検索結果（variant-search/*）… 使うのは3日まで。4日を過ぎたら消す
//   投稿者のアイコン（trends/icons）… 取ってから30日まで
//   投稿者のチャンネル情報（youtube/channel-stats。管理の画面の一覧）… 取ってから30日まで
// 同じ日に2回は動かない（状態 housekeeping/state を条件つきで書いてから始める）。途中で止まっても、次の日に続きから。
const DAY = 86_400_000;
export const VARIANT_KEEP_MS = 4 * DAY;
export function createHousekeeping(store, { catalog, now = Date.now, catalogPerDay = 200, variantsPerDay = 500 } = {}) {
  const dayOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
  // 名前の順に1日 variantsPerDay 件ずつ。続きは次の日（最後まで行ったら最初から）。
  async function variants(cursor = "") {
    if (typeof store.list !== "function") return { skipped: true, next: "" };
    const page = await store.list("variant-search/", { pageToken: cursor, max: variantsPerDay });
    let removed = 0;
    for (const key of page.names) {
      const entry = await store.get(key).catch(() => null);
      if (!entry) continue;
      if (now() - (Date.parse(entry.envelope?.at || 0) || 0) > VARIANT_KEEP_MS && await store.remove(key, { ifGeneration: entry.generation }).catch(() => false)) removed += 1;
    }
    return { seen: page.names.length, removed, next: page.next };
  }
  async function icons() {
    const cur = await store.get("trends/icons");
    if (!cur) return { kept: 0, removed: 0 };
    const map = pruneIcons(cur.envelope, now());
    const before = Object.keys(cur.envelope?.map || {}).length, kept = Object.keys(map).length;
    if (before !== kept || Object.values(cur.envelope?.map || {}).some((v) => typeof v === "string")) await store.put("trends/icons", { ...cur.envelope, map }, { ifGeneration: cur.generation }).catch(() => {});
    return { kept, removed: before - kept };
  }
  return {
    async run() {
      if (!store) return { skipped: "not_configured" };
      const today = dayOf(now());
      const state = await store.get("housekeeping/state");
      if (state?.envelope.day === today) return { skipped: "done_today" };
      const claim = await store.put("housekeeping/state", { ...(state?.envelope || {}), day: today, startedAt: new Date(now()).toISOString() }, { ifGeneration: state?.generation ?? 0 });
      if (!claim) return { skipped: "busy" };
      const out = { day: today };
      const part = async (name, fn) => { try { out[name] = await fn(); } catch (error) { out[name] = { error: error?.code || "failed" }; } };
      await part("catalog", () => (catalog?.sweep ? catalog.sweep({ cursor: state?.envelope.catalogCursor || "", max: catalogPerDay }) : { skipped: true }));
      await part("variants", () => variants(state?.envelope.variantCursor || ""));
      await part("icons", icons);
      await part("channelStats", () => sweepChannelStats(store, now()));
      const cursor = typeof out.catalog?.next === "string" ? out.catalog.next : state?.envelope.catalogCursor || "";
      const variantCursor = typeof out.variants?.next === "string" ? out.variants.next : state?.envelope.variantCursor || "";
      await store.put("housekeeping/state", { day: today, catalogCursor: cursor, variantCursor, finishedAt: new Date(now()).toISOString(), last: out }, { ifGeneration: claim.generation }).catch(() => {});
      return out;
    }
  };
}
