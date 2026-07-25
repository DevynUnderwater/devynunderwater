#!/usr/bin/env python3
"""CI/local photo prep — runs before build.js. Pure PIL, works on any OS.

Handles photos added through the CMS: a gallery entry may carry an `image`
field (a file in uploads/, saved by the /admin/ editor). For each such entry
this script derives a stable id from the filename, generates the web exports
(static/img/gallery/<id>.jpg 1600px + static/img/thumbs/<id>.jpg 480px),
and resolves the entry to {id, title, set} in the working copy of site.json
(never committed — the repo keeps the CMS's original shape).

Also validates that featured/homeImages/heroSlides reference existing ids
(bad refs are dropped with a warning instead of breaking the build), and
generates hero exports for heroSlides that lack one.
"""
import json, os, re, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SITE_JSON = os.path.join(ROOT, 'data', 'site.json')
site = json.load(open(SITE_JSON))

def slugify(name):
    base = os.path.splitext(os.path.basename(name))[0].lower()
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', base)).strip('-')[:48] or 'photo'

def export(src, out, maxw, q=82):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(src).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=q, optimize=True, progressive=True)

ids = set()
changed = 0
for g in site.get('gallery', []):
    img = g.get('image')
    if img and not g.get('id'):
        gid = slugify(img)
        n, base = 2, gid
        while gid in ids:
            gid, n = f'{base}-{n}', n + 1
        g['id'] = gid
    gid = g.get('id')
    if not gid:
        print(f'WARN: gallery entry missing id and image, skipped: {g.get("title")}', file=sys.stderr)
        continue
    ids.add(gid)
    if img:
        src = os.path.join(ROOT, img.lstrip('/'))
        if os.path.exists(src):
            gal = os.path.join(ROOT, 'static', 'img', 'gallery', f'{gid}.jpg')
            th = os.path.join(ROOT, 'static', 'img', 'thumbs', f'{gid}.jpg')
            if not os.path.exists(gal):
                export(src, gal, 1600); changed += 1
            if not os.path.exists(th):
                export(src, th, 480, 78)
        else:
            print(f'WARN: upload not found: {img}', file=sys.stderr)

site['gallery'] = [g for g in site.get('gallery', []) if g.get('id')]

valid_sets = {c['id'] for c in site.get('collections', [])}
for g in site['gallery']:
    if g.get('set') not in valid_sets:
        print(f'WARN: {g["id"]} has unknown collection "{g.get("set")}" — assigning first collection', file=sys.stderr)
        g['set'] = site['collections'][0]['id']

def clean_refs(lst, label):
    kept = [i for i in lst if i in ids]
    for bad in set(lst) - set(kept):
        print(f'WARN: {label} references unknown photo id "{bad}" — dropped', file=sys.stderr)
    return kept

site['featured'] = clean_refs(site.get('featured', []), 'featured') or [g['id'] for g in site['gallery'][:8]]
site['heroSlides'] = clean_refs(site.get('heroSlides', []), 'heroSlides') or [g['id'] for g in site['gallery'][:6]]
for k, v in list(site.get('homeImages', {}).items()):
    if v not in ids:
        fallback = site['gallery'][0]['id']
        print(f'WARN: homeImages.{k} references unknown id "{v}" — using {fallback}', file=sys.stderr)
        site['homeImages'][k] = fallback
for p in site.get('products', []):
    if p.get('img') not in ids:
        print(f'WARN: product "{p.get("slug")}" references unknown photo "{p.get("img")}" — removed', file=sys.stderr)
site['products'] = [p for p in site.get('products', []) if p.get('img') in ids]

# hero exports for any slide missing one (from gallery export, already web-sized)
for sid in site['heroSlides']:
    hero = os.path.join(ROOT, 'static', 'img', 'hero', f'{sid}.jpg')
    gal = os.path.join(ROOT, 'static', 'img', 'gallery', f'{sid}.jpg')
    if not os.path.exists(hero) and os.path.exists(gal):
        export(gal, hero, 1920, 80); changed += 1

json.dump(site, open(SITE_JSON, 'w'), indent=2)
print(f'prep-ci: {len(site["gallery"])} gallery entries, {changed} new exports')
