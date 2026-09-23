/* Pure planning rules, shared by the browser and Node regression tests. */
(function (root) {
  const Taste = typeof module !== "undefined" && module.exports ? require("./taste.js") : root.FoodTaste;
  const Persona = typeof module !== "undefined" && module.exports ? require("./dinner-persona.js") : root.DinnerPersona;
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const list = (value) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .filter((x) => typeof x === "string")
              .map((x) => x.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  const ownership = (value) =>
    Object.fromEntries(
      Object.entries(value || {}).filter(
        ([k, v]) => k.length < 100 && ["have", "none", "unknown"].includes(v),
      ),
    );
  const equipment = [
    "コンロ",
    "電子レンジ",
    "炊飯器",
    "オーブン",
    "トースター",
    "フライパン",
    "鍋",
    "包丁",
    "まな板",
    "キッチンばさみ",
    "耐熱ボウル",
    "ざる",
    "計量スプーン",
    "はかり",
    "ふた",
    "電気ケトル",
    "圧力鍋",
    "ミキサー",
    "ホットプレート",
  ];
  // Product defaults, not measured ownership statistics. Apply only when this setup screen is visited.
  const equipmentGroups = [
    {label: "基本の道具", hint: "まずはここから。未回答の基本の道具は「ある」が初期値です。", defaultValue: "have", names: ["コンロ", "電子レンジ", "フライパン", "鍋", "包丁", "まな板", "ざる", "ふた", "計量スプーン"]},
    {label: "あると便利", hint: "持っているものをタップして追加しましょう。", defaultValue: "none", names: ["炊飯器", "トースター", "キッチンばさみ", "耐熱ボウル", "電気ケトル"]},
    {label: "こだわりの道具", hint: "使える道具があれば、料理の幅が広がります。", defaultValue: "none", names: ["オーブン", "はかり", "圧力鍋", "ミキサー", "ホットプレート"]}
  ];
  function equipmentDefaults(current = {}) {
    return {...Object.fromEntries(equipmentGroups.flatMap(group => group.names.map(name => [name, group.defaultValue]))), ...current};
  }
  const pantry = {
    基本の調味料: ["塩", "砂糖", "しょうゆ", "みそ", "酢", "みりん", "料理酒"],
    "油・乳製品": ["サラダ油", "オリーブ油", "ごま油", "バター", "マヨネーズ"],
    "だし・ソース": [
      "和風だし",
      "鶏ガラスープの素",
      "コンソメ",
      "めんつゆ",
      "ポン酢",
      "ケチャップ",
      "中濃ソース",
      "焼肉のたれ",
      "オイスターソース",
    ],
    香辛料: [
      "こしょう",
      "にんにく",
      "しょうが",
      "カレー粉",
      "七味",
      "ごま",
      "豆板醤",
    ],
    常備する主食など: [
      "米",
      "パスタ",
      "うどん",
      "食パン",
      "小麦粉",
      "片栗粉",
      "ツナ缶",
      "トマト缶",
      "のり",
    ],
  };
  // Source threshold: at least 80% in MyVoice 2024 or Nadia 2026. Only missing answers are seeded.
  const pantryCommon = ["塩", "しょうゆ", "こしょう", "砂糖", "みそ", "マヨネーズ", "ケチャップ", "めんつゆ", "酢"];
  function pantryDefaults(current = {}, names = []) {
    return {...Object.fromEntries(names.filter(n => pantryCommon.includes(n)).map(n => [n, "have"])), ...current};
  }
  function profile(raw = {}) {
    return {
      version: 1,
      completed: raw.completed === true,
      step: Math.min(15, Math.max(0, Number(raw.step) || 0)),
      servings: [1, 2].includes(Number(raw.servings))
        ? Number(raw.servings)
        : 1,
      days: list(raw.days),
      period: Number(raw.period) === 7 ? 7 : 3,
      restrictions: list(raw.restrictions),
      dislikes: list(raw.dislikes),
      tastes: list(raw.tastes),
      tasteVotes: Taste.normalize(raw.tasteVotes),
      dinnerPriorities: Persona.normalize(raw.dinnerPriorities),
      tasteReturnStep: Number.isInteger(raw.tasteReturnStep) && raw.tasteReturnStep >= 0 && raw.tasteReturnStep <= 15 ? raw.tasteReturnStep : null,
      weekdayMinutes: [10, 20, 30, 60].includes(Number(raw.weekdayMinutes))
        ? Number(raw.weekdayMinutes)
        : null,
      weekendMinutes: [10, 20, 30, 60].includes(Number(raw.weekendMinutes))
        ? Number(raw.weekendMinutes)
        : null,
      skill: ["easy", "any"].includes(raw.skill) ? raw.skill : "unknown",
      avoidTasks: list(raw.avoidTasks),
      equipment: ownership(raw.equipment),
      pantry: ownership(raw.pantry),
      shoppingFrequency: ["daily", "3days", "weekly"].includes(
        raw.shoppingFrequency,
      )
        ? raw.shoppingFrequency
        : "unknown",
      savings: raw.savings === true,
      useUp: list(raw.useUp),
      useUpUntil: typeof raw.useUpUntil === "string" ? raw.useUpUntil : "",
      answered: list(raw.answered),
      startedAt: raw.startedAt || "",
      completedAt: raw.completedAt || "",
    };
  }
  const aliases = {
    醤油: "しょうゆ",
    玉ねぎ: "たまねぎ",
    玉葱: "たまねぎ",
    葱: "ねぎ",
    胡椒: "こしょう",
    鶏肉: "鶏",
    豚肉: "豚",
    牛肉: "牛",
    卵: "卵",
    たまご: "卵",
    小麦粉: "小麦",
    オリーブオイル: "オリーブ油",
    胡麻油: "ごま油",
  };
  const key = (value) => {
    const n = String(value || "")
      .normalize("NFKC")
      .replace(/\s/g, "")
      .toLowerCase();
    return aliases[n] || n;
  };
  const matches = (a, b) => key(a).includes(key(b)) || key(b).includes(key(a));
  function fit(recipe, p, date) {
    const meta = recipe.planning;
    const names = (recipe.ingredients || []).map((x) => x.name);
    const searchable = [...names, ...(meta?.contains || [])];
    const blocked = [...p.restrictions, ...p.dislikes].find((x) =>
      searchable.some((n) => matches(n, x)),
    );
    if (blocked) return { ok: false, reason: "避けたい食材を含みます" };
    if (
      p.restrictions.length &&
      (!meta?.ingredientsVerified ||
        p.restrictions.some((x) => !restrictionOptions.includes(x)))
    )
      return { ok: false, reason: "食材制限との照合に確認が必要です" };
    if (meta?.equipment?.some((x) => p.equipment[x] === "none"))
      return { ok: false, reason: "持っていない器具が必要です" };
    if (meta?.tasks?.some((x) => p.avoidTasks.includes(x)))
      return { ok: false, reason: "避けたい調理作業を含みます" };
    const weekend = [0, 6].includes(new Date(date + "T12:00:00").getDay());
    const minutes = weekend ? p.weekendMinutes : p.weekdayMinutes;
    if (minutes && meta?.minutes > minutes)
      return { ok: false, reason: "調理時間の条件を確認してください" };
    // Saved recipes often lack these details. Keep them as lower-ranked candidates
    // with a visible note; food restrictions above still require verification.
    const unconfirmed = [];
    if (minutes && !meta?.minutes) unconfirmed.push("調理時間は未確認");
    if (p.skill === "easy" && !meta?.easy) unconfirmed.push("難しさは未確認");
    if (p.avoidTasks.length && !meta?.tasks) unconfirmed.push("作業は未確認");
    if (!names.length) unconfirmed.push("材料は未確認");
    const knownEquipment =
      !!meta?.equipment?.length &&
      meta.equipment.every((x) => p.equipment[x] === "have");
    const reasons = [];
    if (minutes && meta?.minutes) reasons.push(`${meta.minutes}分目安`);
    if (knownEquipment) reasons.push("手持ちの器具で");
    else reasons.push("器具を確認してから");
    const pantryCount = names.filter((x) => p.pantry[x] === "have").length;
    if (pantryCount) reasons.push(`常備品${pantryCount}つを活用`);
    const useUp =
      p.useUpUntil >= date &&
      p.useUp.some((x) => names.some((n) => matches(n, x)));
    if (useUp) reasons.push("使い切りたい食材入り");
    const votedTastes = Taste.preferredTastes(p.tasteVotes);
    const taste = meta?.tastes?.some((x) => (Taste.normalize(p.tasteVotes).length ? votedTastes : p.tastes).includes(x));
    const likedTitles = Taste.result(p.tasteVotes).likes.map(c => c.title);
    const exactLike = likedTitles.includes(recipe.title);
    if (exactLike) reasons.push("食べたいと選んだ一皿");
    if (taste) reasons.push("好きな味");
    const priorities = Persona.planning(p.dinnerPriorities, meta, pantryCount);
    reasons.push(...priorities.reasons, ...unconfirmed);
    return {
      ok: true,
      reasons,
      score: priorities.score + (useUp ? 20 : 0) + (exactLike ? 12 : 0) + (taste ? 8 : 0) + pantryCount * 2 - unconfirmed.length * 4,
      needsReview: !knownEquipment || !meta?.ingredientsVerified || unconfirmed.length > 0,
    };
  }
  const restrictionOptions = [
    "卵",
    "乳",
    "小麦",
    "えび",
    "かに",
    "そば",
    "落花生",
    "くるみ",
    "大豆",
    "魚",
    "肉",
  ];
  function propose({
    recipes,
    profile: p,
    slots = {},
    start,
    length = 3,
    addDays,
    overrides = {},
    repeatScore = () => 0,
  }) {
    const used = new Set(
      Object.values(slots)
        .filter(
          (x) =>
            x.date >= start &&
            x.date < addDays(start, length) &&
            x.status !== "removed",
        )
        .map((x) => x.recipe?.id),
    );
    const ingredients = new Set();
    let newCount = 0;
    return Array.from({ length }, (_, i) => {
      const date = addDays(start, i);
      const slot = slots[date];
      if (slot && slot.status !== "removed") {
        (slot.recipe?.ingredients || []).forEach((x) =>
          ingredients.add(key(x.name)),
        );
        return { date, slot };
      }
      if (
        slot?.status !== "removed" &&
        p.days.length &&
        !p.days.includes(String(new Date(date + "T12:00:00").getDay()))
      )
        return { date, off: true };
      const candidates = recipes
        .filter(
          (r) =>
            r.mealType === "dinner" &&
            !used.has(r.id) &&
            repeatScore(r) !== -Infinity,
        )
        .map((recipe) => ({ recipe, ...fit(recipe, p, date) }))
        .filter((x) => x.ok)
        .map((x) => ({
          ...x,
          score:
            x.score +
            repeatScore(x.recipe) +
            (p.savings
              ? (x.recipe.ingredients || []).filter((n) =>
                  ingredients.has(key(n.name)),
                ).length * 3
              : 0),
        }))
        .sort(
          (a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id),
        );
      const personal = candidates.filter((x) => !x.recipe.curated);
      const pool = newCount >= 1 && personal.length ? personal : candidates;
      const selected =
        pool.find((x) => x.recipe.id === overrides[date]) || pool[0];
      if (selected) {
        used.add(selected.recipe.id);
        if (selected.recipe.curated) newCount++;
        (selected.recipe.ingredients || []).forEach((x) =>
          ingredients.add(key(x.name)),
        );
      }
      return { date, candidate: selected || null };
    });
  }
  function normalizeSlots(raw = {}) {
    return Object.fromEntries(
      Object.entries(raw)
        .filter(
          ([date, s]) =>
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            s &&
            ["confirmed", "cooked", "off", "removed"].includes(s.status) &&
            (["off", "removed"].includes(s.status) ||
              (s.recipe?.id &&
                Array.isArray(s.recipe.ingredients) &&
                Array.isArray(s.recipe.steps))),
        )
        .map(([date, s]) => [
          date,
          {
            ...copy(s),
            date,
            mealType: "dinner",
            servings: [1, 2].includes(Number(s.servings))
              ? Number(s.servings)
              : 1,
          },
        ]),
    );
  }
  function mergeMap(a = {}, b = {}) {
    const result = { ...a };
    Object.entries(b).forEach(([k, v]) => {
      if (
        !result[k] ||
        String(v.updatedAt || "") > String(result[k].updatedAt || "") ||
        (v.updatedAt === result[k].updatedAt &&
          JSON.stringify(v) > JSON.stringify(result[k]))
      )
        result[k] = v;
    });
    return result;
  }
  function shopping({
    slots,
    start,
    end,
    scale,
    combine,
    pantry = {},
    marks = {},
    manual = {},
  }) {
    const groups = new Map();
    Object.values(slots)
      .filter(
        (s) => s.date >= start && s.date <= end && s.status === "confirmed",
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((s) => {
        s.recipe.ingredients.forEach((item) => {
          const k = key(item.name);
          if (!groups.has(k))
            groups.set(k, { id: k, name: item.name, amounts: [], parts: [] });
          const g = groups.get(k);
          const amount = scale(
            item.amount,
            s.servings,
            s.recipe.sourceServings,
          );
          g.amounts.push(amount);
          g.parts.push(`${s.date}:${s.recipe.id}:${amount}`);
        });
      });
    Object.entries(manual)
      .filter(([, m]) => !m.deleted)
      .forEach(([id, m]) =>
        groups.set(id, {
          id,
          name: m.name,
          amounts: [m.amount || ""],
          parts: [m.updatedAt],
        }),
      );
    return [...groups.values()].map((g) => {
      const signature = g.parts.join("|");
      const mark = marks[g.id];
      const owned = Object.entries(pantry).some(
        ([n, v]) => key(n) === g.id && v === "have",
      );
      const covered =
        !!mark?.signature &&
        g.parts.every((part) => mark.signature.split("|").includes(part));
      const status =
        mark && (mark.status === "buy" || covered)
          ? mark.status
          : owned
            ? "have"
            : "buy";
      return {
        ...g,
        signature,
        amount: combine(g.amounts),
        status,
        recheck: !!mark && mark.status !== "buy" && !covered && !owned,
      };
    });
  }
  function recipe(
    id,
    title,
    minutes,
    equipment,
    ingredients,
    steps,
    tastes = [],
    tasks = [],
  ) {
    return {
      id: `starter-${id}`,
      title,
      source: "リピごちの一品",
      sourceServings: 1,
      mealType: "dinner",
      curated: { version: 1 },
      videoUrl: "",
      caption: "",
      note: "",
      ingredients: ingredients.map(([name, amount, category = "その他"]) => ({
        name,
        amount,
        category,
      })),
      steps,
      tags: tastes,
      planning: {
        minutes,
        equipment,
        easy: true,
        tasks,
        tastes,
        ingredientsVerified: true,
        contains: ingredients.flatMap(([n]) => {
          const map = {
            しょうゆ: ["小麦", "大豆"],
            みそ: ["大豆"],
            豆腐: ["大豆"],
            ツナ缶: ["魚"],
            さば水煮缶: ["魚"],
            鮭: ["魚"],
            パスタ: ["小麦"],
            うどん: ["小麦"],
            チーズ: ["乳"],
            牛乳: ["乳"],
            バター: ["乳"],
            卵: ["卵"],
            豚こま: ["肉"],
            鶏ひき肉: ["肉"],
            豚ひき肉: ["肉"],
            ごま油: ["ごま"],
          };
          return map[n] || [];
        }),
      },
    };
  }
  // Original one-dish recipes. Product labels still need checking for compound seasonings.
  const rice = ["ごはん", "150g", "主食"],
    soy = ["しょうゆ", "小さじ1", "調味料"],
    oil = ["サラダ油", "小さじ1", "調味料"];
  const pan = ["コンロ", "フライパン", "計量スプーン"];
  const microwave = ["電子レンジ", "耐熱ボウル", "計量スプーン"];
  const curated = [
    recipe(
      "01",
      "豆腐と卵のやさしい丼",
      15,
      pan,
      [rice, ["豆腐", "150g"], ["卵", "1個"], soy],
      [
        "豆腐を崩し、水大さじ2・しょうゆとフライパンで温める。",
        "溶き卵を加え、卵が固まるまで加熱する。",
        "温かいごはんにのせる。",
      ],
      ["和風"],
    ),
    recipe(
      "02",
      "ツナとトマトのパスタ",
      20,
      ["コンロ", "鍋", "ざる", "計量スプーン"],
      [
        ["パスタ", "100g", "主食"],
        ["ツナ缶", "1缶"],
        ["トマト缶", "100g"],
        ["塩", "少々", "調味料"],
      ],
      [
        "パスタを袋の表示どおりにゆで、湯を切る。",
        "鍋にツナとトマト、塩を入れて5分ほど煮る。",
        "パスタを戻して絡める。",
      ],
      ["洋風"],
    ),
    recipe(
      "03",
      "豚こまキャベツ丼",
      20,
      [...pan, "キッチンばさみ"],
      [rice, ["豚こま", "100g", "肉"], ["キャベツ", "100g", "野菜"], soy, oil],
      [
        "キャベツをちぎり、豚肉をはさみで食べやすく切る。",
        "油を熱し、豚肉とキャベツを炒める。肉の中心まで十分に火を通す。",
        "しょうゆで味を整え、温かいごはんにのせる。",
      ],
      ["和風"],
      ["肉を切る"],
    ),
    recipe(
      "04",
      "さばと豆腐のみそ丼",
      10,
      microwave,
      [
        rice,
        ["さば水煮缶", "1缶"],
        ["豆腐", "150g"],
        ["みそ", "小さじ1", "調味料"],
      ],
      [
        "耐熱ボウルにさば、崩した豆腐、みそ、水大さじ1を入れる。",
        "ふんわりラップをし600Wで3分加熱。一度混ぜ、冷たければ30秒ずつ追加する。",
        "温かいごはんにのせる。",
      ],
      ["和風"],
    ),
    recipe(
      "05",
      "きのこのバターしょうゆうどん",
      15,
      [...pan, "キッチンばさみ"],
      [
        ["うどん", "1玉", "主食"],
        ["しめじ", "100g", "野菜"],
        ["バター", "10g", "調味料"],
        soy,
      ],
      [
        "しめじの根元をはさみで除き、ほぐす。",
        "フライパンにしめじ、バター、水大さじ3を入れて火を通す。",
        "加熱済みのうどんとしょうゆを加え、袋の表示を参考に温まるまで炒める。",
      ],
      ["和風"],
    ),
    recipe(
      "06",
      "トマトと豆腐のチーズごはん",
      10,
      microwave,
      [
        rice,
        ["豆腐", "150g"],
        ["トマト缶", "100g"],
        ["チーズ", "30g"],
        ["塩", "少々", "調味料"],
      ],
      [
        "耐熱ボウルにごはん、崩した豆腐、トマト、塩を入れて混ぜる。",
        "チーズをのせ、ふんわりラップをし600Wで3分加熱する。",
        "全体を混ぜ、冷たければ30秒ずつ追加加熱する。",
      ],
      ["洋風"],
    ),
    recipe(
      "07",
      "鶏そぼろごはん",
      15,
      pan,
      [
        rice,
        ["鶏ひき肉", "100g", "肉"],
        soy,
        ["砂糖", "小さじ1", "調味料"],
        ["しょうが", "少々", "調味料"],
      ],
      [
        "フライパンにひき肉、しょうゆ、砂糖、しょうが、水大さじ2を入れる。",
        "中火でほぐしながら炒め、肉全体に十分火を通す。",
        "温かいごはんにのせる。",
      ],
      ["和風"],
    ),
    recipe(
      "08",
      "豆腐とキャベツのみそ焼きうどん",
      20,
      pan,
      [
        ["うどん", "1玉", "主食"],
        ["豆腐", "150g"],
        ["キャベツ", "100g", "野菜"],
        ["みそ", "小さじ2", "調味料"],
        oil,
      ],
      [
        "キャベツをちぎり、豆腐の水を切る。みそを水大さじ2で溶く。",
        "油でキャベツと豆腐を炒める。",
        "加熱済みのうどんとみそを加え、袋の表示を参考に全体が温まるまで炒める。",
      ],
      ["和風"],
    ),
    recipe(
      "09",
      "ツナコーンごはん",
      10,
      microwave,
      [
        rice,
        ["ツナ缶", "1缶"],
        ["コーン缶", "50g"],
        ["バター", "10g", "調味料"],
        ["塩", "少々", "調味料"],
      ],
      [
        "耐熱ボウルにごはん、汁気を切ったツナとコーン、バター、塩を入れる。",
        "ふんわりラップをし600Wで2分加熱する。",
        "混ぜて、冷たければ30秒ずつ追加する。",
      ],
      ["洋風"],
    ),
    recipe(
      "10",
      "豚ひき肉と豆腐のそぼろ丼",
      15,
      pan,
      [
        rice,
        ["豚ひき肉", "100g", "肉"],
        ["豆腐", "150g"],
        soy,
        ["ごま油", "小さじ1", "調味料"],
      ],
      [
        "ごま油を熱し、ひき肉をほぐしながら炒める。",
        "崩した豆腐としょうゆを加え、肉全体に十分火が通るまで炒める。",
        "温かいごはんにのせる。",
      ],
      ["中華風"],
    ),
    recipe(
      "11",
      "鮭としめじの蒸しごはん",
      25,
      [...pan, "キッチンばさみ", "ふた"],
      [
        rice,
        ["鮭", "1切れ", "魚"],
        ["しめじ", "100g", "野菜"],
        soy,
        ["バター", "10g", "調味料"],
      ],
      [
        "しめじの根元をはさみで除く。",
        "フライパンに鮭、しめじ、バター、水大さじ3を入れ、ふたをして弱めの中火で蒸す。途中で水がなくなれば足す。",
        "鮭の中心まで十分に火を通す。骨を除き、しょうゆで味を整えて温かいごはんにのせる。",
      ],
      ["和風"],
    ),
    recipe(
      "12",
      "トマト卵うどん",
      15,
      ["コンロ", "鍋", "計量スプーン"],
      [
        ["うどん", "1玉", "主食"],
        ["トマト缶", "100g"],
        ["卵", "1個"],
        ["塩", "少々", "調味料"],
        ["ごま油", "小さじ1", "調味料"],
      ],
      [
        "鍋にトマト、水200ml、塩を入れて沸かす。",
        "うどんを入れ、袋の表示を参考に温める。",
        "溶き卵を加え、卵が固まるまで煮て、ごま油を加える。",
      ],
      ["中華風"],
    ),
  ];
  const api = {
    profile,
    equipment,
    equipmentGroups,
    equipmentDefaults,
    pantry,
    pantryCommon,
    pantryDefaults,
    restrictionOptions,
    key,
    fit,
    propose,
    normalizeSlots,
    mergeMap,
    shopping,
    curated,
    copy,
  };
  root.Lifestyle = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
