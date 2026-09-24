#!/usr/bin/env python3
"""Split an AI-generated dish sheet (3 columns x 2 rows) into one WebP per recipe.

Usage:
  python3 scripts/split-dish-sheet.py sheet.png starter-03,starter-04,starter-07,starter-08,starter-09,starter-10

Slots are read left-to-right, top-to-bottom. Use "-" to skip a slot.
Each cell is normalised to 512x512 and saved as assets/dishes/<id>.webp.
"""
import argparse
import pathlib
import sys

from PIL import Image, ImageChops

p = argparse.ArgumentParser()
p.add_argument("sheet")
p.add_argument("ids", help="comma-separated ids in reading order; '-' skips a slot")
p.add_argument("--cols", type=int, default=3)
p.add_argument("--rows", type=int, default=2)
p.add_argument("--size", type=int, default=512, help="output edge in px")
p.add_argument("--inset", type=float, default=0.02, help="trim this share of each cell edge (hides seams)")
p.add_argument("--out", default="assets/dishes")
p.add_argument("--quality", type=int, default=80)
p.add_argument("--fit", type=float, default=None, metavar="MARGIN",
               help="crop each cell to a square around the dish, leaving MARGIN (e.g. 0.06) of its size as padding")
a = p.parse_args()

ids = [x.strip() for x in a.ids.split(",")]
if len(ids) > a.cols * a.rows:
    sys.exit(f"{len(ids)} ids for {a.cols * a.rows} slots")

sheet = Image.open(a.sheet).convert("RGB")
ratio = sheet.width / sheet.height
if abs(ratio - a.cols / a.rows) > 0.05:
    sys.exit(f"sheet is {sheet.width}x{sheet.height}; expected a {a.cols}:{a.rows} image")
if sheet.width < a.cols * a.size * 0.9:
    print(f"warning: sheet is only {sheet.width}px wide; cells will be upscaled", file=sys.stderr)

def fit_box(img, box, margin):
    """Square box around the pixels that differ from the cell's corner (background) colour."""
    cell = img.crop(box)
    bg = cell.getpixel((2, 2))
    diff = ImageChops.difference(cell, Image.new("RGB", cell.size, bg)).convert("L")
    found = diff.point(lambda v: 255 if v > 38 else 0).getbbox()
    if not found:
        return box
    l, t, r, b = found
    side = max(r - l, b - t) * (1 + 2 * margin)
    side = min(side, cell.width, cell.height)
    cx, cy = (l + r) / 2, (t + b) / 2
    x0 = min(max(cx - side / 2, 0), cell.width - side)
    y0 = min(max(cy - side / 2, 0), cell.height - side)
    return (round(box[0] + x0), round(box[1] + y0), round(box[0] + x0 + side), round(box[1] + y0 + side))


cw, ch = sheet.width / a.cols, sheet.height / a.rows
out = pathlib.Path(a.out)
out.mkdir(parents=True, exist_ok=True)
for i, rid in enumerate(ids):
    if rid == "-":
        continue
    col, row = i % a.cols, i // a.cols
    dx, dy = cw * a.inset, ch * a.inset
    box = (round(col * cw + dx), round(row * ch + dy), round((col + 1) * cw - dx), round((row + 1) * ch - dy))
    if a.fit is not None:
        box = fit_box(sheet, box, a.fit)
    cell = sheet.crop(box).resize((a.size, a.size), Image.LANCZOS)
    path = out / f"{rid}.webp"
    cell.save(path, "WEBP", quality=a.quality, method=6)
    print(f"{path}  {path.stat().st_size // 1024}KB")
