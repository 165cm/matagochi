// 管理の画面の「投稿者」一覧に出す YouTube のチャンネル情報（名前・登録者数・動画数など）。
// YouTube API の情報なので、取ってから30日を過ぎたら持たない（アイコンと同じ。1日1回の後片付け housekeeping でも消す）。
// 7日たったら取り直す。足りない分だけ50件ずつ取る（1回1単位）。
// 取れなかった（失敗・応答に含まれない）チャンネルは、確かめた日時（checked）を別に残し、1日は取り直さない（古い値の at は進めない＝30日で消える）。
const DAY = 86_400_000;
export const CHANNEL_STATS_REFRESH_DAYS = 7;
export const CHANNEL_STATS_KEEP_DAYS = 30;
export const CHANNEL_STATS_RETRY_MS = DAY;
const KEY = "youtube/channel-stats";
const age = (nowMs, at) => nowMs - (Date.parse(at || 0) || 0);

// 30日を過ぎた値と、30日を過ぎた（またはもう要らない）確かめた記録を外す。
export function pruneChannelStats(doc, nowMs) {
  const map = Object.fromEntries(Object.entries(doc?.map || {}).filter(([, v]) => age(nowMs, v?.at) <= CHANNEL_STATS_KEEP_DAYS * DAY));
  const checked = Object.fromEntries(Object.entries(doc?.checked || {}).filter(([, at]) => age(nowMs, at) <= CHANNEL_STATS_KEEP_DAYS * DAY));
  return { map, checked };
}
const sameDoc = (a, b) => JSON.stringify({ map: a?.map || {}, checked: a?.checked || {} }) === JSON.stringify(b);

export function createChannelStats(store, { fetchStats = async () => ({}), now = Date.now } = {}) {
  return {
    // ids の情報を返す（取れなかった分は入らない）。
    async get(ids) {
      const want = [...new Set((ids || []).filter((id) => /^UC[\w-]{22}$/.test(id)))];
      const entry = await store.get(KEY).catch(() => null);
      const t = now();
      const doc = pruneChannelStats(entry?.envelope, t);
      const need = want.filter((id) => (!doc.map[id] || age(t, doc.map[id].at) > CHANNEL_STATS_REFRESH_DAYS * DAY) && !(doc.checked[id] && age(t, doc.checked[id]) < CHANNEL_STATS_RETRY_MS));
      const at = new Date(t).toISOString();
      for (let i = 0; i < need.length; i += 50) {
        const part = need.slice(i, i + 50);
        const got = await fetchStats(part).catch(() => null);
        for (const id of part) {
          if (got?.[id]) { doc.map[id] = { ...got[id], at }; delete doc.checked[id]; }
          else doc.checked[id] = at; // 失敗・応答に含まれない：1日待つ（古い値はそのまま）
        }
      }
      if (!sameDoc(entry?.envelope, doc)) await store.put(KEY, doc, { ifGeneration: entry?.generation ?? 0 }).catch(() => {});
      return Object.fromEntries(want.filter((id) => doc.map[id]).map((id) => [id, doc.map[id]]));
    },
  };
}

// 1日1回の後片付け：管理の画面を開かなくても、30日を過ぎた情報を消す。
export async function sweepChannelStats(store, nowMs) {
  const cur = await store.get(KEY);
  if (!cur) return { kept: 0, removed: 0 };
  const doc = pruneChannelStats(cur.envelope, nowMs);
  const before = Object.keys(cur.envelope?.map || {}).length, kept = Object.keys(doc.map).length;
  if (!sameDoc(cur.envelope, doc)) await store.put(KEY, doc, { ifGeneration: cur.generation }).catch(() => {});
  return { kept, removed: before - kept };
}
