// BLITZ — Popup Script v1.0

const $ = id => document.getElementById(id);

// ── Elements ──────────────────────────────────────────────────────────────────
const statusCard  = $('statusCard');
const statusValue = $('statusValue');
const siteRow     = $('siteRow');
const mainBtn     = $('mainBtn');
const firedBanner = $('firedBanner');
const kwInput     = $('kwInput');
const kwAdd       = $('kwAdd');
const kwChips     = $('kwChips');

// Settings
const scanSpeedEl    = $('scanSpeed');
const scanSpeedVal   = $('scanSpeedVal');
const soundAlertEl   = $('soundAlert');
const focusTabEl     = $('focusTab');
const resetBtn       = $('resetSettings');

// About
const aboutScan  = $('aboutScan');

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  scanSpeed:    300,
  soundAlert:   true,
  focusTab:     true,
  keywords:     [],
};

let settings = { ...DEFAULTS };
let keywords = [];
let currentTabId = null;
let currentState = { armed: false, fired: false };

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
  });
});

// ── Settings UI ───────────────────────────────────────────────────────────────
function fmtSpeed(v) { return `${v}ms`; }

scanSpeedEl.addEventListener('input', () => {
  const v = +scanSpeedEl.value;
  scanSpeedVal.textContent = fmtSpeed(v);
  settings.scanSpeed = v;
  saveSettings();
  updateAbout();
});

[soundAlertEl, focusTabEl].forEach(el => {
  el.addEventListener('change', () => {
    settings[el.id] = el.checked;
    saveSettings();
  });
});

resetBtn.addEventListener('click', () => {
  settings = { ...DEFAULTS };
  keywords = [];
  saveSettings();
  chrome.storage.local.set({ blitzKeywords: [] });
  loadSettingsIntoUI();
  renderChips();
});

function loadSettingsIntoUI() {
  scanSpeedEl.value = settings.scanSpeed;
  scanSpeedVal.textContent = fmtSpeed(settings.scanSpeed);
  soundAlertEl.checked   = settings.soundAlert;
  focusTabEl.checked     = settings.focusTab;
  updateAbout();
}

function updateAbout() {
  const spd = settings.scanSpeed;
  if (aboutScan)  aboutScan.textContent  = fmtSpeed(spd);
}

function saveSettings() {
  chrome.storage.local.set({ blitzSettings: settings });
}

// ── Keywords ──────────────────────────────────────────────────────────────────
function renderChips() {
  kwChips.innerHTML = '';
  keywords.forEach((kw, i) => {
    const c = document.createElement('div');
    c.className = 'chip';
    c.innerHTML = `${kw}<span class="chip-x" data-i="${i}">×</span>`;
    kwChips.appendChild(c);
  });
  kwChips.querySelectorAll('.chip-x').forEach(el => {
    el.addEventListener('click', () => {
      keywords.splice(+el.dataset.i, 1);
      chrome.storage.local.set({ blitzKeywords: keywords });
      renderChips();
    });
  });
}

function addKeyword() {
  const v = kwInput.value.trim();
  if (v && !keywords.includes(v)) {
    keywords.push(v);
    chrome.storage.local.set({ blitzKeywords: keywords });
    renderChips();
  }
  kwInput.value = '';
  kwInput.focus();
}

kwAdd.addEventListener('click', addKeyword);
kwInput.addEventListener('keydown', e => { if (e.key === 'Enter') addKeyword(); });

