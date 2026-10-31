import { localizeAmount, localizeStep } from "./units.js";
import { cleanDishName } from "./dishes.js";
import { ApiError } from "./errors.js";
import { canonicalYouTubeUrl, extractYouTubeVideoId, fetchYouTubeSnippet } from "./youtube.js";
import { parseChapters, timesFromChapterIndexes, parseTimeValue } from "./chapters.js";
import { refineStepTimes } from "./timecodeCheck.js";
import { detectServings } from "./servings.js";
import { formatTranscriptForPrompt } from "./transcript.js";

const DEFAULT_CATEGORY = "その他";
const NUTRITION = /kcal|キロカロリー|カロリー|糖質|たんぱく質|タンパク質|脂質|炭水化物|食物繊維|塩分|PFC|1人前あたり|1人分あたり/i;

const VIDEO_MAX_SECONDS = 600;

// まず説明文（安い）。作り方か材料が取れない時だけ、短い動画を映像ごと読む。

// 元の手順（説明欄）に含まれる時間・数値指定（例: 「中火で10分」など）が、
// 新しい手順で勝手に別の数字（例: 「中火で1分」など）に書き換えられていないか検証する
function validateNumbersConsistency(rawSteps = [], newSteps = []) {
  if (!Array.isArray(rawSteps) || rawSteps.length < 2 || !Array.isArray(newSteps) || !newSteps.length) return true;
  const extractTimeNums = (steps) => {
    const map = new Map();
    for (const step of steps) {
      const s = String(step || "");
      const matches = s.matchAll(/(\d+(?:\.\d+)?)\s*(分(?:間)?|秒(?:間)?|時間)/g);
      for (const m of matches) {
        const val = Number(m[1]);
        const unit = m[2];
        const sec = unit === "時間" ? Math.round(val * 3600) : unit.startsWith("分") ? Math.round(val * 60) : Math.round(val);
        map.set(`${val}${unit}`, sec);
      }
    }
    return map;
  };
  const rawMap = extractTimeNums(rawSteps);
  const newMap = extractTimeNums(newSteps);
  if (!rawMap.size || !newMap.size) return true; // 新手順に時間の数字がなければ要約とみなして通す

  // 新手順に数字が登場している場合、元の数字と全く合わず大幅に縮小・乖離している（例: 元が10分焼くで新が1分焼く）矛盾を検出
  for (const [newLabel, newSec] of newMap.entries()) {
    // 新手順に出てきた時間指定が、元手順の時間指定のどれとも一致せず、元の最大時間と大幅に乖離している場合は警戒
    const rawSecs = [...rawMap.values()];
    // 秒数がほぼ一致（例: 0.5時間 と 30分、または 1〜2秒以内の丸め差）していれば同じ時間指定
    const hasEquivalent = rawSecs.some((r) => Math.abs(r - newSec) <= 10);
    if (!hasEquivalent) {
      const closest = Math.min(...rawSecs.map((r) => Math.abs(r - newSec)));
      // 元の指定時間のいずれとも5倍以上の差がある新しい時間指定は数値の勝手な捏造と判定
      if (closest > 180 && rawSecs.every((r) => r >= newSec * 5 || newSec >= r * 5)) {
        return false;
      }
    }
  }
  return true;
}
export async function importYouTubeRecipe(rawUrl, deps = {}, options = {}) {
  const videoId = extractYouTubeVideoId(rawUrl);
  // 管理画面に見せる処理段階（1〜5。表示の失敗で取り込みを止めない）。
  const progress = (stage, detail = "") => { try { options.onProgress?.({ stage, detail }); } catch { /* 表示だけの通知 */ } };
  progress(1, "動画情報・説明欄を取得中");
  const snippet = await (deps.fetchYouTubeSnippet || fetchYouTubeSnippet)(videoId);
  const videoUrl = canonicalYouTubeUrl(videoId, rawUrl);
  const hasDescription = !!String(snippet.description || "").trim();
  let analysis = hasDescription ? await deps.analyzeRecipeDescription(snippet) : {};
  let analyzedFrom = "description";
  let analyzedTimes = "";
  // 説明文に本当の手順がない（AIの判定・手順が1つ以下）なら、説明文の「手順」は使わず動画を読む。
  if (analysis.stepsInDescription === false || normalizeSteps(analysis.steps).length < 2) analysis = { ...analysis, steps: [] };
  const weak = options.forceVideo || !normalizeSteps(analysis.steps).length || !normalizeIngredients(analysis.ingredients).length;
  const maxSeconds = Number(options.videoMaxSeconds ?? VIDEO_MAX_SECONDS);
  const duration = Number.isFinite(snippet.durationSeconds) && snippet.durationSeconds > 0 ? snippet.durationSeconds : null;
  // 長い動画（や長さ不明）は頭から maxSeconds だけを見る。作り方がその中で完結した時だけ使う。
  const clipSeconds = !duration || duration > maxSeconds ? maxSeconds : null;
  // 動画はボタンを押した時（forceVideo）だけ読む。取り込みでは読まず、読めることだけ知らせる（1日の上限の回数を勝手に使わない）。
  const videoSkipped = weak && !options.forceVideo;
  if (weak && options.forceVideo && maxSeconds > 0 && typeof deps.analyzeRecipeVideo === "function") {
    try {
      await options.reserveBudget?.();
      // 接続先を切り替えて読み直す時も、その直前ごとに予算を通す（beforeRetry）。
      const video = await deps.analyzeRecipeVideo(`https://www.youtube.com/watch?v=${videoId}`, snippet, { clipSeconds, beforeRetry: options.reserveBudget });
      const complete = video.stepsComplete !== false;
      const videoSteps = complete ? normalizeSteps(video.steps) : [];
      const videoIngredients = normalizeIngredients(video.ingredients);
      analysis = {
        ...analysis,
        title: analysis.title || video.title,
        // 説明欄のない動画は、動画から読んだ料理名を使う。
        dishName: cleanDishName(analysis.dishName) || cleanDishName(video.dishName) || undefined,
        sourceServings: Number.isInteger(analysis.sourceServings) ? analysis.sourceServings : video.sourceServings,
        ingredients: normalizeIngredients(analysis.ingredients).length ? analysis.ingredients : videoIngredients,
        steps: videoSteps.length ? videoSteps : analysis.steps,
        stepTimes: videoSteps.length && Array.isArray(video.stepTimes)
          ? video.stepTimes.map((t) => (clipSeconds !== null && Number.isFinite(t) && t >= clipSeconds ? null : t))
          : undefined,
        tags: analysis.tags?.length ? analysis.tags : video.tags,
        planning: videoSteps.length && video.planning ? video.planning : analysis.planning || video.planning
      };
      if (videoSteps.length) analyzedFrom = clipSeconds ? "video-clip" : "video";
    } catch (error) {
      // 「読めたがレシピではなかった」（analysis_uncertain）だけは、説明欄の結果で続ける。
      // 通信・AIの失敗・回数の上限は、呼び出し元まで伝える（「レシピが不完全」と区別し、やり直せるように）。
      if (!hasDescription || error?.code !== "analysis_uncertain") throw error;
    }
  }
  if (!hasDescription && !analyzedFrom.startsWith("video")) throw new ApiError(422, "empty_description", "この動画には解析できる説明文がありません。");

  // 字幕ハイブリッド生成：説明欄の材料があり、動画解析をしていない場合で、字幕が存在すれば動画の段取りに沿った手順とタイムコードを生成する
  const rawSteps = normalizeSteps(analysis.steps);
  const rawIngredients = normalizeIngredients(analysis.ingredients);
  const shouldTryHybrid = !analyzedFrom.startsWith("video") && rawIngredients.length > 0 && typeof deps.buildHybridRecipeSteps === "function" && typeof deps.fetchYouTubeTranscript === "function";

  if (!shouldTryHybrid && !analyzedFrom.startsWith("video")) {
    progress(1, rawIngredients.length ? "字幕での整理ができない設定です（サーバーの設定）" : "説明欄から材料を読み取れなかったため、字幕での整理をスキップしました");
  }
  if (shouldTryHybrid) {
    progress(1, "字幕を取得中");
    const transcriptRes = await deps.fetchYouTubeTranscript(videoId).catch(() => null);
    const items = transcriptRes?.status === "ok" && Array.isArray(transcriptRes?.items) ? transcriptRes.items : (Array.isArray(transcriptRes) ? transcriptRes : null);
    progress(1, items && items.length ? `字幕を取得しました（${items.length}行）` : `字幕を取得できませんでした（${transcriptRes?.status || "応答なし"}${transcriptRes?.reason || transcriptRes?.error ? `：${transcriptRes.reason || transcriptRes.error}` : ""}）。説明欄だけで続けます`);
    if (items && items.length) {
      const { text, cues, truncated } = formatTranscriptForPrompt(items, { maxSeconds: duration || 1800 });
      // 字幕が文字数や動画尺上限で途中で切れており、かつ説明欄に元の手順がない場合（rawSteps.length < 2）、
      // 後半が抜けた不完全な手順になるため、ハイブリッド生成をスキップして動画読み取り待ちを維持する
      const skipTruncatedWithoutSteps = truncated && rawSteps.length < 2;
      if (skipTruncatedWithoutSteps) progress(1, "字幕が長すぎて途中までしか使えず、説明欄にも手順がないため、字幕での整理をスキップしました");
      if (!skipTruncatedWithoutSteps) {
        const budgetOk = options.reserveBudget ? await options.reserveBudget().then(() => true, () => false) : true;
        if (!budgetOk) progress(2, "AI の予算の上限のため、字幕での整理をスキップしました");
        if (budgetOk) {
          progress(2, "字幕に沿って調理ブロックを整理中（AI応答待ち）");
          let hybridErr = null;
          const hybrid = await deps.buildHybridRecipeSteps({
            title: analysis.title || snippet.title,
            ingredients: rawIngredients,
            steps: rawSteps,
            formattedTranscript: text,
            cues
          }).catch((err) => {
            hybridErr = String(err?.message || err);
            console.error(JSON.stringify({ event: "hybrid_recipe_failed", videoId, message: hybridErr.slice(0, 300) }));
            return null;
          });

          const isComplete = hybrid?.stepsComplete !== false;
          // 工程数が減ること自体は悪くない（作業のまとまりに整理するため）。説明欄の半分未満まで減った時だけ、抜けを疑って採用しない。
          const numbersValid = validateNumbersConsistency(rawSteps, hybrid?.steps);
          const isBetterOrCoarse = numbersValid && (rawSteps.length <= 4 || (hybrid?.steps?.length >= Math.ceil(rawSteps.length / 2)));
          if (hybrid && Array.isArray(hybrid.steps) && hybrid.steps.length >= 2 && isComplete && isBetterOrCoarse) {
            analysis = {
              ...analysis,
              steps: hybrid.steps,
              stepTimes: hybrid.stepTimes
            };
            analyzedFrom = "description+transcript";
            progress(2, "字幕に沿った整理結果を採用しました");
            if (Array.isArray(hybrid.stepTimes) && hybrid.stepTimes.some((t) => t !== null)) {
              analyzedTimes = "transcript";
            }
          } else {
            progress(2, hybrid ? `AI の整理結果を採用しませんでした（${Array.isArray(hybrid.steps) ? hybrid.steps.length : 0}工程${isComplete ? "" : "・字幕が途中までで不完全"}）` : `AI の整理が失敗しました（${hybridErr || "応答なし"}）`);
          }
        }
      }
    }
  }

  // 説明欄に投稿者のタイムスタンプがあれば、手順の時刻はそれに合わせる（AIが動画から探した時刻より正確）。
  const chapters = parseChapters(snippet.description);
  const finalSteps = normalizeSteps(analysis.steps);
  // チャプターとの対応付けも AI の1回。字幕タイムコードがまだない場合のみ行う。
  const chaptersAllowed = !analyzedTimes && chapters.length && finalSteps.length >= 2 && typeof deps.matchStepsToChapters === "function" && (options.reserveBudget ? await options.reserveBudget().then(() => true, () => false) : true);
  if (chaptersAllowed) {
    progress(3, "説明欄の章と照合中（AI応答待ち）");
    const matched = await deps.matchStepsToChapters(finalSteps, chapters).catch(() => null);
    const times = timesFromChapterIndexes(matched?.chapterIndex, chapters, finalSteps.length);
    if (times.some((t) => t !== null)) { analysis = { ...analysis, stepTimes: refineStepTimes(finalSteps, times, { durationSeconds: duration }) }; analyzedTimes = "chapters"; }
  } else if (!analyzedTimes && Array.isArray(analysis.stepTimes) && finalSteps.length >= 2) {
    analysis = { ...analysis, stepTimes: refineStepTimes(finalSteps, analysis.stepTimes, { durationSeconds: duration }) };
  }

  // AIが人数を取りこぼした時は、説明文とタイトルから決まったルールで読む。
  if (!Number.isInteger(analysis.sourceServings) || analysis.sourceServings < 1) {
    const n = detectServings(`${snippet.description || ""}\n${snippet.title || ""}`);
    if (n) analysis = { ...analysis, sourceServings: n };
  }
  return {
    ...normalizeImportResult({
      ...analysis,
      caption: buildCaption(snippet),
      source: /youtube\.com\/shorts\//i.test(rawUrl) ? "YouTube Shorts" : "YouTube",
      title: analysis.title || snippet.title,
      videoId,
      videoUrl,
      channelTitle: snippet.channelTitle,
      channelId: snippet.channelId,
      embeddable: snippet.embeddable
    }),
    analyzedFrom,
    ...(analyzedTimes ? { stepTimesFrom: analyzedTimes } : {}),
    videoSkipped
  };
}

