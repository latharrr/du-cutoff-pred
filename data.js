// ============================================================
//  CUET College Campus — Data Layer v3
//
//  DU_DATA is now loaded dynamically from Google Sheets via
//  the /api/programs endpoint. Call loadPrograms() on page
//  load; the global DU_DATA array is filled when it resolves.
//
//  All algorithm functions (tier, probability, composite, etc.)
//  remain here and are unchanged.
// ============================================================

// ── Subject lists ─────────────────────────────────────────────
const LANGUAGES = [
  "English","Hindi","Assamese","Bengali","Gujarati",
  "Kannada","Malayalam","Marathi","Odia","Punjabi","Sanskrit","Tamil","Telugu","Urdu"
];

const DOMAIN_SUBJECTS = [
  "Accountancy / Book Keeping","Agriculture","Anthropology",
  "Biology / Biotech / Biochemistry","Business Studies","Chemistry",
  "Environmental Science","Computer Science / Informatics Practices",
  "Economics / Business Economics","Fine Arts / Visual Arts",
  "Geography / Geology","History","Home Science","Knowledge Tradition - India",
  "Mass Media / Mass Communication","Mathematics / Applied Mathematics",
  "Performing Arts (Dance/Drama/Music)","Physical Education","Physics",
  "Political Science","Psychology","Sociology"
];

const APTITUDE_SUBJECTS = ["General Aptitude Test (GAT)"];

// Subject-wise CUET 2025 registered candidates (approx, NTA data)
const SUBJECT_CANDIDATES = {
  "English":                                    1420000,
  "Hindi":                                       980000,
  "Mathematics / Applied Mathematics":           610000,
  "Economics / Business Economics":              480000,
  "Accountancy / Book Keeping":                  430000,
  "Business Studies":                            410000,
  "Physics":                                     390000,
  "Chemistry":                                   360000,
  "Biology / Biotech / Biochemistry":            345000,
  "Political Science":                           290000,
  "History":                                     275000,
  "Sociology":                                   220000,
  "Geography / Geology":                         195000,
  "Psychology":                                  180000,
  "Computer Science / Informatics Practices":    165000,
  "General Aptitude Test (GAT)":                 140000,
  "Sanskrit":                                     95000,
  "Home Science":                                 85000,
  "Mass Media / Mass Communication":              78000,
  "Performing Arts (Dance/Drama/Music)":          55000,
  "Fine Arts / Visual Arts":                      48000,
  "Physical Education":                           42000,
  "Environmental Science":                        38000,
  "Anthropology":                                 25000,
  "Agriculture":                                  22000,
  "Knowledge Tradition - India":                  18000,
  "Assamese":12000,"Bengali":45000,"Gujarati":38000,"Kannada":32000,
  "Malayalam":42000,"Marathi":55000,"Odia":28000,"Punjabi":35000,
  "Tamil":48000,"Telugu":40000,"Urdu":30000,
};

// ── Live DU_DATA — populated by loadPrograms() ───────────────
// Do NOT assign DU_DATA entries here; data comes from Google Sheets.
var DU_DATA = [];

