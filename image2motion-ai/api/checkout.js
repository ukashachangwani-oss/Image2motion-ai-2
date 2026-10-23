// POST /api/checkout (signed-in user) -> returns a Lemon Squeezy hosted checkout URL
const sb = require('./_sb');
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { LS_API_KEY, LS_STORE_ID, LS_VARIANT_ID } = process.env;
  if (!LS_API_KEY || !LS_STORE_ID || !LS_VARIANT_ID) return res.status(500).json({ error: 'Billing is not configured yet.' });
  const user = await sb.userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Please sign in first.', needLogin: true });
  const site = (process.env.SITE_URL || 'https://' + req.headers.host).replace(/\/$/, '');
  try {
    const r = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: { Accept: 'application/vnd.api+json', 'Content-Type': 'application/vnd.api+json', Authorization: 'Bearer ' + LS_API_KEY },
      body: JSON.stringify({ data: { type: 'checkouts',
        attributes: { checkout_data: { email: user.email, custom: { user_id: user.id } }, product_options: { redirect_url: site + '/pricing.html?paid=1' } },
        relationships: { store: { data: { type: 'stores', id: String(LS_STORE_ID) } }, variant: { data: { type: 'variants', id: String(LS_VARIANT_ID) } } } } })
    });
    const d = await r.json();
    const url = d && d.data && d.data.attributes && d.data.attributes.url;
    if (!r.ok || !url) return res.status(502).json({ error: 'Could not start checkout. Please try again.' });
    return res.status(200).json({ url });
  } catch (e) { return res.status(500).json({ error: 'Could not start checkout.' }); }
};
