#!/usr/bin/env python3
"""Render JoyRider agreement .md files to branded HTML (Wrrapd logo + Fraunces)."""

from __future__ import annotations

import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(__file__).resolve().parent
LOGO = "https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png"
FONT = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,650;0,9..144,700;1,9..144,400;1,9..144,500&display=swap"

DOCS = [
    "01_JoyRider_Independent_Contractor_Agreement.md",
    "02_Mutual_Arbitration_Agreement.md",
    "03_Background_Check_Authorization.md",
    "04_JoyRider_Code_of_Conduct.md",
    "05_Third_Party_Litigation_Funding_Disclosure.md",
    "contractor-compensation-schedule.md",
]


def inline_md(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        r'<a href="\2">\1</a>',
        text,
    )
    return text


def md_to_html_body(md: str) -> str:
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    in_ul = False
    in_ol = False

    def close_lists():
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    while i < len(lines):
        line = lines[i].rstrip()
        stripped = line.strip()

        if not stripped:
            close_lists()
            i += 1
            continue

        if stripped.startswith("<!--") and stripped.endswith("-->"):
            i += 1
            continue

        if stripped == "---":
            close_lists()
            out.append("<hr />")
            i += 1
            continue

        if stripped.startswith("# "):
            close_lists()
            out.append(f"<h1>{inline_md(stripped[2:])}</h1>")
            i += 1
            continue

        if stripped.startswith("## "):
            close_lists()
            out.append(f"<h2>{inline_md(stripped[3:])}</h2>")
            i += 1
            continue

        if stripped.startswith("### "):
            close_lists()
            out.append(f"<h3>{inline_md(stripped[4:])}</h3>")
            i += 1
            continue

        m_ul = re.match(r"^[-*] (.+)$", stripped)
        if m_ul:
            if in_ol:
                out.append("</ol>")
                in_ol = False
            if not in_ul:
                out.append("<ul>")
                in_ul = True
            out.append(f"<li>{inline_md(m_ul.group(1))}</li>")
            i += 1
            continue

        m_ol = re.match(r"^(\d+)\. (.+)$", stripped)
        # Numbered legal clauses like "1.1 Text" are paragraphs, not lists
        if m_ol and not re.match(r"^\d+\.\d+", stripped):
            if in_ul:
                out.append("</ul>")
                in_ul = False
            if not in_ol:
                out.append("<ol>")
                in_ol = True
            out.append(f"<li>{inline_md(m_ol.group(2))}</li>")
            i += 1
            continue


        # Pass through raw HTML blocks (signature tables, etc.)
        if stripped.startswith("<"):
            close_lists()
            chunk = [lines[i]]
            i += 1
            # gather until blank line after a closing tag, or until we leave HTML
            open_depth = stripped.count("<") - stripped.count("</") - stripped.count("/>")
            # simpler: accumulate while lines look like HTML or are inside a known block
            while i < len(lines):
                nxt_raw = lines[i]
                nxt = nxt_raw.strip()
                if not nxt:
                    # keep blank lines inside HTML only if still in tag content
                    if chunk and chunk[-1].strip().startswith("</"):
                        break
                    chunk.append(nxt_raw)
                    i += 1
                    continue
                if nxt.startswith("<") or nxt.startswith("&") or (
                    chunk and not chunk[-1].strip().startswith("</div>")
                    and not re.match(r"^#{1,3} ", nxt)
                    and nxt != "---"
                ):
                    # stop if we hit a new markdown heading/hr after closed block
                    if nxt.startswith("#") or nxt == "---":
                        break
                    if (
                        nxt.startswith("**")
                        and chunk
                        and any(c.strip().startswith("</div>") for c in chunk[-3:])
                    ):
                        break
                    chunk.append(nxt_raw)
                    i += 1
                    if nxt.startswith("</div>") or nxt == "</div>":
                        # peek: if next non-empty is markdown, stop after this
                        break
                    continue
                break
            out.append("\n".join(chunk))
            continue

        close_lists()
        # Collect consecutive paragraph lines
        para = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt == "---" or nxt.startswith("#") or re.match(r"^[-*] ", nxt):
                break
            if re.match(r"^\d+\. ", nxt) and not re.match(r"^\d+\.\d+", nxt):
                break
            para.append(nxt)
            i += 1
        out.append(f"<p>{inline_md(' '.join(para))}</p>")

    close_lists()
    return "\n".join(out)



def resolve_sig_src() -> str:
    """Relative path for browser HTML; absolute file URI also works."""
    local = Path(__file__).resolve().parent / "rp-signature.png"
    if local.is_file():
        return "rp-signature.png"
    return "../samples/RP_signatures.jpg"

def wrap_document(filename: str, body: str) -> str:
    title = filename.replace(".md", "").replace("_", " ")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{html.escape(title)} — Wrrapd</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="{FONT}" rel="stylesheet" />
  <link rel="stylesheet" href="agreement-styles.css" />
</head>
<body>
  <article class="page">
    <header class="doc-header">
      <div class="doc-header__brand">
        <a href="https://wrrapd.com/" rel="noopener">
          <img src="{LOGO}" width="800" height="458" alt="Wrrapd" />
        </a>
      </div>
      <div class="doc-header__meta">
        <p class="doc-header__eyebrow">JoyRider Agreements</p>
        <p class="doc-header__tagline">Wrapping Happiness</p>
      </div>
    </header>
    <main class="doc-body">
{body}
    </main>
    <footer class="doc-footer">
      © 2026 Wrrapd Inc. · JoyRider contractor documentation · Duval County, Florida
    </footer>
  </article>
</body>
</html>
"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in DOCS:
        src = ROOT / name
        md = src.read_text(encoding="utf-8")
        body = md_to_html_body(md)
        body = body.replace("SIG_IMG_SRC", resolve_sig_src())
        html_doc = wrap_document(name, body)
        dest = OUT / name.replace(".md", ".html")
        dest.write_text(html_doc, encoding="utf-8")
        print(f"Wrote {dest.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
