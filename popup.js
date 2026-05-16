
// BLITZ — Popup Script v1.0

const $ = id => document.getElementById(id);

// ── Elements ──────────────────────────────────────────────────────────────────
const statusCard  = $('statusCard');
const statusValue = $('statusValue');
const siteRow     = $('siteRow');
const mainBtn     = $('mainBtn');
const firedBanner = $('firedBanner');

// Settings
const scanSpeedEl    = $('scanSpeed');
const scanSpeedVal   = $('scanSpeedVal');
const resetBtn       = $('resetSettings');

// About
const aboutScan  = $('aboutScan');

// ── Defaults ──────────────────────────────────────────────────────────────────
const DEFAULTS = {
  scanSpeed:    300,
};

let settings = { ...DEFAULTS };
let currentTabId = null;
let currentState = { armed: false, fired: false };
let logs = [];

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

resetBtn.addEventListener('click', () => {
  settings = { ...DEFAULTS };
  saveSettings();
  if (currentTabId) {
    chrome.storage.local.set({ [`blitzLogs_${currentTabId}`]: [] });
  }
  logs = [];
  loadSettingsIntoUI();
  renderLogs();
});

function loadSettingsIntoUI() {
  if (scanSpeedEl) scanSpeedEl.value = settings.scanSpeed;
  if (scanSpeedVal) scanSpeedVal.textContent = fmtSpeed(settings.scanSpeed);
  updateAbout();
}

function updateAbout() {
  const spd = settings.scanSpeed;
  if (aboutScan)  aboutScan.textContent  = fmtSpeed(spd);
}

function saveSettings() {
  chrome.storage.local.set({ blitzSettings: settings });
}



// ── Logging ───────────────────────────────────────────────────────────────────
const activityLog = $('activityLog');
const clearLogsBtn = $('clearLogsBtn');

function renderLogs() {
  if (!activityLog) return;
  if (logs.length === 0) {
    activityLog.innerHTML = '<div class="log-entry" style="text-align:center;color:var(--muted);font-size:9px;padding:10px 0;">No activity yet</div>';
    return;
  }
  activityLog.innerHTML = logs.map(l => 
    `<div class="log-entry"><span class="log-time">• ${l.time}</span> — <span class="log-msg">${l.msg}</span></div>`
  ).join('');
}

if (clearLogsBtn) {
  clearLogsBtn.addEventListener('click', () => {
    logs = [];
    if (currentTabId) {
      chrome.storage.local.set({ [`blitzLogs_${currentTabId}`]: [] });
    }
    renderLogs();
  });
}

function addLog(msg) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }).toLowerCase();
  logs.unshift({ time: timeStr, msg });
  if (logs.length > 50) logs.pop();
  if (currentTabId) {
    chrome.storage.local.set({ [`blitzLogs_${currentTabId}`]: logs });
  }
  renderLogs();
}

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
      setUI({ armed: false, fired: false });
      
      // Clear the logs
      logs = [];
      if (currentTabId) {
        chrome.storage.local.set({ [`blitzLogs_${currentTabId}`]: [] });
      }
      renderLogs();
    });
    return;
  }

  if (currentState.armed) {
    chrome.tabs.sendMessage(currentTabId, { type: 'BLITZ_DISARM' }, () => {
      setUI({ armed: false, fired: false });
      
      // Clear the logs
      logs = [];
      if (currentTabId) {
        chrome.storage.local.set({ [`blitzLogs_${currentTabId}`]: [] });
      }
      renderLogs();
    });
  } else {
    const effectiveSpeed = settings.scanSpeed;

    chrome.tabs.sendMessage(currentTabId, {
      type: 'BLITZ_ARM',
      settings: { ...settings, scanSpeed: effectiveSpeed },
    }, res => {
      if (chrome.runtime.lastError || !res) {
        addLog('Error: Please refresh the page first.');
        return;
      }
      
      // If it didn't fire instantly during the arm() call, we update UI to armed.
      // (If it did fire instantly, BLITZ_FIRED was sent and UI already handled it)
      if (!res.fired && res.armed) {
        setUI({ armed: true, fired: false });
        addLog(`Sniper armed. Checking every ${effectiveSpeed}ms.`);
      }
    });
  }
});

// ── Unsupported Page Detection ────────────────────────────────────────────────
const UNSUPPORTED_PROTOCOLS = [
  'chrome:', 'chrome-extension:', 'edge:', 'about:', 'brave:',
  'opera:', 'vivaldi:', 'devtools:', 'view-source:', 'data:',
  'chrome-search:', 'chrome-untrusted:',
];

const SUPPORTED_DOMAINS = [
  'bookmyshow.com',
  'district.in',
  'zomato.com',
  '127.0.0.1',
];

function isUnsupportedUrl(url) {
  if (!url) return true;
  try {
    const lc = url.toLowerCase();
    // Block browser internal pages
    if (UNSUPPORTED_PROTOCOLS.some(p => lc.startsWith(p))) return true;
    // Only allow supported domains
    const hostname = new URL(lc).hostname;
    return !SUPPORTED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return true; }
}

function showUnsupportedOverlay(url) {
  const overlay = document.getElementById('unsupportedOverlay');
  const urlEl   = document.getElementById('unsupportedUrl');
  if (overlay) overlay.classList.add('visible');
  if (urlEl)   urlEl.textContent = url || 'Unknown page';
}

// ── Init ──────────────────────────────────────────────────────────────────────
chrome.storage.local.get(['blitzSettings'], res => {
  if (res.blitzSettings) {
    settings = { ...DEFAULTS, ...res.blitzSettings };
  }
  loadSettingsIntoUI();
});

chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
  const tab = tabs[0];
  if (!tab) return;
  currentTabId = tab.id;

  chrome.storage.local.get([`blitzLogs_${tab.id}`], res => {
    logs = res[`blitzLogs_${tab.id}`] || [];
    renderLogs();
  });

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
  if (msg.type === 'BLITZ_FIRED') {
    setUI({ armed: false, fired: true });
    const secStr = msg.duration > 0 ? ` in ${msg.duration}s` : '';
    addLog(`Target clicked${secStr}! Queue joined.`);
  }
  if (msg.type === 'BLITZ_STATUS') setUI({ armed: msg.active, fired: currentState.fired });
});
