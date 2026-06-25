"""
Extract DU 2025-26 Round 1 & Round 3 cutoffs from PDFs.
Table structure: each logical column is split into 3 sub-columns.
  col[0]  = S.NO.
  col[3]  = COLLEGE NAME
  col[6]  = PROGRAM NAME
  col[9]  = UR
  col[12] = OBC
  col[15] = SC
  col[18] = ST
  col[21] = EWS
  col[24] = PwBD

Usage:
  python extract_cutoffs.py --r1 path/to/round1.pdf --r3 path/to/round3.pdf --out du_cutoffs_combined.csv
"""
import sys, re, csv, argparse
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

import pdfplumber

CATS_IDX = {'UR': 9, 'OBC': 12, 'SC': 15, 'ST': 18, 'EWS': 21, 'PwBD': 24}
CATS     = ['UR','OBC','SC','ST','EWS','PwBD']

def clean(v):
    return str(v).strip().replace('\n', ' ') if v else ''

def parse_num(v):
    s = clean(v).replace(',', '')
    try: return round(float(s), 4)
    except: return None

def is_header(row):
    text = ' '.join(clean(c) for c in row if c)
    return bool(re.search(r'S\.NO|COLLEGE NAME|PROGRAM NAME|MINIMUM ALLOCATION', text, re.I))

def extract_pdf(path, label):
    results = {}   # key = (sno, college_lower, program_lower) -> dict
    last_college = ''

    with pdfplumber.open(path) as pdf:
        total = len(pdf.pages)
        for pi, page in enumerate(pdf.pages):
            if pi % 10 == 0:
                print(f"  [{label}] page {pi+1}/{total}", flush=True)

            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row:
                        continue
                    if is_header(row):
                        continue

                    # S.NO. is always at index 0
                    sno_str = clean(row[0])
                    try:
                        sno = int(sno_str)
                    except ValueError:
                        continue

                    # Data at fixed indices
                    college = clean(row[3]) if len(row) > 3 else ''
                    program = clean(row[6]) if len(row) > 6 else ''

                    if college:
                        last_college = college
                    elif last_college:
                        college = last_college

                    cats = {}
                    for cat, idx in CATS_IDX.items():
                        cats[cat] = parse_num(row[idx]) if len(row) > idx else None

                    key = (sno, college.lower().strip(), program.lower().strip())
                    results[key] = {
                        'sno':     sno,
                        'college': college,
                        'program': program,
                        **cats,
                    }

    return results

def main():
    parser = argparse.ArgumentParser(description='Extract DU cutoffs from Round 1 & Round 3 PDFs')
    parser.add_argument('--r1', required=True, help='Path to Round 1 cutoff PDF')
    parser.add_argument('--r3', required=True, help='Path to Round 3 cutoff PDF')
    parser.add_argument('--out', default='du_cutoffs_combined.csv', help='Output CSV path (default: du_cutoffs_combined.csv)')
    args = parser.parse_args()

    print("=== Extracting Round 1 ===")
    r1_data = extract_pdf(args.r1, 'R1')
    print(f"  Total R1 entries: {len(r1_data)}")

    print("\n=== Extracting Round 3 ===")
    r3_data = extract_pdf(args.r3, 'R3')
    print(f"  Total R3 entries: {len(r3_data)}")

    # Show sample
    print("\nSample R1:")
    for k, v in list(r1_data.items())[:3]:
        print(f"  {v['college'][:35]}  |  {v['program'][:40]}  |  UR={v['UR']}")

    # ── Merge ──────────────────────────────────────────────────────
    combined = {}

    for (sno, col_l, prog_l), row in r1_data.items():
        mk = (col_l, prog_l)
        combined[mk] = {
            'sno':     sno,
            'college': row['college'],
            'program': row['program'],
            **{f'r1_{c}': row[c] for c in CATS},
            **{f'r3_{c}': None for c in CATS},
        }

    matched  = 0
    unmatched = 0
    for (sno, col_l, prog_l), row in r3_data.items():
        mk = (col_l, prog_l)
        if mk in combined:
            for c in CATS:
                combined[mk][f'r3_{c}'] = row[c]
            matched += 1
        else:
            combined[mk] = {
                'sno':     sno,
                'college': row['college'],
                'program': row['program'],
                **{f'r1_{c}': None for c in CATS},
                **{f'r3_{c}': row[c] for c in CATS},
            }
            unmatched += 1

    print(f"\n=== Combined: {len(combined)} unique programs ===")
    print(f"  R3 matched to R1: {matched}")
    print(f"  R3 only (not in R1): {unmatched}")

    # Sort by college + program
    rows = sorted(combined.values(), key=lambda x: (x['college'].lower(), x['program'].lower()))
    for i, r in enumerate(rows, 1):
        r['id'] = i

    # Compute interpolated R2 = midpoint of R1_UR and R3_UR
    for r in rows:
        r1u = r.get('r1_UR')
        r3u = r.get('r3_UR')
        if r1u and r3u:
            r['r2'] = round((r1u + r3u) / 2, 4)
        else:
            r['r2'] = r1u or r3u or ''

    # ── Write CSV ──────────────────────────────────────────────────
    COLS = [
        'id','college','program','subjects','maxComposite','seats','totalApplicants',
        'r1','r2','r3',
        'r1_UR','r1_OBC','r1_SC','r1_ST','r1_EWS','r1_PwBD',
        'r3_UR','r3_OBC','r3_SC','r3_ST','r3_EWS','r3_PwBD',
    ]

    with open(args.out, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=COLS, extrasaction='ignore')
        writer.writeheader()
        for r in rows:
            writer.writerow({
                'id':              r['id'],
                'college':         r['college'],
                'program':         r['program'],
                'subjects':        '',
                'maxComposite':    '',
                'seats':           '',
                'totalApplicants': '',
                'r1':  r.get('r1_UR') or '',
                'r2':  r.get('r2')    or '',
                'r3':  r.get('r3_UR') or '',
                **{k: r.get(k) or '' for k in COLS if k.startswith('r1_') or k.startswith('r3_')},
            })

    print(f"\nCSV written to: {args.out}")
    print("\nFirst 10 rows:")
    for r in rows[:10]:
        r1u = r.get('r1_UR', '')
        r3u = r.get('r3_UR', '')
        print(f"  {r['id']:4d}  {r['college'][:38]:38}  {r['program'][:42]:42}  R1={r1u}  R3={r3u}")

if __name__ == '__main__':
    main()
