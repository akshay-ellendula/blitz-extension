// BLITZ — Background Service Worker v1.0

chrome.runtime.onMessage.addListener((msg, sender) => {
  const tabId = sender.tab?.id;

  if (msg.type === 'BLITZ_FIRED') {
    // Browser notification
    chrome.notifications.create(`blitz-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: '⚡ BLITZ — Queue Joined!',
      message: `Clicked "${msg.buttonText}" — finish your booking now!`,
      priority: 2,
    });

    // Badge
    if (tabId) {
      chrome.action.setBadgeText({ text: '✓', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#00FF88', tabId });
    }

    // Focus tab if user enabled it
    if (msg.focusTab && tabId) {
      chrome.tabs.update(tabId, { active: true });
      chrome.tabs.get(tabId, tab => {
        if (tab?.windowId) chrome.windows.update(tab.windowId, { focused: true });
      });
    }
  }

  if (msg.type === 'BLITZ_STATUS') {
    if (tabId) {
      if (msg.active) {
        chrome.action.setBadgeText({ text: '⚡', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#FFE500', tabId });
      } else {
        chrome.action.setBadgeText({ text: '', tabId });
      }
    }
  }
});
