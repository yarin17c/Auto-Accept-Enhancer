// content.js — Match Auto Accept
// Watches for ACCEPT button, handles countdown, HUD overlay, background injection

(function () {
  'use strict';

  // ─── STATE ─────────────────────────────────────────────────────────────────
  let settings = {
    enabled: true,
    delay: 3,
    bgType: 'default',
    bgColor: '#0a0e1a',
    bgImage: '',
    bgBlur: 0,
    bgBrightness: 100,
    soundEnabled: true,
    flashEnabled: true,
  };

  let countdownTimer = null;
  let countdownRemaining = 0;
  let hudEl = null;
  let overlayEl = null;
  let acceptBtn = null;
  let bgOverlayEl = null;
  let alreadyHandling = false;

  // ─── SELECTORS ─────────────────────────────────────────────────────────────
  // Multiple strategies to find the ACCEPT button
  const ACCEPT_SELECTORS = [
    'button[class*="accept" i]',
    'button[class*="Accept"]',
    '[class*="matchFound"] button',
    '[class*="match-found"] button',
    '[class*="queue"] button[class*="confirm" i]',
    '[class*="readyCheck"] button',
    '[class*="ready-check"] button',
    '[data-testid*="accept" i]',
    '[aria-label*="accept" i]',
  ];

  // ─── INIT ───────────────────────────────────────────────────────────────────
  loadSettings(() => {
    injectBackgroundOverlay();
    createHUD();
    startObserver();
  });

  chrome.storage.onChanged.addListener((changes) => {
    let needsBgRefresh = false;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
      if (['bgType','bgColor','bgImage','bgBlur','bgBrightness'].includes(key)) needsBgRefresh = true;
    }
    if (needsBgRefresh) updateBackgroundOverlay();
    updateHUDState();
  });

  // ─── SETTINGS ───────────────────────────────────────────────────────────────
  function loadSettings(cb) {
    chrome.storage.sync.get(settings, (stored) => {
      settings = { ...settings, ...stored };
      cb && cb();
    });
  }

  // ─── OBSERVER ───────────────────────────────────────────────────────────────
  function startObserver() {
    const observer = new MutationObserver(() => {
      if (!settings.enabled) return;
      if (alreadyHandling) return;
      const btn = findAcceptButton();
      if (btn && btn !== acceptBtn) {
        acceptBtn = btn;
        handleMatchFound(btn);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also poll as fallback
    setInterval(() => {
      if (!settings.enabled || alreadyHandling) return;
      const btn = findAcceptButton();
      if (btn && btn !== acceptBtn) {
        acceptBtn = btn;
        handleMatchFound(btn);
      }
    }, 500);
  }

  function findAcceptButton() {
    // Strategy 1: known selectors
    for (const sel of ACCEPT_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && isVisible(el)) return el;
      } catch (_) {}
    }

    // Strategy 2: text content scan
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const txt = btn.textContent.trim().toUpperCase();
      if ((txt === 'ACCEPT' || txt === 'קבל' || txt === 'READY' || txt === 'CONFIRM') && isVisible(btn)) {
        return btn;
      }
    }

    return null;
  }

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  // ─── MATCH FOUND ────────────────────────────────────────────────────────────
  function handleMatchFound(btn) {
    alreadyHandling = true;

    // Notify background
    chrome.runtime.sendMessage({ type: 'MATCH_FOUND' });

    // Play sound
    if (settings.soundEnabled) playBeep();

    // Show flash
    if (settings.flashEnabled) showFlash();

    const delay = Number(settings.delay);

    if (delay <= 0) {
      clickAccept(btn);
      return;
    }

    // Show countdown overlay
    countdownRemaining = delay;
    showCountdownOverlay(btn, countdownRemaining);

    countdownTimer = setInterval(() => {
      countdownRemaining--;
      updateCountdown(countdownRemaining);
      if (countdownRemaining <= 0) {
        clearInterval(countdownTimer);
        clickAccept(btn);
      }
    }, 1000);
  }

  function clickAccept(btn) {
    if (!btn || !document.contains(btn)) {
      resetState();
      return;
    }
    btn.click();
    showSuccessFlash();
    setTimeout(resetState, 1500);
  }

  function resetState() {
    alreadyHandling = false;
    acceptBtn = null;
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    removeCountdownOverlay();
    updateHUDState();
  }

  // ─── COUNTDOWN OVERLAY ──────────────────────────────────────────────────────
  function showCountdownOverlay(btn, seconds) {
    removeCountdownOverlay();

    overlayEl = document.createElement('div');
    overlayEl.id = 'pca-countdown-overlay';
    overlayEl.innerHTML = `
      <div class="pca-overlay-content">
        <div class="pca-radar-ring"></div>
        <div class="pca-radar-ring pca-ring2"></div>
        <div class="pca-overlay-icon">⚡</div>
        <div class="pca-overlay-title">MATCH FOUND</div>
        <div class="pca-overlay-timer" id="pca-timer-display">${seconds}</div>
        <div class="pca-overlay-sub">AUTO-ACCEPTING IN</div>
        <div class="pca-overlay-progress">
          <div class="pca-progress-bar" id="pca-progress-bar"
               style="animation-duration: ${seconds}s"></div>
        </div>
        <button class="pca-cancel-btn" id="pca-cancel-btn">✕ CANCEL</button>
      </div>
    `;

    document.body.appendChild(overlayEl);

    document.getElementById('pca-cancel-btn').addEventListener('click', () => {
      clearInterval(countdownTimer);
      resetState();
      playCancel();
    });
  }

  function updateCountdown(n) {
    const el = document.getElementById('pca-timer-display');
    if (el) {
      el.textContent = n;
      if (n <= 2) el.classList.add('pca-urgent');
    }
    updateHUDState(n);
  }

  function removeCountdownOverlay() {
    const el = document.getElementById('pca-countdown-overlay');
    if (el) el.remove();
    overlayEl = null;
  }

  // ─── FLASH EFFECTS ──────────────────────────────────────────────────────────
  function showFlash() {
    const flash = document.createElement('div');
    flash.className = 'pca-screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 600);
  }

  function showSuccessFlash() {
    const flash = document.createElement('div');
    flash.className = 'pca-screen-flash pca-flash-success';
    flash.innerHTML = '<span>✓ ACCEPTED</span>';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 1200);
  }

  // ─── SOUND ──────────────────────────────────────────────────────────────────
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'square';
        gain.gain.setValueAtTime(0.15, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + duration + 0.05);
      };
      playTone(880, 0, 0.12);
      playTone(1320, 0.14, 0.12);
      playTone(1760, 0.28, 0.2);
    } catch (_) {}
  }

  function playCancel() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 220;
      osc.type = 'sawtooth';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (_) {}
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────
  function createHUD() {
    hudEl = document.createElement('div');
    hudEl.id = 'pca-hud';
    hudEl.innerHTML = `
      <div class="pca-hud-dot" id="pca-hud-dot"></div>
      <span class="pca-hud-label">AUTO ACCEPT</span>
      <span class="pca-hud-status" id="pca-hud-status">ON</span>
    `;

    hudEl.addEventListener('mousedown', startDrag);
    document.body.appendChild(hudEl);
    updateHUDState();

    // Restore saved position
    chrome.storage.local.get({ hudX: null, hudY: null }, ({ hudX, hudY }) => {
      if (hudX !== null) {
        hudEl.style.left = hudX + 'px';
        hudEl.style.top = hudY + 'px';
        hudEl.style.right = 'auto';
        hudEl.style.bottom = 'auto';
      }
    });
  }

  function updateHUDState(countdown = null) {
    if (!hudEl) return;
    const dot = document.getElementById('pca-hud-dot');
    const status = document.getElementById('pca-hud-status');
    if (!dot || !status) return;

    if (!settings.enabled) {
      dot.className = 'pca-hud-dot pca-dot-off';
      status.textContent = 'OFF';
      hudEl.className = 'pca-hud-inactive';
    } else if (alreadyHandling && countdown !== null) {
      dot.className = 'pca-hud-dot pca-dot-active pca-dot-pulse';
      status.textContent = countdown + 's';
      hudEl.className = 'pca-hud-match';
    } else {
      dot.className = 'pca-hud-dot pca-dot-on';
      status.textContent = 'ON';
      hudEl.className = '';
    }
  }

  // ─── HUD DRAG ───────────────────────────────────────────────────────────────
  let dragOffsetX, dragOffsetY, isDragging = false;

  function startDrag(e) {
    isDragging = true;
    dragOffsetX = e.clientX - hudEl.getBoundingClientRect().left;
    dragOffsetY = e.clientY - hudEl.getBoundingClientRect().top;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    e.preventDefault();
  }

  function onDrag(e) {
    if (!isDragging) return;
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    hudEl.style.left = x + 'px';
    hudEl.style.top = y + 'px';
    hudEl.style.right = 'auto';
    hudEl.style.bottom = 'auto';
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    chrome.storage.local.set({
      hudX: parseInt(hudEl.style.left),
      hudY: parseInt(hudEl.style.top),
    });
  }

  // ─── BACKGROUND ─────────────────────────────────────────────────────────────
  function injectBackgroundOverlay() {
    bgOverlayEl = document.createElement('div');
    bgOverlayEl.id = 'pca-bg-overlay';
    document.body.insertBefore(bgOverlayEl, document.body.firstChild);
    updateBackgroundOverlay();
  }

  function updateBackgroundOverlay() {
    if (!bgOverlayEl) return;
    const { bgType, bgColor, bgImage, bgBlur, bgBrightness } = settings;

    if (bgType === 'default') {
      bgOverlayEl.style.display = 'none';
      return;
    }

    bgOverlayEl.style.display = 'block';
    bgOverlayEl.style.filter = `blur(${bgBlur}px) brightness(${bgBrightness}%)`;

    if (bgType === 'color') {
      bgOverlayEl.style.background = bgColor;
      bgOverlayEl.style.backgroundImage = '';
    } else if (bgType === 'image' && bgImage) {
      bgOverlayEl.style.background = 'none';
      bgOverlayEl.style.backgroundImage = `url(${bgImage})`;
      bgOverlayEl.style.backgroundSize = 'cover';
      bgOverlayEl.style.backgroundPosition = 'center';
    }
  }
})();

