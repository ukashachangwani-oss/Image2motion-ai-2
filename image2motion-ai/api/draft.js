// POST /api/draft  -> AI-assisted blog draft (admin only). Requires env ADMIN_CODE + ANTHROPIC_API_KEY.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const admin = process.env.ADMIN_CODE, key = process.env.ANTHROPIC_API_KEY;
  if (!admin) return res.status(500).json({ error: 'ADMIN_CODE is not set in Vercel environment variables.' });
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not set.' });
  const b = req.body || {};
  if (b.code !== admin) return res.status(401).json({ error: 'Wrong admin code.' });
  const topic = String(b.topic || '').trim().slice(0, 300);
  if (!topic) return res.status(400).json({ error: 'Please enter a topic.' });
  const keywords = String(b.keywords || '').slice(0, 200);
  const words = { short: 600, standard: 900, long: 1300 }[b.length] || 900;
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `Write an original, genuinely useful blog post for "Image2Motion AI", a website with a free tool that turns an uploaded image into AI video motion prompts, scene ideas and a storyboard. The blog covers AI image-to-video, camera movement, prompt writing and video storytelling for creators.

Topic: ${topic}
${keywords ? 'Target keywords (use naturally): ' + keywords : ''}
Length: about ${words} words. Language: English.

Rules:
- Practical and specific: steps, examples, copy-ready sample prompts. No filler, no hype.
- Do NOT invent statistics, studies, quotes or claims about specific tools' features or prices.
- Use ## and ### headings, short paragraphs, bullet lists where helpful. Do not repeat the title as a heading.
- Mention the tool once, naturally, with the markdown link [Image2Motion AI](/).
- End with a short conclusion.

Output ONLY the markdown file, starting exactly with this front matter:
---
title: (clear, compelling, under 65 characters)
date: ${today}
description: (meta description, 140-155 characters)
tags: three to four lowercase tags, comma separated
---`;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: (d.error && d.error.message) || 'AI API error' });
    let md = (d.content || []).map(c => c.text || '').join('').trim().replace(/^```(?:markdown|md)?\n/, '').replace(/\n```$/, '');
    const t = (md.match(/^title:\s*(.+)$/m) || [])[1] || topic;
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70);
    return res.status(200).json({ markdown: md, filename: `${today}-${slug}.md` });
  } catch (e) {
    return res.status(500).json({ error: 'Could not generate the draft. Please try again.' });
  }
};
