// Zero-dependency static site builder: posts/*.md  ->  dist/blog/*.html (+ blog index, RSS, sitemap)
const fs = require('fs'), path = require('path');
const ROOT = __dirname, OUT = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const SITE = (process.env.SITE_URL || cfg.siteUrl).replace(/\/$/, '');
const NAME = cfg.name || 'Image2Motion AI';
const PLACEHOLDER = 'https://YOUR-DOMAIN.com';
const today = new Date().toISOString().slice(0, 10);

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
const safeUrl = u => (/^\s*(javascript|data):/i.test(u) ? '#' : u);

// ---------- tiny markdown ----------
function inline(t) {
  t = esc(t);
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => `<img src="${safeUrl(u)}" alt="${a}" loading="lazy" style="max-width:100%;border-radius:10px">`);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, u) => `<a href="${safeUrl(u)}">${a}</a>`);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return t;
}
function md(src) {
  const L = src.replace(/\r/g, '').split('\n'), out = [];
  let i = 0;
  const isBlock = l => /^(#{1,4}\s|```|>|[-*]\s+|\d+\.\s+|---+$)/.test(l);
  while (i < L.length) {
    const l = L[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) { const c = []; i++; while (i < L.length && !/^```/.test(L[i])) c.push(L[i++]); i++; out.push('<pre><code>' + esc(c.join('\n')) + '</code></pre>'); continue; }
    let m;
    if ((m = l.match(/^(#{1,4})\s+(.*)/))) { const n = m[1].length <= 2 ? 2 : m[1].length; out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^(---+|\*\*\*+)$/.test(l.trim())) { out.push('<hr>'); i++; continue; }
    if (/^>/.test(l)) { const c = []; while (i < L.length && /^>/.test(L[i])) c.push(L[i++].replace(/^>\s?/, '')); out.push('<blockquote>' + inline(c.join(' ')) + '</blockquote>'); continue; }
    if (/^[-*]\s+/.test(l)) { const c = []; while (i < L.length && /^[-*]\s+/.test(L[i])) c.push('<li>' + inline(L[i++].replace(/^[-*]\s+/, '')) + '</li>'); out.push('<ul>' + c.join('') + '</ul>'); continue; }
    if (/^\d+\.\s+/.test(l)) { const c = []; while (i < L.length && /^\d+\.\s+/.test(L[i])) c.push('<li>' + inline(L[i++].replace(/^\d+\.\s+/, '')) + '</li>'); out.push('<ol>' + c.join('') + '</ol>'); continue; }
    const p = [l]; i++;
    while (i < L.length && L[i].trim() && !isBlock(L[i])) p.push(L[i++]);
    out.push('<p>' + inline(p.join(' ')) + '</p>');
  }
  return out.join('\n');
}

// ---------- posts ----------
function parsePost(file) {
  const raw = fs.readFileSync(path.join(ROOT, 'posts', file), 'utf8').replace(/\r/g, '');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) { console.warn('SKIP (no front matter):', file); return null; }
  const fm = {};
  m[1].split('\n').forEach(l => { const k = l.match(/^([A-Za-z_]+):\s*(.*)$/); if (k) fm[k[1].toLowerCase()] = k[2].trim().replace(/^["']|["']$/g, ''); });
  const base = file.replace(/\.md$/, '');
  const dm = base.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
  const date = fm.date || (dm && dm[1]);
  const slug = (fm.slug || (dm ? dm[2] : base)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!fm.title || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.warn('SKIP (needs title + date):', file); return null; }
  if (/^(true|yes)$/i.test(fm.draft || '')) { console.log('draft, skipped:', file); return null; }
  if (date > today) { console.log('scheduled for', date + ', skipped:', file); return null; }
  const words = m[2].split(/\s+/).filter(Boolean).length;
  return { title: fm.title, date, slug, desc: fm.description || '', tags: (fm.tags || '').split(',').map(s => s.trim()).filter(Boolean), html: md(m[2]), mins: Math.max(1, Math.round(words / 200)), url: `/blog/${slug}.html` };
}
const posts = fs.existsSync(path.join(ROOT, 'posts'))
  ? fs.readdirSync(path.join(ROOT, 'posts')).filter(f => f.endsWith('.md') && !f.startsWith('_')).map(parsePost).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date))
  : [];

// ---------- layout ----------
const NAV = `<nav class="nav"><a class="b" href="/">${NAME}</a><a href="/">Tool</a><a href="/blog/">Blog</a><a href="/guides/">Guides</a><a href="/pricing.html">Pricing</a></nav>`;
function layout({ title, desc, path: p, type = 'website', body, ld }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${PLACEHOLDER}${p}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${PLACEHOLDER}${p}">
<meta name="twitter:card" content="summary">
<link rel="alternate" type="application/rss+xml" title="${esc(NAME)} Blog" href="/rss.xml">
<link rel="stylesheet" href="/guides/guide.css">
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
</head>
<body>
${NAV}
<main>
${body}
</main>
<footer><a href="/">Home</a> · <a href="/blog/">Blog</a> · <a href="/guides/">Guides</a> · <a href="/rss.xml">RSS</a> · <a href="/pricing.html">Pricing</a> · <a href="/legal/terms.html">Terms</a> · <a href="/legal/privacy.html">Privacy</a> · <a href="/legal/refund.html">Refunds</a> · &copy; ${esc(NAME)}</footer>
</body>
</html>
`;
}
const CTA = `<div class="cta"><b>Turn your image into a video plan.</b><br>Upload a photo and ${esc(NAME)} writes the motion prompts and storyboard for you.<br><a href="/">Try ${esc(NAME)} free</a></div>`;
const card = p => `<div class="card"><h2 style="margin:0 0 4px"><a href="${p.url}">${esc(p.title)}</a></h2><div class="meta" style="margin:0 0 6px">${fmtDate(p.date)} · ${p.mins} min read${p.tags.length ? ' · ' + p.tags.map(esc).join(', ') : ''}</div><p style="margin:0">${esc(p.desc)}</p></div>`;

// ---------- build ----------
function copyDir(a, b) { fs.mkdirSync(b, { recursive: true }); for (const f of fs.readdirSync(a)) { const s = path.join(a, f), d = path.join(b, f); fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d); } }
// ---- sanity check: give a clear message if the upload is incomplete ----
const STATIC = path.join(ROOT, 'static');
if (!fs.existsSync(STATIC) || !fs.existsSync(path.join(STATIC, 'index.html'))) {
  console.error('\n=====================================================================');
  console.error('BUILD STOPPED: the "static" folder (with index.html) is missing from your repository.');
  console.error('Files found in repo root: ' + fs.readdirSync(ROOT).filter(f => f !== 'node_modules' && f !== '.git').join(', '));
  console.error('FIX: unzip the project and upload the WHOLE folder contents to GitHub');
  console.error('(api, posts, static, supabase, build.js, package.json, site.json, vercel.json),');
  console.error('then check that github.com/<you>/<repo>/static/index.html exists. Then redeploy.');
  console.error('=====================================================================\n');
  process.exit(1);
}
const mustHave = ['auth.js', 'config.js', 'pricing.html', 'guides/guide.css', 'legal/terms.html', 'admin/index.html'];
const missing = mustHave.filter(f => !fs.existsSync(path.join(STATIC, f)));
if (missing.length) console.warn('WARNING: missing files in static/: ' + missing.join(', ') + ' (upload them, some features will not work)');

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(STATIC, OUT);
fs.mkdirSync(path.join(OUT, 'blog'), { recursive: true });

for (const p of posts) {
  const ld = { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.desc, datePublished: p.date, dateModified: p.date, author: { '@type': 'Organization', name: NAME }, publisher: { '@type': 'Organization', name: NAME }, mainEntityOfPage: PLACEHOLDER + p.url, keywords: p.tags.join(', ') };
  const body = `<article>
<h1>${esc(p.title)}</h1>
<div class="meta">${fmtDate(p.date)} · ${p.mins} min read${p.tags.length ? ' · ' + p.tags.map(esc).join(', ') : ''}</div>
${p.html}
</article>
${CTA}
<p><a href="/blog/">&larr; All posts</a></p>`;
  fs.writeFileSync(path.join(OUT, 'blog', p.slug + '.html'), layout({ title: `${p.title} | ${NAME}`, desc: p.desc, path: p.url, type: 'article', body, ld }));
}
fs.writeFileSync(path.join(OUT, 'blog', 'index.html'), layout({
  title: `AI Video & Image-to-Video Blog | ${NAME}`,
  desc: 'Daily tips, tutorials and ideas on AI image-to-video, motion prompts and video storytelling.',
  path: '/blog/',
  body: `<h1>Blog</h1><p class="meta">Tips, tutorials and ideas for AI image-to-video creators.</p>
${posts.length ? posts.map(card).join('\n') : '<p>No posts yet. Check back soon.</p>'}
${CTA}`
}));

// RSS
const rssItems = posts.slice(0, 20).map(p => `<item><title>${esc(p.title)}</title><link>${PLACEHOLDER}${p.url}</link><guid>${PLACEHOLDER}${p.url}</guid><pubDate>${new Date(p.date + 'T08:00:00Z').toUTCString()}</pubDate><description>${esc(p.desc)}</description></item>`).join('\n');
fs.writeFileSync(path.join(OUT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${esc(NAME)} Blog</title><link>${PLACEHOLDER}/blog/</link><description>AI image-to-video tips and tutorials</description>\n${rssItems}\n</channel></rss>\n`);

// sitemap
const guides = fs.existsSync(path.join(STATIC, 'guides')) ? fs.readdirSync(path.join(STATIC, 'guides')).filter(f => f.endsWith('.html') && f !== 'index.html') : [];
const urls = [['/', today], ['/pricing.html', today], ['/legal/terms.html', today], ['/legal/privacy.html', today], ['/legal/refund.html', today], ['/blog/', posts[0] ? posts[0].date : today], ['/guides/', today], ...guides.map(g => ['/guides/' + g, today]), ...posts.map(p => [p.url, p.date])];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${PLACEHOLDER}${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);

// homepage: latest posts block
const idx = path.join(OUT, 'index.html');
if (fs.existsSync(idx)) {
  const latest = posts.slice(0, 3);
  const block = latest.length ? `<section class="card sec"><h2>Latest from the blog</h2><ul>${latest.map(p => `<li><a href="${p.url}">${esc(p.title)}</a> <span style="color:var(--mu)">· ${fmtDate(p.date)}</span></li>`).join('')}</ul><p><a href="/blog/">Read the blog &rarr;</a></p></section>` : '';
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace('<!--LATEST_POSTS-->', block));
}

// inject public config (%%KEY%% placeholders in html/js). Only PUBLIC values belong here.
const E = process.env;
const KEYS = { SUPABASE_URL: E.SUPABASE_URL || '', SUPABASE_ANON_KEY: E.SUPABASE_ANON_KEY || '', PRO_PRICE: E.PRO_PRICE || '$9', PRO_TOKENS: E.PRO_TOKENS || '300', GOOGLE_LOGIN: E.GOOGLE_LOGIN || '0', SUPPORT_EMAIL: E.SUPPORT_EMAIL || ('support@' + new URL(SITE).hostname) };
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(html|js)$/.test(f)) { let t = fs.readFileSync(p, 'utf8'); if (t.includes('%%')) { for (const k in KEYS) t = t.split('%%' + k + '%%').join(KEYS[k]); fs.writeFileSync(p, t); } } } })(OUT);
if (!KEYS.SUPABASE_URL || !KEYS.SUPABASE_ANON_KEY) console.warn('WARNING: SUPABASE_URL / SUPABASE_ANON_KEY not set - login will be disabled.');

// domain replacement everywhere
if (SITE !== PLACEHOLDER) (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(html|xml|txt)$/.test(f)) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(PLACEHOLDER).join(SITE)); } })(OUT);

console.log(`Built ${posts.length} post(s) for ${SITE}`);
