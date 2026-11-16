#!/usr/bin/env python3
"""Build blog.anotheryou.si: src/content/guides/*.md -> dist/ (pages, index, sitemap, RSS).

A guide is a .md file: a front matter block of `key: value` lines (strings in JSON quotes),
then a body of raw HTML. Run `python3 build.py`; Vercel runs the same (vercel.json).
ponytail: stdlib only, no Markdown parser; bodies are HTML. Add a parser if guides ever need Markdown syntax.
"""
import html, json, pathlib, re, shutil

SITE = "https://blog.anotheryou.si"
ROOT = pathlib.Path(__file__).parent
DIST = ROOT / "dist"
DEFAULT_FOOTER = "Another You publishes these guides. General information, not legal advice."
# Public project key (the app ships the same one to every browser). Same project as app.anotheryou.si, and the
# cookie sits on .anotheryou.si, so a reader who clicks through to the app stays one person in PostHog.
POSTHOG = ("<script>!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(\".\");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement(\"script\")).type=\"text/javascript\",p.crossOrigin=\"anonymous\",p.async=!0,p.src=s.api_host+\"/static/array.js\",(r=t.getElementsByTagName(\"script\")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a=\"posthog\",u.people=u.people||[],o=\"capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset\".split(\" \"),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);"
           "posthog.init(\"phc_qtCUKQ9RRFnxKBnFTwMw6e4UDpyRQLYiBbs49RFvrNYd\",{api_host:\"https://us.i.posthog.com\",person_profiles:\"identified_only\",disable_session_recording:true,"
           "loaded:function(ph){ph.register({site:\"blog\"})}});</script>\n")


def utm(page_html, campaign):
    """Tag every link into the app, so PostHog's utm_* properties say which guide sent the visitor."""
    return re.sub(r'href="(https://app\.anotheryou\.si[^"?]*)"',
                  rf'href="\1?utm_source=blog&amp;utm_medium=guide&amp;utm_campaign={campaign}"', page_html)


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
{og}{POSTHOG}<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site"><div class="bar"><a class="brand" href="/">Another You<span>Guides</span></a><a href="https://app.anotheryou.si/library">Browse agents</a></div></header>
<main>
{main}
</main>
<footer class="site"><div class="bar"><span>{footer_text}</span>{footer_link}<a href="https://app.anotheryou.si/privacy">Privacy</a></div></footer>
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
        out.write_text(utm(page(g["title"], g["description"], main, g.get("footer", DEFAULT_FOOTER),
                                '<a href="/">All guides</a>', url, f"{SITE}/covers/{g['slug']}.png"), g["slug"]))

    items = "\n".join(f'<a href="/{g["slug"]}/"><strong>{g.get("indexTitle", g["h1"])}</strong><span>{g["indexLine"]}</span></a>' for g in guides)
    main = ('<h1>What everybody ought to know before it costs them money</h1>\n'
            '<p class="dek">Free, plain guides. No sign up to read them, nothing to buy at the end.</p>\n'
            f'<div class="list">\n{items}\n</div>')
    (DIST / "index.html").write_text(utm(page("Another You Guides", "Plain guides for the moments that cost you money: rent deposits, stuck refunds, recovery agents, unpaid invoices, hospital claims.",
                                          main, "Another You publishes these guides. General information, not legal advice.",
                                          '<a href="https://app.anotheryou.si">app.anotheryou.si</a>', SITE + "/"), "home"))

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
