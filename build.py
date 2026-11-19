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


# Carry where the reader came from (an Instagram or Facebook post's utm_source and utm_campaign) onto every app link as
# utm_content, e.g. "instagram.ombudsman-90", and onto the opt-in's utm field. sessionStorage keeps it across the
# opt-in's redirect to /thanks/. ponytail: first tag in the tab wins; nothing for readers who arrive untagged.
CARRY = ("<script>(function(){var q=new URLSearchParams(location.search),s=q.get('utm_source'),t;"
         "try{if(s&&s!=='blog'){t=(s+'.'+(q.get('utm_campaign')||'')).replace(/[^\\w.-]/g,'').slice(0,60);"
         "sessionStorage.setItem('ay_from',t)}else t=sessionStorage.getItem('ay_from')}catch(e){}"
         "if(!t)return;document.querySelectorAll('a[href^=\"https://app.anotheryou.si\"]').forEach(function(a){"
         "var u=new URL(a.href);u.searchParams.set('utm_content',t);a.href=u});"
         "var i=document.querySelector('input[name=utm]');if(i&&i.value==='blog')i.value='blog.'+t})();</script>\n")

def utm(page_html, campaign):
    """Tag every link into the app, so PostHog's utm_* properties say which guide sent the visitor."""
    return re.sub(r'href="(https://app\.anotheryou\.si[^"?]*)"',
                  rf'href="\1?utm_source=blog&amp;utm_medium=guide&amp;utm_campaign={campaign}"', page_html)


LEADS_URL = "https://quick-giraffe-792.convex.site/leads"  # Another You prod Convex; convex/leads.ts in the app repo


