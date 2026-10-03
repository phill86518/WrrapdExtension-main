#!/usr/bin/env python3
"""Render wordpress/howto/*.html to JPGs (2x) for the homepage How it works rows."""
from pathlib import Path

import pymupdf
from weasyprint import HTML

HERE = Path(__file__).resolve().parent
for src in sorted(HERE.glob("wrrapd-howto-*.html")):
    pdf = HTML(filename=str(src)).write_pdf()
    page = pymupdf.open(stream=pdf, filetype="pdf")[0]
    out = src.with_suffix(".jpg")
    page.get_pixmap(dpi=144).save(str(out), jpg_quality=88)
    print(out)
