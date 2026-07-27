#!/usr/bin/env python3
"""CI/local photo prep — runs before build.js. Pure PIL, any OS.

Photos live in content/photos/<id>.json (id = filename). A photo added through
the CMS carries an `image` field (upload in uploads/); this script generates
the missing web exports for it (gallery 1600px, thumb 480px, hero 1920px when
heroOrder is set) and validates references. Nothing here is committed — it
runs identically in CI and locally.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
PDIR = os.path.join(ROOT, 'content', 'photos')
site = json.load(open(os.path.join(ROOT, 'data', 'site.json')))

def export(src, out, maxw, q=82):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im = Image.open(src).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=q, optimize=True, progressive=True)

valid_sets = {c['id'] for c in site.get('collections', [])}
made, ids = 0, set()
for f in sorted(os.listdir(PDIR)):
    if not f.endswith('.json'):
        continue
    pid = f[:-5]
    ids.add(pid)
    p = json.load(open(os.path.join(PDIR, f)))
    gal = os.path.join(ROOT, 'static', 'img', 'gallery', f'{pid}.jpg')
    th = os.path.join(ROOT, 'static', 'img', 'thumbs', f'{pid}.jpg')
    hero = os.path.join(ROOT, 'static', 'img', 'hero', f'{pid}.jpg')
    src = None
    if p.get('image'):
        cand = os.path.join(ROOT, p['image'].lstrip('/'))
        if os.path.exists(cand):
            src = cand
        else:
            print(f'WARN: {pid}: upload missing: {p["image"]}', file=sys.stderr)
    if not os.path.exists(gal):
        if src:
            export(src, gal, 1600); made += 1
        else:
            print(f'WARN: {pid}: no gallery image and no upload — photo will 404', file=sys.stderr)
    if not os.path.exists(th) and (src or os.path.exists(gal)):
        export(src or gal, th, 480, 78); made += 1
    if p.get('heroOrder') and not os.path.exists(hero) and (src or os.path.exists(gal)):
        export(src or gal, hero, 1920, 80); made += 1
    if p.get('set') not in valid_sets and not p.get('standalone'):
        print(f'WARN: {pid}: unknown collection "{p.get("set")}"', file=sys.stderr)

for k, v in site.get('homeImages', {}).items():
    if v not in ids:
        print(f'WARN: homeImages.{k} references unknown photo "{v}"', file=sys.stderr)
print(f'prep-ci: {len(ids)} photos, {made} new exports')
