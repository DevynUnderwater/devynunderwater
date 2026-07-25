#!/usr/bin/env node
/* Devyn Underwater — static site generator. Usage: node build.js → ./site */
const fs = require('fs');
const path = require('path');

const SITE = require('./data/site.json');

/* photos: one JSON file per photo in content/photos/ (id = filename) */
const PHOTOS_DIR = path.join(__dirname, 'content', 'photos');
const PHOTOS = fs.readdirSync(PHOTOS_DIR).filter(f => f.endsWith('.json')).map(f => ({
  id: f.replace(/\.json$/, ''),
  ...JSON.parse(fs.readFileSync(path.join(PHOTOS_DIR, f)))
})).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id));

SITE.gallery = PHOTOS.map(p => ({ id: p.id, title: p.title, set: p.set }));
SITE.heroSlides = PHOTOS.filter(p => p.heroOrder).sort((a, b) => a.heroOrder - b.heroOrder).map(p => p.id);
SITE.featured = PHOTOS.filter(p => p.featuredOrder).sort((a, b) => a.featuredOrder - b.featuredOrder).map(p => p.id);
SITE.products = PHOTOS.filter(p => p.forSale).sort((a, b) => (a.saleOrder ?? 999) - (b.saleOrder ?? 999)).map(p => ({
  slug: p.slug || p.id,
  img: p.id,
  title: p.title,
  story: p.story || `${p.title} — an original underwater photograph by Devyn, available as a museum-quality print.`,
  faaUrl: p.faaUrl || ''
}));
const OUT = path.join(__dirname, 'site');
const DOMAIN = SITE.domain;
const YEAR = 2026;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function write(rel, html) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
  console.log('  wrote', rel);
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    e.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
const crypto = require('crypto');
const hashOf = f => crypto.createHash('md5').update(fs.readFileSync(path.join(__dirname, f))).digest('hex').slice(0, 8);
const CSS_V = hashOf('static/css/styles.css');
const JS_V = hashOf('static/js/main.js');


/* editable text layer: every visible string lives in data/text.json.
 * t() renders a bound editable span; new keys are auto-added on build. */
const TEXT_FILE = path.join(__dirname, 'data', 'text.json');
const TEXT = fs.existsSync(TEXT_FILE) ? JSON.parse(fs.readFileSync(TEXT_FILE)) : {};
let TEXT_DIRTY = false;
const t = (key, def) => {
  if (!(key in TEXT)) { TEXT[key] = def; TEXT_DIRTY = true; }
  return `<span data-edit="text:${key}">${esc(TEXT[key])}</span>`;
};

const galleryById = Object.fromEntries(SITE.gallery.map(g => [g.id, g]));
const setName = id => (SITE.collections.find(c => c.id === id) || {}).name || id;

/* FAA deep-link helper: verified ?product= values only */
const FAA_MEDIA = [
  { label: 'Fine art paper', param: '' },
  { label: 'Canvas', param: 'canvas-print' },
  { label: 'Metal', param: 'metal-print' },
  { label: 'Acrylic', param: 'acrylic-print' },
  { label: 'Framed', param: 'framed-print' }
];
const faaLink = (p, param) => p.faaUrl ? (param ? `${p.faaUrl}${p.faaUrl.includes('?') ? '&' : '?'}product=${param}` : p.faaUrl) : '';

/* ---------------- schema ---------------- */
const PERSON_ID = DOMAIN + '/#devyn';
const personSchema = () => ({
  '@type': 'Person',
  '@id': PERSON_ID,
  name: 'Devyn',
  alternateName: 'Devyn Underwater',
  url: DOMAIN + '/',
  jobTitle: 'Underwater macro photographer',
  description: 'Underwater macro photographer shooting Blue Heron Bridge (Florida), Cozumel, Roatán, and beyond.',
  sameAs: Object.values(SITE.socials).filter(Boolean)
});
const webSiteSchema = () => ({ '@type': 'WebSite', '@id': DOMAIN + '/#website', url: DOMAIN + '/', name: SITE.name });
const breadcrumb = items => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it[0], item: DOMAIN + it[1] }))
});