// AI が書いた料理名の確かめは、親の判定と同じもの（dishes.js cleanDishName）。
export { cleanDishName };

export function normalizeImportResult(result) {
  return {
    title: cleanText(result.title),
    sourceServings: Number.isInteger(result.sourceServings) && result.sourceServings > 0 && result.sourceServings <= 100 ? result.sourceServings : null,
    source: cleanText(result.source || "YouTube"),
    caption: cleanText(result.caption),
    ingredients: normalizeIngredients(result.ingredients),
    steps: normalizeSteps(result.steps),
    // 手順ごとの動画の時刻（秒）。「▶ 2:15」でその場面から再生するのに使う。
    stepTimes: normalizeStepTimes(result.stepTimes, normalizeSteps(result.steps).length),
    tags: normalizeTags(result.tags),
    note: cleanText(result.note),
    videoId: cleanText(result.videoId),
    videoUrl: cleanText(result.videoUrl),
    channelTitle: cleanText(result.channelTitle),
    // チャンネルIDは投稿者をまとめる鍵。名前が変わっても同じ人として扱える。
    channelId: /^[\w-]{10,40}$/.test(cleanText(result.channelId)) ? cleanText(result.channelId) : "",
    planning: normalizePlanning(result.planning),
    // 埋め込み再生ができない動画だけ印をつける（ない時は再生できる扱い）。
    ...(result.embeddable === false ? { embeddable: false } : {}),
    ...(cleanText(result.catch) ? { catch: cleanText(result.catch).slice(0, 40) } : {}),
    // 一般的な料理名（AI が題名と説明文から書く。親の料理名を決めるのに使う。APP_MAP §48）
    ...(cleanDishName(result.dishName) ? { dishName: cleanDishName(result.dishName) } : {})
  };
}

