#!/usr/bin/env python3
"""Build blog.anotheryou.si: src/content/guides/*.md -> dist/ (pages, index, sitemap, RSS).

A guide is a .md file: a front matter block of `key: value` lines (strings in JSON quotes),
then a body of raw HTML. Run `python3 build.py`; Vercel runs the same (vercel.json).
ponytail: stdlib only, no Markdown parser; bodies are HTML. Add a parser if guides ever need Markdown syntax.
"""
import html, json, pathlib, shutil

SITE = "https://blog.anotheryou.si"
ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"
DEFAULT_FOOTER = "Another You publishes these guides. General information, not legal advice."


def attr(s):
    return html.escape(s, quote=False).replace('"', "&quot;")


def read_guide(path):
    text = path.read_text()
    _, fm, body = text.split("---\n", 2)
    meta = {}
    for line in fm.strip().splitlines():
        key, value = line.split(": ", 1)
        try:
            meta[key] = json.loads(value)
        except json.JSONDecodeError:
            meta[key] = value  # bare dates like 2026-11-16
    meta["slug"] = path.stem
    meta["body"] = body.strip("\n")
    return meta


def page(title, description, main, footer_text, footer_link, url, image=None):
    og = ""
    if image:
        og = (f'<link rel="canonical" href="{url}">\n<meta property="og:type" content="article">\n'
              f'<meta property="og:title" content="{attr(title)}">\n<meta property="og:description" content="{attr(description)}">\n'
              f'<meta property="og:url" content="{url}">\n<meta property="og:image" content="{image}">\n'
              '<meta property="og:image:width" content="1400">\n<meta property="og:image:height" content="735">\n'
              '<meta name="twitter:card" content="summary_large_image">\n')
    return f"""<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title, quote=False)}</title>
<meta name="description" content="{attr(description)}">
{og}<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site"><div class="bar"><a class="brand" href="/">Another You<span>Guides</span></a><a href="https://app.anotheryou.si/library">Browse agents</a></div></header>
<main>
{main}
</main>
<footer class="site"><div class="bar"><span>{footer_text}</span>{footer_link}</div></footer>
</body>
</html>
"""


def build():
    guides = sorted((read_guide(p) for p in (ROOT / "src/content/guides").glob("*.md")), key=lambda g: g["order"])
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.copytree(ROOT / "public", DIST)

    for g in guides:
        url = f"{SITE}/{g['slug']}/"
        main = ('<span class="warn">WARNING</span>\n' if g.get("warn") else "") + \
            f'<h1>{g["h1"]}</h1>\n<p class="dek">{g["dek"]}</p>\n\n{g["body"]}'
        out = DIST / g["slug"] / "index.html"
        out.parent.mkdir(parents=True)
        out.write_text(page(g["title"], g["description"], main, g.get("footer", DEFAULT_FOOTER),
                            '<a href="/">All guides</a>', url, f"{SITE}/covers/{g['slug']}.png"))

    items = "\n".join(f'<a href="/{g["slug"]}/"><strong>{g.get("indexTitle", g["h1"])}</strong><span>{g["indexLine"]}</span></a>' for g in guides)
    main = ('<h1>What everybody ought to know before it costs them money</h1>\n'
            '<p class="dek">Free, plain guides. No sign up to read them, nothing to buy at the end.</p>\n'
            f'<div class="list">\n{items}\n</div>')
    (DIST / "index.html").write_text(page("Another You Guides", "Plain guides for the moments that cost you money: rent deposits, stuck refunds, recovery agents, unpaid invoices, hospital claims.",
                                          main, "Another You publishes these guides. General information, not legal advice.",
                                          '<a href="https://app.anotheryou.si">app.anotheryou.si</a>', SITE + "/"))

    last = max(str(g["date"]) for g in guides)
    urls = [(SITE + "/", last)] + [(f"{SITE}/{g['slug']}/", str(g["date"])) for g in guides]
    (DIST / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{u}</loc><lastmod>{d}</lastmod></url>\n" for u, d in urls) + "</urlset>\n")
    rss = "".join(f"<item><title>{html.escape(g['title'])}</title><link>{SITE}/{g['slug']}/</link><guid>{SITE}/{g['slug']}/</guid>"
                  f"<description>{html.escape(g['description'])}</description></item>\n" for g in guides)
    (DIST / "rss.xml").write_text(f'<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>Another You Guides</title>'
                                  f'<link>{SITE}/</link><description>Plain guides for the moments that cost you money.</description>\n{rss}</channel></rss>\n')
    return guides


if __name__ == "__main__":
    print(f"built {len(build())} guides into dist/")