/* ---------------- chrome ---------------- */
const NAV = [
  ['Home', '/'],
  ['About', '/about/'],
  ['Photography', '/photography/'],
  ['Shop Prints', '/shop/'],
  ['Contact', '/contact/']
];
function header(active) {
  return `<header class="site-header">
  <div class="container bar">
    <a class="logo" href="/" aria-label="Devyn Underwater — home"><img src="/assets/img/logo-white.png" alt="Devyn Underwater" width="160" height="100"></a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu"><span class="ham"></span></button>
    <nav id="site-nav" class="site-nav" aria-label="Main">
      <ul>
        ${NAV.slice(0, 4).map(([l, h], i) => `<li><a href="${h}"${h === active ? ' aria-current="page"' : ''}>${t('nav.' + i, l)}</a></li>`).join('')}
        <li><a class="nav-cta" href="/contact/"${active === '/contact/' ? ' aria-current="page"' : ''}>${t('nav.cta', 'Contact')}</a></li>
      </ul>
    </nav>
  </div>
</header>`;
}
function footer() {
  const socials = Object.entries(SITE.socials).filter(([, v]) => v);
  return `<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        <h4>${t('footer.explore', 'Explore')}</h4>
        <ul>${NAV.map(([l, h], i) => `<li><a href="${h}">${t('nav.' + i, l)}</a></li>`).join('')}</ul>
      </div>
      <div>
        <h4>${t('footer.elsewhere', 'Elsewhere')}</h4>
        <ul>
          ${socials.length ? socials.map(([k, v]) => `<li><a href="${v}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a></li>`).join('') : '<li><span style="opacity:.6">Social links coming soon</span></li>'}
          ${SITE.faa.artistUrl ? `<li><a href="${SITE.faa.artistUrl}" target="_blank" rel="noopener">Fine Art America</a></li>` : ''}
        </ul>
      </div>
      <div class="footer-logo"><img src="/assets/img/logo-white.png" alt="" loading="lazy" width="300" height="188"></div>
    </div>
    <div class="footer-legal">
      <span>${t('footer.legal', `© ${YEAR} Devyn Underwater · All images are the photographer's original work`)}</span>
      <a href="/privacy-policy/">${t('footer.privacy', 'Privacy Policy')}</a>
    </div>
  </div>
</footer>`;
}
function layout({ slug, title, description, schema = [], body, extraHead = '' }) {
  const url = DOMAIN + slug;
  const graph = { '@context': 'https://schema.org', '@graph': [personSchema(), ...(slug === '/' ? [webSiteSchema()] : []), ...schema] };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${DOMAIN}/assets/img/hero.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Mulish:wght@300;500;800&display=swap">
<link rel="stylesheet" href="/assets/css/styles.css?v=${CSS_V}">
${extraHead}
<script type="application/ld+json">${JSON.stringify(graph)}</script>
</head>
<body>
<script>document.documentElement.classList.add('js')</script>
<a class="skip-link" href="#main">Skip to content</a>
${header(slug)}
<main id="main">
${body}
</main>
${footer()}
<div class="lightbox" id="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer">
  <button class="lb-close" type="button" aria-label="Close">×</button>
  <button class="lb-btn lb-prev" type="button" aria-label="Previous photo">‹</button>
  <img src="" alt="">
  <button class="lb-btn lb-next" type="button" aria-label="Next photo">›</button>
  <p class="lb-cap"></p>
</div>
<script src="/assets/js/main.js?v=${JS_V}" defer></script>
</body>
</html>`;
}

/* ---------------- components ---------------- */
const tile = (g, i) => `<button class="tile reveal${i % 3 === 1 ? ' reveal-d1' : i % 3 === 2 ? ' reveal-d2' : ''}" type="button" data-set="${g.set}" data-full="/assets/img/gallery/${g.id}.jpg" data-title="${esc(g.title)} — ${esc(setName(g.set))}">
  <img data-edit-img="${g.id}" src="/assets/img/thumbs/${g.id}.jpg" alt="${esc(g.title)} — underwater photo from ${esc(setName(g.set))}" loading="lazy" width="480" height="360">
  <span class="tile-cap" data-edit="photo:${g.id}:title">${esc(g.title)}</span>
</button>`;