// Fetch programs from the serverless API (backed by Google Sheets).
// Fills the global DU_DATA array and resolves when done.
async function loadPrograms() {
  if (DU_DATA.length > 0) return; // already loaded
  let attempts = 0;
  while (attempts < 2) {
    try {
      const res = await fetch('/api/programs');
      if (!res.ok) throw new Error(`/api/programs returned ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.data)) throw new Error('Unexpected response shape');
      DU_DATA.push(...json.data);
      return;
    } catch (err) {
      attempts++;
      console.error(`[loadPrograms] attempt ${attempts} failed:`, err.message);
      if (attempts >= 2) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// ── Ticker items (homepage marquee) ──────────────────────────
// Kept hardcoded — these are display items, not calculation data.
const TICKER_ITEMS = [
  { college:"Shri Ram College of Commerce",            program:"B.Com (Hons.)" },
  { college:"Shri Ram College of Commerce",            program:"B.A. (Hons.) Economics" },
  { college:"Hindu College",                           program:"B.A. (Hons.) Economics" },
  { college:"Hindu College",                           program:"B.Com (Hons.)" },
  { college:"St. Stephen's College",                   program:"B.A. Economics" },
  { college:"Shaheed Sukhdev College of Business Studies", program:"BBA (Financial Investment Analysis)" },
  { college:"Shaheed Sukhdev College of Business Studies", program:"Bachelor of Management Studies" },
  { college:"Lady Shri Ram College for Women",         program:"B.A. (Hons.) Economics" },
  { college:"Hansraj College",                         program:"B.Com (Hons.)" },
  { college:"Miranda House",                           program:"B.Sc (Hons.) Physics" },
  { college:"Kirori Mal College",                      program:"B.Com (Hons.)" },
  { college:"Sri Venkateswara College",                program:"B.Com (Hons.)" },
  { college:"Atma Ram Sanatan Dharma College",         program:"B.A. (Hons.) Economics" },
  { college:"Daulat Ram College",                      program:"B.Sc (Hons.) Chemistry" },
  { college:"Ramjas College",                          program:"B.A. (Hons.) English" },
  { college:"Gargi College",                           program:"B.A. (Hons.) Political Science" },
];

// ── Category adjustment factors (vs UR/General cutoffs) ──────
const CATEGORY_FACTOR = {
  UR:   1.000,
  OBC:  0.932,
  SC:   0.815,
  ST:   0.782,
  EWS:  0.972,
  PwBD: 0.752,
};

// ── 2026 Projection factors (pool growth + top-end density) ──
const PROJECTION_FACTOR = {
  elite:  1.002, // 0.2% increase (realistic ceiling shift)
  high:   1.003, // 0.3% increase
  medium: 1.004, // 0.4% increase
  low:    1.005, // 0.5% increase
};

function getProgramTier(r1Cutoff, maxComposite) {
  const pct = r1Cutoff / maxComposite;
  if (pct >= 0.90) return 'elite';
  if (pct >= 0.82) return 'high';
  if (pct >= 0.70) return 'medium';
  return 'low';
}

function getProjectedCutoff2026(item, category) {
  const tier   = getProgramTier(item.cutoff.r1, item.maxComposite);
  const factor = PROJECTION_FACTOR[tier];
  // Use actual category R1 cutoff when available; fall back to UR × factor estimate
  const base   = item.cutoff.r1_cat?.[category] ?? item.cutoff.r1_cat?.UR
              ?? item.cutoff.r1 * (CATEGORY_FACTOR[category] || 1);
  const projected = base * factor;
  return Math.round(Math.min(projected, item.maxComposite) * 10) / 10;
}

// Sigmoid probability — calibrated to DU admission data
function calcProbability(score, cutoff2026, tier) {
  const sigma = { elite: 18, high: 22, medium: 28, low: 35 }[tier] || 28;
  const z = (score - cutoff2026) / sigma;
  const p = 1 / (1 + Math.exp(-z));
  return Math.min(Math.max(Math.round(p * 100), 1), 99);
}

function getProbClass(prob) {
  if (prob >= 65) return 'safe';
  if (prob >= 32) return 'moderate';
  return 'reach';
}

function getConfidence(item) {
  const pct = item.cutoff.r1 / item.maxComposite;
  if (pct >= 0.85) return { label: 'High confidence', cls: 'high' };
  if (pct >= 0.70) return { label: 'Medium confidence', cls: 'medium' };
  return { label: 'Lower confidence', cls: 'low' };
}

function getCutoffTrend(cutoff) {
  const diff = cutoff.r1 - cutoff.r3;
  if (diff > 15) return { label: '▼ Eased over rounds', cls: 'trend-ease' };
  if (diff > 5)  return { label: '↘ Slightly eased', cls: 'trend-slight' };
  return { label: '→ Stable', cls: 'trend-stable' };
}

// Composite = best Language paper + best 3 domain papers (DU CSAS rule)
// If no language selected, falls back to best 4 overall.
function calcCompositeScore(scores) {
  const langScores   = [];
  const domainScores = [];

  Object.entries(scores).forEach(([subj, val]) => {
    const v = parseFloat(val) || 0;
    if (v <= 0) return;
    if (LANGUAGES.includes(subj)) langScores.push(v);
    else domainScores.push(v);
  });

  langScores.sort((a, b) => b - a);
  domainScores.sort((a, b) => b - a);

  const parts = langScores.length > 0
    ? [langScores[0], ...domainScores.slice(0, 3)]   // Language + best 3 domain
    : domainScores.slice(0, 4);                        // No language — best 4 domain

  return parts.length === 0 ? 0 : Math.round(parts.reduce((a, b) => a + b, 0) * 10) / 10;
}


