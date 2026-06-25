// ============================================================
//  CUET College Campus — Home Page App Logic v3
// ============================================================

const state = {
  selectedSubjects: new Set(),
  scores: {},
  category: 'UR',
  dreamCollege: null,
  phone: '',
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  buildChips();
  buildTicker();
  updateCTA();
  document.getElementById('studentName').addEventListener('input', updateCTA);
  document.getElementById('studentPhone').addEventListener('input', e => {
    // strip non-digits, max 10
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 10);
    state.phone = e.target.value;
  });
  setupDreamSearch();

  // Load programs from Google Sheets in background.
  // Dream search is disabled until this resolves.
  try {
    await loadPrograms();
    updateDreamSearch(); // enable once data is ready
  } catch (_) {
    const input = document.getElementById('dreamCollegeSearch');
    input.placeholder = 'Program data unavailable — try refreshing';
    input.disabled = true;
  }
});

// ── Build subject chips ──────────────────────────────────────
function buildChips() {
  buildChipGroup('langChips',   LANGUAGES,         'lang');
  buildChipGroup('domainChips', DOMAIN_SUBJECTS,   'domain');
  buildChipGroup('aptChips',    APTITUDE_SUBJECTS, 'apt');
}

function buildChipGroup(containerId, items, group) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  items.forEach(subj => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.subject = subj;
    btn.dataset.group = group;
    btn.innerHTML = `<span>${subj}</span>`;
    btn.addEventListener('click', () => toggleSubject(btn, subj));
    container.appendChild(btn);
  });
}

function toggleSubject(btn, subj) {
  if (state.selectedSubjects.has(subj)) {
    state.selectedSubjects.delete(subj);
    btn.classList.remove('selected');
    delete state.scores[subj];
  } else {
    state.selectedSubjects.add(subj);
    btn.classList.add('selected');
  }
  rebuildScoreInputs();
  updateDreamSearch();
  updateCTA();
}

