// Vercel serverless function — POST /api/track
// Captures visitor data and appends to the "visits" sheet tab
// via Google Apps Script web app (TRACK_SHEET_URL env var).
// Never throws — tracking must never break the user experience.

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

  const sheetUrl = process.env.TRACK_SHEET_URL;
  if (sheetUrl && req.method === 'POST') {
    try {
      const body = req.body || {};

      const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
      const ip = rawIp.split(',')[0].trim() || 'unknown';

      const country = safeDecode(req.headers['x-vercel-ip-country']);
      const city    = safeDecode(req.headers['x-vercel-ip-city']);
      const region  = safeDecode(req.headers['x-vercel-ip-country-region']);
      const lat     = req.headers['x-vercel-ip-latitude']  || '';
      const lon     = req.headers['x-vercel-ip-longitude'] || '';

      const ua      = req.headers['user-agent'] || '';
      const referer = req.headers['referer']    || '';

      const row = {
        sheet:          'visits',
        type:           sanitize(body.type, 30) || 'visit',
        timestamp:      getIST(),
        ip,
        country,
        city,
        region,
        lat,
        lon,
        page:           sanitize(body.page, 100),
        deviceType:     sanitize(body.deviceType, 20),
        screenRes:      sanitize(body.screenRes, 20),
        language:       sanitize(body.language, 20),
        timezone:       sanitize(body.timezone, 60),
        userAgent:      ua.slice(0, 500),
        referer:        referer.slice(0, 500),
        category:       sanitize(body.category, 10),
        score:          sanitize(body.score, 10),
        subjects:       sanitize(body.subjects, 500),
        dreamCollege:   sanitize(body.dreamCollege, 200),
        step:           sanitize(body.step, 50),
        value:          sanitize(body.value, 200),
        name:           sanitize(body.name, 100),
        phone:          sanitize(body.phone, 15),
      };

      fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      }).catch(() => {});
    } catch (_) {
      // never propagate tracking errors
    }
  }

  return res.status(204).end();
}