function filmStrip(ids, cls) {
  return `<div class="strip-wrap ${cls || ''}">
    <div class="strip" tabindex="0" aria-label="Photo strip — scroll horizontally">
      ${ids.map(id => {
        const g = galleryById[id];
        return `<a href="/photography/#${id}"><figure style="margin:0"><img data-edit-img="${id}" src="/assets/img/gallery/${id}.jpg" alt="${esc(g.title)}" loading="lazy"><figcaption data-edit="photo:${id}:title">${esc(g.title)}</figcaption></figure></a>`;
      }).join('')}
    </div>
    <div class="strip-nav">
      <button class="strip-prev" type="button" aria-label="Scroll photos left">‹</button>
      <button class="strip-next" type="button" aria-label="Scroll photos right">›</button>
    </div>
  </div>`;
}

/* ---------------- pages ---------------- */
function homePage() {
  const body = `
<section class="hero">
  <div class="hero-media">
    ${SITE.heroSlides.map((id, i) => `<div class="slide${i === 0 ? ' active' : ''}"><img data-edit-img="${id}" src="/assets/img/hero/${id}.jpg" alt="${esc(galleryById[id].title)} — underwater macro photograph" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></div>`).join('')}
  </div>
  <div class="container">
    <h1 class="reveal in" data-edit="site:heroLine">${esc(SITE.heroLine)}</h1>
    <p class="lede reveal in reveal-d1" data-edit="site:heroSub">${esc(SITE.heroSub)}</p>
    <div class="btn-row reveal in reveal-d2">
      <a class="btn btn-light" href="/photography/">${t('home.hero.btn1', 'View the work')}</a>
      <a class="btn btn-light" href="/shop/">${t('home.hero.btn2', 'Shop prints')}</a>
    </div>
  </div>
  <span class="scroll-cue" aria-hidden="true">${t('home.hero.cue', 'Dive in ↓')}</span>
</section>

<section class="section section-teal">
  <div class="container split">
    <div class="reveal">
      <div class="kicker">${t('home.history.kicker', 'My history')}</div>
      <h2>${t('home.history.h2', 'Small subjects. Big obsession.')}</h2>
      <p data-edit="site:copy.aboutTeaser">${esc(SITE.copy.aboutTeaser)}</p>
      <a class="btn btn-light" href="/about/">${t('home.history.btn', 'More about me')}</a>
    </div>
    <div class="media reveal reveal-d1"><img data-edit-img="${SITE.homeImages.history}" src="/assets/img/gallery/${SITE.homeImages.history}.jpg" alt="${esc(galleryById[SITE.homeImages.history].title)} — underwater macro photo" loading="lazy" width="800" height="600"></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="reveal"><div class="kicker">${t('home.feat.kicker', 'Featured work')}</div><h2>${t('home.feat.h2', 'From the last three logbooks')}</h2></div>
    ${filmStrip(SITE.featured, 'reveal reveal-d1')}
    <div class="reveal reveal-d2" style="margin-top:1rem"><a class="btn btn-dark" href="/photography/">${t('home.feat.btn', 'Browse the full gallery')}</a></div>
  </div>
</section>

<section class="section section-ink">
  <div class="container split">
    <div class="media reveal"><img data-edit-img="${SITE.homeImages.shop}" src="/assets/img/gallery/${SITE.homeImages.shop}.jpg" alt="${esc(galleryById[SITE.homeImages.shop].title)} — available as a print" loading="lazy" width="800" height="600"></div>
    <div class="reveal reveal-d1">
      <div class="kicker">${t('home.prints.kicker', 'Prints')}</div>
      <h2>${t('home.prints.h2', 'Take the ocean home')}</h2>
      <p>${t('home.prints.p', 'Select works are available as museum-quality prints — paper, canvas, metal, and acrylic — made to order and shipped worldwide by my print partner, Fine Art America.')}</p>
      <a class="btn btn-light" href="/shop/">${t('home.hero.btn2', 'Shop prints')}</a>
    </div>
  </div>
</section>

<section class="section section-sand">
  <div class="container split">
    <div class="reveal">
      <div class="kicker">${t('home.contact.kicker', 'Say hello')}</div>
      <h2>${t('home.contact.h2', 'Thank you for diving in')}</h2>
      <p>${t('home.contact.p', "Questions about a print, a photo, or a dive site? I'd love to hear from you.")}</p>
      <a class="btn btn-dark" href="/contact/">${t('home.contact.btn', 'Get in touch')}</a>
    </div>
    <div class="media reveal reveal-d1"><img data-edit-img="${SITE.homeImages.contact}" src="/assets/img/gallery/${SITE.homeImages.contact}.jpg" alt="${esc(galleryById[SITE.homeImages.contact].title)}" loading="lazy" width="800" height="600"></div>
  </div>
</section>`;
  write('index.html', layout({
    slug: '/',
    title: 'Devyn Underwater | Underwater Macro Photography & Prints',
    description: 'Underwater macro photography from Blue Heron Bridge, Cozumel, and Roatán — and museum-quality prints of select works. Discover the secrets of the ocean.',
    body
  }));
}

