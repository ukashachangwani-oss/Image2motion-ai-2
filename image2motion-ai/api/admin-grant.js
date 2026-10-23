// POST /api/admin-grant  {code,email,tokens,pro}  -> manual top-up (e.g. Easypaisa/JazzCash/bank payments)
const sb = require('./_sb');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const admin = process.env.ADMIN_CODE, b = req.body || {};
  if (!admin || b.code !== admin) return res.status(401).json({ error: 'Wrong admin code.' });
  const email = String(b.email || '').trim().toLowerCase(), n = parseInt(b.tokens, 10);
  if (!email || !Number.isInteger(n) || n < -100000 || n > 100000) return res.status(400).json({ error: 'Enter a valid email and token amount.' });
  try {
    const rows = await sb.select('profiles', 'email=ilike.' + encodeURIComponent(email) + '&select=id,tokens,plan');
    if (!rows[0]) return res.status(404).json({ error: 'No account with this email. The user must sign in once first.' });
    const total = await sb.rpc('add_tokens', { uid: rows[0].id, n });
    if (b.pro) await sb.patch('profiles', 'id=eq.' + rows[0].id, { plan: 'pro', plan_status: 'manual' });
    return res.status(200).json({ ok: true, tokens: total });
  } catch (e) { return res.status(500).json({ error: 'Could not update the account.' }); }
};
