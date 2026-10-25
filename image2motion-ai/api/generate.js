const LANGS = ["English", "Urdu (اردو)", "Roman Urdu", "Hindi (हिन्दी)", "Arabic (العربية)", "Bengali (বাংলা)", "Punjabi (ਪੰਜਾਬੀ)", "Pashto (پښتو)", "Spanish (Español)", "French (Français)", "German (Deutsch)", "Portuguese (Português)", "Italian (Italiano)", "Russian (Русский)", "Turkish (Türkçe)", "Indonesian (Bahasa Indonesia)", "Chinese Simplified (简体中文)", "Japanese (日本語)", "Korean (한국어)"];
const sb = require('./_sb');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!sb.configured()) return res.status(500).json({ error: 'Server is not configured (Supabase variables missing).' });
  const gemini = String(process.env.AI_PROVIDER || '').toLowerCase() === 'gemini';
  const key = gemini ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: (gemini ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY') + ' is not set.' });

  const user = await sb.userFromReq(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to generate a plan.', needLogin: true });

  const b = req.body || {};
  if (!b.image || typeof b.image !== 'string' || b.image.length > 4000000)
    return res.status(400).json({ error: 'Image is missing or too large.' });

  const dur = [5, 10, 15, 30].includes(+b.dur) ? +b.dur : 10;
  const ar = ['16:9', '9:16', '1:1'].includes(b.ar) ? b.ar : '16:9';
  const lang = LANGS.includes(b.lang) ? b.lang : 'English';
  const promptsLang = b.promptsEn === false ? lang : 'English';
  const style = String(b.style || 'Cinematic').slice(0, 40);
  const note = String(b.note || '').slice(0, 300);
  const n = dur <= 5 ? 3 : dur <= 10 ? 4 : dur <= 15 ? 5 : 7;

  // 1 generation = 1 token. Deduct first (atomic), refund if the AI call fails.
  try { await sb.ensureProfile(user); } catch (e) { return res.status(500).json({ error: 'Account error. Please try again.' }); }
  let left;
  try { left = await sb.rpc('consume_token', { uid: user.id }); } catch (e) { return res.status(500).json({ error: 'Could not check your tokens. Please try again.' }); }
  if (left < 0) return res.status(402).json({ error: 'You have no tokens left. Upgrade to Pro to keep generating.', needUpgrade: true, tokens: 0 });
  const refund = () => sb.rpc('add_tokens', { uid: user.id, n: 1 }).catch(() => {});

  const prompt = `You are a video director and AI video prompt engineer. Study the attached image and plan how to animate it into a ${dur}-second ${ar} video in "${style}" style.${note ? ` User's idea: ${note}.` : ''}
Return ONLY JSON, no markdown:
{"summary":"1-2 sentences describing the image","mood":"short mood","tags":["3-5 keywords"],
"motion_prompts":[{"title":"short name","prompt":"ready-to-paste image-to-video prompt, 25-45 words, describing subject motion, camera move, lighting, atmosphere"}] (exactly 4, varied),
"scenes":[{"title":"short","idea":"1-2 sentence scene idea"}] (exactly 4),
"storyboard":[{"shot":1,"duration":"2s","visual":"what we see","camera":"camera move","motion":"what moves","voiceover":"short narration or on-screen caption for this shot, max 15 words","prompt":"generation prompt for this shot"}] (exactly ${n} shots, durations sum to ~${dur}s)}
Write summary, mood, scene ideas and storyboard visual/motion/camera descriptions in ${lang}, including titles, tags and the voiceover lines (voiceover should sound natural for a ${lang}-speaking audience). All "prompt" fields (motion_prompts and storyboard) must be written in ${promptsLang}.`;

  try {
    let text;
    if (gemini) {
      const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: b.image } }, { text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 6000 }
        })
      });
      const data = await r.json();
      if (!r.ok) { await refund(); return res.status(502).json({ error: ((data.error && data.error.message) || 'AI API error') + ' (your token was not used)' }); }
      const parts = (((data.candidates || [])[0] || {}).content || {}).parts || [];
      text = parts.map(x => x.text || '').join('');
    } else {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
          max_tokens: 3000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b.image } },
            { type: 'text', text: prompt }
          ] }]
        })
      });
      const data = await r.json();
      if (!r.ok) { await refund(); return res.status(502).json({ error: (data.error && data.error.message) || 'AI API error. Your token was not used.' }); }
      text = (data.content || []).map(c => c.text || '').join('');
    }
    text = text.replace(/```json|```/g, '').trim();
    const plan = JSON.parse(text);
    return res.status(200).json({ plan, tokens: left });
  } catch (e) {
    await refund();
    return res.status(500).json({ error: 'Could not generate the plan. Your token was not used. Please try again.' });
  }
};
