// 親の料理名（2026-10-01 のユーザーの判断・APP_MAP §48）：集めた動画を、料理名（親）ごとにまとめる。AI は使わない。
//   親の決め方 … 題名に辞書の料理名が入っていれば、それが親（いちばん後ろに出てくる料理名。同じ位置なら長いほう）。
//               アレンジ（塩こんぶ肉じゃが）も同じ親（肉じゃが）。辞書にない題名は、飾りを外した料理名を候補として数える。
//   辞書 ……… 最初の辞書（定番の料理名）＋ 格上げ（同じ料理名が DISH_PROMOTE_VIDEOS 本・DISH_PROMOTE_CHANNELS 人以上でそろったら自動で）。
//               管理の画面で「外す」「まとめる（別名）」ができる（dishes/book に保存）。
import { ApiError } from "./errors.js";

export const DISH_PROMOTE_VIDEOS = 3;
export const DISH_PROMOTE_CHANNELS = 2;
// 最初の辞書：一括収集の定番40品（trends.js WAVE_CLASSIC_DISHES）と、よくある晩ごはんの料理名。
export const DISH_SEEDS = [
  // 「照り焼き」「煮付け」「鍋」のような作り方だけの名前は入れない（ぶりと鶏が同じ親になってしまうため）。
  "肉じゃが", "さばの味噌煮", "八宝菜", "揚げ出し豆腐", "生姜焼き", "ぶり大根", "野菜炒め", "麻婆豆腐", "唐揚げ", "鮭のムニエル", "ロールキャベツ", "厚揚げの煮物",
  "ハンバーグ", "鮭のちゃんちゃん焼き", "筑前煮", "かに玉", "照り焼きチキン", "鶏の照り焼き", "ぶりの照り焼き", "かれいの煮付け", "なすの煮びたし", "ゴーヤチャンプルー", "回鍋肉", "あじフライ", "豚汁", "肉豆腐",
  "チキン南蛮", "さばの竜田揚げ", "ミルフィーユ鍋", "親子丼", "青椒肉絲", "たらのホイル焼き", "きんぴらごぼう", "オムライス", "豚の角煮", "いわしの蒲焼き", "ポトフ", "牛丼", "そぼろ丼", "他人丼",
  "餃子", "酢豚", "カレー", "クリームシチュー", "ビーフシチュー", "とんかつ", "麻婆なす", "エビチリ", "油淋鶏", "よだれ鶏", "棒棒鶏", "鶏ハム", "サラダチキン",
  "豚キムチ", "肉野菜炒め", "焼きそば", "焼きうどん", "あんかけ焼きそば", "チャーハン", "天津飯", "中華丼", "カツ丼", "豚丼", "天丼", "海鮮丼",
  "グラタン", "ドリア", "ナポリタン", "カルボナーラ", "ペペロンチーノ", "ミートソース", "明太子パスタ", "ボロネーゼ", "ラザニア", "ピカタ",
  "つくね", "メンチカツ", "コロッケ", "春巻き", "シュウマイ", "水餃子", "南蛮漬け", "アクアパッツァ", "西京焼き",
  "すき焼き", "しゃぶしゃぶ", "おでん", "寄せ鍋", "キムチ鍋", "もつ鍋", "湯豆腐", "茶碗蒸し", "だし巻き卵", "豆腐ハンバーグ", "ローストビーフ",
  "ガパオライス", "タコライス", "ビビンバ", "チヂミ", "プルコギ", "サムギョプサル", "ジャージャー麺", "担々麺", "冷やし中華", "ちらし寿司", "炊き込みご飯", "雑炊", "リゾット", "パエリア",
];
// 別名（表記ゆれ）。そろえた形（dishKey）→ 辞書の料理名。
const SEED_ALIASES = { "からあげ": "唐揚げ", "唐揚": "唐揚げ", "しょうが焼き": "生姜焼き", "生姜焼": "生姜焼き", "ぎょうざ": "餃子", "ぎょーざ": "餃子", "まーぼーどうふ": "麻婆豆腐", "まーぼー豆腐": "麻婆豆腐", "はっぽうさい": "八宝菜", "ほいこーろー": "回鍋肉", "ちんじゃおろーす": "青椒肉絲", "鯖の味噌煮": "さばの味噌煮", "鯖味噌": "さばの味噌煮", "さば味噌": "さばの味噌煮", "かれー": "カレー" };

