import test from "node:test";
import assert from "node:assert/strict";
import { importYouTubeRecipe } from "../src/importRecipe.js";
import { parseTimeValue } from "../src/chapters.js";
import { refineStepTimes, checkStepTimes } from "../src/timecodeCheck.js";
import { fetchYouTubeSnippet, parseIsoDuration } from "../src/youtube.js";

const sampleSnippet = {
  title: "ツナときゅうりの冷やしうどん",
  description: "材料: うどん3玉、ツナ缶2缶、きゅうり2本、めんつゆ適量。冷やしてのせるだけ。",
  channelTitle: "ごはんチャンネル"
};

test("builds an import result from mocked YouTube and Gemini responses", async () => {
  const result = await importYouTubeRecipe("https://www.youtube.com/shorts/abcdefghijk", {
    fetchYouTubeSnippet: async () => sampleSnippet,
    analyzeRecipeDescription: async () => ({
      title: "ツナきゅうり冷やしうどん",
      ingredients: [
        { name: "うどん", amount: "3玉", category: "主食" },
        { name: "ツナ缶", amount: "2缶", category: "缶詰" }
      ],
      steps: ["うどんを冷やす", "ツナときゅうりをのせる"],
      tags: ["昼ごはん", "冷たい"],
      note: "暑い日の昼に良さそう。"
    })
  });

  assert.equal(result.title, "ツナきゅうり冷やしうどん");
  assert.equal(result.source, "YouTube Shorts");
  assert.equal(result.videoId, "abcdefghijk");
  assert.equal(result.videoUrl, "https://www.youtube.com/shorts/abcdefghijk");
  assert.equal(result.ingredients.length, 2);
  assert.match(result.caption, /説明文:/);
});

test("an empty description is an error only when the video cannot be read either", async () => {
  const snippet = { title: "no description", description: "", channelTitle: "c", durationSeconds: 900 };
  await assert.rejects(importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet, analyzeRecipeDescription: async () => ({}), analyzeRecipeVideo: async () => ({ steps: ["焼く"], stepsComplete: false }) }), { code: "empty_description" });
  const shortDeps = { fetchYouTubeSnippet: async () => ({ ...snippet, durationSeconds: 45 }), analyzeRecipeDescription: async () => { throw new Error("must not run"); }, analyzeRecipeVideo: async () => ({ title: "丼", ingredients: [{ name: "豚こま", amount: "200g" }], steps: ["焼く"] }) };
  await assert.rejects(importYouTubeRecipe("https://youtu.be/abcdefghijk", shortDeps), { code: "empty_description" }, "importing never reads the video on its own");
  const short = await importYouTubeRecipe("https://youtu.be/abcdefghijk", shortDeps, { forceVideo: true });
  assert.equal(short.analyzedFrom, "video"); assert.deepEqual(short.steps, ["焼く"]);
});

