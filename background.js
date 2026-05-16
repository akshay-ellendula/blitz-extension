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
  }
});

