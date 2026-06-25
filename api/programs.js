// Vercel serverless function — GET /api/programs
// Reads Google Sheet CSV, infers subjects + maxComposite when blank,
// rounds all cutoff values to 1 dp, and returns DU_DATA JSON.
// Cache: 1 hour Vercel edge, 24 h stale-while-revalidate.

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const sheetUrl = process.env.GOOGLE_SHEET_CSV_URL;
  if (!sheetUrl) return res.status(500).json({ error: 'GOOGLE_SHEET_CSV_URL env var not set' });

  try {
    const response = await fetch(sheetUrl, { headers: { Accept: 'text/csv,text/plain' } });
    if (!response.ok) throw new Error(`Sheet returned ${response.status}`);

    const csv  = await response.text();
    const rows = parseCSV(csv);

    const data = rows
      .filter(r => r.college && r.program && r.r1)
      .map((r, i) => {
        const pf   = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
        const r1dp = v => v != null ? Math.round(v * 10) / 10 : null;  // 1 decimal place

        const CATS  = ['UR','OBC','SC','ST','EWS','PwBD'];
        const r1cat = {}, r3cat = {};
        for (const c of CATS) {
          r1cat[c] = r1dp(pf(r[`r1_${c}`]));
          r3cat[c] = r1dp(pf(r[`r3_${c}`]));
        }

        const prog = r.program.trim();

        // Subjects: use sheet value if filled, otherwise infer from program name
        const sheetSubjs = (r.subjects || '').split('|').map(s => s.trim()).filter(Boolean);
        const subjects   = sheetSubjs.length > 0 ? sheetSubjs : inferSubjects(prog);

        // maxComposite: use sheet value if filled, otherwise infer
        const rawMax       = parseInt(r.maxComposite);
        const maxComposite = (!isNaN(rawMax) && rawMax > 0)
          ? rawMax
          : inferMaxComposite(prog, subjects);

        return {
          id:              parseInt(r.id) || i + 1,
          college:         r.college.trim(),
          program:         prog,
          subjects,
          maxComposite,
          seats:           parseInt(r.seats)           || 0,
          totalApplicants: parseInt(r.totalApplicants)  || 0,
          cutoff: {
            r1:     r1dp(pf(r.r1_UR)) ?? r1dp(pf(r.r1)) ?? 0,
            r2:     r1dp(pf(r.r2))    ?? 0,
            r3:     r1dp(pf(r.r3_UR)) ?? r1dp(pf(r.r3)) ?? 0,
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

// ── Subject inference ─────────────────────────────────────────
// Returns CUET domain subjects a student must have taken to be eligible.
// Empty array = show for all students.
function inferSubjects(program) {
  const p = program.toLowerCase();

  // Commerce & Management
  if (/b\.com/.test(p))
    return ['Accountancy / Book Keeping','Business Studies','Economics / Business Economics'];
  if (/\bbms\b|bachelor of management studies/.test(p))
    return ['Accountancy / Book Keeping','Business Studies','Economics / Business Economics','Mathematics / Applied Mathematics'];
  if (/\bbba\b|financial investment analysis|bachelor of business/.test(p))
    return ['Accountancy / Book Keeping','Business Studies','Economics / Business Economics','Mathematics / Applied Mathematics'];

  // Economics (before generic B.A. catch-all)
  if (/economics/.test(p))
    return ['Economics / Business Economics','Mathematics / Applied Mathematics'];

  // Physical Sciences
  if (/\bphysics\b|physical sciences/.test(p))
    return ['Physics','Chemistry','Mathematics / Applied Mathematics'];
  if (/\bchemistry\b/.test(p) && !/bio/.test(p))
    return ['Chemistry','Physics','Mathematics / Applied Mathematics'];
  if (/\bstatistics\b|mathematical sciences/.test(p))
    return ['Mathematics / Applied Mathematics','Physics'];
  if (/\bmathematics\b/.test(p) && !/computer/.test(p))
    return ['Mathematics / Applied Mathematics','Physics'];
  if (/computer science|informatics practices/.test(p))
    return ['Computer Science / Informatics Practices','Mathematics / Applied Mathematics','Physics'];
  if (/\belectronics\b/.test(p))
    return ['Physics','Mathematics / Applied Mathematics','Chemistry'];
  if (/instrumentation/.test(p))
    return ['Physics','Mathematics / Applied Mathematics'];

  // Life Sciences
  if (/\bbiology\b|biomedical|biotechnology|biochemistry|microbiology/.test(p))
    return ['Biology / Biotech / Biochemistry','Chemistry'];
  if (/\bbotany\b|\bzoology\b/.test(p))
    return ['Biology / Biotech / Biochemistry','Chemistry'];
  if (/life sciences/.test(p))
    return ['Biology / Biotech / Biochemistry','Chemistry','Physics'];
  if (/food technology|food science|polymer|industrial chemistry/.test(p))
    return ['Biology / Biotech / Biochemistry','Chemistry'];
  if (/environmental science/.test(p))
    return ['Environmental Science','Biology / Biotech / Biochemistry'];
  if (/\banthropology\b/.test(p)) return ['Anthropology'];
  if (/\bagriculture\b/.test(p))  return ['Agriculture'];

  // Humanities
  if (/\bhistory\b/.test(p))        return ['History'];
  if (/political science/.test(p))  return ['Political Science'];
  if (/\bsociology\b/.test(p))      return ['Sociology'];
  if (/\bpsychology\b/.test(p))     return ['Psychology'];
  if (/geography|geology/.test(p))  return ['Geography / Geology'];
  if (/\bphilosophy\b/.test(p))     return ['General Aptitude Test (GAT)'];
  if (/journalism|mass comm|mass media/.test(p)) return ['Mass Media / Mass Communication'];
  if (/fine arts|visual arts/.test(p))           return ['Fine Arts / Visual Arts'];
  if (/\bmusic\b|\bdance\b|\bdrama\b|theatre|performing arts/.test(p))
    return ['Performing Arts (Dance/Drama/Music)'];
  if (/home science/.test(p))         return ['Home Science'];
  if (/physical education|sports science/.test(p)) return ['Physical Education'];
  if (/\bsanskrit\b/.test(p))         return ['Sanskrit'];
  if (/\bhindi\b/.test(p) && /hons/.test(p)) return ['Hindi'];
  if (/\burdu\b/.test(p))             return ['Urdu'];
  if (/\bpunjabi\b/.test(p))          return ['Punjabi'];
  if (/\bbengali\b/.test(p))          return ['Bengali'];
  if (/\btamil\b/.test(p))            return ['Tamil'];
  if (/\btelugu\b/.test(p))           return ['Telugu'];
  if (/\benglish\b/.test(p))          return ['English'];
  if (/social work/.test(p))          return ['Sociology','Political Science'];
  if (/knowledge tradition/.test(p))  return ['Knowledge Tradition - India'];

  // B.A. Programme — can take any humanities/commerce subject combination
  if (/\bprogramme\b|b\.a\. prog/.test(p)) {
    return [
      'History','Political Science','Sociology','Geography / Geology',
      'Psychology','Economics / Business Economics','English','Hindi',
      'Sanskrit','Mass Media / Mass Communication','Fine Arts / Visual Arts',
    ];
  }

  // Generic B.Sc (not Hons., fallback)
  if (/b\.sc/.test(p)) {
    return ['Physics','Chemistry','Mathematics / Applied Mathematics','Biology / Biotech / Biochemistry'];
  }

  return []; // unknown — show for all
}

// ── MaxComposite inference ────────────────────────────────────
// DU composite = Language (250) + N domain subjects (250 each)
function inferMaxComposite(program, subjects) {
  const p = program.toLowerCase();

  // 4-paper programs → 1000
  if (/b\.com|\bbms\b|\bbba\b|financial investment analysis|bachelor of management|bachelor of business/.test(p))
    return 1000;
  if (/b\.sc.*(physics|chemistry|computer|electronics|life sciences|physical sciences|mathematics|instrumentation|biochem|microbio|biomedical|polymer|food)/.test(p))
    return 1000;
  if (/b\.sc \(hons\)|b\.sc\. \(hons\)/.test(p))
    return 1000;

  // 3-paper programs → 750
  if (/economics|b\.sc.*(statistics|anthropology|environmental|geography|agriculture)/.test(p))
    return 750;
  if (/\bprogramme\b|b\.a\. prog/.test(p))
    return 750;

  // Single-subject Hons. → 500
  if (/\bhons\b/.test(p) && !/economics/.test(p) &&
    /history|political|sociology|psychology|geography|english|hindi|urdu|sanskrit|punjabi|bengali|tamil|telugu|philosophy|fine arts|visual arts|music|dance|drama|home science|physical education|journalism|mass/.test(p))
    return 500;

  // Infer from subject count as last resort
  if (subjects.length >= 3) return 1000;
  if (subjects.length === 2) return 750;
  if (subjects.length === 1) return 500;

  return 750;
}

// ── CSV parser ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
  if (lines.length < 2) return [];

  const parseRow = line => {
    const fields = [];
    let field = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(field.trim()); field = '';
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
    const row  = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || '').replace(/^"|"$/g, '').trim(); });
    rows.push(row);
  }
  return rows;
}
