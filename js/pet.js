/**
 * pet.js - Core pet state machine + behavior tree AI
 *
 * Inspired by:
 *  - Original Tamagotchi (Bandai, 1996) stat decay model
 *  - Ragnarok Online pet intimacy / hunger system
 *  - Behavior tree pattern (Halo, Crysis, etc.)
 *
 * Stats:
 *   hunger    0-100  (decreases over time → feed to restore)
 *   happiness 0-100  (decreases slowly; play/clean/interact raise it)
 *   clean     0-100  (decreases randomly; clean action restores)
 *   energy    0-100  (depletes when playing; restored by sleep)
 *   intimacy  0-1000 (RO-style bond; good care → up, neglect → down)
 *   age       days   (real-time calendar days)
 *
 * Intimacy tiers (mirrors RO):
 *   0   – 99  : Awkward
 *   100 – 249 : Shy
 *   250 – 499 : Neutral
 *   500 – 749 : Cordial
 *   750 – 999 : Loyal
 *   1000      : SOULBOUND (max bond, unlocks special visuals)
 *
 * Behavior tree priority (highest first):
 *   1. Emergency  – critical stats trigger distress signals
 *   2. Sleep      – forced sleep if energy == 0 or night-time
 *   3. Scheduled  – time-of-day driven routines
 *   4. Reactive   – responses to recent player actions
 *   5. Random     – idle variety (higher intimacy → richer variety)
 *   6. Idle       – default breathing / blinking
 */

// ─── constants ───────────────────────────────────────────────────────────────

export const INTIMACY_TIERS = [
  { min: 0,    max: 99,   label: 'AWKWARD',   color: '#6b7280' },
  { min: 100,  max: 249,  label: 'SHY',       color: '#8b5cf6' },
  { min: 250,  max: 499,  label: 'NEUTRAL',   color: '#06b6d4' },
  { min: 500,  max: 749,  label: 'CORDIAL',   color: '#22c55e' },
  { min: 750,  max: 999,  label: 'LOYAL',     color: '#f59e0b' },
  { min: 1000, max: 1000, label: 'SOULBOUND', color: '#f43f5e' },
];

export const EVOLUTION_STAGES = [
  { level: 0, name: 'Baby',     scaleBonus: 0 },
  { level: 1, name: 'Juvenile', scaleBonus: 0.08 },
  { level: 2, name: 'Adult',    scaleBonus: 0.16 },
];

export const PET_STATES = {
  IDLE:       'idle',
  HAPPY:      'happy',
  HUNGRY:     'hungry',
  EATING:     'eating',
  SLEEPING:   'sleeping',
  PLAYING:    'playing',
  CLEANING:   'cleaning',
  SAD:        'sad',
  EXCITED:    'excited',
  SICK:       'sick',
  WALKING:    'walking',
  BEGGING:    'begging',
};

// ─── default save structure ──────────────────────────────────────────────────

function defaultSave(name = 'Ari') {
  return {
    version:     2,
    name,
    born:        Date.now(),
    lastSaved:   Date.now(),
    hunger:      100,
    happiness:   100,
    clean:       100,
    energy:      100,
    intimacy:    0,
    timesFed:    0,
    timesPlayed: 0,
    timesCleaned:0,
    poopCount:   0,
    totalAge:    0,     // in seconds
    currentState: PET_STATES.IDLE,
    weather:     'clear',
  };
}

// ─── Pet class ───────────────────────────────────────────────────────────────

export class Pet {
  constructor() {
    this.data       = defaultSave();
    this.state      = PET_STATES.IDLE;
    this.prevState  = PET_STATES.IDLE;
    this.stateLock  = 0;        // ms until state can change again
    this.animFrame  = 0;
    this.breathe    = 0;
    this.walkPhase  = 0;
    this.jump       = 0;

    // behavior tree timers
    this._randomEventTimer = 0;
    this._poopTimer        = 0;
    this._weatherTimer     = 0;
    this._actionQueue      = [];  // queued state transitions
    this._pendingAction    = null;

    // particle emitters (managed by renderer)
    this.particles = {
      stars:    [],
      hearts:   [],
      zzz:      [],
      droplets: [],
    };

    this.lastTick   = Date.now();
    this.speedMult  = 1;   // 1 = normal, 2 = fast (debug)
    this.soundEnabled = true;
  }

