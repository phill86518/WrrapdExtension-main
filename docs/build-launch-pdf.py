#!/usr/bin/env python3
"""Render docs/LAUNCH-READINESS-JAX-BETA-2026-10.md to a branded PDF.

Needs: pip install --user markdown weasyprint, plus Pango. On the GCP VM, Pango
is unpacked under ~/pdflibs (apt is not usable there), so run:

  LD_LIBRARY_PATH=~/pdflibs/root/usr/lib/x86_64-linux-gnu python3 docs/build-launch-pdf.py
"""
import re
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import markdown
from weasyprint import HTML

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "LAUNCH-READINESS-JAX-BETA-2026-10.md"
# Every build gets its own Eastern-time creation stamp in the file name, e.g.
# "LAUNCH-READINESS-JAX-BETA-2026-10 202610032138.pdf" (Roger relies on it after git pull).
CREATED = datetime.now(ZoneInfo("America/New_York"))
OUT = ROOT / "docs" / f"LAUNCH-READINESS-JAX-BETA-2026-10 {CREATED:%Y%m%d%H%M}.pdf"
# Same file as live wrrapd.com wp-content/mu-plugins/icons/favicon/android-chrome-512x512.png
ICON = ROOT / "wordpress" / "icons" / "favicon" / "android-chrome-512x512.png"

NAVY = "#0c0638"
GOLD = "#f6b933"
INK = "#162a52"

CSS = f"""
@font-face {{ font-family: Body; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSans.ttf); }}
@font-face {{ font-family: Body; font-weight: bold; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf); }}
@font-face {{ font-family: Mono; src: url(file:///usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf); }}

@page {{
  size: Letter;
  margin: 0.75in 0.6in 0.7in 0.6in;
  @top-left {{ content: "Wrrapd — Jacksonville Beta Master Readiness Review"; font: 7.5pt Body; color: #667; }}
  @top-right {{ content: "INTERNAL — do not publish"; font: bold 7.5pt Body; color: #b00020; }}
  @bottom-left {{ content: "Created {CREATED:%B %-d, %Y %-I:%M %p} ET"; font: 7.5pt Body; color: #667; }}
  @bottom-right {{ content: "Page " counter(page) " of " counter(pages); font: 7.5pt Body; color: #667; }}
}}
@page cover {{ margin: 0; @top-left {{ content: none; }} @top-right {{ content: none; }}
  @bottom-left {{ content: none; }} @bottom-right {{ content: none; }} }}
@page wide {{ size: Letter landscape; margin: 0.6in 0.5in 0.6in 0.5in; }}

html {{ font-family: Body, sans-serif; font-size: 9pt; color: #1b1b1b; line-height: 1.38; }}
.cover {{ page: cover; height: 11in; background: {NAVY}; color: #fff; padding: 1.6in 0.9in 0 0.9in; box-sizing: border-box; }}
.cover img {{ width: 1.3in; }}
.cover h1 {{ color: #fff; border: none; font-size: 26pt; line-height: 1.15; margin: 0.45in 0 0.15in; padding: 0;
  page-break-before: auto; bookmark-level: none; }}
.cover .sub {{ color: {GOLD}; font-size: 13pt; font-weight: bold; margin-bottom: 0.5in; }}
.cover .meta p {{ margin: 0.06in 0; font-size: 10pt; color: #e6e4f2; }}
.cover .meta strong {{ color: {GOLD}; }}
.cover .badge {{ display: inline-block; margin-top: 0.6in; border: 1.5px solid {GOLD}; color: {GOLD};
  padding: 6px 14px; font-weight: bold; letter-spacing: 1px; font-size: 9pt; }}

h1 {{ font-size: 17pt; color: {NAVY}; border-bottom: 3px solid {GOLD}; padding-bottom: 4px;
  margin: 0 0 10px; page-break-before: always; bookmark-level: 1; }}
h2 {{ font-size: 12.5pt; color: {NAVY}; margin: 16px 0 6px; bookmark-level: 2; page-break-after: avoid; }}
h3 {{ font-size: 10.5pt; color: {INK}; margin: 12px 0 4px; page-break-after: avoid; bookmark-level: 3; }}
p, li {{ orphans: 2; widows: 2; }}
a {{ color: {INK}; text-decoration: none; }}
code {{ font-family: Mono, monospace; font-size: 8pt; background: #f2f1f7; padding: 0 2px; border-radius: 2px; }}
pre {{ background: #f2f1f7; padding: 8px; font-size: 7.5pt; white-space: pre-wrap; border-left: 3px solid {GOLD}; }}
pre code {{ background: none; }}
hr {{ border: none; border-top: 1px solid #ddd; margin: 12px 0; }}

table {{ border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: 7.8pt; }}
thead {{ display: table-header-group; }}
tr {{ page-break-inside: avoid; }}
th {{ background: {NAVY}; color: #fff; text-align: left; padding: 4px 5px; font-weight: bold; }}
td {{ border-bottom: 1px solid #e3e2ea; padding: 3.5px 5px; vertical-align: top; }}
tr:nth-child(even) td {{ background: #f8f7fc; }}
td.box {{ text-align: center; font-size: 11pt; width: 0.32in; color: {NAVY}; }}
.checklist table {{ font-size: 7.4pt; }}
.checklist td:first-child {{ font-weight: bold; white-space: nowrap; color: {NAVY}; }}

.st {{ font-weight: bold; padding: 0 4px; border-radius: 2px; }}
.st-GREEN {{ background: #d9f2df; color: #11692b; }}
.st-YELLOW {{ background: #fff1c7; color: #7a5600; }}
.st-RED {{ background: #fbd9dc; color: #a1121f; }}
.st-GREY {{ background: #e7e7ea; color: #444; }}

.signoff {{ page-break-before: always; }}
.signoff table td {{ height: 0.32in; }}
"""


