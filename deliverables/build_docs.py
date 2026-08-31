#!/usr/bin/env python3
"""Turn the Markdown deliverables into typeset PDFs.

Markdown to HTML with the python-markdown library, then HTML to PDF with headless
Chromium. Chromium rather than wkhtmltopdf because wkhtmltopdf runs an ancient
WebKit that gets CSS grid, flexbox and modern font features wrong, and the
two-column paper layout depends on all three.

Two stylesheets:

  report   single column, generous measure, for the work plan, literature review,
           outline, draft and peer reviews.
  paper    two column, condensed, for the final manuscript. Modelled on the
           physics manuscript format the course template uses.

Usage:
    python3 build_docs.py                 build everything
    python3 build_docs.py 01_work_plan    build one document
"""

from __future__ import annotations

import html as html_module
import re
import subprocess
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
OUTPUT = ROOT
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# Documents that use the two-column manuscript layout.
PAPER_STYLE = {"06_final_paper"}

SHARED_CSS = """
:root {
  --ink: #101010;
  --ink-soft: #3d3c39;
  --ink-muted: #6f6d67;
  --rule: #d7d6cf;
  --accent: #1c5cab;
  --code-bg: #f4f4f1;
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  color: var(--ink);
  font-family: "Charter", "Charis SIL", "Georgia", "Times New Roman", serif;
  font-feature-settings: "kern" 1, "liga" 1, "onum" 1;
  hyphens: auto;
  -webkit-hyphens: auto;
}
h1, h2, h3, h4, h5 {
  font-family: "Helvetica Neue", "Arial", system-ui, sans-serif;
  color: var(--ink);
  break-after: avoid-page;
  page-break-after: avoid;
  font-feature-settings: "kern" 1, "lnum" 1;
}
p { orphans: 3; widows: 3; }
a { color: var(--accent); text-decoration: none; }
code, pre, .mono {
  font-family: "SFMono-Regular", "Consolas", "Liberation Mono", monospace;
  font-feature-settings: "lnum" 1;
}
code { background: var(--code-bg); padding: 0.08em 0.3em; border-radius: 3px; }
pre {
  background: var(--code-bg);
  border-left: 2px solid var(--rule);
  padding: 0.7em 0.9em;
  overflow-x: auto;
  break-inside: avoid;
}
pre code { background: none; padding: 0; }
table {
  border-collapse: collapse;
  width: 100%;
  font-feature-settings: "tnum" 1, "lnum" 1;
  break-inside: avoid;
  page-break-inside: avoid;
}
th {
  text-align: left;
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-weight: 600;
  border-bottom: 1.2px solid var(--ink);
  border-top: 1.2px solid var(--ink);
}
td { border-bottom: 0.5px solid var(--rule); vertical-align: top; }
tbody tr:last-child td { border-bottom: 1.2px solid var(--ink); }
blockquote {
  margin: 1em 0 1em 0;
  padding: 0.1em 0 0.1em 1em;
  border-left: 2px solid var(--accent);
  color: var(--ink-soft);
}
hr { border: none; border-top: 0.8px solid var(--rule); margin: 1.6em 0; }
img { max-width: 100%; height: auto; break-inside: avoid; }
strong { font-weight: 600; }
"""

REPORT_CSS = SHARED_CSS + """
@page {
  size: Letter;
  margin: 0.95in 1.05in 1.0in 1.05in;
  @bottom-center { content: counter(page); }
}
body { font-size: 10.6pt; line-height: 1.52; }
h1 { font-size: 19pt; line-height: 1.18; margin: 0 0 0.15em; letter-spacing: -0.015em; }
h2 {
  font-size: 12.6pt; margin: 1.7em 0 0.5em; letter-spacing: -0.008em;
  padding-bottom: 0.22em; border-bottom: 0.8px solid var(--rule);
}
h3 { font-size: 11.2pt; margin: 1.25em 0 0.35em; }
h4 { font-size: 10.4pt; margin: 1.05em 0 0.3em; color: var(--ink-soft); }
p { margin: 0 0 0.72em; text-align: justify; }
ul, ol { margin: 0 0 0.8em; padding-left: 1.3em; }
li { margin-bottom: 0.28em; }
table { margin: 1em 0 1.3em; font-size: 9.3pt; }
th, td { padding: 0.42em 0.55em; }
pre, code { font-size: 8.9pt; }
blockquote { font-size: 10.2pt; }
.doc-header { margin: 0.2em 0 2.1em; padding-bottom: 0.9em; border-bottom: 0.8px solid var(--rule); }
.doc-header p {
  text-align: left; margin: 0.16em 0; color: var(--ink-soft); font-size: 10.2pt; line-height: 1.42;
}
.doc-header p strong { color: var(--ink); }
"""

