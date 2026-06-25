// Vercel serverless function — POST /api/submit
// Fired when a student clicks "Calculate my chances".
// Saves full form submission (name, phone, scores, category, etc.)
// to the "submissions" sheet via the shared Apps Script webhook.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sheetUrl = process.env.TRACK_SHEET_URL;
  if (sheetUrl && req.method === 'POST') {
    try {
      const body = req.body || {};

      const ip     = (req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim() || 'unknown';
      const country = decodeURIComponent(req.headers['x-vercel-ip-country']        || '');
      const city    = decodeURIComponent(req.headers['x-vercel-ip-city']           || '');
      const region  = decodeURIComponent(req.headers['x-vercel-ip-country-region'] || '');
      const ua      = req.headers['user-agent'] || '';

      const now = new Date();
      const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      const timestamp = ist.toISOString().replace('T', ' ').slice(0, 19) + ' IST';

      fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:         'submission',
          timestamp,
          ip,
          country,
          city,
          region,
          userAgent:    ua,
          name:         body.name         || '',
          phone:        body.phone        || '',
          category:     body.category     || '',
          composite:    body.composite    || '',
          subjects:     body.subjects     || '',
          scores:       body.scores       || '',
          dreamCollege: body.dreamCollege || '',
          dreamProgram: body.dreamProgram || '',
          deviceType:   body.deviceType   || '',
          language:     body.language     || '',
          timezone:     body.timezone     || '',
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  return res.status(204).end();
}
