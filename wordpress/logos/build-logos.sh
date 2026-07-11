#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
export WRRAPD_LOGO_SIZE="${WRRAPD_LOGO_SIZE:-512}"
mkdir -p sources

# Prefer hand-placed brand assets in sources/{slug}.png (high-res press kit art).
# Falls back to Google favicon (128px max — low quality; replace with sources/ when possible).
fetch_src() {
  local slug="$1"
  local domain="$2"
  local hand=""
  for ext in png jpg jpeg webp; do
    if [[ -f "sources/${slug}.${ext}" ]]; then
      hand="sources/${slug}.${ext}"
      break
    fi
  done
  if [[ -n "$hand" ]]; then
    echo "  using ${hand}"
    cp "$hand" "${slug}-src.png"
    return 0
  fi
  echo "  favicon fallback for ${slug} (add sources/${slug}.png for hi-res)"
  curl -fsSL -A "Mozilla/5.0 WrrapdLogoBuild" \
    "https://www.google.com/s2/favicons?domain=${domain}&sz=128" -o "${slug}-src.png"
}

to_circle() {
  local slug="$1"
  if command -v python3 >/dev/null 2>&1 && python3 -c "import PIL" 2>/dev/null; then
    python3 "${DIR}/to_circle.py" "${slug}"
  elif command -v convert >/dev/null 2>&1; then
    echo "  warning: ImageMagick path lacks brand-fill logic; install python3-pillow" >&2
    local size="$WRRAPD_LOGO_SIZE"
    local inner=$(( size * 76 / 100 ))
    convert "${slug}-src.png" \
      -resize "${inner}x${inner}" -gravity center -background none -extent "${size}x${size}" \
      \( +clone -threshold -1 -negate -fill white -draw "circle $((size/2)),$((size/2)) $((size/2)),0" \) \
      -alpha off -compose copy_opacity -composite \
      "${slug}.png"
  else
    echo "Need python3 with Pillow (preferred) or ImageMagick 'convert' for ${slug}." >&2
    rm -f "${slug}-src.png"
    exit 1
  fi
  rm -f "${slug}-src.png"
}

process() {
  local slug="$1"
  local domain="$2"
  echo "→ ${slug}"
  fetch_src "$slug" "$domain"
  to_circle "$slug"
}

process amazon amazon.com
process target target.com
process ulta ulta.com
process lego lego.com
process walmart walmart.com
process nordstrom nordstrom.com
process kohls kohls.com
process sephora sephora.com
process etsy etsy.com
process bestbuy bestbuy.com

ls -la *.png
