#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 128px source from Google favicon service (replace with approved brand assets if required).
fetch_src() {
  local slug="$1"
  local domain="$2"
  curl -fsSL -A "Mozilla/5.0 WrrapdLogoBuild" \
    "https://www.google.com/s2/favicons?domain=${domain}&sz=128" -o "${slug}-src.png"
}

to_circle() {
  local slug="$1"
  if command -v convert >/dev/null 2>&1; then
    convert "${slug}-src.png" \
      -resize '100x100^' -gravity center -extent '100x100' \
      \( +clone -threshold -1 -negate -fill white -draw 'circle 50,50 50,0' \) \
      -alpha off -compose copy_opacity -composite \
      "${slug}.png"
  elif command -v python3 >/dev/null 2>&1 && python3 -c "import PIL" 2>/dev/null; then
    python3 "${DIR}/to_circle.py" "${slug}"
  else
    echo "Need ImageMagick 'convert' or python3 with Pillow for ${slug}." >&2
    rm -f "${slug}-src.png"
    exit 1
  fi
  rm -f "${slug}-src.png"
}

fetch_src amazon amazon.com
fetch_src target target.com
fetch_src ulta ulta.com
fetch_src lego lego.com

to_circle amazon
to_circle target
to_circle ulta
to_circle lego

ls -la *.png