def status_chips(html: str) -> str:
    def repl(m):
        word = m.group(1)
        return f'<span class="st st-{word}">{word}</span>'
    html = re.sub(
        r"<strong>(GREEN|YELLOW|RED|GREY)( \([^<]*\))</strong>",
        lambda m: f'<span class="st st-{m.group(1)}">{m.group(1)}</span>{m.group(2)}', html,
    )
    html = re.sub(r"<strong>(GREEN|YELLOW|RED|GREY)</strong>", repl, html)
    return re.sub(r"(?<=<td>)(GREEN|YELLOW|RED|GREY)(?=[ <])", repl, html)


def checkbox_cells(html: str) -> str:
    return re.sub(r"<td>([☐☑✔])</td>", r'<td class="box">\1</td>', html)


def wrap_checklist(html: str) -> str:
    """Exhibit A tables get the denser checklist styling."""
    start = html.find('id="exhibit-a')
    if start < 0:
        return html
    h1_start = html.rfind("<h1", 0, start)
    nxt = html.find("<h1", start)
    end = nxt if nxt > 0 else len(html)
    return html[:h1_start] + '<div class="checklist">' + html[h1_start:end] + "</div>" + html[end:]


def build() -> None:
    md_text = SRC.read_text(encoding="utf-8")
    title_line, _, rest = md_text.partition("\n")
    title = title_line.lstrip("# ").strip()
    meta_block, _, body = rest.partition("\nHow this was built")
    body = "How this was built" + body

    meta_html = markdown.markdown(meta_block.strip().replace("\n", "\n\n"))
    body_html = markdown.markdown(
        body, extensions=["tables", "fenced_code", "sane_lists", "toc", "attr_list"],
        extension_configs={"toc": {"slugify": lambda v, s: re.sub(r"[^a-z0-9]+", "-", v.lower()).strip("-")}},
    )
    body_html = wrap_checklist(checkbox_cells(status_chips(body_html)))
    head, _, sub = title.partition(":")

    signoff_rows = "".join(
        f"<tr><td>{s}</td><td></td><td></td><td></td></tr>"
        for s in ["BOOSTER — Website", "GUIDANCE — Extension", "FIDO — Payments", "INCO — Pay server",
                  "GROUND — Hub / PO Box", "CAPCOM — Command Center", "WRAP — Wrap ops", "RECOVERY — Delivery",
                  "COMMS — Customer service", "CREW — Contractors", "SUPPLY — Kits", "DATA — Backups",
                  "SECURITY", "SURGEON — Monitoring", "LEGAL — Legal / tax", "FLIGHT DIRECTOR — Final Go"]
    )
    html = f"""<!doctype html><html><head><meta charset="utf-8"><title>{title}</title><style>{CSS}</style></head><body>
<section class="cover">
  <img src="{ICON.as_uri()}" alt="Wrrapd">
  <h1>{head.strip()}</h1>
  <div class="sub">{sub.strip() or "Master Readiness Review"}</div>
  <div class="meta">{meta_html}</div>
  <div class="badge">ALL SYSTEMS — GO / NO-GO</div>
</section>
{body_html}
<section class="signoff">
  <h2>Go/No-Go sign-off sheet</h2>
  <p>Each station lead initials only when every check in their station has both the 1st and 2nd tick, or a written waiver.</p>
  <table><thead><tr><th>Station</th><th>GO / NO-GO</th><th>Initials</th><th>Date &amp; time</th></tr></thead>
  <tbody>{signoff_rows}</tbody></table>
</section>
</body></html>"""
    HTML(string=html, base_url=str(ROOT)).write_pdf(OUT)
    print(OUT)


if __name__ == "__main__":
    sys.exit(build())