function aboutPage() {
  const crumbs = [['Home', '/'], ['About', '/about/']];
  const body = `
<div class="page-hero"><div class="container">
  <div class="kicker">${t('about.kicker', 'About')}</div>
  <h1>${t('about.h1', 'The diver behind the lens')}</h1>
</div></div>
<section class="section">
  <div class="container split">
    <div class="prose reveal">
      <p data-edit="site:copy.aboutLong">${esc(SITE.copy.aboutLong)}</p>
      <p>${t('about.p2', "Macro photography rewards patience more than luck: hovering still enough, long enough, for a shrimp to go back to work or a frogfish to forget you exist. That's the part I love — the ocean carries on like you're not there, and every so often it lets you keep a frame of it.")}</p>
      <p>${t('about.p3a', 'Everything on this site was shot by me, on dives I logged. If you want to know the story behind a photo — or the dive site —')} <a href="/contact/">${t('about.p3link', 'ask')}</a>.</p>
    </div>
    <div class="media reveal reveal-d1"><img data-edit-img="${SITE.homeImages.aboutMedia}" src="/assets/img/gallery/${SITE.homeImages.aboutMedia}.jpg" alt="${esc(galleryById[SITE.homeImages.aboutMedia].title)} — underwater macro photo" loading="lazy" width="800" height="600"></div>
  </div>
</section>
<section class="section section-teal">
  <div class="container">
    <div class="reveal"><div class="kicker">${t('about.log.kicker', 'Dive log')}</div><h2>${t('about.log.h2', 'Where the work comes from')}</h2></div>
    <div class="split" style="grid-template-columns:repeat(3,1fr);align-items:start" >
      ${SITE.collections.map((c, i) => `<div class="reveal reveal-d${i + 1}">
        <img data-edit-img="${SITE.gallery.find(g => g.set === c.id).id}" src="/assets/img/thumbs/${SITE.gallery.find(g => g.set === c.id).id}.jpg" alt="${esc(c.name)} underwater photo" loading="lazy" width="480" height="360" style="box-shadow:var(--shadow);margin-bottom:.9rem">
        <h3><span data-edit="site:collections.${i}.name">${esc(c.name)}</span></h3>
        <p style="font-size:.9rem;opacity:.85">${esc(c.where ? c.where + ' · ' : '')}${c.year}</p>
        <p data-edit="site:collections.${i}.blurb">${esc(c.blurb)}</p>
      </div>`).join('')}
    </div>
  </div>
</section>`;
  write('about/index.html', layout({
    slug: '/about/',
    title: 'About Devyn | Underwater Macro Photographer',
    description: "Meet Devyn — an underwater macro photographer shooting Florida's Blue Heron Bridge, Cozumel, and Roatán. The diver, the gear, and the obsession with small things.",
    schema: [breadcrumb(crumbs)],
    body
  }));
}

