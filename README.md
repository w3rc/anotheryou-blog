# blog.anotheryou.si

Free guides for Another You's dream buyers (the HVCO tab of the HALO Sheet).

- A guide is one file in `src/content/guides/<slug>.md`: a front matter block (`title`, `description`, `h1`, `dek`, `warn`, `order`, `indexLine`, `date`, optional `indexTitle`, `footer`) and a body of raw HTML, the same markup the other guides use.
- Its cover goes in `public/covers/<slug>.png` (1400 x 735).
- `python3 build.py` writes `dist/`: every guide page, the home list, `sitemap.xml` and `rss.xml`. Vercel runs the same command.
- After a new guide is live, ping IndexNow with its URL (the key file is in `public/`).

Every claim gets a primary source in the guide's "Sources, checked <date>" list.
