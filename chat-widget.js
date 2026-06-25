// ============================================================
//  CUET AI Counsellor — Chat Widget
//  Floating chat button on every page. On results page it
//  auto-loads the student's context so AI knows their scores.
// ============================================================
(function () {
  'use strict';

  let chatOpen   = false;
  let messages   = []; // { role, content }
  let isTyping   = false;
  let userCtx    = null; // context string sent to AI
  let welcomed   = false;

  // Called by results.js once predictions are computed
  window.setChatPredictions = function (predictions) {
    if (!userCtx) return;
    const lines = predictions.slice(0, 10).map(p =>
      `  • ${p.college} — ${p.program}: ${p.prob}% (${p.probClass})`
    ).join('\n');
    userCtx += `\n\nTop predictions:\n${lines}`;
    const sub = document.getElementById('chatSubtitle');
    if (sub) sub.textContent = 'Your results loaded ✓';
  };

  function buildContext() {
    let raw;
    try { raw = sessionStorage.getItem('cuetData'); } catch (_) { return null; }
    if (!raw) return null;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return null; }

    return `Name: ${data.name}
Category: ${data.category}
Composite Score: ${data.composite} / 1000
Subjects taken: ${(data.subjects || []).join(', ')}${
  data.dreamCollege
    ? `\nDream College: ${data.dreamCollege.college} — ${data.dreamCollege.program}`
    : ''
}`;
  }

  function init() {
    userCtx = buildContext();
    render();
    bindEvents();

    // On results page, auto-open with greeting after a short delay
    if (userCtx && window.location.pathname.includes('results')) {
      setTimeout(() => {
        if (!welcomed) greet();
      }, 1800);
    }
  }

  function greet() {
    welcomed = true;
    const data = (() => {
      try { return JSON.parse(sessionStorage.getItem('cuetData') || '{}'); } catch (_) { return {}; }
    })();
    const firstName = data.name ? data.name.trim().split(' ')[0] : 'there';
    appendMessage('assistant',
      `Hi ${firstName}! 🎓 I have your 2026 predictions. Ask me anything: "Do I get into SRCC?", "What if I miss Round 1?", or about any specific college.`
    );
    // Show notification dot if panel is closed
    if (!chatOpen) {
      const dot = document.getElementById('chatNotif');
      if (dot) dot.classList.add('visible');
    }
  }

  function render() {
    const root = document.createElement('div');
    root.id = 'chatRoot';
    root.innerHTML = `
      <!-- FAB Button -->
      <button class="chat-fab" id="chatFab" aria-label="Open AI Counsellor">
        <svg class="chat-fab-icon" width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="chat-fab-text">Ask AI</span>
        <span class="chat-notif" id="chatNotif"></span>
      </button>

      <!-- Chat Panel -->
      <div class="chat-panel" id="chatPanel" aria-hidden="true" role="dialog" aria-label="CUET AI Counsellor">

        <div class="chat-header">
          <div class="chat-header-left">
            <div class="chat-avatar" aria-hidden="true">🎓</div>
            <div>
              <div class="chat-name">CUET Counsellor</div>
              <div class="chat-subtitle" id="chatSubtitle">${
                userCtx ? 'DU 2026 AI · loading…' : 'DU 2026 Admissions AI'
              }</div>
            </div>
          </div>
          <button class="chat-close-btn" id="chatClose" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="chat-body" id="chatBody">
          <div class="chat-intro">
            <span class="chat-intro-star">✦</span>
            ${userCtx
              ? 'I have your scores and category. Ask me about your chances at any college.'
              : 'Ask me anything about CUET 2026, DU admissions, cutoffs, or categories.'
            }
          </div>
        </div>

        <div class="chat-typing-row" id="chatTypingRow" style="display:none" aria-live="polite">
          <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
        </div>

        <div class="chat-footer">
          <input
            type="text"
            id="chatInput"
            class="chat-input-field"
            placeholder="Ask about your chances…"
            autocomplete="off"
            maxlength="300"
            aria-label="Your message"
          />
          <button class="chat-send-btn" id="chatSend" aria-label="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  }

  function bindEvents() {
    document.getElementById('chatFab').addEventListener('click', toggle);
    document.getElementById('chatClose').addEventListener('click', close);
    document.getElementById('chatSend').addEventListener('click', send);
    document.getElementById('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function toggle() { chatOpen ? close() : open(); }

  function open() {
    chatOpen = true;
    document.getElementById('chatPanel').classList.add('open');
    document.getElementById('chatPanel').setAttribute('aria-hidden', 'false');
    const dot = document.getElementById('chatNotif');
    if (dot) dot.classList.remove('visible');
    setTimeout(() => document.getElementById('chatInput').focus(), 300);
  }

  function close() {
    chatOpen = false;
    document.getElementById('chatPanel').classList.remove('open');
    document.getElementById('chatPanel').setAttribute('aria-hidden', 'true');
  }

  async function send() {
    const input = document.getElementById('chatInput');
    const text  = input.value.trim().slice(0, 300);
    if (!text || isTyping) return;

    input.value = '';
    messages.push({ role: 'user', content: text });
    appendMessage('user', text);

    isTyping = true;
    document.getElementById('chatTypingRow').style.display = 'flex';
    scrollBottom();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(-10), context: userCtx }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      messages.push({ role: 'assistant', content: json.reply });
      if (messages.length > 20) {
        messages = messages.slice(-20);
      }
      document.getElementById('chatTypingRow').style.display = 'none';
      appendMessage('assistant', json.reply);
    } catch (err) {
      document.getElementById('chatTypingRow').style.display = 'none';
      appendMessage('assistant', '⚠️ Sorry, something went wrong. Please try again.');
      messages.pop(); // remove the failed user message from history so retry is clean
    } finally {
      isTyping = false;
    }
  }

  function appendMessage(role, content) {
    const body = document.getElementById('chatBody');
    const div  = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}`;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    // Safe text rendering — no innerHTML with user content
    bubble.textContent = content;
    div.appendChild(bubble);
    body.appendChild(div);
    scrollBottom();
  }

  function scrollBottom() {
    const el = document.getElementById('chatBody');
    if (el) el.scrollTop = el.scrollHeight;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
