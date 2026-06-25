// Vercel serverless function — POST /api/submit
// Fired when a student clicks "Calculate my chances".
// Saves full form submission to the "submissions" sheet tab via Apps Script.

function safeDecode(val) {
  try { return decodeURIComponent(val || ''); } catch (_) { return String(val || ''); }
}

function getIST() {
  return new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false }) + ' IST';
}

function sanitize(val, maxLen = 500) {
  return String(val || '').trim().slice(0, maxLen);
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sheetUrl = process.env.TRACK_SHEET_URL;
  if (!sheetUrl) return res.status(204).end();

  try {
    const body = req.body || {};

    const ip      = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
    const country = safeDecode(req.headers['x-vercel-ip-country']);
    const city    = safeDecode(req.headers['x-vercel-ip-city']);
    const region  = safeDecode(req.headers['x-vercel-ip-country-region']);

    await fetch(sheetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheet:        'submissions',
        type:         'submission',
        timestamp:    getIST(),
        ip,
        country,
        city,
        region,
        userAgent:    (req.headers['user-agent'] || '').slice(0, 500),
        name:         sanitize(body.name, 100),
        phone:        sanitize(body.phone, 15),
        category:     sanitize(body.category, 10),
        composite:    sanitize(body.composite, 10),
        subjects:     sanitize(body.subjects, 500),
        scores:       sanitize(body.scores, 1000),
        dreamCollege: sanitize(body.dreamCollege, 200),
        dreamProgram: sanitize(body.dreamProgram, 200),
        deviceType:   sanitize(body.deviceType, 20),
        language:     sanitize(body.language, 20),
        timezone:     sanitize(body.timezone, 60),
      }),
    });
  } catch (_) {}

  return res.status(204).end();
}
