/* 料理の豆知識クイズ（10問・2026-10-28 に「スキル試験」から作り直し）。
   遊べる診断として残す（?skill=1・LP・設定から）。問題は「へえ」と思える豆知識を優先して選び直した（ユーザーの判断）。
   正解ならひとつ難しい問題、まちがいならやさしい問題を出し、腕前の目安（★1〜5）を出す。
   点数・級・タイプ名・昇級試験・経験値・バッジなどのゲームの要素はやめた。目安の★は、本人が「この★で献立を並べる」を押した時だけ使う。 */
const SKILL_CATS = { food: "食材の豆知識", measure: "計量", safety: "衛生・安全", knife: "下ごしらえ", heat: "火加減", taste: "味つけ", fry: "揚げ物" };
// { id, level(難しさ★1〜5), cat, q, c:[4択], a:正解の番号, why:解説 }。選択肢は出すたびに並べ替える。
const SKILL_BANK = [
  { id: "f1", level: 1, cat: "taste", q: "調味料の「さしすせそ」。「せ」は何のこと？", c: ["しょうゆ", "酢", "せり", "背脂"], a: 0, why: "昔の書き方で、しょうゆは「せうゆ」。「そ」はみそです。" },
  { id: "f2", level: 1, cat: "food", q: "ブロッコリーで、ふだん食べている部分は？", c: ["花のつぼみの集まり", "葉", "実", "根"], a: 0, why: "小さなつぼみがぎゅっと集まったもの。黄色くなってきたら、花が咲きかけのサインです。" },
  { id: "f3", level: 1, cat: "food", q: "もやしは、何を発芽させたもの？", c: ["豆", "お米", "麦", "ごま"], a: 0, why: "緑豆や大豆などの豆を、光を当てずに発芽させたもの。大豆もやしは豆つきです。" },
  { id: "f4", level: 1, cat: "food", q: "トマトの赤い色のもとになっている成分は？", c: ["リコピン", "カプサイシン", "カテキン", "クロロフィル"], a: 0, why: "リコピンは油と一緒にとると吸収されやすくなります。カプサイシンは唐辛子の辛み、クロロフィルは緑の色です。" },
  { id: "f5", level: 1, cat: "food", q: "玉ねぎを切ると涙が出るのは、何が出てくるから？", c: ["硫黄を含む、目を刺激する成分", "砂糖", "でんぷん", "ビタミンC"], a: 0, why: "切って細胞が壊れると、目を刺激する成分ができます。冷やしてから切ると出にくくなります。" },
  { id: "s2", level: 1, cat: "safety", q: "電子レンジで温めると、破裂しやすいのは？", c: ["殻つきの卵", "ラップをした耐熱ボウル", "冷やごはん", "耐熱皿にのせた野菜"], a: 0, why: "殻の中の水分がふくらんで破裂します。ゆで卵を温め直すときも同じです。" },
  { id: "m3", level: 1, cat: "measure", q: "料理用の計量カップ1杯と、お米の1合。多いのは？", c: ["計量カップ（200ml）", "お米の1合（180ml）", "同じ", "決まっていない"], a: 0, why: "計量カップは200ml、お米の1合は180ml。炊飯器の付属カップは1合用です。" },
  { id: "m4", level: 1, cat: "measure", q: "塩「ひとつまみ」のつまみ方は？", c: ["親指・人差し指・中指の3本", "親指と人差し指の2本", "小さじですりきり1杯", "手のひらにのせる"], a: 0, why: "3本指がひとつまみ（小さじ1/5ほど）。2本指でつまむのは「少々」です。" },
  { id: "f6", level: 1, cat: "food", q: "じゃがいもの芽や、緑色になった皮は？", c: ["厚めに取り除く", "そのまま食べてよい", "水にさらせば大丈夫", "加熱すれば大丈夫"], a: 0, why: "芽や緑の皮には天然の毒（ソラニンなど）があり、加熱しても消えません。" },

  { id: "f7", level: 2, cat: "food", q: "大根で、辛みがいちばん強いのはどこ？", c: ["先っぽ（下のほう）", "葉に近いほう", "真ん中", "どこも同じ"], a: 0, why: "先にいくほど辛く、葉に近いほど甘め。甘い大根おろしなら上のほうを使います。" },
  { id: "f8", level: 2, cat: "food", q: "生のパイナップルを入れたゼラチンのゼリーが固まりにくいのは？", c: ["たんぱく質を分ける酵素がゼラチンを分解するから", "酸っぱすぎるから", "水分が多すぎるから", "冷えにくいから"], a: 0, why: "生のパイナップルやキウイの酵素がゼラチンを分解します。缶詰や加熱したものなら固まります。" },
  { id: "h2", level: 2, cat: "heat", q: "ほうれん草などの青菜をゆでるのは？", c: ["沸騰したお湯から", "水から", "ぬるま湯から", "蒸気だけで"], a: 0, why: "地面の上で育つ野菜はお湯から短時間で。色よく、食感も残ります。" },
  { id: "h3", level: 2, cat: "heat", q: "じゃがいも・にんじんなど根菜をゆでるのは？", c: ["水から", "沸騰したお湯から", "油から", "熱湯を回しかける"], a: 0, why: "根菜は水からゆっくり温めると、中まで均一に火が通り、煮くずれしにくくなります。" },
  { id: "f9", level: 2, cat: "food", q: "さつまいもを、ゆっくり時間をかけて加熱すると甘くなるのは？", c: ["でんぷんが糖に変わる時間が長くなるから", "水分が増えるから", "皮の甘みが移るから", "塩けが抜けるから"], a: 0, why: "いもの酵素がでんぷんを糖に変えます。この酵素がよく働く温度をゆっくり通ると、甘くなります。" },
  { id: "h5", level: 2, cat: "heat", q: "煮物の「落としぶた」の役割は？", c: ["少ない煮汁でも全体に味を回し、煮くずれを防ぐ", "鍋を早く冷ます", "焦げやすくする", "湯気を逃がさず乾かす"], a: 0, why: "煮汁が落としぶたに当たって全体に回るので、少ない煮汁でも味がまんべんなく入ります。" },
  { id: "h4", level: 2, cat: "heat", q: "野菜炒めが水っぽくなる、いちばんの原因は？", c: ["一度にたくさん入れて温度が下がる", "強火で短時間炒める", "フライパンを先に熱する", "野菜の水気をよく切る"], a: 0, why: "入れすぎると温度が下がり、野菜から水が出て「煮た」状態に。量が多い日は2回に分けます。" },
  { id: "s5", level: 2, cat: "safety", q: "多めに作ったカレーを翌日も食べるなら？", c: ["小分けにして早く冷まし、冷蔵庫へ", "鍋のまま常温で一晩", "ふたをしてコンロに置く", "ときどき温め直して常温で置く"], a: 0, why: "カレーやシチューは、ゆっくり冷めると増えやすい菌（ウェルシュ菌）がいます。早く冷まして冷蔵し、よく混ぜて温め直します。" },
  { id: "p2", level: 2, cat: "knife", q: "お米を研ぐとき、最初に入れた水は？", c: ["すぐに捨てる", "ゆっくり混ぜてから捨てる", "そのまま炊く", "お湯を使う"], a: 0, why: "乾いたお米は最初の水をいちばん吸います。ぬかのにおいを吸わないよう、手早く捨てます。" },

  { id: "s6", level: 3, cat: "safety", q: "ハンバーグや鶏肉の、中まで火が通った目安は？", c: ["中心が75℃で1分以上", "中心が50℃で1分", "表面が白くなったら", "焼き色がついたら"], a: 0, why: "ひき肉や鶏肉は、中心75℃で1分以上が目安。食中毒を防ぐいちばん大事なポイントです。" },
  { id: "t7", level: 3, cat: "taste", q: "みそ汁で、みそを入れたあと沸騰させないほうがいいのは？", c: ["みその香りがとんでしまうから", "鍋が焦げるから", "みそが固まるから", "塩けがなくなるから"], a: 0, why: "みその香りは熱に弱いので、火を弱めてから溶き入れ、煮立つ直前で火を止めます。" },
  { id: "m6", level: 3, cat: "measure", q: "500Wで2分のレシピを、600Wで温めるなら？", c: ["約1分40秒", "約2分30秒", "約1分", "同じ2分"], a: 0, why: "時間はワット数に反比例。2分×500÷600＝約1分40秒です。" },
  { id: "t3", level: 3, cat: "taste", q: "照り焼きの「照り」が出るのは？", c: ["砂糖・みりんを煮詰めて、からめる", "しょうゆを先に入れる", "片栗粉を入れる", "酢を足す"], a: 0, why: "たれの糖分が煮詰まると、つやととろみが出ます。焦げやすいので最後は手早く。" },
  { id: "f10", level: 3, cat: "food", q: "紫キャベツの千切りにレモン汁をかけると、色は？", c: ["あざやかなピンク（赤紫）になる", "緑になる", "黄色になる", "変わらない"], a: 0, why: "紫キャベツの色素（アントシアニン）は、酸で赤っぽく、アルカリで青〜緑っぽく変わります。" },
  { id: "f11", level: 3, cat: "food", q: "りんごの切り口が茶色くなるのを防ぐには？", c: ["薄い塩水につける", "砂糖をまぶす", "常温に置く", "冷凍庫で冷やす"], a: 0, why: "切り口の成分が空気にふれて茶色くなります。薄い塩水やレモン汁で防げます。" },
  { id: "m7", level: 3, cat: "measure", q: "パスタをゆでるお湯の塩、目安は？", c: ["お湯の1%くらい", "お湯の10%", "入れない", "ひとつまみ"], a: 0, why: "1Lに塩10gくらい。パスタそのものに下味がついて、ソースとなじみます。" },
  { id: "h8", level: 3, cat: "heat", q: "焼き魚は、どちらの面から焼く？", c: ["盛りつけで上になる面", "盛りつけで下になる面", "どちらでも同じ", "皮のない面"], a: 0, why: "先に焼く面のほうがきれいに焼けます。盛りつけで表になる面から焼くのが基本です。" },
  { id: "t4", level: 3, cat: "taste", q: "肉じゃがなどの煮物に、味がしみこむのは？", c: ["冷めていくとき", "沸騰している間", "火を止めた瞬間だけ", "味はしみこまない"], a: 0, why: "煮物は冷めるときに味が入ります。一度冷ましてから温め直すと、よりおいしくなります。" },
  { id: "k5", level: 3, cat: "knife", q: "しょうが焼きの豚ロース。焼くと反り返るのを防ぐには？", c: ["赤身と脂の間の筋を切る", "塩を多めにふる", "強火で長く焼く", "水にさらす"], a: 0, why: "筋は加熱で縮みます。数か所に切り込み（筋切り）を入れると、平らに焼けます。" },

  { id: "t6", level: 4, cat: "taste", q: "昆布とかつお節を合わせた「合わせだし」がおいしいのは？", c: ["2種類のうま味が合わさって、うま味が強く感じられるから", "塩けが増えるから", "色が濃くなるから", "香りが消えるから"], a: 0, why: "昆布のグルタミン酸と、かつお節のイノシン酸。合わさると、うま味がぐっと強く感じられます（相乗効果）。" },
  { id: "t8", level: 4, cat: "taste", q: "昆布だしをとるとき、昆布は？", c: ["水から入れ、沸騰直前に取り出す", "沸騰させて長く煮る", "熱湯に入れてすぐ出す", "火にかけない"], a: 0, why: "煮立てるとぬめりや雑味が出ます。水から入れて、沸騰直前に取り出すのが基本です。" },
  { id: "k6", level: 4, cat: "knife", q: "ハンバーグの真ん中を、くぼませる理由は？", c: ["焼くとふくらむ真ん中を平らにし、火を通りやすくする", "ソースをためるため", "見た目のため", "早く冷ますため"], a: 0, why: "肉は焼くと縮んで真ん中がふくらみます。くぼませておくと平らになり、中まで火が通ります。" },
  { id: "h9", level: 4, cat: "heat", q: "焼いたステーキを、すぐ切らずに少し休ませるのは？", c: ["肉汁が落ち着き、切っても流れ出にくい", "冷ましてから食べるため", "塩をしみこませるため", "色をよくするため"], a: 0, why: "焼いた直後は肉汁が動いています。数分休ませると、切っても肉汁が中に残ります。" },
  { id: "p5", level: 4, cat: "heat", q: "ぎょうざを焼いて、水を入れたあとは？", c: ["ふたをして蒸し焼きにする", "ふたをせずに強火で飛ばす", "水を捨てる", "油をたっぷり足す"], a: 0, why: "ふたをして蒸し焼きに。水気がなくなったらふたを取り、油を回してパリッと仕上げます。" },
  { id: "t5", level: 4, cat: "taste", q: "パスタソースが「乳化」するとは？", c: ["ゆで汁と油が混ざって、とろりとまとまる", "油が分かれて浮く", "焦げて香ばしくなる", "冷えて固まる"], a: 0, why: "ゆで汁と油をフライパンでよくゆすると白っぽくとろみがつき、麺にからみます。" },
  { id: "k8", level: 4, cat: "food", q: "新鮮な魚の見分け方は？", c: ["目が澄んでいて、エラが鮮やかな赤", "目が白くにごっている", "エラが茶色い", "身を押すとへこんだまま"], a: 0, why: "目が澄み、エラが赤く、身にはりがあるのが新鮮なしるしです。" },
  { id: "f2b", level: 4, cat: "fry", q: "とんかつの衣、つける順番は？", c: ["小麦粉→溶き卵→パン粉", "パン粉→溶き卵→小麦粉", "溶き卵→小麦粉→パン粉", "小麦粉→パン粉→溶き卵"], a: 0, why: "小麦粉で水気をおさえ、卵をのりにしてパン粉をつけます。はがれにくい衣になります。" },
  { id: "f1b", level: 4, cat: "fry", q: "「揚げ焼き」の油の量は？", c: ["フライパンの底から1cmくらい", "5cm以上", "小さじ1", "油なし"], a: 0, why: "少なめの油で、返しながら両面を揚げるように焼くのが揚げ焼きです。" },

  { id: "f12", level: 5, cat: "food", q: "そばの「二八（にはち）」とは？", c: ["そば粉8割・小麦粉2割", "そば粉2割・小麦粉8割", "2人前で800円", "28cmの長さ"], a: 0, why: "つなぎの小麦粉を2割入れたそば。そば粉だけのものは「十割（とわり）」と呼びます。" },
  { id: "f4b", level: 5, cat: "fry", q: "揚げ油が中温（170〜180℃）の見分け方は？", c: ["菜箸を入れると、細かい泡がシュワシュワ出る", "泡がまったく出ない", "煙が出ている", "大きな泡がはげしく出る"], a: 0, why: "低温は泡がゆっくり少し、中温は細かい泡がシュワシュワ、高温は大きな泡が勢いよく出ます。" },
  { id: "f5b", level: 5, cat: "safety", q: "揚げ油から火が出たら？", c: ["火を止め、ふたや固くしぼったぬれタオルで覆う", "水をかける", "うちわであおぐ", "油を足して冷ます"], a: 0, why: "水をかけると油が飛び散り、火が一気に広がります。火を止めて空気を断つか、消火器を使います。" },
  { id: "f6b", level: 5, cat: "fry", q: "からあげの「二度揚げ」の目的は？", c: ["余熱で中まで火を通し、2度目で衣をカリッとさせる", "油を節約する", "味をしみこませる", "冷凍するため"], a: 0, why: "1度目で揚げて休ませると余熱で中まで火が入ります。2度目は高温で短く、衣をカリッと。" },
  { id: "f7b", level: 5, cat: "fry", q: "天ぷらの衣を、サクッとさせるには？", c: ["冷水で溶き、混ぜすぎない", "お湯で溶いてよく練る", "前の日に作っておく", "常温でしっかり混ぜる"], a: 0, why: "混ぜすぎたり温かかったりすると粘り（グルテン）が出て重い衣に。冷水でさっくり混ぜます。" },
  { id: "k9", level: 5, cat: "knife", q: "魚の「三枚おろし」で分ける3つは？", c: ["上身・下身・中骨", "頭・胴・尾", "皮・身・骨", "背・腹・尾"], a: 0, why: "中骨をはさんで上下の身に切り分けます。アジやサバで練習するのが定番です。" },
  { id: "k10", level: 5, cat: "knife", q: "魚の臭みを取る下処理「霜降り」とは？", c: ["熱湯をかけ、冷水で汚れやぬめりを落とす", "凍らせてから使う", "塩を大量にもみこむ", "日光に当てて干す"], a: 0, why: "表面が白くなるくらいに熱湯をかけ、冷水で血やぬめりを落とします。煮魚の前の基本です。" },
  { id: "p7", level: 5, cat: "food", q: "パン生地の一次発酵。終わりの目安は？", c: ["生地が約2倍にふくらむ", "大きさは変わらない", "半分にしぼむ", "表面がかわいて割れる"], a: 0, why: "約2倍にふくらんだら、指に粉をつけて刺し、穴が戻らなければ発酵完了です。" },
];
// 腕前の目安（★）のことば。献立の「ちょっと挑戦」・設定の自分で選ぶ画面と同じ言い方。
const SKILL_TYPES = {
  1: { name: "混ぜてチンが中心", text: "包丁いらずの一皿から。難しい料理は後ろのほうに並べます。" },
  2: { name: "切って炒める・煮るならOK", text: "定番の丼や麺、炒めものが中心。" },
  3: { name: "焼いて中まで火を通せる", text: "照り焼きやガパオまで。" },
  4: { name: "成形や揚げ焼きもできる", text: "ハンバーグの日も気軽に。" },
  5: { name: "揚げ物も魚をおろすのも", text: "どんな料理でも並べます。" },
};
const TEST_LENGTH = 10;
// 腕前の目安：答えの流れ（推定の力 theta 0.5〜5.5）を、いちばん近い★に（2026-10-28 から点数・級は出さない）。
const starOfTheta = (theta) => Math.max(1, Math.min(5, Math.round(theta)));