test("the video is read only on request (a ticket); importing flags that it could help; long videos are read for their first 10 minutes", async () => {
  let videoCalls = 0, reserved = 0;
  const video = async () => { videoCalls++; return { steps: ["キャベツを切る", "調味料で和える"], ingredients: [{ name: "キャベツ", amount: "1/2玉" }] }; };
  const snippet = (d) => ({ title: "コールスロー", description: "キャベツ 1/2玉", channelTitle: "c", durationSeconds: d });
  const noSteps = async () => ({ title: "コールスロー", ingredients: [{ name: "キャベツ", amount: "1/2玉" }, { name: "1人前あたり約102kcal", amount: "11.6g" }], steps: [] });
  const skipped = await importYouTubeRecipe("https://youtube.com/shorts/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: video });
  assert.equal(skipped.videoSkipped, true); assert.equal(skipped.analyzedFrom, "description"); assert.equal(videoCalls, 0, "no ticket is spent without a tap");
  const r = await importYouTubeRecipe("https://youtube.com/shorts/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: video }, { forceVideo: true, reserveBudget: async () => { reserved++; } });
  assert.equal(r.analyzedFrom, "video"); assert.deepEqual(r.steps, ["キャベツを切る", "調味料で和える"]); assert.equal(reserved, 1);
  assert.deepEqual(r.ingredients.map((i) => i.name), ["キャベツ"], "nutrition lines are not ingredients");
  let clip = "unset";
  const long = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: async (u, s, o) => { clip = o.clipSeconds; return video(); } }, { forceVideo: true });
  assert.equal(long.analyzedFrom, "video-clip"); assert.equal(clip, 600, "long videos: only the first 10 minutes");
  const cut = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: noSteps, analyzeRecipeVideo: async () => ({ steps: ["切る"], stepsComplete: false }) }, { forceVideo: true });
  assert.equal(cut.analyzedFrom, "description"); assert.deepEqual(cut.steps, [], "steps cut off by the clip are not used");
  assert.equal(videoCalls, 2);
  const full = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(50), analyzeRecipeDescription: async () => ({ ingredients: [{ name: "キャベツ", amount: "1/2玉" }], steps: ["切る", "和える"], stepsInDescription: true }), analyzeRecipeVideo: video });
  assert.equal(full.analyzedFrom, "description"); assert.equal(full.videoSkipped, false); assert.equal(videoCalls, 2);
  const chatter = await importYouTubeRecipe("https://youtu.be/abcdefghijk", { fetchYouTubeSnippet: async () => snippet(631), analyzeRecipeDescription: async () => ({ ingredients: [{ name: "キャベツ", amount: "1/2玉" }], steps: ["キャベツ使い切り", "味付けはケンタッキー風で"], stepsInDescription: false }), analyzeRecipeVideo: video }, { forceVideo: true });
  assert.equal(chatter.analyzedFrom, "video-clip", "descriptions without a real procedure go to the video"); assert.deepEqual(chatter.steps, ["キャベツを切る", "調味料で和える"]);
});

test("YouTube durations are read from ISO 8601", () => {
  assert.equal(parseIsoDuration("PT1M5S"), 65); assert.equal(parseIsoDuration("PT45S"), 45); assert.equal(parseIsoDuration("PT1H"), 3600); assert.equal(parseIsoDuration(""), null);
});

test("rejects unlisted videos before their contents can enter shared catalog", async () => {
  await assert.rejects(fetchYouTubeSnippet("abcdefghijk", {YOUTUBE_API_KEY:"test"}, async () => ({
    ok:true, json:async () => ({items:[{status:{privacyStatus:"unlisted"},snippet:{title:"private",description:"private recipe"}}]})
  })), {code:"non_public_video"});
});

test("description timestamps set the step times, even after a video read", async () => {
  const snippet = { title: "照り焼き", description: "材料 鶏肉\n0:00 はじめに\n0:35 下ごしらえ\n2:10 焼く\n4:02 タレ", channelTitle: "c", durationSeconds: 300 };
  const result = await importYouTubeRecipe("https://youtu.be/abcdefghijk", {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({ stepsInDescription: false, ingredients: [{ name: "鶏肉", amount: "1枚", category: "肉" }] }),
    analyzeRecipeVideo: async () => ({ steps: ["鶏肉に下味をつける", "焼く", "タレを絡める"], stepTimes: [5, 60, 100], ingredients: [] }),
    matchStepsToChapters: async () => ({ chapterIndex: [2, 3, 4] })
  }, { forceVideo: true });
  assert.deepEqual(result.stepTimes, [35, 130, 242]);
  assert.equal(result.stepTimesFrom, "chapters");
});

test("when the AI misses the servings, the description's 材料（2人分） still fills it", async () => {
  const result = await importYouTubeRecipe("https://www.youtube.com/watch?v=abcdefghijk", {
    fetchYouTubeSnippet: async () => ({ title: "豚バラ大根", description: "1人分あたり 420kcal\n【材料】（二人分）\n豚バラ 200g\n大根 1/3本", channelTitle: "ch" }),
    analyzeRecipeDescription: async () => ({ title: "豚バラ大根", sourceServings: null, ingredients: [{ name: "豚バラ", amount: "200g" }], steps: ["切る", "煮る"] }),
  });
  assert.equal(result.sourceServings, 2);
});

