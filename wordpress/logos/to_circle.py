#!/usr/bin/env python3
"""Crop retailer artwork to a circular PNG with a matching brand fill (Pillow)."""
from __future__ import annotations

import os
import sys
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

DEFAULT_SIZE = int(os.environ.get("WRRAPD_LOGO_SIZE", "512"))
CONTAIN_PAD_RATIO = 0.08

# Optional overrides when auto-detect would pick the wrong field color.
BRAND_BG: dict[str, tuple[int, int, int]] = {
	"amazon": (255, 255, 255),
	"target": (255, 255, 255),
	"sephora": (255, 255, 255),
	"bestbuy": (0, 70, 190),
}

FORCE_CONTAIN = {"amazon"}
FORCE_COVER = {"walmart", "etsy", "nordstrom", "bestbuy", "lego"}


def _luminance(color: tuple[int, int, int]) -> float:
	r, g, b = color
	return 0.299 * r + 0.587 * g + 0.114 * b


def _colors_similar(
	a: tuple[int, int, int], b: tuple[int, int, int], tolerance: int = 42
) -> bool:
	return max(abs(a[i] - b[i]) for i in range(3)) <= tolerance


def _crop_to_content(im: Image.Image) -> Image.Image:
	rgba = im.convert("RGBA")
	bbox = rgba.getbbox()
	if not bbox:
		return rgba
	return rgba.crop(bbox)


def _dominant_opaque_color(im: Image.Image) -> tuple[int, int, int] | None:
	rgba = im.convert("RGBA")
	colors: list[tuple[int, int, int]] = []
	for r, g, b, a in rgba.get_flattened_data():
		if a >= 128:
			colors.append((r, g, b))
	if not colors:
		return None
	return Counter(colors).most_common(1)[0][0]


def _contrasting_bg(fg: tuple[int, int, int]) -> tuple[int, int, int]:
	return (15, 23, 42) if _luminance(fg) > 200 else (255, 255, 255)


def _compose_plan(im: Image.Image, slug: str) -> tuple[Image.Image, tuple[int, int, int], bool]:
	"""Return cropped image, circle fill color, and whether to use cover scaling."""
	cropped = _crop_to_content(im)
	transparent = _transparent_ratio(cropped) > 0.15

	if slug in FORCE_CONTAIN:
		return cropped, BRAND_BG.get(slug, (255, 255, 255)), False
	if slug in FORCE_COVER and not transparent:
		return cropped, detect_bg_color(cropped, slug), True

	if transparent:
		fg = _dominant_opaque_color(cropped)
		brand = detect_bg_color(cropped, slug)
		if fg is None:
			bg = (255, 255, 255)
		elif _colors_similar(fg, brand):
			bg = _contrasting_bg(fg)
		else:
			bg = brand
		return cropped, bg, False

	return cropped, detect_bg_color(cropped, slug), True


def _mode_color(colors: list[tuple[int, int, int]], tolerance: int = 20) -> tuple[int, int, int]:
	if not colors:
		return (255, 255, 255)
	buckets: list[dict] = []
	for color in colors:
		for bucket in buckets:
			avg = tuple(int(bucket["sum"][i] / bucket["n"]) for i in range(3))
			if max(abs(color[i] - avg[i]) for i in range(3)) <= tolerance:
				bucket["sum"] = tuple(bucket["sum"][i] + color[i] for i in range(3))
				bucket["n"] += 1
				break
		else:
			buckets.append({"sum": color, "n": 1})
	best = max(buckets, key=lambda b: b["n"])
	return tuple(int(best["sum"][i] / best["n"]) for i in range(3))


def _transparent_ratio(im: Image.Image) -> float:
	rgba = im.convert("RGBA")
	alpha = rgba.split()[3]
	total = rgba.width * rgba.height
	if total == 0:
		return 1.0
	transparent = sum(1 for a in alpha.get_flattened_data() if a < 128)
	return transparent / total


