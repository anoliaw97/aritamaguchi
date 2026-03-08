/**
 * ui.js - DOM UI management
 *
 * Handles:
 *  - Stat bar updates
 *  - Panel open/close
 *  - Toast notifications
 *  - Speech bubble display
 *  - LED indicator
 *  - Info panel population
 */

import { INTIMACY_TIERS } from './pet.js';

// ─── element cache ────────────────────────────────────────────────────────────

const el = id => document.getElementById(id);

export class UI {
  constructor() {
    // stat bars
    this.barHunger   = el('bar-hunger');
    this.barHappy    = el('bar-happy');
    this.barClean    = el('bar-clean');
    this.barIntimacy = el('bar-intimacy');
    this.valHunger   = el('val-hunger');
    this.valHappy    = el('val-happy');
    this.valClean    = el('val-clean');
    this.valIntimacy = el('val-intimacy');
    this.intimacyLabel = el('intimacy-label');

    // panels
    this.infoPanel     = el('info-panel');
    this.menuPanel     = el('menu-panel');
    this.nameModal     = el('name-modal');
    this.minigameOverlay = el('minigame-overlay');

    // speech
    this.speechBubble = el('speech-bubble');
    this.speechText   = el('speech-text');
    this._speechTimer = null;
    this._typingInterval = null;

    // toast
    this.toast      = el('toast');
    this.toastText  = el('toast-text');
    this._toastTimer = null;

    // led
    this.led = el('led-dot');

    // device
    this.device = el('device');
  }

  // ─── stat bars ────────────────────────────────────────────────────────────────

  updateStats(pet) {
    this._setBar(this.barHunger,   this.valHunger,   pet.hunger);
    this._setBar(this.barHappy,    this.valHappy,     pet.happiness);
    this._setBar(this.barClean,    this.valClean,     pet.clean);
    this._setBar(this.barIntimacy, this.valIntimacy,  pet.intimacy / 10, false);

    // intimacy tier label
    const tier = pet.getIntimacyTier();
    this.intimacyLabel.textContent = tier.label;
    this.barIntimacy.style.setProperty('--tier-color', tier.color);

    // low stat warning classes
    this.barHunger.classList.toggle('low', pet.hunger < 20);
    this.barHappy.classList.toggle('low',  pet.happiness < 20);
    this.barClean.classList.toggle('low',  pet.clean < 20);
  }

  _setBar(barEl, valEl, value, clamp100 = true) {
    const pct  = clamp100 ? Math.max(0, Math.min(100, value)) : Math.max(0, Math.min(100, value));
    barEl.style.width = `${pct}%`;
    if (valEl) valEl.textContent = Math.floor(value);
  }

  // ─── LED indicator ────────────────────────────────────────────────────────────

  setLed(mode) {
    // mode: 'off' | 'active' | 'alert'
    this.led.className = 'led-dot' + (mode !== 'off' ? ` ${mode}` : '');
  }

  // ─── Speech bubble ────────────────────────────────────────────────────────────

  /**
   * Show speech bubble with typing animation.
   * @param {string} text - text to display
   * @param {number} durationMs - how long to show (after typing)
   */
  showSpeech(text, durationMs = 3500) {
    if (!text) return;

    clearTimeout(this._speechTimer);
    clearInterval(this._typingInterval);

    this.speechBubble.classList.remove('hidden');
    this.speechText.textContent = '';

    let i = 0;
    const chars = [...text];

    this._typingInterval = setInterval(() => {
      if (i < chars.length) {
        this.speechText.textContent += chars[i++];
      } else {
        clearInterval(this._typingInterval);
      }
    }, 40);

    const totalDuration = durationMs + chars.length * 40;
    this._speechTimer = setTimeout(() => {
      this.speechBubble.classList.add('hidden');
    }, totalDuration);
  }

  hideSpeech() {
    clearTimeout(this._speechTimer);
    clearInterval(this._typingInterval);
    this.speechBubble.classList.add('hidden');
  }

  // ─── Toast notifications ──────────────────────────────────────────────────────

  toast_(msg, durationMs = 2500) {
    clearTimeout(this._toastTimer);
    this.toastText.textContent = msg;
    this.toast.classList.remove('hidden');

    // Force reflow for animation restart
    void this.toast.offsetWidth;
    this.toast.classList.add('show');

    this._toastTimer = setTimeout(() => {
      this.toast.classList.remove('show');
      setTimeout(() => this.toast.classList.add('hidden'), 300);
    }, durationMs);
  }

  // ─── Panels ──────────────────────────────────────────────────────────────────

  openInfo(pet) {
    const stats = pet.toStatsObject();
    el('info-name').textContent   = stats.name;
    el('info-age').textContent    = stats.age;
    el('info-stage').textContent  = stats.stage;
    el('info-bond').textContent   = stats.bond;
    el('info-fed').textContent    = stats.timesFed;
    el('info-played').textContent = stats.timesPlayed;
    el('info-mood').textContent   = stats.mood;
    el('info-action').textContent = stats.lastAction.toUpperCase();
    this.infoPanel.classList.remove('hidden');
  }

  closeInfo()   { this.infoPanel.classList.add('hidden'); }
  openMenu()    { this.menuPanel.classList.remove('hidden'); }
  closeMenu()   { this.menuPanel.classList.add('hidden'); }
  openNameModal() { this.nameModal.classList.remove('hidden'); el('pet-name-input').focus(); }
  closeNameModal() { this.nameModal.classList.add('hidden'); }

  openMinigame(title = '✦ CATCH THE STAR ✦') {
    el('minigame-title').textContent = title;
    this.minigameOverlay.classList.remove('hidden');
  }
  closeMinigame() { this.minigameOverlay.classList.add('hidden'); }

  // ─── Menu state toggles ───────────────────────────────────────────────────────

  setAIStatus(on) {
    el('ai-status').textContent   = on ? 'ON' : 'OFF';
    el('ai-status').style.color   = on ? '#22c55e' : '#6b7280';
  }

  setSoundStatus(on) {
    el('sound-status').textContent = on ? 'ON' : 'OFF';
    el('sound-status').style.color = on ? '#22c55e' : '#6b7280';
  }

  setSpeedStatus(label) {
    el('speed-status').textContent = label;
  }

  // ─── Device animation helpers ─────────────────────────────────────────────────

  deviceShake() {
    this.device.classList.add('upset');
    setTimeout(() => this.device.classList.remove('upset'), 1000);
  }

  deviceFloat(on) {
    this.device.classList.toggle('happy', on);
  }
}