test("parseTimeValue and refineStepTimes handle MM:SS strings, coarse chapter duplicates, inversions, and beyond-video times", async () => {
  assert.equal(parseTimeValue("02:15"), 135);
  assert.equal(parseTimeValue("2:05"), 125);
  assert.equal(parseTimeValue("1:02:05"), 3725);
  assert.equal(parseTimeValue("2分15秒"), 135);
  assert.equal(parseTimeValue("90s"), 90);
  assert.equal(parseTimeValue({ time: "01:30", cue: "炒める" }), 90);
  assert.equal(parseTimeValue("2:99"), null);

  // Coarse chapters where multiple steps point to the same chapter timestamp are subdivided proportionally
  const st5 = ["野菜を切る", "豚肉を炒める", "野菜を加えてさらに炒める", "調味料を入れる", "盛り付ける"];
  const refinedCoarse = refineStepTimes(st5, [10, 90, 90, 90, 180], { durationSeconds: 240 });
  assert.equal(refinedCoarse[0], 10);
  assert.equal(refinedCoarse[1], 90);
  assert.ok(refinedCoarse[2] > 90 && refinedCoarse[2] < refinedCoarse[3]);
  assert.ok(refinedCoarse[3] > refinedCoarse[2] && refinedCoarse[3] < 180);
  assert.equal(refinedCoarse[4], 180);
  assert.equal(checkStepTimes(st5, refinedCoarse, { source: "chapters", durationSeconds: 240 }).coarse, undefined);

  // Out-of-order and beyond-duration timestamps are repaired cleanly
  const st4 = ["手順1", "手順2", "手順3", "手順4"];
  const refinedOrder = refineStepTimes(st4, [10, 200, 100, 300], { durationSeconds: 350 });
  assert.deepEqual(refinedOrder, [10, 55, 100, 300]);
  assert.equal(checkStepTimes(st4, refinedOrder, { durationSeconds: 350 }).status, "ok");

  const refinedBeyond = refineStepTimes(st4, [10, 60, 120, 400], { durationSeconds: 300 });
  assert.ok(refinedBeyond[3] > 120 && refinedBeyond[3] < 300);
  assert.equal(checkStepTimes(st4, refinedBeyond, { durationSeconds: 300 }).status, "ok");
});

test("when transcript is available, description materials and transcript flow create hybrid detailed steps with timecodes", async () => {
  let hybridCalled = false;
  const snippet = {
    title: "豚こま油淋トン",
    description: "【材料】豚こま 300g、片栗粉 大さじ3\n【作り方】①揉み込んで片栗粉まぶす ②カリカリに焼く ③タレと和える",
    channelTitle: "料理チャンネル",
    durationSeconds: 360
  };
  const result = await importYouTubeRecipe("https://www.youtube.com/watch?v=yRCUGLTp9Vk", {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({
      title: "豚こま油淋トン",
      ingredients: [
        { name: "豚こま", amount: "300g", category: "肉" },
        { name: "片栗粉", amount: "大さじ3", category: "調味料" }
      ],
      steps: [
        "フライパンで豚こまに酒、塩こしょうを揉み片栗粉をまぶす。",
        "油を回しかけ中火で3、4分ずつカリカリに焼く。",
        "油淋ダレを混ぜ、豚こまを入れ和える。"
      ]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [
        { start: 60.5, dur: 5.0, text: "豚肉にお酒と塩こしょうを入れて揉み込みます" },
        { start: 95.0, dur: 4.0, text: "全体に片栗粉をしっかりまぶしていきます" },
        { start: 137.2, dur: 6.0, text: "油を回し入れて中火でじっくり焼きます" },
        { start: 160.0, dur: 8.0, text: "お肉を焼いている間に油淋ダレを混ぜておきます" },
        { start: 290.4, dur: 5.0, text: "焼き上がったお肉をタレに絡めて完成です" }
      ]
    }),
    buildHybridRecipeSteps: async ({ title, ingredients, steps, formattedTranscript, cues }) => {
      hybridCalled = true;
      assert.equal(title, "豚こま油淋トン");
      assert.equal(ingredients.length, 2);
      assert.equal(steps.length, 3);
      assert.ok(formattedTranscript.includes("揉み込みます"));
      return {
        steps: [
          "豚肉に酒と塩こしょうを加えてよく揉み込む。",
          "全体に片栗粉をまぶしてコーティングする。",
          "フライパンに油を回し入れ、中火で両面を焼く。",
          "焼いている間に、ボウルで油淋ダレの調味料を混ぜ合わせる。",
          "焼き上がった豚肉に油淋ダレを絡めて器に盛る。"
        ],
        stepTimes: [60.5, 95.0, 137.2, 160.0, 290.4],
        stepCues: ["豚肉にお酒と", "全体に片栗粉", "油を回し入れ", "お肉を焼いて", "焼き上がった"]
      };
    }
  });

  assert.equal(hybridCalled, true);
  assert.equal(result.analyzedFrom, "description+transcript");
  assert.equal(result.stepTimesFrom, "transcript");
  assert.equal(result.steps.length, 5);
  assert.deepEqual(result.stepTimes, [60.5, 95, 137.2, 160, 290.4]);
  assert.equal(result.steps[3], "焼いている間に、ボウルで油淋ダレの調味料を混ぜ合わせる。");
});

