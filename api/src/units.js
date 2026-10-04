// 分量の単位の対応表と換算。いったん共通の量（ml・g・cm・℃）に直してから、行き先の国の書き方で表す。
// いまは 海外 → 日本（ja-JP）。将来はここに国を足せば、日本 → アメリカ（en-US）なども同じ表で出せる。

// 1単位あたりの量。
export const UNIT_TABLE = {
  volume: { // ml
    cup: 240, cups: 240, c: 240, "fl oz": 29.57, "fluid ounce": 29.57, "fluid ounces": 29.57,
    tablespoon: 15, tablespoons: 15, tbsp: 15, tbs: 15, tbl: 15, T: 15,
    teaspoon: 5, teaspoons: 5, tsp: 5, t: 5,
    pint: 473, pints: 473, pt: 473, quart: 946, quarts: 946, qt: 946, gallon: 3785, gallons: 3785, gal: 3785,
    ml: 1, milliliter: 1, milliliters: 1, l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000, dl: 100,
  },
  weight: { // g
    oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6,
    g: 1, gram: 1, grams: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
    "stick of butter": 113, "sticks of butter": 113, stick: 113, sticks: 113,
  },
  length: { inch: 2.54, inches: 2.54, in: 2.54, '"': 2.54, cm: 1, mm: 0.1 },
  // 量にしない言い方は、そのまま日本語に。
  words: { pinch: "少々", "a pinch": "少々", dash: "少々", "a dash": "少々", "to taste": "適量", "as needed": "適量", "for garnish": "適量", clove: "かけ", cloves: "かけ", can: "缶", cans: "缶", slice: "枚", slices: "枚", piece: "個", pieces: "個", bunch: "束", bunches: "束" },
};
export const fahrenheitToCelsius = (f) => Math.round(((f - 32) * 5) / 9 / 5) * 5;

// 行き先ごとの書き方。
export const LOCALES = {
  "ja-JP": { spoon: { 大さじ: 15, 小さじ: 5 }, volume: "ml", weight: "g", length: "cm", temp: "C" },
  "en-US": { spoon: { tbsp: 15, tsp: 5 }, cup: 240, volume: "cup", weight: "oz", length: "inch", temp: "F" },
};

// AIに渡す対応表（プロンプト用の短い文）。
export function unitPromptTable(to = "ja-JP") {
  if (to !== "ja-JP") return "";
  return [
    "分量が海外の単位のときは、次の対応表で日本の単位に換算し、元の表記をかっこで残してください（例: 約240ml（1 cup））。",
    "1 cup=240ml / 1 tbsp=大さじ1（15ml） / 1 tsp=小さじ1（5ml） / 1 fl oz=30ml / 1 pint=473ml / 1 quart=946ml",
    "1 oz=28g / 1 lb=454g / バター1 stick=113g / 1 inch=2.5cm / 温度 °F→℃ =（°F−32）×5÷9（5℃単位に丸める）",
    "pinch・dash=少々 / to taste=適量 / 1 clove=1かけ / 1 can=1缶（中身の量があれば換算して添える）",
    "材料名・手順・タイトルも日本語にしてください。手順中の温度・長さも換算してください。",
  ].join("\n");
}