let skillQuiz = null;
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// 次の問題：いまの推定の力（theta）にいちばん近い難しさから、まだ出ていない分野を優先して選ぶ。
function cbtPick(t) {
  const used = new Set(t.answers.map((x) => x.id));
  const cats = new Set(t.answers.map((x) => SKILL_BANK.find((q) => q.id === x.id)?.cat));
  const target = Math.max(1, Math.min(5, Math.round(t.theta)));
  const left = SKILL_BANK.filter((q) => !used.has(q.id));
  const near = Math.min(...left.map((q) => Math.abs(q.level - target)));
  const pool = left.filter((q) => Math.abs(q.level - target) === near);
  const fresh = pool.filter((q) => !cats.has(q.cat));
  const q = shuffled(fresh.length ? fresh : pool)[0];
  t.current = { id: q.id, order: shuffled([0, 1, 2, 3]), picked: null };
  return q;
}
function cbtAnswer(t, pick) {
  if (!t.current || t.current.picked !== null) return;
  const q = SKILL_BANK.find((x) => x.id === t.current.id);
  const ok = Number(pick) === q.a;
  t.current.picked = Number(pick);
  t.answers.push({ id: q.id, ok });
  // 正解なら上に、まちがいなら下に。動く幅は少しずつ小さくして、力の近くに落ち着かせる。
  t.theta = Math.max(0.5, Math.min(5.5, t.theta + (ok ? t.stepSize : -t.stepSize)));
  t.stepSize = Math.max(0.25, t.stepSize * 0.75);
}
function cbtResult(t) {
  return { star: starOfTheta(t.theta), correct: t.answers.filter((a) => a.ok).length };
}
function skillProfile() {
  return state.skillProfile?.level ? state.skillProfile : null;
}
function startSkillQuiz(fromLp = false) {
  skillQuiz = { mode: "test", step: 0, answers: [], theta: 3, stepSize: 1, current: null, fromLp };
  cbtPick(skillQuiz);
}
function renderQuizQuestion(q) {
  const item = SKILL_BANK.find((x) => x.id === q.current.id);
  const n = TEST_LENGTH, i = q.answers.length - (q.current.picked !== null ? 1 : 0);
  const picked = q.current.picked;
  const choices = q.current.order.map((k, pos) => {
    const cls = picked === null ? "" : k === item.a ? " is-right" : k === picked ? " is-wrong" : " is-dim";
    return `<button type="button" class="quiz-choice${cls}" data-action="life-quiz-answer" data-value="${k}" ${picked !== null ? "disabled" : ""}><span class="qc-key" aria-hidden="true">${"ABCD"[pos]}</span>${escapeHtml(item.c[k])}</button>`;
  }).join("");
  const last = q.answers.length >= n;
  const reveal = picked === null ? "" : `<div class="quiz-reveal ${picked === item.a ? "is-right" : "is-wrong"}" role="status"><p class="qr-head">${picked === item.a ? "⭕ 正解！" : `❌ 正解は「${escapeHtml(item.c[item.a])}」`}</p><p>${escapeHtml(item.why)}</p></div>
    <button type="button" class="primary-button full-button" data-action="life-quiz-next">${last ? "結果を見る" : "次の問題"}</button>`;
  return `<section class="skill-quiz is-cbt"><p class="quiz-progress">料理の豆知識クイズ <b>${i + 1}</b> / ${n}</p>
    <div class="quiz-bar"><i style="width:${Math.round((i / n) * 100)}%"></i></div>
    <p class="quiz-meta"><span class="qm-cat">${SKILL_CATS[item.cat]}</span></p>
    <h2 class="quiz-q">${escapeHtml(item.q)}</h2>
    <div class="quiz-choices">${choices}</div>${reveal}
    ${picked === null ? '<button type="button" class="text-button" data-action="life-quiz-close">やめる</button>' : ""}</section>`;
}
// 結果：正解の数と、腕前の目安（★）だけ。献立に使うかは本人が選ぶ（押さなければ何も変えない）。
function renderQuizResult(q) {
  const r = cbtResult(q);
  const lp = q.fromLp && !state.onboarded;
  const using = skillProfile()?.level;
  return `<section class="skill-quiz is-result"><p class="quiz-progress">料理の豆知識クイズの結果</p>
    <div class="score-card"><p class="sc-score"><b>${r.correct}</b><small>/ ${TEST_LENGTH}問 正解</small></p><p class="sc-rank"><span class="skill-stars">${Skills.stars(r.star)}</span></p><p class="sc-name">${escapeHtml(SKILL_TYPES[r.star].name)}</p></div>
    <p class="muted small">答えから見た、料理の腕前の目安です。豆知識なので、実際の腕前とちがうこともあります。</p>
    ${state.onboarded ? `<div class="quiz-actions">${dailyButton("life-quiz-save", `この★${r.star}で献立を並べる`, "", true)}<button type="button" class="text-button" data-action="life-quiz-close">献立には使わない${using ? `（★${using}のまま）` : ""}</button></div>
    <p class="muted small">★より難しい料理も外さず、後ろのほうに並べます（「ちょっと挑戦」の印）。</p>` : ""}
    <div class="quiz-actions">${state.onboarded ? "" : dailyButton("life-quiz-close", "リピごちを見てみる", "", true)}${lp ? '<a class="secondary-button link-button" href="lp/#waitlist">公開のお知らせを受け取る</a>' : ""}${dailyButton("life-quiz-share", "結果をシェア")}<button type="button" class="text-button" data-action="life-quiz-restart">もう一度</button></div></section>`;
}
function renderSkillQuiz() {
  return skillQuiz.done ? renderQuizResult(skillQuiz) : renderQuizQuestion(skillQuiz);
}
function handleSkillQuizAction(action, data) {
  if (!action.startsWith("life-quiz")) return false;
  if (action === "life-quiz-start") { startSkillQuiz(); render(); globalThis.scrollTo?.({ top: 0 }); return true; }
  if (!skillQuiz) return true;
  const q = skillQuiz;
  if (action === "life-quiz-answer") { cbtAnswer(q, data.value); render(); return true; }
  if (action === "life-quiz-next") {
    if (q.answers.length >= TEST_LENGTH) {
      q.done = true;
      trackDaily("skill_test_done", { correct: cbtResult(q).correct });
    } else cbtPick(q);
  }
  else if (action === "life-quiz-restart") startSkillQuiz(q.fromLp);
  else if (action === "life-quiz-close") skillQuiz = null;
  else if (action === "life-quiz-share") {
    const r = cbtResult(q);
    shareMessage(`料理の豆知識クイズ、10問中${r.correct}問正解でした。あなたは何問わかる？「リピごち」`, `${location.origin}${location.pathname}?skill=1`);
    return true;
  } else if (action === "life-quiz-save") {
    // 本人が「この★で献立を並べる」を押した時だけ、腕前に使う。
    const r = cbtResult(q);
    setSkillLevel(r.star, { quizLevel: r.star });
    skillQuiz = null;
    saveState();
    showToast(`腕前を★${r.star}にしました。難しい料理は後ろのほうに並べます。`);
  }
  render();
  globalThis.scrollTo?.({ top: 0 });
  return true;
}
// 腕前（★）を決める：自分で選ぶ・クイズの目安を使う。献立の下書きは作り直す。
function setSkillLevel(level, extra = {}) {
  if (![1, 2, 3, 4, 5].includes(Number(level))) return;
  state.skillProfile = { ...(state.skillProfile || {}), ...extra, level: Number(level), growth: "steady", diagnosed: !!extra.quizLevel, updatedAt: nowIso() };
  state.planOverrides = {};
}
// 料理スキルは、写真の判定とテストの両方があれば平均（小数は切り上げ）。片方だけならその値。
function combinedSkill(quizLevel, photoLevel) {
  const parts = [quizLevel, photoLevel].filter((x) => [1, 2, 3, 4, 5].includes(x));
  return parts.length ? Math.ceil(parts.reduce((a, b) => a + b, 0) / parts.length) : 1;
}
function normalizeSkillProfile(raw) {
  const lvl = (x) => ([1, 2, 3, 4, 5].includes(Number(x)) ? Number(x) : null);
  if (!lvl(raw?.level)) return null;
  const score = Number(raw.score), promoted = Number(raw.promoted);
  return { level: lvl(raw.level), ...(lvl(raw.quizLevel) ? { quizLevel: lvl(raw.quizLevel) } : {}), ...(lvl(raw.photoLevel) ? { photoLevel: lvl(raw.photoLevel) } : {}),
    ...(Number.isInteger(score) && score >= 0 && score <= 1000 ? { score } : {}), ...(Number.isInteger(promoted) && promoted > 0 && promoted < 5 ? { promoted } : {}),
    ...(/^\d{4}-\d{2}-\d{2}$/.test(raw.examFailedOn || "") ? { examFailedOn: raw.examFailedOn } : {}),
    growth: raw.growth === "grow" ? "grow" : "steady", diagnosed: raw.diagnosed === true, updatedAt: normalizeTimestamp(raw.updatedAt) };
}
