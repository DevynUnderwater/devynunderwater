/* Production backend for the visual editor: commits edits through Netlify's
 * Git Gateway using the editor's own Identity session — no server tokens.
 * v1 handler style — required so context.clientContext.user is populated.
 */
const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });

const mkGw = (base, jwt) => (url, opts = {}) =>
  fetch(`${base}${url}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  }).then(async r => {
    if (!r.ok) throw new Error(`Gateway ${url}: ${r.status} ${await r.text()}`);
    return r.json();
  });

function setPath(obj, dotted, value) {
  const parts = dotted.split('.');
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] ?? (o[p] = {});
  o[parts[parts.length - 1]] = value;
}

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  if (event.httpMethod !== 'POST') return json(405, {});
  const user = context.clientContext?.user;
  if (!user) return json(401, { error: 'Not logged in' });
  const jwt = (event.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const gw = mkGw(`https://${event.headers.host}/.netlify/git/github`, jwt);

  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {}
  const { texts = {}, images = {} } = payload;
  const idOk = s => /^[a-z0-9-]+$/.test(s);

  if (!Object.keys(texts).length && !Object.keys(images).length) {
    return json(200, { ok: true, note: 'nothing to save' });
  }
  try {
    const ref = await gw('/git/refs/heads/main');
    const baseSha = ref.object.sha;
    const baseCommit = await gw(`/git/commits/${baseSha}`);

    const readFile = async p => {
      const f = await gw(`/contents/${p}?ref=main`);
      return JSON.parse(Buffer.from(f.content, 'base64').toString());
    };

    const treeEntries = [];
    const putJson = (p, obj) =>
      treeEntries.push({ path: p, mode: '100644', type: 'blob', content: JSON.stringify(obj, null, 2) });

    let site = null;
    const photoCache = {};
    for (const [key, valueRaw] of Object.entries(texts)) {
      const value = String(valueRaw).slice(0, 5000).trim();
      const [kind, ...rest] = key.split(':');
      if (kind === 'site') {
        site = site || (await readFile('data/site.json'));
        setPath(site, rest[0], value);
      } else if (kind === 'photo') {
        const [id, field] = rest;
        if (!idOk(id) || !['title', 'story'].includes(field)) continue;
        photoCache[id] = photoCache[id] || (await readFile(`content/photos/${id}.json`));
        photoCache[id][field] = value;
      }
    }
    if (site) putJson('data/site.json', site);

    for (const [id, dataUrl] of Object.entries(images)) {
      if (!idOk(id)) continue;
      const m = /^data:image\/(jpeg|png);base64,(.+)$/.exec(dataUrl);
      if (!m) continue;
      const blob = await gw('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: m[2], encoding: 'base64' })
      });
      treeEntries.push({ path: `uploads/gallery/${id}.jpg`, mode: '100644', type: 'blob', sha: blob.sha });
      photoCache[id] = photoCache[id] || (await readFile(`content/photos/${id}.json`).catch(() => null));
      if (photoCache[id]) photoCache[id].image = `/uploads/gallery/${id}.jpg`;
      for (const dir of ['gallery', 'thumbs', 'hero']) {
        treeEntries.push({ path: `static/img/${dir}/${id}.jpg`, mode: '100644', type: 'blob', sha: null });
      }
    }
    for (const [id, photo] of Object.entries(photoCache)) {
      if (photo) putJson(`content/photos/${id}.json`, photo);
    }

    if (!treeEntries.length) return json(200, { ok: true, note: 'nothing to save' });

    const tree = await gw('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries })
    });
    const commit = await gw('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `Visual edit by ${user.email}`,
        tree: tree.sha,
        parents: [baseSha]
      })
    });
    await gw('/git/refs/heads/main', {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha })
    });

    return json(200, { ok: true, commit: commit.sha });
  } catch (e) {
    return json(502, { error: String(e.message || e).slice(0, 400) });
  }
};
