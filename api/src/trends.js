import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";

// 新着レシピ：YouTubeから選んで読み取り、28日で消す（YouTube APIのデータは30日を超えて持たない）。
// 集める処理と、見せる枠を分ける（docs/PERSONALIZE_PLAN.md §7.3・§12-7）：
//   集める … GitHubの定期実行が毎日ノックする。1日に集めるのは TREND_PER_DAY 品まで、1週で TREND_WEEK_MAX 品まで。
//            毎日、登録チャンネルの新着を見直す（週の初めに10品そろっても、その週の新しい動画を拾える）。毎日必ず新着があるとは限らない。
//   見せる … GET /api/trends は、保存済みの結果を読み出すだけ（AIも YouTube API も呼ばない）。1週あたり新しい順に TREND_PER_WEEK 品まで。
//   ひとことキャッチと、説明文の30日ごとの取り直しも、集める側（定期実行）で行う。
const DAY = 86_400_000;
const MAX_TRIES_PER_ROUND = 30;
export const TREND_KEEP_DAYS = 28;
export const TREND_PER_WEEK = 10; // 見せる枠（1週あたり）
export const TREND_PER_DAY = 2; // 集める数（1日あたりの上限）
export const TREND_WEEK_MAX = 14; // 集める数（1週あたりの上限。AIの費用の上限にもなる）
// 10品に届かなければ、次の組の検索語で候補を足す（週3組まで）。説明文にレシピが載りやすい4〜20分の動画を先に。
// 最初に登録する料理系の人気YouTuber。名前でチャンネルを1回だけ探し、名前が合った時だけ使う。
export const SEED_CHANNELS = [
  ["リュウジのバズレシピ", /リュウジ/], ["こっタソの自由気ままに", /こっタソ/], ["Kurashiru クラシル", /kurashiru|クラシル/i],
  ["DELISH KITCHEN", /delish/i], ["だれウマ 料理研究家", /だれウマ/], ["白ごはん.com", /白ごはん/],
  ["syun cooking", /syun/i], ["Koh Kentetsu Kitchen コウケンテツ", /koh kentetsu|コウケンテツ/i], ["賛否両論 笠原将弘", /笠原|賛否両論/],
  ["てぬキッチン", /てぬキッチン/], ["はらぺこグリズリーの料理と筋トレ", /はらぺこグリズリー/], ["もあいかすみ", /もあい/],
  ["ゆかりのおうちごはん", /ゆかり/], ["Chef Ropia", /ropia/i], ["Tasty Japan", /tasty/i],
];
const CHANNEL_TOP = 15;
// チャンネルの当たりやすさ：読めた本数÷試した本数（試していないチャンネルは半々から始める）。
export const channelScore = (c) => ((c.hits || 0) + 1) / ((c.tries || 0) + 2);
// 「材料」を入れると、説明文に材料が書いてある（読み取れる）動画が上に来やすい。
const SEARCH_ROUNDS = [
  [["晩ごはん レシピ 材料", "medium"], ["夕飯 簡単 レシピ 材料", "medium"], ["おかず レシピ 材料 作り方", ""]],
  [["簡単 おかず 材料 作り方", "medium"], ["人気 レシピ 夕食 材料", ""], ["メインおかず レシピ 材料", "medium"]],
  [["献立 レシピ 材料", ""], ["作り置き おかず 材料", "medium"], ["丼 レシピ 材料", ""]],
];
// 対象の国と言語。いまは日本の動画だけ（タイトルに日本語がない動画は外す）。海外展開の時はここに国を足す。
export const TREND_MARKET = { regionCode: "JP", relevanceLanguage: "ja", titleLooksLocal: (title) => /[ぁ-んァ-ヶ一-龠]/.test(String(title || "")) };
const NOT_DINNER = /ケーキ|クッキー|スイーツ|プリン|アイス|ドリンク|ジュース|スムージー|マフィン|タルト|チョコ|ゼリー|おやつ|デザート|パン作り|食パン|ベーグル|ドーナツ|お菓子|和菓子|コーヒー|カクテル|お酒/;

