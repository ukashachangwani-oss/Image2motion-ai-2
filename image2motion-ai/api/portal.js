// POST /api/portal -> fresh Lemon Squeezy customer-portal URL (update card, cancel, invoices)
const sb = require('./_sb');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const user = await sb.userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Please sign in first.' });
  try {
    const p = await sb.getProfile(user.id);
    if (!p || !p.ls_subscription_id) return res.status(404).json({ error: 'No subscription found for this account.' });
    const r = await fetch('https://api.lemonsqueezy.com/v1/subscriptions/' + encodeURIComponent(p.ls_subscription_id), { headers: { Accept: 'application/vnd.api+json', Authorization: 'Bearer ' + process.env.LS_API_KEY } });
    const d = await r.json();
    const url = d && d.data && d.data.attributes && d.data.attributes.urls && d.data.attributes.urls.customer_portal;
    if (!r.ok || !url) return res.status(502).json({ error: 'Could not open the billing portal.' });
    return res.status(200).json({ url });
  } catch (e) { return res.status(500).json({ error: 'Could not open the billing portal.' }); }
};
