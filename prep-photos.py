#!/usr/bin/env python3
"""Add new photos to the Devyn Underwater gallery.

Usage:
  python3 prep-photos.py <folder-of-images> <collection-id>

  <collection-id> = an id from data/site.json → collections (e.g. bhb, coz, roa),
  or a new id — if new, add the collection entry to site.json first.

Handles JPG/PNG/HEIC and Olympus ORF raw (converted via macOS sips).
Exports web sizes into static/img/{gallery,thumbs}/, appends entries to
data/site.json → gallery with placeholder titles (EDIT THE TITLES), then:
  node build.js   → regenerates the site with the new photos everywhere.
"""
import sys, os, glob, json, subprocess, tempfile
from PIL import Image

if len(sys.argv) != 3:
    sys.exit(__doc__)
SRC, SET = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.abspath(__file__))
SITE_JSON = os.path.join(ROOT, 'data', 'site.json')
site = json.load(open(SITE_JSON))
if SET not in [c['id'] for c in site['collections']]:
    sys.exit(f"Collection '{SET}' not in data/site.json → collections. Add it there first.")

existing = [g['id'] for g in site['gallery'] if g['set'] == SET]
n = max([int(e.split('-')[1]) for e in existing], default=0)

files = sorted(sum([glob.glob(os.path.join(SRC, ext)) for ext in
                    ('*.jpg', '*.JPG', '*.jpeg', '*.png', '*.PNG', '*.heic', '*.HEIC', '*.orf', '*.ORF')], []))
if not files:
    sys.exit(f'No images found in {SRC}')

def to_jpg_source(path):
    if path.lower().endswith(('.orf', '.heic')):
        tmp = os.path.join(tempfile.gettempdir(), 'devyn-conv', os.path.basename(path) + '.jpg')
        os.makedirs(os.path.dirname(tmp), exist_ok=True)
        if not os.path.exists(tmp):
            subprocess.run(['sips', '-s', 'format', 'jpeg', path, '--out', tmp], capture_output=True)
        return tmp
    return path

def export(src, out, maxw, q=82):
    im = Image.open(src).convert('RGB')
    if im.width > maxw:
        im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.save(out, 'JPEG', quality=q, optimize=True, progressive=True)

added = []
for f in files:
    n += 1
    gid = f'{SET}-{n:02d}'
    src = to_jpg_source(f)
    export(src, os.path.join(ROOT, 'static', 'img', 'gallery', f'{gid}.jpg'), 1600)
    export(src, os.path.join(ROOT, 'static', 'img', 'thumbs', f'{gid}.jpg'), 480, 78)
    site['gallery'].append({'id': gid, 'title': f'UNTITLED — edit me ({os.path.basename(f)})', 'set': SET})
    added.append(gid)

json.dump(site, open(SITE_JSON, 'w'), indent=2)
print(f'Added {len(added)} photos to "{SET}": {", ".join(added)}')
print('1) Edit their titles in data/site.json  2) node build.js  3) redeploy site/')
