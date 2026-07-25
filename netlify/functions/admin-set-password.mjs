/* TEMPORARY admin utility: set an Identity user's password directly.
 * Guarded by the site's GITHUB_TOKEN env var as a shared secret.
 * DELETE THIS FUNCTION after use.
 */
export default async (req, context) => {
  if (req.method !== 'POST') return new Response('{}', { status: 405 });
  const { secret, email, password } = await req.json().catch(() => ({}));
  if (!secret || secret !== process.env.GITHUB_TOKEN) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!email || !password || password.length < 8) {
    return Response.json({ error: 'need email + password (8+ chars)' }, { status: 400 });
  }
  const identity = context.clientContext?.identity;
  if (!identity?.url || !identity?.token) {
    return Response.json({ error: 'no identity admin context' }, { status: 500 });
  }
  const auth = { Authorization: `Bearer ${identity.token}` };

  const list = await fetch(`${identity.url}/admin/users?per_page=100`, { headers: auth }).then(r => r.json());
  const user = (list.users || []).find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    return Response.json({ error: 'user not found', have: (list.users || []).map(u => u.email) }, { status: 404 });
  }
  const upd = await fetch(`${identity.url}/admin/users/${user.id}`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, email_confirm: true, confirm: true })
  });
  const body = await upd.text();
  return Response.json({ ok: upd.ok, status: upd.status, detail: upd.ok ? 'password set' : body.slice(0, 300) });
};
