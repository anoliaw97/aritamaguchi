/**
 * main.js — Aritamaguchi Desktop Pet
 *
 * Main Electron process.  All game logic lives here:
 *
 *   ┌─ SHIMEJI PHYSICS ────────────────────────────────────────────────────────┐
 *   │  walk  →  hit wall  →  climb  →  reach ceiling  →  walk ceiling  →  fall  │
 *   │  drag (user grabs pet)  →  throw  →  fall                               │
 *   └───────────────────────────────────────────────────────────────────────────┘
 *
 *   ┌─ DIGIMON MECHANICS ───────────────────────────────────────────────────────┐
 *   │  Hunger hearts (0-4), Strength hearts (0-4), Weight, Discipline %        │
 *   │  Care mistakes drive branching evolution (7 stages)                      │
 *   │  Sickness, Calling, Battles, Lights on/off                               │
 *   └───────────────────────────────────────────────────────────────────────────┘
 *
 * The renderer (renderer/app.js) is a dumb canvas; it only draws the state
 * object that this process sends via IPC every frame.
 *
 * IPC channels:
 *   main → renderer : 'draw'   { ...drawState }
 *   renderer → main : 'set-ignore-mouse'  { ignore: bool }
 *   renderer → main : 'drag-start'        { screenX, screenY }
 *   renderer → main : 'drag-move'         { screenX, screenY }
 *   renderer → main : 'drag-end'
 *   renderer → main : 'context-menu'
 */

'use strict';

const {
  app, BrowserWindow, Tray, Menu, nativeImage,
  ipcMain, screen, Notification, shell,
} = require('electron');
const path = require('path');
const fs   = require('fs');

// ── Window dimensions ─────────────────────────────────────────────────────────
const WIN_W = 160;
const WIN_H = 160;

// ── Physics constants ─────────────────────────────────────────────────────────
const GRAVITY    = 0.5;   // px / frame²
const WALK_SPD   = 0.6;   // px / frame  (floor / ceiling)
const CLIMB_SPD  = 0.5;   // px / frame  (walls)
const BOUNCE_VY  = -6;    // px / frame  (jump / throw bounce)
const THROW_MULT = 0.18;  // drag velocity scale on release
const TICK_MS    = 16;    // ~60 fps physics

// ── Digimon evolution stages ──────────────────────────────────────────────────
const EVO = { EGG:0, BABY1:1, BABY2:2, ROOKIE:3, CHAMPION:4, ULTIMATE:5, MEGA:6 };
const EVO_INFO = [
  { label:'EGG',      sprite:'egg',      nextHr: 0.083 },
  { label:'BABY I',   sprite:'baby1',    nextHr: 1     },
  { label:'BABY II',  sprite:'baby2',    nextHr: 12    },
  { label:'ROOKIE',   sprite:'rookie',   nextHr: 36    },
  { label:'CHAMPION', sprite:'champion', nextHr: 84    },
  { label:'ULTIMATE', sprite:'ultimate', nextHr: 156   },
  { label:'MEGA',     sprite:'mega',     nextHr: 9999  },
];
const EVO_PATHS = {
  [EVO.BABY1]: [{ form:'koromon',  name:'Koromon',  color:'#ff9999', req:{} }],
  [EVO.BABY2]: [
    { form:'patamon',  name:'Patamon',  color:'#ffcc88', req:{ careMistakes:{max:2}, discipline:{min:70} } },
    { form:'agumon',   name:'Agumon',   color:'#ff8800', req:{ careMistakes:{max:3}, discipline:{min:50} } },
    { form:'gabumon',  name:'Gabumon',  color:'#6699ff', req:{ careMistakes:{max:3}, weight:{max:20} } },
    { form:'palmon',   name:'Palmon',   color:'#44cc44', req:{ careMistakes:{max:5} } },
    { form:'numemon',  name:'Numemon',  color:'#888888', req:{} },
  ],
  [EVO.ROOKIE]: [
    { form:'angemon',   name:'Angemon',   color:'#ffffaa', req:{ discipline:{min:80}, careMistakes:{max:1} } },
    { form:'greymon',   name:'Greymon',   color:'#ff6600', req:{ battles:{min:5},  discipline:{min:60}, careMistakes:{max:3} } },
    { form:'garurumon', name:'Garurumon', color:'#99bbff', req:{ weight:{max:20},  careMistakes:{max:2} } },
    { form:'togemon',   name:'Togemon',   color:'#55bb55', req:{ weight:{min:30} } },
    { form:'devimon',   name:'Devimon',   color:'#cc44aa', req:{ careMistakes:{min:5} } },
    { form:'numemon_c', name:'Numemon',   color:'#666666', req:{} },
  ],
  [EVO.CHAMPION]: [
    { form:'magnaangemon',  name:'MagnaAngemon',  color:'#ffff88', req:{ discipline:{min:90}, careMistakes:{max:0} } },
    { form:'metalgreymon',  name:'MetalGreymon',  color:'#ff8822', req:{ battles:{min:15}, discipline:{min:70}, careMistakes:{max:2} } },
    { form:'weregarurumon', name:'WereGarurumon', color:'#aaaaff', req:{ weight:{max:22},  battles:{min:10} } },
    { form:'myotismon',     name:'Myotismon',     color:'#cc44cc', req:{ careMistakes:{min:4} } },
    { form:'machgaogamon',  name:'MachGaogamon',  color:'#ff6644', req:{} },
  ],
  [EVO.ULTIMATE]: [
    { form:'omnimon',        name:'Omnimon',        color:'#ffffff', req:{ battles:{min:40}, discipline:{min:95}, careMistakes:{max:0} } },
    { form:'wargreymon',     name:'WarGreymon',     color:'#ff4400', req:{ battles:{min:30}, careMistakes:{max:1} } },
    { form:'piedmon',        name:'Piedmon',        color:'#cc00cc', req:{ careMistakes:{min:3} } },
    { form:'metalgarurumon', name:'MetalGarurumon', color:'#8888ff', req:{} },
  ],
};

