// ============================================================
//  CUET College Campus — Entry Gate v2 (production)
//  Blocks the site until the user gives their name (+ optional
//  phone). Uses psychological trust triggers. Stores the
//  submission in localStorage so returning users skip it.
//  On success: pre-fills Step 4, fires /api/lead (fire & forget).
// ============================================================

(function () {
  var STORAGE_KEY = 'cuet_gate_v1';

  // ── Check if already unlocked ─────────────────────────────
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}

  // Also check sessionStorage (set by app.js after form submit)
  // so users who just submitted don't see the gate again on results page
  if (!stored) {
    try { stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) {}
  }

  // If user has cuetData in sessionStorage (they just filled the form), skip gate
  if (!stored) {
    try {
      var cuetRaw = sessionStorage.getItem('cuetData');
      if (cuetRaw) {
        var cuetData = JSON.parse(cuetRaw);
        if (cuetData && cuetData.name && cuetData.name.length >= 2) {
          stored = { name: cuetData.name, phone: cuetData.phone || '', ts: cuetData.timestamp };
        }
      }
    } catch (_) {}
  }

  if (stored && stored.name && stored.name.length >= 2) {
    // Returning visitor — pre-fill form silently and exit
    document.addEventListener('DOMContentLoaded', function () { prefillForm(stored); });
    return;
  }

  // ── Build overlay ─────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    var overlay = document.createElement('div');
    overlay.id = 'entryGate';
    overlay.innerHTML = [
      '<div class="gate-backdrop"></div>',
      '<div class="gate-card">',

        // Badge
        '<div class="gate-badge">',
          '<span class="gate-badge-dot"></span>',
          '<span>Free for CUET 2026 students</span>',
        '</div>',

        // Headline
        '<h2 class="gate-title">Unlock Your Free<br/>DU Admission Report</h2>',
        '<p class="gate-sub">',
          'See your real admission chances at every Delhi University program ',
          'powered by <strong>official DU 2025-26 cutoff data</strong>.',
        '</p>',

        // Benefits
        '<ul class="gate-benefits">',
          '<li><span class="gate-check">✓</span>',
            '<span>Admission probability at <b>1,529 programs</b> across all 67 DU colleges</span></li>',
          '<li><span class="gate-check">✓</span>',
            '<span>Real 2025-26 cutoffs for <b>all 6 reservation categories</b></span></li>',
          '<li><span class="gate-check">✓</span>',
            '<span>Personal <b>AI counsellor</b> trained on DU CSAS. Ask anything.</span></li>',
        '</ul>',

        // Form
        '<div class="gate-form">',
          '<div class="gate-field">',
            '<label class="gate-label" for="gateName">Your Name <span class="gate-required">*</span></label>',
            '<input type="text" id="gateName" class="gate-input" placeholder="e.g. Priya Sharma"',
              ' autocomplete="name" />',
          '</div>',

          '<div class="gate-field">',
            '<label class="gate-label" for="gatePhone">',
              'WhatsApp Number',
              '<span class="gate-optional"> (get your report here)</span>',
            '</label>',
            '<div class="gate-phone-wrap">',
              '<span class="gate-phone-prefix">🇮🇳 +91</span>',
              '<input type="tel" id="gatePhone" class="gate-input gate-phone-input"',
                ' placeholder="9876543210" maxlength="10" />',
            '</div>',
          '</div>',

          '<div id="gateError" class="gate-error gate-hidden">Please enter your name to continue.</div>',

          '<button type="button" id="gateSubmit" class="gate-btn">',
            'Show Me My Chances →',
          '</button>',
        '</div>',

        // Trust strip
        '<div class="gate-trust-strip">',
          '<span>🔒</span>',
          '<span>100% Private &nbsp;·&nbsp; Zero Spam &nbsp;·&nbsp; Number Never Sold or Shared</span>',
        '</div>',

        // Fine-print
        '<p class="gate-fine-print">',
          'We take privacy as seriously as CUET prep. Your number is stored securely and used ',
          '<em>only</em> to send your personalised admission report on WhatsApp. Nothing else, ever. ',
          'No calls. No third-party sharing. No advertising. You can request deletion anytime.',
        '</p>',

      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    document.body.classList.add('gate-open');

    // ── Wire up inputs ──────────────────────────────────────
    var nameEl  = document.getElementById('gateName');
    var phoneEl = document.getElementById('gatePhone');
    var errEl   = document.getElementById('gateError');
    var btnEl   = document.getElementById('gateSubmit');

    phoneEl.addEventListener('input', function () {
      phoneEl.value = phoneEl.value.replace(/\D/g, '').slice(0, 10);
    });

    function tryEnter(e) { if (e.key === 'Enter') btnEl.click(); }
    nameEl.addEventListener('keydown', tryEnter);
    phoneEl.addEventListener('keydown', tryEnter);

    nameEl.addEventListener('input', function () {
      if (nameEl.value.trim().length >= 2) errEl.classList.add('gate-hidden');
    });

    btnEl.addEventListener('click', function () {
      var name  = nameEl.value.trim();
      var phone = phoneEl.value.trim();

      if (!name || name.length < 2) {
        errEl.textContent = 'Please enter your name to continue.';
        errEl.classList.remove('gate-hidden');
        nameEl.focus();
        return;
      }

      // Validate phone if provided: must be 10 digits starting with 6-9
      if (phone && (phone.length !== 10 || !/^[6-9]/.test(phone))) {
        errEl.textContent = 'Please enter a valid 10-digit mobile number starting with 6-9.';
        errEl.classList.remove('gate-hidden');
        phoneEl.focus();
        return;
      }

      var data = { name: name, phone: phone, ts: Date.now() };

      // Persist for return visits (localStorage) + current session (sessionStorage)
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) {}

      // Pre-fill Step 4 in the main form
      prefillForm(data);

      // Fire-and-forget lead capture
      try {
        var w = screen.width;
        fetch('/api/lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            phone: phone,
            page: window.location.pathname,
            deviceType: w <= 768 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop',
            language: navigator.language || '',
            timezone: (Intl && Intl.DateTimeFormat)
              ? Intl.DateTimeFormat().resolvedOptions().timeZone : '',
          }),
          keepalive: true,
        }).catch(function () {});
      } catch (_) {}

      // Dismiss with fade-out
      overlay.classList.add('gate-leaving');
      setTimeout(function () {
        overlay.remove();
        document.body.classList.remove('gate-open');
      }, 300);
    });

    // Auto-focus after card animation settles
    setTimeout(function () { nameEl.focus(); }, 420);
  });

  // ── Pre-fill Step 4 form ──────────────────────────────────
  function prefillForm(data) {
    var n = document.getElementById('studentName');
    var p = document.getElementById('studentPhone');
    if (n && !n.value) n.value = data.name || '';
    if (p && !p.value) p.value = data.phone || '';
    // Trigger CTA update
    if (typeof updateCTA === 'function') updateCTA();
  }
})();
