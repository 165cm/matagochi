// 理想の品ぞろえ（2026-10-28 のユーザーの判断：「いまに合わせるより理想に合わせる。足りない料理から優先して集める」）。
// ・好きな味の質問（料理名の写真12枚）に出す12の料理名。それぞれ作り方を IDEAL_CHILDREN 品までそろえる（ふつうの料理名は6品まで）。
// ・新着全体の主役・味の割合の目安（TARGET_SHARES）。足りない分野の料理名を、補充で先に探す。
// name は料理名の辞書（dishes.js の DISH_SEEDS）の名前、label は写真の画面に出す名前。
export const IDEAL_DISHES = [
  { name: "生姜焼き", label: "豚の生姜焼き", group: "肉", cuisine: "和", mood: "ふつう" },
  { name: "唐揚げ", label: "鶏の唐揚げ", group: "肉", cuisine: "和", mood: "こってり" },
  { name: "ハンバーグ", label: "ハンバーグ", group: "肉", cuisine: "洋", mood: "こってり" },
  { name: "肉じゃが", label: "肉じゃが", group: "肉", cuisine: "和", mood: "ふつう" },
  { name: "冷しゃぶ", label: "冷しゃぶ", group: "肉", cuisine: "和", mood: "さっぱり" },
  { name: "回鍋肉", label: "回鍋肉", group: "肉", cuisine: "中華", mood: "ピリ辛" },
  { name: "麻婆豆腐", label: "麻婆豆腐", group: "卵・豆腐", cuisine: "中華", mood: "ピリ辛" },
  { name: "オムライス", label: "オムライス", group: "卵・豆腐", cuisine: "洋", mood: "こってり" },
  { name: "鮭のホイル焼き", label: "鮭のホイル焼き", group: "魚", cuisine: "和", mood: "さっぱり" },
  { name: "さばの味噌煮", label: "さばの味噌煮", group: "魚", cuisine: "和", mood: "ふつう" },
  { name: "鮭のムニエル", label: "鮭のムニエル", group: "魚", cuisine: "洋", mood: "こってり" },
  { name: "八宝菜", label: "八宝菜", group: "野菜が主役", cuisine: "中華", mood: "ふつう" },
];
export const IDEAL_CHILDREN = 8; // 毎週1回選ばれても、2か月は同じ作り方がくり返されない数
export const IDEAL_LONG = 2; // そのうち30分以上は2品まで（唐揚げ・肉じゃがなど時間のかかる料理が多いため）
// 新着全体（約400品）の割合の目安。いまの割合がこれより低い分野の料理名を、補充で先に探す。
export const TARGET_SHARES = { 魚: 0.25, "卵・豆腐": 0.15, "野菜が主役": 0.15, さっぱり: 0.25 };
// 料理名から「さっぱり」とみなす（料理名の辞書の名前で判断する。材料までは見ない）。
export const LIGHT_DISH = /しゃぶ|ホイル|蒸し|南蛮漬け|おろし|ポン酢|冷や|湯豆腐|茶碗蒸し|西京焼き|棒棒鶏|よだれ鶏|鶏ハム|サラダチキン|アクアパッツァ/;