// ── Globals ───────────────────────────────────────────────────────────────────
let win   = null;
let tray  = null;
let physicsInterval = null;
let saveInterval    = null;

// ── Physics state ─────────────────────────────────────────────────────────────
const phys = {
  x: 0, y: 0,         // window top-left in screen-space
  vx: 0, vy: 0,       // velocity
  surface: 'air',     // 'floor' | 'left_wall' | 'right_wall' | 'ceiling' | 'air'
  facing: 1,          // 1 = right, -1 = left
  behavior: 'idle',
  behaviorMs: 0,      // ms remaining in current behavior
  dragging: false,
  dragOX: 0, dragOY: 0,  // drag offset from window top-left to mouse
  prevMouseX: 0, prevMouseY: 0,
  throwVX: 0, throwVY: 0,
  floorY: 0, maxX: 0,    // bounds (set on init / screen change)
  animFrame: 0,
  animMs: 0,
  walkPhase: 0,
  breatheT: 0,
};

// ── Digimon pet state ─────────────────────────────────────────────────────────
const pet = {
  name:         'Digi',
  stage:        EVO.BABY1,
  form:         'koromon',
  formName:     'Koromon',
  formColor:    '#ff9999',
  // Stat hearts (0–4)
  hunger:       4,
  strength:     4,
  // Numeric stats
  weight:       10,
  age:          0,
  discipline:   50,
  careMistakes: 0,
  battleWins:   0,
  battleTotal:  0,
  // Flags
  sick:       false,
  sickTicks:  0,
  lightsOn:   true,
  // Call system
  calling:      false,
  callReason:   null,
  callIgnoredMs: 0,
  // Game state
  state:       'idle',   // idle | hungry | sleeping | sick | calling | evolving | dead
  stateLockMs: 0,        // ms until state lock expires
  speedMult:   1,
  // Timers (ms, real-time before speedMult)
  _hungerMs:   30*60*1000,
  _strengthMs: 60*60*1000,
  _weightMs:   45*60*1000,
  _poopMs:     rng(3,6)*60*1000,
  _sickMs:     10*60*1000,
  _ageMs:      60*60*1000,
  _callMs:     rng(5,15)*60*1000,
  _evoMs:      0,
  _evoTarget:  1*60*60*1000,   // baby1 → baby2: 1 hr
  poopCount:   0,
  // Flash / evolving overlay
  flashAlpha:  0,
  flashColor:  '#ffffff',
  // Groq AI appearance + behavior
  groqState: {
    hairColor:      '#FF9EC4',
    dressColor:     '#6CA8FF',
    mood:           'neutral',
    speech:         null,
    behaviorBias:   'normal',
    walkSpeedMult:  1.0,
  },
};

function rng(a, b) { return a + Math.random() * (b - a); }

// ─────────────────────────────────────────────────────────────────────────────
// GROQ AI INTEGRATION
// ─────────────────────────────────────────────────────────────────────────────
let groqApiKey = '';
let groqInterval = null;

function loadGroqKey() {
  try {
    const p = path.join(app.getPath('userData'), 'groq.json');
    if (fs.existsSync(p)) {
      const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      groqApiKey = cfg.key || '';
    }
  } catch {}
}

function saveGroqKey(key) {
  try {
    const p = path.join(app.getPath('userData'), 'groq.json');
    fs.writeFileSync(p, JSON.stringify({ key }));
  } catch {}
}

