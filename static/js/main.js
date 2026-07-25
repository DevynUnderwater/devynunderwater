/* Devyn Underwater — header, nav, reveals, film strip, gallery filter, lightbox */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* header scroll state */
  var header = document.querySelector('.site-header');
  var onScroll = function () { header.classList.toggle('scrolled', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* mobile nav */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) header.classList.add('scrolled');
    });
  }

  /* scroll reveals */
  var revealEls = [].slice.call(document.querySelectorAll('.reveal'));
  if (revealEls.length && 'IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }
  /* failsafe: nothing stays hidden more than a few seconds after load */
  window.addEventListener('load', function () {
    setTimeout(function () { revealEls.forEach(function (el) { el.classList.add('in'); }); }, 3000);
  });

  /* film strip arrows */
  [].slice.call(document.querySelectorAll('.strip-wrap')).forEach(function (wrap) {
    var strip = wrap.querySelector('.strip');
    var prev = wrap.querySelector('.strip-prev');
    var next = wrap.querySelector('.strip-next');
    if (!strip) return;
    var step = function () { return Math.min(strip.clientWidth * 0.8, 600); };
    if (prev) prev.addEventListener('click', function () { strip.scrollBy({ left: -step(), behavior: reduced ? 'auto' : 'smooth' }); });
    if (next) next.addEventListener('click', function () { strip.scrollBy({ left: step(), behavior: reduced ? 'auto' : 'smooth' }); });
  });

  /* gallery filters */
  var filterBar = document.querySelector('.filter-bar');
  var tiles = [].slice.call(document.querySelectorAll('.gallery .tile'));
  if (filterBar && tiles.length) {
    filterBar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-set]');
      if (!btn) return;
      [].slice.call(filterBar.querySelectorAll('button')).forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      var set = btn.getAttribute('data-set');
      tiles.forEach(function (t) {
        var show = set === 'all' || t.getAttribute('data-set') === set;
        t.classList.toggle('hidden', !show);
        if (show && !reduced) {
          t.classList.remove('in');
          requestAnimationFrame(function () { requestAnimationFrame(function () { t.classList.add('in'); }); });
        }
      });
    });
  }

  /* lightbox */
  var lb = document.getElementById('lightbox');
  if (lb && tiles.length) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('.lb-cap');
    var current = -1;
    var visibleTiles = function () { return tiles.filter(function (t) { return !t.classList.contains('hidden'); }); };
    var show = function (idx) {
      var vis = visibleTiles();
      if (!vis.length) return;
      current = (idx + vis.length) % vis.length;
      var t = vis[current];
      lbImg.src = t.getAttribute('data-full');
      lbImg.alt = t.getAttribute('data-title') || '';
      lbCap.textContent = t.getAttribute('data-title') || '';
      /* preload neighbors */
      [current + 1, current - 1].forEach(function (n) {
        var nt = vis[(n + vis.length) % vis.length];
        if (nt) { var im = new Image(); im.src = nt.getAttribute('data-full'); }
      });
    };
    var open = function (idx) {
      show(idx);
      lb.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
      lb.querySelector('.lb-close').focus();
    };
    var close = function () {
      lb.classList.remove('open');
      document.documentElement.style.overflow = '';
    };
    tiles.forEach(function (t) {
      t.addEventListener('click', function () { open(visibleTiles().indexOf(t)); });
    });
    lb.querySelector('.lb-close').addEventListener('click', close);
    lb.querySelector('.lb-prev').addEventListener('click', function () { show(current - 1); });
    lb.querySelector('.lb-next').addEventListener('click', function () { show(current + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
    document.addEventListener('keydown', function (e) {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(current - 1);
      if (e.key === 'ArrowRight') show(current + 1);
    });
    var sx = null;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(current + (dx < 0 ? 1 : -1));
      sx = null;
    }, { passive: true });
  }
})();
