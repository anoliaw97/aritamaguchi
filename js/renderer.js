/**
 * renderer.js - Canvas rendering engine
 *
 * Drives all animation parameters:
 *   - Time-of-day background + weather
 *   - Pet character with eye tracking, tail wag, blink, sneeze, spin
 *   - Particles (stars, hearts, zzz, droplets)
 *   - HUD: clock, state label, hunger flash
 *   - Screen flash overlay
 */

import {
  drawPet,
  drawBackground,
  drawPoop,
  drawStars,
  drawHearts,
  drawZzz,
  drawDroplets,
} from './sprites.js';

import { PET_STATES } from './pet.js';

function px(ctx, text, x, y, size = 7, color = '#a78bfa', align = 'left') {
  ctx.font      = `${size}px "Press Start 2P", monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

// ─── Renderer ────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W      = canvas.width;
    this.H      = canvas.height;

    // walking position
    this._walkX     = this.W / 2;
    this._walkDir   = 1;
    this._walkSpeed = 22;

    // flash overlay
    this._flashAlpha = 0;
    this._flashColor = '#ffffff';

    // ── eye-tracking state ───────────────────────────────────────────────────
    this._lookDir      = 0;         // -1 | 0 | 1
    this._lookTimer    = 0;         // ms until next look change
    this._lookDuration = 2500;

    // ── autonomous blink ────────────────────────────────────────────────────
    this._blinkT     = 0;           // 0=open … 1=closed
    this._blinkTimer = 3000;        // ms to next blink
    this._blinking   = false;

    // ── tail wag ────────────────────────────────────────────────────────────
    this._tailPhase = 0;

    // ── sneeze ──────────────────────────────────────────────────────────────
    this._sneezePhase = 0;
    this._sneezeActive = false;

    // ── spin ────────────────────────────────────────────────────────────────
    this._spinAngle  = 0;
    this._spinning   = false;
  }

  // ─── public triggers ─────────────────────────────────────────────────────

  flash(color = '#ffffff') {
    this._flashColor = color;
    this._flashAlpha = 0.6;
  }

  triggerSneeze() {
    this._sneezeActive = true;
    this._sneezePhase  = 0;
  }

  triggerSpin() {
    this._spinning  = true;
    this._spinAngle = 0;
  }

  // ─── main render ─────────────────────────────────────────────────────────

  render(pet, dt) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    const now = new Date();
    const tod = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;

    // 1. Background
    drawBackground(ctx, W, H, tod, pet.data.weather);

    // 2. Update walk X
    if (pet.state === PET_STATES.WALKING) {
      this._walkX += this._walkDir * this._walkSpeed * (dt / 1000);
      if (this._walkX > W * 0.78) this._walkDir = -1;
      if (this._walkX < W * 0.22) this._walkDir = 1;
    } else {
      this._walkX += (W / 2 - this._walkX) * 0.06;
    }

    // 3. Animate eye look direction
    this._lookTimer -= dt;
    if (this._lookTimer <= 0) {
      const dirs = [-1, -1, 0, 0, 0, 1, 1];
      this._lookDir   = dirs[Math.floor(Math.random() * dirs.length)];
      this._lookDuration = 1500 + Math.random() * 3000;
      this._lookTimer = this._lookDuration;
    }

    // 4. Animate blink
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0 && !this._blinking) {
      this._blinking  = true;
      this._blinkT    = 0;
      this._blinkTimer = 2500 + Math.random() * 4000;
    }
    if (this._blinking) {
      this._blinkT += dt / 80;
      if (this._blinkT >= 2) { this._blinking = false; this._blinkT = 0; }
    }
    const blinkT = this._blinking ? Math.min(1, Math.abs(this._blinkT - 1)) : 0;

    // 5. Tail wag (always running, speed depends on state)
    const tailSpeeds = {
      happy:   6, excited: 8, playing: 7, eating: 5,
      walking: 3, idle:    1, cleaning: 2,
    };
    this._tailPhase = (this._tailPhase + dt / 1000 * (tailSpeeds[pet.state] || 1)) % 1;

    // 6. Sneeze animation
    if (this._sneezeActive) {
      this._sneezePhase += dt / 900;
      if (this._sneezePhase >= 1) { this._sneezeActive = false; this._sneezePhase = 0; }
    }

    // 7. Spin animation
    if (this._spinning) {
      this._spinAngle += dt / 1000 * Math.PI * 3.5;
      if (this._spinAngle >= Math.PI * 2) { this._spinning = false; this._spinAngle = 0; }
    }

    // 8. Poop indicators
    for (let i = 0; i < pet.data.poopCount; i++) {
      drawPoop(ctx, W * 0.08 + i * 20, H * 0.79, 1.1);
    }

    // 9. Draw pet
    const evo   = pet.getEvolutionStage();
    const scale = 1.15 + evo.scaleBonus;

    // mirror when walking left
    if (this._walkDir === -1 && pet.state === PET_STATES.WALKING) {
      ctx.save();
      ctx.translate(this._walkX * 2, 0);
      ctx.scale(-1, 1);
    }

    drawPet(ctx, {
      state:       pet.state,
      frame:       pet.animFrame,
      cx:          this._walkX,
      cy:          H * 0.60,
      scale,
      breathe:     pet.breathe,
      jump:        pet.jump,
      walkPhase:   pet.walkPhase,
      evolution:   evo.level,
      lookDir:     this._lookDir,
      tailPhase:   this._tailPhase,
      blinkT,
      sneezePhase: this._sneezePhase,
      spinAngle:   this._spinning ? this._spinAngle : 0,
    });

    if (this._walkDir === -1 && pet.state === PET_STATES.WALKING) {
      ctx.restore();
    }

    // 10. Particles
    ctx.save();
    drawStars(ctx,    pet.particles.stars);
    drawHearts(ctx,   pet.particles.hearts);
    drawZzz(ctx,      pet.particles.zzz);
    drawDroplets(ctx, pet.particles.droplets);
    ctx.restore();

    // 11. HUD
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    px(ctx, `${hh}:${mm}`, W - 5, 12, 7, 'rgba(167,139,250,0.55)', 'right');

    // state chip
    const stateColor = {
      sleeping: 'rgba(99,102,241,0.55)',
      hungry:   'rgba(239,68,68,0.6)',
      sad:      'rgba(239,68,68,0.5)',
      happy:    'rgba(192,132,252,0.6)',
      excited:  'rgba(251,191,36,0.6)',
    }[pet.state] || 'rgba(139,92,246,0.45)';
    px(ctx, pet.state.toUpperCase(), 5, 12, 5, stateColor);

    // hunger warning
    if (pet.data.hunger < 20) {
      const on = Math.sin(Date.now() / 350) > 0;
      if (on) px(ctx, '! HUNGRY !', W / 2, H * 0.16, 7, '#ef4444', 'center');
    }

    // flash overlay
    if (this._flashAlpha > 0) {
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle   = this._flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this._flashAlpha *= 0.82;
      if (this._flashAlpha < 0.01) this._flashAlpha = 0;
    }
  }
}

// ─── Mini-game renderer ───────────────────────────────────────────────────────

export class MiniGameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.W      = canvas.width;
    this.H      = canvas.height;
  }

  render(state) {
    const { ctx, W, H } = this;

    ctx.fillStyle = '#0d0520';
    ctx.fillRect(0, 0, W, H);

    // bg stars
    [0.1,0.3,0.6,0.8,0.15,0.5,0.9,0.4,0.7,0.25].forEach((sx, i) => {
      ctx.fillStyle   = 'rgba(167,139,250,0.25)';
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 800 + i);
      ctx.beginPath();
      ctx.arc(sx * W, (i * 0.08 + 0.03) * H, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // items
    state.items.forEach(item => {
      ctx.font        = `${item.size}px sans-serif`;
      ctx.textAlign   = 'center';
      ctx.globalAlpha = item.alpha ?? 1;
      ctx.fillText(item.emoji, item.x, item.y);
    });
    ctx.globalAlpha = 1;

    // floor
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, H - 20, W, 20);

    // basket
    const bx = state.playerX, by = H - 18, bw = 36, bh = 15;
    ctx.fillStyle = '#6d28d9';
    ctx.beginPath(); ctx.roundRect(bx - bw/2, by, bw, bh, 7); ctx.fill();
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath(); ctx.roundRect(bx - bw/2 + 2, by, bw - 4, 6, [5,5,0,0]); ctx.fill();

    // score + lives
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#a78bfa'; ctx.textAlign = 'left';
    ctx.fillText(`${state.score}`, 6, 16);
    ctx.fillStyle = '#f43f5e'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('♥'.repeat(state.lives), W - 6, 16);

    // time bar
    const tr = state.timeLeft / state.totalTime;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(6, H - 9, W - 12, 5);
    ctx.fillStyle = tr > 0.3 ? '#22c55e' : '#ef4444';
    ctx.fillRect(6, H - 9, (W - 12) * tr, 5);

    ctx.textAlign = 'left';
  }

  renderGameOver(score, bonus) {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(4,0,13,0.88)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillStyle = '#a78bfa'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER!', W / 2, H * 0.28);

    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = '#e0d7ff';
    ctx.fillText(`Score: ${score}`,          W / 2, H * 0.46);
    ctx.fillText(`+${bonus} Happiness`,      W / 2, H * 0.60);
    ctx.fillText(`+${Math.floor(bonus/3)} Bond`, W / 2, H * 0.73);

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#6b21a8';
    ctx.fillText('Press ● to continue', W / 2, H * 0.89);
    ctx.textAlign = 'left';
  }
}
