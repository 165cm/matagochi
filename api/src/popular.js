import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";

// みんなの定番：献立に入れた・作ったYouTubeレシピを、名前を伏せて数える。
// 送られるのは「どの動画か」と「好みのタイプ（味の診断8タイプ×料理スキル）」だけ。
// PR 4b（2026-10-01 のユーザーの判断）：
//   - 献立の候補に出した回数（shown）も数え、献立に入れた割合（採用率）を出す（並べ方には使わない）
//   - 新着（28日以内）から献立に入れられた動画は、28日を過ぎても「みんなの定番」に残す（popular/kept）。
//     ただし読み出す時に、今までどおり掲載停止・削除・非公開（catalog.peek が null）を外し、30日より古い説明文は出さない
const VIDEO = /^[\w-]{11}$/;
const SEGMENT = /^(any|[LR]{3})-[0-5]$/;
export const POPULAR_MIN = 3;
const monthOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 7);
const KINDS = ["planned", "cooked", "shown"];
const KEPT = "popular/kept";
const KEPT_MAX = 2000;

export function createPopularBook(store, { catalog, now = Date.now, optedOut = async () => new Set(), isTrend = async () => false } = {}) {
  const required = () => { if (!store || !catalog) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  const recent = new Map(); // 同じ接続元・同じ動画は1日1回だけ数える
  let cache = new Map();
  async function keep(videoId) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const entry = await store.get(KEPT);
      const videos = { ...(entry?.envelope.videos || {}) };
      if (videos[videoId]) return;
      if (Object.keys(videos).length >= KEPT_MAX) return;
      videos[videoId] = { at: new Date(now()).toISOString() };
      if (await store.put(KEPT, { videos }, { ifGeneration: entry?.generation ?? 0 })) { cache = new Map(); return; }
    }
  }
  return {
    async record({ videoId, segment, kind }, who = "") {
      required();
      if (!VIDEO.test(String(videoId || "")) || !SEGMENT.test(String(segment || "")) || !KINDS.includes(kind)) throw new ApiError(400, "invalid_event", "送信内容が正しくありません。");
      const day = new Date(now()).toISOString().slice(0, 10);
      const seenKey = `${day}|${who}|${videoId}|${kind}`;
      if (recent.has(seenKey)) return { counted: false };
      if (recent.size > 50_000) recent.clear();
      recent.set(seenKey, true);
      const key = `popular/${monthOf(now())}`;
      for (let attempt = 0; attempt < 6; attempt++) {
        const entry = await store.get(key);
        const doc = entry?.envelope || { recipes: {} };
        const r = doc.recipes[videoId] || { all: 0, seg: {} };
        // 並べ方の重み：作った 2・献立に入れた 1・候補に出しただけ 0（数えるだけ）。
        const weight = kind === "cooked" ? 2 : kind === "planned" ? 1 : 0;
        if (weight) { r.all += weight; r.seg[segment] = (r.seg[segment] || 0) + weight; }
        r[kind] = (r[kind] || 0) + 1;
        doc.recipes[videoId] = r;
        if (await store.put(key, doc, { ifGeneration: entry?.generation ?? 0 })) {
          if (kind === "planned" && (await isTrend(videoId).catch(() => false))) await keep(videoId);
          return { counted: true };
        }
      }
      return { counted: false };
    },
    // 管理用：この月と前の月の、動画ごとの候補に出した回数・献立に入れた回数・作った回数と採用率、残しているか。
    async stats() {
      required();
      const months = [monthOf(now()), monthOf(now() - 31 * 86_400_000)];
      const totals = {};
      for (const m of months) {
        for (const [id, r] of Object.entries((await store.get(`popular/${m}`))?.envelope.recipes || {})) {
          const t = (totals[id] ||= { shown: 0, planned: 0, cooked: 0 });
          for (const k of KINDS) t[k] += r[k] || 0;
        }
      }
      const kept = (await store.get(KEPT))?.envelope.videos || {};
      for (const id of Object.keys(kept)) totals[id] ||= { shown: 0, planned: 0, cooked: 0 };
      return Object.entries(totals).map(([videoId, t]) => ({ videoId, ...t, rate: t.shown ? Math.round((t.planned / t.shown) * 100) : null, kept: !!kept[videoId], keptAt: kept[videoId]?.at || "" }))
        .sort((a, b) => b.planned - a.planned || b.shown - a.shown);
    },
    // 似た好みの人（同じタイプ）の数を重く、全体の数を軽く。数が少ない料理は出さない。
    async top(segment = "any-0", limit = 20) {
      required();
      const seg = SEGMENT.test(segment) ? segment : "any-0";
      const hit = cache.get(seg);
      if (hit && hit.until > now()) return hit.value;
      const months = [monthOf(now()), monthOf(now() - 31 * 86_400_000)];
      const totals = {};
      for (const m of months) {
        const entry = await store.get(`popular/${m}`);
        for (const [id, r] of Object.entries(entry?.envelope.recipes || {})) {
          const t = (totals[id] ||= { all: 0, same: 0 });
          t.all += r.all; t.same += Object.entries(r.seg || {}).filter(([k]) => k === seg || (seg.startsWith("any") ? false : k.slice(0, 3) === seg.slice(0, 3))).reduce((s, [, v]) => s + v, 0);
        }
      }
      const ranked = Object.entries(totals).filter(([, t]) => t.all >= POPULAR_MIN).sort((a, b) => (b[1].same * 3 + b[1].all) - (a[1].same * 3 + a[1].all)).slice(0, limit);
      // 新着から献立に入れられて残している動画（数が少なくても出す）。数えた順位のあとに、残した新しい順で。
      const kept = Object.entries((await store.get(KEPT))?.envelope.videos || {}).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at)));
      for (const [id] of kept) if (ranked.length < limit && !ranked.some(([x]) => x === id)) ranked.push([id, { all: totals[id]?.all || 0, same: totals[id]?.same || 0, kept: true }]);
      const items = [];
      const excluded = await optedOut();
      for (const [videoId, t] of ranked) {
        try {
          // 表示の GET では読み出すだけ（まだ読んでいない動画を、ここで新しくAIに読ませない）。
          const r = await catalog.peek(canonicalYouTubeUrl(videoId));
          if (!r || !r.ingredients?.length || !r.steps?.length || (r.channelId && excluded.has(r.channelId)) || excluded.has(videoId)) continue;
          items.push({ videoId, score: t.same * 3 + t.all, ...(t.kept ? { kept: true } : {}), title: r.title, channelTitle: r.channelTitle || "", channelId: r.channelId || "", videoUrl: r.videoUrl || canonicalYouTubeUrl(videoId), thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, stepTimes: r.stepTimes || [], tags: r.tags || [], planning: r.planning || null });
        } catch {}
      }
      const value = { items, minimum: POPULAR_MIN };
      cache.set(seg, { value, until: now() + 10 * 60_000 });
      return value;
    }
  };
}
