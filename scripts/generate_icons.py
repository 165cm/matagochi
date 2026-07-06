#!/usr/bin/env python3
"""リピごちのPWAアイコンを生成する。

usage: python3 scripts/generate_icons.py

Pillowが必要です: pip install pillow
icons/ 配下に 192 / 512 / maskable 512 / apple-touch-icon(180) を書き出します。
"""
from pathlib import Path

from PIL import Image, ImageDraw

SAGE = (124, 154, 117)
SAGE_DARK = (79, 112, 77)
CREAM = (255, 253, 247)
TOMATO = (201, 91, 72)

OUT_DIR = Path(__file__).resolve().parent.parent / "icons"
SCALE = 4  # スーパーサンプリング倍率


def draw_art(size, padding_ratio, rounded):
    """お椀と湯気と「リピート」矢印のアイコンを描く。"""
    canvas = size * SCALE
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    radius = int(canvas * 0.22) if rounded else 0
    draw.rounded_rectangle([0, 0, canvas, canvas], radius=radius, fill=SAGE)

    pad = canvas * padding_ratio
    area = canvas - pad * 2

    def px(x):
        return pad + area * x

    # お椀: 下半分の弦 + 高台
    bowl_top = px(0.52)
    bowl_bottom = px(0.88)
    bowl_left = px(0.14)
    bowl_right = px(0.86)
    bowl_height = bowl_bottom - bowl_top
    draw.pieslice(
        [bowl_left, bowl_top - bowl_height, bowl_right, bowl_bottom],
        0, 180, fill=CREAM,
    )
    draw.rectangle(
        [px(0.42), bowl_bottom - area * 0.005, px(0.58), px(0.93)],
        fill=CREAM,
    )
    # ごはんの盛り
    draw.pieslice(
        [px(0.26), px(0.36), px(0.74), px(0.68)],
        180, 360, fill=CREAM,
    )

    # 湯気 2本
    steam_width = max(int(area * 0.045), SCALE)
    for cx in (0.40, 0.60):
        draw.arc(
            [px(cx - 0.05), px(0.10), px(cx + 0.05), px(0.22)],
            270, 90, fill=CREAM, width=steam_width,
        )
        draw.arc(
            [px(cx - 0.05), px(0.18), px(cx + 0.05), px(0.30)],
            90, 270, fill=CREAM, width=steam_width,
        )

    # リピートを示す円弧矢印（右下、トマト色）
    arrow_box = [px(0.62), px(0.58), px(0.94), px(0.90)]
    arrow_width = max(int(area * 0.055), SCALE)
    draw.ellipse(
        [arrow_box[0] - arrow_width, arrow_box[1] - arrow_width,
         arrow_box[2] + arrow_width, arrow_box[3] + arrow_width],
        fill=None, outline=None,
    )
    badge_pad = area * 0.035
    draw.ellipse(
        [arrow_box[0] - badge_pad, arrow_box[1] - badge_pad,
         arrow_box[2] + badge_pad, arrow_box[3] + badge_pad],
        fill=SAGE_DARK,
    )
    inner = area * 0.055
    arc_box = [arrow_box[0] + inner, arrow_box[1] + inner,
               arrow_box[2] - inner, arrow_box[3] - inner]
    draw.arc(arc_box, 300, 210, fill=CREAM, width=arrow_width)
    # 矢じり
    cx = (arc_box[0] + arc_box[2]) / 2
    top = arc_box[1]
    head = area * 0.055
    ax = cx + (arc_box[2] - arc_box[0]) * 0.5 * 0.5
    ay = top + (arc_box[3] - arc_box[1]) * 0.07
    draw.polygon(
        [(ax - head, ay - head * 0.9), (ax + head * 1.1, ay - head * 0.2),
         (ax - head * 0.3, ay + head * 1.1)],
        fill=CREAM,
    )

    return image.resize((size, size), Image.LANCZOS)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    draw_art(192, 0.12, rounded=True).save(OUT_DIR / "icon-192.png")
    draw_art(512, 0.12, rounded=True).save(OUT_DIR / "icon-512.png")
    # maskable: セーフゾーン(中央80%)に収まるよう余白を広めに、角丸なし
    draw_art(512, 0.20, rounded=False).save(OUT_DIR / "icon-maskable-512.png")
    draw_art(180, 0.12, rounded=False).save(OUT_DIR / "apple-touch-icon.png")
    print(f"icons written to {OUT_DIR}")


if __name__ == "__main__":
    main()
