// Supabase helpers (server only). Files starting with "_" are not public endpoints on Vercel.
const U = () => process.env.SUPABASE_URL, SR = () => process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = () => process.env.SUPABASE_ANON_KEY;
const H = (extra) => Object.assign({ apikey: SR(), Authorization: 'Bearer ' + SR(), 'Content-Type': 'application/json' }, extra || {});
const configured = () => !!(U() && SR() && ANON());

async function userFromReq(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const r = await fetch(U() + '/auth/v1/user', { headers: { apikey: ANON(), Authorization: 'Bearer ' + t } });
  if (!r.ok) return null;
  const u = await r.json();
  return u && u.id ? { id: u.id, email: u.email } : null;
}
// Token operations without database functions: compare-and-swap on the tokens column (atomic, no race).
async function casUpdate(uid, compute) {
  for (let i = 0; i < 6; i++) {
    let p = await getProfile(uid);
    if (!p) {
      await fetch(U() + '/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: H({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify({ id: uid }) });
      p = await getProfile(uid);
      if (!p) return -1;
    }
    const next = compute(p.tokens);
    if (next === null) return -1;
    const r = await fetch(U() + '/rest/v1/profiles?id=eq.' + encodeURIComponent(uid) + '&tokens=eq.' + p.tokens, { method: 'PATCH', headers: H({ Prefer: 'return=representation' }), body: JSON.stringify({ tokens: next }) });
    if (!r.ok) throw new Error('tokens: ' + (await r.text()));
    const rows = await r.json();
    if (Array.isArray(rows) && rows.length) return rows[0].tokens;
  }
  throw new Error('tokens: busy, try again');
}
async function rpc(fn, args) {
  if (fn === 'consume_token') return casUpdate(args.uid, t => (t > 0 ? t - 1 : null));
  if (fn === 'add_tokens') return casUpdate(args.uid, t => Math.max(t + args.n, 0));
  throw new Error('unknown operation ' + fn);
}
async function select(table, query) {
  const r = await fetch(U() + '/rest/v1/' + table + '?' + query, { headers: H() });
  if (!r.ok) throw new Error('select ' + table + ': ' + (await r.text()));
  return r.json();
}
async function patch(table, query, body) {
  const r = await fetch(U() + '/rest/v1/' + table + '?' + query, { method: 'PATCH', headers: H({ Prefer: 'return=minimal' }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('patch ' + table + ': ' + (await r.text()));
}
async function getProfile(id) { return (await select('profiles', 'id=eq.' + encodeURIComponent(id) + '&select=*'))[0] || null; }
async function ensureProfile(user) {
  let p = await getProfile(user.id);
  if (p) return p;
  await fetch(U() + '/rest/v1/profiles?on_conflict=id', { method: 'POST', headers: H({ Prefer: 'resolution=ignore-duplicates,return=minimal' }), body: JSON.stringify({ id: user.id, email: user.email }) });
  return getProfile(user.id);
}
// returns true only the first time an id is seen (idempotency for webhooks)
async function claimEvent(id) {
  const r = await fetch(U() + '/rest/v1/billing_events', { method: 'POST', headers: H({ Prefer: 'resolution=ignore-duplicates,return=representation' }), body: JSON.stringify({ id }) });
  if (!r.ok) throw new Error('claim: ' + (await r.text()));
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}
module.exports = { configured, userFromReq, rpc, select, patch, getProfile, ensureProfile, claimEvent };