// 比べる時の形（全角半角・大文字小文字・カタカナとひらがな・空白と記号をそろえる）。
export function dishKey(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/[\s・･、,.。!！?？~〜_\-]/g, "").replace(/鯖/g, "さば");
}
// 題名から料理名だけを取り出す（アプリの folders.js dishNameOf と同じ考え方）。例：「【悪魔の】レンジで明太子パスタ｜リュウジ」→「明太子パスタ」
export function dishNameOf(title) {
  let t = String(title || "").normalize("NFKC").replace(/[【\[「『(（<＜][^】\]」』)）>＞]*[】\]」』)）>＞]/g, " ").replace(/[#＃]\S+/g, " ").replace(/[!！?？♪☆★✨🔥]+/g, " ");
  t = t.split(/[|｜/／]/)[0];
  t = t.replace(/^(\s*(簡単|かんたん|絶品|究極の?|至高の?|最強の?|悪魔の?|本格|本気の?|無限|神|激うま|爆速|時短|レンジで|フライパン(ひとつ|1つ)で|\d+分で|たった\d+分で?|プロが教える|超|やみつき)\s*)+/, "");
  t = t.replace(/(の作り方|の?レシピ|を作る|作り方)\s*$/, "").trim();
  const best = t.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length)[0] || String(title || "").trim();
  return [...best].slice(0, 16).join("");
}

// 辞書（最初の辞書＋格上げ − 外した）と別名から、題名の親を決める。親がなければ null。
export function parentOf(title, book = {}) {
  const t = dishKey(title);
  if (!t) return null;
  const removed = new Set(book.removed || []);
  const names = new Map();
  for (const name of [...DISH_SEEDS, ...Object.values(book.promoted || {}).map((p) => p.name)]) { const k = dishKey(name); if (k && !removed.has(k)) names.set(k, name); }
  const aliases = { ...SEED_ALIASES, ...(book.aliases || {}) };
  for (const [from, to] of Object.entries(aliases)) { const k = dishKey(from), tk = dishKey(to); if (k && !removed.has(tk)) names.set(k, names.get(tk) || to); }
  let best = null;
  for (const [k, name] of names) {
    const at = t.lastIndexOf(k);
    if (at < 0) continue;
    const end = at + k.length;
    // 料理名のあとに「丼」が続く時は、その料理の親にしない（「ハンバーグそぼろ丼」はハンバーグではなく丼もの）。丼の名前そのもの（親子丼など）は別。
    if (!k.endsWith("丼") && /丼/.test(t.slice(end))) continue;
    if (!best || end > best.end || (end === best.end && k.length > best.len)) best = { end, len: k.length, name };
  }
  return best ? { key: dishKey(best.name), name: best.name } : null;
}

