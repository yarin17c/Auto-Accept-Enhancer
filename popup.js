// popup.js — Match Auto Accept Management Panel

const CASE_URL = 'https://playcs.gg/cases';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const TIMER_DESCRIPTIONS = {
  0:  ['INSTANT', 'Accepts immediately with no delay.'],
  1:  ['1 second', 'Very fast — barely any time to cancel.'],
  2:  ['2 seconds', 'Quick. Light blink before accepting.'],
  3:  ['3 seconds', 'Recommended. React if needed.'],
  5:  ['5 seconds', 'Comfortable window to cancel.'],
  7:  ['7 seconds', 'Generous window.'],
  10: ['10 seconds', 'Plenty of time — never miss a match.'],
  15: ['15 seconds', 'Maximum safe window.'],
  20: ['20 seconds', 'Very long. Make sure you\'re at your PC.'],
};

const SWATCHES = [
  '#0a0e1a', '#0d1b2a', '#1a0a2e', '#2a0a0a',
  '#0a1a0a', '#1a1a0a', '#0a1a1a', '#1a0a1a',
  '#0f172a', '#18181b', '#1c1917', '#0c1a0f',
];

let settings = {};

// ─── INIT ────────────────────────────────────────────────────────────────────
chrome.storage.sync.get(null, (stored) => {
  settings = stored;
  renderAll();
  bindEvents();
  initDailyCase();
});

chrome.storage.onChanged.addListener((changes) => {
  for (const [key, { newValue }] of Object.entries(changes)) {
    settings[key] = newValue;
  }
});

// ─── RENDER ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderMasterToggle();
  renderTimer();
  renderPresets();
  renderBgTabs();
  renderBgPanels();
  renderOptions();
  renderSwatches();
}

function renderMasterToggle() {
  const on = settings.enabled;
  document.getElementById('togglePill').className = 'toggle-pill' + (on ? ' on' : '');
  document.getElementById('toggleLabel').textContent = on ? 'ON' : 'OFF';
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + (on ? 'active' : 'inactive');
  document.getElementById('statusText').textContent = on
    ? 'MONITORING PLAYCS.GG'
    : 'MONITORING DISABLED';
}

function renderTimer() {
  const v = Number(settings.delay);
  const slider = document.getElementById('delaySlider');
  const display = document.getElementById('timerDisplay');
  const unit = document.getElementById('timerUnit');
  const title = document.getElementById('timerDescTitle');
  const body = document.getElementById('timerDescBody');

  slider.value = v;

  if (v === 0) {
    display.textContent = '⚡';
    display.className = 'timer-display instant';
    unit.textContent = 'INSTANT';
  } else {
    display.textContent = v;
    display.className = 'timer-display';
    unit.textContent = v === 1 ? 'SECOND' : 'SECONDS';
  }

  const closest = Object.keys(TIMER_DESCRIPTIONS)
    .map(Number)
    .reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a);
  const [t, d] = TIMER_DESCRIPTIONS[closest] || [`${v} seconds`, 'Custom delay.'];
  title.textContent = t + (TIMER_DESCRIPTIONS[v] ? '' : ' (custom)');
  body.textContent = d;
}

function renderPresets() {
  const v = Number(settings.delay);
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.val) === v);
  });
}

function renderBgTabs() {
  const type = settings.bgType || 'default';
  document.querySelectorAll('.bg-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === type);
  });
  document.querySelectorAll('.bg-panel').forEach(panel => {
    panel.classList.toggle('visible', panel.id === 'panel-' + type);
  });
}

function renderBgPanels() {
  const cp = document.getElementById('bgColorPicker');
  const ch = document.getElementById('bgColorHex');
  const color = settings.bgColor || '#0a0e1a';
  cp.value = color;
  ch.value = color;

  const urlInput = document.getElementById('bgImageUrl');
  urlInput.value = settings.bgImage || '';

  const blur = settings.bgBlur || 0;
  document.getElementById('bgBlur').value = blur;
  document.getElementById('blurVal').textContent = blur + 'px';

  const bright = settings.bgBrightness || 100;
  document.getElementById('bgBrightness').value = bright;
  document.getElementById('brightnessVal').textContent = bright + '%';
  document.getElementById('bgBrightnessImg').value = bright;
  document.getElementById('brightnessImgVal').textContent = bright + '%';
}

function renderOptions() {
  document.getElementById('soundToggle').className = 'mini-toggle' + (settings.soundEnabled ? ' on' : '');
  document.getElementById('flashToggle').className = 'mini-toggle' + (settings.flashEnabled ? ' on' : '');
}

function renderSwatches() {
  const container = document.getElementById('swatches');
  container.innerHTML = '';
  SWATCHES.forEach(color => {
    const s = document.createElement('div');
    s.className = 'swatch';
    s.style.background = color;
    s.title = color;
    s.addEventListener('click', () => {
      save({ bgColor: color, bgType: 'color' });
      renderBgPanels();
      renderBgTabs();
    });
    container.appendChild(s);
  });
}