// ── Build score inputs ───────────────────────────────────────
function rebuildScoreInputs() {
  const container = document.getElementById('scoreInputsContainer');
  if (state.selectedSubjects.size === 0) {
    container.innerHTML = `
      <div class="score-empty-state">
        <div class="score-empty-icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path></svg>
        </div>
        Select subjects in Step 1 to enter your scores here.
      </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'scores-grid';

  state.selectedSubjects.forEach(subj => {
    const candidateCount = SUBJECT_CANDIDATES[subj];
    const candidateText  = candidateCount
      ? `~${(candidateCount / 1000).toFixed(0)}k students appeared`
      : '';

    const shortName = subj.length > 30 ? subj.slice(0, 30) + '…' : subj;
    const id = `score_${encodeSubj(subj)}`;

    const wrap = document.createElement('div');
    wrap.className = 'score-field-wrap';
    wrap.innerHTML = `
      <label class="score-label" for="${id}">${shortName}</label>
      ${candidateText ? `<div class="score-candidate-hint">👥 ${candidateText}</div>` : ''}
      <div class="score-input-group">
        <input
          type="number"
          id="${id}"
          class="score-field"
          placeholder="0"
          min="0" max="250" step="0.01"
          value="${state.scores[subj] || ''}"
          data-subject="${subj}"
        />
        <span class="score-max">/ 250</span>
      </div>`;
    wrap.querySelector('input').addEventListener('input', e => {
      let val = parseFloat(e.target.value);
      if (val > 250) { val = 250; e.target.value = 250; }
      if (val < 0)   { val = 0;   e.target.value = 0; }
      state.scores[subj] = val || '';
      updateLiveComposite();
      updateCTA();
    });
    grid.appendChild(wrap);
  });

  const preview = document.createElement('div');
  preview.id = 'compositePreview';
  preview.className = 'composite-preview';
  preview.innerHTML = `
    <div class="composite-label">Your composite score (best 4 subjects)</div>
    <div class="composite-value" id="compositeVal">—</div>
    <div class="composite-hint">Max: ${state.selectedSubjects.size >= 4 ? 1000 : state.selectedSubjects.size * 250} · DU uses Language + best domains</div>
  `;

  container.innerHTML = '';
  container.appendChild(grid);
  container.appendChild(preview);
  updateLiveComposite();
}

function updateLiveComposite() {
  const el = document.getElementById('compositeVal');
  if (!el) return;
  const comp = calcCompositeScore(state.scores);
  el.textContent = comp > 0 ? comp.toFixed(1) : '—';
  const pct = comp / 1000;
  if (comp === 0)       el.style.color = 'var(--slate-400)';
  else if (pct >= 0.75) el.style.color = 'var(--emerald)';
  else if (pct >= 0.55) el.style.color = 'var(--amber)';
  else                  el.style.color = 'var(--rose)';
}

function encodeSubj(s) { return s.replace(/[^a-zA-Z0-9]/g, '_'); }

// ── Category selection ────────────────────────────────────────
function selectCategory(btn) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.category = btn.dataset.cat;
}

// ── Dream College Search ──────────────────────────────────────
function updateDreamSearch() {
  const input = document.getElementById('dreamCollegeSearch');
  if (state.selectedSubjects.size === 0) {
    input.disabled = true;
    input.placeholder = 'Pick subjects in Step 1 first…';
  } else if (DU_DATA.length === 0) {
    input.disabled = true;
    input.placeholder = 'Loading programs…';
  } else {
    input.disabled = false;
    input.placeholder = 'Search college or course…';
  }
}

function setupDreamSearch() {
  const input    = document.getElementById('dreamCollegeSearch');
  const dropdown = document.getElementById('searchDropdown');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    dropdown.innerHTML = '';
    if (q.length < 2 || DU_DATA.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    // Filter only programs whose required subjects match what the user took
    const userSubjects = state.selectedSubjects;
    const matches = DU_DATA.filter(d => {
      const textMatch = d.college.toLowerCase().includes(q) || d.program.toLowerCase().includes(q);
      const subjectMatch = d.subjects.length === 0 ||
        d.subjects.some(s => userSubjects.has(s));
      return textMatch && subjectMatch;
    }).slice(0, 12);

    if (matches.length === 0) { dropdown.classList.add('hidden'); return; }

    matches.forEach(item => {
      const el = document.createElement('div');
      el.className = 'dropdown-item';
      el.innerHTML = `
        <div class="dropdown-item-college">${item.college}</div>
        <div class="dropdown-item-course">${item.program} · ${item.seats} UR seats · R1: ${item.cutoff.r1}</div>`;
      el.addEventListener('click', () => {
        selectDreamCollege(item);
        dropdown.classList.add('hidden');
        input.value = '';
      });
      dropdown.appendChild(el);
    });
    dropdown.classList.remove('hidden');
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });
}

function selectDreamCollege(item) {
  state.dreamCollege = item;
  const el = document.getElementById('selectedDream');
  el.innerHTML = `
    <div class="selected-dream-college">⭐ ${item.college}</div>
    <div class="selected-dream-course">${item.program}</div>
    <div class="selected-dream-meta">${item.seats} UR seats · R1 cutoff: ${item.cutoff.r1} · R2: ${item.cutoff.r2} · R3: ${item.cutoff.r3}</div>
  `;
  el.classList.remove('hidden');
}

// ── Ticker ───────────────────────────────────────────────────
function buildTicker() {
  const track = document.getElementById('tickerTrack');
  const all = [...TICKER_ITEMS, ...TICKER_ITEMS];
  all.forEach(item => {
    const div = document.createElement('div');
    div.className = 'ticker-item';
    div.innerHTML = `<span class="ticker-star">✦</span><span class="ticker-college">${item.college}</span><span class="ticker-sep">—</span><span class="ticker-program">${item.program}</span>`;
    track.appendChild(div);
  });
}

// ── Update CTA button state ──────────────────────────────────
function updateCTA() {
  const btn      = document.getElementById('calculateBtn');
  const name     = document.getElementById('studentName').value.trim();
  const hasSubj  = state.selectedSubjects.size > 0;
  const hasScore = Object.values(state.scores).some(v => parseFloat(v) > 0);
  const hasName  = name.length >= 2;
  btn.disabled   = !(hasSubj && hasScore && hasName);
}

// ── Calculate & navigate ─────────────────────────────────────
function calculateChances() {
  const name  = document.getElementById('studentName').value.trim();
  const phone = (document.getElementById('studentPhone').value || '').trim();
  if (!name || name.length < 2) { alert('Please enter your name first.'); return; }
  if (state.selectedSubjects.size === 0) { alert('Please select at least one subject.'); return; }
  const composite = calcCompositeScore(state.scores);
  if (composite < 1) { alert('Please enter at least one score.'); return; }

  sessionStorage.setItem('cuetData', JSON.stringify({
    name,
    phone,
    category: state.category,
    scores: state.scores,
    composite,
    subjects: Array.from(state.selectedSubjects),
    dreamCollege: state.dreamCollege,
    timestamp: Date.now(),
  }));

  // Fire-and-forget — save form submission to analytics sheet
  try {
    const w = screen.width;
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        phone,
        category:     state.category,
        composite:    Math.round(composite * 10) / 10,
        subjects:     Array.from(state.selectedSubjects).join('|'),
        scores:       JSON.stringify(state.scores),
        dreamCollege: state.dreamCollege ? state.dreamCollege.college : '',
        dreamProgram: state.dreamCollege ? state.dreamCollege.program : '',
        deviceType:   w <= 768 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop',
        language:     navigator.language || '',
        timezone:     (Intl && Intl.DateTimeFormat) ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
      }),
      keepalive: true,
    }).catch(function() {});
  } catch (_) {}

  const btn     = document.getElementById('calculateBtn');
  const spinner = document.getElementById('btnSpinner');
  btn.querySelector('.btn-text').textContent = 'Computing…';
  spinner.classList.remove('hidden');
  btn.disabled = true;

  setTimeout(() => { window.location.href = 'results.html'; }, 900);
}