export function createDishBook(store, { now = Date.now } = {}) {
  const read = async () => (await store?.get("dishes/book")) || null;
  async function write(change) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cur = await read();
      const doc = { promoted: {}, removed: [], aliases: {}, ...(cur?.envelope || {}) };
      if (change(doc) === false) return doc;
      let ok = false;
      try { ok = !!(await store.put("dishes/book", doc, { ifGeneration: cur?.generation ?? 0 })); } catch { return null; }
      if (ok) return doc;
    }
    return null;
  }
  return {
    async book() { return (await read())?.envelope || {}; },
    // 親を決める＋格上げ：items（{ videoId, title, channelId }）の中で、親のない料理名が基準の数そろったら辞書に入れる。
    // 返り値：{ videoId → { key, name } }（親がない動画は入れない）。保存できなくても、その回の親は返す。
    async classify(items, { promote = false } = {}) {
      let book = await this.book();
      if (promote) {
        const count = new Map();
        for (const i of items) {
          if (parentOf(i.title, book)) continue;
          const name = dishNameOf(i.title), k = dishKey(name);
          if ([...k].length < 2) continue;
          const c = count.get(k) || { name, videos: new Set(), channels: new Set() };
          c.videos.add(i.videoId); if (i.channelId) c.channels.add(i.channelId); count.set(k, c);
        }
        const removed = new Set(book.removed || []);
        const add = [...count].filter(([k, c]) => !removed.has(k) && !book.promoted?.[k] && c.videos.size >= DISH_PROMOTE_VIDEOS && c.channels.size >= DISH_PROMOTE_CHANNELS);
        if (add.length) {
          const saved = await write((doc) => { for (const [k, c] of add) if (!doc.promoted[k]) doc.promoted[k] = { name: c.name, since: new Date(now()).toISOString().slice(0, 10) }; });
          if (saved) book = saved;
        }
      }
      const out = {};
      for (const i of items) { const p = parentOf(i.title, book); if (p) out[i.videoId] = p; }
      return out;
    },
    // 管理の画面：親の一覧（どこから・子の数・投稿者の数）と、もう少しで格上げになる候補。
    async overview(items) {
      const book = await this.book();
      const parents = new Map(), near = new Map();
      for (const i of items) {
        const p = parentOf(i.title, book);
        if (p) { const x = parents.get(p.key) || { key: p.key, name: p.name, videos: 0, channels: new Set(), examples: [] }; x.videos += 1; if (i.channelId) x.channels.add(i.channelId); if (x.examples.length < 3) x.examples.push(i.title); parents.set(p.key, x); continue; }
        const name = dishNameOf(i.title), k = dishKey(name);
        if ([...k].length < 2) continue;
        const x = near.get(k) || { key: k, name, videos: 0, channels: new Set(), examples: [] }; x.videos += 1; if (i.channelId) x.channels.add(i.channelId); if (x.examples.length < 3) x.examples.push(i.title); near.set(k, x);
      }
      const promoted = book.promoted || {};
      const seedKeys = new Set(DISH_SEEDS.map(dishKey));
      const shape = (x) => ({ key: x.key, name: x.name, videos: x.videos, channels: x.channels.size, examples: x.examples });
      return {
        parents: [...parents.values()].map((x) => ({ ...shape(x), source: promoted[x.key] ? "promoted" : seedKeys.has(x.key) ? "seed" : "alias", since: promoted[x.key]?.since || "" })).sort((a, b) => b.videos - a.videos || a.name.localeCompare(b.name, "ja")),
        candidates: [...near.values()].filter((x) => x.videos >= 2).map(shape).sort((a, b) => b.videos - a.videos).slice(0, 30),
        removed: (book.removed || []).map((k) => ({ key: k, name: promoted[k]?.name || DISH_SEEDS.find((n) => dishKey(n) === k) || k })),
        aliases: Object.entries(book.aliases || {}).map(([from, to]) => ({ from, to })),
        rule: { videos: DISH_PROMOTE_VIDEOS, channels: DISH_PROMOTE_CHANNELS },
      };
    },
    // 管理の操作：remove（親から外す）・restore（戻す）・alias（from を to の別名にする）・promote（手で親にする）。
    async edit({ op, key, name, from, to } = {}) {
      const clean = (s) => String(s || "").normalize("NFKC").trim().slice(0, 20);
      if (op === "remove" || op === "restore") {
        const k = dishKey(key || name);
        if (!k) throw new ApiError(400, "dish_required", "料理名を指定してください。");
        return write((doc) => { const set = new Set(doc.removed); if (op === "remove") set.add(k); else set.delete(k); doc.removed = [...set].slice(0, 500); });
      }
      if (op === "alias") {
        const f = dishKey(from), t = clean(to);
        if (!f || !t || f === dishKey(t)) throw new ApiError(400, "alias_invalid", "まとめる料理名を指定してください。");
        return write((doc) => { doc.aliases = { ...doc.aliases, [f]: t }; });
      }
      if (op === "promote") {
        const n = clean(name), k = dishKey(n);
        if ([...k].length < 2) throw new ApiError(400, "dish_required", "料理名が短すぎます。");
        return write((doc) => { doc.promoted[k] = { name: n, since: new Date(now()).toISOString().slice(0, 10) }; doc.removed = (doc.removed || []).filter((x) => x !== k); });
      }
      throw new ApiError(400, "op_invalid", "操作が正しくありません。");
    },
  };
}
