/* Original editorial categories, not a psychological or nutritional assessment. */
(function (root) {
  const styles = {
    hearty: {
      title: "ごほうびガッツリ系",
      emoji: "🔥",
      description: "しっかりした味と満足感で、今日をおいしく締めくくる。",
    },
    gentle: {
      title: "ご自愛ほっこり系",
      emoji: "🍵",
      description: "やさしい味の一皿で、ほっとする夜ごはんを。",
    },
    cafe: {
      title: "おうちカフェ系",
      emoji: "🍅",
      description: "彩りと洋風の味で、いつもの食卓をちょっと楽しく。",
    },
    savory: {
      title: "香りを楽しむ系",
      emoji: "🥢",
      description: "香ばしさとうまみが広がる一皿に、ときめくタイプ。",
    },
    explorer: {
      title: "おいしいもの探検系",
      emoji: "🌈",
      description: "ひとつのジャンルに収まらない、食の楽しみを持つタイプ。",
    },
    unknown: {
      title: "まだまだ探索中",
      emoji: "🔎",
      description: "好きな一皿を、これから一緒に探しましょう。",
    },
  };
  const cards = [
    ["teriyaki", "鶏の照り焼き丼", "hearty", "和風"],
    ["pork", "豚こまキャベツ丼", "hearty", "和風"],
    ["salmon", "鮭としめじの蒸しごはん", "gentle", "和風"],
    ["tofu", "豆腐と卵のやさしい丼", "gentle", "和風"],
    ["pasta", "ツナとトマトのパスタ", "cafe", "洋風"],
    ["cheese", "トマトと豆腐のチーズごはん", "cafe", "洋風"],
    ["mince", "豚ひき肉と豆腐のそぼろ丼", "savory", "中華風"],
    ["udon", "トマト卵うどん", "savory", "中華風"],
  ].map(([id, title, style, taste], index) => ({
    id,
    title,
    style,
    taste,
    image: `assets/taste/${index + 1}.webp`,
  }));
  // Interleave categories so that an early exit does not favor the first style.
  const deck = [0, 2, 4, 6, 1, 3, 5, 7].map((i) => cards[i]);
  function normalize(raw) {
    return (Array.isArray(raw) ? raw : [])
      .filter(
        (v, i, a) =>
          v &&
          deck.some((c) => c.id === v.id) &&
          ["like", "pass", "skip"].includes(v.vote) &&
          a.findIndex((x) => x?.id === v.id) === i,
      )
      .slice(0, deck.length)
      .map((v) => ({ id: v.id, vote: v.vote }));
  }
  function result(raw) {
    const votes = normalize(raw),
      likes = votes.filter((v) => v.vote === "like");
    const scores = { hearty: 0, gentle: 0, cafe: 0, savory: 0 };
    likes.forEach((v) => scores[deck.find((c) => c.id === v.id).style]++);
    const max = Math.max(...Object.values(scores));
    const winners = Object.keys(scores).filter((k) => scores[k] === max);
    const id =
      votes.filter((v) => v.vote !== "skip").length < 4 || likes.length < 2
        ? "unknown"
        : winners.length === 1
          ? winners[0]
          : "explorer";
    return {
      id,
      ...styles[id],
      likes: likes.map((v) => deck.find((c) => c.id === v.id)),
      scores,
    };
  }
  function preferredTastes(raw) {
    const likes = normalize(raw).filter((v) => v.vote === "like");
    return [
      ...new Set(likes.map((v) => deck.find((c) => c.id === v.id).taste)),
    ];
  }
  const api = { deck, styles, normalize, result, preferredTastes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FoodTaste = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
