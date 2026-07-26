/* Devyn Underwater — FAA purchase overlay.
 * Reimplements FAA's widgetscripts.php popup (loadpage / hidepixelsiframe /
 * resizemainiframe) with an origin-checked message whitelist instead of the
 * upstream eval(e.data), and site-styled modal chrome. Native buttons opt in
 * with data-faa-buy="<showProduct.php url>"; the /shop/ embedded store keeps
 * the upstream iframe id so its resize messages still land.
 */
(function () {
  'use strict';
  var FAA_ORIGINS = ['https://fineartamerica.com', 'https://www.fineartamerica.com', 'https://pixels.com', 'https://www.pixels.com'];
  var LOADING = 'https://fineartamerica.com/widgetshoppingcart/loading.php';
  var FAA_URL = /^https:\/\/(www\.)?(fineartamerica|pixels)\.com\//;

  var backdrop, modal, frame;
  function build() {
    if (backdrop) return;
    backdrop = document.createElement('div');
    backdrop.id = 'backgrounddiv';
    backdrop.style.cssText = 'position:fixed;z-index:1200;inset:0;background:rgba(14,19,52,.78);visibility:hidden';
    backdrop.addEventListener('click', hide);

    modal = document.createElement('div');
    modal.id = 'pixelsiframeparentdiv';
    modal.style.cssText = 'position:fixed;z-index:1201;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-top:3px solid #018DAC;box-shadow:0 18px 60px rgba(0,0,0,.5);visibility:hidden';

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:1rem;height:44px;background:#1C2567;color:#F5F6F8;padding:0 .4rem 0 1rem;font:800 12px/1 Avenir,Mulish,sans-serif;letter-spacing:.08em;text-transform:uppercase';
    var label = document.createElement('span');
    label.textContent = 'Order a print — secure checkout';
    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the print shop window');
    close.textContent = '×';
    close.style.cssText = 'background:none;border:none;color:#F5F6F8;font-size:30px;line-height:1;padding:.2rem .6rem;cursor:pointer';
    close.addEventListener('click', hide);
    bar.appendChild(label);
    bar.appendChild(close);

    frame = document.createElement('iframe');
    frame.id = 'pixelsiframe';
    frame.src = LOADING;
    frame.title = 'Order this print — Fine Art America secure checkout';
    frame.style.cssText = 'display:block;width:100%;height:calc(100% - 44px);border:none';

    modal.appendChild(bar);
    modal.appendChild(frame);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    size();
  }
  function size() {
    if (!modal) return;
    var w = document.documentElement.clientWidth;
    var h = Math.min(document.documentElement.clientHeight, window.innerHeight || 1e9);
    var mw = w < 520 ? w : Math.min(Math.round(w * 0.95), 1060);
    var mh = w < 520 ? h : Math.round(h * 0.92);
    modal.style.width = mw + 'px';
    modal.style.height = mh + 'px';
  }
  function show(url) {
    build();
    frame.src = url;
    backdrop.style.visibility = 'visible';
    modal.style.visibility = 'visible';
    document.documentElement.style.overflow = 'hidden';
  }
  function hide() {
    if (!modal) return;
    backdrop.style.visibility = 'hidden';
    modal.style.visibility = 'hidden';
    frame.src = LOADING;
    document.documentElement.style.overflow = '';
  }
  window.addEventListener('resize', size);
  window.addEventListener('orientationchange', size);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });

  /* upstream global names, kept because FAA's inner pages call them */
  window.loadpage = function (url) { if (FAA_URL.test(url)) show(url); };
  window.hidepixelsiframe = hide;
  window.centerpixelsiframe = size;
  window.scrollmainiframe = function () {
    var f = document.getElementById('pixelsshoppingcartiframe');
    if (f) f.scrollIntoView(true);
  };
  window.resizemainiframe = function (h) {
    var f = document.getElementById('pixelsshoppingcartiframe');
    if (f) f.style.height = (parseInt(h, 10) || 820) + 'px';
  };

  /* FAA's own script evals whatever any window posts; whitelist instead */
  window.addEventListener('message', function (e) {
    if (FAA_ORIGINS.indexOf(e.origin) < 0 || typeof e.data !== 'string') return;
    var m;
    if ((m = /^resizemainiframe\((\d+)\);?$/.exec(e.data))) window.resizemainiframe(m[1]);
    else if (/^scrollmainiframe\(\);?$/.test(e.data)) window.scrollmainiframe();
    else if (/^hidepixelsiframe\(\);?$/.test(e.data)) hide();
    else if (/^centerpixelsiframe\(\);?$/.test(e.data)) size();
    else if ((m = /^loadpage\('([^']+)'\);?$/.exec(e.data))) window.loadpage(m[1]);
  });

  /* native buy buttons */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-faa-buy]');
    if (!b) return;
    e.preventDefault();
    window.loadpage(b.getAttribute('data-faa-buy'));
  });
})();