PAPER_CSS = SHARED_CSS + """
@page {
  size: Letter;
  margin: 0.78in 0.62in 0.85in 0.62in;
  @bottom-center { content: counter(page); font-size: 8pt; }
}
body { font-size: 9.3pt; line-height: 1.36; }
.title-block {
  column-span: all;
  text-align: center;
  margin: 0 0 1.5em;
  border-bottom: 0.8px solid var(--rule);
  padding-bottom: 1.1em;
}
.title-block h1 {
  font-family: "Charter", Georgia, serif;
  font-size: 17pt; font-weight: 600; line-height: 1.16;
  margin: 0 0 0.55em; letter-spacing: -0.01em;
}
.title-block .authors { font-size: 10.5pt; margin: 0.2em 0; }
.title-block .affiliation { font-size: 8.8pt; font-style: italic; color: var(--ink-soft); margin: 0.15em 0; }
.title-block .dateline { font-size: 8.8pt; color: var(--ink-muted); margin: 0.35em 0 0; }
.abstract {
  column-span: all;
  margin: 0 auto 1.4em;
  max-width: 5.9in;
  font-size: 8.9pt;
  line-height: 1.42;
  text-align: justify;
}
.abstract .label {
  font-family: "Helvetica Neue", Arial, sans-serif;
  font-weight: 600; font-size: 8.2pt; letter-spacing: 0.07em;
  text-transform: uppercase; display: block; margin-bottom: 0.4em; color: var(--ink-muted);
}
.keywords {
  column-span: all; max-width: 5.9in; margin: -0.9em auto 1.5em;
  font-size: 8.4pt; color: var(--ink-soft);
}
.body-columns { column-count: 2; column-gap: 0.28in; column-fill: balance; }
h2 {
  font-size: 9.6pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.055em;
  margin: 1.25em 0 0.42em; border: none; padding: 0;
}
h2:first-child { margin-top: 0; }
h3 { font-size: 9.2pt; font-weight: 600; font-style: normal; margin: 0.95em 0 0.28em; }
h4 { font-size: 9pt; font-weight: 600; font-style: italic; margin: 0.75em 0 0.2em; color: var(--ink); }
p { margin: 0 0 0.42em; text-align: justify; text-indent: 0; }
ul, ol { margin: 0.25em 0 0.6em; padding-left: 1.05em; }
li { margin-bottom: 0.16em; }
table { font-size: 7.5pt; margin: 0.7em 0 1em; }
th, td { padding: 0.26em 0.32em; }
.wide { column-span: all; break-inside: avoid; }
.wide table { font-size: 7.8pt; }
figure { margin: 0.7em 0 1em; break-inside: avoid; page-break-inside: avoid; }
figure img { width: 100%; }
figcaption {
  font-size: 7.6pt; line-height: 1.34; color: var(--ink-soft);
  margin-top: 0.4em; text-align: left;
}
figcaption .fignum {
  font-family: "Helvetica Neue", Arial, sans-serif; font-weight: 600; color: var(--ink);
}
.caption { font-size: 7.6pt; line-height: 1.34; color: var(--ink-soft); margin: 0.35em 0 0.9em; }
.caption .tabnum {
  font-family: "Helvetica Neue", Arial, sans-serif; font-weight: 600; color: var(--ink);
}
pre, code { font-size: 7.4pt; }
.references { font-size: 8.1pt; line-height: 1.35; }
.references ol { padding-left: 1.15em; }
.references li { margin-bottom: 0.38em; }
"""


def render_markdown(text: str) -> str:
    return markdown.markdown(
        text,
        extensions=["extra", "tables", "sane_lists", "attr_list", "md_in_html", "toc"],
        output_format="html5",
    )


def wrap_report(title: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>{html_module.escape(title)}</title>
<style>{REPORT_CSS}</style></head>
<body>{body}</body></html>"""


def wrap_paper(title: str, body: str) -> str:
    """Split the paper into its single-column front matter and two-column body.

    The source marks the boundaries with HTML comments so the Markdown stays
    readable and the layout stays in the stylesheet where it belongs.
    """
    parts = re.split(r"<!--\s*(TITLE_END|ABSTRACT_END|COLUMNS_END)\s*-->", body)
    segments: dict[str, str] = {}
    current = "title"
    buffer: list[str] = []
    for chunk in parts:
        if chunk in {"TITLE_END", "ABSTRACT_END", "COLUMNS_END"}:
            segments[current] = "".join(buffer)
            buffer = []
            current = {"TITLE_END": "abstract", "ABSTRACT_END": "columns", "COLUMNS_END": "tail"}[chunk]
        else:
            buffer.append(chunk)
    segments[current] = "".join(buffer)

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>{html_module.escape(title)}</title>
<style>{PAPER_CSS}</style></head>
<body>
<div class="title-block">{segments.get('title', '')}</div>
<div class="abstract">{segments.get('abstract', '')}</div>
<div class="body-columns">{segments.get('columns', '')}</div>
{segments.get('tail', '')}
</body></html>"""


def to_pdf(html_path: Path, pdf_path: Path) -> None:
    subprocess.run(
        [
            CHROME,
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--run-all-compositor-stages-before-draw",
            "--virtual-time-budget=12000",
            "--no-pdf-header-footer",
            f"--print-to-pdf={pdf_path}",
            html_path.as_uri(),
        ],
        check=True,
        capture_output=True,
        timeout=180,
    )


def build(stem: str) -> Path:
    source = SOURCE / f"{stem}.md"
    text = source.read_text(encoding="utf-8")
    title = next((line[2:].strip() for line in text.splitlines() if line.startswith("# ")), stem)
    body = render_markdown(text)
    html = wrap_paper(title, body) if stem in PAPER_STYLE else wrap_report(title, body)

    html_path = OUTPUT / "_html" / f"{stem}.html"
    html_path.parent.mkdir(parents=True, exist_ok=True)
    html_path.write_text(html, encoding="utf-8")

    pdf_path = OUTPUT / f"SecondChance_{stem[3:]}.pdf" if stem[:2].isdigit() else OUTPUT / f"{stem}.pdf"
    to_pdf(html_path, pdf_path)
    size_kb = pdf_path.stat().st_size / 1024
    print(f"  {pdf_path.name:52s} {size_kb:7.0f} KB")
    return pdf_path


def main() -> None:
    targets = sys.argv[1:]
    stems = targets or sorted(p.stem for p in SOURCE.glob("*.md"))
    print(f"Building {len(stems)} document(s):")
    for stem in stems:
        build(stem)


if __name__ == "__main__":
    main()