// 週の区切り：日本時間の月曜日。
export function weekOf(ms) {
  const jst = new Date(ms + 9 * 3_600_000);
  const day = (jst.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - day)).toISOString().slice(0, 10);
}
export const isDinnerRecipe = (r) => !!r && !NOT_DINNER.test(`${r.title || ""} ${(r.tags || []).join(" ")}`) && (r.ingredients || []).length >= 3 && (r.steps || []).length >= 2;

// 1回の呼び出しで新しい動画を読み始めるのは、開始から2分半まで（動画は1本2分ほどかかるので、全体で5分に収める）。
// AIの1日の上限（全体）のうち、人気レシピ集めが使うのは半分まで（利用者の取り込みを止めない）。
export function createTrendBook(store, { catalog, search, optedOut = async () => new Set(), searchChannels = async () => [], channelUploads = async () => [], channelIcons = async () => ({}), writeCatches = async () => ({}), reserveBudget = async () => {}, now = Date.now, budgetMs = 150_000, dailyLimit = 100, perDay = TREND_PER_DAY, weekMax = TREND_WEEK_MAX, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const required = () => { if (!store || !catalog) throw new ApiError(503, "catalog_not_configured", "保存先が未設定です。"); };
  let cache = null;
  const catches = { at: 0 };
  async function readIndex() { return (await store.get("trends/index")) || null; }
  // 同じ保存先へ1秒以内に続けて書くと断られるので、断られたら1秒あけて1回だけやり直す。
  async function writeIndex(index) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const entry = await readIndex(); return await store.put("trends/index", index, { ifGeneration: entry?.generation ?? 0 }); }
      catch (error) { if (attempt) throw error; await pause(1_200); }
    }
  }
  async function readChannels() { return (await store.get("trends/channels"))?.envelope || { seeds: {}, channels: {} }; }
  async function writeChannels(doc) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { const entry = await store.get("trends/channels"); return await store.put("trends/channels", doc, { ifGeneration: entry?.generation ?? 0 }); }
      catch (error) { if (attempt) return null; await pause(1_200); }
    }
  }
  // 登録チャンネルを名前から探す（1回の呼び出しで5件まで。見つからなければ "none" として二度と探さない）。
  async function resolveSeeds(doc) {
    let n = 0;
    for (const [query, match] of SEED_CHANNELS) {
      if (query in doc.seeds || n >= 5) continue;
      n++;
      const found = await searchChannels(query).catch(() => null);
      if (!found) continue;
      const hit = found.find((c) => match.test(c.title));
      doc.seeds[query] = hit?.channelId || "none";
      if (hit && !doc.channels[hit.channelId]) doc.channels[hit.channelId] = { name: hit.title, source: "seed", tries: 0, hits: 0 };
    }
  }
  async function aiUsedToday() { return (await store.get(`usage/${new Date(now()).toISOString().slice(0, 10)}`))?.envelope.used || 0; }
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
  // 日本時間の日付。
  const dayOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
  // 読み取り済みの結果を読み出すだけ（まだ読んでいない・読めない動画は null）。
  const peek = (videoId) => (catalog.peek ? catalog.peek(canonicalYouTubeUrl(videoId)) : null);
  // 集める側の後片付け：見せる料理の説明文を30日ルールで取り直し、キャッチがない料理にまとめて1回だけ書いてもらう。
  async function upkeep(index) {
    const today = dayOf(now());
    const ids = index.weeks.filter(fresh).flatMap((w) => w.items.map((i) => i.videoId));
    if (index.refreshedOn !== today) {
      if (catalog.refresh) for (const id of ids) await catalog.refresh(canonicalYouTubeUrl(id)).catch(() => false);
      // 投稿者のアイコン（1日に1回まとめて取り直して保存。取れなくても一覧は出す）。
      const channelIds = [];
      for (const id of ids) { const r = await peek(id).catch(() => null); if (r?.channelId && !channelIds.includes(r.channelId)) channelIds.push(r.channelId); }
      if (channelIds.length) {
        const got = await channelIcons(channelIds).catch(() => null);
        if (got) { const cur = await store.get("trends/icons"); await store.put("trends/icons", { at: new Date(now()).toISOString(), map: { ...(cur?.envelope.map || {}), ...got } }, { ifGeneration: cur?.generation ?? 0 }).catch(() => {}); }
      }
      index.refreshedOn = today;
    }
    const saved = (await store.get("trends/catches"))?.envelope || {};
    const need = [];
    for (const id of ids) {
      if (saved[id]) continue;
      const r = await peek(id).catch(() => null);
      if (r && !r.catch && isDinnerRecipe(r)) need.push({ videoId: id, title: r.title, channelTitle: r.channelTitle || "", ingredients: r.ingredients, steps: r.steps, tags: r.tags || [] });
    }
    if (!need.length || catches.at > now() - 60 * 60_000) return 0;
    catches.at = now();
    try {
      await reserveBudget();
      const written = await writeCatches(need);
      if (Object.keys(written || {}).length) { const cur = await store.get("trends/catches"); await store.put("trends/catches", { ...(cur?.envelope || {}), ...written }, { ifGeneration: cur?.generation ?? 0 }).catch(() => {}); }
      return Object.keys(written || {}).length;
    } catch { return 0; }
  }
  return {
    async step() {
      required();
      if (!(await lock())) return { busy: true };
      const started = now();
      try {
        const entry = await readIndex();
        const index = { weeks: (entry?.envelope.weeks || []).filter(fresh), ...(entry?.envelope.refreshedOn ? { refreshedOn: entry.envelope.refreshedOn } : {}) };
        const week = weekOf(now()), today = dayOf(now());
        let current = index.weeks.find((w) => w.week === week);
        if (!current) {
          current = { week, startedAt: new Date(now()).toISOString(), candidates: [], tried: [], items: [], skipped: {} };
          index.weeks.unshift(current);
        }
        current.skipped ||= {};
        // 以前の形式の週（rounds だけ）：キーワード検索が何組すんだかに読みかえる。
        if (!current.channelOf) current.channelOf = {};
        if (current.kw === undefined) current.kw = Math.max(0, (current.rounds || 0) - 1);
        current.byDay ||= {};
        // 新しい日は、登録チャンネルの新着をもう一度見る（取り込み済みの動画は重ねない）。
        if (current.day !== today) { current.day = today; current.channelScan = false; }
        const channels = await readChannels();
        await resolveSeeds(channels);
        // チャンネルごとの当たり外れを記録（キーワードで当たったチャンネルは、新しくリストに加える）。
        const learn = (videoId, hit, name) => {
          const id = current.channelOf[videoId];
          if (!id) return;
          const c = channels.channels[id] || (hit ? (channels.channels[id] = { name: name || "", source: "learned", tries: 0, hits: 0 }) : null);
          if (!c) return;
          c.tries += 1; c.hits += hit ? 1 : 0;
        };
        const skip = (reason) => { current.skipped[reason] = (current.skipped[reason] || 0) + 1; };
        const excluded = await optedOut();
        for (const id of excluded) delete channels.channels[id];
        const quota = () => Math.min(perDay - (current.byDay[today] || 0), weekMax - current.items.length);
        let paused = "";
        while (quota() > 0 && now() - started < budgetMs) {
          if ((await aiUsedToday()) >= Math.floor(dailyLimit / 2)) { paused = "ai_budget"; break; }
          if (current.tried.length >= current.candidates.length) {
            if (current.channelScan && current.kw >= SEARCH_ROUNDS.length) break;
            const seen = new Set([...index.weeks.flatMap((w) => w.items.map((i) => i.videoId)), ...current.candidates]);
            const publishedAfter = new Date(now() - 14 * DAY).toISOString();
            const found = [];
            if (!current.channelScan) {
              // ① 当たりやすいチャンネルの新着動画（直近2週間）を先に。毎日1回。
              const top = Object.entries(channels.channels).sort((a, b) => channelScore(b[1]) - channelScore(a[1])).slice(0, CHANNEL_TOP);
              for (const [channelId] of top) found.push(...(await channelUploads(channelId, { maxResults: 6 }).catch(() => [])).filter((v) => !v.publishedAt || v.publishedAt >= publishedAfter));
              current.channelScan = true;
            } else {
              // ② 足りなければキーワード検索（費用の大きい検索なので、1週で3組まで）。
              for (const [q, videoDuration] of SEARCH_ROUNDS[current.kw]) found.push(...(await search(q, { publishedAfter, videoDuration }).catch(() => [])));
              current.kw += 1;
            }
            const perChannel = {};
            const picked = [];
            for (const c of found) {
              if (seen.has(c.videoId) || picked.includes(c.videoId) || NOT_DINNER.test(c.title) || !TREND_MARKET.titleLooksLocal(c.title) || excluded.has(c.channelId)) continue;
              if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) continue;
              picked.push(c.videoId);
              current.channelOf[c.videoId] = c.channelId;
            }
            current.candidates.push(...picked.slice(0, MAX_TRIES_PER_ROUND));
            continue;
          }
          const videoId = current.candidates[current.tried.length];
          current.tried.push(videoId);
          try {
            const r = await analyze(videoId);
            learn(videoId, isDinnerRecipe(r), r.channelTitle);
            if (isDinnerRecipe(r)) { current.items.push({ videoId, day: today }); current.byDay[today] = (current.byDay[today] || 0) + 1; }
            else skip(NOT_DINNER.test(r.title || "") ? "not_dinner" : !(r.steps || []).length ? "no_steps" : "too_short");
          } catch (error) { learn(videoId, false); skip(String(error.code || "error").slice(0, 40)); }
          await writeIndex(index);
        }
        const catchesWritten = paused ? 0 : await upkeep(index);
        current.rounds = current.kw + (current.channelScan ? 1 : 0); // 以前の答えの形（rounds）も残す
        await writeIndex(index);
        await writeChannels(channels);
        cache = null;
        const exhausted = current.tried.length >= current.candidates.length && current.channelScan && current.kw >= SEARCH_ROUNDS.length;
        // done：今日はもう集めなくてよい（今日の分・今週の分がそろった、または候補がない）。失敗は done にしない。
        return { week, day: today, items: current.items.length, today: current.byDay[today] || 0, tried: current.tried.length, candidates: current.candidates.length, rounds: current.rounds, skipped: current.skipped || {}, catches: catchesWritten, ...(paused ? { paused } : {}), done: !paused && (quota() <= 0 || exhausted) };
      } finally { await unlock(); }
    },
    // 表示用：取得から28日以内の週だけ、1週あたり新しい順に10品まで。保存済みの結果を読み出すだけ（AIを呼ばない）。
    async list() {
      required();
      if (cache && cache.until > now()) return cache.value;
      const entry = await readIndex();
      const excluded = await optedOut();
      const saved = (await store.get("trends/catches"))?.envelope || {};
      const items = [];
      for (const w of (entry?.envelope.weeks || []).filter(fresh)) {
        let shown = 0;
        for (const { videoId } of [...w.items].reverse()) {
          if (shown >= TREND_PER_WEEK) break;
          try {
            const r = await peek(videoId);
            if (!r || !isDinnerRecipe(r)) continue;
            // 対象の国の動画だけ（説明文が残っていて、日本語がない動画は外す）。
            if (r.caption && !TREND_MARKET.titleLooksLocal(r.caption)) continue;
            if (r.channelId && excluded.has(r.channelId)) continue; // 掲載停止（確認待ちを含む）
            const c = r.catch || saved[videoId];
            items.push({ videoId, week: w.week, fetchedAt: w.startedAt, expiresAt: new Date(Date.parse(w.startedAt) + TREND_KEEP_DAYS * DAY).toISOString(),
              title: r.title, channelTitle: r.channelTitle || "", channelId: r.channelId || "", videoUrl: r.videoUrl || canonicalYouTubeUrl(videoId), thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              ...(c ? { catch: c } : {}), sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, stepTimes: r.stepTimes || [], tags: r.tags || [], planning: r.planning || null });
            shown += 1;
          } catch {}
        }
      }
      // 投稿者のアイコン：集める側が保存したものを使うだけ。
      const iconMap = (await store.get("trends/icons"))?.envelope.map || {};
      items.forEach((i) => { if (iconMap[i.channelId]) i.channelThumb = iconMap[i.channelId]; });
      const value = { items, updatedAt: new Date(now()).toISOString() };
      cache = { value, until: now() + 10 * 60_000 };
      return value;
    }
  };
}