// ─── EVENTS ──────────────────────────────────────────────────────────────────
function bindEvents() {
  // Master toggle
  document.getElementById('masterToggle').addEventListener('click', () => {
    const on = !settings.enabled;
    save({ enabled: on });
    renderMasterToggle();
    chrome.runtime.sendMessage({ type: 'SET_BADGE', enabled: on });
    sendToContent({ type: 'SETTINGS_CHANGED', settings });
  });

  // Delay slider
  document.getElementById('delaySlider').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    save({ delay: v });
    renderTimer();
    renderPresets();
  });

  // Preset buttons
  document.getElementById('presetGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const v = Number(btn.dataset.val);
    save({ delay: v });
    renderTimer();
    renderPresets();
  });

  // BG tabs
  document.querySelectorAll('.bg-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      save({ bgType: tab.dataset.tab });
      renderBgTabs();
      sendToContent({ type: 'SETTINGS_CHANGED', settings });
    });
  });

  // Color picker
  document.getElementById('bgColorPicker').addEventListener('input', (e) => {
    const color = e.target.value;
    document.getElementById('bgColorHex').value = color;
    save({ bgColor: color, bgType: 'color' });
  });

  // Color hex input
  document.getElementById('bgColorHex').addEventListener('input', (e) => {
    const val = e.target.value;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      document.getElementById('bgColorPicker').value = val;
      save({ bgColor: val, bgType: 'color' });
    }
  });

  // Image URL
  document.getElementById('bgImageUrl').addEventListener('input', (e) => {
    save({ bgImage: e.target.value, bgType: 'image' });
  });

  // Blur
  document.getElementById('bgBlur').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    document.getElementById('blurVal').textContent = v + 'px';
    save({ bgBlur: v });
  });

  // Brightness color
  document.getElementById('bgBrightness').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    document.getElementById('brightnessVal').textContent = v + '%';
    save({ bgBrightness: v });
  });

  // Brightness image
  document.getElementById('bgBrightnessImg').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    document.getElementById('brightnessImgVal').textContent = v + '%';
    save({ bgBrightness: v });
  });

  // Sound toggle
  document.getElementById('soundToggle').addEventListener('click', () => {
    save({ soundEnabled: !settings.soundEnabled });
    renderOptions();
  });

  // Flash toggle
  document.getElementById('flashToggle').addEventListener('click', () => {
    save({ flashEnabled: !settings.flashEnabled });
    renderOptions();
  });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function save(partial) {
  Object.assign(settings, partial);
  chrome.storage.sync.set(partial);
  sendToContent({ type: 'SETTINGS_CHANGED', settings });
}

function sendToContent(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, msg).catch(() => {});
    }
  });
}

// ─── DAILY CASE ──────────────────────────────────────────────────────────────
let caseTimerInterval = null;

function initDailyCase() {
  renderCaseBtn();
  document.getElementById('caseBtn').addEventListener('click', onCaseClick);

  // Refresh display every second
  caseTimerInterval = setInterval(renderCaseBtn, 1000);
}

function onCaseClick() {
  chrome.storage.local.get({ caseAvailableAt: 0 }, ({ caseAvailableAt }) => {
    const remaining = caseAvailableAt - Date.now();
    if (remaining > 0) return; // still on cooldown
    chrome.tabs.create({ url: CASE_URL });
  });
}

function renderCaseBtn() {
  chrome.storage.local.get({ caseAvailableAt: 0 }, ({ caseAvailableAt }) => {
    const remaining = caseAvailableAt - Date.now();

    const btn   = document.getElementById('caseBtn');
    const title = document.getElementById('caseBtnTitle');
    const sub   = document.getElementById('caseBtnSub');
    const badge = document.getElementById('caseBadge');
    const bar   = document.getElementById('caseCooldownBar');
    const fill  = document.getElementById('caseCooldownFill');

    if (!btn) return;

    if (remaining <= 0) {
      // Available
      btn.classList.remove('on-cooldown');
      title.textContent = 'OPEN FREE CASE';
      sub.textContent   = caseAvailableAt === 0
        ? 'Visit cases page to sync timer'
        : 'Click to open — case is ready!';
      badge.textContent = 'FREE';
      bar.style.display = 'none';
    } else {
      // On cooldown — mirroring site timer
      btn.classList.add('on-cooldown');
      title.textContent = 'NEXT CASE IN';
      sub.textContent   = 'Timer synced from site';
      badge.textContent = formatCountdown(remaining);
      bar.style.display = 'block';
      // Progress: caseAvailableAt was set when scraper last saw the timer
      // We don't know the original duration, approximate with 24h
      const elapsed = COOLDOWN_MS - remaining;
      const pct = Math.min(100, Math.max(0, (elapsed / COOLDOWN_MS) * 100));
      fill.style.width = pct + '%';
    }
  });
}

function formatCountdown(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}
