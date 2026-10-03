// 管理の画面の「投稿者」一覧に出す YouTube のチャンネル情報（名前・登録者数・動画数など）。
// YouTube API の情報なので、取ってから30日を過ぎたら持たない（アイコンと同じ）。7日たったら取り直す。足りない分だけ50件ずつ取る（1回1単位）。
const DAY = 86_400_000;
export const CHANNEL_STATS_REFRESH_DAYS = 7;
export const CHANNEL_STATS_KEEP_DAYS = 30;

export function createChannelStats(store, { fetchStats = async () => ({}), now = Date.now } = {}) {
  const KEY = "youtube/channel-stats";
  return {
    // ids の情報を返す（取れなかった分は入らない）。
    async get(ids) {
      const want = [...new Set((ids || []).filter((id) => /^UC[\w-]{22}$/.test(id)))];
      const entry = await store.get(KEY).catch(() => null);
      const t = now();
      const map = Object.fromEntries(Object.entries(entry?.envelope?.map || {}).filter(([, v]) => t - (Date.parse(v?.at || 0) || 0) <= CHANNEL_STATS_KEEP_DAYS * DAY));
      const need = want.filter((id) => !map[id] || t - (Date.parse(map[id].at || 0) || 0) > CHANNEL_STATS_REFRESH_DAYS * DAY);
      let changed = Object.keys(map).length !== Object.keys(entry?.envelope?.map || {}).length;
      for (let i = 0; i < need.length; i += 50) {
        const got = await fetchStats(need.slice(i, i + 50)).catch(() => null);
        if (!got) break;
        const at = new Date(t).toISOString();
        for (const [id, v] of Object.entries(got)) { map[id] = { ...v, at }; changed = true; }
      }
      if (changed) await store.put(KEY, { map }, { ifGeneration: entry?.generation ?? 0 }).catch(() => {});
      return Object.fromEntries(want.filter((id) => map[id]).map((id) => [id, map[id]]));
    },
  };
}