// ─── CASES PAGE TIMER SCRAPER ───────────────────────────────────────────────
(function () {
  'use strict';

  if (!location.pathname.startsWith('/cases')) return;

  function scrapeAndStore() {
    // ── Strategy 0: Toast notification "Available again: MM/DD/YYYY, HH:MM:SS PM" ──
    // This is the most accurate source — fires right after a failed/successful open
    const toastTexts = document.querySelectorAll('div.text-sm.opacity-90');
    for (const el of toastTexts) {
      const txt = el.textContent || '';
      const match = txt.match(/available again[:\s]+([0-9/,: APM]+)/i);
      if (match) {
        const parsed = new Date(match[1].trim());
        if (!isNaN(parsed.getTime())) {
          // Site returns UTC time without timezone indicator — correct for local offset
          const utcTimestamp = parsed.getTime() - (parsed.getTimezoneOffset() * 60 * 1000);
          chrome.storage.local.set({ caseAvailableAt: utcTimestamp });
          return;
        }
      }
    }

    // ── Strategy 1: /cases page — "until available" label + timer span ──
    const label = document.querySelector('span.text-xs.text-muted-foreground');
    if (label) {
      const labelText = label.textContent.trim().toLowerCase();
      if (labelText === 'until available') {
        const timerEl = label.previousElementSibling
          || label.parentElement?.querySelector('span.text-lg.font-bold.text-white');
        if (timerEl) {
          const ms = parseTimeString(timerEl.textContent.trim());
          if (ms !== null) {
            chrome.storage.local.set({ caseAvailableAt: Date.now() + ms });
            return;
          }
        }
      } else if (labelText === 'available') {
        chrome.storage.local.set({ caseAvailableAt: 0 });
        return;
      }
    }

    // ── Strategy 2: /cases/daily-case — "0 remaining" after opening ──
    const allLeafEls = document.querySelectorAll('span, p');
    for (const el of allLeafEls) {
      if (el.children.length > 0) continue;
      const txt = el.textContent.trim().toLowerCase();

      if (txt === '0 remaining') {
        const container = el.closest('[class]')?.parentElement || document.body;
        const allText = container.textContent;
        const timeMatch = allText.match(/(\d+h\s*)?(\d+m\s*)?\d+s/i);
        if (timeMatch) {
          const ms = parseTimeString(timeMatch[0]);
          if (ms !== null && ms > 0) {
            chrome.storage.local.set({ caseAvailableAt: Date.now() + ms });
            return;
          }
        }
        chrome.storage.local.set({ caseAvailableAt: Date.now() + (24 * 60 * 60 * 1000) });
        return;
      }

      if (/^[1-9]\d*\s+remaining$/.test(txt)) {
        chrome.storage.local.set({ caseAvailableAt: 0 });
        return;
      }
    }
  }

  function parseTimeString(str) {
    if (!str) return null;
    str = str.trim().toLowerCase();
    let total = 0;
    const h = str.match(/(\d+)\s*h/);
    const m = str.match(/(\d+)\s*m/);
    const s = str.match(/(\d+)\s*s/);
    if (!h && !m && !s) return null;
    if (h) total += parseInt(h[1]) * 3600;
    if (m) total += parseInt(m[1]) * 60;
    if (s) total += parseInt(s[1]);
    return total * 1000;
  }

  scrapeAndStore();
  setInterval(scrapeAndStore, 5000);

  const observer = new MutationObserver(scrapeAndStore);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  // ── Auto-click Open Case if triggered from popup ──
  if (location.pathname.startsWith('/cases/daily-case')) {
    chrome.storage.local.get({ caseAutoClick: false }, ({ caseAutoClick }) => {
      if (!caseAutoClick) return;
      chrome.storage.local.set({ caseAutoClick: false }); // consume the flag
      tryClickOpenCase();
    });
  }

  function tryClickOpenCase() {
    // Try immediately, then retry with MutationObserver until found
    if (clickOpenCaseBtn()) return;

    let attempts = 0;
    const retryObserver = new MutationObserver(() => {
      if (clickOpenCaseBtn()) {
        retryObserver.disconnect();
      } else if (++attempts > 60) {
        retryObserver.disconnect(); // give up after ~30s
      }
    });
    retryObserver.observe(document.body, { childList: true, subtree: true });
  }

  function clickOpenCaseBtn() {
    const buttons = document.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const txt = btn.textContent.trim().toLowerCase();
      if (txt.includes('open case') || txt.includes('open')) {
        if (isClickable(btn)) {
          btn.click();
          // Start aggressive re-scraping right after click so the timer updates immediately
          startPostClickScrape();
          return true;
        }
      }
    }
    return false;
  }

  function startPostClickScrape() {
    // Scrape every 500ms for 10 seconds after the click to catch the new timer ASAP
    let ticks = 0;
    const interval = setInterval(() => {
      scrapeAndStore();
      if (++ticks >= 20) clearInterval(interval);
    }, 500);
  }

  function isClickable(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && style.opacity !== '0'
      && !el.disabled;
  }
})();