async function callGroq() {
  if (!groqApiKey) return;
  const stageNames = ['EGG','BABY I','BABY II','ROOKIE','CHAMPION','ULTIMATE','MEGA'];
  const hour = new Date().getHours();
  const timeOfDay = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const userMsg =
    `Pet: stage=${stageNames[pet.stage]}, hunger=${pet.hunger}/4, strength=${pet.strength}/4, ` +
    `mood=${pet.groqState.mood}, time=${timeOfDay}, sick=${pet.sick}. ` +
    `Respond ONLY with valid JSON: {"hairColor":"#hex","dressColor":"#hex",` +
    `"mood":"playful|tired|happy|curious|mischievous|calm|neutral",` +
    `"speech":"short phrase under 35 chars or null","behaviorBias":"normal|walk_more|idle_more|climb_more",` +
    `"walkSpeedMult":0.8}`;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: 'You control a chibi anime girl desktop pet. Respond ONLY with valid JSON. No markdown, no explanation, just JSON.' },
          { role: 'user',   content: userMsg },
        ],
        max_tokens: 150,
        temperature: 0.85,
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return;
    const p2 = JSON.parse(m[0]);
    const hexRe = /^#[0-9a-fA-F]{6}$/;
    if (p2.hairColor  && hexRe.test(p2.hairColor))  pet.groqState.hairColor  = p2.hairColor;
    if (p2.dressColor && hexRe.test(p2.dressColor)) pet.groqState.dressColor = p2.dressColor;
    if (p2.mood)         pet.groqState.mood         = String(p2.mood).slice(0, 20);
    if (p2.behaviorBias) pet.groqState.behaviorBias = String(p2.behaviorBias).slice(0, 20);
    if (typeof p2.walkSpeedMult === 'number')
      pet.groqState.walkSpeedMult = Math.max(0.3, Math.min(1.5, p2.walkSpeedMult));
    if (p2.speech && typeof p2.speech === 'string' && p2.speech !== 'null') {
      pet.groqState.speech = p2.speech.slice(0, 40);
      sendMessage(pet.groqState.speech);
    }
  } catch { /* silent — keep previous groqState */ }
}

function startGroqLoop() {
  if (groqInterval) return; // already running
  setTimeout(callGroq, 1000);
  groqInterval = setInterval(callGroq, 3 * 60 * 1000);
}

// ── Key prompt window ──────────────────────────────────────────────────────
let keyWin = null;

