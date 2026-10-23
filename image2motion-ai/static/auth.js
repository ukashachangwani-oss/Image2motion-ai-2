// Shared login + token state for every page. Exposes window.I2M
(function () {
  const C = window.I2M_CONFIG || {};
  const ready = !!(C.supabaseUrl && C.anonKey && window.supabase);
  const sb = ready ? window.supabase.createClient(C.supabaseUrl, C.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  const I = { session: null, profile: null, config: C, cbs: [], ready };
  window.I2M = I;

  const css = document.createElement('style');
  css.textContent = `.nav{flex-wrap:wrap}#authbar{display:flex;gap:8px;align-items:center}
.i2m-b{font:inherit;font-size:13px;border:1px solid var(--bd);background:transparent;color:var(--tx);border-radius:9px;padding:5px 10px;cursor:pointer;text-decoration:none;white-space:nowrap}
.i2m-b.p{background:var(--ac);border-color:var(--ac);color:#fff;font-weight:600}
.i2m-tok{font-size:13px;font-weight:700;color:var(--tx);text-decoration:none;white-space:nowrap}
#i2m-m{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:99;padding:16px}
#i2m-m .bx{background:var(--card,#fff);color:var(--tx);border:1px solid var(--bd);border-radius:16px;padding:20px;width:100%;max-width:380px}
#i2m-m h3{margin:0 0 4px;font-size:20px}#i2m-m p{margin:0 0 12px;color:var(--mu);font-size:14px}
#i2m-m input{width:100%;padding:11px;border-radius:10px;border:1px solid var(--bd);background:var(--bg);color:var(--tx);font:inherit;margin-bottom:10px}
#i2m-m .row{display:flex;gap:8px;margin-top:8px}#i2m-m .row>*{flex:1}
#i2m-msg{font-size:13px;margin-top:10px;min-height:18px}`;
  document.head.appendChild(css);

  const modal = document.createElement('div');
  modal.id = 'i2m-m';
  modal.innerHTML = `<div class="bx"><h3>Sign in to Image2Motion AI</h3><p id="i2m-sub">New accounts get 25 free tokens.</p>
<input id="i2m-email" type="email" placeholder="you@email.com" autocomplete="email">
<button class="i2m-b p" id="i2m-send" style="width:100%;padding:11px">Email me a sign-in link</button>
<button class="i2m-b" id="i2m-g" style="width:100%;padding:11px;margin-top:8px;display:none">Continue with Google</button>
<div id="i2m-msg"></div><div class="row"><button class="i2m-b" id="i2m-x">Close</button></div></div>`;
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(modal));
  const q = id => document.getElementById(id);
  const say = (t, err) => { const m = q('i2m-msg'); m.textContent = t; m.style.color = err ? '#d6336c' : 'var(--mu)'; };

  I.openLogin = (why) => {
    if (!modal.parentNode) document.body.appendChild(modal);
    q('i2m-sub').textContent = why || 'New accounts get 25 free tokens.';
    q('i2m-g').style.display = C.google ? 'block' : 'none';
    say(ready ? '' : 'Login is not configured yet.', !ready);
    modal.style.display = 'flex';
  };
  I.closeLogin = () => { modal.style.display = 'none'; };
  document.addEventListener('click', async (e) => {
    const id = e.target && e.target.id;
    if (id === 'i2m-x' || e.target === modal) I.closeLogin();
    if (id === 'i2m-login') I.openLogin();
    if (id === 'i2m-out') { await sb.auth.signOut(); }
    if (id === 'i2m-g' && sb) sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    if (id === 'i2m-send' && sb) {
      const email = q('i2m-email').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return say('Enter a valid email.', true);
      q('i2m-send').disabled = true; say('Sending…');
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      q('i2m-send').disabled = false;
      say(error ? error.message : 'Check your inbox and tap the link to sign in.', !!error);
    }
  });

  I.onChange = cb => { I.cbs.push(cb); cb(I); };
  const emit = () => { paintBar(); I.cbs.forEach(cb => { try { cb(I); } catch (e) {} }); };
  I.api = async (path, opts) => {
    opts = opts || {};
    const h = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (I.session) h.Authorization = 'Bearer ' + I.session.access_token;
    return fetch(path, Object.assign({}, opts, { headers: h }));
  };
  I.refresh = async () => {
    if (!I.session) { I.profile = null; return emit(); }
    try { const r = await I.api('/api/me'); if (r.ok) I.profile = await r.json(); } catch (e) {}
    emit();
  };
  I.setTokens = n => { if (I.profile) { I.profile.tokens = n; emit(); } };
  I.checkout = async () => { const r = await I.api('/api/checkout', { method: 'POST' }); const d = await r.json(); if (r.ok && d.url) { location.href = d.url; } return d; };
  I.portal = async () => { const r = await I.api('/api/portal', { method: 'POST' }); const d = await r.json(); if (r.ok && d.url) { location.href = d.url; } return d; };

  function paintBar() {
    const bar = q('authbar'); if (!bar) return;
    bar.replaceChildren();
    const mk = (tag, cls, txt, href) => { const e = document.createElement(tag); e.className = cls; e.textContent = txt; if (href) e.href = href; return e; };
    if (!ready) return;
    if (!I.session) { const b = mk('button', 'i2m-b p', 'Sign in'); b.id = 'i2m-login'; bar.append(b); return; }
    const t = mk('a', 'i2m-tok', '⚡ ' + (I.profile ? I.profile.tokens : '…'), '/pricing.html');
    bar.append(t);
    if (I.profile && I.profile.plan === 'pro') bar.append(mk('span', 'i2m-b', 'PRO'));
    else bar.append(mk('a', 'i2m-b p', 'Upgrade', '/pricing.html'));
    const o = mk('button', 'i2m-b', 'Sign out'); o.id = 'i2m-out'; bar.append(o);
  }

  if (sb) {
    sb.auth.getSession().then(({ data }) => { I.session = data.session; I.refresh(); });
    sb.auth.onAuthStateChange((ev, s) => { I.session = s; if (s) I.closeLogin(); I.refresh(); });
  } else { document.addEventListener('DOMContentLoaded', emit); }
  document.addEventListener('DOMContentLoaded', paintBar);
})();
