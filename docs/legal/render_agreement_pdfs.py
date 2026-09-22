#!/usr/bin/env python3
"""Render each role's legal markdown into branded PDFs in that role's folder."""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

LEGAL = Path(__file__).resolve().parent
LOGO = "https://wrrapd.com/wp-content/uploads/2025/03/Wrrapd_f-Logo-800-x-458-px.png"
FONT = (
    "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@"
    "0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,650;0,9..144,700;"
    "1,9..144,400;1,9..144,500&display=swap"
)

SUITES = [
    {
        "folder": "wrapstar-agreements",
        "eyebrow": "WrapStar Agreements",
        "footer": "© 2026 Wrrapd Inc. · WrapStar contractor documentation · Duval County, Florida",
        "docs": [
            "01_WrapStar_Technology_Services_Agreement.md",
            "02_Mutual_Arbitration_Agreement.md",
            "03_Background_Check_Authorization.md",
            "04_WrapStar_Code_of_Conduct.md",
            "05_Third_Party_Litigation_Funding_Disclosure.md",
        ],
    },
    {
        "folder": "joyrider-agreements",
        "eyebrow": "JoyRider Agreements",
        "footer": "© 2026 Wrrapd Inc. · JoyRider contractor documentation · Duval County, Florida",
        "docs": [
            "01_JoyRider_Independent_Contractor_Agreement.md",
            "02_Mutual_Arbitration_Agreement.md",
            "03_Background_Check_Authorization.md",
            "04_JoyRider_Code_of_Conduct.md",
            "05_Third_Party_Litigation_Funding_Disclosure.md",
        ],
    },
    {
        "folder": "wraprider-agreements",
        "eyebrow": "WrapRider Agreements",
        "footer": "© 2026 Wrrapd Inc. · WrapRider contractor documentation · Duval County, Florida",
        "docs": [
            "01_WrapRider_Technology_Services_Agreement.md",
            "02_Mutual_Arbitration_Agreement.md",
            "03_Background_Check_Authorization.md",
            "04_WrapRider_Code_of_Conduct.md",
            "05_Third_Party_Litigation_Funding_Disclosure.md",
        ],
    },
]

CSS = """
@page {
  size: letter;
  margin: 0.7in 0.7in 0.95in 0.7in;
  @frame footer_frame {
    -pdf-frame-content: pageFooter;
    bottom: 0.35in;
    left: 0.7in;
    right: 0.7in;
    height: 0.45in;
  }
}
html, body {
  margin: 0; padding: 0; background: #fff; color: #0f172a;
  font-family: Times-Roman, Georgia, "Times New Roman", serif;
  font-size: 11pt; line-height: 1.5;
}
.doc-header { width: 100%; border-bottom: 1px solid #c5c9d1; padding-bottom: 8px; margin-bottom: 14px; }
.doc-header td { vertical-align: top; }
.doc-header img { width: 132px; height: auto; }
.doc-header__meta { text-align: right; }
.doc-header__eyebrow {
  margin: 0 0 4px 0; font-size: 8pt; letter-spacing: 1px;
  text-transform: uppercase; color: #475569; font-weight: bold;
}
.doc-header__tagline { margin: 0; font-size: 10pt; color: #475569; font-style: italic; }
h1 { font-size: 16pt; font-weight: bold; line-height: 1.25; margin: 0 0 6px 0; color: #1a2744; }
h2 { font-size: 12pt; font-weight: bold; margin: 16px 0 6px 0; color: #1a2744; }
h3 { font-size: 11pt; font-weight: bold; margin: 12px 0 5px 0; }
p, li { margin: 0 0 7px 0; }
ul, ol { margin: 0 0 8px 18px; }
strong { font-weight: bold; }
hr { border: 0; border-top: 1px solid #c5c9d1; margin: 12px 0; }
a { color: #1a2744; }


.sig-block { margin-top: 18px; }
.sig-table { width: 100%; border-collapse: collapse; }
.sig-col { vertical-align: top; padding-right: 8px; }
.sig-line { margin: 22px 0 2px 0; padding: 0; }
.sig-line--date { margin-top: 28px; }
.sig-bar {
  display: block;
  width: 92%;
  border-bottom: 1px solid #1a2744;
  height: 22px;
}
.sig-under { margin: 0 0 2px 0; font-size: 10pt; }
.sig-date-label { margin: 0 0 8px 0; font-size: 9pt; font-style: italic; color: #334155; }
.sig-spacer { margin: 0; line-height: 1.2; }
.sig-img-wrap { margin: 4px 0 0 0; }
.sig-img { height: 55px; width: auto; }
.sig-table td { vertical-align: top; }

.sig-ack { text-align: center; }

.doc-footer {
  margin: 0; padding: 0;
  border-top: 1px solid #c5c9d1;
  padding-top: 4px;
  font-size: 8pt; color: #475569;
  text-align: center;
}
"""