function photographyPage() {
  const crumbs = [['Home', '/'], ['Photography', '/photography/']];
  const body = `
<div class="page-hero dark"><div class="container">
  <div class="kicker">${t('gal.kicker', 'The gallery')}</div>
  <h1>${t('gal.h1', 'Photography')}</h1>
  <p class="lede">${t('gal.lede', 'Three seasons of macro diving — frogfish, nudibranchs, pygmy seahorses, and the rest of the small universe. Click any photo to view it full screen; new work lands after every trip.')}</p>
</div></div>
<section class="section">
  <div class="container">
    <div class="filter-bar" role="group" aria-label="Filter by collection">
      <button type="button" data-set="all" aria-pressed="true">All</button>
      ${SITE.collections.map(c => `<button type="button" data-set="${c.id}" aria-pressed="false">${esc(c.name)}</button>`).join('')}
    </div>
    <div class="gallery">
      ${SITE.gallery.map((g, i) => tile(g, i)).join('')}
    </div>
    <p class="notice" style="margin-top:2rem">${t('gal.notice.pre', 'Like one of these on your wall? Select works are available as')} <a href="/shop/">${t('gal.notice.link1', 'prints')}</a> ${t('gal.notice.mid', "— and if the one you want isn't in the shop yet,")} <a href="/contact/">${t('gal.notice.link2', 'ask me')}</a>.</p>
  </div>
</section>`;
  write('photography/index.html', layout({
    slug: '/photography/',
    title: 'Underwater Photo Gallery | Devyn Underwater',
    description: 'Underwater macro photography gallery: frogfish, nudibranchs, pygmy seahorses, morays, and the small life of the reef — three seasons of diving.',
    schema: [breadcrumb(crumbs), {
      '@type': 'ImageGallery',
      name: 'Devyn Underwater — photo gallery',
      url: DOMAIN + '/photography/',
      author: { '@id': PERSON_ID }
    }],
    body
  }));
}

function shopPage() {
  const crumbs = [['Home', '/'], ['Shop Prints', '/shop/']];
  const body = `
<div class="page-hero"><div class="container">
  <div class="kicker">${t('shop.kicker', 'The print shop')}</div>
  <h1>${t('shop.h1', 'Shop prints')}</h1>
  <p class="lede" data-edit="site:copy.shopIntro">${esc(SITE.copy.shopIntro)}</p>
</div></div>
<section class="section">
  <div class="container">
    <div class="product-grid">
      ${SITE.products.map((p, i) => `<a class="product-card reveal${i % 4 ? ` reveal-d${i % 4}` : ''}" href="/shop/${p.slug}/">
        <div class="ph"><img data-edit-img="${p.img}" src="/assets/img/gallery/${p.img}.jpg" alt="${esc(p.title)} — print" loading="lazy" width="480" height="600"></div>
        <h3><span data-edit="photo:${p.img}:title">${esc(p.title)}</span></h3>
        <p>${esc(setName(galleryById[p.img].set))} · ${t('shop.card.sub', 'paper, canvas, metal & more')}</p>
      </a>`).join('')}
    </div>
    <div class="trust-row" style="margin-top:2rem">
      <span>✓ ${t('shop.trust1', 'Printed & shipped by Fine Art America')}</span>
      <span>✓ ${t('shop.trust2', '30-day money-back guarantee')}</span>
      <span>✓ ${t('shop.trust3', 'Worldwide shipping')}</span>
      <span>✓ ${t('shop.trust4', 'Secure checkout')}</span>
    </div>
  </div>
</section>`;
  write('shop/index.html', layout({
    slug: '/shop/',
    title: 'Underwater Photography Prints | Devyn Underwater',
    description: 'Museum-quality underwater photography prints — paper, canvas, metal, and acrylic. Made to order and shipped worldwide via Fine Art America.',
    schema: [breadcrumb(crumbs)],
    body
  }));
}