function openKeyPrompt() {
  if (keyWin && !keyWin.isDestroyed()) { keyWin.focus(); return; }
  keyWin = new BrowserWindow({
    width: 320,
    height: 380,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: 'Aritamaguchi — Groq API Key',
    backgroundColor: '#0f0d2a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  keyWin.setMenuBarVisibility(false);
  keyWin.loadFile(path.join(__dirname, 'renderer', 'key-prompt.html'));
  keyWin.on('closed', () => { keyWin = null; });
}

// ─────────────────────────────────────────────────────────────────────────────
// SAVE / LOAD
// ─────────────────────────────────────────────────────────────────────────────
const SAVE_PATH = path.join(app.getPath('userData'), 'save.json');

function savePet() {
  try { fs.writeFileSync(SAVE_PATH, JSON.stringify({ ...pet, ts: Date.now() })); } catch {}
}

function loadPet() {
  try {
    if (!fs.existsSync(SAVE_PATH)) return false;
    const d = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    Object.assign(pet, d);
    // Offline decay (up to 4h)
    if (d.ts) {
      const offline = Math.min(Date.now() - d.ts, 4*60*60*1000);
      const hTick   = Math.floor(offline / (30*60*1000));
      const sTick   = Math.floor(offline / (60*60*1000));
      pet.hunger    = Math.max(0, pet.hunger   - hTick);
      pet.strength  = Math.max(0, pet.strength - sTick);
      pet.age      += Math.floor(offline / (60*60*1000));
      if (pet.hunger === 0 && hTick > 0) pet.careMistakes++;
    }
    pet.calling    = false;
    pet.callReason = null;
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// DIGIMON PET ACTIONS  (called from context menu / tray)
// ─────────────────────────────────────────────────────────────────────────────

function petFeed(type = 'meal') {
  if (!pet.lightsOn) return notify('Lights off!', 'Turn lights on first.');
  if (pet.sick)      return notify('Medicine first!', 'Your pet is sick!');
  if (pet.hunger >= 4) return notify('Not hungry!', 'Already full.');
  if (type === 'meal') { pet.hunger = Math.min(4, pet.hunger+2); pet.weight++; }
  else                 { pet.hunger = Math.min(4, pet.hunger+1); }
  if (pet.calling && pet.callReason === 'hungry') { pet.calling = false; pet.callReason = null; }
  setPetState('eating', 2000);
  flash('#ffcc44', 0.5);
}

function petTrain() {
  if (!pet.lightsOn)      return notify('Lights off!', '');
  if (pet.hunger <= 1)    return notify('Too hungry!', 'Feed first.');
  if (pet.stage < EVO.BABY2) return notify('Too young!', 'Wait until Baby II.');
  pet.strength = Math.min(4, pet.strength + 1);
  if (pet.weight > 5) pet.weight--;
  setPetState('training', 1800);
  flash('#44ccff', 0.4);
}

function petClean() {
  if (pet.poopCount === 0) return notify('All clean!', 'Nothing to clean.');
  pet.poopCount = 0;
  if (pet.calling && pet.callReason === 'poop') { pet.calling = false; pet.callReason = null; }
  flash('#88ffaa', 0.4);
}

function petMedicine() {
  if (!pet.sick) return notify('Not sick!', '');
  pet.sick      = false;
  pet.sickTicks = 0;
  setPetState('happy', 2000);
  flash('#ff88cc', 0.6);
}

function petDiscipline() {
  if (pet.stage <= EVO.BABY1) return notify('Too young!', '');
  if (pet.calling && pet.callReason === 'bored') {
    pet.discipline = Math.min(100, pet.discipline + 10);
    pet.calling    = false;
    pet.callReason = null;
    setPetState('disciplined', 1500);
    notify('Disciplined!', `${pet.formName} will behave.`);
  } else {
    pet.discipline = Math.max(0, pet.discipline - 5);
    notify('Wrong timing!', 'Pet was not acting up.');
  }
}

function petBattle() {
  if (pet.stage < EVO.ROOKIE) return notify('Not ready!', 'Evolve to Rookie first.');
  if (pet.hunger <= 1)         return notify('Too hungry!', 'Feed first.');
  if (pet.strength === 0)       return notify('Too weak!', 'Train first.');
  const oppStr    = 1 + Math.floor(Math.random() * pet.stage);
  const diff      = pet.strength - oppStr;
  const winChance = Math.max(0.1, Math.min(0.9, 0.5 + diff * 0.15));
  const won       = Math.random() < winChance;
  pet.battleTotal++;
  pet.hunger = Math.max(0, pet.hunger - 1);
  if (won) {
    pet.battleWins++;
    setPetState('win', 3000);
    flash('#ffdd44', 0.7);
    notify('Victory! ⚔️', `${pet.formName} defeated the opponent!`);
  } else {
    pet.strength = Math.max(0, pet.strength - 1);
    setPetState('lose', 2500);
    flash('#ff4444', 0.5);
    notify('Defeat...', 'Your pet lost the battle.');
  }
}

function petToggleLights() {
  pet.lightsOn = !pet.lightsOn;
  if (!pet.lightsOn) {
    pet.calling = false;
    pet.callReason = null;
    pet.state = 'sleeping';
    notify('Lights off', `${pet.formName} is sleeping. Good night!`);
  } else {
    refreshPetState();
    notify('Lights on', `${pet.formName} is awake!`);
  }
  rebuildTrayMenu();
}

// ─────────────────────────────────────────────────────────────────────────────
// DIGIMON PET ENGINE LOOP (runs every TICK_MS in physics interval)
// ─────────────────────────────────────────────────────────────────────────────

function tickPet(dt) {
  if (pet.state === 'dead') return;
  const speed = pet.speedMult;
  const scaled = dt * speed;

  // State lock
  if (pet.stateLockMs > 0) {
    pet.stateLockMs -= scaled;
    if (pet.stateLockMs <= 0) { pet.stateLockMs = 0; refreshPetState(); }
    return;
  }

  // Evolution timer
  pet._evoMs += scaled;
  if (pet._evoMs >= pet._evoTarget && pet.stage < EVO.MEGA) {
    evolve();
    return;
  }

  if (!pet.lightsOn) { pet.state = 'sleeping'; return; }

  // Hunger decay
  pet._hungerMs -= scaled;
  if (pet._hungerMs <= 0) {
    pet._hungerMs = 30*60*1000;
    if (pet.hunger > 0) { pet.hunger--; }
    else if (!pet.calling) { pet.careMistakes++; startCall('hungry'); }
  }

  // Strength decay
  pet._strengthMs -= scaled;
  if (pet._strengthMs <= 0) {
    pet._strengthMs = 60*60*1000;
    if (pet.strength > 0) { pet.strength--; }
    else if (!pet.calling && pet.hunger > 0) pet.careMistakes++;
  }

  // Natural weight decrease
  pet._weightMs -= scaled;
  if (pet._weightMs <= 0) { pet._weightMs = 45*60*1000; if (pet.weight > 5) pet.weight--; }

  // Age
  pet._ageMs -= scaled;
  if (pet._ageMs <= 0) { pet._ageMs = 60*60*1000; pet.age++; }

  // Poop
  pet._poopMs -= scaled;
  if (pet._poopMs <= 0) {
    pet._poopMs = rng(3,6)*60*1000;
    if (pet.poopCount < 3) { pet.poopCount++; if (!pet.calling) startCall('poop'); }
  }

  // Ignored call → care mistake
  if (pet.calling) {
    pet.callIgnoredMs += scaled;
    if (pet.callIgnoredMs >= 30*60*1000) {
      pet.callIgnoredMs = 0;
      pet.careMistakes++;
      pet.calling = false;
      pet.callReason = null;
    }
  }

  // Random bored call
  if (!pet.calling && pet.stage >= EVO.BABY2) {
    pet._callMs -= scaled;
    if (pet._callMs <= 0) { pet._callMs = rng(10,30)*60*1000; startCall('bored'); }
  }

  // Sickness
  pet._sickMs -= scaled;
  if (pet._sickMs <= 0) {
    pet._sickMs = 10*60*1000;
    if (!pet.sick) {
      const chance = pet.poopCount * 0.15 + (pet.hunger === 0 ? 0.1 : 0);
      if (Math.random() < chance) {
        pet.sick = true; pet.sickTicks = 0; pet.state = 'sick';
        notify(`${pet.formName} is sick! 🤒`, 'Give medicine quickly!');
      }
    } else {
      pet.sickTicks++;
      if (pet.sickTicks >= 3) { pet.state = 'dead'; notify('Your pet died...', 'It was left sick too long.'); }
    }
  }

  refreshPetState();
  updateTrayTooltip();
}

function startCall(reason) {
  if (pet.calling || pet.stage === EVO.EGG) return;
  pet.calling = true;
  pet.callReason = reason;
  pet.callIgnoredMs = 0;
  pet.state = 'calling';
  const msgs = { hungry: `${pet.formName} is hungry!`, bored: `${pet.formName} wants attention!`, poop: `${pet.formName} needs cleaning!` };
  notify('Your pet is calling! 📣', msgs[reason] || '');
}

function refreshPetState() {
  if (pet.stateLockMs > 0) return;
  if (['calling','sick','evolving','dead'].includes(pet.state)) return;
  if (!pet.lightsOn)    { pet.state = 'sleeping'; return; }
  if (pet.sick)         { pet.state = 'sick';     return; }
  if (pet.calling)      { pet.state = 'calling';  return; }
  if (pet.hunger === 0) { pet.state = 'hungry';   return; }
  pet.state = 'idle';
}

function setPetState(s, lockMs = 0) {
  pet.state = s;
  pet.stateLockMs = lockMs;
}

function flash(color, alpha) {
  pet.flashColor = color;
  pet.flashAlpha = alpha;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVOLUTION
// ─────────────────────────────────────────────────────────────────────────────

function evolve() {
  const nextStage = pet.stage + 1;
  if (nextStage > EVO.MEGA) return;
  const paths   = EVO_PATHS[pet.stage] || [];
  const sel     = paths.find(p => checkReq(p.req)) || paths[paths.length - 1];
  pet.stage     = nextStage;
  if (sel) { pet.form = sel.form; pet.formName = sel.name; pet.formColor = sel.color; }
  pet._evoMs    = 0;
  pet._evoTarget = (EVO_INFO[nextStage]?.nextHr ?? 9999) * 60*60*1000;
  pet.careMistakes = 0;
  pet.hunger   = 4; pet.strength = 4;
  pet.weight   = [5,5,10,15,25,35,45][nextStage] || 10;
  setPetState('evolving', 4000);
  flash('#ffffff', 0.9);
  notify(`✨ ${pet.formName} evolved!`, `${pet.name} reached ${EVO_INFO[nextStage]?.label}!`);
  rebuildTrayMenu();
}

function checkReq(req) {
  if (!req || !Object.keys(req).length) return true;
  if (req.careMistakes?.max !== undefined && pet.careMistakes > req.careMistakes.max) return false;
  if (req.careMistakes?.min !== undefined && pet.careMistakes < req.careMistakes.min) return false;
  if (req.discipline?.min   !== undefined && pet.discipline   < req.discipline.min)   return false;
  if (req.weight?.min       !== undefined && pet.weight       < req.weight.min)       return false;
  if (req.weight?.max       !== undefined && pet.weight       > req.weight.max)       return false;
  if (req.battles?.min      !== undefined && pet.battleWins   < req.battles.min)      return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHIMEJI PHYSICS
// ─────────────────────────────────────────────────────────────────────────────

function initBounds() {
  const display    = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  phys.floorY      = y + height - WIN_H;
  phys.ceilingY    = y;
  phys.leftX       = x;
  phys.rightX      = x + width - WIN_W;
  // Start at center-bottom
  phys.x           = x + Math.floor((width - WIN_W) / 2);
  phys.y           = phys.floorY;
  phys.surface     = 'floor';
}

function tickPhys(dt) {
  if (phys.dragging) {
    // Renderer sends drag-move events; we just track velocity for throw
    return;
  }

  // Gravity
  if (phys.surface === 'air') {
    phys.vy += GRAVITY;
  }

  // Apply velocity
  phys.x += phys.vx;
  phys.y += phys.vy;

  // Fade flash
  if (pet.flashAlpha > 0) {
    pet.flashAlpha = Math.max(0, pet.flashAlpha - 0.03);
  }

  // ── Collision resolution ──────────────────────────────────────────────────
  let landed = false;

  // Floor
  if (phys.y >= phys.floorY) {
    phys.y = phys.floorY;
    phys.vy = 0;
    if (phys.surface !== 'floor') { phys.surface = 'floor'; phys.vx = 0; landed = true; }
    phys.surface = 'floor';
  }

  // Ceiling
  if (phys.y <= phys.ceilingY) {
    phys.y = phys.ceilingY;
    phys.vy = 0;
    if (phys.surface !== 'ceiling') { phys.surface = 'ceiling'; phys.vx = 0; landed = true; }
    phys.surface = 'ceiling';
  }

  // Left wall
  if (phys.x <= phys.leftX) {
    phys.x = phys.leftX;
    phys.vx = 0;
    if (phys.surface === 'floor') {
      phys.surface = 'left_wall';
      phys.vy = 0;
      landed = true;
    } else if (phys.surface === 'air') {
      phys.surface = 'left_wall';
      phys.vy = 0;
    }
  }

  // Right wall
  if (phys.x >= phys.rightX) {
    phys.x = phys.rightX;
    phys.vx = 0;
    if (phys.surface === 'floor') {
      phys.surface = 'right_wall';
      phys.vy = 0;
      landed = true;
    } else if (phys.surface === 'air') {
      phys.surface = 'right_wall';
      phys.vy = 0;
    }
  }

  // ── Behavior AI ─────────────────────────────────────────────────────────────
  phys.behaviorMs -= dt;
  if (phys.behaviorMs <= 0 || landed) chooseBehavior();
  applyBehavior();

  // ── Animation ────────────────────────────────────────────────────────────────
  phys.animMs += dt;
  if (phys.animMs >= 400) { phys.animMs = 0; phys.animFrame ^= 1; }
  phys.breatheT += dt / 2800;
  phys.walkPhase += dt * 0.005;
}

function chooseBehavior() {
  const s = phys.surface;

  if (s === 'floor') {
    const r = Math.random();
    if (r < 0.05) {
      // Occasionally run toward wall to climb it
      phys.behavior    = 'walk';
      phys.facing      = Math.random() < 0.5 ? 1 : -1;
      phys.behaviorMs  = 4000 + Math.random() * 5000; // long enough to hit wall
    } else if (r < 0.45) {
      phys.behavior    = 'walk';
      phys.facing      = Math.random() < 0.5 ? 1 : -1;
      phys.behaviorMs  = 800 + Math.random() * 2500;
    } else if (r < 0.55) {
      // Little jump
      phys.behavior    = 'idle';
      phys.vy          = BOUNCE_VY * 0.7;
      phys.vx          = (Math.random() - 0.5) * 2;
      phys.surface     = 'air';
      phys.behaviorMs  = 600;
    } else {
      phys.behavior    = 'idle';
      phys.behaviorMs  = 800 + Math.random() * 2000;
    }

  } else if (s === 'left_wall' || s === 'right_wall') {
    const r = Math.random();
    if (r < 0.55) {
      phys.behavior   = 'climb';
      phys.behaviorMs = 1500 + Math.random() * 4000;
    } else if (r < 0.75) {
      phys.behavior   = 'descend';
      phys.behaviorMs = 1000 + Math.random() * 2000;
    } else {
      // Jump off wall
      phys.vx      = s === 'left_wall' ? 4 : -4;
      phys.vy      = BOUNCE_VY * 0.8;
      phys.surface = 'air';
      phys.facing  = s === 'left_wall' ? 1 : -1;
      phys.behavior    = 'idle';
      phys.behaviorMs  = 300;
    }

  } else if (s === 'ceiling') {
    const r = Math.random();
    if (r < 0.40) {
      phys.behavior   = 'ceiling_walk';
      phys.facing     = Math.random() < 0.5 ? 1 : -1;
      phys.behaviorMs = 1500 + Math.random() * 3000;
    } else if (r < 0.65) {
      phys.behavior   = 'idle';
      phys.behaviorMs = 600 + Math.random() * 1500;
    } else {
      // Drop from ceiling
      phys.vy      = 2;
      phys.surface = 'air';
      phys.behavior    = 'idle';
      phys.behaviorMs  = 200;
    }

  } else {
    phys.behavior    = 'idle';
    phys.behaviorMs  = 300;
  }
}

function applyBehavior() {
  const s = phys.surface;
  switch (phys.behavior) {
    case 'walk':
      if (s === 'floor' || s === 'air') {
        phys.vx = phys.facing * WALK_SPD;
        phys.vy = (s === 'air') ? phys.vy : 0;
      }
      break;
    case 'climb':
      phys.vx = 0;
      phys.vy = -CLIMB_SPD;
      break;
    case 'descend':
      phys.vx = 0;
      phys.vy = CLIMB_SPD;
      break;
    case 'ceiling_walk':
      phys.vx = phys.facing * WALK_SPD;
      phys.vy = 0;
      break;
    case 'idle':
    default:
      if (s !== 'air') { phys.vx = 0; phys.vy = 0; }
      break;
  }
}

// Determine animation state to send to renderer
function getAnimState() {
  if (pet.state === 'dead')     return 'dead';
  if (pet.state === 'evolving') return 'evolving';
  if (pet.state === 'sleeping') return 'sleeping';
  if (pet.state === 'sick')     return 'sick';
  if (pet.state === 'calling')  return 'calling';
  if (pet.state === 'eating')   return 'eating';
  if (pet.state === 'training') return 'training';
  if (pet.state === 'win')      return 'win';
  if (pet.state === 'lose')     return 'lose';

  if (phys.dragging)            return 'happy';  // lifted = excited

  switch (phys.behavior) {
    case 'walk':          return 'walking';
    case 'climb':         return 'climbing';
    case 'descend':       return 'climbing';
    case 'ceiling_walk':  return 'ceiling_walk';
    default:              return pet.state === 'hungry' ? 'hungry' : 'idle';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WINDOW MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width:           WIN_W,
    height:          WIN_H,
    transparent:     true,
    frame:           false,
    alwaysOnTop:     true,
    skipTaskbar:     true,
    resizable:       false,
    movable:         false,  // we move it manually
    focusable:       true,
    hasShadow:       false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload:         path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  // Set position before first frame
  win.setPosition(Math.round(phys.x), Math.round(phys.y));

  // Start fully click-through; renderer will toggle based on pixel alpha
  win.setIgnoreMouseEvents(true, { forward: true });

  win.once('ready-to-show', () => win.show());
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM TRAY
// ─────────────────────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let   icon;
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } else {
    // Fallback: tiny purple 1×1 pixel PNG embedded as base64
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mNk+M9Qz0AEYBxVQF8AAMb/A/+Z2q/RAAAAAElFTkSuQmCC'
    );
  }
  tray = new Tray(icon);
  tray.setToolTip('Aritamaguchi');
  rebuildTrayMenu();
  tray.on('double-click', () => { if (win) win.focus(); });
}

function rebuildTrayMenu() {
  if (!tray) return;
  const stageName = EVO_INFO[pet.stage]?.label ?? '?';
  const menu = Menu.buildFromTemplate([
    { label: `${pet.formName}  [${stageName}]  Age: ${pet.age}h`, enabled: false },
    { label: `🍖 Hunger: ${'♥'.repeat(pet.hunger)}${'♡'.repeat(4-pet.hunger)}`, enabled: false },
    { label: `💪 Strength: ${'♥'.repeat(pet.strength)}${'♡'.repeat(4-pet.strength)}`, enabled: false },
    { label: `⚖️ Weight: ${pet.weight}g   ⚠️ Mistakes: ${pet.careMistakes}`, enabled: false },
    { type: 'separator' },
    { label: '🍖 Feed Meal',     click: () => petFeed('meal')   },
    { label: '🥩 Feed Protein',  click: () => petFeed('protein') },
    { label: '🚽 Clean Poop',    click: () => petClean()        },
    { label: '💊 Give Medicine', click: () => petMedicine()     },
    { label: '💪 Train',         click: () => petTrain()        },
    { label: '⚔️  Battle',       click: () => petBattle()       },
    { label: '👆 Discipline',    click: () => petDiscipline()   },
    { label: `💡 Lights: ${pet.lightsOn ? 'ON' : 'OFF'}`, click: () => petToggleLights() },
    { type: 'separator' },
    { label: '⚡ Speed: NORMAL',  submenu: [
      { label: '🐢 Normal (1×)',  click: () => { pet.speedMult = 1;  } },
      { label: '🏃 Fast (5×)',    click: () => { pet.speedMult = 5;  } },
      { label: '⚡ Turbo (20×)', click: () => { pet.speedMult = 20; } },
    ]},
    { type: 'separator' },
    { label: `🤖 Groq AI: ${groqApiKey ? 'Connected ✓' : 'Not set'}`, enabled: false },
    { label: '🔑 Set Groq API Key', click: () => openKeyPrompt() },
    { type: 'separator' },
    { label: '🔄 Reset Pet', click: () => {
      Object.assign(pet, {
        stage: EVO.BABY1, form: 'koromon', formName: 'Koromon', formColor: '#ff9999',
        hunger: 4, strength: 4, weight: 10, age: 0, discipline: 50,
        careMistakes: 0, battleWins: 0, battleTotal: 0,
        sick: false, sickTicks: 0, lightsOn: true,
        calling: false, callReason: null, state: 'idle', stateLockMs: 0,
        _evoMs: 0, _evoTarget: 1*60*60*1000, poopCount: 0,
      });
      try { fs.unlinkSync(SAVE_PATH); } catch {}
      rebuildTrayMenu();
    }},
    { label: '❌ Quit', click: () => { app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function updateTrayTooltip() {
  if (!tray) return;
  tray.setToolTip(
    `${pet.name} (${pet.formName}) | ${EVO_INFO[pet.stage]?.label}\n` +
    `Hunger: ${'♥'.repeat(pet.hunger)}  Strength: ${'♥'.repeat(pet.strength)}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC HANDLERS  (messages from renderer)
// ─────────────────────────────────────────────────────────────────────────────

function setupIPC() {
  // Renderer tells us whether to pass clicks through
  ipcMain.on('set-ignore-mouse', (_, { ignore }) => {
    if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
  });

  // Drag start: record offset from window top-left to cursor
  ipcMain.on('drag-start', (_, { screenX, screenY }) => {
    phys.dragging = true;
    phys.behaviorMs = 99999;
    phys.behavior   = 'idle';
    const [wx, wy]  = win ? win.getPosition() : [0, 0];
    phys.dragOX     = screenX - wx;
    phys.dragOY     = screenY - wy;
    phys.prevMouseX = screenX;
    phys.prevMouseY = screenY;
    phys.throwVX    = 0;
    phys.throwVY    = 0;
    if (win) win.setIgnoreMouseEvents(false);
  });

  ipcMain.on('drag-move', (_, { screenX, screenY }) => {
    if (!phys.dragging || !win) return;
    phys.throwVX    = (screenX - phys.prevMouseX) * THROW_MULT;
    phys.throwVY    = (screenY - phys.prevMouseY) * THROW_MULT;
    phys.prevMouseX = screenX;
    phys.prevMouseY = screenY;
    const nx = Math.round(screenX - phys.dragOX);
    const ny = Math.round(screenY - phys.dragOY);
    phys.x = nx;
    phys.y = ny;
    win.setPosition(nx, ny);
    // determine current surface while dragging
    phys.surface = 'air';
  });

  ipcMain.on('drag-end', () => {
    phys.dragging = false;
    phys.vx = phys.throwVX;
    phys.vy = phys.throwVY;
    phys.surface  = 'air';
    phys.behaviorMs = 100;
  });

  // Renderer requests context menu
  ipcMain.on('context-menu', () => {
    rebuildTrayMenu();
    if (tray) tray.popUpContextMenu();
  });

  // VPet: user clicked/petted the character
  ipcMain.on('pet-action', () => {
    pet.discipline = Math.min(100, pet.discipline + 2);
    setPetState('being_petted', 1500);
    flash('#ff88cc', 0.55);
    sendMessage('( ˘ω˘ )  *purrs*');
    setTimeout(callGroq, 2000); // ask Groq how she feels after being petted
  });

  // VPet toolbar quick actions
  ipcMain.on('toolbar-action', (_, { action }) => {
    switch (action) {
      case 'feed':     petFeed('meal');   break;
      case 'medicine': petMedicine();     break;
      case 'train':    petTrain();        break;
      case 'battle':   petBattle();       break;
    }
    rebuildTrayMenu();
  });

  // Renderer asks for initial state
  ipcMain.handle('get-init-state', () => buildDrawState());

  // Groq key prompt: save key and close window
  ipcMain.on('save-groq-key', (_, { key }) => {
    if (key && key !== '__skip__') {
      saveGroqKey(key);
      groqApiKey = key;
      // Start loop now that we have a key
      startGroqLoop();
    }
    if (keyWin && !keyWin.isDestroyed()) keyWin.close();
    rebuildTrayMenu();
  });

  // Open external URL (used by key prompt to open console.groq.com)
  ipcMain.on('open-external', (_, { url }) => {
    shell.openExternal(url);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────────────────────

function buildDrawState() {
  const isOnCeiling = phys.surface === 'ceiling';
  const isOnWallL   = phys.surface === 'left_wall';
  const isOnWallR   = phys.surface === 'right_wall';
  return {
    animState:   getAnimState(),
    animFrame:   phys.animFrame,
    facing:      phys.facing,
    breatheT:    phys.breatheT,
    walkPhase:   phys.walkPhase,
    surface:     phys.surface,
    isOnCeiling,
    isOnWallL,
    isOnWallR,
    // Digimon display
    stage:       pet.stage,
    form:        pet.form,
    formName:    pet.formName,
    formColor:   pet.formColor,
    hunger:      pet.hunger,
    strength:    pet.strength,
    weight:      pet.weight,
    poopCount:   pet.poopCount,
    sick:        pet.sick,
    calling:     pet.calling,
    callReason:  pet.callReason,
    discipline:  pet.discipline,
    careMistakes: pet.careMistakes,
    battleWins:  pet.battleWins,
    // Flash overlay
    flashAlpha:  pet.flashAlpha,
    flashColor:  pet.flashColor,
    // Groq AI state
    groqState:   pet.groqState,
  };
}

let lastTick = Date.now();

function startMainLoop() {
  physicsInterval = setInterval(() => {
    const now = Date.now();
    const dt  = now - lastTick;
    lastTick  = now;

    tickPet(dt);
    tickPhys(dt);

    // Move window
    if (win && !phys.dragging) {
      win.setPosition(Math.round(phys.x), Math.round(phys.y));
    }

    // Send draw state to renderer
    if (win && win.webContents && !win.isDestroyed()) {
      win.webContents.send('draw', buildDrawState());
    }
  }, TICK_MS);

  saveInterval = setInterval(() => savePet(), 60_000);
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS + SPEECH
// ─────────────────────────────────────────────────────────────────────────────

function notify(title, body) {
  if (!Notification.isSupported()) return;
  new Notification({ title, body, silent: false }).show();
}

// Send a speech bubble message to the renderer
function sendMessage(text) {
  if (win && win.webContents && !win.isDestroyed()) {
    win.webContents.send('message', text);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// APP LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Single instance guard
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }

  initBounds();
  loadPet();
  loadGroqKey();
  setupIPC();
  createWindow();
  createTray();
  startMainLoop();
  if (groqApiKey) {
    startGroqLoop();
  } else {
    // No key found — open the setup prompt after window loads
    setTimeout(openKeyPrompt, 1500);
  }

  // macOS: re-create window if dock icon clicked
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('second-instance', () => {
  if (win) { win.show(); win.focus(); }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  savePet();
  if (physicsInterval) clearInterval(physicsInterval);
  if (saveInterval)    clearInterval(saveInterval);
});

// Prevent app from showing in dock (macOS) — it lives in tray only
if (process.platform === 'darwin') {
  app.dock?.hide();
}