test("transcript timestamps are preserved as-is without coarse or cluster refinement", async () => {
  // 短時間の密集時刻 [10.5, 15.5, 20.5, 25.5] が refineStepTimes で架空補間されないことを確認
  const snippet = {
    title: "スピード炒め",
    description: "【材料】豚肉 200g\n【作り方】①炒める ②調味する ③盛る",
    durationSeconds: 300
  };
  const result = await importYouTubeRecipe("https://www.youtube.com/watch?v=speed000001", {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({
      title: "スピード炒め",
      ingredients: [{ name: "豚肉", amount: "200g" }],
      steps: ["炒める", "調味する", "盛る"]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [
        { start: 10.5, dur: 3.0, text: "豚肉を入れます" },
        { start: 15.5, dur: 3.0, text: "タレを入れます" },
        { start: 20.5, dur: 3.0, text: "一気に炒めます" },
        { start: 25.5, dur: 3.0, text: "お皿に盛ります" }
      ]
    }),
    buildHybridRecipeSteps: async () => ({
      steps: ["肉を入れる", "タレを入れる", "炒める", "盛る"],
      stepTimes: [10.5, 15.5, 20.5, 25.5],
      stepCues: ["豚肉を", "タレを", "一気に", "お皿に"]
    })
  });

  assert.equal(result.analyzedFrom, "description+transcript");
  assert.equal(result.stepTimesFrom, "transcript");
  // 密集時刻が [10.5, 45, 81, 115] 等に補正されず、そのまま維持されていること
  assert.deepEqual(result.stepTimes, [10.5, 15.5, 20.5, 25.5]);
});

test("createRecipeCatalog preserves description+transcript and transcript sources", async () => {
  const { createRecipeCatalog } = await import("../src/recipeCatalog.js");
  const { createMemorySyncStore } = await import("../src/syncStore.js");

  const store = createMemorySyncStore();
  const catalog = createRecipeCatalog(store, async () => ({
    title: "塩麻婆豆腐",
    ingredients: [{ name: "豆腐", amount: "1丁" }],
    steps: ["準備する", "炒める", "煮る", "盛る"],
    stepTimes: [10.5, 25.0, 45.2, 80.0],
    stepTimesFrom: "transcript",
    analyzedFrom: "description+transcript"
  }));

  const res = await catalog.import("https://www.youtube.com/watch?v=yRCUGLTp9Vk");
  assert.equal(res.analyzedFrom, "description+transcript");
  assert.equal(res.stepTimesFrom, "transcript");
  assert.deepEqual(res.stepTimes, [10.5, 25.0, 45.2, 80.0]);

  // ストア上の永続化データも確認
  const stored = await store.get("youtube-yRCUGLTp9Vk");
  assert.equal(stored.envelope.result.analyzedFrom, "description+transcript");
  assert.equal(stored.envelope.result.stepTimesFrom, "transcript");
});

