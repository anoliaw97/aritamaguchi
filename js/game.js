/**
 * game.js - Main game loop & orchestration
 *
 * Responsibilities:
 *  - Boot sequence (load/create save, show name modal)
 *  - requestAnimationFrame game loop
 *  - Wire buttons → pet actions
 *  - Update pet, renderer, UI, scheduler
 *  - Persist save every 30s
 *  - Mini-game lifecycle
 *  - Keyboard / touch input
 */

import { Pet, PET_STATES } from './pet.js';
import { Renderer, MiniGameRenderer } from './renderer.js';
import { EventScheduler, MiniGame } from './events.js';
import { PersonalityEngine } from './personality.js';
import { UI } from './ui.js';

// ─── globals ──────────────────────────────────────────────────────────────────

const pet         = new Pet();
const renderer    = new Renderer(document.getElementById('game-canvas'));
const personality = new PersonalityEngine();
const scheduler   = new EventScheduler();
const ui          = new UI();

const mgCanvas    = document.getElementById('minigame-canvas');
const mgRenderer  = new MiniGameRenderer(mgCanvas);
const miniGame    = new MiniGame(mgCanvas.width, mgCanvas.height);

let lastTime      = 0;
let saveTimer     = 0;
let aiEnabled     = true;
let soundEnabled  = true;
let speedMode     = 0;  // 0=normal 1=fast 2=turbo
const SPEED_LABELS = ['NORMAL', 'FAST', 'TURBO'];
const SPEED_MULTS  = [1, 3, 10];

// ─── audio (web audio api tones) ─────────────────────────────────────────────

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTone(freq = 440, dur = 0.1, type = 'square', vol = 0.08) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + dur + 0.01);
  } catch {}
}

function playFeedSound()  { playTone(440, 0.08); setTimeout(() => playTone(660, 0.1), 100); }
function playPlaySound()  { [330,440,550,660].forEach((f,i) => setTimeout(() => playTone(f,0.08,'triangle'), i*80)); }
function playCleanSound() { [550,660,770].forEach((f,i) => setTimeout(() => playTone(f,0.06,'sine'), i*60)); }
function playErrorSound() { playTone(220, 0.15, 'sawtooth', 0.05); }
function playLevelSound() { [440,550,660,880].forEach((f,i) => setTimeout(() => playTone(f,0.12,'triangle',0.1), i*100)); }

// ─── boot ─────────────────────────────────────────────────────────────────────

function boot() {
  const loaded = pet.load();

  if (!loaded) {
    // new pet — show name modal
    ui.openNameModal();
  } else {
    startGame();
  }

  // name confirm
  document.getElementById('name-confirm').addEventListener('click', () => {
    const name = document.getElementById('pet-name-input').value.trim() || 'Ari';
    pet.reset(name);
    personality.setPlayerName(name);
    ui.closeNameModal();
    startGame();
    ui.toast_(`Welcome, ${name}! 🌟`);
  });

  document.getElementById('pet-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('name-confirm').click();
  });
}

function startGame() {
  personality.setPlayerName(pet.name);
  pet.speedMult = SPEED_MULTS[speedMode];
  wireButtons();
  wireScheduler();
  wireMenu();
  wireMinigame();
  wireKeyboard();
  requestAnimationFrame(loop);

  // initial speech
  setTimeout(() => {
    const line = personality.speak('idle', pet.intimacy, pet.name);
    if (line) ui.showSpeech(line);
  }, 1500);
}

// ─── main loop ────────────────────────────────────────────────────────────────

