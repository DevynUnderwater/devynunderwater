/* TEMPORARY admin utility: set an Identity user's password directly.
 * v1 handler style — required for context.clientContext.identity (admin token).
 * DELETE THIS FUNCTION after use.
 */
const json = (statusCode, obj) => ({ statusCode, body: JSON.stringify(obj), headers: { 'Content-Type': 'application/json' } });

export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  let payload = {};
  try { payload = JSON.parse(event.body || '{}'); } catch {}
  const { secret, email, password } = payload;

  let authorized = !!secret && secret === process.env.GITHUB_TOKEN;
  if (!authorized && secret) {
    const who = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${secret}`, 'User-Agent': 'devynunderwater-admin' }
    }).then(r => (r.ok ? r.json() : null)).catch(() => null);
    authorized = who?.login === 'Kevin-Mentatix';
  }
  if (!authorized) return json(401, { error: 'unauthorized' });
  if (!email || !password || password.length < 8) return json(400, { error: 'need email + password (8+ chars)' });

  const identity = context.clientContext?.identity;
  if (!identity?.url || !identity?.token) return json(500, { error: 'no identity admin context', keys: Object.keys(context.clientContext || {}) });
  const auth = { Authorization: `Bearer ${identity.token}` };

  const list = await fetch(`${identity.url}/admin/users?per_page=100`, { headers: auth }).then(r => r.json());
  const user = (list.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return json(404, { error: 'user not found', have: (list.users || []).map(u => u.email) });

  const upd = await fetch(`${identity.url}/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, email_confirm: true, confirm: true })
  });
  const body = await upd.text();
  return json(upd.ok ? 200 : 502, { ok: upd.ok, status: upd.status, detail: upd.ok ? 'password set' : body.slice(0, 300) });
};