def inline_md(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def pdf_safe_text(text: str) -> str:
    return (
        text.replace("☐", "[ ]")
        .replace("☑", "[x]")
        .replace("→", "->")
        .replace("−", "-")
        .replace("–", "-")
        .replace("—", "--")
        .replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
    )


def md_to_html_body(md: str) -> str:
    md = pdf_safe_text(md)
    lines = md.splitlines()
    out: list[str] = []
    i = 0
    in_ul = False
    in_ol = False

    def close_lists() -> None:
        nonlocal in_ul, in_ol
        if in_ul:
            out.append("</ul>")
            in_ul = False
        if in_ol:
            out.append("</ol>")
            in_ol = False

    while i < len(lines):
        stripped = lines[i].rstrip().strip()
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


def wrap_document(title: str, eyebrow: str, footer: str, body: str, logo_src: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)} — Wrrapd</title>
  <style>{CSS}</style>
</head>
<body>
  <table class="doc-header" width="100%">
    <tr>
      <td width="40%"><img src="{logo_src}" width="132" alt="Wrrapd" /></td>
      <td class="doc-header__meta" width="60%">
        <p class="doc-header__eyebrow">{html.escape(eyebrow)}</p>
        <p class="doc-header__tagline">Wrapping Happiness</p>
      </td>
    </tr>
  </table>
  {body}
  <div id="pageFooter">
    <p class="doc-footer">{html.escape(footer)}</p>
  </div>
</body>
</html>
"""


def local_logo() -> str:
    dest = LEGAL / "_pdf_assets" / "wrrapd-logo.png"
    if dest.is_file() and dest.stat().st_size > 1000:
        import base64
        return "data:image/png;base64," + base64.b64encode(dest.read_bytes()).decode("ascii")
    try:
        from urllib.request import urlopen
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(urlopen(LOGO, timeout=20).read())
        import base64
        return "data:image/png;base64," + base64.b64encode(dest.read_bytes()).decode("ascii")
    except Exception:
        return LOGO



def local_signature() -> str:
    """Return data-URI for Roger Phillips / Wrrapd Inc. President signature."""
    import base64
    path = LEGAL / "_pdf_assets" / "rp-signature.jpg"
    if not path.is_file():
        path = LEGAL / "_pdf_assets" / "rp-signature.png"
    if not path.is_file():
        path = LEGAL / "wrapstar-agreements" / "samples" / "RP_signatures.jpg"
    if not path.is_file():
        return ""
    mime = "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def _link_callback(uri: str, rel: str) -> str:
    if uri.startswith("file://"):
        return uri[7:]
    return uri


def write_pdf(html_doc: str, dest: Path) -> None:
    from xhtml2pdf import pisa
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as fh:
        result = pisa.CreatePDF(
            html_doc,
            dest=fh,
            encoding="utf-8",
            link_callback=_link_callback,
        )
    if result.err:
        raise RuntimeError(f"PDF render failed for {dest}")


def render_one(md_path: Path, dest: Path, eyebrow: str, footer: str, logo_src: str, sig_src: str = "") -> None:
    md = md_path.read_text(encoding="utf-8")
    title = dest.stem.replace("_", " ")
    body = md_to_html_body(md)
    if sig_src:
        body = body.replace("SIG_IMG_SRC", sig_src)
    html_doc = wrap_document(title, eyebrow, footer, body, logo_src)
    write_pdf(html_doc, dest)
    print(f"Wrote {dest}")


def main() -> None:
    logo_src = local_logo()
    sig_src = local_signature()
    for suite in SUITES:
        folder = LEGAL / suite["folder"]
        for name in suite["docs"]:
            src = folder / name
            if not src.is_file():
                print(f"MISSING {src}", file=sys.stderr)
                continue
            dest = folder / name.replace(".md", ".pdf")
            render_one(src, dest, suite["eyebrow"], suite["footer"], logo_src, sig_src)
        role_sched = folder / "contractor-compensation-schedule.md"
        if role_sched.is_file():
            render_one(
                role_sched,
                folder / "contractor-compensation-schedule.pdf",
                suite["eyebrow"],
                suite["footer"],
                logo_src,
                sig_src,
            )

    schedule = LEGAL / "contractor-compensation-schedule.md"
    if schedule.is_file():
        dest = LEGAL / "contractor-compensation-schedule.pdf"
        render_one(
            schedule,
            dest,
            "Internal pay index",
            "© 2026 Wrrapd Inc. · Compensation Schedule index · Duval County, Florida",
            logo_src,
            sig_src,
        )


if __name__ == "__main__":
    main()
