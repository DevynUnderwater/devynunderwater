/* Devyn Underwater — in-context visual editor.
 * Activated by opening any page with #edit. Click text to edit it in place,
 * click a photo to replace it. Save commits the changes and rebuilds the site.
 */
(function () {
  'use strict';
  var IS_LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ENDPOINT = IS_LOCAL ? 'http://127.0.0.1:8791/save' : '/.netlify/functions/save-edits';

  var texts = {};   // "site:copy.aboutTeaser" -> new value
  var images = {};  // photoId -> dataURL
  var originals = {};

  /* ---------- toolbar ---------- */
  var bar = document.createElement('div');
  bar.id = 'edit-bar';
  bar.innerHTML =
    '<span class="eb-label">✏️ Edit mode — click any highlighted text to rewrite it, click a photo to replace it.</span>' +
    '<span class="eb-actions">' +
    '<span id="eb-count">No changes yet</span>' +
    '<a id="eb-admin" href="/admin/" style="font:800 13px Avenir,Mulish,sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:.5rem 1.1rem;border:1.5px solid #F5F6F8;color:#F5F6F8;text-decoration:none">＋ Add photos</a>' +
    '<button id="eb-save" disabled>Save &amp; publish</button>' +
    '<button id="eb-exit">Exit</button></span>';
  var style = document.createElement('style');
  style.textContent =
    '#edit-bar{position:fixed;top:0;left:0;right:0;z-index:1000;display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between;background:#1C2567;color:#F5F6F8;padding:.6rem 1rem;font:500 14px/1.4 Avenir,Mulish,sans-serif;box-shadow:0 2px 14px rgba(0,0,0,.35)}' +
    '#edit-bar button{font:800 13px Avenir,Mulish,sans-serif;letter-spacing:.05em;text-transform:uppercase;padding:.5rem 1.1rem;border:1.5px solid #F5F6F8;background:none;color:#F5F6F8;cursor:pointer}' +
    '#edit-bar #eb-save:not([disabled]){background:#018DAC;border-color:#018DAC}' +
    '#edit-bar button[disabled]{opacity:.45;cursor:default}' +
    '#eb-count{opacity:.8;font-size:13px;margin-right:.4rem}' +
    '.eb-actions{display:flex;gap:.6rem;align-items:center}' +
    'body{padding-top:52px}' +
    '[data-edit]{outline:2px dashed rgba(1,141,172,.55);outline-offset:3px;cursor:text;min-height:1em}' +
    '[data-edit]:hover,[data-edit]:focus{outline:2.5px solid #018DAC;background:rgba(1,141,172,.08)}' +
    '[data-edit].eb-dirty{outline-color:#E8A33D}' +
    '[data-edit-img]{cursor:pointer}' +
    '.eb-img-wrap{position:relative;display:block}' +
    '.eb-img-btn{position:absolute;inset:auto auto 10px 10px;z-index:5;background:#1C2567;color:#F5F6F8;font:800 12px Avenir,Mulish,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:.45rem .9rem;border:1.5px solid #F5F6F8;cursor:pointer}' +
    '.eb-img-btn:hover{background:#018DAC;border-color:#018DAC}' +
    '.eb-img-dirty{box-shadow:0 0 0 3px #E8A33D}' +
    '#eb-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:1001;background:#1C2567;color:#fff;padding:.8rem 1.4rem;font:500 14px Avenir,Mulish,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none}';
  document.head.appendChild(style);
  document.body.appendChild(bar);
  var toast = document.createElement('div');
  toast.id = 'eb-toast';
  document.body.appendChild(toast);

  function say(msg, sticky) {
    toast.textContent = msg;
    toast.style.display = 'block';
    if (!sticky) setTimeout(function () { toast.style.display = 'none'; }, 3200);
  }
  function dirtyCount() {
    var n = Object.keys(texts).length + Object.keys(images).length;
    document.getElementById('eb-count').textContent = n ? n + ' unsaved change' + (n > 1 ? 's' : '') : 'No changes yet';
    document.getElementById('eb-save').disabled = !n;
  }

  /* ---------- text editing ---------- */
  [].slice.call(document.querySelectorAll('[data-edit]')).forEach(function (el) {
    el.setAttribute('contenteditable', 'plaintext-only');
    el.setAttribute('spellcheck', 'true');
    originals[el.getAttribute('data-edit')] = el.textContent;
    el.addEventListener('input', function () {
      var key = el.getAttribute('data-edit');
      var val = el.textContent;
      if (val === originals[key]) { delete texts[key]; el.classList.remove('eb-dirty'); }
      else { texts[key] = val; el.classList.add('eb-dirty'); }
      dirtyCount();
    });
    /* keep Enter from splitting into divs on single-line fields */
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && el.tagName !== 'P') e.preventDefault();
    });
  });

  /* ---------- photo replacement ---------- */
  var picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.style.display = 'none';
  document.body.appendChild(picker);
  var pendingImg = null;

  /* Any size file is fine: photos are downscaled in the browser before upload.
   * The site never renders wider than 1920px (hero), and the save endpoint
   * (a Netlify function) rejects request bodies over ~6 MB. */
  var MAX_EDGE = 2560;
  function shrink(file, cb) {
    var url = URL.createObjectURL(file);
    var im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var w = im.naturalWidth, h = im.naturalHeight;
      var s = Math.min(1, MAX_EDGE / Math.max(w, h));
      var tw = Math.round(w * s), th = Math.round(h * s);
      /* step down by halves before the final resize — one big jump from a
       * 45 MP original aliases fine detail (scales, coral, rhinophores) */
      var src = im;
      while (w / 2 >= tw && h / 2 >= th) {
        w = Math.round(w / 2); h = Math.round(h / 2);
        var half = document.createElement('canvas');
        half.width = w; half.height = h;
        var hx = half.getContext('2d');
        hx.imageSmoothingEnabled = true;
        hx.imageSmoothingQuality = 'high';
        hx.drawImage(src, 0, 0, w, h);
        src = half;
      }
      var c = document.createElement('canvas');
      c.width = tw; c.height = th;
      var x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, tw, th);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, tw, th);
      cb(c.toDataURL('image/jpeg', 0.85));
    };
    im.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    im.src = url;
  }

  [].slice.call(document.querySelectorAll('[data-edit-img]')).forEach(function (img) {
    var wrap = document.createElement('span');
    wrap.className = 'eb-img-wrap';
    img.parentNode.insertBefore(wrap, img);
    wrap.appendChild(img);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eb-img-btn';
    btn.textContent = 'Replace photo';
    wrap.appendChild(btn);
    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      pendingImg = img;
      picker.click();
    });
  });
  picker.addEventListener('change', function () {
    var f = picker.files[0];
    if (!f || !pendingImg) return;
    var target = pendingImg;
    say('Preparing photo…', true);
    shrink(f, function (dataUrl) {
      if (!dataUrl) { say('Could not read that file — try a JPG or PNG.'); return; }
      var id = target.getAttribute('data-edit-img');
      var pending = 0;
      for (var k in images) if (k !== id) pending += images[k].length;
      if (pending && pending + dataUrl.length > 4.5 * 1024 * 1024) {
        say('That’s a lot of photos in one go — hit Save & publish first, then replace this one.');
        return;
      }
      images[id] = dataUrl;
      /* live preview everywhere this photo appears */
      [].slice.call(document.querySelectorAll('[data-edit-img="' + id + '"]')).forEach(function (im) {
        im.src = dataUrl;
        im.classList.add('eb-img-dirty');
      });
      dirtyCount();
      say('Photo ready — hit Save & publish when you’re done.');
    });
    picker.value = '';
  });

  /* ---------- save ---------- */
  document.getElementById('eb-save').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    say(IS_LOCAL ? 'Saving and rebuilding…' : 'Saving — the site will rebuild in about two minutes…', true);
    var doSave = function (headers) {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        body: JSON.stringify({ texts: texts, images: images })
      }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) throw new Error(out.j.error || 'save failed');
          texts = {}; images = {};
          if (IS_LOCAL) {
            say('Saved. Reloading…');
            setTimeout(function () { location.reload(); }, 900);
          } else {
            say('Saved ✓ Your changes go live in about two minutes.');
            dirtyCount();
          }
        })
        .catch(function (e) { say('Save failed: ' + e.message); btn.disabled = false; });
    };
    if (IS_LOCAL) return doSave();
    /* production: Netlify Identity token */
    var user = window.netlifyIdentity && window.netlifyIdentity.currentUser();
    if (!user) { say('Please log in first.'); window.netlifyIdentity && window.netlifyIdentity.open(); btn.disabled = false; return; }
    user.jwt().then(function (t) { doSave({ Authorization: 'Bearer ' + t }); });
  });

  document.getElementById('eb-exit').addEventListener('click', function () {
    if (Object.keys(texts).length + Object.keys(images).length &&
        !confirm('You have unsaved changes — leave anyway?')) return;
    location.href = location.pathname;
  });

  /* production login widget */
  if (!IS_LOCAL && !window.netlifyIdentity) {
    var s = document.createElement('script');
    s.src = 'https://identity.netlify.com/v1/netlify-identity-widget.js';
    s.onload = function () { if (!window.netlifyIdentity.currentUser()) window.netlifyIdentity.open(); };
    document.head.appendChild(s);
  }
  dirtyCount();
})();