function loop(ts) {
  const dt = Math.min(ts - lastTime, 100);  // cap at 100ms to prevent spiral
  lastTime = ts;

  // --- update pet ---
  const prevState    = pet.state;
  const prevIntimacy = Math.floor(pet.intimacy);
  pet.update(dt);

  // --- mini-game ---
  if (miniGame.active && !miniGame.over) {
    miniGame.update(dt);
    mgRenderer.render(miniGame);
  } else if (miniGame.active && miniGame.over) {
    const reward = miniGame.getReward();
    mgRenderer.renderGameOver(reward.score, reward.happinessBonus);
  }

  // --- state change reactions ---
  if (pet.state !== prevState) {
    onStateChange(prevState, pet.state);
  }

  // --- intimacy tier-up ---
  if (Math.floor(pet.intimacy / 100) > Math.floor(prevIntimacy / 100)) {
    onIntimacyTierUp();
  }

  // --- render main screen ---
  renderer.render(pet, dt);

  // --- update UI ---
  ui.updateStats(pet);
  updateLed();
  ui.deviceFloat(pet.happiness > 80 && pet.intimacy >= 500);

  // --- event scheduler ---
  scheduler.tick();

  // --- auto-save every 30s ---
  saveTimer += dt;
  if (saveTimer > 30000) {
    saveTimer = 0;
    pet.save();
  }

  requestAnimationFrame(loop);
}

// ─── state transitions ────────────────────────────────────────────────────────

function onStateChange(from, to) {
  const line = personality.speak(to, pet.intimacy, pet.name);
  if (line) ui.showSpeech(line);

  // flash colors
  if (to === PET_STATES.EATING)   renderer.flash('rgba(163,230,53,0.2)', 300);
  if (to === PET_STATES.HAPPY)    renderer.flash('rgba(192,132,252,0.2)', 300);
  if (to === PET_STATES.SLEEPING) renderer.flash('rgba(99,102,241,0.2)', 300);
  if (to === PET_STATES.SAD)      renderer.flash('rgba(239,68,68,0.15)', 300);
  if (to === PET_STATES.BEGGING)  { renderer.flash('rgba(239,68,68,0.2)', 400); ui.deviceShake(); }
  if (to === PET_STATES.SICK)     renderer.flash('rgba(250,204,21,0.1)', 300);
}

function onIntimacyTierUp() {
  playLevelSound();
  const line = personality.speakContext('levelup') || personality.speak('levelup', pet.intimacy, pet.name);
  ui.showSpeech(line || '🌟 Bond level up!');
  ui.toast_('✨ Bond level increased!', 3000);
  renderer.flash('rgba(251,191,36,0.3)', 500);
}

// ─── LED indicator ────────────────────────────────────────────────────────────

function updateLed() {
  if (pet.hunger < 20 || pet.happiness < 15) {
    ui.setLed('alert');
  } else if (pet.state !== PET_STATES.SLEEPING) {
    ui.setLed('active');
  } else {
    ui.setLed('off');
  }
}

// ─── button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  document.getElementById('btn-feed').addEventListener('click', () => {
    const result = pet.feed();
    if (result.ok) {
      playFeedSound();
      ui.toast_(result.msg);
      const speech = personality.speak('eating', pet.intimacy, pet.name);
      if (speech) ui.showSpeech(speech);
    } else {
      playErrorSound();
      ui.toast_(result.msg);
    }
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    const result = pet.play();
    if (result.ok) {
      playPlaySound();
      ui.toast_(result.msg);
      // open mini game
      miniGame.start();
      ui.openMinigame();
    } else {
      playErrorSound();
      ui.toast_(result.msg);
    }
  });

  document.getElementById('btn-clean').addEventListener('click', () => {
    const result = pet.clean();
    if (result.ok) {
      playCleanSound();
      ui.toast_(result.msg);
      const speech = personality.speak('cleaning', pet.intimacy, pet.name);
      if (speech) ui.showSpeech(speech);
    } else {
      playErrorSound();
      ui.toast_(result.msg);
    }
  });

  document.getElementById('btn-menu').addEventListener('click', () => {
    playTone(330, 0.05, 'sine');
    ui.openMenu();
  });

  // d-pad (navigate/interact)
  document.getElementById('dpad-left').addEventListener('click', () => {
    playTone(330, 0.04, 'square');
  });
  document.getElementById('dpad-right').addEventListener('click', () => {
    playTone(440, 0.04, 'square');
  });
  document.getElementById('dpad-select').addEventListener('click', () => {
    playTone(550, 0.08, 'triangle');
    // poke the pet for a random reaction
    pokeReaction();
  });
}