function productPage(p) {
  const g = galleryById[p.img];
  const crumbs = [['Home', '/'], ['Shop Prints', '/shop/'], [p.title, `/shop/${p.slug}/`]];
  const others = SITE.products.filter(x => x.slug !== p.slug).slice(0, 4);
  const hasFaa = !!p.faaUrl;
  const buyButtons = hasFaa
    ? FAA_MEDIA.map(m => `<a class="btn btn-dark" style="margin:.25rem .4rem .25rem 0" href="${faaLink(p, m.param)}" target="_blank" rel="noopener">${m.label}</a>`).join('')
    : `<p class="notice">${t('prod.pending.pre', 'Print options for this piece are being set up —')} <a href="/contact/">${t('prod.pending.link', 'contact me')}</a> ${t('prod.pending.post', 'to order it today, or check back soon.')}</p>`;
  const body = `
<div class="page-hero dark"><div class="container">
  <div class="kicker">${esc(setName(g.set))} · ${SITE.collections.find(c => c.id === g.set).year}</div>
  <h1 data-edit="photo:${p.img}:title">${esc(p.title)}</h1>
</div></div>
<section class="section">
  <div class="container split" style="align-items:start">
    <div class="media reveal"><img data-edit-img="${p.img}" src="/assets/img/gallery/${p.img}.jpg" alt="${esc(p.title)} — underwater photograph by Devyn" width="1600" height="1200"></div>
    <div class="reveal reveal-d1">
      <p data-edit="photo:${p.img}:story">${esc(p.story)}</p>
      <div class="buy-box">
        <h3 style="margin-top:0">${t('prod.available', 'Available as')}</h3>
        <ul class="media-pills">${SITE.printMedia.map((m, mi) => `<li><span data-edit="site:printMedia.${mi}">${esc(m)}</span></li>`).join('')}</ul>
        ${buyButtons}
        <div class="trust-row">
          <span>✓ ${t('prod.trust1', 'Fulfilled by Fine Art America')}</span>
          <span>✓ ${t('prod.trust2', '30-day guarantee')}</span>
          <span>✓ ${t('prod.trust3', 'Ships worldwide')}</span>
        </div>
      </div>
      <p style="margin-top:1.2rem;font-size:.9rem;opacity:.75">${t('prod.note', 'Sizes and pricing are shown at checkout on Fine Art America, my print partner. Your order supports the diving that makes the next photo possible.')}</p>
    </div>
  </div>
</section>
<section class="section section-sand">
  <div class="container">
    <div class="reveal"><div class="kicker">${t('prod.more.kicker', 'Keep looking')}</div><h2>${t('prod.more.h2', 'More prints')}</h2></div>
    <div class="product-grid">
      ${others.map(o => `<a class="product-card reveal" href="/shop/${o.slug}/">
        <div class="ph"><img data-edit-img="${o.img}" src="/assets/img/thumbs/${o.img}.jpg" alt="${esc(o.title)}" loading="lazy" width="480" height="600"></div>
        <h3><span data-edit="photo:${o.img}:title">${esc(o.title)}</span></h3>
      </a>`).join('')}
    </div>
  </div>
</section>`;
  write(`shop/${p.slug}/index.html`, layout({
    slug: `/shop/${p.slug}/`,
    title: `${p.title} — Print | Devyn Underwater`.slice(0, 65),
    description: `${p.story.slice(0, 120)} Available as a museum-quality print via Fine Art America.`.slice(0, 160),
    schema: [breadcrumb(crumbs), {
      '@type': 'Product',
      name: p.title + ' — underwater photography print',
      image: DOMAIN + `/assets/img/gallery/${p.img}.jpg`,
      description: p.story,
      brand: { '@type': 'Brand', name: 'Devyn Underwater' },
      ...(hasFaa ? { offers: { '@type': 'Offer', url: p.faaUrl, availability: 'https://schema.org/InStock' } } : {})
    }],
    body
  }));
}