def optin(g):
    """The opt-in block (Sell Like Crazy): headline, subheadline, fascination bullets, the kit's cover, a 2 field form.
    Plain POST, no JS: Convex answers with a 303 to /thanks/ or back here with #optin-error."""
    if "optinH" not in g:
        return ""
    bullets = "".join(f"<li>{b}</li>" for b in g["optinBullets"])
    return f'''<div class="optin" id="optin">
<p class="optin-tag">Free download</p>
<h2>{g["optinH"]}</h2>
<p class="optin-sub">{g["optinSub"]}</p>
<div class="optin-grid">
<img src="/kits/{g["slug"]}.png" alt="Page 1 of the free kit" width="298" height="421" loading="lazy">
<div>
<ul class="fasc">{bullets}</ul>
<p id="optin-error" class="optin-error">That email doesn't look right. Check it and try again.</p>
<form method="post" action="{LEADS_URL}">
<input type="hidden" name="guide" value="{g["slug"]}">
<input type="hidden" name="utm" value="blog">
<label>First name<input name="name" required maxlength="80" autocomplete="given-name"></label>
<label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
<label>WhatsApp number <span>(optional)</span><input name="whatsapp" type="tel" maxlength="20" autocomplete="tel" inputmode="tel"></label>
<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
<button class="btn" type="submit">Send me the free kit</button>
<p class="consent">We'll email you the PDF and, now and then, another free guide like this one. Reply STOP to any email and we stop. Your WhatsApp number is optional and never shared.</p>
</form>
</div>
</div>
</div>'''


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
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{og}{POSTHOG}<link rel="stylesheet" href="/style.css">
</head>
<body>
<header class="site"><div class="bar"><a class="brand" href="/">Another You<span>Guides</span></a><a href="https://app.anotheryou.si/library">Browse agents</a></div></header>
<main>
{main}
</main>
<footer class="site"><div class="bar"><span>{footer_text}</span>{footer_link}<a href="https://app.anotheryou.si/privacy">Privacy</a></div></footer>
{CARRY}</body>
</html>
"""


def build():
    guides = sorted((read_guide(p) for p in (ROOT / "src/content/guides").glob("*.md")), key=lambda g: g["order"])
    shutil.rmtree(DIST, ignore_errors=True)
    shutil.copytree(ROOT / "public", DIST)

    for g in guides:
        url = f"{SITE}/{g['slug']}/"
        main = ('<span class="warn">WARNING</span>\n' if g.get("warn") else "") + \
            f'<h1>{g["h1"]}</h1>\n<p class="dek">{g["dek"]}</p>\n\n{g["body"].replace("<!--optin-->", optin(g))}'
        out = DIST / g["slug"] / "index.html"
        out.parent.mkdir(parents=True)
        out.write_text(utm(page(g["title"], g["description"], main, g.get("footer", DEFAULT_FOOTER),
                                '<a href="/">All guides</a>', url, f"{SITE}/covers/{g['slug']}.png"), g["slug"]))

    items = "\n".join(f'<a href="/{g["slug"]}/"><strong>{g.get("indexTitle", g["h1"])}</strong><span>{g["indexLine"]}</span></a>' for g in guides)
    main = ('<h1>What everybody ought to know before it costs them money</h1>\n'
            '<p class="dek">Free, plain guides. No sign up to read them, nothing to buy at the end.</p>\n'
            f'<div class="list">\n{items}\n</div>')
    (DIST / "index.html").write_text(utm(page("Another You Guides", "Plain guides for the moments that cost you money: cyber fraud, bank complaints, resumes, rent deposits, stuck refunds, recovery agents, unpaid invoices, hospital claims.",
                                          main, "Another You publishes these guides. General information, not legal advice.",
                                          '<a href="https://app.anotheryou.si">app.anotheryou.si</a>', SITE + "/"), "home"))

    thanks = ('<h1>Check your inbox</h1>\n<p class="dek">Your free kit is on its way. It usually lands within a minute; if it doesn\'t, look in Promotions or Spam and drag it to your inbox, so the next one arrives too.</p>\n'
              '<p>While you wait, the other guides:</p>\n'
              f'<div class="list">\n{items}\n</div>')
    (DIST / "thanks").mkdir()
    # one thank-you page per guide: the Godfather offer for that guide's agent (Sell Like Crazy). AYOU-87.
    for g in guides:
        if "thanksH" not in g:
            continue
        offer = (f'<h1>Check your inbox</h1>\n<p class="dek">Your free kit is on its way. It usually lands within a minute; if it doesn\'t, look in Promotions or Spam and drag it to your inbox, so the next one arrives too.</p>\n'
                 f'<div class="cta">\n<h2>{g["thanksH"]}</h2>\n<p>{g["thanksText"]}</p>\n'
                 f'<a class="btn" href="https://app.anotheryou.si/a/{g["agent"]}">{g["thanksBtn"]}</a>\n<p style="margin-top:16px">Why 100 Credits free? One finished document shows you more than any page we could write.</p>\n</div>\n' +
                 (f'<p><b>P.S.</b> {g["thanksPS"]}</p>\n' if g.get("thanksPS") else '') +
                 f'<p style="margin-top:32px">Or read another guide:</p>\n<div class="list">\n{items}\n</div>')
        out = DIST / "thanks" / g["slug"] / "index.html"
        out.parent.mkdir(parents=True)
        out.write_text(utm(page("Check your inbox", "Your free kit is on its way.", offer, DEFAULT_FOOTER, '<a href="/">All guides</a>',
                                f"{SITE}/thanks/{g['slug']}/"), "thanks-" + g["slug"]).replace(
                                "<meta name=\"description\"", "<meta name=\"robots\" content=\"noindex\">\n<meta name=\"description\""))
    (DIST / "thanks" / "index.html").write_text(page("Check your inbox", "Your free kit is on its way.", thanks,
                                                     DEFAULT_FOOTER, '<a href="/">All guides</a>', SITE + "/thanks/").replace(
                                                     "<meta name=\"description\"", "<meta name=\"robots\" content=\"noindex\">\n<meta name=\"description\""))

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
