// POST /api/webhook  <- Lemon Squeezy. Verifies signature, updates plan, credits tokens (idempotent).
const crypto = require('crypto');
const sb = require('./_sb');

function raw(req) { return new Promise((ok, no) => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); req.on('error', no); }); }

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const secret = process.env.LS_WEBHOOK_SECRET;
  if (!secret) return res.status(500).end('no secret');
  const body = await raw(req);
  const sig = String(req.headers['x-signature'] || '');
  const mac = crypto.createHmac('sha256', secret).update(body).digest('hex');
  const a = Buffer.from(mac), b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).end('bad signature');

  let ev;
  try { ev = JSON.parse(body.toString('utf8')); } catch (e) { return res.status(400).end('bad json'); }
  const name = ev.meta && ev.meta.event_name, d = ev.data || {}, at = d.attributes || {};
  const proTokens = +process.env.PRO_TOKENS || 300;
  try {
    const isInvoice = name === 'subscription_payment_success';
    const subId = String(isInvoice ? at.subscription_id : d.id);
    let uid = ev.meta && ev.meta.custom_data && ev.meta.custom_data.user_id;
    if (!uid) { const rows = await sb.select('profiles', 'ls_subscription_id=eq.' + encodeURIComponent(subId) + '&select=id'); uid = rows[0] && rows[0].id; }
    if (!uid) return res.status(500).end('user not found (will retry)');

    if (['subscription_created', 'subscription_updated', 'subscription_resumed', 'subscription_unpaused', 'subscription_cancelled'].includes(name)) {
      const status = at.status;
      const pro = ['active', 'on_trial', 'cancelled'].includes(status);
      await sb.patch('profiles', 'id=eq.' + uid, { plan: pro ? 'pro' : 'free', plan_status: status, ls_subscription_id: subId, ls_customer_id: String(at.customer_id || ''), renews_at: at.renews_at || at.ends_at || null });
    } else if (name === 'subscription_expired') {
      await sb.patch('profiles', 'id=eq.' + uid, { plan: 'free', plan_status: 'expired' });
    } else if (isInvoice) {
      if (at.status === 'paid' && await sb.claimEvent('inv_' + d.id)) {
        await sb.rpc('add_tokens', { uid, n: proTokens });
        await sb.patch('profiles', 'id=eq.' + uid, { plan: 'pro', plan_status: 'active', ls_subscription_id: subId });
      }
    }
    return res.status(200).end('ok');
  } catch (e) { return res.status(500).end('error'); }
};
module.exports.config = { api: { bodyParser: false } };
