// ============================================================
//  CUET College Campus — Results Page Logic v4 (production)
// ============================================================

let allResults    = [];
let filtered      = [];
let currentFilter = 'all';
let currentSort   = 'prob';
let userData      = null;
let visibleCount  = 50;        // pagination: how many cards to show
const PAGE_SIZE   = 50;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  let raw;
  try {
    raw = sessionStorage.getItem('cuetData');
  } catch (_) { raw = null; }

  if (!raw) {
    document.getElementById('resultsLoading').classList.add('hidden');
    document.getElementById('noDataState').classList.remove('hidden');
    return;
  }

  try {
    userData = JSON.parse(raw);
  } catch (_) {
    document.getElementById('resultsLoading').classList.add('hidden');
    document.getElementById('noDataState').classList.remove('hidden');
    return;
  }

  const loadingInterval = runLoadingAnimation(userData);

  // Load program data from API (Google Sheets) while animation plays
  try {
    await loadPrograms();
  } catch (_) {
    clearInterval(loadingInterval);
    document.getElementById('resultsLoading').classList.add('hidden');
    document.getElementById('noDataState').innerHTML = `
      <div class="no-data-icon">⚠️</div>
      <h2>Could not load program data</h2>
      <p>We couldn't fetch the program database. Please check your connection and try again.</p>
      <a href="index.html" class="btn-primary">← Go back</a>`;
    document.getElementById('noDataState').classList.remove('hidden');
    return;
  }

  // Wait for animation to finish (at least 2s), then show results
  const elapsed = Date.now() - (userData._loadStart || Date.now());
  const delay = Math.max(0, 2000 - elapsed);
  setTimeout(() => {
    clearInterval(loadingInterval);
    showResults(userData);
  }, delay);
});

// ── Loading animation ─────────────────────────────────────────
function runLoadingAnimation(data) {
  data._loadStart = Date.now();
  const steps = ['ls1','ls2','ls3','ls4','ls5'];
  let i = 0;
  const iv = setInterval(() => {
    if (i < steps.length) {
      document.getElementById(steps[i]).classList.add('visible');
      i++;
    } else {
      clearInterval(iv);
    }
  }, 380);
  return iv;  // return so caller can clear on error
}

// ── Compute & Render Results ──────────────────────────────────
function showResults(data) {
  const { name, category, composite, subjects } = data;
  const userSubjectSet = new Set(subjects || []);

  document.getElementById('resultName').textContent = `${name}'s 2026 Predictions`;
  document.getElementById('resultMeta').textContent =
    `CUET 2026 · ${category} category · Composite score: ${composite.toFixed(1)}`;

  // Only include programs where the student took at least one required subject
  const eligible = DU_DATA.filter(item => {
    if (!item.subjects || item.subjects.length === 0) return true;
    return item.subjects.some(s => userSubjectSet.has(s));
  });

  allResults = eligible.map(item => {
    const tier       = getProgramTier(item.cutoff.r1, item.maxComposite);
    const cutoff2026 = getProjectedCutoff2026(item, category);
    const prob       = calcProbability(composite, cutoff2026, tier);
    const probClass  = getProbClass(prob);
    const confidence = getConfidence(item);
    const trend      = getCutoffTrend(item.cutoff);
    // Use actual per-category cutoff when available; fall back to UR × factor
    const catF  = CATEGORY_FACTOR[category] || 1;
    const r1adj = item.cutoff.r1_cat?.[category] != null
      ? item.cutoff.r1_cat[category]
      : Math.round(item.cutoff.r1 * catF * 10) / 10;
    const r3adj = item.cutoff.r3_cat?.[category] != null
      ? item.cutoff.r3_cat[category]
      : (item.cutoff.r3 ? Math.round(item.cutoff.r3 * catF * 10) / 10 : '—');
    const r2adj = item.cutoff.r2
      ? Math.round(item.cutoff.r2 * catF * 10) / 10
      : (r1adj && r3adj && r3adj !== '—' ? Math.round((r1adj + r3adj) / 2 * 10) / 10 : '—');
    return { ...item, tier, cutoff2026, prob, probClass, confidence, trend, r1adj, r2adj, r3adj };
  });

  allResults.sort((a, b) => b.prob - a.prob);

  // Expose top predictions for the AI chat widget
  if (window.setChatPredictions) window.setChatPredictions(allResults.slice(0, 10));

  // Summary chips
  const safe     = allResults.filter(r => r.probClass === 'safe').length;
  const moderate = allResults.filter(r => r.probClass === 'moderate').length;
  const reach    = allResults.filter(r => r.probClass === 'reach').length;

  document.getElementById('resultSummaryChips').innerHTML = `
    <span class="summary-chip chip-safe">🟢 ${safe} Safe</span>
    <span class="summary-chip chip-moderate">🟡 ${moderate} Moderate</span>
    <span class="summary-chip chip-reach">🔴 ${reach} Reach</span>
    <span class="summary-chip chip-info">🎓 ${allResults.length} programs matched</span>
  `;

  // Dream Spotlight — match by college+program name (not fragile id)
  if (data.dreamCollege) {
    const dreamKey = (data.dreamCollege.college || '').toLowerCase().trim()
                   + '|' + (data.dreamCollege.program || '').toLowerCase().trim();
    const found = allResults.find(r =>
      r.college.toLowerCase().trim() + '|' + r.program.toLowerCase().trim() === dreamKey
    );
    if (found) renderDreamSpotlight(found, composite);
  }

  filtered = [...allResults];
  visibleCount = PAGE_SIZE;
  renderGrid();

  document.getElementById('resultsLoading').classList.add('hidden');
  const content = document.getElementById('resultsContent');
  content.classList.remove('hidden');
  content.classList.add('animate-in');
}

