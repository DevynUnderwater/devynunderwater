/* Devyn Underwater — in-context visual editor.
 * Activated by opening any page with #edit. Click text to edit it in place,
 * click a photo to replace it. Save commits the changes straight to GitHub
 * (with the editor's own access key); GitHub Actions rebuilds the site.
 * __REPO__ is stamped by build.js from data/site.json.
 */
(function () {
  'use strict';
  var IS_LOCAL = /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
  var ENDPOINT = 'http://127.0.0.1:8791/save';
  var REPO = '__REPO__';
  var BRANCH = localStorage.getItem('eb-branch') || 'main';

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
    '<button id="eb-draft" disabled>Save draft</button>' +
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
    document.getElementById('eb-draft').disabled = !n;
  }

  /* ---------- drafts: keep work on this device without publishing ---------- */
  var DRAFT_KEY = 'eb-draft';
  function draftSnapshot() { return JSON.stringify({ texts: texts, images: images }); }
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, draftSnapshot());
      say('Draft saved on this device — nothing is published until you hit Save & publish.');
    } catch (e) {
      say('Draft too big to store (photos take a lot of space) — publish instead, or remove a photo change.');
    }
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function restoreDraft() {
    var raw;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
    if (!raw) return;
    var d;
    try { d = JSON.parse(raw); } catch (e) { clearDraft(); return; }
    texts = d.texts || {};
    images = d.images || {};
    Object.keys(texts).forEach(function (key) {
      var el = document.querySelector('[data-edit="' + key.replace(/"/g, '') + '"]');
      if (el && el.textContent !== texts[key]) { el.textContent = texts[key]; el.classList.add('eb-dirty'); }
    });
    Object.keys(images).forEach(function (id) {
      [].slice.call(document.querySelectorAll('[data-edit-img="' + id + '"]')).forEach(function (im) {
        im.src = images[id];
        im.classList.add('eb-img-dirty');
      });
    });
    dirtyCount();
    say('Draft restored — keep editing, or Save & publish when you’re ready.');
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

  /* ---------- save: straight-to-GitHub commit ---------- */
  function getToken(forceAsk) {
    var t = localStorage.getItem('eb-gh-token');
    if (!t || forceAsk) {
      t = (prompt('Paste your site editing key to publish:') || '').trim();
      if (t) localStorage.setItem('eb-gh-token', t);
    }
    return t;
  }
  function gh(token, path, opts) {
    return fetch('https://api.github.com/repos/' + REPO + path, Object.assign({}, opts, {
      headers: Object.assign({
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }, (opts || {}).headers || {})
    })).then(function (r) {
      if (r.status === 401 || r.status === 403) { var e = new Error('bad-token'); e.auth = true; throw e; }
      if (!r.ok) return r.text().then(function (t) { throw new Error(path + ': ' + r.status + ' ' + t.slice(0, 120)); });
      return r.json();
    });
  }
  function setPath(obj, dotted, value) {
    var parts = dotted.split('.');
    var o = obj;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
    o[parts[parts.length - 1]] = value;
  }
  function fromB64(b64) {
    var bin = atob(b64.replace(/\n/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  var idOk = function (s) { return /^[a-z0-9-]+$/.test(s); };

  function ghSave(token) {
    var readFile = function (p) {
      return gh(token, '/contents/' + p + '?ref=' + BRANCH)
        .then(function (f) { return JSON.parse(fromB64(f.content)); });
    };
    /* a sha:null tree entry for a path missing from the base tree 422s,
     * so only queue deletions for exports that actually exist */
    var fileExists = function (p) {
      return fetch('https://api.github.com/repos/' + REPO + '/contents/' + p + '?ref=' + BRANCH, {
        method: 'HEAD',
        headers: { Authorization: 'Bearer ' + token }
      }).then(function (r) { return r.ok; });
    };
    var treeEntries = [];
    var putJson = function (p, obj) {
      treeEntries.push({ path: p, mode: '100644', type: 'blob', content: JSON.stringify(obj, null, 2) });
    };
    var baseSha, site = null, textMap = null;
    var photoCache = {};
    var fileReads = Promise.resolve();

    Object.keys(texts).forEach(function (key) {
      fileReads = fileReads.then(function () {
        var value = String(texts[key]).slice(0, 5000).trim();
        var kind = key.split(':')[0];
        var rest = key.split(':').slice(1);
        if (kind === 'site') {
          return (site ? Promise.resolve(site) : readFile('data/site.json').then(function (s) { site = s; return s; }))
            .then(function (s) { setPath(s, rest[0], value); });
        }
        if (kind === 'text') {
          return (textMap ? Promise.resolve(textMap) : readFile('data/text.json').catch(function () { return {}; }).then(function (t) { textMap = t; return t; }))
            .then(function (t) { t[rest.join(':')] = value; });
        }
        if (kind === 'photo') {
          var id = rest[0], field = rest[1];
          if (!idOk(id) || ['title', 'story'].indexOf(field) < 0) return;
          return (photoCache[id] ? Promise.resolve(photoCache[id]) : readFile('content/photos/' + id + '.json').then(function (p) { photoCache[id] = p; return p; }))
            .then(function (p) { p[field] = value; });
        }
      });
    });

    return fileReads.then(function () {
      /* image blobs */
      var imgWork = Promise.resolve();
      Object.keys(images).forEach(function (id) {
        if (!idOk(id)) return;
        var m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(images[id]);
        if (!m) return;
        imgWork = imgWork.then(function () {
          return gh(token, '/git/blobs', { method: 'POST', body: JSON.stringify({ content: m[2], encoding: 'base64' }) })
            .then(function (blob) {
              treeEntries.push({ path: 'uploads/gallery/' + id + '.jpg', mode: '100644', type: 'blob', sha: blob.sha });
              return Promise.all(['gallery', 'thumbs', 'hero'].map(function (dir) {
                var p = 'static/img/' + dir + '/' + id + '.jpg';
                return fileExists(p).then(function (yes) {
                  if (yes) treeEntries.push({ path: p, mode: '100644', type: 'blob', sha: null });
                });
              }));
            })
            .then(function () {
              return photoCache[id] ? photoCache[id] : readFile('content/photos/' + id + '.json').catch(function () { return null; });
            })
            .then(function (p) {
              if (p) { photoCache[id] = p; p.image = '/uploads/gallery/' + id + '.jpg'; }
            });
        });
      });
      return imgWork;
    }).then(function () {
      if (site) putJson('data/site.json', site);
      if (textMap) putJson('data/text.json', textMap);
      Object.keys(photoCache).forEach(function (id) {
        if (photoCache[id]) putJson('content/photos/' + id + '.json', photoCache[id]);
      });
      if (!treeEntries.length) return { noop: true };
      return gh(token, '/git/ref/heads/' + BRANCH).then(function (ref) {
        baseSha = ref.object.sha;
        return gh(token, '/git/commits/' + baseSha);
      }).then(function (baseCommit) {
        return gh(token, '/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }) });
      }).then(function (tree) {
        return gh(token, '/git/commits', { method: 'POST', body: JSON.stringify({ message: 'Visual edit via site editor', tree: tree.sha, parents: [baseSha] }) });
      }).then(function (commit) {
        return gh(token, '/git/refs/heads/' + BRANCH, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha }) });
      });
    });
  }

  document.getElementById('eb-save').addEventListener('click', function () {
    var btn = this;
    var doSave = function (headers) {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
        body: JSON.stringify({ texts: texts, images: images })
      }).then(function (res) { return res.json().catch(function () { return {}; }).then(function (j) { return { ok: res.ok, j: j }; }); })
        .then(function (out) {
          if (!out.ok) throw new Error(out.j.error || 'save failed');
          texts = {}; images = {};
          clearDraft();
          say('Saved. Reloading…');
          setTimeout(function () { location.reload(); }, 900);
        })
        .catch(function (e) { say('Save failed: ' + e.message); btn.disabled = false; });
    };
    if (IS_LOCAL) {
      btn.disabled = true;
      say('Saving and rebuilding…', true);
      return doSave();
    }
    var token = getToken();
    if (!token) { say('Publishing needs your editing key — ask Kevin for it.'); return; }
    btn.disabled = true;
    say('Saving — the site will rebuild in about two minutes…', true);
    var run = function (tk, retriedAuth) {
      ghSave(tk).then(function () {
        texts = {}; images = {};
        clearDraft();
        say('Saved ✓ Your changes go live in about two minutes.');
        dirtyCount();
      }).catch(function (e) {
        if (e && e.auth && !retriedAuth) {
          localStorage.removeItem('eb-gh-token');
          var fresh = getToken(true);
          if (fresh) return run(fresh, true);
          say('Publishing needs your editing key — ask Kevin for it.');
          btn.disabled = false;
          return;
        }
        say('Save failed: ' + (e && e.message || e));
        btn.disabled = false;
      });
    };
    run(token, false);
  });

  document.getElementById('eb-draft').addEventListener('click', saveDraft);

  document.getElementById('eb-exit').addEventListener('click', function () {
    var dirty = Object.keys(texts).length + Object.keys(images).length;
    var stashed;
    try { stashed = localStorage.getItem(DRAFT_KEY); } catch (e) {}
    if (dirty && stashed !== draftSnapshot() &&
        !confirm('You have changes that aren’t saved as a draft or published — leave anyway?')) return;
    location.href = location.pathname;
  });

  restoreDraft();
  dirtyCount();
})();
