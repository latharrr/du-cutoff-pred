// Vercel serverless function — GET /api/programs
// Reads your Google Sheet (published as CSV) and returns DU_DATA JSON.
// Cache: 1 hour on Vercel edge, 24-hour stale-while-revalidate.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!sheetUrl) {
    return res.status(500).json({ error: 'GOOGLE_SHEET_CSV_URL env var not set' });
  }

  try {
    const response = await fetch(sheetUrl, {
      headers: { Accept: 'text/csv,text/plain' },
    });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}`);

    const csv = await response.text();
    const rows = parseCSV(csv);

    const data = rows
      .filter(r => r.college && r.program && r.r1)
      .map((r, i) => {
        const pf = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const CATS = ['UR','OBC','SC','ST','EWS','PwBD'];
        const r1cat = {}, r3cat = {};
        for (const c of CATS) {
          r1cat[c] = pf(r[`r1_${c}`]);
          r3cat[c] = pf(r[`r3_${c}`]);
        }
        return {
          id: parseInt(r.id) || i + 1,
          college: r.college.trim(),
          program: r.program.trim(),
          subjects: (r.subjects || '').split('|').map(s => s.trim()).filter(Boolean),
          maxComposite: parseInt(r.maxComposite) || 750,
          seats: parseInt(r.seats) || 0,
          totalApplicants: parseInt(r.totalApplicants) || 0,
          cutoff: {
            r1:     pf(r.r1_UR) ?? pf(r.r1) ?? 0,
            r2:     pf(r.r2)    ?? 0,
            r3:     pf(r.r3_UR) ?? pf(r.r3) ?? 0,
            r1_cat: r1cat,
            r3_cat: r3cat,
          },
        };
      });

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return res.json({ data, count: data.length });
  } catch (err) {
    console.error('[programs] fetch error:', err.message);
    return res.status(500).json({ error: 'Failed to load program data from sheet' });
  }
}

// Handles quoted fields and commas inside quotes.
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];

  const parseRow = (line) => {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || '').replace(/^"|"$/g, '').trim(); });
    rows.push(row);
  }
  return rows;
}