const FRACTIONS = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
// "1 1/2" "1½" "0.5" "2-3"（範囲は平均）を数に。
function parseNumber(text) {
  const t = text.replace(/[½⅓⅔¼¾⅛⅜⅝⅞]/g, (m) => ` ${FRACTIONS[m]}`).trim();
  const range = t.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)$/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  let total = 0, found = false;
  for (const part of t.split(/\s+/)) {
    const frac = part.match(/^(\d+)\/(\d+)$/);
    if (frac) { total += Number(frac[1]) / Number(frac[2]); found = true; }
    else if (/^\d+(?:\.\d+)?$/.test(part)) { total += Number(part); found = true; }
    else if (/^0\.\d+$/.test(part)) { total += Number(part); found = true; }
  }
  return found ? total : null;
}
const round = (n) => (n > 500 ? Math.round(n / 10) * 10 : n >= 20 ? Math.round(n / 5) * 5 : Math.round(n));
const spoonJa = (ml) => {
  // 小さじで割り切れる量（2杯分まで）は小さじで、それより多ければ大さじで。
  const t0 = ml / 5;
  if (t0 <= 2 && Math.abs(t0 * 2 - Math.round(t0 * 2)) < 0.01) { const t = Math.round(t0 * 2) / 2; return `小さじ${t % 1 ? (t < 1 ? "1/2" : `${Math.floor(t)}と1/2`) : t}`; }
  const half = Math.round((ml / 15) * 2) / 2;
  if (ml >= 7.5 && half <= 4) return `大さじ${half % 1 ? (half < 1 ? "1/2" : `${Math.floor(half)}と1/2`) : half}`;
  const t = Math.round((ml / 5) * 2) / 2;
  if (t > 0 && t <= 2) return `小さじ${t % 1 ? (t < 1 ? "1/2" : `${Math.floor(t)}と1/2`) : t}`;
  return "";
};
const UNIT_RE = (() => {
  const names = [...Object.keys(UNIT_TABLE.volume), ...Object.keys(UNIT_TABLE.weight), ...Object.keys(UNIT_TABLE.length)].sort((a, b) => b.length - a.length).map((u) => u.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&"));
  return new RegExp(`^\\s*((?:\\d+(?:\\.\\d+)?|\\d+\\/\\d+|[½⅓⅔¼¾⅛⅜⅝⅞])(?:[\\s-]*(?:\\d+\\/\\d+|[½⅓⅔¼¾⅛⅜⅝⅞]|\\d+(?:\\.\\d+)?))*(?:\\s*(?:-|–|to)\\s*\\d+(?:\\.\\d+)?)?)\\s*(${names.join("|")})\\.?(?![a-z])(.*)$`, "i");
})();

// 分量の文字を、行き先の国の書き方に。換算できなければ、そのまま返す。
export function localizeAmount(amount, to = "ja-JP") {
  const text = String(amount ?? "").trim();
  if (!text || to !== "ja-JP") return text;
  if (/[ぁ-んァ-ヶ一-龠]/.test(text) && !/[a-z]{2,}/i.test(text)) return text; // もう日本の書き方
  const word = UNIT_TABLE.words[text.toLowerCase()];
  if (word && !/^\d/.test(text)) return word;
  const temp = text.match(/^(\d+)\s*°?\s*F$/i);
  if (temp) return `${fahrenheitToCelsius(Number(temp[1]))}℃（${text}）`;
  const m = text.match(UNIT_RE);
  if (!m) {
    const count = text.match(/^(\S+)\s+(cloves?|cans?|slices?|pieces?|bunch(?:es)?)\b(.*)$/i);
    if (count && parseNumber(count[1]) !== null) return `${count[1]}${UNIT_TABLE.words[count[2].toLowerCase()]}${count[3] ? ` ${count[3].trim()}` : ""}`;
    return text;
  }
  const n = parseNumber(m[1]);
  if (n === null) return text;
  const unitKey = Object.keys(UNIT_TABLE.volume).find((u) => u === m[2] || u === m[2].toLowerCase())
    || Object.keys(UNIT_TABLE.weight).find((u) => u === m[2].toLowerCase()) || Object.keys(UNIT_TABLE.length).find((u) => u === m[2].toLowerCase());
  const rest = m[3].trim();
  const original = `（${text}）`;
  if (unitKey in UNIT_TABLE.volume) {
    const ml = n * UNIT_TABLE.volume[unitKey];
    if (["ml", "milliliter", "milliliters"].includes(unitKey)) return `${round(ml)}ml${rest ? ` ${rest}` : ""}`;
    const spoon = ml <= 60 ? spoonJa(ml) : "";
    return `${spoon || `約${round(ml)}ml`}${original}`;
  }
  if (unitKey in UNIT_TABLE.weight) {
    const g = n * UNIT_TABLE.weight[unitKey];
    if (["g", "gram", "grams"].includes(unitKey)) return `${round(g)}g${rest ? ` ${rest}` : ""}`;
    return `約${round(g)}g${original}`;
  }
  if (unitKey in UNIT_TABLE.length) {
    const cm = n * UNIT_TABLE.length[unitKey];
    return `約${Math.round(cm * 2) / 2}cm${original}`;
  }
  return text;
}
// 手順の中の温度（350°F など）を換算して添える。
export function localizeStep(step, to = "ja-JP") {
  if (to !== "ja-JP") return step;
  // もう「175℃（350°F）」の形なら換算しない（何度通しても同じ。review fix #139）。
  return String(step).replace(/(?<!℃（)(\d{3})\s*°\s*F\b/gi, (all, f) => `${fahrenheitToCelsius(Number(f))}℃（${all}）`);
}

// 保存済みの読み取り結果にも、換算を通す（この対応表を入れる前に読み取った分のため）。
export function localizeRecipe(result, to = "ja-JP") {
  if (!result || !Array.isArray(result.ingredients)) return result;
  return { ...result, ingredients: result.ingredients.map((i) => ({ ...i, amount: localizeAmount(i.amount, to) })), steps: Array.isArray(result.steps) ? result.steps.map((x) => localizeStep(x, to)) : result.steps,
    // 書き直した手順（APP_MAP §49）も同じように日本の単位に。
    ...(Array.isArray(result.guide?.steps) ? { guide: { ...result.guide, steps: result.guide.steps.map((g) => ({ ...g, text: localizeStep(g.text, to) })) } } : {}) };
}