// ── Dream Spotlight ───────────────────────────────────────────
function renderDreamSpotlight(item, composite) {
  const el = document.getElementById('dreamSpotlight');
  const probColor = item.prob >= 65 ? '#4ade80' : item.prob >= 32 ? '#fcd34d' : '#fb7185';
  const pctLabel  = item.prob >= 65 ? '✅ Good chance!' : item.prob >= 32 ? '⚠️ Borderline' : '🔴 Very tough';
  const gap       = Math.round(composite - item.cutoff2026);
  const gapText   = gap >= 0
    ? `You are <b>+${gap}</b> above projected cutoff`
    : `You need <b>${Math.abs(gap)}</b> more marks`;

  el.innerHTML = `
    <div class="dream-label">⭐ Your Dream College</div>
    <div class="dream-title">${item.college}</div>
    <div class="dream-subtitle">${item.program}</div>
    <div class="dream-prob-row">
      <div class="dream-prob-num" style="color:${probColor}">${item.prob}%</div>
      <div>
        <div class="dream-prob-label">admission probability</div>
        <div class="dream-prob-verdict">${pctLabel}</div>
      </div>
    </div>
    <div class="dream-gap-text">${gapText}</div>
    <div class="dream-cutoff-row">
      <div class="dream-cutoff-item">
        <span class="dream-cutoff-label">R1 Cutoff (${userData.category})</span>
        <span class="dream-cutoff-val">${item.r1adj}</span>
      </div>
      <div class="dream-cutoff-item">
        <span class="dream-cutoff-label">R2 Cutoff</span>
        <span class="dream-cutoff-val">${item.r2adj}</span>
      </div>
      <div class="dream-cutoff-item">
        <span class="dream-cutoff-label">R3 Cutoff</span>
        <span class="dream-cutoff-val">${item.r3adj}</span>
      </div>
      <div class="dream-cutoff-item">
        <span class="dream-cutoff-label">Proj. 2026</span>
        <span class="dream-cutoff-val" style="color:#fcd34d">${item.cutoff2026}</span>
      </div>
      <div class="dream-cutoff-item">
        <span class="dream-cutoff-label">UR Seats</span>
        <span class="dream-cutoff-val">${item.seats || '—'}</span>
      </div>
    </div>
  `;
  el.classList.remove('hidden');
}