  // ─── persistence ────────────────────────────────────────────────────────────

  save() {
    this.data.currentState = this.state;
    this.data.lastSaved    = Date.now();
    try {
      localStorage.setItem('aritamaguchi_save', JSON.stringify(this.data));
    } catch {}
  }

  load() {
    try {
      const raw = localStorage.getItem('aritamaguchi_save');
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved?.version) return false;

      this.data = { ...defaultSave(), ...saved };

      // simulate offline time (max 8 hours = 28800s)
      const offlineMs  = Math.min(Date.now() - this.data.lastSaved, 8 * 3600 * 1000);
      const offlineSec = offlineMs / 1000;
      this._simulateOffline(offlineSec);

      this.state    = this.data.currentState || PET_STATES.IDLE;
      this.lastTick = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  reset(name = 'Ari') {
    this.data       = defaultSave(name);
    this.state      = PET_STATES.IDLE;
    this.stateLock  = 0;
    this._actionQueue = [];
    this.particles  = { stars: [], hearts: [], zzz: [], droplets: [] };
    this.save();
  }

  // ─── offline simulation ──────────────────────────────────────────────────────

  _simulateOffline(seconds) {
    if (seconds <= 0) return;

    // decay at normal rates (simplified, no random events)
    const ticks = Math.min(seconds, 28800);
    this.data.hunger    = Math.max(0, this.data.hunger    - ticks * 0.004 * this.speedMult);
    this.data.happiness = Math.max(0, this.data.happiness - ticks * 0.002 * this.speedMult);
    this.data.clean     = Math.max(0, this.data.clean     - ticks * 0.0015 * this.speedMult);
    this.data.energy    = Math.max(0, this.data.energy    + ticks * 0.003 * this.speedMult);  // rest offline
    this.data.energy    = Math.min(100, this.data.energy);

    if (this.data.hunger < 20) {
      this.data.intimacy = Math.max(0, this.data.intimacy - Math.floor(ticks * 0.01));
    }

    this.data.totalAge += seconds;
  }

  // ─── stat accessors ─────────────────────────────────────────────────────────

  get hunger()    { return this.data.hunger; }
  get happiness() { return this.data.happiness; }
  get clean()     { return this.data.clean; }
  get energy()    { return this.data.energy; }
  get intimacy()  { return this.data.intimacy; }
  get name()      { return this.data.name; }
  set name(v)     { this.data.name = v; }

  getIntimacyTier() {
    return INTIMACY_TIERS.findLast(t => this.data.intimacy >= t.min) || INTIMACY_TIERS[0];
  }

  getEvolutionStage() {
    if (this.data.intimacy >= 500) return EVOLUTION_STAGES[2];
    if (this.data.intimacy >= 150) return EVOLUTION_STAGES[1];
    return EVOLUTION_STAGES[0];
  }

  getAgeDays() {
    return Math.floor(this.data.totalAge / 86400);
  }

  getAgeLabel() {
    const d = this.getAgeDays();
    if (d === 0) return 'Newborn';
    if (d === 1) return '1 day';
    return `${d} days`;
  }

  getMoodLabel() {
    if (this.data.hunger < 20)    return 'Starving 😰';
    if (this.data.happiness < 20) return 'Miserable 😢';
    if (this.data.clean < 20)     return 'Filthy 🤢';
    if (this.state === PET_STATES.SLEEPING) return 'Sleeping 😴';
    if (this.data.intimacy >= 750)return 'Ecstatic 🌟';
    if (this.data.happiness >= 80)return 'Happy 😊';
    if (this.data.happiness >= 50)return 'Content 😌';
    return 'Okay 😐';
  }

  // ─── player actions ──────────────────────────────────────────────────────────

  feed() {
    if (this.state === PET_STATES.SLEEPING) return { ok: false, msg: 'Shh! Pet is sleeping!' };
    if (this.state === PET_STATES.EATING)   return { ok: false, msg: 'Already eating!' };
    if (this.data.hunger >= 100)            return { ok: false, msg: 'Not hungry right now!' };

    const gain = Math.min(30, 100 - this.data.hunger);
    this.data.hunger    = Math.min(100, this.data.hunger + 30);
    this.data.happiness = Math.min(100, this.data.happiness + 5);
    this.data.intimacy  = Math.min(1000, this.data.intimacy + 8);
    this.data.timesFed++;

    this._queueState(PET_STATES.EATING, 3000);
    this._emitParticles('stars', 3);
    return { ok: true, msg: `+${gain} hunger! ${this.name} is pleased!` };
  }

  play() {
    if (this.state === PET_STATES.SLEEPING)    return { ok: false, msg: 'Let it sleep!' };
    if (this.state === PET_STATES.PLAYING)     return { ok: false, msg: 'Already playing!' };
    if (this.data.energy < 15)                 return { ok: false, msg: 'Too tired to play!' };
    if (this.data.hunger < 15)                 return { ok: false, msg: 'Too hungry to play!' };

    const hGain = 20 + Math.floor(this.data.intimacy / 100) * 2;
    this.data.happiness = Math.min(100, this.data.happiness + hGain);
    this.data.energy    = Math.max(0,   this.data.energy    - 20);
    this.data.hunger    = Math.max(0,   this.data.hunger    - 8);
    this.data.intimacy  = Math.min(1000, this.data.intimacy + 12);
    this.data.timesPlayed++;

    this._queueState(PET_STATES.PLAYING, 4000);
    this._emitParticles('hearts', 4);
    return { ok: true, msg: `${this.name} loves to play!` };
  }

  clean() {
    if (this.state === PET_STATES.SLEEPING) return { ok: false, msg: 'Sleeping! Do not disturb.' };
    if (this.state === PET_STATES.CLEANING) return { ok: false, msg: 'Already cleaning!' };
    if (this.data.clean >= 95)              return { ok: false, msg: "Already clean!" };

    const gain = Math.min(40, 100 - this.data.clean);
    this.data.clean     = Math.min(100, this.data.clean + 40);
    this.data.happiness = Math.min(100, this.data.happiness + 8);
    this.data.intimacy  = Math.min(1000, this.data.intimacy + 5);
    this.data.timesCleaned++;
    this.data.poopCount = 0;

    this._queueState(PET_STATES.CLEANING, 3000);
    this._emitParticles('stars', 5);
    return { ok: true, msg: `+${gain} cleanliness! Sparkly!` };
  }

  // ─── state queue ─────────────────────────────────────────────────────────────

  _queueState(newState, durationMs) {
    this.state     = newState;
    this.stateLock = Date.now() + durationMs;
    this.animFrame = 0;
  }

  _isLocked() {
    return Date.now() < this.stateLock;
  }

  // ─── particles ──────────────────────────────────────────────────────────────

  _emitParticles(type, count) {
    for (let i = 0; i < count; i++) {
      this.particles[type].push({
        x:     80 + (Math.random() - 0.5) * 60,
        y:     60 + (Math.random() - 0.5) * 40,
        vx:    (Math.random() - 0.5) * 1.5,
        vy:    -1 - Math.random() * 1.5,
        alpha: 1,
        size:  8 + Math.random() * 8,
        life:  1,
      });
    }
  }

  // ─── main update tick ────────────────────────────────────────────────────────

  /**
   * Called each game loop frame.
   * @param {number} dt - delta time in milliseconds
   */
  update(dt) {
    const dtSec = (dt / 1000) * this.speedMult;
    this.data.totalAge += dtSec;
    this.animFrame++;
    this.breathe     = (this.breathe + dtSec * 0.4) % 1;
    this.walkPhase   = (this.walkPhase + dtSec * 2) % 1;
    this.jump        = Math.max(0, this.jump - dtSec * 3);

    // --- decay stats ---
    this._decayStats(dtSec);

    // --- behavior tree ---
    if (!this._isLocked()) {
      this._runBehaviorTree(dtSec);
    }

    // --- random event timer ---
    this._randomEventTimer -= dt;
    if (this._randomEventTimer <= 0) {
      this._scheduleNextRandomEvent();
      this._triggerRandomEvent();
    }

    // --- poop timer ---
    this._poopTimer -= dt;
    if (this._poopTimer <= 0) {
      this._poopTimer = (180 + Math.random() * 180) * 1000 / this.speedMult;
      this.data.poopCount = Math.min(3, this.data.poopCount + 1);
      this.data.clean     = Math.max(0, this.data.clean - 15);
      this.data.happiness = Math.max(0, this.data.happiness - 5);
    }

    // --- weather change ---
    this._weatherTimer -= dt;
    if (this._weatherTimer <= 0) {
      this._weatherTimer = (300 + Math.random() * 600) * 1000 / this.speedMult;
      const weathers = ['clear', 'clear', 'clear', 'rain', 'cloudy'];
      this.data.weather  = weathers[Math.floor(Math.random() * weathers.length)];
    }

    // --- update particles ---
    ['stars', 'hearts', 'zzz', 'droplets'].forEach(type => {
      this.particles[type] = this.particles[type].filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.alpha -= 0.02;
        return p.alpha > 0;
      });
    });
  }

  // ─── stat decay ──────────────────────────────────────────────────────────────

  _decayStats(dtSec) {
    const isSleeping = this.state === PET_STATES.SLEEPING;
    const isPlaying  = this.state === PET_STATES.PLAYING;

    // hunger: ~1 unit / 4 min at normal speed
    if (!isSleeping) {
      this.data.hunger = Math.max(0, this.data.hunger - dtSec * 0.004 * 10);
    } else {
      // slower while sleeping
      this.data.hunger = Math.max(0, this.data.hunger - dtSec * 0.002 * 10);
    }

    // happiness: decays unless playing
    if (!isPlaying) {
      const hDecay = this.data.clean < 30 ? 0.005 : 0.002;
      this.data.happiness = Math.max(0, this.data.happiness - dtSec * hDecay * 10);
    }

    // cleanliness: slow random drift
    this.data.clean = Math.max(0, this.data.clean - dtSec * 0.0015 * 10);

    // energy: depletes when playing, restores when sleeping
    if (isPlaying) {
      this.data.energy = Math.max(0, this.data.energy - dtSec * 0.008 * 10);
    } else if (isSleeping) {
      this.data.energy = Math.min(100, this.data.energy + dtSec * 0.015 * 10);
    } else {
      this.data.energy = Math.min(100, this.data.energy + dtSec * 0.002 * 10);
    }

    // intimacy: slowly decays if stats are bad; slowly grows if stats are good
    if (this.data.hunger < 20 || this.data.happiness < 20) {
      this.data.intimacy = Math.max(0, this.data.intimacy - dtSec * 0.05 * 10);
    } else if (this.data.hunger > 60 && this.data.happiness > 60 && this.data.clean > 60) {
      this.data.intimacy = Math.min(1000, this.data.intimacy + dtSec * 0.005 * 10);
    }
  }

  // ─── behavior tree ───────────────────────────────────────────────────────────

  _runBehaviorTree(dtSec) {
    const hour = new Date().getHours();

    // 1. Emergency checks (highest priority)
    if (this.data.hunger <= 5) {
      this.state = PET_STATES.BEGGING;
      this._emitParticles('droplets', 1);
      return;
    }
    if (this.data.hunger <= 20 && this.state !== PET_STATES.HUNGRY) {
      this.state = PET_STATES.HUNGRY;
      return;
    }
    if (this.data.happiness <= 5 && this.data.clean <= 5) {
      this.state = PET_STATES.SICK;
      return;
    }
    if (this.data.happiness <= 15) {
      this.state = PET_STATES.SAD;
      return;
    }

    // 2. Energy / sleep check
    if (this.data.energy <= 10) {
      this._enterSleep('exhausted');
      return;
    }
    // Time-based sleep: 22:00 – 07:00
    if ((hour >= 22 || hour < 7) && this.state !== PET_STATES.SLEEPING) {
      this._enterSleep('bedtime');
      return;
    }
    // Wake up
    if (this.state === PET_STATES.SLEEPING && hour >= 7 && hour < 22 && this.data.energy >= 80) {
      this.state = PET_STATES.HAPPY;
      this._queueState(PET_STATES.HAPPY, 2000);
      this._emitParticles('stars', 4);
      return;
    }
    if (this.state === PET_STATES.SLEEPING) return; // stay asleep

    // 3. Normal happy default
    if (this.data.hunger > 20 && this.data.happiness > 20 && this.data.clean > 20) {
      if (this.state === PET_STATES.HUNGRY || this.state === PET_STATES.SAD || this.state === PET_STATES.BEGGING) {
        this.state = PET_STATES.IDLE;
      }
    }

    // 4. Drift toward idle if nothing else applies
    if (![PET_STATES.IDLE, PET_STATES.WALKING, PET_STATES.HAPPY].includes(this.state)) {
      if (this.data.hunger > 30 && this.data.happiness > 30) {
        this.state = PET_STATES.IDLE;
      }
    }
  }

  _enterSleep(reason) {
    if (this.state === PET_STATES.SLEEPING) return;
    this.state = PET_STATES.SLEEPING;
    this._emitParticles('zzz', 2);
  }

  // ─── random events ───────────────────────────────────────────────────────────

  _scheduleNextRandomEvent() {
    // events come more often at higher intimacy
    const base  = 30000;  // 30 s
    const bonus = this.data.intimacy / 1000 * -15000;
    this._randomEventTimer = (base + bonus + Math.random() * 20000) / this.speedMult;
  }

  _triggerRandomEvent() {
    if (this._isLocked()) return;
    if (this.state === PET_STATES.SLEEPING) return;
    if (this.data.hunger < 15) return;

    const tier = this.getIntimacyTier();
    const hour = new Date().getHours();

    // weighted event pool — richer at higher intimacy
    const pool = [
      { weight: 10, fn: () => this._eventWalk() },
      { weight: 8,  fn: () => this._eventSelfClean() },
    ];

    if (this.data.happiness > 40) {
      pool.push({ weight: 8, fn: () => this._eventHappy() });
    }
    if (this.data.intimacy >= 100) {
      pool.push({ weight: 6, fn: () => this._eventExcited() });
    }
    if (this.data.intimacy >= 250) {
      pool.push({ weight: 5, fn: () => this._eventDance() });
      pool.push({ weight: 4, fn: () => this._eventStretch() });
    }
    if (this.data.intimacy >= 500) {
      pool.push({ weight: 3, fn: () => this._eventSkill() });
      pool.push({ weight: 3, fn: () => this._eventLookAround() });
    }
    // morning stretch
    if (hour >= 7 && hour < 9) {
      pool.push({ weight: 12, fn: () => this._eventStretch() });
    }
    // evening cleaning
    if (hour >= 17 && hour < 20) {
      pool.push({ weight: 12, fn: () => this._eventSelfClean() });
    }

    const total  = pool.reduce((s, e) => s + e.weight, 0);
    let rand     = Math.random() * total;
    for (const entry of pool) {
      rand -= entry.weight;
      if (rand <= 0) { entry.fn(); break; }
    }
  }

  _eventWalk() {
    this._queueState(PET_STATES.WALKING, 4000);
  }

  _eventSelfClean() {
    this._queueState(PET_STATES.CLEANING, 3500);
    this.data.clean = Math.min(100, this.data.clean + 5);
  }

  _eventHappy() {
    this._queueState(PET_STATES.HAPPY, 3000);
    this._emitParticles('hearts', 3);
  }

  _eventExcited() {
    this._queueState(PET_STATES.EXCITED, 3000);
    this._emitParticles('stars', 5);
    this.jump = 1;
  }

  _eventDance() {
    this._queueState(PET_STATES.PLAYING, 5000);
    this._emitParticles('hearts', 6);
    this.jump = 1;
  }

  _eventStretch() {
    this._queueState(PET_STATES.CLEANING, 2000);
  }

  _eventLookAround() {
    this._queueState(PET_STATES.WALKING, 5000);
  }

  _eventSkill() {
    // high-intimacy special animation
    this._queueState(PET_STATES.EXCITED, 4000);
    this._emitParticles('stars', 8);
    this._emitParticles('hearts', 4);
    this.jump = 1;
    this.data.intimacy = Math.min(1000, this.data.intimacy + 5);
  }

  // ─── serialization ───────────────────────────────────────────────────────────

  toStatsObject() {
    return {
      name:         this.data.name,
      age:          this.getAgeLabel(),
      stage:        this.getEvolutionStage().name,
      bond:         this.getIntimacyTier().label,
      timesFed:     this.data.timesFed,
      timesPlayed:  this.data.timesPlayed,
      mood:         this.getMoodLabel(),
      lastAction:   this.state,
      hunger:       Math.floor(this.data.hunger),
      happiness:    Math.floor(this.data.happiness),
      clean:        Math.floor(this.data.clean),
      energy:       Math.floor(this.data.energy),
      intimacy:     Math.floor(this.data.intimacy),
    };
  }
}
