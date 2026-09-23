/* Editorial dinner priorities: explicit choices, never inferred from dish photos. */
(function (root) {
  const axes = [
    {
      id: "joy",
      name: "満足の入口",
      left: "味の満足",
      right: "彩り",
      note: "味つけや見た目の好みは写真回答と併せて扱います。",
    },
    {
      id: "budget",
      name: "買い物の優先",
      left: "節約",
      right: "栄養バランス",
      note: "予算や栄養の良し悪しではなく、迷った場面での優先です。",
    },
    {
      id: "effort",
      name: "夜の時間",
      left: "時短",
      right: "ひと手間",
      note: "設定した調理時間・器具の範囲内で反映します。",
    },
  ];
  const questions = [
    [
      "joy1",
      "joy",
      "同じくらい好きな料理。最後のひと押しは？",
      "好みの味つけが決め手",
      "彩りのよさが決め手",
      -1,
    ],
    [
      "budget1",
      "budget",
      "予算内だけど、買い足すか迷う夜。",
      "手元の食材で出費を抑える",
      "少し買い足して食材の種類を増やす",
      -1,
    ],
    [
      "effort1",
      "effort",
      "疲れていない平日。あと10分使えるなら？",
      "先に食べて、自由な時間に",
      "仕上げにひと手間かけたい",
      -1,
    ],
    [
      "joy2",
      "joy",
      "味も量も合格の2品。選びたくなるのは？",
      "見た目が華やかな一皿",
      "味つけが自分の好みに近い一皿",
      1,
    ],
    [
      "budget2",
      "budget",
      "同じ満足感なら、今日の買い物は？",
      "食材の組合せを増やすことを優先",
      "使い切れる安い食材を優先",
      1,
    ],
    [
      "effort2",
      "effort",
      "休日、同じ料理を作るなら？",
      "少し時間をかけて仕上げたい",
      "工程を減らして早く食べたい",
      1,
    ],
    [
      "joy3",
      "joy",
      "夜ごはんを友達にすすめる第一声は？",
      "「この味、好きだと思う！」",
      "「見て、この一皿！」",
      -1,
    ],
    [
      "budget3",
      "budget",
      "今週の献立。どちらを先に調整する？",
      "予算に収めて無駄を減らす",
      "偏っている食材の組合せを見直す",
      -1,
    ],
    [
      "effort3",
      "effort",
      "作り方を選べるとき、うれしいのは？",
      "洗い物も工程も少ない",
      "ひと工夫する楽しみがある",
      -1,
    ],
  ].map(([id, axis, title, left, right, leftScore]) => ({
    id,
    axis,
    title,
    left,
    right,
    leftScore,
  }));
  const characters = {
    LLL: [
      "満腹ハムスター",
      "🐹",
      "財布もお腹も、きっちり満たす。",
      "常備品を活かす、短時間の定番料理。",
      "安くておいしければ、同じ丼が続いてもあり？",
    ],
    LLR: [
      "煮込みビーバー",
      "🦫",
      "手間は惜しまない。食材は余らせない。",
      "手持ちの材料で、作る時間も楽しむ料理。",
      "節約のためなら、料理に時間をかける？",
    ],
    LRL: [
      "ご自愛ラッコ",
      "🦦",
      "おいしさも組合せも、手早く。",
      "短時間で作れる、食材の組合せを考えた一皿。",
      "ひと皿で済ませたい。でも食材の種類は欲しい？",
    ],
    LRR: [
      "台所のクマ博士",
      "🐻",
      "納得する一皿には、ひと工夫。",
      "好みの味を守りながら、食材の組合せを見直す。",
      "好きな味のためのひと手間、どこまでできる？",
    ],
    RLL: [
      "彩りリス",
      "🐿️",
      "賢く買って、ぱっと華やか。",
      "少ない材料と工程で、彩りを楽しむ料理。",
      "同じ値段なら、味と見た目どちらで決める？",
    ],
    RLR: [
      "盛り付けキツネ",
      "🦊",
      "手元の食材を、とっておきに。",
      "買い足しを抑えて、仕上げを工夫する料理。",
      "盛り付けに5分。ぜいたく？それとも楽しみ？",
    ],
    RRL: [
      "軽やかフラミンゴ",
      "🦩",
      "忙しい日も、彩りと組合せを。",
      "短時間で作れて、食材の種類と彩りを楽しめる料理。",
      "買い足すなら、安さより彩りや食材の種類？",
    ],
    RRR: [
      "食卓の孔雀アーティスト",
      "🦚",
      "つくる時間も、一皿のごちそう。",
      "調理時間に余裕がある日に、見た目と組合せを工夫。",
      "家で食べるだけでも、見た目にこだわる？",
    ],
  };
  function normalize(raw) {
    return (Array.isArray(raw) ? raw : [])
      .filter(
        (a, i, all) =>
          a &&
          questions.some((q) => q.id === a.id) &&
          ["left", "right", "equal", "skip"].includes(a.choice) &&
          all.findIndex((b) => b?.id === a.id) === i,
      )
      .slice(0, 9)
      .map((a) => ({ id: a.id, choice: a.choice }));
  }
  function result(raw) {
    const answers = normalize(raw);
    const dimensions = axes.map((axis) => {
      const relevant = answers.filter(
        (a) =>
          questions.find((q) => q.id === a.id).axis === axis.id &&
          a.choice !== "skip",
      );
      const score = relevant.reduce(
        (n, a) =>
          n +
          (a.choice === "equal"
            ? 0
            : questions.find((q) => q.id === a.id).leftScore *
              (a.choice === "left" ? 1 : -1)),
        0,
      );
      return {
        ...axis,
        score,
        count: relevant.length,
        pole:
          relevant.length < 2 ? "?" : score === 0 ? "=" : score < 0 ? "L" : "R",
      };
    });
    const code = dimensions.map((d) => d.pole).join("");
    const info =
      characters[code] ||
      (code.includes("?")
        ? [
            "探索中のフクロウ",
            "🦉",
            "まだ決めつけない、あなたの夜ごはん。",
            "もう少し答えると、優先したいことが見えてきます。",
            "今日の気分と普段の好み、同じ？",
          ]
        : [
            "バランス上手なフクロウ",
            "🦉",
            "場面に合わせて、いいとこ取り。",
            "拮抗した軸は中間のまま。残りの傾向を献立に活かします。",
            "どちらも大事。最後は何で決める？",
          ]);
    return {
      code,
      title: info[0],
      emoji: info[1],
      description: info[2],
      operation: info[3],
      conversation: info[4],
      dimensions,
      complete: answers.length === 9,
    };
  }
  // Only measured metadata earns points; no invented price, nutrition or aesthetics scores.
  function planning(raw, meta, pantryCount) {
    const r = result(raw),
      budget = r.dimensions[1],
      effort = r.dimensions[2];
    let score = 0;
    const reasons = [];
    if (budget.pole === "L" && pantryCount) {
      score += Math.min(6, pantryCount * 2);
      reasons.push("買い足しを抑える好みに");
    }
    if (
      effort.pole === "L" &&
      Number.isFinite(meta?.minutes) &&
      meta.minutes > 0 &&
      meta.minutes <= 20
    ) {
      score += 4;
      reasons.push("短時間で食べたい日に");
    }
    return { score, reasons };
  }
  const api = { axes, questions, characters, normalize, result, planning };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DinnerPersona = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
