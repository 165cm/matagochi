import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";
import { usage, usageYen } from "./aiUsage.js";

// 新着レシピ：YouTubeから選んで読み取り、28日で消す（YouTube APIのデータは30日を超えて持たない）。
// 集める処理と、見せる枠を分ける（docs/PERSONALIZE_PLAN.md §7.3・§12-7）：
//   集める … GitHubの定期実行が毎日ノックする。1日に集めるのは TREND_PER_DAY 品まで、1週で TREND_WEEK_MAX 品まで。
//            毎日、登録チャンネルの新着を見直す（週の初めに10品そろっても、その週の新しい動画を拾える）。毎日必ず新着があるとは限らない。
//   見せる … GET /api/trends は、保存済みの結果を読み出すだけ（AIも YouTube API も呼ばない）。28日以内のものを、日ごとに決まるランダムな順で
//            （2026-10-01 のユーザーの判断。同じ日は同じ順なので、キャッシュと矛盾しない）。
//   費用 …… 新着集めが AI を呼んだ回数を月ごとに数え（trends/cost）、目安の単価（TREND_YEN_PER_AI）×回数が月の上限（TREND_YEN_PER_MONTH）に届いたら、その月は集めない。
//   ひとことキャッチと、説明文の30日ごとの取り直しも、集める側（定期実行）で行う。
const DAY = 86_400_000;
const MAX_TRIES_PER_ROUND = 30;
export const TREND_KEEP_DAYS = 28;
export const TREND_PER_WEEK = 10; // 以前の見せる枠（1週あたり）。いまは28日以内をすべて、日ごとのランダムな順で見せる
// 月の費用の上限（β版の間、2026-10-01 のユーザーの判断で月1,000円）と、AI を1回呼ぶ費用の目安（円。実測で直す）。
export const TREND_YEN_PER_MONTH = 1000;
export const TREND_YEN_PER_AI = 5;
// 日ごとに決まる順（同じ日・同じ動画なら同じ値）。
const dailyRank = (day, id) => { let h = 2166136261; for (const c of `${day}|${id}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const TREND_PER_DAY = 2; // 集める数（1日あたりの上限）
export const TREND_WEEK_MAX = 14; // 集める数（1週あたりの上限。採用した数で、AIを呼んだ回数ではない）
// 新着集めが AI を呼んでよい回数（採用数とは別の上限）。読めなかった動画・説明欄から動画への切り替え・キャッチの作成も1回と数える。
export const TREND_AI_PER_DAY = 6;
export const TREND_AI_PER_WEEK = 30;
// 失敗の分け方：
//   止める … AIの枠・設定の不足。この動画は試していない扱いに戻し、今日はここまで（done にしない）
//   あとで … 通信・一時的な失敗。この動画を候補に戻し、次の実行でもう一度（3回まで）。done にしない
//   外す  … 動画の側の理由（非公開・削除・レシピがない など）。この動画は試し終わり
// 待つだけ …… 直前の失敗の1分の待ち時間・ほかで分析中。失敗の回数に入れず、あとでやり直す
const WAIT_CODES = new Set(["analysis_cooldown", "analysis_pending"]);
const STOP_CODES = { analysis_budget_exceeded: "ai_budget", analysis_busy: "ai_budget", invalid_budget: "ai_budget", analysis_disabled: "not_configured", catalog_not_configured: "not_configured", missing_analyzer: "not_configured", missing_google_cloud_project: "not_configured", missing_youtube_api_key: "not_configured" };
const SKIP_CODES = new Set(["video_not_found", "non_public_video", "invalid_url", "unsupported_url", "empty_description", "incomplete_recipe", "analysis_uncertain"]);
const MAX_RETRIES = 3;
const errorKind = (error) => (STOP_CODES[error?.code] ? "stop" : SKIP_CODES.has(error?.code) || (error?.status >= 400 && error?.status < 500 && error?.status !== 408 && error?.status !== 409 && error?.status !== 429) ? "skip" : "retry");
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
// 手動の一括収集の検索語：品ぞろえの棚卸し（docs/CATALOG_COVERAGE.md）で足りなかった分野から。「材料」を入れて、説明欄にレシピがある動画を上に。
export const SEED_QUERIES = [
  ["野菜 おかず 簡単 レシピ 材料", "野菜が主役"], ["野菜たっぷり 晩ごはん レシピ 材料", "野菜が主役"], ["キャベツ 大量消費 レシピ 材料", "野菜が主役"],
  ["10分 豚肉 レシピ 材料", "10分以内の肉"], ["5分 鶏肉 レンジ レシピ 材料", "10分以内の肉"], ["時短 ひき肉 おかず 材料", "10分以内の肉"],
  ["夕飯 パン レシピ 材料", "パン"], ["ホットサンド 夕食 レシピ 材料", "パン"],
  ["卵なし 乳なし 夕飯 レシピ", "卵・乳・小麦なし"], ["米粉 晩ごはん レシピ 材料", "卵・乳・小麦なし"],
  ["魚 煮付け 簡単 レシピ 材料", "魚"], ["鮭 レシピ 夕飯 材料", "魚"],
  ["豆腐 メイン おかず レシピ 材料", "卵・豆腐"], ["厚揚げ おかず レシピ 材料", "卵・豆腐"],
  ["煮込み 晩ごはん レシピ 材料", "30分くらい"], ["週末 ごちそう 晩ごはん レシピ 材料", "30分くらい"],
];
// 対象の国と言語。いまは日本の動画だけ（タイトルに日本語がない動画は外す）。海外展開の時はここに国を足す。
export const TREND_MARKET = { regionCode: "JP", relevanceLanguage: "ja", titleLooksLocal: (title) => /[ぁ-んァ-ヶ一-龠]/.test(String(title || "")) };
const NOT_DINNER = /ケーキ|クッキー|スイーツ|プリン|アイス|ドリンク|ジュース|スムージー|マフィン|タルト|チョコ|ゼリー|おやつ|デザート|パン作り|食パン|ベーグル|ドーナツ|お菓子|和菓子|コーヒー|カクテル|お酒/;

// 投稿者のアイコン（YouTube API の情報）は、取ってから30日まで。{ チャンネルID: { url, at } }。
// 以前の形（URL の文字列だけ）は、まとめて取った日（doc.at）を使う。
export function pruneIcons(doc, nowMs) {
  const out = {};
  for (const [id, v] of Object.entries(doc?.map || {})) {
    const url = typeof v === "string" ? v : v?.url;
    const at = typeof v === "string" ? doc.at : v?.at;
    if (typeof url === "string" && url && nowMs - (Date.parse(at || 0) || 0) <= 30 * DAY) out[id] = { url, at };
  }
  return out;
}
// 週の区切り：日本時間の月曜日。
export function weekOf(ms) {
  const jst = new Date(ms + 9 * 3_600_000);
  const day = (jst.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - day)).toISOString().slice(0, 10);
}
export const isDinnerRecipe = (r) => !!r && !NOT_DINNER.test(`${r.title || ""} ${(r.tags || []).join(" ")}`) && (r.ingredients || []).length >= 3 && (r.steps || []).length >= 2;

// 1回の呼び出しで新しい動画を読み始めるのは、開始から2分半まで（動画は1本2分ほどかかるので、全体で5分に収める）。
// AIの1日の上限（全体）のうち、人気レシピ集めが使うのは半分まで（利用者の取り込みを止めない）。
export function createTrendBook(store, { catalog, search, optedOut = async () => new Set(), searchChannels = async () => [], channelUploads = async () => [], channelIcons = async () => ({}), writeCatches = async () => ({}), reserveBudget = async () => {}, now = Date.now, budgetMs = 150_000, dailyLimit = 100, perDay = TREND_PER_DAY, weekMax = TREND_WEEK_MAX, aiPerDay = TREND_AI_PER_DAY, aiPerWeek = TREND_AI_PER_WEEK, yenPerMonth = TREND_YEN_PER_MONTH, yenPerAi = TREND_YEN_PER_AI, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
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
  // 月の AI の回数（trends/cost）を書きかえる。change(いまの回数) が null なら書かない。
  // 断られた（競合＝書かれていない）時だけ、読み直してもう一度。例外（通信が切れた等）は、書けたかどうか分からないので
  // やり直さない（返す処理を2回当てて少なく数えないため。予約なら AI を呼ばず、返す処理なら多めに数えたままにする）。
  async function writeMonthCost(month, change) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = await store.get("trends/cost");
      const doc = { months: { ...(cur?.envelope.months || {}) } };
      const ai = change(doc.months[month]?.ai || 0);
      if (ai === null) return null;
      doc.months[month] = { ai, yenPerAi, cap: yenPerMonth };
      for (const m of Object.keys(doc.months).sort().slice(0, -12)) delete doc.months[m];
      let ok;
      try { ok = await store.put("trends/cost", doc, { ifGeneration: cur?.generation ?? 0 }); } catch { return null; }
      if (ok) return ai;
    }
    return null;
  }
  // 段階の記録に、いまの題名（保存済みの結果から。30日より古い・見られない動画は空）を足して返す。
  async function withTitles(stage) {
    const added = [];
    for (const a of stage.added || []) added.push({ ...a, title: (await peek(a.videoId).catch(() => null))?.title || "" });
    return { ...stage, added };
  }
  const monthCapCalls = () => Math.max(0, Math.floor(yenPerMonth / Math.max(0.01, yenPerAi)));
  async function aiUsedToday() { return (await store.get(`usage/${new Date(now()).toISOString().slice(0, 10)}`))?.envelope.used || 0; }
  const fresh = (w) => now() - Date.parse(w.startedAt) < TREND_KEEP_DAYS * DAY;
  async function lock() {
    const entry = await store.get("trends/lock");
    if (entry && entry.envelope.until > now()) return false;
    return !!(await store.put("trends/lock", { until: now() + budgetMs + 60_000 }, { ifGeneration: entry?.generation ?? 0 }));
  }
  async function unlock() { const entry = await store.get("trends/lock"); if (entry) await store.put("trends/lock", { until: 0 }, { ifGeneration: entry.generation }).catch(() => {}); }
  // 1品読む：説明文で作り方がなければ、サーバーの分で動画も読む（利用者のチケットは使わない）。
  // AI の回数は、カタログが AI を呼ぶ直前ごと（説明欄・動画・チャプターの対応付け）に aiGate を通して数える。
  // 動画に切り替える時に説明欄をもう一度読む分も、その場で数える（取り込み1回＝1回ではない）。
  async function analyze(videoId, aiGate) {
    const url = canonicalYouTubeUrl(videoId);
    let result = null;
    try { result = await catalog.import(url, { aiGate }); } catch (error) {
      // 説明文が空・読めない（ショート動画に多い）時も、動画から読む。
      if (!["empty_description", "incomplete_recipe", "analysis_uncertain"].includes(error.code)) throw error;
    }
    if (!result?.steps?.length) result = await catalog.import(url, { forceVideo: true, unlimited: true, household: "trends-bot", aiGate });
    return result;
  }
  // 日本時間の日付。
  const dayOf = (ms) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
  // 読み取り済みの結果を読み出すだけ（まだ読んでいない・読めない動画は null）。
  const peek = (videoId) => (catalog.peek ? catalog.peek(canonicalYouTubeUrl(videoId)) : null);
  // 集める側の後片付け：見せる料理の説明文を30日ルールで取り直し、キャッチがない料理にまとめて1回だけ書いてもらう。
  async function upkeep(index, { spend = () => {}, canSpend = () => true } = {}) {
    const today = dayOf(now());
    const ids = index.weeks.filter(fresh).flatMap((w) => w.items.map((i) => i.videoId));
    if (index.refreshedOn !== today) {
      if (catalog.refresh) for (const id of ids) await catalog.refresh(canonicalYouTubeUrl(id)).catch(() => false);
      // 投稿者のアイコン（1日に1回まとめて取り直して保存。取れなくても一覧は出す）。
      const channelIds = [];
      for (const id of ids) { const r = await peek(id).catch(() => null); if (r?.channelId && !channelIds.includes(r.channelId)) channelIds.push(r.channelId); }
      if (channelIds.length) {
        const got = await channelIcons(channelIds).catch(() => null);
        if (got) {
          const cur = await store.get("trends/icons");
          const at = new Date(now()).toISOString();
          const map = { ...pruneIcons(cur?.envelope, now()), ...Object.fromEntries(Object.entries(got).map(([id, url]) => [id, { url, at }])) };
          await store.put("trends/icons", { at, map }, { ifGeneration: cur?.generation ?? 0 }).catch(() => {});
        }
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
    if (!need.length || catches.at > now() - 60 * 60_000 || !canSpend()) return 0;
    catches.at = now();
    try {
      await reserveBudget();
      spend();
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
        let current = index.weeks.find((w) => w.week === week && !w.seed); // 手動の一括収集の分（seed）は別に持つ
        if (!current) {
          current = { week, startedAt: new Date(now()).toISOString(), candidates: [], tried: [], items: [], skipped: {} };
          index.weeks.unshift(current);
        }
        current.skipped ||= {};
        // 以前の形式の週（rounds だけ）：キーワード検索が何組すんだかに読みかえる。
        if (!current.channelOf) current.channelOf = {};
        if (current.kw === undefined) current.kw = Math.max(0, (current.rounds || 0) - 1);
        current.byDay ||= {};
        current.aiByDay ||= {};
        current.retries ||= {};
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
        const aiWeek = () => Object.values(current.aiByDay).reduce((a, b) => a + b, 0);
        // 月の費用：上限の回数＝月の上限（円）÷ 1回の目安（円）。AI を呼ぶ前に、この実行で使ってよい回数を trends/cost に**先に書いて予約**する
        // （書けなければ、この実行では AI を呼ばない）。終わりに、使わなかった分を戻す（戻せなくても、多めに数えたままになるだけ＝上限は超えない）。
        const month = today.slice(0, 7);
        const monthCap = monthCapCalls();
        const writeCost = (change) => writeMonthCost(month, change);
        let reserved = 0, spent = 0, monthUsed = 0;
        const wanted = Math.max(0, Math.min(aiPerDay - (current.aiByDay[today] || 0), aiPerWeek - aiWeek()));
        const after = await writeCost((used) => { monthUsed = used; reserved = Math.max(0, Math.min(wanted, monthCap - used)); return reserved ? used + reserved : null; });
        // 予約を書けなかった（保存先の失敗・競合）：この実行では AI を呼ばず、失敗として次の実行でやり直す（done にしない）。
        const reserveFailed = after === null && reserved > 0;
        if (after === null) reserved = 0;
        const canSpend = () => (current.aiByDay[today] || 0) < aiPerDay && aiWeek() < aiPerWeek && spent < reserved;
        const spend = () => { current.aiByDay[today] = (current.aiByDay[today] || 0) + 1; spent += 1; };
        const saveCost = async () => { if (reserved > spent) await writeCost((used) => Math.max(0, used - (reserved - spent))); };
        const budgetReason = () => (monthUsed + spent >= monthCap ? "trend_month_budget" : "trend_ai_budget");
        // 検索は1つずつ。失敗したものがあれば、その組は「済み」にしない（次の実行でやり直す。既出の動画は重ねない）。
        const fetchAll = async (calls) => { const out = []; let failed = 0; for (const c of calls) { try { out.push(...(await c())); } catch { failed += 1; } } return { out, failed }; };
        const addCandidates = (found, seen) => {
          const perChannel = {};
          const picked = [];
          for (const c of found) {
            if (seen.has(c.videoId) || picked.includes(c.videoId) || NOT_DINNER.test(c.title) || !TREND_MARKET.titleLooksLocal(c.title) || excluded.has(c.channelId) || excluded.has(c.videoId)) continue;
            if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) continue;
            picked.push(c.videoId);
            current.channelOf[c.videoId] = c.channelId;
          }
          // 新しく見つけた動画は、前から残っている候補より先に試す（試した分の後ろに差しこむ）。
          current.candidates.splice(current.tried.length, 0, ...picked.slice(0, MAX_TRIES_PER_ROUND));
        };
        let paused = "", limited = "", scannedNow = false, searchFailedNow = false;
        while (quota() > 0 && now() - started < budgetMs) {
          if ((await aiUsedToday()) >= Math.floor(dailyLimit / 2)) { paused = "ai_budget"; break; }
          if (!canSpend()) { if (reserveFailed) paused = "cost_not_saved"; else limited = budgetReason(); break; }
          const seen = () => new Set([...index.weeks.flatMap((w) => w.items.map((i) => i.videoId)), ...current.candidates]);
          const publishedAfter = new Date(now() - 14 * DAY).toISOString();
          // ① その日の最初に、当たりやすいチャンネルの新着動画（直近2週間）を見る。残っている候補より先。
          if (!current.channelScan && !scannedNow) {
            scannedNow = true;
            const top = Object.entries(channels.channels).sort((a, b) => channelScore(b[1]) - channelScore(a[1])).slice(0, CHANNEL_TOP);
            const { out, failed } = await fetchAll(top.map(([channelId]) => () => channelUploads(channelId, { maxResults: 6 })));
            addCandidates(out.filter((v) => !v.publishedAt || v.publishedAt >= publishedAfter), seen());
            if (failed) { paused = "search_failed"; skip("search_error"); } else current.channelScan = true;
            continue;
          }
          if (current.tried.length >= current.candidates.length) {
            // ② 候補が尽きたら、キーワード検索（費用の大きい検索なので、1週で3組まで）。失敗したら、この実行ではもう検索しない。
            if (current.kw >= SEARCH_ROUNDS.length || searchFailedNow) break;
            const { out, failed } = await fetchAll(SEARCH_ROUNDS[current.kw].map(([q, videoDuration]) => () => search(q, { publishedAfter, videoDuration })));
            addCandidates(out, seen());
            if (failed) { paused = "search_failed"; searchFailedNow = true; skip("search_error"); } else current.kw += 1;
            continue;
          }
          const videoId = current.candidates[current.tried.length];
          current.tried.push(videoId);
          // 候補に入った後で外された動画・チャンネル（掲載停止・確認待ち・動画単位）は、読まずに飛ばす（AI も採用の枠も使わない）。
          if (excluded.has(videoId) || excluded.has(current.channelOf[videoId])) { skip("opted_out"); continue; }
          try {
            const r = await analyze(videoId, { allow: canSpend, used: spend });
            // 読んでみて分かったチャンネルが外されていたら、採用しない。
            if (r?.channelId && excluded.has(r.channelId)) { skip("opted_out"); continue; }
            learn(videoId, isDinnerRecipe(r), r.channelTitle);
            if (isDinnerRecipe(r)) { current.items.push({ videoId, day: today }); current.byDay[today] = (current.byDay[today] || 0) + 1; }
            else skip(NOT_DINNER.test(r.title || "") ? "not_dinner" : !(r.steps || []).length ? "no_steps" : "too_short");
          } catch (error) {
            const kind = error?.code === "trend_ai_budget" ? "budget" : WAIT_CODES.has(error?.code) ? "wait" : errorKind(error);
            if (kind === "skip" || (kind === "retry" && (current.retries[videoId] || 0) + 1 >= MAX_RETRIES)) {
              learn(videoId, false); skip(String(error?.code || "error").slice(0, 40));
            } else {
              // 試していない扱いに戻す（次の実行で、この動画からやり直す）。
              current.tried.pop();
              if (kind === "retry") { current.retries[videoId] = (current.retries[videoId] || 0) + 1; paused = "temporary_error"; skip("retry"); }
              else if (kind === "wait") paused = "temporary_error"; // 直前の失敗の待ち時間・分析中。失敗の回数には入れない
              else if (kind === "budget") { if (reserveFailed) paused = "cost_not_saved"; else limited = budgetReason(); }
              else paused = STOP_CODES[error.code];
              await writeIndex(index);
              break;
            }
          }
          await writeIndex(index);
        }
        const catchesWritten = paused ? 0 : await upkeep(index, { spend, canSpend });
        current.rounds = current.kw + (current.channelScan ? 1 : 0); // 以前の答えの形（rounds）も残す
        await writeIndex(index);
        await writeChannels(channels);
        await saveCost();
        cache = null;
        const exhausted = current.tried.length >= current.candidates.length && current.channelScan && current.kw >= SEARCH_ROUNDS.length;
        // done：今日はもう集めなくてよい（今日の分・今週の分がそろった／新着集めの AI の枠を使い切った／候補がもうない）。
        // 失敗（通信・一時的な失敗・AI全体の枠・設定の不足）で止めた時は done にしない（paused を見て、次の実行でやり直す）。
        return { week, day: today, items: current.items.length, today: current.byDay[today] || 0, tried: current.tried.length, candidates: current.candidates.length, rounds: current.rounds, skipped: current.skipped || {}, catches: catchesWritten,
          ai: { today: current.aiByDay[today] || 0, week: aiWeek(), perDay: aiPerDay, perWeek: aiPerWeek, month: monthUsed + spent, monthCap, yen: Math.round((monthUsed + spent) * yenPerAi), yenCap: yenPerMonth }, ...(paused ? { paused } : {}), ...(limited ? { limited } : {}),
          done: !paused && (quota() <= 0 || !!limited || exhausted) };
      } finally { await unlock(); }
    },
    // 手動の一括収集（初期投資・2026-10-01 のユーザーの判断）：品ぞろえが足りない分野の検索語で探し、説明欄だけで読める動画を集める。
    // 1段階＝ yen 円（目安の単価で数える AI の回数）まで。月の上限（trends/cost）の中に含める。AI を呼ぶ前に回数を予約する。
    // むだを省く：もう読んだ動画は保存済みの結果を使う（0円）／新着に入っている・試した動画は重ねない／掲載停止は外す／
    // 晩ごはんでない題名は読まない／同じ投稿者は1回の検索で2本まで／動画そのものは読まない（費用が大きい）。
    // 集めた料理は、その段階の日から28日の新着（seed の週）。実際のトークン数から料金の目安も出す（usageYen）。
    async seed({ yen = 100 } = {}) {
      required();
      if (!(await lock())) return { busy: true };
      const started = now();
      try {
        const today = dayOf(now()), month = today.slice(0, 7);
        const entry = await store.get("trends/seed");
        const doc = { stages: [], q: 0, candidates: [], tried: [], ...(entry?.envelope || {}) };
        let stage = doc.stages[doc.stages.length - 1];
        if (!stage || stage.done) {
          stage = { n: (stage?.n || 0) + 1, yen: Math.max(1, Math.min(1000, Math.round(Number(yen) || 100))), startedAt: new Date(now()).toISOString(), ai: 0, input: 0, output: 0, added: [], skipped: {}, byQuery: {}, done: false };
          doc.stages.push(stage);
        }
        const skip = (why) => { stage.skipped[why] = (stage.skipped[why] || 0) + 1; };
        const allowed = Math.max(0, Math.floor(stage.yen / Math.max(0.01, yenPerAi)) - stage.ai);
        const monthCap = monthCapCalls();
        let reserved = 0, spent = 0, monthUsed = 0;
        const after = await writeMonthCost(month, (used) => { monthUsed = used; reserved = Math.max(0, Math.min(allowed, monthCap - used)); return reserved ? used + reserved : null; });
        const reserveFailed = after === null && reserved > 0;
        if (after === null) reserved = 0;
        const gate = { allow: () => spent < reserved, used: () => { spent += 1; } };
        const why = () => (reserveFailed ? "cost_not_saved" : stage.ai + spent >= Math.floor(stage.yen / Math.max(0.01, yenPerAi)) ? "stage_budget" : "month_budget");
        const ixEntry = await readIndex();
        const index = { weeks: (ixEntry?.envelope.weeks || []).filter(fresh), ...(ixEntry?.envelope.refreshedOn ? { refreshedOn: ixEntry.envelope.refreshedOn } : {}) };
        let week = index.weeks.find((w) => w.seed && w.stage === stage.n);
        if (!week) { week = { week: weekOf(now()), seed: true, stage: stage.n, startedAt: stage.startedAt, candidates: [], tried: [], items: [], skipped: {} }; index.weeks.push(week); }
        const seen = new Set([...index.weeks.flatMap((w) => w.items.map((i) => i.videoId)), ...doc.tried]);
        const excluded = await optedOut();
        const collector = {};
        let reason = "";
        while (now() - started < budgetMs) {
          if (!doc.candidates.length) {
            if (doc.q >= SEED_QUERIES.length) { reason = "exhausted"; break; }
            const [q, label] = SEED_QUERIES[doc.q];
            let found;
            try { found = await search(q, { videoDuration: "medium" }); } catch { reason = "search_failed"; break; }
            doc.q += 1;
            const perChannel = {};
            for (const c of found) {
              if (seen.has(c.videoId) || doc.candidates.some((x) => x.videoId === c.videoId) || NOT_DINNER.test(c.title) || !TREND_MARKET.titleLooksLocal(c.title) || excluded.has(c.channelId) || excluded.has(c.videoId)) { skip("filtered"); continue; }
              if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) { skip("same_channel"); continue; }
              doc.candidates.push({ videoId: c.videoId, label });
            }
            continue;
          }
          const c = doc.candidates[0];
          if (seen.has(c.videoId)) { doc.candidates.shift(); skip("duplicate"); continue; }
          // もう読んだ動画は、保存済みの結果を使う（AI を呼ばない）。
          let r = await peek(c.videoId).catch(() => null);
          const free = !!r;
          if (!r) {
            if (!gate.allow()) { reason = why(); break; }
            try { r = await usage.run(collector, () => catalog.import(canonicalYouTubeUrl(c.videoId), { aiGate: gate })); }
            catch (error) {
              if (error?.code === "trend_ai_budget") { reason = why(); break; }
              if (STOP_CODES[error?.code]) { reason = STOP_CODES[error.code]; break; }
              doc.candidates.shift(); doc.tried.push(c.videoId); seen.add(c.videoId); skip(String(error?.code || "error").slice(0, 40)); continue;
            }
          }
          doc.candidates.shift(); doc.tried.push(c.videoId); seen.add(c.videoId);
          if ((r?.channelId && excluded.has(r.channelId))) { skip("opted_out"); continue; }
          if (!isDinnerRecipe(r)) { skip(!(r?.steps || []).length ? "no_steps_in_description" : NOT_DINNER.test(r?.title || "") ? "not_dinner" : "too_short"); continue; }
          week.items.push({ videoId: c.videoId, day: today });
          // 題名は YouTube の情報なので、記録には残さない（見せる時に保存済みの結果から読む＝30日ルールの中）。
          stage.added.push({ videoId: c.videoId, label: c.label, minutes: r.planning?.minutes || null, free });
          stage.byQuery[c.label] = (stage.byQuery[c.label] || 0) + 1;
        }
        if (!reason) reason = "time"; // 時間切れ：もう一度押すと続きから
        stage.ai += spent;
        stage.input += collector.input || 0;
        stage.output += collector.output || 0;
        stage.yenEstimate = Math.round(stage.ai * yenPerAi);
        stage.yenMeasured = Math.round(usageYen(stage) * 100) / 100;
        stage.done = ["exhausted", "stage_budget", "month_budget"].includes(reason);
        stage.reason = reason;
        if (!week.items.length) index.weeks = index.weeks.filter((w) => w !== week);
        await writeIndex(index);
        if (reserved > spent) await writeMonthCost(month, (used) => Math.max(0, used - (reserved - spent)));
        doc.tried = doc.tried.slice(-5000);
        doc.candidates = doc.candidates.slice(0, 200);
        for (let attempt = 0; attempt < 2; attempt++) {
          const cur = await store.get("trends/seed");
          if (await store.put("trends/seed", doc, { ifGeneration: cur?.generation ?? 0 }).catch(() => false)) break;
        }
        cache = null;
        return { stage: await withTitles(stage), reason, queriesLeft: SEED_QUERIES.length - doc.q, candidatesLeft: doc.candidates.length, month: { ai: monthUsed + spent, cap: monthCap, yen: Math.round((monthUsed + spent) * yenPerAi), yenCap: yenPerMonth } };
      } finally { await unlock(); }
    },
    async seedStatus() {
      const doc = (await store.get("trends/seed"))?.envelope || { stages: [], q: 0, candidates: [], tried: [] };
      return { ...doc, stages: await Promise.all((doc.stages || []).map(withTitles)) };
    },
    // いま新着として見せている動画か（28日以内の週に入っている）。みんなの定番に残すかの判断に使う。
    async has(videoId) {
      const entry = await readIndex();
      return (entry?.envelope.weeks || []).filter(fresh).some((w) => w.items.some((i) => i.videoId === videoId));
    },
    // 管理用：月ごとの AI の回数と、目安の費用。
    async cost() {
      const months = (await store.get("trends/cost"))?.envelope.months || {};
      return Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([month, m]) => ({ month, ai: m.ai || 0, yen: Math.round((m.ai || 0) * (m.yenPerAi ?? yenPerAi)), cap: m.cap ?? yenPerMonth }));
    },
    // 表示用：取得から28日以内のものすべてを、日ごとに決まるランダムな順で。保存済みの結果を読み出すだけ（AIを呼ばない）。
    async list() {
      required();
      const day = new Date(now() + 9 * 3_600_000).toISOString().slice(0, 10);
      // 日ごとの順なので、日本時間の日付が変わったらキャッシュも使わない。
      if (cache && cache.until > now() && cache.day === day) return cache.value;
      const entry = await readIndex();
      const excluded = await optedOut();
      const saved = (await store.get("trends/catches"))?.envelope || {};
      const items = [];
      for (const w of (entry?.envelope.weeks || []).filter(fresh)) {
        for (const { videoId } of [...w.items].reverse()) {
          try {
            const r = await peek(videoId);
            if (!r || !isDinnerRecipe(r)) continue;
            // 対象の国の動画だけ（説明文が残っていて、日本語がない動画は外す）。
            if (r.caption && !TREND_MARKET.titleLooksLocal(r.caption)) continue;
            if ((r.channelId && excluded.has(r.channelId)) || excluded.has(videoId)) continue; // 掲載停止（確認待ち・動画単位を含む）
            const c = r.catch || saved[videoId];
            items.push({ videoId, week: w.week, fetchedAt: w.startedAt, expiresAt: new Date(Date.parse(w.startedAt) + TREND_KEEP_DAYS * DAY).toISOString(),
              title: r.title, channelTitle: r.channelTitle || "", channelId: r.channelId || "", videoUrl: r.videoUrl || canonicalYouTubeUrl(videoId), thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              ...(c ? { catch: c } : {}), sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, stepTimes: r.stepTimes || [], tags: r.tags || [], planning: r.planning || null });
          } catch {}
        }
      }
      // 投稿者のアイコン：集める側が保存したものを使うだけ。
      const iconMap = pruneIcons((await store.get("trends/icons"))?.envelope, now());
      items.forEach((i) => { if (iconMap[i.channelId]) i.channelThumb = iconMap[i.channelId].url; });
      items.sort((a, b) => dailyRank(day, a.videoId) - dailyRank(day, b.videoId));
      const value = { items, updatedAt: new Date(now()).toISOString() };
      cache = { value, until: now() + 10 * 60_000, day };
      return value;
    }
  };
}
