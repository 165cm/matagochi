/* Pure planning rules, shared by the browser and Node regression tests. */
(function (root) {
  const Taste = typeof module !== "undefined" && module.exports ? require("./taste.js") : root.FoodTaste;
  const Persona = typeof module !== "undefined" && module.exports ? require("./dinner-persona.js") : root.DinnerPersona;
  const SkillDB = () => (typeof module !== "undefined" && module.exports ? require("./skills.js") : root.Skills);
  const Starter = typeof module !== "undefined" && module.exports ? require("./starter-recipes.js") : root.StarterRecipes;
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
    {label: "基本の道具", hint: "まずはここから。未回答の基本の道具は「ある」が初期値です。", defaultValue: "have", names: ["コンロ", "電子レンジ", "フライパン", "鍋", "包丁", "まな板", "ざる", "ふた", "計量スプーン", "キッチンばさみ", "耐熱ボウル"]},
    {label: "あると便利", hint: "持っているものをタップして追加しましょう。", defaultValue: "none", names: ["炊飯器", "トースター", "電気ケトル"]},
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
      detailedSetup: raw.detailedSetup === true,
      // 初回設定の順番の版（2＝2026-09-30 の整理後・3＝2026-10-28 の7画面）。途中の人の移し替えに使う（daily-ui.js migrateFunnel）。
      ...([2, 3].includes(raw.funnelV) ? { funnelV: raw.funnelV } : {}),
      // 初回設定の確認の画面で選んだ「今夜から（true）／明日から（false）」。選んでいなければ持たない（時刻で決める）。
      ...(typeof raw.startTonight === "boolean" ? { startTonight: raw.startTonight } : {}),
      quickSetupIndex: Number.isInteger(raw.quickSetupIndex) && raw.quickSetupIndex >= 0 && raw.quickSetupIndex <= 20 ? raw.quickSetupIndex : null,
      picks: Array.isArray(raw.picks) ? raw.picks.filter((x) => typeof x === "string" && x.length < 40).slice(0, 12) : [],
      // はじめの質問（悩み・保存した動画・食費）。献立には使わず、案内の言葉と目安に使う。
      ...(raw.remindAdded === true ? { remindAdded: true } : {}),
      // 晩ごはんタイプ診断：1週間の割合・主食・外食のお店・いちばん大事なこと。
      ...(raw.ratio && typeof raw.ratio === "object" ? { ratio: Object.fromEntries(["wd", "we"].filter((part) => raw.ratio[part] && typeof raw.ratio[part] === "object").map((part) => [part, Object.fromEntries(["self", "out", "take", "deli"].map((k) => [k, Math.max(0, Math.min(part === "wd" ? 5 : 2, Math.round(Number(raw.ratio[part][k]) || 0)))]))])) } : {}),
      ...(raw.ratioSet === true ? { ratioSet: true } : {}),
      ...(Array.isArray(raw.staples) ? { staples: raw.staples.filter((x) => ["rice", "noodle", "bread", "other"].includes(x)) } : {}),
      ...(Array.isArray(raw.chains) ? { chains: raw.chains.filter((x) => /^[a-z]{2,12}$/.test(x)).slice(0, 3) } : {}),
      ...(typeof raw.priority === "string" && /^[a-z]{3,8}$/.test(raw.priority) ? { priority: raw.priority } : {}),
      ...(Array.isArray(raw.eaters) ? { eaters: raw.eaters.filter((x) => ["me", "partner", "kids", "teens", "parents", "friends"].includes(x)) } : {}),
      ...Object.fromEntries(["goal", "pain", "savedVideos", "foodBudget"].filter((k) => typeof raw[k] === "string" && raw[k].length < 20).map((k) => [k, raw[k]])),
      version: 1,
      completed: raw.completed === true,
      step: Math.min(15, Math.max(0, Number(raw.step) || 0)),
      // 5 は「5人以上」。
      servings: [1, 2, 3, 4, 5].includes(Number(raw.servings))
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
      // 時計のダイヤルで5分きざみ（5〜60分）。
      weekdayMinutes: Number.isInteger(Number(raw.weekdayMinutes)) && Number(raw.weekdayMinutes) >= 5 && Number(raw.weekdayMinutes) <= 60 && Number(raw.weekdayMinutes) % 5 === 0
        ? Number(raw.weekdayMinutes)
        : null,
      weekendMinutes: [10, 20, 30, 60].includes(Number(raw.weekendMinutes))
        ? Number(raw.weekendMinutes)
        : null,
      skill: ["easy", "any"].includes(raw.skill) ? raw.skill : "unknown",
      // 料理スキル診断の結果（0＝未診断）と、レベルアップするかどうか
      skillLevel: [1, 2, 3, 4, 5].includes(Number(raw.skillLevel)) ? Number(raw.skillLevel) : 0,
      skillGrowth: raw.skillGrowth === "grow" ? "grow" : "steady",
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
      // 本人が「残っている」と確かめた食材（家族で共有・daily-ui.js が今の分だけ入れる）。使い切りたい食材と同じ加点。
      leftovers: list(raw.leftovers),
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
  function suggestPlanning(recipe) {
    const names = (recipe.ingredients || []).map(i => i.name).join(" ");
    const steps = (recipe.steps || []).join(" ");
    const equipment = [];
    if (/レンジ|[56]00[WＷ]/i.test(steps)) equipment.push("電子レンジ", "耐熱ボウル");
    if (/フライパン|炒め|炒める|揚げ/.test(steps)) equipment.push("コンロ", "フライパン");
    // "しょうゆで" / "めんつゆで" are seasonings, not boiling.
    if (/鍋|(?<![うつ])ゆで|茹で|煮る|煮込/.test(steps)) equipment.push("コンロ", "鍋");
    if (/切|刻/.test(steps)) equipment.push("包丁", "まな板");
    if (/はさみ|ハサミ/.test(steps)) equipment.push("キッチンばさみ");
    if (/ふた|蓋/.test(steps)) equipment.push("ふた");
    if (/オーブン/.test(steps)) equipment.push("オーブン");
    if (/トースター/.test(steps)) equipment.push("トースター");
    const rules = {
      卵:/卵|たまご|玉子|マヨネーズ|パン粉|粉チーズ/,
      乳:/牛乳|チーズ|バター|生クリーム|ヨーグルト|パン粉|鶏ガラ/,
      小麦:/小麦|しょうゆ|醤油|うどん|パスタ|パン|餃子|めんつゆ|ポン酢|豆板醤|鶏ガラ/,
      大豆:/大豆|豆腐|豆乳|納豆|みそ|味噌|しょうゆ|醤油|油揚げ|厚揚げ|サラダ油|ツナ|めんつゆ|ポン酢|豆板醤|鶏ガラ/,
      魚:/魚|鮭|さけ|サーモン|さば|鯖|ツナ|かつお|鰹|しらす|たら(?!ご)|鱈|ぶり(?!お)|鰤|まぐろ|鮪|あじ(?!あ)|鯵|いわし|鰯|さんま|秋刀魚|かじき|梶木|めんつゆ|ポン酢|ナンプラー|みそ|味噌|キムチ/,
      肉:/肉|鶏|ささみ|笹身|手羽|豚|牛(?!乳|蒡)|合いびき|合びき|合挽|挽き肉|挽肉|ベーコン|ハム|ソーセージ|ウインナー|鶏ガラ/,
      えび:/えび|エビ|海老|キムチ/, かに:/かに|カニ|蟹/,
      そば:/そば|蕎麦/, 落花生:/落花生|ピーナッツ/, くるみ:/くるみ|クルミ/,
    };
    // 表記ゆれ：半角を全角にした名前と、カタカナをひらがなにした名前の両方で照らす（タラ → たら、ササミ → ささみ）。カタカナで書いた決まりは元の名前で当たる。
    const full = names.normalize("NFKC");
    const hira = full.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
    const contains = Object.entries(rules).filter(([, re]) => re.test(full) || re.test(hira)).map(([c]) => c);
    const tasks = [];
    if (/肉/.test(names) && /切|刻/.test(steps)) tasks.push("肉を切る");
    if (/揚げ/.test(steps)) tasks.push("揚げる");
    if (/長時間|[456789]0分|[1-9]時間/.test(steps)) tasks.push("長く煮込む");
    return {minutes:null, equipment:list(equipment), contains, tasks, tastes:[], easy:null,
      ingredientsVerified:false, conditionsConfirmed:false};
  }
  function reviewable(recipe, p, date) {
    if (fit(recipe, p, date).reason === "避けたい食材を含みます") return false;
    const meta = recipe.planning || {};
    const inferred = suggestPlanning(recipe);
    const known = [...(meta.contains || []), ...inferred.contains,
      ...(recipe.ingredients || []).flatMap(i => [i.name, ...(i.allergens || []), ...(i.label_check || [])])];
    if ([...p.restrictions, ...p.dislikes].some(x => known.some(n => matches(n,x)))) return false;
    if (meta.equipment?.some(e => p.equipment[e] === "none") || meta.tasks?.some(t => p.avoidTasks.includes(t))) return false;
    const minutes = [0,6].includes(new Date(date+"T12:00:00").getDay()) ? p.weekendMinutes : p.weekdayMinutes;
    if (minutes && meta.minutes > minutes || p.skill === "easy" && meta.easy === false) return false;
    return !meta.minutes || !meta.ingredientsVerified || !meta.conditionsConfirmed;
  }
  // 腕前（★）より難しい料理の、上回る★ひとつごとに下げる点数（好きな味 8・使い切り 20 と同じくらいの重さ）。
  const SKILL_PENALTY = 15;
  function fit(recipe, p, date) {
    const meta = recipe.planning;
    const names = (recipe.ingredients || []).map((x) => x.name);
    const searchable = [...names, ...(meta?.contains || []),
      ...(recipe.ingredients || []).flatMap(i => [...(i.allergens || []), ...(i.label_check || [])]),
      ...names.flatMap(n => [
        ...(/ケチャップ|中濃ソース/.test(n) ? ["トマト"] : []),
        ...(/みそ|しめじ/.test(n) ? ["きのこ"] : []),
      ])];
    // 食べられないもの（restrictions）は、原材料の印がなくても、材料名からの推測（suggestPlanning の contains：豚こま → 肉、鮭 → 魚、しょうゆ → 小麦 など）でも外す。
    // 苦手（dislikes）は材料名と印だけで見る（だしのような推測で外しすぎない）。
    const inferred = p.restrictions.length ? suggestPlanning(recipe).contains : [];
    const blocked = p.restrictions.find((x) => [...searchable, ...inferred].some((n) => matches(n, x)))
      || p.dislikes.find((x) => searchable.some((n) => matches(n, x)));
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
    if (minutes && (!meta?.minutes || meta.minutes > minutes))
      return { ok: false, reason: "調理時間の条件を確認してください" };
    if (p.skill === "easy" && !meta?.easy)
      return { ok: false, reason: "調理の難易度が未確認です" };
    if (p.avoidTasks.length && !meta?.tasks)
      return { ok: false, reason: "調理作業が未確認です" };
    if (!meta?.ingredientsVerified || !meta.minutes || meta.easy == null || !meta.tasks || (!meta.noEquipment && !meta.equipment?.length) || meta.conditionsConfirmed === false) return {ok:false, needsReview:true, reason:"調理条件の確認が必要です"};
    // 料理の腕前（★）：難しい料理も外さず、並べる順を下げるだけ（2026-10-28 のユーザーの判断「並べ替えに」。候補を減らさない）。
    // ★がひとつ上の料理には「ちょっと挑戦」の印。下げる幅は、上回る★ひとつごとに SKILL_PENALTY 点。
    const need = SkillDB()?.rate(recipe).level || 1;
    const over = p.skillLevel ? Math.max(0, need - p.skillLevel) : 0;
    const challenge = over > 0;
    const knownEquipment =
      meta?.noEquipment === true || !!meta?.equipment?.length &&
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
    // 残っている食材（確かめたもの）を使う料理。加点は「使い切りたい」と合わせて1回だけ。
    const leftover = (p.leftovers || []).find((x) => names.some((n) => matches(n, x)));
    if (leftover) reasons.push(`🧺 残りの${leftover}を使う`);
    const votedTastes = Taste.preferredTastes(p.tasteVotes);
    const taste = meta?.tastes?.some((x) => (Taste.normalize(p.tasteVotes).length ? votedTastes : p.tastes).includes(x));
    const likedTitles = Taste.result(p.tasteVotes).likes.map(c => c.title);
    const exactLike = likedTitles.includes(recipe.title);
    if (exactLike) reasons.push("食べたいと選んだ一皿");
    if (taste) reasons.push("好きな味");
    const priorities = Persona.planning(p.dinnerPriorities, meta, pantryCount);
    reasons.push(...priorities.reasons);
    return {
      ok: true,
      reasons,
      score: priorities.score + (useUp || leftover ? 20 : 0) + (exactLike ? 12 : 0) + (taste ? 8 : 0) + pantryCount * 2 - over * SKILL_PENALTY,
      needsReview: !knownEquipment || !meta?.ingredientsVerified,
      challenge,
      skillNeed: need,
    };
  }
  // 条件で候補が足りない時の緩和の提案：どの条件（時間・スキルなど）を少し広げれば、何品増えるかを数える。
  // ★安全のため、食べられないもの（restrictions）と苦手（dislikes）は絶対に緩めない（提案もしない）。
  function widenHints({
    recipes = [],
    profile: p,
    dates = [],
    cyclesOf = () => ({}),
    autoBlocked = () => false,
    repeatScore = () => 0,
  }) {
    if (!p) return [];
    const dinners = (recipes || []).filter(
      (r) =>
        r &&
        r.mealType === "dinner" &&
        repeatScore(r) !== -Infinity &&
        !autoBlocked(r) &&
        !Object.values(cyclesOf(r) || {}).includes("never"),
    );
    const isWe = (d) => [0, 6].includes(new Date(d + "T12:00:00").getDay());
    const targetDates = dates.length ? dates : ["2026-10-01", "2026-10-03"];
    const hasWd = targetDates.some((d) => !isWe(d));
    const hasWe = targetDates.some((d) => isWe(d));
    const wdDate = targetDates.find((d) => !isWe(d)) || "2026-10-01";
    const weDate = targetDates.find((d) => isWe(d)) || "2026-10-03";

    const hints = [];

    // 1. 平日の調理時間 (weekdayMinutes)
    if (hasWd && p.weekdayMinutes && p.weekdayMinutes < 60) {
      const next = [15, 20, 30, 45, 60].find((m) => m > p.weekdayMinutes);
      if (next) {
        const p2 = { ...p, weekdayMinutes: next };
        const gain = dinners.filter((r) => !fit(r, p, wdDate).ok && fit(r, p2, wdDate).ok).length;
        if (gain > 0) {
          hints.push({
            key: "weekdayMinutes",
            value: next,
            gain,
            label: `平日${p.weekdayMinutes}分→${next}分（＋${gain}品）`,
          });
        }
      }
    }

    // 2. 休日の調理時間 (weekendMinutes)
    if (hasWe && p.weekendMinutes && p.weekendMinutes < 60) {
      const next = [20, 30, 60].find((m) => m > p.weekendMinutes);
      if (next) {
        const p2 = { ...p, weekendMinutes: next };
        const gain = dinners.filter((r) => !fit(r, p, weDate).ok && fit(r, p2, weDate).ok).length;
        if (gain > 0) {
          hints.push({
            key: "weekendMinutes",
            value: next,
            gain,
            label: `休日${p.weekendMinutes}分→${next}分（＋${gain}品）`,
          });
        }
      }
    }

    // 3. 料理の腕前は献立から外さない（並べる順だけ）ので、広げる案は出さない（2026-10-28）。

    // 4. かんたん優先 (skill === "easy")
    if (p.skill === "easy") {
      const p2 = { ...p, skill: "any" };
      const refDate = hasWd ? wdDate : weDate;
      const gain = dinners.filter((r) => !fit(r, p, refDate).ok && fit(r, p2, refDate).ok).length;
      if (gain > 0) {
        hints.push({
          key: "skill",
          value: "any",
          gain,
          label: `かんたん以外も（＋${gain}品）`,
        });
      }
    }

    return hints.sort((a, b) => b.gain - a.gain).slice(0, 2);
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
  // --- Rotation: remember what was eaten recently so dinners don't repeat by type ---
  const NOODLE = /パスタ|スパゲ|うどん|そば|ラーメン|焼きそば|そうめん|麺/;
  function traits(recipe) {
    const title = String(recipe?.title || "");
    const names = (recipe?.ingredients || []).map((i) => i.name).join(" ");
    const text = title + " " + names;
    const staple = NOODLE.test(text) ? "noodle"
      : /(?<!フライ)パン(?!粉)|トースト|サンド/.test(text) ? "bread"
      : /ごはん|米|丼|チャーハン|リゾット|カレー|ライス|おにぎり|雑炊|ビリヤニ/.test(text) ? "rice" : "other";
    const protein = /鶏|豚|牛|ひき肉|合いびき|ハム|ベーコン|ウインナー|ソーセージ|肉/.test(names || title) ? "meat"
      : /鮭|さけ|さば|ツナ|魚|えび|いか|たら|しらす|まぐろ|かつお|ぶり/.test(names || title) ? "fish"
      : /卵|たまご|豆腐|厚揚げ|納豆|豆乳/.test(names || title) ? "eggtofu" : "veg";
    const tastes = recipe?.planning?.tastes || recipe?.tags || [];
    const cuisine = tastes.includes("中華風") ? "chinese" : tastes.includes("洋風") ? "western" : tastes.includes("和風") ? "japanese"
      : /豆板醤|オイスター|キムチ|麻婆|担々|ナンプラー/.test(text) ? "chinese"
      : /パスタ|チーズ|トマト|ケチャップ|バター|リゾット/.test(text) ? "western" : "japanese";
    return { staple, protein, cuisine };
  }
  // ----- Tags for browsing (3 taps: 主食 → 素材 → 気分・作り方) -----
  const FACETS = [
    { id: "staple", label: "主食", options: [["rice", "ごはん"], ["noodle", "麺"], ["bread", "パン"], ["other", "おかず"]] },
    { id: "main", label: "素材", options: [["chicken", "鶏"], ["pork", "豚"], ["beef", "牛"], ["mince", "ひき肉"], ["fish", "魚"], ["egg", "卵"], ["tofu", "豆腐・大豆"], ["veg", "野菜が主役"]] },
    { id: "style", label: "気分・作り方", options: [["easy", "かんたん★1〜2"], ["quick", "10分以内"], ["micro", "レンジ"], ["pan", "フライパン"], ["pot", "鍋"], ["spicy", "ピリ辛"], ["light", "さっぱり"], ["rich", "こってり"], ["soup", "汁もの"], ["japanese", "和風"], ["western", "洋風"], ["chinese", "中華"], ["ethnic", "エスニック"]] },
  ];
  const TAG_RULES = {
    chicken: /鶏|ささみ|手羽|チキン/, pork: /豚|ベーコン|ハム|ウインナー|ソーセージ/, beef: /牛(?!乳)/,
    mince: /ひき肉|合いびき|そぼろ|つくね|ハンバーグ|小籠包/, fish: /鮭|さけ|さば|サバ|ツナ|魚|えび|いか|たら|しらす|ぶり|まぐろ|かつお/,
    egg: /卵|たまご|玉子/, tofu: /豆腐|厚揚げ|油揚げ|納豆|豆乳|大豆/,
    spicy: /辛|キムチ|豆板醤|コチュジャン|ラー油|担々|麻辣|一味|七味|ガパオ|カレー|ヤンニョム/,
    light: /ポン酢|酢|冷や|梅|レモン|しそ|大葉|おろし|蒸し/,
    rich: /バター|チーズ|マヨ|クリーム|カルボナーラ|揚げ|甘辛|照り焼き|ハンバーグ/,
    soup: /スープ|汁|麻辣湯/, ethnic: /ナンプラー|ガパオ|タコライス|ビリヤニ|ヤンニョム|コチュジャン|エスニック/,
    micro: /レンジ/, pan: /フライパン|炒め|焼き/, pot: /鍋|ゆで|茹で|煮/,
  };
  function tags(recipe = {}) {
    const names = (recipe.ingredients || []).map((x) => x.name).join(" ");
    const text = [recipe.title, names, ...(recipe.steps || []), ...(recipe.planning?.equipment || [])].join(" ");
    const t = traits(recipe);
    const out = new Set([t.staple, t.cuisine]);
    for (const [tag, re] of Object.entries(TAG_RULES)) {
      const where = ["chicken", "pork", "beef", "mince", "fish", "egg", "tofu"].includes(tag) ? `${recipe.title} ${names}` : text;
      if (re.test(where)) out.add(tag);
    }
    if (!["chicken", "pork", "beef", "mince", "fish"].some((x) => out.has(x))) out.add("veg");
    if (recipe.planning?.minutes && recipe.planning.minutes <= 10) out.add("quick");
    if (SkillDB()?.rate(recipe).level <= 2) out.add("easy");
    return [...out];
  }
  const stapleLabel = { rice: "ごはんもの", noodle: "麺", bread: "パン", other: "おかず" };
  const proteinLabel = { meat: "肉", fish: "魚", eggtofu: "卵・豆腐", veg: "野菜" };
  function stapleName(recipe) {
    const m = String(recipe?.title || "").match(/パスタ|うどん|そば|ラーメン|焼きそば|そうめん|カレー|チャーハン|丼/);
    if (m) return m[0] === "丼" ? "丼もの" : m[0];
    return stapleLabel[traits(recipe).staple];
  }
  const dayWord = (gap) => (gap === 1 ? "昨日" : gap === 2 ? "一昨日" : `${gap}日前`);
  // 同じ親の料理名（dish・APP_MAP §48）も同じ料理として数える（前回からの日数・好物の頃合いは親で見る）。
  const sameDish = (a, b) => !!a && !!b && (a.id === b.id || (!!a.folder && a.folder === b.folder) || (!!a.dish && a.dish === b.dish) || (!!a.starterId && a.starterId === b.id) || (!!b.starterId && b.starterId === a.id) || (!!a.starterId && a.starterId === b.starterId) || (!!a.title && a.title === b.title));
  // timeline: [{date, recipe}] of meals already eaten or already picked, any order.
  // Penalises the same staple / protein / cuisine within three days. Repeating the same
  // dish is handled by the repeat cycle (repeatFit), not here.
  function rotation(recipe, date, timeline, daysBetween) {
    const t = traits(recipe);
    let penalty = 0;
    let lastEatenDays = null;
    let reason = "";
    const recent = timeline
      .map((m) => ({ ...m, gap: daysBetween(m.date, date) }))
      .filter((m) => m.gap > 0 && m.recipe)
      .sort((a, b) => a.gap - b.gap);
    for (const m of recent) {
      if (sameDish(m.recipe, recipe) && lastEatenDays === null) lastEatenDays = m.gap;
      if (m.gap > 3) continue;
      const w = 4 - m.gap; // yesterday 3, day before 2, three days ago 1
      const mt = traits(m.recipe);
      if (mt.staple === t.staple && t.staple !== "other") penalty += 5 * w;
      if (mt.protein === t.protein) penalty += 3 * w;
      if (mt.cuisine === t.cuisine) penalty += 1 * w;
    }
    const prev = recent.find((m) => m.gap <= 2 && traits(m.recipe).staple !== t.staple && traits(m.recipe).staple !== "other");
    if (prev && t.staple !== "other") reason = `${dayWord(prev.gap)}は${stapleName(prev.recipe)} → ${stapleLabel[t.staple]}`;
    else {
      // 主菜の素材：肉が続いたら魚、など。直近2日で見る。
      const near = recent.filter((m) => m.gap <= 2).map((m) => ({ gap: m.gap, protein: traits(m.recipe).protein }));
      const last = near[0];
      if (last && last.protein !== t.protein && ["meat", "fish"].includes(last.protein)) {
        const run = near.length >= 2 && near[1].protein === last.protein;
        reason = run ? `${proteinLabel[last.protein]}続き → ${proteinLabel[t.protein]}` : `${dayWord(last.gap)}は${proteinLabel[last.protein]} → ${proteinLabel[t.protein]}`;
      }
    }
    return { penalty, reason, lastEatenDays, traits: t };
  }
  // Repeat cycles: how often each person wants a dish again (days).
  const CYCLE_DAYS = { tomorrow: 1, weekly: 7, twice_month: 14, monthly: 30, pause: 90 };
  const UNRATED_INTERVAL = 14; // eaten but nobody has said how often yet
  const LOVED = ["tomorrow", "weekly"];
  // cycles: {person: cycleId}. The household waits until everyone wants it again (longest cycle).
  function repeatFit(recipe, date, timeline, daysBetween, cycles = {}) {
    const values = Object.values(cycles || {}).filter(Boolean);
    if (values.includes("never")) return { exclude: true, known: true, score: 0, reason: "" };
    const days = values.map((c) => CYCLE_DAYS[c]).filter(Boolean);
    const interval = days.length ? Math.max(...days) : UNRATED_INTERVAL;
    const loves = values.filter((c) => LOVED.includes(c)).length;
    const gaps = timeline.filter((m) => m.recipe && sameDish(m.recipe, recipe)).map((m) => daysBetween(m.date, date)).filter((g) => g > 0);
    const last = gaps.length ? Math.min(...gaps) : null;
    let score = loves * 6;
    const bothLove = values.length >= 2 && loves === values.length;
    const who = values.length === 2 ? "ふたり" : "みんな";
    if (last === null) return { exclude: false, known: false, due: false, interval, last, loves, bothLove, score, reason: bothLove ? `${who}の好物` : "" };
    const ratio = last / interval;
    let reason = "";
    if (ratio < 1) score -= 60 * (1 - ratio); // まだ早い
    else {
      score += 20 + Math.min(15, (ratio - 1) * 15);
      // だれが食べたいか ＋ 前回からの日数を1行で（献立カードで切れない長さ）。
      const fans = Object.keys(cycles || {}).filter((k) => LOVED.includes(cycles[k]));
      if (bothLove) reason = `${who}の${interval <= 1 ? "大" : ""}好物・${last}日ぶり`;
      else if (fans.length && values.length === 1) reason = `大好物・${last}日ぶり`;
      else if (fans.length) reason = `${fans.join("・")}の好物・${last}日ぶり`;
      else reason = ratio >= 2 ? `久しぶり（${last}日ぶり）` : `ちょうどいい頃（${last}日ぶり）`;
    }
    return { exclude: false, known: true, due: ratio >= 1, interval, last, ratio, loves, bothLove, score, reason };
  }
  // 旬：月ごとに、その季節においしい食材。候補を少しだけ前へ出し、理由に添える。
  const SEASONS = [
    { months: [3, 4, 5], icon: "🌸", items: [[/たけのこ|筍/, "たけのこ"], [/菜の花/, "菜の花"], [/新玉/, "新玉ねぎ"], [/春キャベツ/, "春キャベツ"], [/アスパラ/, "アスパラ"], [/そら豆/, "そら豆"], [/あさり/, "あさり"]] },
    { months: [6, 7, 8], icon: "🌻", items: [[/なす|茄子/, "なす"], [/トマト/, "トマト"], [/きゅうり/, "きゅうり"], [/ゴーヤ/, "ゴーヤ"], [/オクラ/, "オクラ"], [/とうもろこし|コーン(?!スターチ|フレーク)/, "とうもろこし"], [/ピーマン/, "ピーマン"], [/ズッキーニ/, "ズッキーニ"]] },
    { months: [9, 10, 11], icon: "🍂", items: [[/さんま|秋刀魚/, "さんま"], [/鮭|さけ|秋鮭/, "鮭"], [/さつまいも/, "さつまいも"], [/かぼちゃ/, "かぼちゃ"], [/(?<!片)栗(?!粉)/, "栗"], [/しめじ|まいたけ|しいたけ|エリンギ|えのき|きのこ/, "きのこ"]] },
    { months: [12, 1, 2], icon: "⛄", items: [[/白菜/, "白菜"], [/大根/, "大根"], [/ぶり|鰤/, "ぶり"], [/かぶ/, "かぶ"], [/牡蠣|カキ/, "牡蠣"], [/たら(?!こ)|鱈/, "たら"], [/春菊/, "春菊"], [/ほうれん草|ほうれんそう/, "ほうれん草"]] },
  ];
  function season(recipe = {}, date = "") {
    const month = Number(String(date).slice(5, 7));
    const s = SEASONS.find((x) => x.months.includes(month));
    if (!s) return { score: 0, reason: "" };
    for (const i of recipe.ingredients || []) {
      const name = String(i?.name || "");
      if (KEEPS.test(name)) continue;
      const hit = s.items.find(([re]) => re.test(name));
      if (hit) return { score: 2, reason: `${s.icon} 旬の${hit[1]}` };
    }
    return { score: 0, reason: "" };
  }
  const SCORE = { request: 80, saved: 5 };
  const MAX_NEW_PER_PLAN = 1;
  // 献立の日付と料理の id から決まる数（同じ点数の候補の並びに使う。FNV-1a）。
  function tieRank(date, id) {
    let h = 2166136261;
    for (const c of `${date}|${id}`) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  // 日持ち：傷みやすく、冷凍しにくい食材ほど急ぐ（5がいちばん急ぐ）。買い物のあと、急ぐ料理から先に作る。
  // [食材名の正規表現, 急ぎ度, 表示名]。冷凍できる肉は低め、生で食べる葉物・もやし・刺身は高め。
  const FRESHNESS = [
    [/刺身|さしみ|生食用|まぐろ|サーモン/, 5, "刺身"],
    [/もやし|豆苗|かいわれ|スプラウト/, 5, "もやし・豆苗"],
    [/レタス|水菜|春菊|ほうれん草|ほうれんそう|小松菜|ニラ|にら|大葉|青じそ|三つ葉|パクチー|ベビーリーフ|サラダ菜/, 4, "葉もの野菜"],
    [/あじ|いわし|さば|さんま|鮭|さけ|たら|ぶり|かじき|えび|いか|たこ|あさり|しじみ|白身魚|切り身/, 4, "魚介"],
    [/ひき肉|挽き肉|ミンチ/, 3, "ひき肉"],
    [/豆腐|とうふ/, 3, "豆腐"],
    [/鶏|ささみ|手羽/, 2, "鶏肉"],
    [/きゅうり|トマト|なす|ピーマン|ズッキーニ|オクラ|ブロッコリー|アスパラ|とうもろこし/, 2, "夏野菜・ブロッコリー"],
    [/豚|牛|薄切り肉|こま切れ/, 1, "肉"],
    [/しめじ|えのき|しいたけ|まいたけ|エリンギ|きのこ|マッシュルーム/, 1, "きのこ"],
    [/生クリーム|牛乳/, 1, "乳製品"],
  ];
  // 冷凍品・乾物・缶詰・加工品は急がない（「冷凍えび」「ツナ缶」など）。
  const KEEPS = /冷凍|缶|乾燥|干し|ツナ|ベーコン|ハム|ソーセージ|ウインナー|ちくわ|かまぼこ|カニカマ|練り物/;
  function freshness(recipe = {}) {
    let urgency = 0, total = 0, label = "";
    for (const i of recipe.ingredients || []) {
      const name = String(i?.name || "");
      if (KEEPS.test(name)) continue;
      const hit = FRESHNESS.find(([re]) => re.test(name));
      if (!hit) continue;
      total += hit[1];
      if (hit[1] > urgency) { urgency = hit[1]; label = hit[2]; }
    }
    return { urgency, total, label };
  }
  // 使い回し：1回の買い物で「丸ごと買うと余りやすい」食材（キャベツ・大根・豆腐など）を、同じ買い物のまとまりの別の日の料理でも使う。
  // [食材名の正規表現, 表示名]。薬味・缶詰・加工品は数えない（KEEPS）。主食・主菜・味付けの「かぶらない」を壊さないよう、点数は小さな加点だけ。
  const USE_UP = [
    [/キャベツ|きゃべつ/, "キャベツ"], [/白菜/, "白菜"], [/大根/, "大根"], [/にんじん|人参/, "にんじん"],
    [/玉ねぎ|たまねぎ|玉葱|オニオン/, "玉ねぎ"], [/長ねぎ|長ネギ|白ねぎ/, "長ねぎ"], [/ごぼう|牛蒡/, "ごぼう"], [/れんこん|蓮根/, "れんこん"],
    [/かぼちゃ|南瓜/, "かぼちゃ"], [/ブロッコリー/, "ブロッコリー"], [/ほうれん草|ほうれんそう/, "ほうれん草"], [/小松菜/, "小松菜"],
    [/ニラ|にら/, "ニラ"], [/もやし/, "もやし"], [/豆腐|とうふ/, "豆腐"], [/なす|ナス|茄子/, "なす"], [/ピーマン/, "ピーマン"],
    [/きゅうり|胡瓜/, "きゅうり"], [/トマト(?!ケチャップ|ピューレ|ペースト)/, "トマト"], [/じゃがいも|ジャガイモ/, "じゃがいも"],
    [/さつまいも/, "さつまいも"], [/しめじ/, "しめじ"], [/えのき/, "えのき"], [/しいたけ|椎茸/, "しいたけ"], [/まいたけ|舞茸/, "まいたけ"], [/エリンギ/, "エリンギ"],
  ];
  function useUpKeys(recipe = {}) {
    const found = new Set();
    for (const i of recipe.ingredients || []) {
      const name = String(i?.name || "").normalize("NFKC");
      if (KEEPS.test(name)) continue;
      const hit = USE_UP.find(([re]) => re.test(name));
      if (hit) found.add(hit[1]);
    }
    return found;
  }
  // 同じまとまりの、ほかの日の料理（others: [{ date, labels }]）と重なる食材。最大2つまで、1つにつき 1.5 点（かぶらない点数より小さい）。
  const USE_UP_PER_ITEM = 1.5, USE_UP_MAX_ITEMS = 2, USE_UP_WD = "日月火水木金土";
  function useUpFit(recipe, others = []) {
    const mine = useUpKeys(recipe);
    const hits = [];
    for (const o of others) for (const l of o.labels) if (mine.has(l) && !hits.some((h) => h.label === l)) hits.push({ label: l, date: o.date });
    const used = hits.slice(0, USE_UP_MAX_ITEMS);
    const reason = used.length ? `🥬 ${USE_UP_WD[new Date(used[0].date + "T12:00:00").getDay()]}の${used[0].label}を使い回し` : "";
    return { score: used.length * USE_UP_PER_ITEM, hits: used, reason };
  }
  // 買い物からの日数（その回の何日目か）で、急ぐ食材の料理を前へ・後ろの日には出にくくする。
  // 0日目 +1.5×急ぎ度、1日目 +0.5×、2日目 −0.5×、3日目 −1.5×、そのあと1日ごとに −0.5×（下限 −3×）。
  function freshScore(f, k) { return f.urgency * Math.max(-3, k >= 3 ? -1.5 - (k - 3) * 0.5 : 1.5 - k); }
  function propose({
    recipes,
    profile: p,
    slots = {},
    start,
    length = 3,
    addDays,
    overrides = {},
    repeatScore = () => 0,
    history = [],
    cyclesOf = () => ({}),
    requestOf = () => null,
    offUntil = "",
    rounds = null,
    // 曜日のピン留め：{ "2": recipeId }（毎週火曜はこのフォルダの作り方）。
    pins = {},
    // わが家のごはん方針（profile-talk.js）で本人が確かめた好み → { score, reason } か null。
    // 加点だけ。食べられないもの・時間・器具の条件（fit）はゆるめない。
    preferenceOf = () => null,
    // 親（料理名・定番フォルダ）のキー。同じ親は、自動の献立では週1回まで（APP_MAP §48）。
    parentOf = (r) => r?.folder || "",
    // 自動では選ばない料理（「もう出さない」にした親の作り方など）。自分で選んだ日・ピン留めの日だけ入る。
    autoBlocked = () => false,
  }) {
    const between = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
    // What was eaten before the plan starts, plus what the plan has picked so far.
    const timeline = history.filter((m) => m?.date && m.recipe && m.date < start).map((m) => ({ date: m.date, recipe: m.recipe }));
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
    const usage = new Map();
    for (const slot of Object.values(slots)) {
      if (slot.date >= start && slot.date < addDays(start, length) && slot.status !== "removed" && slot.recipe)
        usage.set(slot.recipe.id, (usage.get(slot.recipe.id) || 0) + 1);
    }
    // 定番フォルダは、同じ献立（週）に1回まで。ピン留め・日付を指定した料理のフォルダは、その日のためにとっておく。
    const folderOf = (r) => (r ? parentOf(r) || "" : "");
    const byId = new Map(recipes.map((r) => [r.id, r]));
    const usedFolders = new Set(Object.values(slots).filter((x) => x.date >= start && x.date < addDays(start, length) && x.status !== "removed" && folderOf(x.recipe)).map((x) => folderOf(x.recipe)));
    const reserved = new Map();
    const recentParents = new Map();
    for (const m of timeline) { const f = folderOf(m.recipe); if (f && (!recentParents.has(f) || recentParents.get(f) < m.date)) recentParents.set(f, m.date); }
    for (let i = 0; i < length; i += 1) {
      const date = addDays(start, i);
      if (slots[date] && slots[date].status !== "removed") continue;
      const id = overrides[date] || pins[String(new Date(date + "T12:00:00").getDay())];
      const f = folderOf(byId.get(id));
      if (f && !reserved.has(f)) reserved.set(f, date);
    }
    const WD = "日月火水木金土";
    const ingredients = new Set();
    let newCount = 0;
    const need = (r) => SkillDB()?.rate(r).level || 1;
    let challenges = p.skillLevel ? timeline.filter((m) => between(m.date, start) <= 6 && need(m.recipe) > p.skillLevel).length : 0;
    const dayInRound = (date, i) => { const r = (rounds || []).find((x) => x.includes(date)); return r ? r.indexOf(date) : i; };
    // 使い回し：同じ買い物のまとまりの過去の日（作った・確定した料理）と、決まっている日・これまでに選んだ日の「余りやすい食材」。
    const meals = [];
    for (const d of (rounds || []).flat()) {
      if (d >= start || meals.some((m) => m.date === d)) continue;
      const r = slots[d] && slots[d].status !== "removed" ? slots[d].recipe : timeline.find((m) => m.date === d)?.recipe;
      if (r) meals.push({ date: d, labels: useUpKeys(r) });
    }
    for (let i = 0; i < length; i += 1) {
      const d = addDays(start, i);
      const r = slots[d] && slots[d].status !== "removed" ? slots[d].recipe : (!slots[d] ? byId.get(overrides[d]) : null);
      if (r && !meals.some((m) => m.date === d)) meals.push({ date: d, labels: useUpKeys(r) });
    }
    const sameRound = (a, b) => { const r = (rounds || []).find((x) => x.includes(a)); return r ? r.includes(b) : Math.abs(between(a, b)) <= 3; };
    const days = Array.from({ length }, (_, i) => {
      const date = addDays(start, i);
      const slot = slots[date];
      if (slot && slot.status !== "removed") {
        (slot.recipe?.ingredients || []).forEach((x) =>
          ingredients.add(key(x.name)),
        );
        if (slot.recipe) timeline.push({ date, recipe: slot.recipe });
        return { date, slot, rotation: slot.recipe ? rotation(slot.recipe, date, timeline, between) : null,
          repeat: slot.recipe ? repeatFit(slot.recipe, date, timeline, between, cyclesOf(slot.recipe)) : null,
          season: slot.recipe ? season(slot.recipe, date) : null };
      }
      if (!slot && offUntil && date < offUntil) return { date, off: true, prestart: true };
      if (
        slot?.status !== "removed" &&
        p.days.length &&
        !p.days.includes(String(new Date(date + "T12:00:00").getDay()))
      )
        return { date, off: true };
      const candidates = recipes
        .filter((r) => r.mealType === "dinner" && repeatScore(r) !== -Infinity && (!autoBlocked(r) || overrides[date] === r.id || pins[String(new Date(date + "T12:00:00").getDay())] === r.id))
        .map((recipe) => ({ recipe, ...fit(recipe, p, date) }))
        .filter((x) => x.ok)
        .map((x) => ({
          ...x,
          rotation: rotation(x.recipe, date, timeline, between),
          repeat: repeatFit(x.recipe, date, timeline, between, cyclesOf(x.recipe)),
          request: requestOf(x.recipe),
          fresh: freshness(x.recipe),
          season: season(x.recipe, date),
          pref: preferenceOf(x.recipe, date),
          useUp: useUpFit(x.recipe, meals.filter((m) => m.date !== date && sameRound(date, m.date))),
        }))
        .filter((x) => !x.repeat.exclude)
        .map((x) => ({
          ...x,
          score:
            x.score +
            repeatScore(x.recipe) +
            x.repeat.score +
            (x.request ? SCORE.request : 0) +
            (x.recipe.curated ? 0 : SCORE.saved) -
            x.rotation.penalty +
            freshScore(x.fresh, dayInRound(date, i)) +
            x.season.score +
            x.useUp.score +
            (x.pref?.score || 0) -
            // 直近6日に挑戦の料理があれば、次の挑戦はもう少し後ろへ（外さない）。
            (x.challenge && challenges >= 1 ? SKILL_PENALTY : 0) +
            (p.savings
              ? (x.recipe.ingredients || []).filter((n) =>
                  ingredients.has(key(n.name)),
                ).length * 3
              : 0),
        }))
        // 同じ点数の時は、その日（献立の日付）ごとに決まる順で（いつも同じ料理ばかりが選ばれないように。同じ日なら何度作っても同じ）。
        .sort(
          (a, b) => b.score - a.score || tieRank(date, a.recipe.id) - tieRank(date, b.recipe.id) || a.recipe.id.localeCompare(b.recipe.id),
        );
      // 同じ親は、献立の中で1回まで・献立の前の6日以内に食べた親も自動では選ばない（自分で選んだ日・ピン留めはこの限りでない）。
      const free = (x) => { const f = folderOf(x.recipe); return !f || (!usedFolders.has(f) && !(recentParents.has(f) && between(recentParents.get(f), date) < 7) && (!reserved.has(f) || reserved.get(f) === date)); };
      const unused = candidates.filter(x => !used.has(x.recipe.id) && free(x));
      // Only reuse when every eligible recipe has already appeared in this plan.
      const eligible = unused.length ? unused : candidates.sort((a, b) => (usage.get(a.recipe.id) || 0) - (usage.get(b.recipe.id) || 0));
      // At most one first-time dish per plan while known dishes are due (or requested).
      const favourites = eligible.filter((x) => x.request || (x.repeat.known && x.repeat.due));
      const pool = newCount >= MAX_NEW_PER_PLAN && favourites.length ? favourites : eligible;
      const dow = String(new Date(date + "T12:00:00").getDay());
      // ピン留め（毎週◯曜はこの料理）は、親の「1回まで・6日あける」に関係なく入れる（本人が決めたこと）。
      const pinned = !overrides[date] && pins[dow] ? candidates.find((x) => x.recipe.id === pins[dow]) : null;
      // 自分で決めた一皿（URLから入れた・選んだ料理）は、条件に合わなくてもその日に入れる。
      const forcedRecipe = overrides[date] && !candidates.some((x) => x.recipe.id === overrides[date]) ? recipes.find((r) => r.id === overrides[date]) : null;
      const forced = forcedRecipe
        ? { recipe: forcedRecipe, ok: true, forced: true, warn: fit(forcedRecipe, p, date).reason === "避けたい食材を含みます" ? "⚠ 避けたい食材あり" : "", score: 0, reasons: [], rotation: rotation(forcedRecipe, date, timeline, between),
            repeat: repeatFit(forcedRecipe, date, timeline, between, cyclesOf(forcedRecipe)), request: requestOf(forcedRecipe), fresh: freshness(forcedRecipe), season: season(forcedRecipe, date),
            useUp: useUpFit(forcedRecipe, meals.filter((m) => m.date !== date && sameRound(date, m.date))) }
        : null;
      const selected =
        pool.find((x) => x.recipe.id === overrides[date]) || candidates.find((x) => x.recipe.id === overrides[date]) || forced || pinned || pool[0];
      if (selected) {
        if (overrides[date] && selected.recipe.id === overrides[date]) selected.chosen = true;
        [selected.request ? `${selected.request.from}のリクエスト` : "", selected.repeat.reason, selected.rotation.reason, selected.fresh.urgency >= 3 && dayInRound(date, i) <= 1 ? `${selected.fresh.label}は日持ちしないので早めに` : "", selected.useUp?.reason, selected.season.reason, selected.pref?.reason]
          .filter(Boolean).reverse().forEach((r) => selected.reasons.unshift(r));
        if (pinned && selected === pinned) selected.reasons.unshift(`📌 毎週${WD[Number(dow)]}曜`);
        timeline.push({ date, recipe: selected.recipe });
        if (!meals.some((m) => m.date === date)) meals.push({ date, labels: useUpKeys(selected.recipe) });
        if (used.has(selected.recipe.id)) {
          selected.repeated = true;
          selected.reasons.push("候補が少ないため、もう一度登場");
        }
        used.add(selected.recipe.id);
        if (folderOf(selected.recipe)) usedFolders.add(folderOf(selected.recipe));
        usage.set(selected.recipe.id, (usage.get(selected.recipe.id) || 0) + 1);
        if (!selected.repeat.known) newCount++;
        if (selected.challenge) {
          challenges++;
          selected.reasons.unshift(`ちょっと挑戦 ${"★".repeat(selected.skillNeed)}`);
        }
        (selected.recipe.ingredients || []).forEach((x) =>
          ingredients.add(key(x.name)),
        );
      }
      return { date, candidate: selected || null };
    });
    for (const d of days) {
      if (d.slot?.recipe) d.useUp = useUpFit(d.slot.recipe, meals.filter((m) => m.date !== d.date && sameRound(d.date, m.date)));
    }
    return days;
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
            servings: [1, 2, 3, 4, 5].includes(Number(s.servings))
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
  // Only normalize known equivalent names; concentration and product variants matter.
  const shoppingName = (name) =>
    String(name || "").normalize("NFKC").trim().replace(/^ごはん\(炊飯済み\)$/, "ごはん").replace(/^しょうゆ\(濃口\)$/, "しょうゆ");
  const notPurchased = /^(?:水|お湯|湯|熱湯|冷水|氷水|ぬるま湯)$/;

  // 1より小さい量は、レシピでよく使う分数に（0.125→1/8、0.5→1/2、0.33→1/3）。
  const NICE_FRACTIONS = [[1, 8], [1, 4], [1, 3], [1, 2], [2, 3], [3, 4]];
  function formatScaledNumber(value) {
    if (!Number.isFinite(value)) return "";
    if (value > 0 && value < 1) {
      const hit = NICE_FRACTIONS.find(([n, d]) => Math.abs(value - n / d) < 0.02);
      if (hit) return `${hit[0]}/${hit[1]}`;
    }
    const rounded = Math.round(value * 100) / 100;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, "");
  }

  function normalizeUnit(unit) {
    unit = String(unit || "").trim();
    if (/^(?:グラム|g|ｇ)$/i.test(unit)) return "g";
    if (/^(?:ミリリットル|ml|ｍｌ)$/i.test(unit)) return "ml";
    if (/^[コつ箇ケヶ]$/.test(unit)) return "個";
    return unit;
  }

  function amountStep(prefix, unit, value) {
    if (/大さじ|小さじ/.test(prefix) || /杯|合/.test(unit)) return 0.5;
    if (/g|ml|ｍｌ|グラム/.test(unit)) {
      if (value >= 100) return 25;
      if (value >= 20) return 10;
      return 5;
    }
    if (/玉|丁|袋|パック|株|缶|束|本|枚|個|切れ|膳/.test(unit)) return 1;
    return 0.5;
  }

  function parseAmountParts(amount) {
    let raw = String(amount || "").normalize("NFKC").trim();
    if (!raw) return null;
    raw = raw.replace(/[（(][^）)]*[）)]/g, "").trim();
    const halfMatch = raw.match(/^半(.+)$/);
    if (halfMatch) {
      const unit = normalizeUnit(halfMatch[1]);
      return { prefix: "", value: 0.5, unit, step: 0.5 };
    }
    const m = raw.match(/^(約|およそ)?\s*(大さじ|小さじ)?\s*(?:(\d+)\s*(?:と|\s+)\s*(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?))\s*(.*)$/);
    if (!m) return null;
    const prefix = (m[1] || "") + (m[2] || "");
    let value;
    if (m[3] && m[4] && m[5]) value = Number(m[3]) + (Number(m[4]) / Number(m[5]));
    else if (m[6] && m[7]) value = Number(m[6]) / Number(m[7]);
    else if (m[8]) value = Number(m[8]);
    if (!Number.isFinite(value)) return null;
    const unit = normalizeUnit(m[9] || "");
    return { prefix, value, unit, step: amountStep(prefix, unit, value) };
  }

  function formatAmountFromParts(parts, value) {
    return `${parts.prefix}${formatScaledNumber(value)}${parts.unit}`;
  }

  // 標準的な食材の換算レート（グラム換算・目安パック/個数）
  const INGREDIENT_UNITS = [
    {
      pattern: /キャベツ/,
      baseUnit: "g",
      rates: { "玉": 1000, "個": 1000, "枚": 50, "g": 1 },
      packGuide: (g) => {
        if (g <= 300) return "1/4玉";
        if (g <= 650) return "1/2玉";
        if (g <= 1200) return "1玉";
        return `${Math.round((g / 1000) * 10) / 10}玉`;
      }
    },
    {
      pattern: /白菜|はくさい/,
      baseUnit: "g",
      rates: { "株": 2000, "玉": 2000, "個": 2000, "枚": 80, "g": 1 },
      packGuide: (g) => {
        if (g <= 350) return "1/4株";
        if (g <= 800) return "1/2株";
        if (g <= 1600) return "1株";
        return `${Math.round((g / 2000) * 10) / 10}株`;
      }
    },
    {
      pattern: /レタス/,
      baseUnit: "g",
      rates: { "個": 300, "玉": 300, "枚": 30, "g": 1 },
      packGuide: (g) => {
        if (g <= 180) return "1/2個";
        if (g <= 400) return "1個";
        return `${Math.ceil(g / 300)}個`;
      }
    },
    {
      pattern: /玉ねぎ|たまねぎ|玉葱|タマネギ/,
      baseUnit: "g",
      rates: { "個": 200, "玉": 200, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 200))}個`
    },
    {
      pattern: /じゃがいも|ジャガイモ/,
      baseUnit: "g",
      rates: { "個": 150, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 150))}個`
    },
    {
      pattern: /にんじん|ニンジン|人参/,
      baseUnit: "g",
      rates: { "本": 150, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 150))}本`
    },
    {
      pattern: /(?<!切り干し)大根|だいこん/,
      baseUnit: "g",
      rates: { "本": 1000, "cm": 35, "g": 1 },
      packGuide: (g) => {
        if (g <= 350) return "1/3本";
        if (g <= 650) return "1/2本";
        if (g <= 1200) return "1本";
        return `${Math.round((g / 1000) * 10) / 10}本`;
      }
    },
    {
      pattern: /長ねぎ|長ネギ|白ねぎ|白ネギ|ねぎ|ネギ/,
      baseUnit: "g",
      rates: { "本": 100, "束": 200, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 100))}本`
    },
    {
      pattern: /トマト(?!缶)/,
      baseUnit: "g",
      rates: { "個": 150, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 150))}個`
    },
    {
      pattern: /きゅうり|胡瓜|キュウリ/,
      baseUnit: "g",
      rates: { "本": 100, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 100))}本`
    },
    {
      pattern: /なす|ナス|茄子/,
      baseUnit: "g",
      rates: { "本": 80, "個": 80, "g": 1 },
      packGuide: (g) => `${Math.max(1, Math.ceil(g / 80))}本`
    },
    {
      pattern: /ピーマン/,
      baseUnit: "g",
      rates: { "個": 30, "袋": 150, "g": 1 },
      packGuide: (g) => {
        const p = Math.max(1, Math.ceil(g / 30));
        return p <= 5 ? `${p}個（1袋）` : `${p}個（約${Math.ceil(p / 5)}袋）`;
      }
    },
    {
      pattern: /もやし/,
      baseUnit: "袋",
      rates: { "袋": 1, "g": 1 / 200 },
      packGuide: (bags) => `${Math.max(1, Math.ceil(bags))}袋`
    },
    {
      pattern: /えのき|エノキ/,
      baseUnit: "袋",
      rates: { "袋": 1, "パック": 1, "株": 1, "g": 1 / 100 },
      packGuide: (bags) => `${Math.max(1, Math.ceil(bags))}袋`
    },
    {
      pattern: /しめじ|シメジ/,
      baseUnit: "パック",
      rates: { "パック": 1, "袋": 1, "株": 1, "g": 1 / 100 },
      packGuide: (packs) => `${Math.max(1, Math.ceil(packs))}パック`
    },
    {
      pattern: /まいたけ|舞茸/,
      baseUnit: "パック",
      rates: { "パック": 1, "袋": 1, "g": 1 / 100 },
      packGuide: (packs) => `${Math.max(1, Math.ceil(packs))}パック`
    },
    {
      pattern: /鶏もも|鶏胸|鶏むね|とりもも|とりむね/,
      baseUnit: "g",
      rates: { "枚": 250, "g": 1 },
      packGuide: (g) => {
        const pieces = Math.round((g / 250) * 10) / 10;
        return pieces <= 1 ? "1枚" : `${Math.ceil(pieces)}枚`;
      }
    },
    {
      pattern: /ささみ|ササミ/,
      baseUnit: "本",
      rates: { "本": 1, "枚": 1, "g": 1 / 50 },
      packGuide: (b) => `${Math.max(1, Math.ceil(b))}本`
    },
    {
      pattern: /豚.*(?:薄切り|スライス|バラ|ロース|しゃぶ)/,
      baseUnit: "g",
      rates: { "枚": 20, "g": 1 },
      packGuide: (g) => {
        const packs = Math.ceil(g / 200);
        return packs <= 1 ? "1パック" : `${packs}パック`;
      }
    },
    {
      pattern: /ひき肉|挽肉|挽き肉|ミンチ/,
      baseUnit: "g",
      rates: { "パック": 200, "g": 1 },
      packGuide: (g) => {
        const packs = Math.ceil(g / 200);
        return packs <= 1 ? "1パック" : `${packs}パック`;
      }
    },
    {
      pattern: /豆腐|木綿|絹/,
      baseUnit: "丁",
      rates: { "丁": 1, "パック": 1, "g": 1 / 300 },
      packGuide: (chou) => `${Math.max(1, Math.ceil(chou))}丁`
    },
    {
      pattern: /^(?:卵|たまご|玉子)$/,
      baseUnit: "個",
      rates: { "個": 1, "個分": 1, "パック": 10, "g": 1 / 50 },
      packGuide: (pieces) => {
        const p = Math.ceil(pieces);
        return p <= 6 ? `${p}個` : `${Math.ceil(p / 10)}パック（${Math.ceil(p / 10) * 10}個）`;
      }
    }
  ];

  function fractionGuide(name, unit, value) {
    if (!value || value <= 0) return null;
    const isFraction = Math.abs(value - Math.round(value)) > 0.01;
    if (unit === "丁" && /豆腐|木綿|絹/.test(name) && isFraction) {
      return `${Math.ceil(value)}丁`;
    }
    if (unit === "個" && /^(?:卵|たまご|玉子)$/.test(name)) {
      if (isFraction) return `${Math.ceil(value)}個`;
      if (value > 6) return `${Math.ceil(value / 10)}パック（${Math.ceil(value / 10) * 10}個）`;
    }
    if ((unit === "袋" || unit === "パック") && isFraction) {
      return `${Math.ceil(value)}${unit}`;
    }
    if (unit === "g" && /ひき肉|挽肉|挽き肉|ミンチ/.test(name) && value >= 100) {
      const packs = Math.ceil(value / 200);
      return packs <= 1 ? "1パック" : `${packs}パック`;
    }
    return null;
  }

  function combineAmounts(amounts, ingredientName = "") {
    const list = (amounts || []).filter(Boolean);
    if (!list.length) return "";
    const name = String(ingredientName || "").trim();
    const parsedList = list.map((a) => parseAmountParts(a));
    const first = parsedList[0];

    // 同一単位かつ同一接頭辞
    if (first && parsedList.every((p) => p && p.unit === first.unit && p.prefix === first.prefix)) {
      const total = parsedList.reduce((sum, p) => sum + p.value, 0);
      const formatted = formatAmountFromParts(first, total);
      const fg = fractionGuide(name, first.unit, total);
      return fg ? `${formatted}（目安: ${fg}）` : formatted;
    }

    // 異なる単位の合算（換算辞書によるグラムまたは基本単位への集約）
    if (name && parsedList.every((p) => p)) {
      const conv = INGREDIENT_UNITS.find((c) => c.pattern.test(name));
      if (conv && parsedList.every((p) => typeof conv.rates[p.unit] === "number")) {
        const totalBase = parsedList.reduce((sum, p) => sum + (p.value * conv.rates[p.unit]), 0);
        let formattedBase = "";
        if (conv.baseUnit === "g") {
          const roundedG = Math.round(totalBase);
          formattedBase = `約${roundedG}g`;
        } else {
          formattedBase = `約${formatScaledNumber(totalBase)}${conv.baseUnit}`;
        }
        const guide = conv.packGuide ? conv.packGuide(totalBase) : "";
        return guide ? `${formattedBase}（目安: ${guide}）` : formattedBase;
      }
    }

    return [...new Set(list)].join(" + ");
  }

  // 1タップで添えられる超簡単な汁物・副菜（主菜1品モデルを邪魔しない日常サポート）
  const QUICK_SIDES = [
    {
      id: "tofu",
      name: "冷奴",
      icon: "🥢",
      desc: "豆腐にかつお節・しょうゆをかけるだけ",
      sourceServings: 1,
      ingredients: [{ name: "絹豆腐", amount: "1/2丁", category: "日配" }],
    },
    {
      id: "wakame_soup",
      name: "わかめスープ",
      icon: "🥣",
      desc: "わかめ・鶏ガラスープの素・ごま油にお湯を注ぐだけ",
      sourceServings: 1,
      ingredients: [{ name: "乾燥わかめ", amount: "1袋", category: "乾物" }],
    },
    {
      id: "cabbage",
      name: "ちぎりキャベツ",
      icon: "🥬",
      desc: "キャベツを手でちぎって塩・ごま油を和えるだけ",
      sourceServings: 1,
      ingredients: [{ name: "キャベツ", amount: "100g", category: "野菜" }],
    },
    {
      id: "tomato",
      name: "トマトスライス",
      icon: "🍅",
      desc: "切るだけで彩りとビタミンがプラス",
      sourceServings: 1,
      ingredients: [{ name: "トマト", amount: "1個", category: "野菜" }],
    },
    {
      id: "cucumber",
      name: "たたききゅうり",
      icon: "🥒",
      desc: "きゅうりを叩いて塩昆布・ごま油と和えるだけ",
      sourceServings: 1,
      ingredients: [{ name: "きゅうり", amount: "1本", category: "野菜" }],
    },
    {
      id: "namul",
      name: "もやしナムル",
      icon: "🥢",
      desc: "レンジで1分半加熱してごま油・塩と和えるだけ",
      sourceServings: 1,
      ingredients: [{ name: "もやし", amount: "1袋", category: "野菜" }],
    },
  ];

  function sideOf(name) {
    return QUICK_SIDES.find((s) => s.name === name || s.id === name);
  }

  function shopping({
    slots,
    start,
    end,
    scale,
    combine = combineAmounts,
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
          const name = shoppingName(item.name);
          if (notPurchased.test(name)) return;
          const k = key(name);
          if (!groups.has(k))
            groups.set(k, { id: k, name, category: item.category || "その他", amounts: [], parts: [], uses: [] });
          const g = groups.get(k);
          const amount = scale(
            item.amount,
            s.servings,
            s.recipe.sourceServings,
          );
          g.amounts.push(amount);
          g.parts.push(`${s.date}:${s.recipe.id}:${amount}`);
          if (!g.uses.includes(s.recipe.title)) g.uses.push(s.recipe.title);
        });
        if (s.side) {
          const side = sideOf(s.side);
          if (side) {
            side.ingredients.forEach((item) => {
              const name = shoppingName(item.name);
              if (notPurchased.test(name)) return;
              const k = key(name);
              if (!groups.has(k))
                groups.set(k, { id: k, name, category: item.category || "その他", amounts: [], parts: [], uses: [] });
              const g = groups.get(k);
              const amount = scale(item.amount, s.servings, side.sourceServings);
              g.amounts.push(amount);
              g.parts.push(`${s.date}:side:${s.side}:${amount}`);
              const sideUse = `${s.recipe.title}（添え物：${s.side}）`;
              if (!g.uses.includes(sideUse)) g.uses.push(sideUse);
            });
          }
        }
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
        ([n, v]) => (key(n) === g.id || (key(n) === "米" && g.id === "ごはん")) && v === "have",
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
        amount: combine ? combine(g.amounts, g.name) : combineAmounts(g.amounts, g.name),
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
      ingredients: ingredients.map(([name, amount, category = "その他", allergens, label_check]) => ({
        name,
        amount,
        category,
        ...(allergens ? { allergens, label_check: label_check || [] } : {}),
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
        contains: ingredients.flatMap(([n, , , allergens, label_check]) => {
          if (allergens) return [...allergens, ...(label_check || [])];
          const map = {
            しょうゆ: ["小麦", "大豆"],
            みそ: ["大豆", "魚"],
            豆腐: ["大豆"],
            ツナ缶: ["魚", "大豆"],
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
            サラダ油: ["大豆"],
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
  curated.push(...Starter.recipes.map(r => ({
    ...recipe(r.id.replace("starter-", ""), r.title, r.minutes, r.equipment,
      r.ingredients, r.steps, r.tastes, r.tasks),
    curated: { version: 2, role: r.role },
    note: "調理時間は目安です。炊飯・解凍は別途。市販品の原材料表示を確認してください。",
  })));
  // ----- わかってきたこと：評価から見えた好み（ふりかえりに3行まで） -----
  // evaluations: [{recipeId, cookedAt, familyRepeatCycles, preferencePending}]、recipeOf(id) → レシピ。
  const LIKE_LABEL = {
    noodle: ["🍜", "麺"], rice: ["🍚", "ごはんもの"], bread: ["🍞", "パン"],
    meat: ["🍖", "肉"], fish: ["🐟", "魚"], eggtofu: ["🥚", "卵・豆腐"],
    spicy: ["🌶", "ピリ辛"], light: ["🍋", "さっぱり"], rich: ["🧈", "こってり"],
    chinese: ["🥟", "中華"], western: ["🍝", "洋風"],
  };
  const INSIGHT_MIN = 3; // 評価がこれだけたまるまでは、あと何回かを出す
  // 料理×人ごとに、いちばん新しい「答えのある」評価。
  // 記録は料理ごとに1件ずつ増えるので、「料理ごとに最新の1件」だけを見ると、
  // 片方だけが答えた新しい記録で、もう片方の以前の評価が消えてしまう（未回答と低評価は別物）。
  // idOf：記録の料理ID → まとめる料理のキー（自分用のコピーと元の定番を同じ料理として数える時に使う）。
  const evalStamp = (e) => String(e?.cookedAt || "") + "\u0000" + String(e?.updatedAt || "");
  function latestRatings(evaluations = [], idOf = (id) => id) {
    const out = new Map(); // key → { cycles: {名前: 周期}, at: {名前: 日付} }
    const sorted = evaluations.filter((e) => e && e.recipeId && e.familyRepeatCycles && typeof e.familyRepeatCycles === "object")
      .sort((a, b) => evalStamp(b).localeCompare(evalStamp(a)));
    for (const e of sorted) {
      const k = idOf(e.recipeId);
      if (!k) continue;
      const row = out.get(k) || { cycles: {}, at: {} };
      for (const [name, cycle] of Object.entries(e.familyRepeatCycles)) {
        if (!cycle || name in row.cycles) continue;
        row.cycles[name] = cycle;
        row.at[name] = e.cookedAt || "";
      }
      out.set(k, row);
    }
    for (const [k, row] of out) if (!Object.keys(row.cycles).length) out.delete(k);
    return out;
  }
  function insights({ evaluations = [], recipeOf = () => null, family = [] } = {}) {
    const times = new Map();
    for (const e of evaluations) times.set(e.recipeId, (times.get(e.recipeId) || 0) + 1);
    // 料理ごとに、人ごとの最新の評価をまとめた1行（以前の形 { recipeId, familyRepeatCycles } のまま使う）。
    const latest = new Map([...latestRatings(evaluations)].map(([recipeId, row]) => [recipeId, { recipeId, familyRepeatCycles: row.cycles }]));
    if (latest.size < INSIGHT_MIN) return { left: INSIGHT_MIN - latest.size, items: [] };
    const items = [];
    const solo = family.length <= 1;
    // 1) 人ごとの好きな系統（好きと言った料理の半分以上・2品以上）
    for (const name of family) {
      const loved = [...latest.values()].filter((e) => LOVED.includes(e.familyRepeatCycles?.[name])).map((e) => recipeOf(e.recipeId)).filter(Boolean);
      if (loved.length < 2) continue;
      const count = new Map();
      for (const r of loved) {
        const t = traits(r);
        const keys = new Set([t.staple, t.protein, t.cuisine, ...tags(r).filter((x) => ["spicy", "light", "rich"].includes(x))]);
        keys.forEach((k) => LIKE_LABEL[k] && count.set(k, (count.get(k) || 0) + 1));
      }
      const [k, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0] || [];
      if (k && n >= 2 && n / loved.length >= 0.5) items.push({ kind: "like", text: `${LIKE_LABEL[k][0]} ${solo ? "" : `${name}は`}${LIKE_LABEL[k][1]}が好き` });
    }
    // 2) みんなが好き＆2回以上つくった定番
    if (!solo) {
      const staples = [...latest.values()]
        .filter((e) => family.every((n) => LOVED.includes(e.familyRepeatCycles?.[n])) && (times.get(e.recipeId) || 0) >= 2)
        .sort((a, b) => times.get(b.recipeId) - times.get(a.recipeId));
      const r = staples[0] && recipeOf(staples[0].recipeId);
      if (r) items.push({ kind: "staple", recipeId: r.id, text: `🏆 ${family.length === 2 ? "ふたり" : "みんな"}の定番：${r.title}` });
    }
    // 3) もう作らない
    const never = [...latest.values()].filter((e) => Object.values(e.familyRepeatCycles || {}).includes("never")).length;
    if (never) items.push({ kind: "never", text: `🙅 ${never}品は献立に出しません` });
    return { left: 0, items: items.slice(0, 3) };
  }
  // 使ってもすぐにはなくならない物（調味料・油・粉・だし・乾物・缶詰）。「家にある」を押したら常備品として覚える。
  // 肉・魚・野菜・卵・豆腐など使うとなくなる物は、その献立の時だけ。
  const KEEP_RE = /しょうゆ|醤油|みそ|味噌|塩|砂糖|酢|みりん|料理酒|酒|油|こしょう|胡椒|スパイス|カレー粉|ケチャップ|ソース|マヨ|ドレッシング|つゆ|ポン酢|だし|出汁|コンソメ|鶏ガラ|ガラスープ|顆粒|粉|はちみつ|蜂蜜|ごま|胡麻|乾燥|干し|海苔|のり|缶|ルウ|ルー|チューブ|豆板醤|甜麺醤|コチュジャン|オイスター|ナンプラー|ラー油|わさび|からし|マスタード|バター|ジャム/;
  const PERISH_RE = /肉|ひき肉|鮭|さけ|さば|魚|えび|いか|たら|豆腐|油揚げ|厚揚げ|卵|たまご|牛乳|生クリーム|ヨーグルト|ねぎ|キャベツ|もやし|玉ねぎ|にんじん|トマト|きのこ|しめじ|なす|ピーマン|レタス/;
  function keeps(item = {}) {
    const name = String(item.name || "");
    const k = key(name);
    if (Object.values(pantry).flat().some((p) => key(p) === k)) return true;
    if (PERISH_RE.test(name) && !/缶|乾燥|干し|粉|顆粒/.test(name)) return false;
    return item.category === "調味料" || KEEP_RE.test(name);
  }
  // 週間・数日プランの「ざっくり主菜・野菜・気分バランス」1行サマリー（栄養価の計算ではなく、主菜の偏り・野菜の種類数・味付けの目安）。
  const BALANCE_VEG = [
    [/キャベツ|きゃべつ/, "キャベツ"], [/白菜/, "白菜"], [/大根/, "大根"], [/にんじん|人参/, "にんじん"],
    [/玉ねぎ|たまねぎ|玉葱|オニオン/, "玉ねぎ"], [/長ねぎ|長ネギ|白ねぎ|青ねぎ|万能ねぎ|ねぎ/, "ねぎ"],
    [/ごぼう|牛蒡/, "ごぼう"], [/れんこん|蓮根/, "れんこん"], [/かぼちゃ|南瓜/, "かぼちゃ"],
    [/ブロッコリー/, "ブロッコリー"], [/ほうれん草|ほうれんそう/, "ほうれん草"], [/小松菜/, "小松菜"],
    [/ニラ|にら/, "ニラ"], [/もやし/, "もやし"], [/豆苗/, "豆苗"], [/なす|ナス|茄子/, "なす"], [/ピーマン/, "ピーマン"], [/パプリカ/, "パプリカ"],
    [/きゅうり|胡瓜/, "きゅうり"], [/トマト(?!ケチャップ|ピューレ|ペースト)/, "トマト"],
    [/じゃがいも|ジャガイモ/, "じゃがいも"], [/さつまいも/, "さつまいも"],
    [/しめじ/, "しめじ"], [/えのき/, "えのき"], [/しいたけ|椎茸/, "しいたけ"],
    [/まいたけ|舞茸/, "まいたけ"], [/エリンギ/, "エリンギ"], [/マッシュルーム/, "マッシュルーム"], [/きのこ/, "きのこ"],
    [/レタス/, "レタス"], [/水菜/, "水菜"], [/春菊/, "春菊"], [/大葉|青じそ/, "大葉"],
    [/アスパラ/, "アスパラガス"], [/オクラ/, "オクラ"], [/ゴーヤ/, "ゴーヤ"],
    [/ズッキーニ/, "ズッキーニ"], [/とうもろこし|コーン/, "とうもろこし"],
  ];
  function planBalance(days = []) {
    const active = (days || []).filter((d) => d && !d.off && !d.prestart && d.slot?.status !== "off" && (d.slot?.recipe || d.candidate?.recipe));
    if (active.length < 2) return null;
    const proteins = { meat: 0, fish: 0, eggtofu: 0, veg: 0 };
    const cuisines = { japanese: 0, western: 0, chinese: 0 };
    const moods = { light: 0, rich: 0, spicy: 0 };
    const vegSet = new Set();
    let vegDays = 0;
    for (const d of active) {
      const r = d.slot?.recipe || d.candidate?.recipe;
      const t = traits(r);
      proteins[t.protein] = (proteins[t.protein] || 0) + 1;
      cuisines[t.cuisine] = (cuisines[t.cuisine] || 0) + 1;
      const tg = tags(r);
      if (tg.includes("light")) moods.light += 1;
      if (tg.includes("rich")) moods.rich += 1;
      if (tg.includes("spicy")) moods.spicy += 1;
      const side = d.slot?.side ? sideOf(d.slot.side) : null;
      const allIngs = [...(r.ingredients || []), ...(side?.ingredients || [])];
      let hasVegToday = false;
      for (const ing of allIngs) {
        const name = String(ing?.name || "").normalize("NFKC");
        for (const [re, label] of BALANCE_VEG) {
          if (re.test(name)) {
            vegSet.add(label);
            hasVegToday = true;
            break;
          }
        }
      }
      if (hasVegToday || t.protein === "veg") vegDays += 1;
    }
    const proteinParts = [
      ["meat", "🍖肉"],
      ["fish", "🐟魚"],
      ["eggtofu", "🥚卵・豆腐"],
      ["veg", "🥗野菜主菜"],
    ].filter(([k]) => proteins[k] > 0).map(([k, label]) => `${label}${proteins[k]}`);
    const vegCount = vegSet.size;
    const vegLabel = vegCount >= 5 ? `🥬 野菜たっぷり${vegCount}種` : vegCount >= 3 ? `🥬 野菜${vegCount}種` : `🥬 野菜少なめ${vegCount ? `（${vegCount}種）` : ""}（＋添え物がおすすめ）`;
    const cuisineNames = [["japanese", "和"], ["western", "洋"], ["chinese", "中"]].filter(([k]) => cuisines[k] > 0).map(([, l]) => l);
    let moodNote = "";
    if (proteins.meat === active.length && active.length >= 3) {
      moodNote = "お肉中心（魚や豆腐の日を入れると軽やか）";
    } else if (proteins.meat > 0 && proteins.fish > 0) {
      moodNote = `肉・魚バランス◎（${cuisineNames.join("・")}）`;
    } else if (moods.light > 0 && moods.rich > 0) {
      moodNote = `こってり＆さっぱり（${cuisineNames.join("・")}）`;
    } else if (cuisineNames.length >= 2) {
      moodNote = `${cuisineNames.join("・")}の気分バランス`;
    } else {
      moodNote = `${cuisineNames[0] || "和"}中心`;
    }
    return {
      total: active.length,
      proteins,
      cuisines,
      moods,
      vegCount,
      vegDays,
      vegKinds: [...vegSet],
      proteinText: proteinParts.join("・"),
      vegLabel,
      moodNote,
    };
  }
  const api = {
    profile,
    suggestPlanning,
    reviewable,
    equipment,
    equipmentGroups,
    equipmentDefaults,
    pantry,
    keeps,
    pantryCommon,
    pantryDefaults,
    restrictionOptions,
    widenHints,
    key,
    fit,
    freshness,
    useUpKeys,
    useUpFit,
    propose,
    normalizeSlots,
    mergeMap,
    shopping,
    shoppingName,
    shoppingKey: (name) => key(shoppingName(name)),
    isBought: (name) => !notPurchased.test(shoppingName(name)),
    combineAmounts,
    parseAmountParts,
    formatAmountFromParts,
    INGREDIENT_UNITS,
    fractionGuide,
    QUICK_SIDES,
    sideOf,
    planBalance,
    curated,
    traits,
    tags,
    FACETS,
    rotation,
    repeatFit,
    sameDish,
    CYCLE_DAYS,
    season,
    insights,
    latestRatings,
    copy,
  };
  root.Lifestyle = api;
  if (typeof module !== "undefined") module.exports = api;
})(globalThis);