export function buildCaption(snippet) {
  return [
    snippet.title ? `タイトル: ${snippet.title}` : "",
    snippet.channelTitle ? `チャンネル: ${snippet.channelTitle}` : "",
    "説明文:",
    snippet.description || ""
  ].filter(Boolean).join("\n");
}

function normalizeIngredients(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: cleanText(item?.name),
      // 海外の単位（cup・oz など）は日本の単位に。AIが換算し忘れた分の取りこぼし対策。
      amount: localizeAmount(cleanText(item?.amount || "適量")),
      category: cleanText(item?.category || DEFAULT_CATEGORY),
      // タレ・合わせ調味料など、まとめて使う材料の印（"A"・"☆"・"タレ"）。なければ付けない。
      ...(cleanText(item?.group) ? { group: cleanText(item.group).slice(0, 12) } : {})
    }))
    .filter((item) => item.name && !NUTRITION.test(`${item.name} ${item.amount}`))
    .slice(0, 20);
}

// AIが判定した「献立に使う条件」。決まった選択肢だけを通す。
const EQUIPMENT = ["コンロ", "電子レンジ", "炊飯器", "オーブン", "トースター", "フライパン", "鍋", "包丁", "まな板", "キッチンばさみ", "耐熱ボウル", "ざる", "ふた", "計量スプーン", "はかり", "電気ケトル", "圧力鍋", "ミキサー", "ホットプレート"];
const MINUTES = [10, 15, 20, 30, 45, 60];
function normalizePlanning(value) {
  if (!value || typeof value !== "object") return null;
  const n = Number(value.minutes);
  const minutes = Number.isFinite(n) && n > 0 ? MINUTES.find((m) => n <= m) || 60 : null;
  const pick = (list, allowed) => [...new Set((Array.isArray(list) ? list : []).map(cleanText).filter((x) => allowed.includes(x)))];
  const planning = {
    minutes,
    easy: typeof value.easy === "boolean" ? value.easy : null,
    equipment: pick(value.equipment, EQUIPMENT),
    tasks: pick(value.tasks, ["肉を切る", "揚げる", "長く煮込む"]),
    tastes: pick(value.tastes, ["和風", "洋風", "中華風"])
  };
  return planning.minutes || planning.equipment.length ? planning : null;
}

// 手順は30個まで（AI の答えの形の上限と同じ）。以前は10個で切っていて、長いレシピの後ろが消えていた（2026-10-03）。
export const MAX_STEPS = 30;
function normalizeSteps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).map((step) => localizeStep(step)).slice(0, MAX_STEPS);
}

function normalizeStepTimes(value, count) {
  if (!Array.isArray(value) || !count) return [];
  const times = value.slice(0, count).map((t) => parseTimeValue(t));
  return times.some((t) => t !== null) ? times : [];
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter(Boolean).slice(0, 8);
}

function cleanText(value) {
  return String(value || "").trim();
}

export function requireAnalyzer(analyzer) {
  if (typeof analyzer !== "function") {
    throw new ApiError(500, "missing_analyzer", "Gemini解析処理が設定されていません。");
  }
  return analyzer;
}
