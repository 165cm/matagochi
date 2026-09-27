import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";

// 今週の人気レシピ：毎週10品をYouTubeから選んで読み取り、28日で消す（YouTube APIのデータは30日を超えて持たない）。
// 実行はGitHubの定期実行が1時間ごとにノックする。1回は約4分まで、その週の10品がそろったら何もしない。
const DAY = 86_400_000;
const MAX_TRIES_PER_ROUND = 30;
export const TREND_KEEP_DAYS = 28;
export const TREND_PER_WEEK = 10;
// 10品に届かなければ、次の組の検索語で候補を足す（週3組まで）。説明文にレシピが載りやすい4〜20分の動画を先に。
const SEARCH_ROUNDS = [
  [["晩ごはん レシピ", "medium"], ["夕飯 簡単 レシピ", "medium"], ["おかず レシピ 人気", ""]],
  [["簡単 おかず 作り方", "medium"], ["人気 レシピ 夕食", ""], ["メインおかず レシピ", "medium"]],
  [["献立 レシピ", ""], ["作り置き おかず", "medium"], ["丼 レシピ", ""]],
];
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
    let result = null;
    try { result = await catalog.import(url); } catch (error) {
      // 説明文が空・読めない（ショート動画に多い）時も、動画から読む。
      if (!["empty_description", "incomplete_recipe", "analysis_uncertain"].includes(error.code)) throw error;
    }
    if (!result?.steps?.length) result = await catalog.import(url, { forceVideo: true, unlimited: true, household: "trends-bot" });
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
          current = { week, startedAt: new Date(now()).toISOString(), rounds: 0, candidates: [], tried: [], items: [], skipped: {} };
          index.weeks.unshift(current);
        }
        // 10品そろうまで：候補を試し切ったら、次の組の検索語で候補を足して続ける。
        current.skipped ||= {};
        const skip = (reason) => { current.skipped[reason] = (current.skipped[reason] || 0) + 1; };
        while (current.items.length < TREND_PER_WEEK && now() - started < budgetMs) {
          if (current.tried.length >= current.candidates.length) {
            if ((current.rounds || 0) >= SEARCH_ROUNDS.length) break;
            const seen = new Set([...index.weeks.flatMap((w) => w.items.map((i) => i.videoId)), ...current.candidates]);
            const publishedAfter = new Date(now() - 14 * DAY).toISOString();
            const found = [];
            for (const [q, videoDuration] of SEARCH_ROUNDS[current.rounds || 0]) found.push(...(await search(q, { publishedAfter, videoDuration }).catch(() => [])));
            current.rounds = (current.rounds || 0) + 1;
            const perChannel = {};
            const fresh = [];
            for (const c of found) {
              if (seen.has(c.videoId) || fresh.includes(c.videoId) || NOT_DINNER.test(c.title)) continue;
              if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) continue;
              fresh.push(c.videoId);
            }
            current.candidates.push(...fresh.slice(0, MAX_TRIES_PER_ROUND));
            continue;
          }
          const videoId = current.candidates[current.tried.length];
          current.tried.push(videoId);
          try {
            const r = await analyze(videoId);
            if (isDinnerRecipe(r)) current.items.push({ videoId });
            else skip(NOT_DINNER.test(r.title || "") ? "not_dinner" : !(r.steps || []).length ? "no_steps" : "too_short");
          } catch (error) { skip(String(error.code || "error").slice(0, 40)); }
          await writeIndex(await readIndex(), index);
        }
        const saved = await readIndex();
        await writeIndex(saved, index);
        cache = null;
        const exhausted = current.tried.length >= current.candidates.length && (current.rounds || 0) >= SEARCH_ROUNDS.length;
        return { week, items: current.items.length, tried: current.tried.length, candidates: current.candidates.length, rounds: current.rounds || 0, skipped: current.skipped || {}, done: current.items.length >= TREND_PER_WEEK || exhausted };
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
