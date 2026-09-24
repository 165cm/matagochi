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

from PIL import Image

p = argparse.ArgumentParser()
p.add_argument("sheet")
p.add_argument("ids", help="comma-separated ids in reading order; '-' skips a slot")
p.add_argument("--cols", type=int, default=3)
p.add_argument("--rows", type=int, default=2)
p.add_argument("--size", type=int, default=512, help="output edge in px")
p.add_argument("--inset", type=float, default=0.02, help="trim this share of each cell edge (hides seams)")
p.add_argument("--out", default="assets/dishes")
p.add_argument("--quality", type=int, default=80)
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

cw, ch = sheet.width / a.cols, sheet.height / a.rows
out = pathlib.Path(a.out)
out.mkdir(parents=True, exist_ok=True)
for i, rid in enumerate(ids):
    if rid == "-":
        continue
    col, row = i % a.cols, i // a.cols
    dx, dy = cw * a.inset, ch * a.inset
    box = (round(col * cw + dx), round(row * ch + dy), round((col + 1) * cw - dx), round((row + 1) * ch - dy))
    cell = sheet.crop(box).resize((a.size, a.size), Image.LANCZOS)
    path = out / f"{rid}.webp"
    cell.save(path, "WEBP", quality=a.quality, method=6)
    print(f"{path}  {path.stat().st_size // 1024}KB")
