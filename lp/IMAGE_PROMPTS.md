# LP用 画像生成プロンプト集

LP（`lp/index.html`）が参照する画像の生成プロンプトです。
**現在は全画像設置済み**（`lp/assets/` にWebP形式で配置）。作り直す場合はこのプロンプトで再生成し、下記のファイル名で上書きしてください。
**画像が無い間もLPはプレースホルダー表示で成立します**（設置すると自動で差し替わります）。

## 共通スタイル指定（全プロンプトの末尾に付けてください）

```
Warm and cozy flat illustration style, soft rounded shapes, gentle hand-drawn feel.
Color palette: sage green (#7C9A75), deep sage (#4F704D), warm cream (#FFFDF7),
beige (#F4EADB), soft tomato red (#C95B48) as small accent only.
Clean composition with generous negative space, no text, no letters, no logos,
no watermark. Soft natural lighting, friendly and homely mood, Japanese home setting.
```

> **注意**: 画像内の文字はAIが崩しやすいので「no text」を必ず指定し、
> 文字が必要な表現（アプリ画面など）は抽象化した図形で描かせています。

---

## 1. hero.webp — ヒーロー画像

- **サイズ**: 1200×900px（4:3）
- **用途**: ファーストビュー右側

```
A Japanese mother in her 30s and a small child smiling together in a bright cozy
kitchen in the evening. The mother holds a smartphone showing an abstract recipe
app screen (simple rounded rectangles and a green checkmark, no readable text).
On the counter: a steaming bowl of rice, fresh vegetables, a cutting board.
Through the window, warm sunset light. The child is reaching toward the food happily.
Composition: characters slightly right of center, space on the left.
+ 共通スタイル指定
```

## 2. feature01.webp — 機能01「3秒で保存」

- **サイズ**: 800×600px（4:3）
- **用途**: 共有シートからの保存の説明

```
A smartphone floating at a slight angle, showing an abstract short-video app
interface (vertical video thumbnail of a delicious donburi bowl, heart and share
icons as simple shapes, no readable text). From the share icon, a soft dotted
arrow flows into a second smaller phone screen with a green bookmark icon and
neat rows of recipe cards with food thumbnails. Small sparkles around the arrow
to express "instant and easy". Background: plain warm cream.
+ 共通スタイル指定
```

## 3. feature02.webp — 機能02「家族のリピ周期」

- **サイズ**: 800×600px（4:3）
- **用途**: 家族別6段階記録の説明

```
A Japanese family of four (mother, father, young boy, young girl) sitting around
a round dining table with a hot pot and side dishes, all smiling. Above each
family member floats a small speech bubble containing only a simple icon:
a flame icon, a heart icon, a calendar icon, a moon icon (no text) — expressing
different "want to eat again" feelings. Warm pendant light above the table.
Top-down slightly angled view.
+ 共通スタイル指定
```

## 4. feature03.webp — 機能03「今週の献立」

- **サイズ**: 800×600px（4:3）
- **用途**: 1週間の献立提案の説明

```
A cute weekly meal planner illustrated as a vertical calendar card with 7 rows,
each row containing a small food illustration (grilled salmon, curry rice, pasta,
miso soup bowl, fried chicken, salad, onigiri) and abstract short lines instead of
text. One row is highlighted with a soft green glow and a small circular refresh
arrow icon beside it, expressing "swap this day". A relaxed woman's hand holding
a cup of tea rests near the planner. Background: warm wooden table surface.
+ 共通スタイル指定
```

## 5. feature04.webp — 機能04「買い物リスト」

- **サイズ**: 800×600px（4:3）
- **用途**: 自動買い物リストの説明

```
A Japanese woman in a supermarket vegetable aisle, pushing a small cart, looking
at her smartphone with a relieved smile. The phone screen shows an abstract
checklist: rows with green checkmarks and small food icons (carrot, meat, milk,
soy sauce bottle), no readable text. Shelves with colorful fresh vegetables in
the background, softly blurred. One hand picks up a tomato.
+ 共通スタイル指定
```

## 6. ogp.webp — OGP / SNSシェア画像

- **サイズ**: 1200×630px（1.91:1）※このサイズ厳守
- **用途**: SNSでLPをシェアした時のカード画像
- **注意**: ロゴとキャッチコピーの文字は生成後にCanva等で載せるのがおすすめ。
  文字を載せる余白を左側に確保する構図で生成します。

```
A wide horizontal illustration: on the right side, a cozy Japanese dining table
scene with a steaming rice bowl, colorful home-cooked dishes, and a smartphone
showing an abstract recipe app screen (no readable text). Gentle steam rising.
On the left side, a large plain area of warm cream color (#FFFDF7) reserved for
title text overlay, decorated only with 2-3 tiny scattered food icons (a leaf,
a small tomato). Soft and appetizing atmosphere.
+ 共通スタイル指定
```

---

## 生成後のチェックリスト

- [ ] ファイル名・サイズが上記どおりか（特にogp.webpは横長1.91:1推奨）
- [ ] 画像内に崩れた文字・意味不明のロゴが写り込んでいないか
- [ ] 配色がLPのセージグリーン×クリームと馴染んでいるか
- [ ] `lp/assets/` に配置後、LPを開いてプレースホルダーが画像に置き換わったか
- [ ] ogp.webpにはタイトル文字を別途載せたか（例:「また作って！を、忘れない。リピごち」）

## 2026-09-23: LP refresh

- `assets/app-today.png`, `assets/app-plan.png`: real application screenshots captured by `scripts/check-lp.cjs` in an isolated browser, using a two-person, 20-minute example setup.
- `assets/dinner-for-two.webp`: built-in imagegen, original `exec-bb683e71-6183-4c77-9fc6-5813bfabb844.png`. Prompt: Original warm editorial illustration for a Japanese dinner planning app landing page. Two adult housemates sharing a simple evening meal at a small cozy apartment table, each has one bowl dinner, no children. Relaxed natural expressions, unisex everyday clothing, softly textured picture-book art with sage green, ivory and terracotta palette, generous uncluttered space, landscape composition, no text, no logos, no screens with imaginary UI. The theme is easy enjoyable dinner for one or two adults.