function contactPage() {
  const crumbs = [['Home', '/'], ['Contact', '/contact/']];
  const body = `
<div class="page-hero"><div class="container">
  <div class="kicker">${t('contact.kicker', 'Contact')}</div>
  <h1>${t('contact.h1', 'Say hello')}</h1>
  <p class="lede">${t('contact.lede', "Prints, licensing, dive-site questions, or just to talk fish — send a note and I'll get back to you.")}</p>
</div></div>
<section class="section">
  <div class="container split" style="align-items:start">
    <form class="reveal" name="contact" method="POST" data-netlify="true" netlify-honeypot="bot-field" action="/contact/?sent=1">
      <input type="hidden" name="form-name" value="contact">
      <p style="position:absolute;left:-5000px" aria-hidden="true"><input name="bot-field" tabindex="-1"></p>
      <div class="form-grid">
        <div><label for="fn">${t('contact.fn', 'First name *')}</label><input id="fn" name="first-name" required autocomplete="given-name"></div>
        <div><label for="ln">${t('contact.ln', 'Last name *')}</label><input id="ln" name="last-name" required autocomplete="family-name"></div>
        <div class="full"><label for="em">${t('contact.em', 'Email *')}</label><input id="em" type="email" name="email" required autocomplete="email"></div>
        <div class="full"><label for="msg">${t('contact.msg', 'Message')}</label><textarea id="msg" name="message"></textarea></div>
      </div>
      <button class="btn btn-solid" type="submit" style="margin-top:1rem">${t('contact.send', 'Send')}</button>
    </form>
    <div class="media reveal reveal-d1"><img data-edit-img="${SITE.homeImages.contact}" src="/assets/img/gallery/${SITE.homeImages.contact}.jpg" alt="${esc(galleryById[SITE.homeImages.contact].title)}" loading="lazy" width="800" height="600"></div>
  </div>
</section>`;
  write('contact/index.html', layout({
    slug: '/contact/',
    title: 'Contact | Devyn Underwater',
    description: 'Get in touch with Devyn — print orders, image licensing, or underwater photography questions.',
    schema: [breadcrumb(crumbs)],
    body
  }));
}

function privacyPage() {
  const crumbs = [['Home', '/'], ['Privacy Policy', '/privacy-policy/']];
  const body = `
<div class="page-hero dark"><div class="container"><h1>Privacy Policy</h1></div></div>
<section class="section"><div class="container narrow prose">
<p>Devyn Underwater ("we," "us") respects your privacy. This policy describes what we collect on this website and how it's used.</p>
<h2>What we collect</h2>
<p>Information you submit through the contact form (name, email, message). Basic anonymous usage data may be collected if analytics are enabled.</p>
<h2>How it's used</h2>
<p>To reply to your inquiry, fulfill print questions, and improve the site. We don't sell your information, ever.</p>
<h2>Print orders</h2>
<p>Print purchases are processed by Fine Art America on their platform, under <a href="https://fineartamerica.com/termsofuse.html" target="_blank" rel="noopener">their terms</a> and privacy policy. We never see your payment details.</p>
<h2>Your images of choice</h2>
<p>All photographs on this site are the original work of Devyn Underwater and may not be reproduced without permission.</p>
<h2>Contact</h2>
<p>Questions about this policy? Use the <a href="/contact/">contact form</a>.</p>
</div></section>`;
  write('privacy-policy/index.html', layout({
    slug: '/privacy-policy/',
    title: 'Privacy Policy | Devyn Underwater',
    description: 'How devynunderwater.com handles your information.',
    schema: [breadcrumb(crumbs)],
    body
  }));
}

function managePage() {
  const tools = [
    { t: '📝 Edit your website', h: '/admin/', d: 'Add photos, fix titles, edit copy, manage the print shop. Hit Publish when done — the site rebuilds itself in about two minutes.' },
    { t: '🖼 Your Fine Art America account', h: 'https://fineartamerica.com/login.html', d: 'Upload images for sale, set your prices and markups. Paste each artwork\'s FAA link into the matching product in the editor and buy buttons go live.' },
    { t: '👀 View the live site', h: '/', d: 'See what visitors see. Changes appear a couple of minutes after you publish.' }
  ];
  const body = `
<div class="page-hero"><div class="container">
  <div class="kicker">For Devyn</div>
  <h1>Manage your website</h1>
  <p class="lede">Bookmark this page — everything you need lives behind these three doors. You can\'t break anything: every change is saved with history and reversible.</p>
</div></div>
<section class="section">
  <div class="container">
    <div class="grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:1.4rem">
      ${tools.map(x => `<a class="product-card" href="${x.h}"${x.h.startsWith('http') ? ' target="_blank" rel="noopener"' : ''} style="border:1px solid var(--sand);padding:1.6rem;background:#fff;box-shadow:var(--shadow)">
        <h3 style="margin-top:0">${x.t}</h3><p style="opacity:.8">${x.d}</p>
      </a>`).join('')}
    </div>
    <p class="notice" style="margin-top:2rem">Adding photos: upload the JPG exactly as you export it from Lightroom — the site resizes everything automatically. Give it a title, pick a collection, publish. Done.</p>
  </div>
</section>`;
  write('manage/index.html', layout({
    slug: '/manage/',
    title: 'Manage | Devyn Underwater',
    description: 'Content management for Devyn Underwater.',
    extraHead: '<meta name="robots" content="noindex, nofollow">',
    body
  }));
}