function pokeReaction() {
  // gentle poke: triggers a random idle speech/reaction
  const contexts = ['idle', 'idle', 'happy', 'play_request', 'fed_recently'];
  const ctx = contexts[Math.floor(Math.random() * contexts.length)];
  const line = personality.speak(ctx, pet.intimacy, pet.name);
  if (line) ui.showSpeech(line);
  // small intimacy boost for interaction
  pet.data.intimacy = Math.min(1000, pet.data.intimacy + 1);
  pet.jump = 0.5;
}

// ─── scheduler events ────────────────────────────────────────────────────────

function wireScheduler() {
  scheduler
    .on('morning', ({ hour }) => {
      const line = personality.speakTimeOfDay('morning', pet.intimacy);
      if (line) ui.showSpeech(line, 4000);
      if (hour === 7) ui.toast_('☀️ Good morning!', 3000);
    })
    .on('midday', () => {
      if (pet.hunger < 60) {
        const line = personality.speak('hungry', pet.intimacy, pet.name);
        if (line) ui.showSpeech(line, 4000);
        ui.toast_('🍖 Snack time?');
      }
    })
    .on('afternoon', () => {
      const line = personality.speak('play_request', pet.intimacy, pet.name);
      if (line) ui.showSpeech(line, 4000);
    })
    .on('evening', () => {
      const line = personality.speakTimeOfDay('evening', pet.intimacy);
      if (line) ui.showSpeech(line, 4000);
    })
    .on('night', () => {
      const line = personality.speakTimeOfDay('night', pet.intimacy);
      if (line) ui.showSpeech(line, 4000);
      ui.toast_('🌙 Getting sleepy...', 3000);
    })
    .on('latenight', () => {
      ui.toast_('💤 Pet is sleeping. Come back tomorrow!', 4000);
    })
    .on('minutecheck', ({ hour }) => {
      if (pet.data.poopCount > 0 && Math.random() < 0.3) {
        const line = personality.speakContext('poop_alert');
        if (line) ui.showSpeech(line);
      }
    });
}

// ─── menu wiring ─────────────────────────────────────────────────────────────

function wireMenu() {
  document.getElementById('close-info').addEventListener('click',    () => ui.closeInfo());
  document.getElementById('close-menu').addEventListener('click',    () => ui.closeMenu());
  document.getElementById('close-minigame').addEventListener('click', () => {
    miniGame.active = false;
    ui.closeMinigame();
  });

  document.getElementById('menu-stats').addEventListener('click', () => {
    ui.closeMenu();
    ui.openInfo(pet);
  });

  document.getElementById('menu-rename').addEventListener('click', () => {
    ui.closeMenu();
    document.getElementById('pet-name-input').value = pet.name;
    ui.openNameModal();
    // repurpose confirm for rename
    const btn = document.getElementById('name-confirm');
    btn.onclick = () => {
      const newName = document.getElementById('pet-name-input').value.trim() || pet.name;
      pet.name = newName;
      personality.setPlayerName(newName);
      ui.closeNameModal();
      ui.toast_(`Name changed to ${newName}!`);
      pet.save();
    };
  });

  document.getElementById('menu-ai-toggle').addEventListener('click', () => {
    aiEnabled = !aiEnabled;
    ui.setAIStatus(aiEnabled);
    if (aiEnabled) {
      const key = prompt('Optional: Enter Anthropic API key for AI speech (leave blank for template mode):');
      if (key?.trim()) {
        personality.enableAI(key.trim());
        ui.toast_('🤖 AI mode enabled!');
      } else {
        personality.disableAI();
        ui.toast_('🤖 Template speech mode');
      }
    } else {
      personality.disableAI();
      ui.toast_('🤖 AI speech disabled');
    }
  });

  document.getElementById('menu-sound').addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    pet.soundEnabled = soundEnabled;
    ui.setSoundStatus(soundEnabled);
    ui.toast_(soundEnabled ? '🔊 Sound ON' : '🔇 Sound OFF');
  });

  document.getElementById('menu-speed').addEventListener('click', () => {
    speedMode = (speedMode + 1) % SPEED_MULTS.length;
    pet.speedMult = SPEED_MULTS[speedMode];
    ui.setSpeedStatus(SPEED_LABELS[speedMode]);
    ui.toast_(`⚡ Speed: ${SPEED_LABELS[speedMode]}`);
    if (speedMode > 0) ui.toast_('⚠️ Fast mode for testing only!', 4000);
  });

  document.getElementById('menu-reset').addEventListener('click', () => {
    if (confirm(`Really reset ${pet.name}? This cannot be undone.`)) {
      ui.closeMenu();
      ui.openNameModal();
      document.getElementById('pet-name-input').value = '';
      document.getElementById('name-confirm').onclick = () => {
        const name = document.getElementById('pet-name-input').value.trim() || 'Ari';
        pet.reset(name);
        personality.setPlayerName(name);
        ui.closeNameModal();
        ui.toast_(`${name} is born anew! 🌟`);
      };
    }
  });
}