test("falls back cleanly to description steps when transcript is unavailable or hybrid generation fails", async () => {
  const snippet = {
    title: "豚こま油淋トン",
    description: "【材料】豚こま 300g\n【作り方】①揉む ②焼く ③和える",
    channelTitle: "料理チャンネル"
  };
  // Case A: Transcript not available
  const resultNoTranscript = await importYouTubeRecipe("https://www.youtube.com/watch?v=yRCUGLTp9Vk", {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({
      title: "豚こま油淋トン",
      ingredients: [{ name: "豚こま", amount: "300g", category: "肉" }],
      steps: ["揉む", "焼く", "和える"]
    }),
    fetchYouTubeTranscript: async () => null,
    buildHybridRecipeSteps: async () => { throw new Error("must not be called"); }
  });
  assert.equal(resultNoTranscript.analyzedFrom, "description");
  assert.equal(resultNoTranscript.steps.length, 3);

  // Case B: Hybrid generator returns null
  const resultFailedHybrid = await importYouTubeRecipe("https://www.youtube.com/watch?v=yRCUGLTp9Vk", {
    fetchYouTubeSnippet: async () => snippet,
    analyzeRecipeDescription: async () => ({
      title: "豚こま油淋トン",
      ingredients: [{ name: "豚こま", amount: "300g", category: "肉" }],
      steps: ["揉む", "焼く", "和える"]
    }),
    fetchYouTubeTranscript: async () => ({ status: "ok", items: [{ start: 1, dur: 2, text: "こんにちは" }] }),
    buildHybridRecipeSteps: async () => null
  });
  assert.equal(resultFailedHybrid.analyzedFrom, "description");
  assert.equal(resultFailedHybrid.steps.length, 3);
});

test("long description steps are passed completely to hybrid generator without 500-char truncation, and already-detailed steps avoid reduction", async () => {
  const longStep1 = "下準備としてフライパンに豚肉を並べ、調味料A（酒、塩こしょう、醤油少々、おろし生姜、おろしニンニク）をしっかり手で揉み込み、約10分置いて味をなじませてから片栗粉を全体に丁寧にまぶします。".repeat(3);
  const longStep2 = "フライパンにサラダ油大さじ2を回し入れ、弱火から中火でじっくりと片面4分、裏返してさらに3分、合計7分間カリッカリのきつね色になるまで焦がさないように注意しながら焼き上げます。".repeat(3);

  let passedStepsLength = 0;
  const result = await importYouTubeRecipe("https://www.youtube.com/watch?v=longstep001", {
    fetchYouTubeSnippet: async () => ({
      title: "本格豚こま料理",
      description: `【材料】豚こま 300g\n【作り方】①${longStep1}\n②${longStep2}`,
      channelTitle: "料理人"
    }),
    analyzeRecipeDescription: async () => ({
      title: "本格豚こま料理",
      ingredients: [{ name: "豚こま", amount: "300g" }],
      steps: [longStep1, longStep2]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [{ start: 10, dur: 5, text: "豚肉に下味をもみ込みます" }]
    }),
    buildHybridRecipeSteps: async ({ steps }) => {
      passedStepsLength = steps.reduce((sum, s) => sum + s.length, 0);
      return {
        steps: ["下味をつける", "粉をまぶす", "焼く", "仕上げる"],
        stepTimes: [10, 30, 60, 120]
      };
    }
  });

  // 500文字で途切れずに全文字（546文字）が渡っていること
  assert.ok(passedStepsLength > 500);
  assert.equal(result.steps.length, 4);

  // 既に6工程ある詳細なレシピで、ハイブリッド生成が3工程に減らそうとした場合は元の詳細手順を維持する保護
  const detailedResult = await importYouTubeRecipe("https://www.youtube.com/watch?v=detailed001", {
    fetchYouTubeSnippet: async () => ({
      title: "工程の多い料理",
      description: "【材料】豚肉\n【手順】1〜6",
      channelTitle: "プロ"
    }),
    analyzeRecipeDescription: async () => ({
      title: "工程の多い料理",
      ingredients: [{ name: "豚肉", amount: "200g" }],
      steps: ["工程1", "工程2", "工程3", "工程4", "工程5", "工程6"]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [{ start: 5, dur: 5, text: "工程です" }]
    }),
    buildHybridRecipeSteps: async () => ({
      steps: ["要約1", "要約2"], // 6工程を2工程に減らしてしまう劣化
      stepTimes: [5, 50]
    })
  });

  assert.equal(detailedResult.steps.length, 6);
  assert.equal(detailedResult.analyzedFrom, "description");
});

