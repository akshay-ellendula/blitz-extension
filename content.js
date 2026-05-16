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
    soundAlert:   true,
    focusTab:     true,
  };

  // ── Universal button patterns ──────────────────────────────────────────────
  const DEFAULT_KEYWORDS = [
    /^book\s*tickets?$/i, /^buy\s*tickets?$/i, /^get\s*tickets?$/i,
    /^join\s*(the\s*)?queue$/i, /^enter\s*(the\s*)?queue$/i, /^grab\s*tickets?$/i,
    /^book\s*now$/i, /^buy\s*now$/i, /^get\s*now$/i,
    /^proceed\s*to\s*book$/i, /^check\s*availability$/i, /^select\s*seats?$/i,
    /^register\s*now$/i, /^confirm\s*booking$/i, /^reserve\s*now$/i,
    /^buy\s*at\s*₹/i, /^grab\s*deal$/i, /^flash\s*sale/i,
    /^add\s*to\s*cart$/i, /^proceed$/i, /^continue\s*to\s*pay/i,
  ];

  const CSS_SELECTORS = [
    'button[class*="Book"]', 'button[class*="book"]', 'a[class*="Book"]',
    '[data-testid="book-button"]', '[data-testid="buy-button"]', '[data-testid="bookNow"]',
    'a.btn-book', '.book-btn', '[class*="bookButton"]', '[class*="BookButton"]', '#book-button',
    'a[href*="/buytickets/"]', '[class*="BuyTicket"]', '[class*="buy-ticket"]',
    'button[class*="BuyNow"]', 'button[class*="buy-now"]', 'button[class*="BookNow"]',
    '[data-action="buy"]', '[data-action="book"]',
  ];

  // ── Helpers ────────────────────────────────────────────────────────────────
  function isVisible(el) {
    try {
      const r = el.getBoundingClientRect();
      const s = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0;
    } catch { return false; }
  }

  function isDisabled(el) {
    return el.disabled || el.getAttribute('aria-disabled') === 'true' || el.classList.contains('disabled') || el.hasAttribute('disabled');
  }

  function buildKeywords() {
    const extra = customKW.filter(k => k.trim()).map(k => new RegExp(`^${k.trim()}$`, 'i'));
    return [...DEFAULT_KEYWORDS, ...extra];
  }

  function findTarget() {
    for (const sel of CSS_SELECTORS) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (isVisible(el) && !isDisabled(el)) return el;
        }
      } catch (_) {}
    }
    const kws = buildKeywords();
    for (const el of document.querySelectorAll('button,a[href],[role="button"],input[type="submit"],input[type="button"]')) {
      const t = (el.innerText || el.textContent || el.value || '').trim();
      if (kws.some(re => re.test(t)) && isVisible(el) && !isDisabled(el)) return el;
    }
    return null;
  }

  // ── Sound ──────────────────────────────────────────────────────────────────
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 120, 240].forEach(offset => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        o.type = 'sine';
        g.gain.setValueAtTime(0, ctx.currentTime + offset/1000);
        g.gain.linearRampToValueAtTime(0.4, ctx.currentTime + offset/1000 + 0.05);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + offset/1000 + 0.2);
        o.start(ctx.currentTime + offset/1000);
        o.stop(ctx.currentTime + offset/1000 + 0.25);
      });
    } catch (_) {}
  }

  // ── Click with retry ───────────────────────────────────────────────────────
  function doClick(el, attempt = 0) {
    ['mouseover','mouseenter','mousemove','mousedown','mouseup','click'].forEach(ev => {
      el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true }));
    });
    el.focus?.();

    // Auto-retry up to 3 times if button is still there
    if (attempt < 3) {
      setTimeout(() => {
        const still = document.contains(el) && isVisible(el) && !isDisabled(el);
        if (still && !document.hidden) doClick(el, attempt + 1);
      }, 400 + attempt * 200);
    }
  }

  function fire(el) {
    if (fired) return;
    fired = true;

    doClick(el);
    if (cfg.soundAlert) playBeep();
    chrome.runtime.sendMessage({
      type: 'BLITZ_FIRED',
      url: window.location.href,
      title: document.title,
      buttonText: (el.innerText || el.textContent || '').trim().slice(0, 60),
      focusTab: cfg.focusTab,
    });
    disarm();
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
      if (msg.settings) cfg = { ...cfg, ...msg.settings };
      arm();
      reply({ ok: true });
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
  });

})();
