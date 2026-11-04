export function sampleRecipes(items, limit = 50) {
  const groups = { none: [], part: [], full: [] };
  for (const r of items) {
    const n = (r.steps || []).filter(Boolean).length;
    const k = (r.steps || []).filter((s, i) => s && Number.isFinite(r.stepTimes?.[i])).length;
    if (n) groups[k === n ? 'full' : k ? 'part' : 'none'].push(r);
  }
  // 各層内は投稿者を巡回。特定チャンネルへの集中を避ける。
  function diverse(rows) {
    const channels = new Map();
    for (const r of [...rows].sort((a,b) => a.videoId.localeCompare(b.videoId))) {
      const key = r.channelId || r.channelTitle || '';
      if (!channels.has(key)) channels.set(key, []);
      channels.get(key).push(r);
    }
    const out = [];
    while (out.length < rows.length) for (const queue of channels.values()) if (queue.length) out.push(queue.shift());
    return out;
  }
  const quotas = { none: 35, part: 10, full: 5 }, selected = [];
  for (const key of Object.keys(groups)) {
    groups[key] = diverse(groups[key]);
    selected.push(...groups[key].splice(0, quotas[key]));
  }
  return [...selected, ...Object.values(groups).flat()].slice(0, limit);
}
