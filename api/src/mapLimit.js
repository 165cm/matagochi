// items を limit 件ずつ同時に fn に通す（結果は items と同じ順番）。保存場所から数百件を読む管理の一覧で使う（1件ずつだと数十秒かかるため。2026-11-03）。
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
