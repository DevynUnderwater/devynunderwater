#!/usr/bin/env node
/* Local backend for the visual editor (#edit mode) — applies edits to the
 * working tree and rebuilds. Run: node local-edit-server.mjs  (port 8791)
 * Production uses netlify/functions/save-edits.mjs instead.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] ?? (o[p] = {});
  o[parts[parts.length - 1]] = value;
}

function applyTexts(texts) {
  const siteFile = path.join(ROOT, 'data', 'site.json');
  const site = JSON.parse(fs.readFileSync(siteFile));
  let siteDirty = false;
  for (const [key, value] of Object.entries(texts)) {
    const [kind, ...rest] = key.split(':');
    if (kind === 'site') {
      setPath(site, rest[0], value.trim());
      siteDirty = true;
    } else if (kind === 'photo') {
      const [id, field] = rest;
      if (!/^[a-z0-9-]+$/.test(id)) continue;
      const pf = path.join(ROOT, 'content', 'photos', `${id}.json`);
      if (!fs.existsSync(pf)) continue;
      const photo = JSON.parse(fs.readFileSync(pf));
      photo[field] = value.trim();
      fs.writeFileSync(pf, JSON.stringify(photo, null, 2));
    }
  }
  if (siteDirty) fs.writeFileSync(siteFile, JSON.stringify(site, null, 2));
}

function applyImages(images) {
  for (const [id, dataUrl] of Object.entries(images)) {
    if (!/^[a-z0-9-]+$/.test(id)) continue;
    const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl);
    if (!m) continue;
    const buf = Buffer.from(m[2], 'base64');
    fs.mkdirSync(path.join(ROOT, 'uploads', 'gallery'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'uploads', 'gallery', `${id}.jpg`), buf);
    const pf = path.join(ROOT, 'content', 'photos', `${id}.json`);
    if (fs.existsSync(pf)) {
      const photo = JSON.parse(fs.readFileSync(pf));
      photo.image = `/uploads/gallery/${id}.jpg`;
      fs.writeFileSync(pf, JSON.stringify(photo, null, 2));
    }
    // drop stale exports so prep-ci regenerates from the new upload
    for (const dir of ['gallery', 'thumbs', 'hero']) {
      const f = path.join(ROOT, 'static', 'img', dir, `${id}.jpg`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (req.method !== 'POST' || req.url !== '/save') { res.writeHead(404, CORS); return res.end('{}'); }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 60 * 1024 * 1024) req.destroy(); });
  req.on('end', () => {
    try {
      const { texts = {}, images = {} } = JSON.parse(body);
      applyTexts(texts);
      applyImages(images);
      execSync('python3 prep-ci.py && node build.js', { cwd: ROOT, stdio: 'inherit' });
      res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      console.log(`applied ${Object.keys(texts).length} text + ${Object.keys(images).length} image edits`);
    } catch (e) {
      console.error(e);
      res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  });
}).listen(8791, () => console.log('visual-editor save server on http://127.0.0.1:8791'));
