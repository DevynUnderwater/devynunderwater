#!/usr/bin/env python3
"""Transform site/ → site-preview/ for subpath staging hosts (GitHub Pages).
Prefixes absolute URLs, injects noindex, blocks robots. Usage:
  python3 preview-build.py [/base-path]     (default /devynunderwater)
"""
import os, re, shutil, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
PREFIX = sys.argv[1] if len(sys.argv) > 1 else '/devynunderwater'
SRC, DST = os.path.join(ROOT, 'site'), os.path.join(ROOT, 'site-preview')

git = os.path.join(DST, '.git')
tmpgit = os.path.join(ROOT, '.preview-git-stash')
if os.path.exists(git):
    shutil.move(git, tmpgit)
shutil.rmtree(DST, ignore_errors=True)

for root, dirs, files in os.walk(SRC):
    rel = os.path.relpath(root, SRC)
    out = os.path.join(DST, rel) if rel != '.' else DST
    os.makedirs(out, exist_ok=True)
    for f in files:
        if f in ('sitemap.xml', 'llms.txt', '_redirects', '_headers', 'robots.txt'):
            continue
        s, d = os.path.join(root, f), os.path.join(out, f)
        if f.endswith('.html'):
            h = open(s).read()
            h = re.sub(r'(href|src|action)="/(?!/)', rf'\1="{PREFIX}/', h)
            h = h.replace('data-full="/assets', f'data-full="{PREFIX}/assets')
            if '<meta name="robots"' not in h:
                h = h.replace('<meta name="viewport"',
                              '<meta name="robots" content="noindex, nofollow">\n<meta name="viewport"', 1)
            open(d, 'w').write(h)
        else:
            shutil.copy2(s, d)

open(os.path.join(DST, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
open(os.path.join(DST, '.nojekyll'), 'w').write('')
if os.path.exists(tmpgit):
    shutil.move(tmpgit, git)
print(f'site-preview/ ready (prefix {PREFIX}, noindexed)')
