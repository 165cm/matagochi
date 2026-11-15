#!/usr/bin/env python3
"""画像の中の皿（背景と違う大きなかたまり）を見つけて番号を振る（Pillow だけ）。

使い方：
  python3 -I scripts/find-card-plates.py list <画像…>            … 各画像の皿に番号を描いた確認用画像（<名前>-plates.jpg）を作る
  python3 -I scripts/find-card-plates.py cut <picks.json> <フォルダ> <出力フォルダ> [--size 400]
picks.json：{"starter-56": ["画像ファイル名", 皿の番号], …}（隣とくっついた皿は、番号の代わりに範囲 [x0, y0, x1, y1]。5つ目に数を足すと、左端のその割合を背景色で塗る）
"""
import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

STEP = 4
CARD_BG = (250, 243, 230)
MARGIN = 0.05


def median(v):
    v = sorted(v)
    return v[len(v) // 2]


def plates(im):
    """背景色と、皿のかたまり（大きい順でなく、上から・左から の順）を返す。"""
    w, h = im.size
    px = im.load()
    corners = [px[x, y] for x in (3, w - 4) for y in (3, h - 4)]
    bg = tuple(median([c[k] for c in corners]) for k in range(3))
    gw, gh = w // STEP, h // STEP
    on = [[False] * gw for _ in range(gh)]
    for gy in range(gh):
        for gx in range(gw):
            r, g, b = px[gx * STEP, gy * STEP]
            on[gy][gx] = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > 36
    seen = [[False] * gw for _ in range(gh)]
    comps = []
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
            if len(comp) * STEP * STEP > w * h * 0.01:
                comps.append(comp)
    def box(c):
        xs = [x for x, _ in c]; ys = [y for _, y in c]
        return min(xs) * STEP, min(ys) * STEP, (max(xs) + 1) * STEP, (max(ys) + 1) * STEP
    items = [(box(c), c) for c in comps]
    # 上の段から、同じ段は左から（段の境目は高さの半分くらいずれたら別の段）
    items.sort(key=lambda it: (it[0][1] + it[0][3]) / 2)
    rows, cur = [], []
    for it in items:
        cy = (it[0][1] + it[0][3]) / 2
        if cur and cy - (cur[-1][0][1] + cur[-1][0][3]) / 2 > (cur[-1][0][3] - cur[-1][0][1]) * 0.5:
            rows.append(cur); cur = []
        cur.append(it)
    if cur:
        rows.append(cur)
    out = []
    for r in rows:
        out += sorted(r, key=lambda it: it[0][0])
    return bg, out


def dish_box(im, comp, bg):
    """かたまりのうち、皿と料理の範囲（影を除く）。
    影は色では見分けにくい（茶色みがある）ので形で決める：影はおもに皿の右下へ伸びるので、
    かたまりの上側6割の横幅を皿の幅とし、高さは幅の9割までに抑える（皿も丼も、斜め上から見ると横長）。"""
    ys = [y for _, y in comp]
    top, bottom = min(ys), max(ys)
    lim = top + (bottom - top) * 0.6
    xs = [x for x, y in comp if y <= lim]
    left, right = min(xs), max(xs) + 1
    width = right - left
    height = min(bottom + 1 - top, width * 0.9)
    return left * STEP, top * STEP, right * STEP, int((top + height) * STEP)


def fade_edges(sq, frac=0.045):
    """枠のふちを背景色へなじませる（枠で切れた影が、ぷつっと終わらないように）。"""
    w, h = sq.size
    m = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(m)
    n = max(1, int(w * frac))
    for i in range(n):
        v = int(255 * i / n)
        d.rectangle((i, i, w - 1 - i, h - 1 - i), outline=v)
    return Image.composite(sq, Image.new("RGB", (w, h), CARD_BG), m)


def cmd_list(files):
    for f in files:
        im = Image.open(f).convert("RGB")
        _, found = plates(im)
        d = ImageDraw.Draw(im)
        for i, (b, _) in enumerate(found, 1):
            d.rectangle(b, outline=(220, 0, 0), width=4)
            d.rectangle((b[0], b[1], b[0] + 44, b[1] + 34), fill=(220, 0, 0))
            d.text((b[0] + 12, b[1] + 8), str(i), fill="white")
        im.thumbnail((900, 900))
        out = Path(f).with_name(Path(f).stem[-12:] + "-plates.jpg")
        im.save(out, quality=80)
        print(out.name, len(found))


def cmd_cut(picks_file, src, out_dir, size):
    picks = json.loads(Path(picks_file).read_text())
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    for rid, (name, idx) in picks.items():
        im = Image.open(Path(src) / name).convert("RGB")
        found = None
        trim = 0.0
        if isinstance(idx, list) and len(idx) == 5:
            trim = idx[4]  # 左端のこの割合を背景色で塗る（隣の皿のふちが残る時）
            idx = idx[:4]
        if isinstance(idx, list):
            # 隣の皿とくっついている時：範囲を手で指定し、その中のいちばん大きなかたまりを使う
            im = im.crop(tuple(idx))
            bg, found = plates(im)
            found = sorted(found, key=lambda it: -len(it[1]))[:1]
            idx = 1
        w, h = im.size
        if not found:
            bg, found = plates(im)
        (x0, y0, x1, y1), comp = found[idx - 1]
        gw, gh = w // STEP, h // STEP
        keep = Image.new("L", (gw, gh), 0)
        kp = keep.load()
        for x, y in comp:
            kp[x, y] = 255
        keep = keep.filter(ImageFilter.MaxFilter(5)).resize((gw * STEP, gh * STEP), Image.NEAREST).crop((0, 0, w, h)) if False else keep.filter(ImageFilter.MaxFilter(5)).resize((w, h), Image.NEAREST).filter(ImageFilter.GaussianBlur(2))
        clean = Image.composite(im, Image.new("RGB", (w, h), CARD_BG), keep)
        # 枠の大きさは、影を除いた皿で決める（影の長さで皿が小さく見えないように。はみ出た影は端でなじませる）
        x0, y0, x1, y1 = dish_box(im, comp, bg)
        side = int(max(x1 - x0, y1 - y0) * (1 + 2 * MARGIN))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        sq = Image.new("RGB", (side, side), CARD_BG)
        sq.paste(clean, (int(side / 2 - cx), int(side / 2 - cy)))  # はみ出した所は背景色のまま（黒くしない）
        if trim:
            sq.paste(CARD_BG, (0, 0, int(side * trim), side))
        sq = fade_edges(sq)
        sq.resize((size, size), Image.LANCZOS).save(Path(out_dir) / f"{rid}.webp", "WEBP", quality=82, method=6)
        print(rid, name[-12:], idx, (x1 - x0, y1 - y0))


if __name__ == "__main__":
    a = sys.argv[1:]
    size = 400
    if "--size" in a:
        i = a.index("--size"); size = int(a[i + 1]); del a[i : i + 2]
    if a[0] == "list":
        cmd_list(a[1:])
    else:
        cmd_cut(a[1], a[2], a[3], size)
