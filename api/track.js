// Vercel serverless function — POST /api/track
// Captures visitor data and appends a row to the "users" sheet
// via Google Apps Script web app (TRACK_SHEET_URL env var).
// Never throws — tracking must never break the user experience.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sheetUrl = process.env.TRACK_SHEET_URL;
  // If not configured, silently succeed — don't error the client
  if (sheetUrl && req.method === 'POST') {
    try {
      const body = req.body || {};

      // IP: Vercel sets x-forwarded-for with the real client IP first
      const rawIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
      const ip = rawIp.split(',')[0].trim() || 'unknown';

      // Geo data injected by Vercel's edge network
      const country = decodeURIComponent(req.headers['x-vercel-ip-country']         || '');
      const city    = decodeURIComponent(req.headers['x-vercel-ip-city']            || '');
      const region  = decodeURIComponent(req.headers['x-vercel-ip-country-region']  || '');
      const lat     = req.headers['x-vercel-ip-latitude']  || '';
      const lon     = req.headers['x-vercel-ip-longitude'] || '';

      const ua      = req.headers['user-agent'] || '';
      const referer = req.headers['referer']    || '';

      // IST timestamp (UTC+5:30)
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const ist = new Date(now.getTime() + istOffset);
      const timestamp = ist.toISOString().replace('T', ' ').slice(0, 19) + ' IST';

      const row = {
        timestamp,
        ip,
        country,
        city,
        region,
        lat,
        lon,
        page:           body.page           || '',
        deviceType:     body.deviceType     || '',
        screenRes:      body.screenRes      || '',
        language:       body.language       || '',
        timezone:       body.timezone       || '',
        userAgent:      ua,
        referer,
        // CUET-specific (only present on results page)
        category:       body.category       || '',
        score:          body.score          || '',
        subjects:       body.subjects       || '',
        dreamCollege:   body.dreamCollege   || '',
      };

      // Fire-and-forget to Apps Script — we don't await the result
      fetch(sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(row),
      }).catch(() => {});
    } catch (_) {
      // never propagate tracking errors
    }
  }

  // Always return 204 immediately — non-blocking for the browser
  return res.status(204).end();
}
