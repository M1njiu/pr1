#!/usr/bin/env python3
"""Tiny static-site builder for the Tarussky Gus brewery website.

Pages live in src/pages/*.html and start with a JSON metadata block:

    <!--meta
    {
      "slug": "about.html",
      "title": "О пивоварне — Пивоварня «Тарусский гусь»",
      "description": "...",
      "body_class": "page-about"
    }
    -->

Run `python3 tools/build.py` from the project root to regenerate the HTML files.
"""

from __future__ import annotations

import json
import re
import shutil
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
PAGES = SRC / "pages"
BASE_URL = "https://tarusskiygus.ru/"
BRAND = "Пивоварня «Тарусский гусь»"

META_RE = re.compile(r"^\s*<!--meta\s*(\{.*?\})\s*-->\s*", re.S)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def absolute(path: str) -> str:
    if not path:
        return BASE_URL + "assets/media/og-cover.jpg"
    if path.startswith("http"):
        return path
    return BASE_URL + path.lstrip("/")


def build_page(page: Path, layout: str, header: str, footer: str, age_gate: str, lightbox: str) -> dict:
    source = read(page)
    match = META_RE.match(source)
    if not match:
        raise SystemExit(f"Missing metadata block in {page}")
    meta = json.loads(match.group(1))
    body = source[match.end():].strip()

    slug = meta["slug"]
    canonical = BASE_URL if slug == "index.html" else BASE_URL + slug
    nav = slug[:-5] if slug.endswith(".html") else slug

    page_header = header
    if nav != "index":
        page_header = page_header.replace(
            f'data-nav="{nav}"', f'data-nav="{nav}" aria-current="page"'
        )

    html = layout
    replacements = {
        "TITLE": meta["title"],
        "DESCRIPTION": meta["description"],
        "CANONICAL": canonical,
        "OG_IMAGE": absolute(meta.get("og_image", "assets/media/og-cover.jpg")),
        "ROBOTS": meta.get("robots", "index, follow"),
        "BODY_CLASS": meta.get("body_class", "page"),
        "BODY": body,
        "HEADER": page_header,
        "FOOTER": footer,
        "AGE_GATE": age_gate,
        "LIGHTBOX": lightbox,
        "YEAR": str(date.today().year),
    }
    for key, value in replacements.items():
        html = html.replace("{{" + key + "}}", value)

    # Warn about unfilled placeholders (except the ones inside shared partials).
    leftovers = sorted(set(re.findall(r"\{\{([A-Z_]+)\}\}", html)))
    if leftovers:
        raise SystemExit(f"Unfilled placeholders in {slug}: {leftovers}")

    out = ROOT / slug
    out.write_text(html, encoding="utf-8")
    return {"slug": slug, "meta": meta}


def build_sitemap(entries: list[dict]) -> None:
    today = date.today().isoformat()
    rows = []
    priorities = {
        "index.html": "1.0",
        "products.html": "0.9",
        "about.html": "0.8",
        "cooperation.html": "0.8",
        "contacts.html": "0.7",
        "stores.html": "0.7",
        "gallery.html": "0.6",
        "privacy.html": "0.2",
    }
    for entry in entries:
        slug = entry["slug"]
        if entry["meta"].get("robots", "").startswith("noindex"):
            continue
        loc = BASE_URL if slug == "index.html" else BASE_URL + slug
        rows.append(
            "  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"    <priority>{priorities.get(slug, '0.5')}</priority>\n"
            "  </url>"
        )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(rows)
        + "\n</urlset>\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap, encoding="utf-8")

    robots = (
        "User-agent: *\n"
        "Allow: /\n"
        "Disallow: /404.html\n"
        "\n"
        f"Sitemap: {BASE_URL}sitemap.xml\n"
    )
    (ROOT / "robots.txt").write_text(robots, encoding="utf-8")


def main() -> None:
    layout = read(SRC / "layout.html")
    header = read(SRC / "partials" / "header.html")
    footer = read(SRC / "partials" / "footer.html")
    age_gate = read(SRC / "partials" / "age-gate.html")
    lightbox = read(SRC / "partials" / "lightbox.html")

    entries = []
    for page in sorted(PAGES.glob("*.html")):
        entries.append(build_page(page, layout, header, footer, age_gate, lightbox))
        print(f"built {entries[-1]['slug']}")

    build_sitemap(entries)
    print("built sitemap.xml, robots.txt")


if __name__ == "__main__":
    main()
