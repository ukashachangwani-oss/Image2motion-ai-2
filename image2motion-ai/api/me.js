const sb = require('./_sb');
module.exports = async (req, res) => {
  if (!sb.configured()) return res.status(500).json({ error: 'Not configured' });
  const user = await sb.userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not signed in' });
  try {
    const p = await sb.ensureProfile(user);
    return res.status(200).json({ email: user.email, tokens: p.tokens, plan: p.plan, status: p.plan_status, renews_at: p.renews_at, has_subscription: !!p.ls_subscription_id });
  } catch (e) { return res.status(500).json({ error: 'Could not load account' }); }
};
