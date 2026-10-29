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
  /* 好きな味の決め方（2026-10-28 のユーザーの判断「1 料理名の写真で選ぶ＋3 行動から学ぶ」に一本化）。
     理想の12品（api/src/ideal.js の IDEAL_DISHES と同じ名前・順番）から、食べたい料理を選んでもらう。
     選んだ料理名そのものの作り方にたっぷり、選んだ料理の主役・系統・味に合う料理に少し加点する。
     上の8枚の写真（deck）は、以前の答えを読むためだけに残す（新しくは聞かない）。 */
  const IDEAL = [
    ["shogayaki", "生姜焼き", "豚の生姜焼き", "🐖", "meat", "japanese", "plain", /生姜焼|しょうが焼|ショウガ焼/],
    ["karaage", "唐揚げ", "鶏の唐揚げ", "🍗", "meat", "japanese", "rich", /唐揚|から揚|からあげ|竜田/],
    ["hamburg", "ハンバーグ", "ハンバーグ", "🍖", "meat", "western", "rich", /ハンバーグ/],
    ["nikujaga", "肉じゃが", "肉じゃが", "🥔", "meat", "japanese", "plain", /肉じゃが/],
    ["reishabu", "冷しゃぶ", "冷しゃぶ", "🥗", "meat", "japanese", "light", /冷しゃぶ|冷やしゃぶ|豚しゃぶ/],
    ["hoikoro", "回鍋肉", "回鍋肉", "🥬", "meat", "chinese", "spicy", /回鍋肉|ホイコーロー/],
    ["mabo", "麻婆豆腐", "麻婆豆腐", "🌶️", "eggtofu", "chinese", "spicy", /麻婆豆腐|マーボー豆腐/],
    ["omurice", "オムライス", "オムライス", "🍳", "eggtofu", "western", "rich", /オムライス/],
    ["salmonfoil", "鮭のホイル焼き", "鮭のホイル焼き", "🐟", "fish", "japanese", "light", /ホイル(焼|蒸)/],
    ["sabamiso", "さばの味噌煮", "さばの味噌煮", "🐟", "fish", "japanese", "plain", /(さば|サバ|鯖)の?(味噌|みそ)煮/],
    ["meuniere", "鮭のムニエル", "鮭のムニエル", "🧈", "fish", "western", "rich", /ムニエル/],
    ["happosai", "八宝菜", "八宝菜", "🥢", "veg", "chinese", "plain", /八宝菜/],
  ].map(([id, name, label, emoji, protein, cuisine, mood, re]) => ({ id, name, label, emoji, protein, cuisine, mood, re }));
  const IDEAL_OF = Object.fromEntries(IDEAL.map((d) => [d.id, d]));
  const normalizePicks = (raw) => [...new Set((Array.isArray(raw) ? raw : []).filter((id) => typeof id === "string" && Object.prototype.hasOwnProperty.call(IDEAL_OF, id)))];
  // その料理が、理想の12品のどれか（料理名の辞書の名前 → なければ料理名の文字で）。
  function dishOf(recipe) {
    const dish = String(recipe?.dish || "");
    return IDEAL.find((d) => d.name === dish) || (dish ? null : IDEAL.find((d) => d.re.test(String(recipe?.title || "")))) || null;
  }
  // 献立の加点。axes は料理の主役・系統・味（Lifestyle.axes）。選んだ料理名なら＋10、
  // 主役・系統・味それぞれ、選んだ料理の3分の1以上と同じなら＋3（「ふつう」の味は数えない）。
  const PICK_DIRECT = 10, PICK_AXIS = 3;
  function pickScore(recipe, axes, raw) {
    const picks = normalizePicks(raw).map((id) => IDEAL_OF[id]);
    if (!picks.length || !recipe) return null;
    const own = dishOf(recipe);
    const direct = !!own && picks.includes(own);
    let axis = 0;
    for (const k of ["protein", "cuisine", "mood"]) {
      const v = axes?.[k];
      if (!v || (k === "mood" && v === "plain")) continue;
      if (picks.filter((d) => d[k] === v).length * 3 >= picks.length) axis += PICK_AXIS;
    }
    const score = (direct ? PICK_DIRECT : 0) + axis;
    return score ? { score, direct, axis, label: direct ? own.label : "" } : null;
  }
  // 以前の答え（8枚の写真・ごはん方針の「よく食べたい味」・お店からの系統）から、写真の画面で先に選んでおく料理。
  // 本人が「これで決定」を押すまでは保存しない（それまでは以前の答えのまま献立に効く）。
  const FROM_TASTE = { sweet: ["shogayaki", "nikujaga"], light: ["reishabu", "salmonfoil"], spicy: ["mabo", "hoikoro"], rich: ["karaage", "hamburg"], gentle: ["sabamiso", "happosai"] };
  const FROM_GENRE = { 和風: ["shogayaki", "nikujaga"], 洋風: ["hamburg", "omurice"], 中華風: ["mabo", "happosai"] };
  const FROM_CARD = { teriyaki: "karaage", pork: "shogayaki", salmon: "salmonfoil", tofu: "nikujaga", pasta: "meuniere", cheese: "omurice", mince: "mabo", udon: "happosai" };
  function fromOld({ tasteVotes = [], talkTastes = [], tastes = [] } = {}) {
    const out = [
      ...normalize(tasteVotes).filter((v) => v.vote === "like").map((v) => FROM_CARD[v.id]),
      ...(Array.isArray(talkTastes) ? talkTastes : []).flatMap((t) => FROM_TASTE[t] || []),
      ...(Array.isArray(tastes) ? tastes : []).flatMap((t) => FROM_GENRE[t] || []),
    ];
    return IDEAL.map((d) => d.id).filter((id) => out.includes(id)).slice(0, 6);
  }
  const api = { deck, styles, normalize, result, preferredTastes, IDEAL, IDEAL_OF, normalizePicks, dishOf, pickScore, fromOld, PICK_DIRECT, PICK_AXIS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FoodTaste = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
