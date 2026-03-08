/**
 * renderer.js - Canvas rendering engine
 *
 * Handles:
 *  - Background (time-of-day sky, floor, weather)
 *  - Pet sprite (delegates to sprites.js)
 *  - Particle effects
 *  - Screen overlays (clock, poop indicators, thought bubble)
 *  - Mini-game rendering
 */

import {
  drawPet,
  drawBackground,
  drawPoop,
  drawStars,
  drawHearts,
  drawZzz,
  drawDroplets,
  PALETTE,
} from './sprites.js';

import { PET_STATES } from './pet.js';

// ─── pixel font helpers ───────────────────────────────────────────────────────

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

    // pet walk X position (for walking state)
    this._walkX       = this.W / 2;
    this._walkDir     = 1;
    this._walkSpeed   = 20;  // px / s

    // thought bubble text queue
    this._thoughtText  = '';
    this._thoughtAlpha = 0;
    this._thoughtTimer = 0;

    // screen flash effect
    this._flashAlpha = 0;
    this._flashColor = '#ffffff';
  }

  // ─── set thought bubble (called from personality.js / ui.js) ─────────────────

  showThought(text, durationMs = 3000) {
    this._thoughtText  = text;
    this._thoughtAlpha = 1;
    this._thoughtTimer = durationMs;
  }

  flash(color = '#ffffff', durationMs = 300) {
    this._flashColor = color;
    this._flashAlpha = 0.6;
    clearTimeout(this._flashOut);
    this._flashOut = setTimeout(() => { this._flashAlpha = 0; }, durationMs);
  }

  // ─── main render ─────────────────────────────────────────────────────────────

  render(pet, dt) {
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    // time of day 0..1
    const now  = new Date();
    const tod  = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;

    // --- 1. Background ---
    drawBackground(ctx, W, H, tod, pet.data.weather);

    // --- 2. Walking X update ---
    if (pet.state === PET_STATES.WALKING) {
      this._walkX += this._walkDir * this._walkSpeed * (dt / 1000);
      if (this._walkX > W * 0.75) { this._walkDir = -1; }
      if (this._walkX < W * 0.25) { this._walkDir =  1; }
    } else {
      // drift back to center
      this._walkX += (W / 2 - this._walkX) * 0.05;
    }

    // --- 3. Poop indicators ---
    for (let i = 0; i < pet.data.poopCount; i++) {
      drawPoop(ctx, W * 0.1 + i * 18, H * 0.76, 1);
    }

    // --- 4. Pet ---
    const evo   = pet.getEvolutionStage();
    const scale = 1 + evo.scaleBonus;
    drawPet(ctx, {
      state:     pet.state,
      frame:     pet.animFrame,
      cx:        this._walkX,
      cy:        H * 0.62,
      scale,
      breathe:   pet.breathe,
      jump:      pet.jump,
      walkPhase: pet.walkPhase,
      evolution: evo.level,
    });

    // --- 5. Particles ---
    ctx.save();
    drawStars(ctx,    pet.particles.stars);
    drawHearts(ctx,   pet.particles.hearts);
    drawZzz(ctx,      pet.particles.zzz);
    drawDroplets(ctx, pet.particles.droplets);
    ctx.restore();

    // --- 6. Thought bubble (inner canvas, managed separately via DOM) ---
    if (this._thoughtTimer > 0) {
      this._thoughtTimer  = Math.max(0, this._thoughtTimer - dt);
      this._thoughtAlpha  = Math.min(1, this._thoughtTimer / 400);
    }

    // --- 7. HUD clock ---
    const hh  = String(now.getHours()).padStart(2, '0');
    const mm  = String(now.getMinutes()).padStart(2, '0');
    px(ctx, `${hh}:${mm}`, W - 6, 12, 6, 'rgba(167,139,250,0.5)', 'right');

    // --- 8. State label (small, top-left) ---
    const stateLabel = pet.state.toUpperCase();
    px(ctx, stateLabel, 6, 12, 5, 'rgba(139,92,246,0.5)');

    // --- 9. Hunger warning flash ---
    if (pet.data.hunger < 20) {
      const blinkOn = Math.sin(Date.now() / 400) > 0;
      if (blinkOn) {
        px(ctx, '! HUNGRY !', W / 2, H * 0.18, 6, '#ef4444', 'center');
      }
    }

    // --- 10. Screen flash overlay ---
    if (this._flashAlpha > 0) {
      ctx.globalAlpha = this._flashAlpha;
      ctx.fillStyle   = this._flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      this._flashAlpha *= 0.85;
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

  /**
   * Render "Catch the Star" mini-game frame
   * @param {object} state - minigame state from MiniGame class
   */
  render(state) {
    const { ctx, W, H } = this;

    // sky
    ctx.fillStyle = '#0d0520';
    ctx.fillRect(0, 0, W, H);

    // stars bg
    ctx.fillStyle = 'rgba(167,139,250,0.2)';
    [0.1,0.3,0.6,0.8,0.15,0.5,0.9].forEach((sx, i) => {
      ctx.beginPath();
      ctx.arc(sx * W, (i * 0.1 + 0.05) * H, 1, 0, Math.PI * 2);
      ctx.fill();
    });

    // falling items
    state.items.forEach(item => {
      ctx.font      = `${item.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.globalAlpha = item.alpha ?? 1;
      ctx.fillText(item.emoji, item.x, item.y);
    });
    ctx.globalAlpha = 1;

    // floor
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(0, H - 20, W, 20);

    // basket / player
    const bx = state.playerX, by = H - 18, bw = 32, bh = 14;
    ctx.fillStyle = '#6d28d9';
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2, by, bw, bh, 6);
    ctx.fill();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    // basket mouth
    ctx.fillStyle = '#4c1d95';
    ctx.beginPath();
    ctx.roundRect(bx - bw / 2 + 2, by, bw - 4, 5, [4, 4, 0, 0]);
    ctx.fill();

    // score
    ctx.font      = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#a78bfa';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${state.score}`, 6, 14);

    // lives
    ctx.fillStyle = '#f43f5e';
    ctx.font      = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('♥'.repeat(state.lives), W - 6, 14);

    // time bar
    const timeRatio = state.timeLeft / state.totalTime;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(6, H - 8, W - 12, 4);
    ctx.fillStyle = timeRatio > 0.3 ? '#22c55e' : '#ef4444';
    ctx.fillRect(6, H - 8, (W - 12) * timeRatio, 4);

    ctx.textAlign = 'left';
  }

  renderGameOver(score, bonus) {
    const { ctx, W, H } = this;
    ctx.fillStyle = 'rgba(5,1,15,0.85)';
    ctx.fillRect(0, 0, W, H);

    ctx.font      = '9px "Press Start 2P", monospace';
    ctx.fillStyle = '#a78bfa';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER!', W / 2, H * 0.3);

    ctx.font = '7px "Press Start 2P", monospace';
    ctx.fillStyle = '#e0d7ff';
    ctx.fillText(`Score: ${score}`, W / 2, H * 0.48);
    ctx.fillText(`+${bonus} Happiness`, W / 2, H * 0.62);
    ctx.fillText(`+${Math.floor(bonus/3)} Intimacy`, W / 2, H * 0.75);

    ctx.font = '6px "Press Start 2P", monospace';
    ctx.fillStyle = '#6b21a8';
    ctx.fillText('Press ● to continue', W / 2, H * 0.9);
    ctx.textAlign = 'left';
  }
}
