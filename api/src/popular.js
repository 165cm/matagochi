import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";

// みんなの定番：献立に入れた・作ったYouTubeレシピを、名前を伏せて数える。
// 送られるのは「どの動画か」と「好みのタイプ（味の診断8タイプ×料理スキル）」だけ。
const VIDEO = /^[\w-]{11}$/;
const SEGMENT = /^(any|[LR]{3})-[0-5]$/;
export const POPULAR_MIN = 3;
const monthOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 7);

export function createPopularBook(store, { catalog, now = Date.now, optedOut = async () => new Set() } = {}) {
  const required = () => { if (!store || !catalog) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  const recent = new Map(); // 同じ接続元・同じ動画は1日1回だけ数える
  let cache = new Map();
  return {
    async record({ videoId, segment, kind }, who = "") {
      required();
      if (!VIDEO.test(String(videoId || "")) || !SEGMENT.test(String(segment || "")) || !["planned", "cooked"].includes(kind)) throw new ApiError(400, "invalid_event", "送信内容が正しくありません。");
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
        const weight = kind === "cooked" ? 2 : 1;
        r.all += weight; r.seg[segment] = (r.seg[segment] || 0) + weight;
        doc.recipes[videoId] = r;
        if (await store.put(key, doc, { ifGeneration: entry?.generation ?? 0 })) return { counted: true };
      }
      return { counted: false };
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
      const items = [];
      const excluded = await optedOut();
      for (const [videoId, t] of ranked) {
        try {
          // 表示の GET では読み出すだけ（まだ読んでいない動画を、ここで新しくAIに読ませない）。
          const r = await catalog.peek(canonicalYouTubeUrl(videoId));
          if (!r || !r.ingredients?.length || !r.steps?.length || (r.channelId && excluded.has(r.channelId)) || excluded.has(videoId)) continue;
          items.push({ videoId, score: t.same * 3 + t.all, title: r.title, channelTitle: r.channelTitle || "", channelId: r.channelId || "", videoUrl: r.videoUrl || canonicalYouTubeUrl(videoId), thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, stepTimes: r.stepTimes || [], tags: r.tags || [], planning: r.planning || null });
        } catch {}
      }
      const value = { items, minimum: POPULAR_MIN };
      cache.set(seg, { value, until: now() + 10 * 60_000 });
      return value;
    }
  };
}
