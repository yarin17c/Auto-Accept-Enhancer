// background.js — Match Auto Accept
// Handles badge updates and cross-tab messaging

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    enabled: true,
    delay: 3,
    bgType: 'default',
    bgColor: '#0a0e1a',
    bgImage: '',
    bgBlur: 0,
    bgBrightness: 100,
    soundEnabled: true,
    flashEnabled: true,
  });
  updateBadge(true);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_BADGE') {
    updateBadge(msg.enabled);
  }
  if (msg.type === 'MATCH_FOUND') {
    // Flash the badge when a match is found
    flashBadge();
  }
});

function updateBadge(enabled) {
  const color = enabled ? '#00e5ff' : '#444';
  const text  = enabled ? 'ON'  : 'OFF';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function flashBadge() {
  let on = true;
  const interval = setInterval(() => {
    chrome.action.setBadgeBackgroundColor({ color: on ? '#ff3d00' : '#00e5ff' });
    chrome.action.setBadgeText({ text: on ? '!' : 'ON' });
    on = !on;
  }, 400);
  setTimeout(() => clearInterval(interval), 5000);
}