def detect_bg_color(im: Image.Image, slug: str) -> tuple[int, int, int]:
	if slug in BRAND_BG:
		return BRAND_BG[slug]

	rgba = im.convert("RGBA")
	w, h = rgba.size
	px = rgba.load()
	corner_size = max(3, min(w, h) // 24)
	corners: list[tuple[int, int, int]] = []
	edge_band = max(2, min(w, h) // 16)
	edge: list[tuple[int, int, int]] = []
	opaque: list[tuple[int, int, int]] = []

	def in_corner_patch(x: int, y: int) -> bool:
		return (
			(x < corner_size and y < corner_size)
			or (x >= w - corner_size and y < corner_size)
			or (x < corner_size and y >= h - corner_size)
			or (x >= w - corner_size and y >= h - corner_size)
		)

	for y in range(h):
		for x in range(w):
			r, g, b, a = px[x, y]
			if a < 128:
				continue
			color = (r, g, b)
			opaque.append(color)
			if in_corner_patch(x, y):
				corners.append(color)
			if x < edge_band or x >= w - edge_band or y < edge_band or y >= h - edge_band:
				edge.append(color)

	if corners:
		corner_counts = Counter(corners)
		top_color, top_n = corner_counts.most_common(1)[0]
		if top_n / len(corners) >= 0.45:
			return top_color

	if edge:
		edge_mode = _mode_color(edge)
		similar = sum(
			1 for c in edge if max(abs(c[i] - edge_mode[i]) for i in range(3)) <= 24
		)
		if similar / len(edge) >= 0.4:
			return edge_mode

	if opaque:
		return _mode_color(opaque)
	return (255, 255, 255)


def use_cover_mode(im: Image.Image, slug: str) -> bool:
	"""Legacy helper — prefer _compose_plan()."""
	if slug in FORCE_CONTAIN:
		return False
	if slug in FORCE_COVER:
		return _transparent_ratio(_crop_to_content(im)) < 0.15
	return _transparent_ratio(_crop_to_content(im)) < 0.12


def _circle_mask(size: int) -> Image.Image:
	mask = Image.new("L", (size, size), 0)
	ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
	return mask


def _fit_contain(im: Image.Image, size: int) -> Image.Image:
	w, h = im.size
	if w <= 0 or h <= 0:
		return Image.new("RGBA", (size, size), (0, 0, 0, 0))

	aspect = w / max(h, 1)
	if aspect > 2.0:
		target_h = max(40, int(size * 0.36))
		scale = target_h / h
		nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
		max_w = max(32, int(size * 0.9))
		if nw > max_w:
			scale = max_w / w
			nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
		fitted = im.resize((nw, nh), Image.Resampling.LANCZOS)
	else:
		inner = max(32, int(size * (1 - CONTAIN_PAD_RATIO * 2)))
		fitted = ImageOps.contain(im, (inner, inner), method=Image.Resampling.LANCZOS)

	canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
	offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
	canvas.paste(fitted, offset, fitted)
	return canvas


def _fit_cover(im: Image.Image, size: int) -> Image.Image:
	fitted = ImageOps.fit(im, (size, size), method=Image.Resampling.LANCZOS)
	return fitted.convert("RGBA")


def main() -> int:
	if len(sys.argv) != 2:
		print("usage: to_circle.py <slug>", file=sys.stderr)
		return 2
	slug = sys.argv[1].strip()
	if not slug or "/" in slug or slug.startswith("."):
		print("invalid slug", file=sys.stderr)
		return 2

	size = DEFAULT_SIZE
	here = Path(__file__).resolve().parent
	src = here / f"{slug}-src.png"
	out = here / f"{slug}.png"
	if not src.is_file():
		print(f"missing {src}", file=sys.stderr)
		return 1

	im = Image.open(src).convert("RGBA")
	cropped, bg, cover = _compose_plan(im, slug)
	composited = _fit_cover(cropped, size) if cover else _fit_contain(cropped, size)

	circle = Image.new("RGBA", (size, size), bg + (255,))
	circle.paste(composited, (0, 0), composited)
	mask = _circle_mask(size)
	final = Image.new("RGBA", (size, size), (0, 0, 0, 0))
	final.paste(circle, (0, 0), mask)
	final.save(out, "PNG", optimize=True)
	mode = "cover" if cover else "contain"
	print(f"{out} bg={bg} mode={mode}")
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