// ─── mini-game wiring ────────────────────────────────────────────────────────

function wireMinigame() {
  const mgLeft   = document.getElementById('mg-btn-left');
  const mgRight  = document.getElementById('mg-btn-right');
  const mgAction = document.getElementById('mg-btn-action');

  mgLeft.addEventListener('pointerdown',   () => miniGame.setLeft(true));
  mgLeft.addEventListener('pointerup',     () => miniGame.setLeft(false));
  mgLeft.addEventListener('pointerleave',  () => miniGame.setLeft(false));
  mgRight.addEventListener('pointerdown',  () => miniGame.setRight(true));
  mgRight.addEventListener('pointerup',    () => miniGame.setRight(false));
  mgRight.addEventListener('pointerleave', () => miniGame.setRight(false));

  mgAction.addEventListener('click', () => {
    if (miniGame.over) {
      // close and apply reward
      applyMinigameReward();
    }
  });

  // poll mini-game state
  setInterval(() => {
    if (miniGame.active && miniGame.over) {
      // show action button prompt
      document.getElementById('mg-btn-action').textContent = '✓';
    } else {
      document.getElementById('mg-btn-action').textContent = '●';
    }
  }, 500);
}

function applyMinigameReward() {
  const reward = miniGame.getReward();
  pet.data.happiness = Math.min(100, pet.data.happiness + reward.happinessBonus);
  pet.data.intimacy  = Math.min(1000, pet.data.intimacy + reward.intimacyBonus);
  pet.data.timesPlayed++;
  miniGame.active    = false;
  ui.closeMinigame();
  playLevelSound();
  ui.toast_(`+${reward.happinessBonus} Happiness! Score: ${reward.score} 🌟`, 3000);
  const speech = personality.speak('happy', pet.intimacy, pet.name);
  if (speech) ui.showSpeech(speech);
}

// ─── keyboard controls ───────────────────────────────────────────────────────

function wireKeyboard() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
      case 'KeyF':
        document.getElementById('btn-feed').click();
        break;
      case 'KeyP':
        document.getElementById('btn-play').click();
        break;
      case 'KeyC':
        document.getElementById('btn-clean').click();
        break;
      case 'KeyM':
        document.getElementById('btn-menu').click();
        break;
      case 'Space':
      case 'Enter':
        document.getElementById('dpad-select').click();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        if (miniGame.active) miniGame.tap('left');
        break;
      case 'ArrowRight':
        if (miniGame.active) miniGame.tap('right');
        break;
      case 'Escape':
        ui.closeInfo();
        ui.closeMenu();
        break;
    }
  });

  // touch swipe for mini-game
  let touchStartX = 0;
  document.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend',   e => {
    if (!miniGame.active || miniGame.over) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 20) miniGame.tap(dx < 0 ? 'left' : 'right');
  }, { passive: true });
}

// ─── kick off ─────────────────────────────────────────────────────────────────

boot();
