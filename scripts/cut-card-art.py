#!/usr/bin/env python3
"""Midjourney の 4列×2行 のシートから、選んだマスを1品ずつ正方形に切り出す（Pillow だけ）。

使い方：python3 -I scripts/cut-card-art.py assets/dishes/card-art-picks.json <Midjourneyの画像のフォルダ> assets/dishes [--size 400]
（元の画像はリポジトリに入れない。どの画像のどのマスを使ったかは card-art-picks.json に残す。docs/STARTER_RECIPES.md）
picks.json：{"starter-75": ["aab5…_0.png", 1, 1], …}  … [画像ファイル名, 行(1-2), 列(1-4)]

・マスの背景色（四隅の中央値）と違う画素を「料理」とみなし、いちばん大きなかたまり（皿と影）だけを残す
・それ以外（描き込まれた数字など）は消し、背景は48枚で同じ1色（CARD_BG）にそろえる
・料理のまわりに余白をとって正方形に切り、size×size の WebP にする
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

args = sys.argv[1:]
size = 400
if "--size" in args:
    i = args.index("--size")
    size = int(args[i + 1])
    del args[i : i + 2]
picks_file, src_dir, out_dir = args
picks = json.loads(Path(picks_file).read_text())
Path(out_dir).mkdir(parents=True, exist_ok=True)
COLS, ROWS = 4, 2
MARGIN = 0.05
STEP = 3  # かたまりを探す時の間引き（速さのため）
CARD_BG = (250, 243, 230)  # 48枚の背景をこの1色にそろえる


def median(vals):
    vals = sorted(vals)
    return vals[len(vals) // 2]


for rid, (name, row, col) in picks.items():
    sheet = Image.open(Path(src_dir) / name).convert("RGB")
    W, H = sheet.size
    box = (round((col - 1) * W / COLS), round((row - 1) * H / ROWS), round(col * W / COLS), round(row * H / ROWS))
    cell = sheet.crop(box)
    w, h = cell.size
    px = cell.load()
    corners = [px[x, y] for x in (2, w - 3) for y in (2, h - 3)]
    bg = tuple(median([c[k] for c in corners]) for k in range(3))
    # 背景と違う画素（間引いて）
    gw, gh = w // STEP, h // STEP
    on = [[False] * gw for _ in range(gh)]
    for gy in range(gh):
        for gx in range(gw):
            r, g, b = px[gx * STEP, gy * STEP]
            on[gy][gx] = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 36
    # いちばん大きなかたまり
    seen = [[False] * gw for _ in range(gh)]
    best = []
    for sy in range(gh):
        for sx in range(gw):
            if not on[sy][sx] or seen[sy][sx]:
                continue
            comp, q = [], deque([(sx, sy)])
            seen[sy][sx] = True
            while q:
                x, y = q.popleft()
                comp.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < gw and 0 <= ny < gh and on[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        q.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keep = Image.new("L", (gw, gh), 0)
    kp = keep.load()
    for x, y in best:
        kp[x, y] = 255
    # 穴を埋めて少し太らせ、元の大きさへ
    keep = keep.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(2))
    clean = Image.composite(cell, Image.new("RGB", (w, h), CARD_BG), keep)
    xs = [x for x, _ in best]
    ys = [y for _, y in best]
    x0, x1, y0, y1 = min(xs) * STEP, (max(xs) + 1) * STEP, min(ys) * STEP, (max(ys) + 1) * STEP
    side = max(x1 - x0, y1 - y0)
    side = int(side * (1 + 2 * MARGIN))
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    sq = Image.new("RGB", (side, side), CARD_BG)
    sq.paste(clean, (int(side / 2 - cx), int(side / 2 - cy)))
    sq.resize((size, size), Image.LANCZOS).save(Path(out_dir) / f"{rid}.webp", "WEBP", quality=82, method=6)
    print(rid, name[-10:], row, col, "bg", bg, "blob", len(best))
