#!/usr/bin/env python3
"""Crop favicon source to a 100×100 circular PNG (Pillow; no ImageMagick)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


def main() -> int:
	if len(sys.argv) != 2:
		print("usage: to_circle.py <slug>", file=sys.stderr)
		return 2
	slug = sys.argv[1].strip()
	if not slug or "/" in slug or slug.startswith("."):
		print("invalid slug", file=sys.stderr)
		return 2
	here = Path(__file__).resolve().parent
	src = here / f"{slug}-src.png"
	out = here / f"{slug}.png"
	if not src.is_file():
		print(f"missing {src}", file=sys.stderr)
		return 1
	im = Image.open(src).convert("RGBA")
	im = ImageOps.fit(im, (100, 100), method=Image.Resampling.LANCZOS)
	mask = Image.new("L", (100, 100), 0)
	ImageDraw.Draw(mask).ellipse((0, 0, 100, 100), fill=255)
	dest = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
	dest.paste(im, (0, 0), mask)
	dest.save(out, "PNG", optimize=True)
	print(out)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
