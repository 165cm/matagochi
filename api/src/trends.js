import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl } from "./youtube.js";
import { usage, usageYen } from "./aiUsage.js";
import { createDishBook } from "./dishes.js";

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
export const TREND_YEN_PER_AI = 1; // 2026-10-01 の実測（説明欄の読み取り1回 約0.86円）から。考える部分を使わない読み取りならもっと安い
// 手動の一括収集で、同時に読む本数（AI 1回に10秒ほどかかるので、1回押して集められる量を増やす）。
export const SEED_PARALLEL = 3;
// 説明欄にレシピが書いてありそうか（AI を呼ぶ前のふるい）：分量の書き方が3つ以上と、作り方の書き出しがある。
const AMOUNT = /大さじ|小さじ|適量|少々|ひとつまみ|\d+(?:\.\d+)?\s*(?:g|ｇ|kg|ml|cc|個|本|枚|片|かけ|束|袋|丁|パック|合|カップ|切れ|尾|玉)/g;
// 作り方の行：番号のあとに区切りがある（「1. 」「2、」「(3)」。「100g」「1個」「1.5」のような分量は数えない）・①〜⑳・STEP1／手順1。
const STEP_LINE = /^\s*(?:[①-⑳]|(?:step|ステップ|手順)\s*\d{1,2}|[(（]\d{1,2}[)）]|\d{1,2}\s*[.．、:：)）](?!\d))\s*\S/i;
// 「作り方」の見出しのあとの、調理の動きがある行（番号なしで書く人のため）。
const COOK_VERB = /切|刻|炒め|焼|煮|入れ|混ぜ|加え|茹で|ゆで|蒸|揚げ|のせ|乗せ|かけ|和え|漬け|レンジ|加熱|盛|絞|包|巻|こね|捏|丸め|並べ|まぶ|ほぐ|溶|沸|炊|返|揉|もみ|浸|戻|冷ま|温め|むく|剥|洗|ちぎ|潰|つぶ|おろ|仕上|火/;
// 番号つきの行でも、分量だけの行（「1. 豚こま 200g」）は手順と数えない（材料の一覧に番号をつける人がいるため）。
// 分量のない番号つきの行は、短くても手順（「1. 卵を割る」）。分量がある行は、調理の動きがある時だけ手順。
const isStepLine = (l) => { const n = l.normalize("NFKC"); if (!(STEP_LINE.test(n) || /^\s*[①-⑳]\s*\S/.test(l))) return false; const body = n.replace(/^\s*(?:[①-⑳]|(?:step|ステップ|手順)\s*\d{1,2}|[(（]\d{1,2}[)）]|\d{1,2}\s*[.．、:：)）])\s*/i, ""); return !(body.match(AMOUNT) || []).length || COOK_VERB.test(body); };
export function looksLikeRecipe(text) {
  const raw = String(text || "");
  const t = raw.normalize("NFKC");
  if ((t.match(AMOUNT) || []).length < 3) return false;
  // ①〜⑳ は NFKC で数字に変わるので、元の文字のまま行を見る。
  const lines = raw.split(/\r?\n/);
  if (lines.filter(isStepLine).length >= 2) return true;
  const head = lines.findIndex((l) => /作り方|手順/.test(l));
  if (head < 0) return false;
  // 見出しのあとに、調理の動きの行が2つ以上（「作り方は動画をご覧ください」だけでは通さない）。
  return lines.slice(head + 1).filter((l) => COOK_VERB.test(l) && !/動画|概要|ブログ|http/.test(l)).length >= 2;
}
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
// 検索語を使い切った後の広げ方（2026-10-01 のユーザーの判断：「最新で話題」と「定番で長く愛される」の2方向を、重ならないように）。
//   話題 … 公開から WAVE_TREND_DAYS 日以内の動画を、再生の多い順に。同じ検索語は WAVE_TREND_REUSE_DAYS 日あけて使い直す（その間に新しい動画が出る）。
//   定番 … 公開から1年より前の動画を、再生の多い順に（長く見られている＝長く愛されている）。料理名ごとに1回だけ。
//          もう新着に同じ料理名が WAVE_CLASSIC_ENOUGH 品あれば、検索しない（0円・YouTube の枠も使わない）。
//   公開日で分けるので、2つの方向で同じ動画は出ない。試した動画・新着にある動画は、今までどおり重ねない。
export const WAVE_TREND_DAYS = 60;
export const WAVE_TREND_REUSE_DAYS = 7; // 2026-10-02 のユーザーの判断で14日 → 7日
export const WAVE_CLASSIC_AGE_DAYS = 365;
export const WAVE_CLASSIC_ENOUGH = 2;
export const WAVE_AXES = ["both", "trend", "classic"];
// 広げ方の検索は1日に WAVE_SEARCH_PER_DAY 回まで（1回100単位。YouTube の1日の枠1万単位のうち、毎日の新着集めの分を残す）。
export const WAVE_SEARCH_PER_DAY = 30;
export const WAVE_TREND_WORDS = [
  "晩ごはん レシピ 材料", "バズレシピ 夕飯 材料", "簡単 おかず レシピ 材料", "豚こま レシピ 材料", "鶏むね肉 レシピ 材料",
  "ひき肉 レシピ 材料", "野菜 おかず レシピ 材料", "魚 おかず レシピ 材料", "豆腐 レシピ 材料", "レンジ おかず 材料",
  "フライパンひとつ 晩ごはん 材料", "節約 夕飯 レシピ 材料", "丼 レシピ 材料", "麺 夕飯 レシピ 材料", "作り置き おかず 材料",
];
// 時短（2026-10-02 のユーザーの判断：「平日の夜に作る時短レシピを重点的に。話題・定番のそれぞれに組み込み、時短8割・30分以上2割」）。
//   段階で集めた料理のうち、30分以上（と時間が分からない料理）が QUICK_LONG_SHARE 未満なら、ふつうの検索。
//   それ以上なら、時短の言葉を足した検索（話題：「時短 …」・定番：「◯◯ 時短 …」）。
//   さらに、AI が読んだ調理時間が QUICK_MAX_MINUTES 分を超えた料理は、30分以上の割合が QUICK_LONG_SHARE を超えるなら入れない（long_quota）。
export const QUICK_MAX_MINUTES = 20;
export const QUICK_LONG_SHARE = 0.2;
export const isQuickDish = (minutes) => Number(minutes) > 0 && Number(minutes) <= QUICK_MAX_MINUTES;
// 段階の30分以上の割合が目標を超えているか（まだ1品もない時は、時短から始める）。
export const needQuick = (added = []) => !added.length || added.filter((a) => !isQuickDish(a.minutes)).length / added.length >= QUICK_LONG_SHARE;
// 30分以上の料理をもう1品入れてよいか（入れた後も QUICK_LONG_SHARE 以下＝時短が4品そろうごとに1品）。
export const longRoom = (added = []) => { const long = added.filter((a) => !isQuickDish(a.minutes)).length; return long + 1 <= Math.floor((added.length + 1) * QUICK_LONG_SHARE); };
// 定番は1回の検索で WAVE_CLASSIC_PICK 本まで（同じ料理のアレンジばかり増えない・第3段階で鮭のムニエルが8品増えた）。
export const WAVE_CLASSIC_PICK = 3;
// 定番の料理名と分野（品ぞろえの棚卸し docs/CATALOG_COVERAGE.md の分野。1回の段階でいろいろな分野が入るように混ぜて並べる）。
export const WAVE_CLASSIC_DISHES = [
  ["肉じゃが", "肉"], ["さばの味噌煮", "魚"], ["八宝菜", "野菜が主役"], ["揚げ出し豆腐", "卵・豆腐"],
  ["生姜焼き", "肉"], ["ぶり大根", "魚"], ["野菜炒め", "野菜が主役"], ["麻婆豆腐", "卵・豆腐"],
  ["唐揚げ", "肉"], ["鮭のムニエル", "魚"], ["ロールキャベツ", "野菜が主役"], ["厚揚げの煮物", "卵・豆腐"],
  ["ハンバーグ", "肉"], ["鮭のちゃんちゃん焼き", "魚"], ["筑前煮", "野菜が主役"], ["かに玉", "卵・豆腐"],
  ["鶏の照り焼き", "肉"], ["かれいの煮付け", "魚"], ["なすの煮びたし", "野菜が主役"], ["ゴーヤチャンプルー", "卵・豆腐"],
  ["回鍋肉", "肉"], ["あじフライ", "魚"], ["豚汁", "野菜が主役"], ["肉豆腐", "卵・豆腐"],
  ["チキン南蛮", "肉"], ["さばの竜田揚げ", "魚"], ["白菜と豚バラの重ね蒸し", "野菜が主役"], ["親子丼", "卵・豆腐"],
  ["青椒肉絲", "肉"], ["たらのホイル焼き", "魚"], ["きんぴらごぼう", "野菜が主役"], ["オムライス", "卵・豆腐"],
  ["豚の角煮", "肉"], ["いわしの蒲焼き", "魚"], ["ポトフ", "野菜が主役"], ["牛丼", "肉"],
  ["餃子", "肉"], ["酢豚", "肉"], ["カレー", "肉"], ["クリームシチュー", "野菜が主役"],
];
// 料理名を比べる時の形（全角半角・カタカナとひらがなの違いをそろえる）。
const dishKey = (s) => String(s || "").normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, "");
const emptyWaves = () => ({ turn: 0, trend: 0, trendAt: {}, classic: 0, log: [], n: 0 });
// 次に使う広げ方の検索（使えるものがなければ null）。doc.waves を進める。haveDish(料理名) は、もう新着にある品数。
export async function nextWave(doc, axis, nowMs, haveDish = async () => 0, { quick = false } = {}) {
  const w = (doc.waves ||= emptyWaves());
  const trend = () => {
    for (let k = 0; k < WAVE_TREND_WORDS.length; k++) {
      const i = (w.trend + k) % WAVE_TREND_WORDS.length, q = WAVE_TREND_WORDS[i];
      if (nowMs - (Date.parse(w.trendAt[q] || 0) || 0) < WAVE_TREND_REUSE_DAYS * DAY) continue;
      w.trend = i + 1; w.trendAt[q] = new Date(nowMs).toISOString();
      return { axis: "trend", q: quick ? `時短 ${q}` : q, word: q, quick, label: "話題の新作", opts: { videoDuration: "medium", publishedAfter: new Date(nowMs - WAVE_TREND_DAYS * DAY).toISOString() } };
    }
    return null;
  };
  const classic = async () => {
    while (w.classic < WAVE_CLASSIC_DISHES.length) {
      const [dish, group] = WAVE_CLASSIC_DISHES[w.classic++];
      if ((await haveDish(dish)) >= WAVE_CLASSIC_ENOUGH) { w.log.push({ n: ++w.n, axis: "classic", q: dish, label: `定番・${group}`, at: new Date(nowMs).toISOString(), skipped: "enough", picked: 0, added: 0 }); continue; }
      return { axis: "classic", q: quick ? `${dish} 時短 レシピ 材料` : `${dish} レシピ 材料 作り方`, quick, label: `定番・${group}`, opts: { videoDuration: "medium", publishedBefore: new Date(nowMs - WAVE_CLASSIC_AGE_DAYS * DAY).toISOString() } };
    }
    return null;
  };
  const order = axis === "trend" ? [trend] : axis === "classic" ? [classic] : (w.turn++ % 2 ? [classic, trend] : [trend, classic]);
  for (const f of order) {
    const next = await f();
    if (next) { const entry = { n: ++w.n, axis: next.axis, q: next.q, ...(next.quick ? { quick: true } : {}), label: next.label, at: new Date(nowMs).toISOString(), picked: 0, added: 0, ai: 0, aiAdded: 0 }; /* ai・aiAdded は0から数える（記録がない古い検索と区別する） */ w.log.push(entry); w.log = w.log.slice(-200); return { ...next, n: entry.n }; }
  }
  w.log = w.log.slice(-200);
  return null;
}
// 管理の画面に出す、広げ方の残り。
export function waveStatus(doc, nowMs) {
  const w = doc?.waves || { trendAt: {}, classic: 0, log: [] };
  const ready = WAVE_TREND_WORDS.filter((q) => nowMs - (Date.parse(w.trendAt?.[q] || 0) || 0) >= WAVE_TREND_REUSE_DAYS * DAY).length;
  const next = WAVE_TREND_WORDS.map((q) => Date.parse(w.trendAt?.[q] || 0) || 0).filter((t) => nowMs - t < WAVE_TREND_REUSE_DAYS * DAY).sort((a, b) => a - b)[0];
  return { trendReady: ready, trendTotal: WAVE_TREND_WORDS.length, trendNextAt: !ready && next ? new Date(next + WAVE_TREND_REUSE_DAYS * DAY).toISOString() : null,
    classicLeft: Math.max(0, WAVE_CLASSIC_DISHES.length - (w.classic || 0)), classicTotal: WAVE_CLASSIC_DISHES.length,
    quickMaxMinutes: QUICK_MAX_MINUTES, quickLongShare: QUICK_LONG_SHARE, trendReuseDays: WAVE_TREND_REUSE_DAYS,
    searchedToday: w.day?.on === new Date(nowMs + 9 * 3_600_000).toISOString().slice(0, 10) ? w.day.n : 0, searchPerDay: WAVE_SEARCH_PER_DAY, log: (w.log || []).slice(-60).reverse() };
}
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
export function createTrendBook(store, { catalog, search, optedOut = async () => new Set(), searchChannels = async () => [], channelUploads = async () => [], channelIcons = async () => ({}), writeCatches = async () => ({}), videoDetails = null, dishBook = null, nameDishes = null, reserveBudget = async () => {}, now = Date.now, budgetMs = 150_000, dailyLimit = 100, perDay = TREND_PER_DAY, weekMax = TREND_WEEK_MAX, aiPerDay = TREND_AI_PER_DAY, aiPerWeek = TREND_AI_PER_WEEK, yenPerMonth = TREND_YEN_PER_MONTH, yenPerAi = TREND_YEN_PER_AI, pause = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
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
    // 実測の費用は、保存したトークン数から今の単価・換算で出し直す（換算を変えても、過去の段階と比べられるように）。
    const yenMeasured = stage.input || stage.output ? Math.round(usageYen(stage) * 100) / 100 : stage.yenMeasured;
    return { ...stage, added, ...(yenMeasured !== undefined ? { yenMeasured } : {}) };
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
    // 説明欄の読み取りは軽く（考える部分を使わない）。動画から読む時は今のまま。
    try { result = await usage.run({ lite: true }, () => catalog.import(url, { aiGate })); } catch (error) {
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
    async seed({ yen = 100, axis = "both" } = {}) {
      if (!WAVE_AXES.includes(axis)) axis = "both";
      required();
      if (!(await lock())) return { busy: true };
      const started = now();
      try {
        const today = dayOf(now()), month = today.slice(0, 7);
        const entry = await store.get("trends/seed");
        const doc = { stages: [], q: 0, candidates: [], tried: [], ...(entry?.envelope || {}) };
        // 段階の記録を保存する（世代つき。断られた時だけやり直し、例外ではやり直さない）。保存できたら true。
        const saveSeed = async () => {
          doc.tried = doc.tried.slice(-5000);
          doc.candidates = doc.candidates.slice(0, 200);
          for (let attempt = 0; attempt < 2; attempt++) {
            const cur = await store.get("trends/seed");
            let ok;
            // その時点の写しを保存する（あとで doc を書きかえても、保存した記録は変わらない）。
            try { ok = await store.put("trends/seed", structuredClone(doc), { ifGeneration: cur?.generation ?? 0 }); } catch { return false; }
            if (ok) return true;
          }
          return false;
        };
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
        let reserveFailed = after === null && reserved > 0;
        if (after === null) reserved = 0;
        // 段階の側も、AI を呼ぶ前に予約した回数を「使った」として先に保存する（保存できなければ AI を呼ばない）。
        // あとで実際の回数に直す。直せなくても、多めに数えたまま＝段階の金額は超えない。
        const committed = stage.ai;
        if (reserved) {
          stage.ai = committed + reserved;
          if (!(await saveSeed())) {
            stage.ai = committed;
            await writeMonthCost(month, (used) => Math.max(0, used - reserved));
            reserved = 0; reserveFailed = true;
          }
        }
        // 3本を同時に読むので、AI を呼んでよいかの確認（allow）の時点で1回分を確保する（確保したら、呼べなかった時も使った扱い＝多めに数える）。
        let claimed = 0;
        const gate = { allow: () => (claimed < reserved ? ((claimed += 1), true) : false), used: () => { spent += 1; } };
        const why = () => (reserveFailed ? "cost_not_saved" : committed + claimed >= Math.floor(stage.yen / Math.max(0.01, yenPerAi)) ? "stage_budget" : "month_budget");
        const ixEntry = await readIndex();
        const index = { weeks: (ixEntry?.envelope.weeks || []).filter(fresh), ...(ixEntry?.envelope.refreshedOn ? { refreshedOn: ixEntry.envelope.refreshedOn } : {}) };
        let week = index.weeks.find((w) => w.seed && w.stage === stage.n);
        if (!week) { week = { week: weekOf(now()), seed: true, stage: stage.n, startedAt: stage.startedAt, candidates: [], tried: [], items: [], skipped: {} }; index.weeks.push(week); }
        const seen = new Set([...index.weeks.flatMap((w) => w.items.map((i) => i.videoId)), ...doc.tried]);
        const excluded = await optedOut();
        // lite：説明欄の読み取りで AI に「考える」部分を使わせない（費用を下げる。analyzer.js）。
        const collector = { lite: true };
        const done = (c, why) => { doc.tried.push(c.videoId); seen.add(c.videoId); if (why) skip(why); };
        let reason = "", waveUndo = null;
        // 定番の料理名が、もう新着に何品あるか（保存済みの題名から。0円。1回の実行で1回だけ読む）。
        let dishTitles = null;
        const haveDish = async (dish) => {
          if (!dishTitles) {
            dishTitles = [];
            const ids = [...new Set(index.weeks.flatMap((w) => w.items.map((i) => i.videoId)))];
            for (let i = 0; i < ids.length; i += 20) dishTitles.push(...(await Promise.all(ids.slice(i, i + 20).map((v) => peek(v).then((r) => dishKey(r?.title)).catch(() => "")))));
          }
          const key = dishKey(dish);
          return dishTitles.filter((t) => t.includes(key)).length;
        };
        while (now() - started < budgetMs) {
          if (!doc.candidates.length) {
            // AI の枠を使い切ったら、新しく検索しない（YouTube の枠のむだを省く）。
            if (claimed >= reserved) { reason = why(); break; }
            // 決めた検索語を使い切ったら、広げ方（話題・定番）の検索へ。
            let q, label, opts = { videoDuration: "medium" }, wave = null;
            if (doc.q < SEED_QUERIES.length) [q, label] = SEED_QUERIES[doc.q];
            else {
              const day = doc.waves?.day?.on === today ? doc.waves.day.n : 0;
              if (day >= WAVE_SEARCH_PER_DAY) { reason = "search_day_limit"; break; }
              doc.waves ||= emptyWaves();
              const waveDoc = structuredClone(doc.waves);
              wave = await nextWave(doc, axis, now(), haveDish, { quick: needQuick(stage.added) });
              // 選んだ方向だけ使い切った時は、段階を終わりにしない（もう一方の方向で続けられる）。
              if (!wave) { reason = axis === "both" ? "exhausted" : "axis_exhausted"; break; }
              ({ q, label, opts } = wave);
              doc.waves.day = { on: today, n: day + 1 };
              waveUndo = waveDoc;
            }
            let found;
            // 失敗した時は、同じ検索語をあとでやり直せるように位置を戻す（呼んだ検索の回数 day は戻さない＝1日の上限を守る）。
            const undoWave = () => { if (wave) doc.waves = { ...waveUndo, day: doc.waves.day }; };
            try { found = await search(q, opts); } catch { undoWave(); reason = "search_failed"; break; }
            const perChannel = {};
            const picked = [];
            for (const c of found) {
              if (seen.has(c.videoId) || picked.some((x) => x.videoId === c.videoId) || NOT_DINNER.test(c.title) || !TREND_MARKET.titleLooksLocal(c.title) || excluded.has(c.channelId) || excluded.has(c.videoId)) { skip("filtered"); continue; }
              if ((perChannel[c.channelId] = (perChannel[c.channelId] || 0) + 1) > 2) { skip("same_channel"); continue; }
              if (wave?.axis === "classic" && picked.length >= WAVE_CLASSIC_PICK) { skip("classic_enough"); continue; }
              picked.push({ videoId: c.videoId, channelId: c.channelId || "", label, ...(wave ? { wave: wave.n, axis: wave.axis } : {}) });
            }
            // AI の前に、説明欄に作り方が書いてあるかを YouTube の情報で確かめる（50本で1単位。AI の費用はかからない）。
            // もう読んだ動画（0円）は確かめずに残す。説明欄は記録に残さない。
            if (videoDetails && picked.length) {
              const need = [];
              for (const c of picked) if (!(await peek(c.videoId).catch(() => null))) need.push(c.videoId);
              let details = {};
              try { details = need.length ? await videoDetails(need) : {}; } catch { undoWave(); reason = "search_failed"; break; }
              for (const c of picked) {
                const d = details[c.videoId];
                if (!need.includes(c.videoId)) doc.candidates.push(c);
                else if (d?.status !== "public") done(c, "not_public");
                else if (!looksLikeRecipe(d.snippet?.description)) done(c, "description_not_recipe");
                else doc.candidates.push({ ...c, channelId: c.channelId || d.snippet?.channelId || "" });
              }
            } else doc.candidates.push(...picked);
            if (wave) { const e = doc.waves.log.find((x) => x.n === wave.n); if (e) e.picked = doc.candidates.filter((c) => c.wave === wave.n).length; }
            else doc.q += 1;
            continue;
          }
          // 次の3本（重複・掲載停止は読む前に外す）。
          const batch = [];
          while (batch.length < SEED_PARALLEL && doc.candidates.length) {
            const c = doc.candidates.shift();
            if (seen.has(c.videoId) || batch.some((x) => x.videoId === c.videoId)) { skip("duplicate"); continue; }
            // 持ち越した候補も、読む前に掲載停止（動画・チャンネル）を確かめ直す（あとから止められた動画に費用を使わない）。
            if (excluded.has(c.videoId) || (c.channelId && excluded.has(c.channelId))) { done(c, "opted_out"); continue; }
            batch.push(c);
          }
          if (!batch.length) continue;
          const results = await Promise.all(batch.map(async (c) => {
            // もう読んだ動画は、保存済みの結果を使う（AI を呼ばない）。
            const cached = await peek(c.videoId).catch(() => null);
            if (cached) return { c, r: cached, free: true };
            try { return { c, r: await usage.run(collector, () => catalog.import(canonicalYouTubeUrl(c.videoId), { aiGate: gate })), free: false }; }
            catch (error) { return { c, error }; }
          }));
          const back = [];
          // 方向ごとの効率を比べるため、AI で読んだ本数を検索ごとに数える（戻した候補・0円は数えない）。
          for (const { c, free, error } of results) {
            if (!c.wave || free || (error && (error.code === "trend_ai_budget" || WAIT_CODES.has(error.code) || STOP_CODES[error.code]))) continue;
            const e = (doc.waves?.log || []).find((x) => x.n === c.wave); if (e) e.ai = (e.ai || 0) + 1;
          }
          for (const { c, r, free, error } of results) {
            if (error) {
              if (error.code === "trend_ai_budget") { back.push(c); reason ||= why(); continue; }
              // 直前に断られた動画の待ち時間（1分）・ほかで読んでいる最中：試し終わりにせず候補に戻し、ひと休み（次に押すと続きから）。
              if (WAIT_CODES.has(error.code)) { back.push(c); reason ||= "wait"; continue; }
              if (STOP_CODES[error.code]) { back.push(c); reason ||= STOP_CODES[error.code]; continue; }
              done(c, String(error.code || "error").slice(0, 40)); continue;
            }
            done(c);
            if ((r?.channelId && excluded.has(r.channelId)) || excluded.has(c.videoId)) { skip("opted_out"); continue; }
            if (!isDinnerRecipe(r)) { skip(!(r?.steps || []).length ? "no_steps_in_description" : NOT_DINNER.test(r?.title || "") ? "not_dinner" : "too_short"); continue; }
            // 広げ方の料理は、時短8割・30分以上2割に：30分以上（時間が分からない料理も）は、割合を超えるなら入れない。
            if (c.wave && !isQuickDish(r.planning?.minutes) && !longRoom(stage.added)) { skip(free ? "long_quota_free" : "long_quota"); continue; } /* 0円で読んだ料理は、AI で読んだ結果に数えない（review fix #129） */
            week.items.push({ videoId: c.videoId, day: today });
            // 題名は YouTube の情報なので、記録には残さない（見せる時に保存済みの結果から読む＝30日ルールの中）。
            stage.added.push({ videoId: c.videoId, label: c.label, minutes: r.planning?.minutes || null, free });
            stage.byQuery[c.label] = (stage.byQuery[c.label] || 0) + 1;
            if (c.axis) { stage.byAxis = stage.byAxis || {}; stage.byAxis[c.axis] = (stage.byAxis[c.axis] || 0) + 1; }
            // aiAdded：AI で読んで料理になった本数（0円の料理は数えない。「当たり」＝ aiAdded ÷ ai の分子）。
            if (c.wave) { const e = (doc.waves?.log || []).find((x) => x.n === c.wave); if (e) { e.added += 1; if (!free) e.aiAdded = (e.aiAdded || 0) + 1; } }
          }
          // 読めなかった候補（AI の枠・止める理由）は、次に押した時のために先頭へ戻す。
          if (back.length) doc.candidates.unshift(...back);
          if (reason) break;
        }
        if (!reason) reason = "time"; // 時間切れ：もう一度押すと続きから
        stage.ai = committed + claimed;
        stage.input += collector.input || 0;
        stage.output += collector.output || 0;
        stage.yenEstimate = Math.round(stage.ai * yenPerAi);
        stage.yenMeasured = Math.round(usageYen(stage) * 100) / 100;
        stage.done = ["exhausted", "stage_budget", "month_budget"].includes(reason);
        stage.reason = reason;
        if (!week.items.length) index.weeks = index.weeks.filter((w) => w !== week);
        await writeIndex(index);
        if (reserved > claimed) await writeMonthCost(month, (used) => Math.max(0, used - (reserved - claimed)));
        cache = null;
        // 記録を保存できなければ、成功として返さない（段階の回数は予約した多めのまま。試した動画はもう読んだ結果があるので、次は0円）。
        if (!(await saveSeed())) throw new ApiError(503, "seed_not_saved", claimed ? "集めた結果の記録を保存できませんでした。少し待ってから、もう一度押してください（費用は多めに数えたままです）。" : "記録を保存できませんでした（AI は使っていません）。少し待ってから、もう一度押してください。");
        return { stage: await withTitles(stage), reason, axis, queriesLeft: SEED_QUERIES.length - doc.q, waves: waveStatus(doc, now()), candidatesLeft: doc.candidates.length, month: { ai: monthUsed + claimed, cap: monthCap, yen: Math.round((monthUsed + claimed) * yenPerAi), yenCap: yenPerMonth } };
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
    // 親の料理名を直した時など、表示のキャッシュを捨てる。
    clearCache() { cache = null; },
    // 集めた料理（新着の週に入っている料理）のうち、AI の料理名（dishName）がないものに、あとから付ける（APP_MAP §48-3）。
    // 説明欄は読み直さず、題名・材料・手順の頭だけを20品ずつ AI に渡す（1回 = AI 1回。月の上限に数え、呼ぶ前に予約する）。運営が直した料理は上書きしない。
    async backfillDishNames({ maxCalls = 3, dryRun = false } = {}) {
      required();
      if (!dryRun && typeof nameDishes !== "function") throw new ApiError(503, "not_configured", "料理名を付ける設定がありません。");
      if (!dryRun && !(await lock())) return { busy: true };
      const started = now();
      try {
        const month = dayOf(now()).slice(0, 7);
        const ids = [...new Set(((await readIndex())?.envelope.weeks || []).flatMap((w) => w.items.map((i) => i.videoId)))];
        const targets = [];
        for (const id of ids) {
          const r = await peek(id).catch(() => null);
          if (r && !r.dishName && r.dishNameFrom !== "admin" && r.dishNameFrom !== "ai-backfill") targets.push({ videoId: id, title: r.title || "", ingredients: r.ingredients || [], steps: r.steps || [] });
        }
        // 数えるだけ（管理の画面に、まだ付いていない品数と目安の回数を出す）。
        if (dryRun) return { total: targets.length, calls: Math.ceil(targets.length / 20), yenPerAi };
        const collector = { lite: true };
        let named = 0, calls = 0, processed = 0, failed = 0, reason = "";
        // 保存は1回だけやり直す。それでも保存できない料理は「済み」に数えない（残りに入れ、done にしない）。
        const retry = async (fn) => { for (let a = 0; a < 2; a++) { const r = await fn().catch(() => null); if (r) return r; } return null; };
        for (let i = 0; i < targets.length && calls < maxCalls; i += 20) {
          if (now() - started > budgetMs) { reason = "time"; break; }
          const capCalls = monthCapCalls();
          const reserved = await writeMonthCost(month, (used) => (used + 1 <= capCalls ? used + 1 : null));
          if (reserved === null) { reason = "month_budget"; break; }
          calls += 1;
          const batch = targets.slice(i, i + 20);
          let names = {};
          try { names = await usage.run(collector, () => nameDishes(batch)); } catch { reason = "ai_failed"; break; }
          for (const b of batch) {
            const url = canonicalYouTubeUrl(b.videoId);
            // 名前が返った料理は名前を保存、返らなかった料理は「試した」印（同じ料理に何度も費用を使わない）。
            const ok = names[b.videoId]
              ? await retry(() => catalog.setDishName(url, names[b.videoId], { from: "ai" }))
              : await retry(async () => ((await catalog.markDishNameTried?.(url)) ? { tried: true } : null));
            if (!ok) { failed += 1; continue; }
            processed += 1;
            if (ok.dishName && !ok.skipped) named += 1;
          }
        }
        cache = null;
        const left = Math.max(0, targets.length - processed);
        return { named, calls, left, failed, total: targets.length, reason: reason || (failed ? "save_failed" : left ? "more" : "done"), yenMeasured: Math.round(usageYen(collector) * 100) / 100 };
      } finally { if (!dryRun) await unlock(); }
    },
    // promote：親の料理名の格上げもする（公開の GET /api/trends）。管理の読み出しでは false（辞書を書きかえない）。
    async list({ promote = true } = {}) {
      required();
      const day = new Date(now() + 9 * 3_600_000).toISOString().slice(0, 10);
      // 日ごとの順なので、日本時間の日付が変わったらキャッシュも使わない。
      if (cache && cache.until > now() && cache.day === day) return cache.value;
      const keep = promote; // 格上げしない読み出しの結果は、キャッシュに入れない（公開の GET で格上げされるように）
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
              ...(c ? { catch: c } : {}), ...(r.dishName ? { dishName: r.dishName } : {}), sourceServings: r.sourceServings ?? null, ingredients: r.ingredients, steps: r.steps, stepTimes: r.stepTimes || [], tags: r.tags || [], planning: r.planning || null });
          } catch {}
        }
      }
      // 投稿者のアイコン：集める側が保存したものを使うだけ。
      const iconMap = pruneIcons((await store.get("trends/icons"))?.envelope, now());
      items.forEach((i) => { if (iconMap[i.channelId]) i.channelThumb = iconMap[i.channelId].url; });
      // 親の料理名（APP_MAP §48）：同じ料理名がそろったら、ここで格上げも（AI は使わない）。
      const dishes = await (dishBook || createDishBook(store, { now })).classify(items, { promote }).catch(() => ({}));
      items.forEach((i) => { if (dishes[i.videoId]) i.dish = dishes[i.videoId]; });
      items.sort((a, b) => dailyRank(day, a.videoId) - dailyRank(day, b.videoId));
      const value = { items, updatedAt: new Date(now()).toISOString() };
      if (keep) cache = { value, until: now() + 10 * 60_000, day };
      return value;
    }
  };
}
