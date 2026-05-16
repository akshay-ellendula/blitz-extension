// BLITZ — Universal Queue Grabber v1.0

(function () {
  'use strict';

  let armed        = false;
  let fired        = false;
  let observer     = null;
  let pollTimer    = null;
  let customKW     = [];
  let cfg          = {
    scanSpeed:    300,
  };
  let startTime    = 0;

  // Optimized regex list for "Book Now" and "Book Tickets" only
  const DEFAULT_KEYWORDS = [
    /^book\s*now$/i,
    /^book\s*tickets?$/i
  ];

  // Combined CSS selectors where possible for faster DOM querying
  const CSS_SELECTORS = [
    'button[class*="book" i]', 'a[class*="book" i]', 
    '[data-testid*="book" i]', '[data-testid*="buy" i]',
    '.btn-book', '.book-btn', '#book-button',
    'a[href*="/buytickets/"]', '[class*="buy-ticket" i]',
    'button[class*="buy" i]', '[data-action="buy"]', '[data-action="book"]'
  ];

  // ── Helpers (optimized for speed) ───────────────────────────────────────────
  function isVisible(el) {
    try {
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
    } catch { return false; }
  }

  function isDisabled(el) {
    return el.disabled || el.getAttribute('aria-disabled') === 'true';
  }

  // Pre-build the combined CSS selector string once (no per-scan overhead)
  const CSS_SELECTOR_COMBINED = CSS_SELECTORS.join(',');

  // Cache keywords — only rebuild when custom keywords change
  let _cachedKWs = null;
  function getKeywords() {
    if (_cachedKWs) return _cachedKWs;
    const extra = customKW.filter(k => k.trim()).map(k => new RegExp(`^${k.trim()}$`, 'i'));
    _cachedKWs = [...DEFAULT_KEYWORDS, ...extra];
    return _cachedKWs;
  }

  function findTarget() {
    // Phase 1: Single combined CSS query (fastest path)
    try {
      for (const el of document.querySelectorAll(CSS_SELECTOR_COMBINED)) {
        if (isVisible(el) && !isDisabled(el)) return el;
      }
    } catch (_) {}

    // Phase 2: Text-based scan — check text BEFORE expensive visibility
    const kws = getKeywords();
    for (const el of document.querySelectorAll('button,a[href],[role="button"],input[type="submit"],input[type="button"]')) {
      const t = (el.innerText || el.textContent || el.value || '').trim();
      if (t && kws.some(re => re.test(t)) && isVisible(el) && !isDisabled(el)) return el;
    }
    return null;
  }


  // ── Click ──────────────────────────────────────────────────────────────────
  function doClick(el) {
    ['mouseover','mouseenter','mousemove','mousedown','mouseup','click'].forEach(ev => {
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
    });
    el.focus?.();
  }

  function fire(el) {
    if (fired) return;
    fired = true;

    // Stop scanning directly — do NOT call disarm() here because
    // disarm() sends BLITZ_STATUS(active:false) which clears the badge
    // that BLITZ_FIRED just set.
    armed = false;
    clearInterval(pollTimer); pollTimer = null;
    observer?.disconnect(); observer = null;

    try { sessionStorage.removeItem('blitzArmed'); } catch (_) {}

    doClick(el);
    chrome.runtime.sendMessage({
      type: 'BLITZ_FIRED',
      url: window.location.href,
      title: document.title,
      buttonText: (el.innerText || el.textContent || '').trim().slice(0, 60),
      duration: startTime ? ((Date.now() - startTime) / 1000).toFixed(1) : 0,
    });
  }

  // ── Watch ──────────────────────────────────────────────────────────────────
  function tryFire() {
    if (!armed || fired) return;
    const el = findTarget();
    if (el) fire(el);
  }

  function arm() {
    if (armed) return;
    armed = true; fired = false;
    startTime = Date.now();
    try { sessionStorage.setItem('blitzArmed', 'true'); } catch (_) {}

    tryFire();

    const interval = cfg.scanSpeed;
    pollTimer = setInterval(tryFire, interval);

    observer = new MutationObserver(tryFire);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'disabled', 'aria-disabled'],
    });

    notifyStatus(true);
  }

  function disarm() {
    armed = false;
    clearInterval(pollTimer); pollTimer = null;
    observer?.disconnect(); observer = null;
    try { sessionStorage.removeItem('blitzArmed'); } catch (_) {}
    notifyStatus(false);
  }

  function notifyStatus(active) {
    try { chrome.runtime.sendMessage({ type: 'BLITZ_STATUS', active }); } catch (_) {}
  }

  // ── Messages ───────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'BLITZ_GET_STATUS') {
      reply({ armed, fired });
      return true;
    }
    if (msg.type === 'BLITZ_ARM') {
      customKW = msg.customKeywords || [];
      _cachedKWs = null; // Invalidate keyword cache
      if (msg.settings) cfg = { ...cfg, ...msg.settings };
      arm();
      reply({ ok: true, armed, fired });
      return true;
    }
    if (msg.type === 'BLITZ_DISARM') {
      disarm();
      fired = false;
      reply({ ok: true });
      return true;
    }
  });

  // ── Auto-start ─────────────────────────────────────────────────────────────
  chrome.storage.local.get(['blitzKeywords', 'blitzSettings'], res => {
    if (res.blitzSettings) cfg = { ...cfg, ...res.blitzSettings };
    if (res.blitzKeywords) customKW = res.blitzKeywords;
    
    // Auto-arm if this specific tab was left in the ARMED state before reload
    let wasArmed = false;
    try { wasArmed = sessionStorage.getItem('blitzArmed') === 'true'; } catch (_) {}
    if (wasArmed) {
      arm();
    }
  });

})();
