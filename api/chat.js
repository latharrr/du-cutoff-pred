// Vercel serverless function — POST /api/chat
// Calls Claude Haiku with the student's CUET context and returns an AI reply.

const SYSTEM_PROMPT = `You are an expert CUET (Common University Entrance Test) admissions counsellor for Delhi University (DU) 2026. You help students understand their admission predictions and next steps.

Core knowledge:
- CUET score: each subject out of 250 marks (50 Qs × 5 marks)
- DU composite: Language + best domain subjects, typically best 4, max 1000
- DU runs 3 admission rounds; cutoffs drop each round (Round 3 is last chance)
- Categories: UR (General), OBC-NCL (non-creamy), SC, ST, EWS, PwBD
- "Safe" = 65%+ probability, "Moderate" = 32–64%, "Reach" = below 32%
- Projected 2026 cutoffs are statistical estimates — actual cutoffs may differ ±5–10%
- CSAS (Common Seat Allocation System): students fill preference list, seats allotted based on CUET rank + preferences

Guidelines:
- Be warm, concise, and specific — reference their actual scores and predictions
- When asked about a specific college, give actionable advice ("you're +12 above projected cutoff — lock it as first preference")
- For reach colleges, explain what they'd need ("you need ~8 more marks; possible if CUET retake improves one subject")
- Keep answers under 130 words unless the question genuinely needs more
- Answer in English. If student writes in Hindi, reply in Hindi`;

const FREEMODEL_BASE = 'https://api-cc.freemodel.dev';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.FREEMODEL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured on server' });

  let body;
  try { body = req.body || {}; } catch (_) { body = {}; }

  const { messages, context } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '"messages" array is required' });
  }

  // Validate message format, drop any with empty content
  const safeMessages = messages
    .filter(m => m.role && m.content && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content.trim() }))
    .slice(-12); // keep last 12 turns for context window efficiency

  if (safeMessages.length === 0) {
    return res.status(400).json({ error: 'No valid messages provided' });
  }

  const system = context
    ? `${SYSTEM_PROMPT}\n\n--- Student's data ---\n${context}\n---`
    : SYSTEM_PROMPT;

  try {
    const upstream = await fetch(`${FREEMODEL_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system,
        messages: safeMessages,
      }),
    });

    if (!upstream.ok) {
      const errBody = await upstream.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `FreeModel API ${upstream.status}`);
    }

    const data = await upstream.json();
    const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.';
    return res.json({ reply });
  } catch (err) {
    console.error('[chat] error:', err.message);
    return res.status(500).json({ error: err.message || 'Chat request failed' });
  }
}