// ── Sniper UI ─────────────────────────────────────────────────────────────────
function setUI(state) {
  currentState = state;
  firedBanner.style.display = 'none';

  if (state.fired) {
    statusCard.className = 'sc fired';
    statusValue.textContent = 'FIRED';
    mainBtn.className = 'mbtn success';
    mainBtn.innerHTML = '<svg class="ico ico-lg" viewBox="0 0 24 24" style="stroke:var(--green);"><polyline points="20 6 9 17 4 12"/></svg> RESET';
    firedBanner.style.display = 'block';
    return;
  }

  if (state.armed) {
    statusCard.className = 'sc armed';
    statusValue.textContent = 'ARMED';
    mainBtn.className = 'mbtn disarm';
    mainBtn.innerHTML = '<svg class="ico ico-lg" viewBox="0 0 24 24" style="fill:var(--red);stroke:none;"><rect x="6" y="6" width="12" height="12" rx="1"/></svg> DISARM';
  } else {
    statusCard.className = 'sc idle';
    statusValue.textContent = 'IDLE';
    mainBtn.className = 'mbtn arm';
    mainBtn.innerHTML = '<svg class="ico ico-lg" viewBox="0 0 24 24" style="fill:#080808;stroke:none;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> ARM BLITZ';
  }
}

mainBtn.addEventListener('click', () => {
  if (!currentTabId) return;

  if (currentState.fired) {
    chrome.tabs.sendMessage(currentTabId, { type: 'BLITZ_DISARM' }, () => {
      chrome.storage.local.set({ blitzArmed: false });
      setUI({ armed: false, fired: false });
    });
    return;
  }

  if (currentState.armed) {
    chrome.tabs.sendMessage(currentTabId, { type: 'BLITZ_DISARM' }, () => {
      chrome.storage.local.set({ blitzArmed: false });
      setUI({ armed: false, fired: false });
    });
  } else {
    const effectiveSpeed = settings.scanSpeed;
    chrome.tabs.sendMessage(currentTabId, {
      type: 'BLITZ_ARM',
      customKeywords: keywords,
      settings: { ...settings, scanSpeed: effectiveSpeed },
    }, () => {
      chrome.storage.local.set({ blitzArmed: true });
      setUI({ armed: true, fired: false });
    });
  }
});

// ── Unsupported Page Detection ────────────────────────────────────────────────
const UNSUPPORTED_PROTOCOLS = [
  'chrome:', 'chrome-extension:', 'edge:', 'about:', 'brave:',
  'opera:', 'vivaldi:', 'devtools:', 'view-source:', 'data:',
  'chrome-search:', 'chrome-untrusted:',
];

function isUnsupportedUrl(url) {
  if (!url) return true;
  try {
    const lc = url.toLowerCase();
    return UNSUPPORTED_PROTOCOLS.some(p => lc.startsWith(p));
  } catch { return true; }
}

function showUnsupportedOverlay(url) {
  const overlay = document.getElementById('unsupportedOverlay');
  const urlEl   = document.getElementById('unsupportedUrl');
  if (overlay) overlay.classList.add('visible');
  if (urlEl)   urlEl.textContent = url || 'Unknown page';
}

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['blitzSettings', 'blitzKeywords'], res => {
  if (res.blitzSettings) {
    settings = { ...DEFAULTS, ...res.blitzSettings };
  }
  keywords = res.blitzKeywords || [];
  loadSettingsIntoUI();
  renderChips();
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!tab) return;
  currentTabId = tab.id;

  // ── Check if page is supported ──
  if (isUnsupportedUrl(tab.url)) {
    showUnsupportedOverlay(tab.url);
    return;
  }

  const host = (() => {
    try { return new URL(tab.url).hostname.replace('www.', ''); }
    catch { return tab.url || '—'; }
  })();
  siteRow.innerHTML = `<span>Active:</span> ${host}`;

  chrome.tabs.sendMessage(tab.id, { type: 'BLITZ_GET_STATUS' }, res => {
    if (chrome.runtime.lastError || !res) {
      siteRow.innerHTML = `<span>⚠</span> Reload the page first`;
      mainBtn.disabled = true;
      return;
    }
    setUI({ armed: res.armed, fired: res.fired });
  });
});

chrome.runtime.onMessage.addListener(msg => {
  if (msg.type === 'BLITZ_FIRED') setUI({ armed: false, fired: true });
  if (msg.type === 'BLITZ_STATUS') setUI({ armed: msg.active, fired: currentState.fired });
});
