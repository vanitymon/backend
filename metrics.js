// Simple live metrics: shows current online and total visits
(function () {
  const API_BASE = (function () {
    const host = window.location.hostname;
    const isProd = host === 'stealthdma.com' || host === 'www.stealthdma.com';
    return isProd
      ? 'https://determined-learning-production.up.railway.app'
      : '';
  })();

  const METRICS_ELEMENT_ID = 'metrics-counter';
  const HEARTBEAT_INTERVAL_MS = 15000;

  function getOrCreateClientId() {
    try {
      const key = 'metrics_client_id';
      let id = localStorage.getItem(key);
      if (!id) {
        id = ([1e7]+-1e3+-4e3+-8e3+-1e11)
          .replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
        localStorage.setItem(key, id);
      }
      return id;
    } catch {
      // Fallback: random
      return String(Math.random()).slice(2);
    }
  }


  async function fetchJSON(url, options) {
    try {
      const res = await fetch(url, options);
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  async function heartbeat(clientId) {
    await fetchJSON(`${API_BASE}/metrics/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId })
    });
  }

  async function visitOncePerSession() {
    const key = 'metrics_visit_counted';
    if (sessionStorage.getItem(key)) return;
    const data = await fetchJSON(`${API_BASE}/metrics/visit`, { method: 'POST' });
    if (data && data.total != null) {
      sessionStorage.setItem(key, '1');
    }
  }

  function updateCounterText(text) {
    const el = document.getElementById(METRICS_ELEMENT_ID);
    if (!el) return;
    
    // Find the text span (second child span)
    const spans = Array.from(el.children).filter(child => child.tagName === 'SPAN');
    const textSpan = spans.find(span => span.style.color === 'var(--text-primary)' || span.style.color === 'rgb(255, 255, 255)' || span.textContent.includes('online') || span.textContent.includes('Lädt'));
    
    if (textSpan) {
      textSpan.textContent = text;
    } else {
      // Create new span if not found
      const newSpan = document.createElement('span');
      newSpan.style.color = 'var(--text-primary)';
      newSpan.textContent = text;
      el.appendChild(newSpan);
    }
  }

  async function refreshStats() {
    // Ensure counter is visible with fallback first
    updateCounterText('Lädt...');
    
    if (!API_BASE) {
      // No API base means local/dev - show placeholder
      updateCounterText('0 online · 0 Besuche');
      return;
    }
    
    try {
      const data = await fetchJSON(`${API_BASE}/metrics/stats`);
      if (data && typeof data.online === 'number' && typeof data.total === 'number') {
        const text = `${data.online} online · ${data.total} Besuche`;
        updateCounterText(text);
      } else {
        // Fallback wenn API nicht verfügbar
        updateCounterText('0 online · 0 Besuche');
      }
    } catch (err) {
      // Error - show fallback
      updateCounterText('0 online · 0 Besuche');
    }
  }


  // Initialize immediately - don't wait for DOMContentLoaded
  (function initMetrics() {
    // Ensure counter is visible and shows something immediately
    const el = document.getElementById(METRICS_ELEMENT_ID);
    if (el) {
      // Force visibility with inline styles
      el.style.display = 'inline-flex';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      
      const spans = Array.from(el.children).filter(child => child.tagName === 'SPAN');
      const textSpan = spans.find(span => span.style.color === 'var(--text-primary)' || span.textContent.includes('Lädt') || span.textContent.includes('online'));
      if (!textSpan || textSpan.textContent.trim() === '') {
        updateCounterText('Lädt...');
      }
    }
  })();
  
  // Also ensure visibility when DOM is ready (if already loaded)
  if (document.readyState !== 'loading') {
    const el = document.getElementById(METRICS_ELEMENT_ID);
    if (el) {
      el.style.display = 'inline-flex';
      el.style.visibility = 'visible';
      el.style.opacity = '1';
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Show loading immediately
    updateCounterText('Lädt...');
    
    const clientId = getOrCreateClientId();
    
    if (API_BASE) {
      await visitOncePerSession();
      await heartbeat(clientId);
      
      // Heartbeat
      let hbTimer = setInterval(() => heartbeat(clientId), HEARTBEAT_INTERVAL_MS);
      
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          clearInterval(hbTimer);
        } else {
          heartbeat(clientId);
          hbTimer = setInterval(() => heartbeat(clientId), HEARTBEAT_INTERVAL_MS);
        }
      });
    }
    
    // Refresh stats immediately and periodically
    await refreshStats();
    let statsTimer = setInterval(refreshStats, 10000);

  });
})();



