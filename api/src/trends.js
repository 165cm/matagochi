import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";

// 今週の人気レシピ：毎週10品をYouTubeから選んで読み取り、28日で消す（YouTube APIのデータは30日を超えて持たない）。
// 実行はGitHubの定期実行が1時間ごとにノックする。1回は約4分まで、その週の10品がそろったら何もしない。
const DAY = 86_400_000;
export const TREND_KEEP_DAYS = 28;
export const TREND_PER_WEEK = 10;
const MAX_TRIES_PER_WEEK = 30;
const QUERIES = ["晩ごはん レシピ", "夕飯 簡単 レシピ", "おかず レシピ 人気"];
const NOT_DINNER = /ケーキ|クッキー|スイーツ|プリン|アイス|ドリンク|ジュース|スムージー|マフィン|タルト|チョコ|ゼリー|おやつ|デザート|パン作り|食パン|ベーグル|ドーナツ|お菓子|和菓子|コーヒー|カクテル|お酒/;

// 週の区切り：日本時間の月曜日。
export function weekOf(ms) {
  const jst = new Date(ms + 9 * 3_600_000);
  const day = (jst.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - day)).toISOString().slice(0, 10);
}
export const isDinnerRecipe = (r) => !!r && !NOT_DINNER.test(`${r.title || ""} ${(r.tags || []).join(" ")}`) && (r.ingredients || []).length >= 3 && (r.steps || []).length >= 2;

export function createTrendBook(store, { catalog, search, now = Date.now, budgetMs = 240_000 } = {}) {
  const required = () => { if (!store || !catalog) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let cache = null;
  async function readIndex() { return (await store.get("trends/index")) || null; }
  async function writeIndex(entry, index) { return store.put("trends/index", index, { ifGeneration: entry?.generation ?? 0 }); }
  const fresh = (w) => now() - Date.parse(w.startedAt) < TREND_KEEP_DAYS * DAY;
  async function lock() {
    const entry = await store.get("trends/lock");
    if (entry && entry.envelope.until > now()) return false;
    return !!(await store.put("trends/lock", { until: now() + budgetMs + 60_000 }, { ifGeneration: entry?.generation ?? 0 }));
  }
  async function unlock() { const entry = await store.get("trends/lock"); if (entry) await store.put("trends/lock", { until: 0 }, { ifGeneration: entry.generation }).catch(() => {}); }
  // 1品読む：説明文で作り方がなければ、サーバーの分で動画も読む（利用者のチケットは使わない）。
  async function analyze(videoId) {
    const url = canonicalYouTubeUrl(videoId);
    let result = await catalog.import(url);
    if (!result.steps?.length) result = await catalog.import(url, { forceVideo: true, unlimited: true, household: "trends-bot" });
    return result;
  }
  return {
    async step() {
      required();
      if (!(await lock())) return { busy: true };
      const started = now();
      try {
        const entry = await readIndex();
        const index = { weeks: (entry?.envelope.weeks || []).filter(fresh) };
        const week = weekOf(now());
        let current = index.weeks.find((w) => w.week === week);
        if (!current) {
          const seen = new Set(index.weeks.flatMap((w) => w.items.map((i) => i.videoId)));
          const publishedAfter = new Date(now() - 14 * DAY).toISOString();
          const found = [];
          for (const q of QUERIES) found.push(...(await search(q, { publishedAfter }).catch(() => [])));
          const perChannel = {};
          const candidates = [];
          for (const c of found) {
            if (seen.has(c.videoId) || candidates.includes(c.videoId) || NOT_DINNER.test(c.title)) continue;
            if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) continue;
            candidates.push(c.videoId);
          }
          current = { week, startedAt: new Date(now()).toISOString(), candidates: candidates.slice(0, MAX_TRIES_PER_WEEK), tried: [], items: [] };
          index.weeks.unshift(current);
        }
        while (current.items.length < TREND_PER_WEEK && current.tried.length < current.candidates.length && now() - started < budgetMs) {
          const videoId = current.candidates[current.tried.length];
          current.tried.push(videoId);
          try {
            const r = await analyze(videoId);
            if (isDinnerRecipe(r)) current.items.push({ videoId });
          } catch {}
          await writeIndex(await readIndex(), index);
        }
        const saved = await readIndex();
        await writeIndex(saved, index);
        cache = null;
        return { week, items: current.items.length, done: current.items.length >= TREND_PER_WEEK || current.tried.length >= current.candidates.length };
      } finally { await unlock(); }
    },
    // 表示用：取得から28日以内の週だけ。説明文などは読み取り結果の保存先から（30日ルールの取り直しも通る）。
    async list() {
      required();
      if (cache && cache.until > now()) return cache.value;
      const entry = await readIndex();
      const items = [];
      for (const w of (entry?.envelope.weeks || []).filter(fresh)) {
        for (const { videoId } of w.items) {
          try {
            const r = await catalog.import(canonicalYouTubeUrl(videoId));
            if (!isDinnerRecipe(r)) continue;
            items.push({ videoId, week: w.week, fetchedAt: w.startedAt, expiresAt: new Date(Date.parse(w.startedAt) + TREND_KEEP_DAYS * DAY).toISOString(),
              title: r.title, channelTitle: r.channelTitle || "", channelId: r.channelId || "", videoUrl: r.videoUrl || canonicalYouTubeUrl(videoId), thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, tags: r.tags || [], planning: r.planning || null });
          } catch {}
        }
      }
      const value = { items, updatedAt: new Date(now()).toISOString() };
      cache = { value, until: now() + 10 * 60_000 };
      return value;
    }
  };
}
