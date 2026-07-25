# Devyn Underwater — devynunderwater.com

Static rebuild + upgrade of the unfinished Wix Studio site. 15 pages: home, about,
photography (interactive gallery), shop + 8 product pages, contact, privacy, 404.

## Structure
```
build.js          node build.js → regenerates site/
data/site.json    ALL content: copy, gallery manifest, collections, products, FAA config
static/           css/js/img sources (img holds web-exported photos)
prep-photos.py    add new photos: python3 prep-photos.py <folder> <collection-id>
site/             DEPLOYABLE OUTPUT
capture/          crawl of the Wix site (reference)
reference/        original Wix assets + contact sheets
qa/               QA screenshots
```
Preview locally: `cd site && python3 -m http.server 8790` (left running).

## What was built vs the Wix site
- Wix site was ~15% done: real hero line + logo only; About/Contact were template filler; the
  "Photography" nav pointed to an untouched **"Investment Strategies"** template page; socials
  linked to WixStudio's own accounts; homepage imagery was Wix stock (not Devyn's work).
- Rebuild keeps the design language (cream/teal/sand/ink, Avenir type, script logo, outlined
  buttons) and replaces every stock image with **26 of Devyn's real photos**, curated from the
  ~2,000-file library on the Desktop (Blue Heron Bridge / Cozumel / Roatán 2023).
- **Interactive gallery**: collection filters, full-screen lightbox (keyboard + swipe),
  scroll reveals, Ken Burns hero, horizontal film strip. All motion respects reduced-motion.
- **Print shop**: our own grid + product pages (stories, media options, Product schema),
  fulfilled by Fine Art America (see below).

## Fine Art America integration (researched 2026-07-24)
- FAA has **no public API** for custom storefronts (partner-only). Scraping prices violates their ToS.
- **Deep links work**: `fineartamerica.com/featured/{slug}.html?product=canvas-print|metal-print|framed-print|acrylic-print` preselects the medium. Product pages have per-medium buy buttons wired to these.
- **On-site checkout** is available via FAA's iframe shopping-cart widget (requires FAA **Premium**, ~$30/yr; generated in the artist account under Behind the Scenes → Marketing → Shopping Cart Widgets, keyed by member id).

### To activate the shop (needs Devyn's FAA account)
1. Create/log into her FAA account; upload the shop images; set her prices.
2. Put her artist URL in `data/site.json → faa.artistUrl`.
3. For each product, paste its FAA artwork URL into `products[].faaUrl` → buy buttons go live.
4. Optional (Premium): grab the iframe cart widget code + member id for fully on-site checkout — swap into the shop page when ready.

## Adding photos (Devyn has more coming)
```
python3 prep-photos.py ~/path/to/new-trip-folder coz     # or bhb / roa / new id
# edit the new titles in data/site.json, then:
node build.js
```
Handles JPG/HEIC/ORF (raw converted via macOS sips). New photos appear in the gallery,
filters, and lightbox automatically. New collection? Add it to `collections` first —
filter buttons and About-page dive log update themselves.

## Before launch (client/Kevin)
- [ ] Devyn's real email → `site.json → email` (contact form: Netlify Forms — activates on Netlify deploy; submissions land in the Netlify dashboard + email notification)
- [ ] Devyn's socials → `site.json → socials` (footer renders them automatically)
- [ ] Review photo TITLES + species names in `site.json → gallery` (I labeled conservatively — she'll know her subjects)
- [ ] Review draft copy (hero sub, about, product stories) — written in her voice, flagged for her edit
- [ ] FAA activation steps above
- [ ] Domain: devynunderwater.com currently shows a GoDaddy "Launching Soon" page — the domain appears to be in a GoDaddy account (check which); point it at the new host at launch
