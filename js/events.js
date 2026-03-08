/**
 * events.js - Time-based event scheduler & mini-game logic
 *
 * The scheduler fires contextual events at real-world times:
 *
 *   Morning  (06:00-09:00) → energetic, sunrise greeting
 *   Midday   (12:00-13:00) → snack reminder
 *   Afternoon(14:00-17:00) → play suggestion
 *   Evening  (17:00-20:00) → cleaning routine
 *   Night    (20:00-22:00) → winding down, sleepy
 *   Late     (22:00-06:00) → sleeping (forced)
 *
 * Mini-game: "Catch the Star" — player moves basket to catch
 * falling stars/food while dodging bad items (bombs/dirt).
 */

// ─── Time-of-day scheduler ────────────────────────────────────────────────────

export class EventScheduler {
  constructor() {
    this._lastHour   = -1;
    this._lastMinute = -1;
    this._handlers   = {};   // 'morning' | 'midday' | 'afternoon' | 'evening' | 'night' | 'latenight'
  }

  on(event, fn) {
    this._handlers[event] = fn;
    return this;
  }

  /**
   * Call each game tick. Fires at-most-once per real-world hour/minute.
   */
  tick() {
    const now  = new Date();
    const h    = now.getHours();
    const m    = now.getMinutes();

    // per-minute check
    if (m !== this._lastMinute) {
      this._lastMinute = m;
      this._checkMinuteEvents(h, m);
    }

    // per-hour check
    if (h !== this._lastHour) {
      this._lastHour = h;
      this._checkHourEvents(h);
    }
  }

  _fire(event, payload = {}) {
    if (this._handlers[event]) {
      this._handlers[event](payload);
    }
  }

  _checkHourEvents(h) {
    if (h === 6)  this._fire('morning',    { hour: h });
    if (h === 7)  this._fire('morning',    { hour: h });
    if (h === 12) this._fire('midday',     { hour: h });
    if (h === 14) this._fire('afternoon',  { hour: h });
    if (h === 15) this._fire('afternoon',  { hour: h });
    if (h === 17) this._fire('evening',    { hour: h });
    if (h === 18) this._fire('evening',    { hour: h });
    if (h === 20) this._fire('night',      { hour: h });
    if (h === 22) this._fire('latenight',  { hour: h });
  }

  _checkMinuteEvents(h, m) {
    // hunger reminder at :30 of each hour if pet is hungry
    if (m === 30) this._fire('minutecheck', { hour: h, minute: m });
  }
}

// ─── Mini-game: Catch the Star ────────────────────────────────────────────────

const FALL_ITEMS = [
  { emoji: '⭐', type: 'good',  points: 10, size: 14 },
  { emoji: '🍖', type: 'good',  points: 15, size: 14 },
  { emoji: '🍬', type: 'good',  points: 8,  size: 12 },
  { emoji: '💜', type: 'good',  points: 12, size: 14 },
  { emoji: '💣', type: 'bad',   points:-20, size: 14 },
  { emoji: '💩', type: 'bad',   points:-15, size: 14 },
];

export class MiniGame {
  constructor(canvasW, canvasH) {
    this.W         = canvasW;
    this.H         = canvasH;
    this.active    = false;
    this.over      = false;

    this.playerX   = canvasW / 2;
    this.score     = 0;
    this.lives     = 3;
    this.items     = [];
    this.totalTime = 30000;   // 30 s
    this.timeLeft  = this.totalTime;
    this._spawnTimer = 0;
    this._spawnInterval = 1200;  // ms

    this._moveLeft  = false;
    this._moveRight = false;
    this._speed     = 120;  // px/s
  }

  start() {
    this.active    = true;
    this.over      = false;
    this.score     = 0;
    this.lives     = 3;
    this.items     = [];
    this.timeLeft  = this.totalTime;
    this._spawnTimer = 0;
    this.playerX   = this.W / 2;
  }

  // ─── input ─────────────────────────────────────────────────────────────────

  setLeft(v)  { this._moveLeft  = v; }
  setRight(v) { this._moveRight = v; }
  tap(side) {
    if (!this.active || this.over) return;
    if (side === 'left')  this.playerX = Math.max(20,        this.playerX - 40);
    if (side === 'right') this.playerX = Math.min(this.W-20, this.playerX + 40);
  }

  // ─── update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (!this.active || this.over) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.over = true;
      return;
    }

    // move player
    if (this._moveLeft)  this.playerX = Math.max(20,        this.playerX - this._speed * dt / 1000);
    if (this._moveRight) this.playerX = Math.min(this.W-20, this.playerX + this._speed * dt / 1000);

    // spawn items
    this._spawnTimer -= dt;
    if (this._spawnTimer <= 0) {
      this._spawnItem();
      // gradually speed up
      const elapsed = this.totalTime - this.timeLeft;
      this._spawnInterval = Math.max(500, 1200 - elapsed / 100);
      this._spawnTimer    = this._spawnInterval;
    }

    // move items down
    const floorY = this.H - 18;
    const basketW = 32;
    const scored  = [];
    const keep    = [];

    for (const item of this.items) {
      item.y += item.speed * dt / 1000;
      item.alpha = item.alpha ?? 1;

      if (item.y >= floorY) {
        // check catch
        if (Math.abs(item.x - this.playerX) < basketW * 0.6) {
          item.alpha = 0;  // caught
          if (item.type === 'good') {
            this.score += item.points;
          } else {
            this.score  = Math.max(0, this.score + item.points);
            this.lives  = Math.max(0, this.lives - 1);
            if (this.lives <= 0) { this.over = true; }
          }
        }
        // missed good item: no penalty (RO-style forgiving)
        continue;  // remove from list
      }
      keep.push(item);
    }
    this.items = keep;
  }

  _spawnItem() {
    const template = FALL_ITEMS[Math.floor(Math.random() * FALL_ITEMS.length)];
    this.items.push({
      ...template,
      x:     20 + Math.random() * (this.W - 40),
      y:     -20,
      speed: 60 + Math.random() * 60,
      alpha: 1,
    });
  }

  /** Bonus stats to award pet on game end */
  getReward() {
    const happinessBonus = Math.min(30, Math.floor(this.score / 5));
    const intimacyBonus  = Math.floor(happinessBonus / 3);
    return { happinessBonus, intimacyBonus, score: this.score };
  }
}