// ── Render Grid (with pagination) ─────────────────────────────
function renderGrid() {
  const grid  = document.getElementById('resultsGrid');
  const noMsg = document.getElementById('noResultsMsg');

  if (filtered.length === 0) {
    grid.innerHTML = '';
    noMsg.classList.remove('hidden');
    removeLoadMoreBtn();
    return;
  }
  noMsg.classList.add('hidden');
  grid.innerHTML = '';

  const toShow = filtered.slice(0, visibleCount);

  toShow.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = `result-card ${item.probClass} animate-in`;
    card.style.animationDelay = `${Math.min(idx * 0.03, 0.6)}s`;

    const gap     = Math.round(userData.composite - item.cutoff2026);
    const gapHtml = gap >= 0
      ? `<span class="gap-positive">+${gap} above cutoff</span>`
      : `<span class="gap-negative">${gap} below cutoff</span>`;
    const compRatio = item.totalApplicants && item.seats
      ? Math.round(item.totalApplicants / item.seats)
      : null;

    card.innerHTML = `
      <div class="result-card-header">
        <div class="result-college-name">${item.college}</div>
        <span class="prob-badge ${item.probClass}">${item.prob}%</span>
      </div>
      <div class="result-program">${item.program}</div>

      <div class="prob-bar-wrap">
        <div class="prob-bar-label">
          <span>Admission chance</span>
          <span>${item.prob}% · ${item.probClass === 'safe' ? '🟢 Safe' : item.probClass === 'moderate' ? '🟡 Moderate' : '🔴 Reach'}</span>
        </div>
        <div class="prob-bar-bg">
          <div class="prob-bar-fill" style="width:0%" data-width="${item.prob}%"></div>
        </div>
      </div>

      <div class="cutoff-rounds-row">
        <div class="round-cell">
          <div class="round-label">R1 2025</div>
          <div class="round-val">${item.r1adj}</div>
        </div>
        <div class="round-arrow">→</div>
        <div class="round-cell">
          <div class="round-label">R2 2025</div>
          <div class="round-val">${item.r2adj}</div>
        </div>
        <div class="round-arrow">→</div>
        <div class="round-cell">
          <div class="round-label">R3 2025</div>
          <div class="round-val">${item.r3adj}</div>
        </div>
        <div class="round-arrow">→</div>
        <div class="round-cell proj-cell">
          <div class="round-label">Proj. 2026</div>
          <div class="round-val proj-val">${item.cutoff2026}</div>
        </div>
      </div>

      <div class="result-card-footer">
        <div class="footer-left">
          ${gapHtml}
          ${item.seats ? `<span class="seats-info">🎓 ${item.seats} seats</span>` : ''}
          ${compRatio ? `<span class="competition-ratio">👥 ${compRatio}:1 ratio</span>` : ''}
        </div>
        <div class="footer-right">
          <span class="trend-badge ${item.trend.cls}">${item.trend.label}</span>
          <span class="confidence-badge ${item.confidence.cls}">${item.confidence.label}</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  // Animate probability bars
  requestAnimationFrame(() => {
    setTimeout(() => {
      document.querySelectorAll('.prob-bar-fill').forEach(bar => {
        bar.style.width = bar.dataset.width;
      });
    }, 80);
  });

  // Show/hide "Load More" button
  if (visibleCount < filtered.length) {
    showLoadMoreBtn(filtered.length - visibleCount);
  } else {
    removeLoadMoreBtn();
  }
}

// ── Load More pagination ──────────────────────────────────────
function showLoadMoreBtn(remaining) {
  let btn = document.getElementById('loadMoreBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.type = 'button';
    btn.className = 'btn-secondary load-more-btn';
    btn.addEventListener('click', loadMore);
    const grid = document.getElementById('resultsGrid');
    grid.parentNode.insertBefore(btn, grid.nextSibling);
  }
  btn.textContent = `Show ${Math.min(remaining, PAGE_SIZE)} more results (${remaining} remaining)`;
}

function removeLoadMoreBtn() {
  const btn = document.getElementById('loadMoreBtn');
  if (btn) btn.remove();
}

function loadMore() {
  visibleCount += PAGE_SIZE;
  renderGrid();
  // Scroll to where new cards start
  const cards = document.querySelectorAll('.result-card');
  if (cards.length > visibleCount - PAGE_SIZE) {
    cards[visibleCount - PAGE_SIZE]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ── Filter & Sort ─────────────────────────────────────────────
function applyFilter(btn) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  applyFiltersAndSort();
}

function filterResults() { applyFiltersAndSort(); }

function applyFiltersAndSort() {
  const q = (document.getElementById('collegeSearch').value || '').toLowerCase();
  filtered = allResults.filter(item => {
    const matchFilter = currentFilter === 'all' || item.probClass === currentFilter;
    const matchSearch = !q || item.college.toLowerCase().includes(q) || item.program.toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });
  visibleCount = PAGE_SIZE;   // reset pagination on filter change
  sortFiltered();
  renderGrid();
}

function sortResults() {
  currentSort = document.getElementById('sortBy').value;
  sortFiltered();
  renderGrid();
}

function sortFiltered() {
  if (currentSort === 'prob')   filtered.sort((a, b) => b.prob - a.prob);
  if (currentSort === 'alpha')  filtered.sort((a, b) => a.college.localeCompare(b.college));
  if (currentSort === 'cutoff') filtered.sort((a, b) => a.cutoff2026 - b.cutoff2026);
  if (currentSort === 'seats')  filtered.sort((a, b) => (b.seats || 0) - (a.seats || 0));
}

function resetFilters() {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.filter-chip[data-filter="all"]').classList.add('active');
  document.getElementById('collegeSearch').value = '';
  currentFilter = 'all';
  filtered = [...allResults];
  visibleCount = PAGE_SIZE;
  sortFiltered();
  renderGrid();
}