function notFound() {
  const body = `
<section class="section" style="min-height:70vh;display:flex;align-items:center;padding-top:calc(var(--header-h) + 2rem)">
  <div class="container" style="text-align:center">
    <h1>${t('nf.h1', 'Lost at sea')}</h1>
    <p class="lede" style="margin-inline:auto">${t('nf.lede', 'This page drifted off. Try one of these currents:')}</p>
    <div class="btn-row" style="justify-content:center;margin-top:1.4rem;display:flex;gap:.9rem;flex-wrap:wrap">
      <a class="btn btn-dark" href="/photography/">The gallery</a>
      <a class="btn btn-dark" href="/shop/">The shop</a>
      <a class="btn btn-solid" href="/">Surface</a>
    </div>
  </div>
</section>`;
  write('404.html', layout({ slug: '/404.html', title: 'Page Not Found | Devyn Underwater', description: 'That page drifted off.', body }));
}

/* ---------------- SEO files ---------------- */
function seoFiles(slugs) {
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${slugs.map(s => `  <url><loc>${DOMAIN}${s}</loc><lastmod>2026-07-24</lastmod></url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /manage/

Sitemap: ${DOMAIN}/sitemap.xml
`);
  write('llms.txt', `# ${SITE.name}
> Underwater macro photographer. Original photography from Blue Heron Bridge (Riviera Beach, Florida), Cozumel (Mexico), and Roatán (Honduras). Museum-quality prints (paper, canvas, metal, acrylic, framed) made to order and fulfilled by Fine Art America.

## Key pages
- Gallery: ${DOMAIN}/photography/
- Prints for sale: ${DOMAIN}/shop/
- About the photographer: ${DOMAIN}/about/
- Contact: ${DOMAIN}/contact/
`);
  write('_redirects', `/strategy            /photography/    301
/home                /                301
`);
  write('_headers', `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
}

/* ---------------- run ---------------- */
console.log('Building Devyn Underwater…');
fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(__dirname, 'static', 'css'), path.join(OUT, 'assets', 'css'));
copyDir(path.join(__dirname, 'static', 'js'), path.join(OUT, 'assets', 'js'));
copyDir(path.join(__dirname, 'static', 'img'), path.join(OUT, 'assets', 'img'));
copyDir(path.join(__dirname, 'static', 'admin'), path.join(OUT, 'admin'));
if (fs.existsSync(path.join(__dirname, 'uploads'))) {
  copyDir(path.join(__dirname, 'uploads'), path.join(OUT, 'uploads'));
}

/* favicon: teal wave dot */
fs.writeFileSync(path.join(OUT, 'assets', 'img', 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1C2567"/><path d="M6 19c3-6 7-6 10 0s7 6 10 0" stroke="#018DAC" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="16" cy="10" r="2.4" fill="#F5F6F8"/></svg>`);

homePage();
aboutPage();
photographyPage();
shopPage();
SITE.products.forEach(productPage);
contactPage();
privacyPage();
managePage();
notFound();
const slugs = ['/', '/about/', '/photography/', '/shop/', ...SITE.products.map(p => `/shop/${p.slug}/`), '/contact/', '/privacy-policy/'];
seoFiles(slugs);
if (TEXT_DIRTY) { fs.writeFileSync(TEXT_FILE, JSON.stringify(TEXT, null, 2)); console.log('  wrote data/text.json'); }
console.log(`\nDone: ${slugs.length} pages + 404 → site/`);
