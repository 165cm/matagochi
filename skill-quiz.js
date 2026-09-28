/* 料理スキル試験（CBT方式・10問）。知識を問う4択を、正解なら難しく・不正解ならやさしく出して、腕前をスコア（0〜1000）と★1〜5・階級で出す。
   オンボーディングとは別のコンテンツ：?skill=1 で誰でも開ける（集客用）、アプリ内からもいつでも。
   昇級試験：料理を作ってLvが上がると、ひとつ上の★の問題を5問（4問正解で合格）。 */
const SKILL_CATS = { measure: "計量", safety: "衛生・安全", knife: "下ごしらえ", heat: "火加減", taste: "味つけ", plan: "段取り", fry: "揚げ物" };
// { id, level(難しさ★1〜5), cat, q, c:[4択], a:正解の番号, why:解説 }。選択肢は出すたびに並べ替える。
const SKILL_BANK = [
  { id: "m1", level: 1, cat: "measure", q: "大さじ1は何ml？", c: ["15ml", "5ml", "10ml", "20ml"], a: 0, why: "大さじ1は15ml、小さじ1は5ml。大さじ1＝小さじ3です。" },
  { id: "m2", level: 1, cat: "measure", q: "小さじ1は何ml？", c: ["5ml", "2.5ml", "10ml", "15ml"], a: 0, why: "小さじ1は5ml。小さじ1/2なら2.5mlです。" },
  { id: "m3", level: 1, cat: "measure", q: "料理用の計量カップ1杯は？", c: ["200ml", "180ml", "250ml", "100ml"], a: 0, why: "計量カップは200ml。お米の1合カップ（180ml）とは別物です。" },
  { id: "m4", level: 1, cat: "measure", q: "塩「ひとつまみ」の、つまみ方は？", c: ["親指・人差し指・中指の3本でつまむ", "親指と人差し指の2本でつまむ", "小さじですりきり1杯", "手のひらにのせる"], a: 0, why: "3本指がひとつまみ（小さじ1/5ほど）。2本指でつまむのは「少々」です。" },
  { id: "s1", level: 1, cat: "safety", q: "生の肉を切ったまな板で、次にサラダの野菜を切るときは？", c: ["洗剤で洗ってから切る", "そのまま切る", "水でさっと流す", "ペーパーでふく"], a: 0, why: "生肉の菌が生で食べる野菜に移らないよう、洗剤で洗ってから。先に野菜を切ると安心です。" },
  { id: "s2", level: 1, cat: "safety", q: "電子レンジで温めてはいけないのは？", c: ["殻つきの卵", "ラップをした耐熱ボウル", "冷やごはん", "耐熱皿にのせた野菜"], a: 0, why: "殻つきの卵は、中の水分がふくらんで破裂します。ゆで卵も同じです。" },
  { id: "s3", level: 1, cat: "safety", q: "冷凍した肉の解凍、いちばん安全なのは？", c: ["冷蔵庫でゆっくり", "常温で半日", "お湯につける", "日なたに置く"], a: 0, why: "冷蔵庫なら菌が増えにくい温度のまま解凍できます。急ぐならレンジの解凍モードで。" },
  { id: "s4", level: 1, cat: "safety", q: "冷蔵庫（冷蔵室）の温度の目安は？", c: ["10℃以下", "15℃以下", "20℃以下", "0℃以下"], a: 0, why: "冷蔵は10℃以下、冷凍は-15℃以下が目安。詰めすぎると冷えにくくなります。" },
  { id: "t1", level: 1, cat: "taste", q: "味見をして「少し薄い」と思ったら？", c: ["少しずつ足して、そのつど味見", "塩を一気に足す", "水を足す", "砂糖を足す"], a: 0, why: "足すのはかんたん、引くのはむずかしい。少しずつ足して確かめます。" },
  { id: "p1", level: 1, cat: "plan", q: "作りはじめる前に、まずすることは？", c: ["レシピを最後まで読む", "火をつける", "皿を並べる", "味見をする"], a: 0, why: "最後まで読むと、材料の過不足や「漬けておく時間」などの段取りに先に気づけます。" },

  { id: "h1", level: 2, cat: "heat", q: "「中火」の目安は？", c: ["炎の先が鍋底にちょうど当たる", "炎が鍋底に届かない", "炎が鍋底からはみ出す", "とろ火で10分温める"], a: 0, why: "中火は炎の先が鍋底に当たるくらい。届かないのが弱火、底全体に広がるのが強火です。" },
  { id: "k1", level: 2, cat: "knife", q: "包丁を使うとき、食材を押さえる手の形は？", c: ["指先を丸めた「猫の手」", "指をまっすぐ伸ばす", "手のひらでべったり押さえる", "押さえない"], a: 0, why: "指先を丸めると、刃が当たるのは第一関節。けがをしにくく、切る幅もそろいます。" },
  { id: "k2", level: 2, cat: "knife", q: "じゃがいもの芽や緑色の皮は？", c: ["厚めに取り除く", "そのまま使う", "水にさらせば大丈夫", "加熱すれば大丈夫"], a: 0, why: "芽や緑の皮には天然の毒（ソラニン）があり、加熱しても消えません。しっかり取ります。" },
  { id: "h2", level: 2, cat: "heat", q: "ほうれん草などの青菜をゆでるのは？", c: ["沸騰したお湯から", "水から", "ぬるま湯から", "蒸気だけで"], a: 0, why: "地面の上で育つ野菜はお湯から短時間で。色よく、食感も残ります。" },
  { id: "h3", level: 2, cat: "heat", q: "じゃがいも・にんじんなど根菜をゆでるのは？", c: ["水から", "沸騰したお湯から", "油から", "熱湯を回しかける"], a: 0, why: "根菜は水からゆっくり温めると、中まで均一に火が通り、煮くずれしにくくなります。" },
  { id: "t2", level: 2, cat: "taste", q: "調味料の「さしすせそ」。最初の「さ」は？", c: ["砂糖", "塩", "酒", "酢"], a: 0, why: "砂糖は粒が大きく味がしみにくいので先に。塩を先に入れると砂糖が入りにくくなります。" },
  { id: "m5", level: 2, cat: "measure", q: "塩「少々」はどのくらい？", c: ["親指と人差し指でつまむ量", "3本指でつまむ量", "小さじ1", "大さじ1/2"], a: 0, why: "少々は2本指でつまむ量（小さじ1/8ほど）。ひとつまみより少なめです。" },
  { id: "h4", level: 2, cat: "heat", q: "野菜炒めが水っぽくなる、いちばんの原因は？", c: ["一度にたくさん入れて温度が下がる", "強火で短時間炒める", "フライパンを先に熱する", "野菜の水気をよく切る"], a: 0, why: "入れすぎると温度が下がり、野菜から水が出て「煮た」状態に。量が多い日は2回に分けます。" },
  { id: "h5", level: 2, cat: "heat", q: "煮物の「落としぶた」の役割は？", c: ["少ない煮汁でも全体に味を回し、煮くずれを防ぐ", "鍋を早く冷ます", "焦げやすくする", "湯気を逃がさず蒸す"], a: 0, why: "煮汁が落としぶたに当たって全体に回るので、少ない煮汁でも味がまんべんなく入ります。" },
  { id: "s5", level: 2, cat: "safety", q: "多めに作ったカレーを翌日も食べるなら？", c: ["小分けにして早く冷まし、冷蔵庫へ", "鍋のまま常温で一晩", "ふたをしてコンロに置く", "ときどき温め直して常温で置く"], a: 0, why: "カレーやシチューはウェルシュ菌が増えやすい料理。早く冷まして冷蔵し、食べる時はよく混ぜて加熱します。" },
  { id: "p2", level: 2, cat: "plan", q: "お米を研ぐとき、最初に入れた水は？", c: ["すぐに捨てる", "ゆっくり時間をかけて混ぜる", "そのまま炊く", "お湯を使う"], a: 0, why: "乾いたお米は最初の水をいちばん吸います。ぬかのにおいを吸わないよう、手早く捨てます。" },
  { id: "k3", level: 2, cat: "knife", q: "なすを切ったあと、水にさらすのは？", c: ["アクを抜き、色が変わるのを防ぐ", "甘くするため", "やわらかくするため", "塩味をつけるため"], a: 0, why: "なすは切り口がすぐ茶色くなります。水にさらしてアクを抜き、炒める前によく水気をふきます。" },

  { id: "s6", level: 3, cat: "safety", q: "ハンバーグや鶏肉の、中まで火が通った目安は？", c: ["中心が75℃で1分以上", "中心が50℃で1分", "表面が白くなったら", "焼き色がついたら"], a: 0, why: "ひき肉や鶏肉は、中心75℃で1分以上が目安。食中毒を防ぐいちばん大事なポイントです。" },
  { id: "h6", level: 3, cat: "heat", q: "ハンバーグが焼けたか、見分けるには？", c: ["竹串を刺して、透明な肉汁が出る", "表面にこげ目がつく", "決めた時間だけ焼く", "押してかたければ"], a: 0, why: "赤い・にごった肉汁ならまだ。透明な肉汁が出れば中まで火が通っています。" },
  { id: "k4", level: 3, cat: "knife", q: "玉ねぎのみじん切り。最初にすることは？", c: ["根元を残して、縦に細かい切り込みを入れる", "輪切りにする", "根元を切り落とす", "すりおろす"], a: 0, why: "根元を残すとバラバラにならず、縦・横に刻むだけで細かくそろいます。" },
  { id: "h7", level: 3, cat: "heat", q: "鶏むね肉を、しっとり焼くコツは？", c: ["厚さをそろえ、ふたをして火を弱める", "強火でずっと焼く", "何度もひっくり返す", "冷蔵庫から出してすぐ強火"], a: 0, why: "むね肉は火が入りすぎるとパサつきます。厚さをそろえて、ふたで蒸し焼きにすると均一に火が通ります。" },
  { id: "t3", level: 3, cat: "taste", q: "照り焼きの「照り」が出るのは？", c: ["砂糖・みりんを煮詰めて、からめる", "しょうゆを先に入れる", "片栗粉を入れる", "酢を足す"], a: 0, why: "たれの糖分が煮詰まると、つやととろみが出ます。焦げやすいので最後は手早く。" },
  { id: "m6", level: 3, cat: "measure", q: "500Wで2分のレシピを、600Wで温めるなら？", c: ["約1分40秒", "約2分30秒", "約1分", "同じ2分"], a: 0, why: "時間はワット数に反比例。2分×500÷600＝約1分40秒です。" },
  { id: "p3", level: 3, cat: "plan", q: "炒め物で、調味料はいつ用意する？", c: ["火をつける前に合わせておく", "炒めながら1つずつ計る", "炒め終わってから考える", "用意しない"], a: 0, why: "炒め物はあっという間。先に合わせておけば、焦がさず・味もぶれません。" },
  { id: "k5", level: 3, cat: "knife", q: "しょうが焼きの豚ロース。焼くと反り返るのを防ぐには？", c: ["赤身と脂の間の筋を切る", "塩を多めにふる", "強火で長く焼く", "水にさらす"], a: 0, why: "筋は加熱で縮みます。数か所に切り込み（筋切り）を入れると、平らに焼けます。" },
  { id: "h8", level: 3, cat: "heat", q: "焼き魚は、どちらの面から焼く？", c: ["盛りつけで上になる面", "盛りつけで下になる面", "どちらでも同じ", "皮のない面"], a: 0, why: "先に焼く面のほうがきれいに焼けます。盛りつけで表になる面から焼くのが基本です。" },
  { id: "t4", level: 3, cat: "taste", q: "肉じゃがに味がしみこむのは？", c: ["冷めていくとき", "沸騰している間", "火を止めた瞬間だけ", "味はしみこまない"], a: 0, why: "煮物は冷めるときに味が入ります。一度冷ましてから温め直すと、よりおいしくなります。" },
  { id: "m7", level: 3, cat: "measure", q: "パスタをゆでるお湯の塩、目安は？", c: ["お湯の1%くらい", "お湯の10%", "入れない", "ひとつまみ"], a: 0, why: "1Lに塩10gくらい。パスタそのものに下味がついて、ソースとなじみます。" },
  { id: "s7", level: 3, cat: "safety", q: "作り置きやお弁当を詰めるときは？", c: ["しっかり冷ましてからふたをする", "熱いうちにふたをする", "常温で半日おいてから", "水を足してからふたをする"], a: 0, why: "熱いままふたをすると、水滴がついて菌が増えやすくなります。冷ましてからふたを。" },

  { id: "p4", level: 4, cat: "plan", q: "2品を同時に作るとき、最初に火にかけるのは？", c: ["時間のかかる煮物・ゆで物", "いちばん早くできる炒め物", "サラダ", "盛りつけの皿"], a: 0, why: "時間のかかるものから始めて、待つ間にもう一品。炒め物は食べる直前に仕上げます。" },
  { id: "k6", level: 4, cat: "knife", q: "ハンバーグの真ん中を、くぼませる理由は？", c: ["焼くとふくらむ真ん中を平らに仕上げ、火を通りやすくする", "ソースをためるため", "見た目のため", "早く冷ますため"], a: 0, why: "肉は焼くと縮んで真ん中がふくらみます。くぼませておくと平らになり、中まで火が通ります。" },
  { id: "k7", level: 4, cat: "knife", q: "ひき肉のたねをこねるコツは？", c: ["冷たいうちに手早くこねる", "常温に戻してからこねる", "10分以上こね続ける", "塩は最後に入れる"], a: 0, why: "手の熱で脂が溶けると、パサついたり割れたりします。冷たいまま、塩を入れて手早く。" },
  { id: "f1", level: 4, cat: "fry", q: "「揚げ焼き」の油の量は？", c: ["フライパンの底から1cmくらい", "5cm以上", "小さじ1", "油なし"], a: 0, why: "少なめの油で、返しながら両面を揚げるように焼くのが揚げ焼きです。" },
  { id: "t5", level: 4, cat: "taste", q: "パスタソースが「乳化」するとは？", c: ["ゆで汁と油が混ざって、とろりとまとまる", "油が分かれて浮く", "焦げて香ばしくなる", "冷えて固まる"], a: 0, why: "ゆで汁と油をフライパンでよくゆすると白っぽくとろみがつき、麺にからみます。" },
  { id: "h9", level: 4, cat: "heat", q: "焼いたステーキを、すぐ切らずに少し休ませるのは？", c: ["肉汁が落ち着き、切っても流れ出にくい", "冷ましてから食べるため", "塩をしみこませるため", "色をよくするため"], a: 0, why: "焼いた直後は肉汁が動いています。数分休ませると、切っても肉汁が中に残ります。" },
  { id: "h10", level: 4, cat: "heat", q: "卵焼きを焼く前の、フライパンの温度の目安は？", c: ["卵液を少し落とすとジュッと固まる", "煙がもくもく出る", "冷たいまま", "弱火で10分温める"], a: 0, why: "低すぎると卵がくっつき、高すぎると焦げます。少し落としてジュッと鳴るのが合図です。" },
  { id: "t6", level: 4, cat: "taste", q: "昆布だしをとるとき、昆布は？", c: ["水から入れ、沸騰直前に取り出す", "沸騰させて長く煮る", "熱湯に入れてすぐ出す", "火にかけない"], a: 0, why: "煮立てるとぬめりや雑味が出ます。水から入れて、沸騰直前に取り出すのが基本です。" },
  { id: "f2", level: 4, cat: "fry", q: "とんかつの衣、つける順番は？", c: ["小麦粉→溶き卵→パン粉", "パン粉→溶き卵→小麦粉", "溶き卵→小麦粉→パン粉", "小麦粉→パン粉→溶き卵"], a: 0, why: "小麦粉で水気をおさえ、卵をのりにしてパン粉をつけます。はがれにくい衣になります。" },
  { id: "f3", level: 4, cat: "fry", q: "揚げ物を、一度にたくさん入れると？", c: ["油の温度が下がって、べちゃっとする", "早く揚がる", "カリッとする", "変わらない"], a: 0, why: "油の表面の半分くらいまでが目安。入れすぎると温度が下がり、衣が油を吸います。" },
  { id: "k8", level: 4, cat: "knife", q: "新鮮な魚の見分け方は？", c: ["目が澄んでいて、エラが鮮やかな赤", "目が白くにごっている", "エラが茶色い", "身を押すとへこんだまま"], a: 0, why: "目が澄み、エラが赤く、身にはりがあるのが新鮮なしるしです。" },
  { id: "p5", level: 4, cat: "plan", q: "ぎょうざを焼いて、水を入れたあとは？", c: ["ふたをして蒸し焼きにする", "ふたをせずに強火で飛ばす", "水を捨てる", "油をたっぷり足す"], a: 0, why: "ふたをして蒸し焼きに。水気がなくなったらふたを取り、油を回してパリッと仕上げます。" },

  { id: "f4", level: 5, cat: "fry", q: "揚げ油が中温（170〜180℃）の見分け方は？", c: ["菜箸を入れると、細かい泡がシュワシュワ出る", "泡がまったく出ない", "煙が出ている", "大きな泡がはげしく出る"], a: 0, why: "低温は泡がゆっくり少し、中温は細かい泡がシュワシュワ、高温は大きな泡が勢いよく出ます。" },
  { id: "f5", level: 5, cat: "safety", q: "揚げ油から火が出たら？", c: ["火を止め、ふたや固くしぼったぬれタオルで覆う", "水をかける", "うちわであおぐ", "油を足して冷ます"], a: 0, why: "水をかけると油が飛び散り、火が一気に広がります。火を止めて空気を断つか、消火器を使います。" },
  { id: "f6", level: 5, cat: "fry", q: "からあげの「二度揚げ」の目的は？", c: ["余熱で中まで火を通し、2度目で衣をカリッとさせる", "油を節約する", "味をしみこませる", "冷凍するため"], a: 0, why: "1度目で揚げて休ませると余熱で中まで火が入ります。2度目は高温で短く、衣をカリッと。" },
  { id: "f7", level: 5, cat: "fry", q: "天ぷらの衣を、サクッとさせるには？", c: ["冷水で溶き、混ぜすぎない", "お湯で溶いてよく練る", "前の日に作っておく", "常温でしっかり混ぜる"], a: 0, why: "混ぜすぎたり温かかったりすると粘り（グルテン）が出て重い衣に。冷水でさっくり混ぜます。" },
  { id: "k9", level: 5, cat: "knife", q: "魚の「三枚おろし」で分ける3つは？", c: ["上身・下身・中骨", "頭・胴・尾", "皮・身・骨", "背・腹・尾"], a: 0, why: "中骨をはさんで上下の身に切り分けます。アジやサバで練習するのが定番です。" },
  { id: "k10", level: 5, cat: "knife", q: "魚の臭みを取る下処理「霜降り」とは？", c: ["熱湯をかけ、冷水で汚れやぬめりを落とす", "凍らせてから使う", "塩を大量にもみこむ", "日光に当てて干す"], a: 0, why: "表面が白くなるくらいに熱湯をかけ、冷水で血やぬめりを落とします。煮魚の前の基本です。" },
  { id: "p6", level: 5, cat: "plan", q: "主菜・副菜・汁物を同時に仕上げる順番のコツは？", c: ["冷めてもおいしいもの→温かいうちに食べたいものの順", "主菜を最初に作って置いておく", "汁物を最初に沸かし続ける", "3品を同時にスタート"], a: 0, why: "和え物など冷めてもいいものを先に。汁物と焼き物は食べる直前に仕上がるように組みます。" },
  { id: "p7", level: 5, cat: "plan", q: "パン生地の一次発酵。終わりの目安は？", c: ["生地が約2倍にふくらむ", "大きさは変わらない", "半分にしぼむ", "表面がかわいて割れる"], a: 0, why: "約2倍にふくらんだら、指に粉をつけて刺し、穴が戻らなければ発酵完了です。" },
];
const SKILL_TYPES = {
  1: { name: "レンジ名人", text: "混ぜてチン、が得意。包丁いらずの一皿から、無理なく回します。" },
  2: { name: "炒めもの上手", text: "切る・炒める・煮るはおまかせ。定番の丼や麺がどんどん回ります。" },
  3: { name: "フライパン使い", text: "焼いて中まで火を通す・煮からめるもOK。照り焼きやガパオまで守備範囲。" },
  4: { name: "おうちシェフ", text: "成形も揚げ焼きもこなせる腕前。ハンバーグの日も献立に入ります。" },
  5: { name: "台所マイスター", text: "揚げ物も魚も自在。どんな料理でも献立に並べます。" },
};
// ★ごとのスコアの帯（0〜1000）。階級は100点ごとに10級→1級、950点以上は初段。
const STAR_BANDS = [[1, 0], [2, 240], [3, 440], [4, 640], [5, 840]];
const TEST_LENGTH = 10, EXAM_LENGTH = 5, EXAM_PASS = 4;
const starOfScore = (score) => STAR_BANDS.filter(([, min]) => score >= min).pop()[0];
const kyuOfScore = (score) => (score >= 950 ? "初段" : `${Math.max(1, 10 - Math.floor(score / 100))}級`);

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
  const target = t.mode === "exam" ? t.target : Math.max(1, Math.min(5, Math.round(t.theta)));
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
  if (t.mode === "exam") return;
  // 正解なら上に、まちがいなら下に。動く幅は少しずつ小さくして、力の近くに落ち着かせる。
  t.theta = Math.max(0.5, Math.min(5.5, t.theta + (ok ? t.stepSize : -t.stepSize)));
  t.stepSize = Math.max(0.25, t.stepSize * 0.75);
}
function cbtResult(t) {
  const score = Math.round(Math.max(0, Math.min(1, (t.theta - 0.5) / 5)) * 1000);
  const cats = {};
  for (const a of t.answers) {
    const cat = SKILL_BANK.find((q) => q.id === a.id)?.cat;
    cats[cat] = cats[cat] || { ok: 0, n: 0 };
    cats[cat].n += 1;
    if (a.ok) cats[cat].ok += 1;
  }
  return { score, star: starOfScore(score), kyu: kyuOfScore(score), correct: t.answers.filter((a) => a.ok).length, cats };
}
function skillProfile() {
  return state.skillProfile?.level ? state.skillProfile : null;
}
function startSkillQuiz(fromLp = false) {
  skillQuiz = { mode: "test", step: 0, answers: [], theta: 3, stepSize: 1, current: null, fromLp };
  cbtPick(skillQuiz);
}
function startSkillExam() {
  const sp = skillProfile();
  if (!sp || sp.level >= 5) return;
  skillQuiz = { mode: "exam", target: sp.level + 1, answers: [], current: null };
  cbtPick(skillQuiz);
}
function quizLength(q) { return q.mode === "exam" ? EXAM_LENGTH : TEST_LENGTH; }
function renderQuizQuestion(q) {
  const item = SKILL_BANK.find((x) => x.id === q.current.id);
  const n = quizLength(q), i = q.answers.length - (q.current.picked !== null ? 1 : 0);
  const picked = q.current.picked;
  const choices = q.current.order.map((k, pos) => {
    const cls = picked === null ? "" : k === item.a ? " is-right" : k === picked ? " is-wrong" : " is-dim";
    return `<button type="button" class="quiz-choice${cls}" data-action="life-quiz-answer" data-value="${k}" ${picked !== null ? "disabled" : ""}><span class="qc-key" aria-hidden="true">${"ABCD"[pos]}</span>${escapeHtml(item.c[k])}</button>`;
  }).join("");
  const last = q.answers.length >= n;
  const reveal = picked === null ? "" : `<div class="quiz-reveal ${picked === item.a ? "is-right" : "is-wrong"}" role="status"><p class="qr-head">${picked === item.a ? "⭕ 正解！" : `❌ 正解は「${escapeHtml(item.c[item.a])}」`}</p><p>${escapeHtml(item.why)}</p></div>
    <button type="button" class="primary-button full-button" data-action="life-quiz-next">${last ? "結果を見る" : "次の問題"}</button>`;
  return `<section class="skill-quiz is-cbt"><p class="quiz-progress">${q.mode === "exam" ? `★${q.target} 昇級試験` : "料理スキル試験"} <b>${i + 1}</b> / ${n}</p>
    <div class="quiz-bar"><i style="width:${Math.round((i / n) * 100)}%"></i></div>
    <p class="quiz-meta"><span class="qm-cat">${SKILL_CATS[item.cat]}</span><span class="qm-level" aria-label="難しさ 5段階中${item.level}">難しさ ${Skills.stars(item.level)}</span></p>
    <h2 class="quiz-q">${escapeHtml(item.q)}</h2>
    <div class="quiz-choices">${choices}</div>${reveal}
    ${picked === null ? `<button type="button" class="text-button" data-action="life-quiz-close">${q.mode === "exam" ? "やめる" : "あとで"}</button>` : ""}</section>`;
}
// ★ごとの階段：その★で身につくスキル（Skills.SKILLS）と、スコアの帯。
function renderStarLadder(star) {
  return `<ol class="star-ladder">${[5, 4, 3, 2, 1].map((l) => {
    const band = STAR_BANDS.find(([s]) => s === l)[1], top = l === 5 ? 1000 : STAR_BANDS.find(([s]) => s === l + 1)[1] - 1;
    const skills = Skills.SKILLS.filter((s) => s.level === l).map((s) => s.label.replace(/（.*）/, "")).slice(0, 4).join("、");
    return `<li class="${l === star ? "is-here" : l < star ? "is-done" : ""}"><span class="sl-star">★${l}</span><span class="sl-body"><b>${SKILL_TYPES[l].name}</b><small>${skills}</small></span><span class="sl-band">${band}〜${top}${l === star ? '<em>いまここ</em>' : ""}</span></li>`;
  }).join("")}</ol>`;
}
function renderQuizResult(q) {
  if (q.mode === "exam") {
    const ok = q.answers.filter((a) => a.ok).length, pass = ok >= EXAM_PASS;
    return `<section class="skill-quiz is-result"><p class="quiz-progress">★${q.target} 昇級試験の結果</p>
      <p class="exam-score"><b>${ok}</b> / ${EXAM_LENGTH} 問正解</p>
      <h2><span class="marker nobr">${pass ? `合格！ ★${q.target}「${SKILL_TYPES[q.target].name}」` : "おしい！あと少し"}</span></h2>
      <p>${pass ? `献立に★${q.target}の料理も入るようになります。` : `${EXAM_PASS}問正解で合格です。明日また受けられます。`}</p>
      <div class="quiz-actions">${dailyButton("life-exam-done", pass ? "★を上げる" : "閉じる", "", true)}</div></section>`;
  }
  const r = cbtResult(q);
  const type = SKILL_TYPES[r.star];
  const catRows = Object.entries(r.cats).map(([cat, x]) => `<li><span>${SKILL_CATS[cat]}</span><b>${x.ok}/${x.n}</b></li>`).join("");
  const next = r.star < 5 ? skillNextPlan(r.star) : null;
  const nextLine = next ? `<p class="quiz-next">🎯 <b>★${r.star + 1}「${SKILL_TYPES[r.star + 1].name}」</b>へ：${escapeHtml(next.skills)}を身につける料理を、あと<b>約${next.dishes}皿</b>（週${next.perWeek}回で<b>約${next.weeks}週</b>）。そこで昇級試験が受けられます。</p>` : `<p class="quiz-next">🏆 最高ランクです。揚げ物も魚も献立に入ります。</p>`;
  const lp = q.fromLp && !state.onboarded;
  return `<section class="skill-quiz is-result"><p class="quiz-progress">料理スキル試験の結果</p>
    <div class="score-card"><p class="sc-score"><b>${r.score}</b><small>/ 1000点</small></p><p class="sc-rank"><span class="sc-kyu">${r.kyu}</span><span class="skill-stars">${Skills.stars(r.star)}</span></p><p class="sc-name">${type.name}</p><p class="sc-sub">${TEST_LENGTH}問中${r.correct}問正解</p></div>
    <p>${type.text}</p>
    <ul class="cat-scores">${catRows}</ul>
    <details class="ladder-box"><summary>階級のしくみ（★とスコア）</summary>${renderStarLadder(r.star)}<p class="muted small">晩ごはんを作るたびに経験値（XP）がたまり、Lvが上がると昇級試験が受けられます。</p></details>
    ${nextLine}
    <h3 class="quiz-growth-q">これからの献立は、どうしたい？</h3>
    <div class="quiz-growth">
      <button type="button" class="rhythm-option" data-action="life-quiz-save" data-value="grow"><strong>🌱 少しずつレベルアップしたい</strong><small>週に1回くらい「ちょっと挑戦」の一皿を入れる</small></button>
      <button type="button" class="rhythm-option" data-action="life-quiz-save" data-value="steady"><strong>🔁 今のレパートリーで回したい</strong><small>★${r.star}までの料理だけで、迷わずルーティン</small></button>
    </div>
    <div class="quiz-actions">${lp ? '<a class="secondary-button link-button" href="lp/#waitlist">公開のお知らせを受け取る</a>' : ""}${dailyButton("life-quiz-share", "結果をシェア")}<button type="button" class="text-button" data-action="life-quiz-restart">もう一度</button></div></section>`;
}
function renderSkillQuiz() {
  return skillQuiz.done ? renderQuizResult(skillQuiz) : renderQuizQuestion(skillQuiz);
}
function handleSkillQuizAction(action, data) {
  if (action === "life-exam-start") { if (examReady()) startSkillExam(); render(); globalThis.scrollTo?.({ top: 0 }); return true; }
  if (!action.startsWith("life-quiz") && action !== "life-exam-done") return false;
  if (action === "life-quiz-start") { startSkillQuiz(); render(); globalThis.scrollTo?.({ top: 0 }); return true; }
  if (!skillQuiz) return true;
  const q = skillQuiz;
  if (action === "life-quiz-answer") { cbtAnswer(q, data.value); render(); return true; }
  if (action === "life-quiz-next") {
    if (q.answers.length >= quizLength(q)) {
      q.done = true;
      if (q.mode === "test") trackDaily("skill_test_done", { score: cbtResult(q).score });
    } else cbtPick(q);
  }
  else if (action === "life-quiz-restart") startSkillQuiz(q.fromLp);
  else if (action === "life-quiz-close") skillQuiz = null;
  else if (action === "life-quiz-share") {
    const r = cbtResult(q);
    shareMessage(`料理スキル試験は${r.score}点・${r.kyu}「${SKILL_TYPES[r.star].name}」${Skills.stars(r.star)} でした。作れる料理だけで献立が決まる「リピごち」`, `${location.origin}${location.pathname}?skill=1`);
    return true;
  } else if (action === "life-quiz-save") {
    const r = cbtResult(q);
    const photoLevel = state.skillProfile?.photoLevel || null;
    const level = combinedSkill(r.star, photoLevel);
    const keep = state.skillProfile ? { promoted: state.skillProfile.promoted || 0 } : {};
    state.skillProfile = { ...keep, level, quizLevel: r.star, score: r.score, ...(photoLevel ? { photoLevel } : {}), growth: data.value === "grow" ? "grow" : "steady", diagnosed: true, updatedAt: nowIso() };
    state.planOverrides = {};
    skillQuiz = null;
    // 初回設定の途中なら、スキルの画面に戻って「写真＋テスト」の総合を見せる。
    saveState();
    if (state.onboarded) showToast(`${r.score}点・★${level}「${SKILL_TYPES[level].name}」を献立に反映しました。`);
  } else if (action === "life-exam-done") {
    const ok = q.answers.filter((a) => a.ok).length;
    const sp = state.skillProfile;
    if (sp && ok >= EXAM_PASS && q.target === sp.level + 1) {
      state.skillProfile = { ...sp, level: q.target, quizLevel: Math.max(sp.quizLevel || 1, q.target), promoted: (sp.promoted || 0) + 1, examFailedOn: undefined, updatedAt: nowIso() };
      state.planOverrides = {};
      showToast(`★${q.target}「${SKILL_TYPES[q.target].name}」に昇級しました！`);
    } else if (sp) state.skillProfile = { ...sp, examFailedOn: today(), updatedAt: nowIso() };
    skillQuiz = null;
    saveState();
  }
  render();
  globalThis.scrollTo?.({ top: 0 });
  return true;
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