test("ingredient groups are passed to hybrid generator, and truncated transcripts without description steps are rejected", async () => {
  let passedIngredients = [];
  const resultWithGroup = await importYouTubeRecipe("https://www.youtube.com/watch?v=grouped0001", {
    fetchYouTubeSnippet: async () => ({
      title: "油淋鶏",
      description: "【材料】鶏肉 1枚\n【A】醤油 大さじ1\n【タレ】酢 大さじ1",
      channelTitle: "料理人"
    }),
    analyzeRecipeDescription: async () => ({
      title: "油淋鶏",
      ingredients: [
        { name: "鶏肉", amount: "1枚", group: "" },
        { name: "醤油", amount: "大さじ1", group: "A" },
        { name: "酢", amount: "大さじ1", group: "タレ" }
      ],
      steps: ["下味をつける", "揚げる", "タレをかける"]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [{ start: 10, dur: 5, text: "鶏肉を切ります" }]
    }),
    buildHybridRecipeSteps: async ({ ingredients }) => {
      passedIngredients = ingredients;
      return {
        steps: ["Aで下味をつける", "片栗粉をつけて揚げる", "タレを混ぜてかける"],
        stepTimes: [10, 50, 100]
      };
    }
  });

  assert.equal(passedIngredients.find((i) => i.name === "醤油")?.group, "A");
  assert.equal(passedIngredients.find((i) => i.name === "酢")?.group, "タレ");
  assert.equal(resultWithGroup.steps.length, 3);

  // 説明欄に手順がなく、字幕が長すぎて切り捨て（truncated）された場合は、中途半端な手順を採用せずフォールバックする
  let hybridCalledForTruncated = false;
  // 500件の長い字幕（合計24,000文字超）
  const longItems = Array.from({ length: 500 }, (_, i) => ({
    start: i * 5,
    dur: 4,
    text: `工程その${i + 1}：しっかりと材料を炒めて水分を飛ばしていきましょうね。`
  }));
  const resultTruncated = await importYouTubeRecipe("https://www.youtube.com/watch?v=truncated00", {
    fetchYouTubeSnippet: async () => ({
      title: "超大作レシピ",
      description: "【材料】牛肉 300g", // 手順なし
      channelTitle: "長編"
    }),
    analyzeRecipeDescription: async () => ({
      title: "超大作レシピ",
      ingredients: [{ name: "牛肉", amount: "300g" }],
      steps: [] // 説明欄に手順なし
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: longItems
    }),
    buildHybridRecipeSteps: async () => {
      hybridCalledForTruncated = true;
      return {
        steps: ["途中で切れた手順1", "途中で切れた手順2"],
        stepTimes: [10, 50],
        stepsComplete: false
      };
    }
  });

  // 不完全な手順としてスキップされ、ハイブリッド生成は呼ばれず、手順なしのまま動画読み取り待ちを維持する
  assert.equal(hybridCalledForTruncated, false);
  assert.equal(resultTruncated.steps.length, 0);
  assert.equal(resultTruncated.videoSkipped, true);

  // 説明欄に手順が複数ある場合でも、ハイブリッド生成が stepsComplete: false（未完結）を返した場合は、
  // 不完全な手順で上書きせず、元の説明欄の手順をそのまま維持すること
  const resultIncompleteHybrid = await importYouTubeRecipe("https://www.youtube.com/watch?v=incomplet01", {
    fetchYouTubeSnippet: async () => ({
      title: "豚こま炒め",
      description: "【材料】豚肉\n【作り方】①炒める ②調味する ③盛る",
      durationSeconds: 300
    }),
    analyzeRecipeDescription: async () => ({
      title: "豚こま炒め",
      ingredients: [{ name: "豚肉", amount: "200g" }],
      steps: ["炒める", "調味する", "盛る"]
    }),
    fetchYouTubeTranscript: async () => ({
      status: "ok",
      items: [
        { start: 10, dur: 5, text: "豚肉を切ります" },
        { start: 20, dur: 5, text: "フライパンに入れます" }
      ]
    }),
    buildHybridRecipeSteps: async () => ({
      steps: ["肉を切る", "フライパンに入れる"], // 盛り付けまで到達していない
      stepTimes: [10, 20],
      stepsComplete: false
    })
  });

  // stepsComplete: false なのでハイブリッド手順は採用されず、説明欄の3工程が維持されること
  assert.equal(resultIncompleteHybrid.analyzedFrom, "description");
  assert.deepEqual(resultIncompleteHybrid.steps, ["炒める", "調味する", "盛る"]);
});
