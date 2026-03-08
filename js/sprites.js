/**
 * sprites.js - Procedural pixel-art character for Aritamaguchi
 *
 * All drawing is canvas 2D paths — no bitmaps needed.
 * Richer animation params:
 *   lookDir   : -1 left | 0 center | 1 right  (eye-tracking)
 *   tailPhase : 0..1 continuous tail-wag
 *   blinkT    : 0..1  (1 = fully closed)
 *   sneeze    : 0..1  (particle burst)
 *   spinAngle : rotation for spin/excited state
 *   heartEyes : bool  (loyal/soulbound override)
 */

export const PALETTE = {
  outline:    '#1e1b4b',
  body:       '#c084fc',
  bodyShade:  '#9333ea',
  bodyHi:     '#e9d5ff',
  bodyHi2:    '#f3e8ff',
  eye:        '#1e1b4b',
  eyeShine:   '#ffffff',
  pupil:      '#2d1b69',
  cheek:      '#f472b6',
  cheekHi:    '#fb7185',
  earInner:   '#e879f9',
  earTip:     '#d946ef',
  mouth:      '#1e1b4b',
  tongue:     '#f9a8d4',
  tooth:      '#ffffff',
  tail:       '#9333ea',
  tailTip:    '#c084fc',
  zzz:        '#818cf8',
  star:       '#fbbf24',
  heart:      '#f43f5e',
  heartLight: '#fb7185',
  food:       '#a3e635',
  foodBite:   '#4d7c0f',
  sparkle:    '#e0f2fe',
  droplet:    '#7dd3fc',
  poop:       '#78350f',
  poopHi:     '#92400e',
  sneeze:     '#bef264',
  sweat:      '#60a5fa',
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

// ─── TAIL ────────────────────────────────────────────────────────────────────

function drawTail(ctx, cx, cy, s, phase) {
  const ang  = Math.sin(phase * Math.PI * 2) * 0.7;
  const tx   = cx + s * 0.44;
  const ty   = cy + s * 0.12;
  const len  = s * 0.3;

  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(ang);

  // tail shaft
  ctx.strokeStyle = PALETTE.tail;
  ctx.lineWidth   = s * 0.09;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.4, -len * 0.5, len, -len * 0.2);
  ctx.stroke();

  // fluffy tip
  ctx.fillStyle = PALETTE.tailTip;
  circle(ctx, len, -len * 0.2, s * 0.08);
  ctx.fill();

  ctx.restore();
}

// ─── BODY ────────────────────────────────────────────────────────────────────

function drawBody(ctx, cx, cy, s, breathe = 0) {
  const bOff = Math.sin(breathe * Math.PI * 2) * s * 0.018;

  // --- ears ---
  const earW = s * 0.23, earH = s * 0.28;
  const earLX = cx - s * 0.27, earRX = cx + s * 0.04;
  const earY  = cy - s * 0.48 - bOff * 0.5;

  function drawEar(ex) {
    ctx.fillStyle = PALETTE.outline;
    ctx.beginPath();
    ctx.moveTo(ex, earY + earH);
    ctx.lineTo(ex + earW * 0.5, earY);
    ctx.lineTo(ex + earW, earY + earH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.earInner;
    ctx.beginPath();
    ctx.moveTo(ex + earW * 0.2, earY + earH * 0.78);
    ctx.lineTo(ex + earW * 0.5, earY + earH * 0.18);
    ctx.lineTo(ex + earW * 0.8, earY + earH * 0.78);
    ctx.closePath();
    ctx.fill();
  }

  drawEar(earLX);
  drawEar(earRX);

  // --- main blob (outline + fill + highlight) ---
  const bW = s * 0.8, bH = s * 0.74 + bOff;
  const bx = cx - bW / 2, by = cy - s * 0.41 - bOff;

  // outline
  ctx.fillStyle = PALETTE.outline;
  rr(ctx, bx - s * 0.025, by - s * 0.025, bW + s * 0.05, bH + s * 0.05, s * 0.38);
  ctx.fill();

  // body fill with gradient
  const grad = ctx.createRadialGradient(cx - s * 0.1, by + bH * 0.2, s * 0.05, cx, by + bH * 0.5, bW * 0.7);
  grad.addColorStop(0, PALETTE.bodyHi2);
  grad.addColorStop(0.4, PALETTE.body);
  grad.addColorStop(1, PALETTE.bodyShade);
  ctx.fillStyle = grad;
  rr(ctx, bx, by, bW, bH, s * 0.36);
  ctx.fill();

  // inner glow highlight
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  rr(ctx, cx - bW * 0.28, by + bH * 0.06, bW * 0.32, bH * 0.2, s * 0.1);
  ctx.fill();
}

// ─── EYES ────────────────────────────────────────────────────────────────────

function drawEyes(ctx, cx, cy, s, opts = {}) {
  const {
    blink    = false,
    happy    = false,
    sad      = false,
    heart    = false,
    look     = 0,      // -1 left, 0 center, 1 right
    blinkT   = 0,      // 0=open 1=closed
    xEyes    = false,  // X-X sick/dead
  } = opts;

  const eyeXL = cx - s * 0.19, eyeXR = cx + s * 0.19;
  const eyeY  = cy - s * 0.08;
  const eyeR  = s * 0.105;

  // animated blink (partial close)
  const bT = Math.max(blink ? 1 : 0, blinkT);

  if (xEyes) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth   = s * 0.045;
    ctx.lineCap     = 'round';
    [eyeXL, eyeXR].forEach(ex => {
      ctx.beginPath(); ctx.moveTo(ex-eyeR,eyeY-eyeR); ctx.lineTo(ex+eyeR,eyeY+eyeR); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex+eyeR,eyeY-eyeR); ctx.lineTo(ex-eyeR,eyeY+eyeR); ctx.stroke();
    });
    return;
  }

  if (happy && !heart) {
    ctx.strokeStyle = PALETTE.eye;
    ctx.lineWidth   = s * 0.045;
    ctx.lineCap     = 'round';
    [eyeXL, eyeXR].forEach(ex => {
      ctx.beginPath();
      ctx.arc(ex, eyeY + eyeR * 0.5, eyeR, Math.PI, 0);
      ctx.stroke();
    });
    return;
  }

  if (heart) {
    // heart eyes for soulbound / very happy
    [eyeXL, eyeXR].forEach(ex => {
      ctx.fillStyle = PALETTE.heart;
      ctx.font      = `${s * 0.25}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('♥', ex, eyeY + s * 0.07);
    });
    ctx.textAlign = 'left';
    return;
  }

  if (sad) {
    ctx.strokeStyle = PALETTE.eye;
    ctx.lineWidth   = s * 0.04;
    ctx.lineCap     = 'round';
    [eyeXL, eyeXR].forEach((ex, i) => {
      const tilt = i === 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(ex - eyeR, eyeY - tilt * s * 0.04);
      ctx.lineTo(ex + eyeR, eyeY + tilt * s * 0.04);
      ctx.stroke();
    });
    return;
  }

  // normal round eyes with blink squish + look direction
  [eyeXL, eyeXR].forEach(ex => {
    const scaleY = 1 - bT * 0.95;
    ctx.save();
    ctx.translate(ex, eyeY);
    ctx.scale(1, scaleY);

    // sclera
    ctx.fillStyle = PALETTE.eye;
    circle(ctx, 0, 0, eyeR); ctx.fill();

    if (scaleY > 0.15) {
      // pupil offset for look direction
      const px = look * eyeR * 0.35;
      ctx.fillStyle = PALETTE.pupil;
      circle(ctx, px, 0, eyeR * 0.62); ctx.fill();

      // shine
      ctx.fillStyle = PALETTE.eyeShine;
      circle(ctx, px + eyeR * 0.25, -eyeR * 0.28, eyeR * 0.28); ctx.fill();
      // small secondary shine
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      circle(ctx, px - eyeR * 0.18, eyeR * 0.2, eyeR * 0.14); ctx.fill();
    }

    ctx.restore();
  });
}

// ─── CHEEKS ──────────────────────────────────────────────────────────────────

function drawCheeks(ctx, cx, cy, s, intensity = 1) {
  if (intensity <= 0) return;
  const r = s * 0.11;
  const lx = cx - s * 0.29, rx = cx + s * 0.29;
  ctx.fillStyle = `rgba(244,114,182,${0.32 * intensity})`;
  circle(ctx, lx, cy + s * 0.01, r); ctx.fill();
  circle(ctx, rx, cy + s * 0.01, r); ctx.fill();
  // highlight dot
  ctx.fillStyle = `rgba(255,200,220,${0.25 * intensity})`;
  circle(ctx, lx - r * 0.2, cy - r * 0.1, r * 0.4); ctx.fill();
  circle(ctx, rx + r * 0.2, cy - r * 0.1, r * 0.4); ctx.fill();
}

// ─── MOUTH ───────────────────────────────────────────────────────────────────

function drawMouth(ctx, cx, cy, s, type = 'smile', frame = 0) {
  const mx = cx, my = cy + s * 0.14;
  ctx.strokeStyle = PALETTE.mouth;
  ctx.lineWidth   = s * 0.04;
  ctx.lineCap     = 'round';

  switch (type) {
    case 'smile':
      ctx.beginPath();
      ctx.arc(mx, my - s * 0.05, s * 0.12, 0.25, Math.PI - 0.25);
      ctx.stroke();
      break;

    case 'big-smile':
      ctx.fillStyle = PALETTE.outline;
      ctx.beginPath();
      ctx.arc(mx, my - s * 0.06, s * 0.18, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = PALETTE.tooth;
      ctx.fillRect(mx - s * 0.12, my - s * 0.06, s * 0.24, s * 0.08);
      ctx.fillStyle = PALETTE.tongue;
      ctx.beginPath();
      ctx.ellipse(mx, my + s * 0.03, s * 0.1, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'frown':
      ctx.beginPath();
      ctx.arc(mx, my + s * 0.1, s * 0.12, Math.PI + 0.25, -0.25);
      ctx.stroke();
      break;

    case 'open':
      ctx.fillStyle = PALETTE.outline;
      ctx.beginPath();
      ctx.ellipse(mx, my, s * 0.07, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'nom': {
      const phase = frame % 6;
      const h = phase < 3 ? s * 0.11 : s * 0.04;
      ctx.fillStyle = PALETTE.outline;
      ctx.beginPath();
      ctx.ellipse(mx, my, s * 0.13, h, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case 'ohno':
      ctx.fillStyle = PALETTE.outline;
      ctx.beginPath();
      ctx.ellipse(mx, my, s * 0.07, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'smirk':
      ctx.beginPath();
      ctx.arc(mx + s * 0.04, my - s * 0.03, s * 0.08, 0.4, Math.PI - 0.1);
      ctx.stroke();
      break;

    case 'wiggle': {
      // mouth wobbles for sneeze build-up
      const wo = Math.sin(frame * 0.6) * s * 0.04;
      ctx.beginPath();
      ctx.arc(mx + wo, my - s * 0.04, s * 0.09, 0.3, Math.PI - 0.3);
      ctx.stroke();
      break;
    }
  }
}

// ─── ARMS ────────────────────────────────────────────────────────────────────

function drawArms(ctx, cx, cy, s, pose = 'down') {
  ctx.fillStyle   = PALETTE.outline;
  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth   = s * 0.09;
  ctx.lineCap     = 'round';

  const armBaseY = cy + s * 0.1;

  switch (pose) {
    case 'down':
      rr(ctx, cx - s * 0.46, armBaseY, s * 0.14, s * 0.19, s * 0.07); ctx.fill();
      rr(ctx, cx + s * 0.32, armBaseY, s * 0.14, s * 0.19, s * 0.07); ctx.fill();
      break;

    case 'up':
      ctx.beginPath(); ctx.moveTo(cx - s * 0.38, armBaseY); ctx.lineTo(cx - s * 0.55, armBaseY - s * 0.3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.38, armBaseY); ctx.lineTo(cx + s * 0.55, armBaseY - s * 0.3); ctx.stroke();
      circle(ctx, cx - s * 0.57, armBaseY - s * 0.34, s * 0.08); ctx.fill();
      circle(ctx, cx + s * 0.57, armBaseY - s * 0.34, s * 0.08); ctx.fill();
      break;

    case 'wave': {
      rr(ctx, cx - s * 0.46, armBaseY, s * 0.14, s * 0.19, s * 0.07); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.38, armBaseY); ctx.lineTo(cx + s * 0.55, armBaseY - s * 0.28); ctx.stroke();
      circle(ctx, cx + s * 0.57, armBaseY - s * 0.32, s * 0.08); ctx.fill();
      break;
    }

    case 'clean':
      [cx - s * 0.28, cx + s * 0.14].forEach(ax => {
        ctx.beginPath(); ctx.moveTo(ax + s * 0.07, armBaseY); ctx.lineTo(ax + s * 0.07, armBaseY - s * 0.35); ctx.stroke();
        circle(ctx, ax + s * 0.07, armBaseY - s * 0.39, s * 0.08); ctx.fill();
      });
      break;

    case 'stretch':
      ctx.beginPath(); ctx.moveTo(cx - s * 0.38, armBaseY); ctx.lineTo(cx - s * 0.58, armBaseY - s * 0.18); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + s * 0.38, armBaseY); ctx.lineTo(cx + s * 0.58, armBaseY - s * 0.18); ctx.stroke();
      circle(ctx, cx - s * 0.6, armBaseY - s * 0.22, s * 0.08); ctx.fill();
      circle(ctx, cx + s * 0.6, armBaseY - s * 0.22, s * 0.08); ctx.fill();
      break;
  }
}

// ─── LEGS ────────────────────────────────────────────────────────────────────

function drawLegs(ctx, cx, cy, s, walk = 0) {
  ctx.fillStyle = PALETTE.outline;
  const legY  = cy + s * 0.32;
  const legOff = Math.sin(walk * Math.PI * 2) * s * 0.07;

  rr(ctx, cx - s * 0.3, legY - legOff, s * 0.15, s * 0.16, s * 0.075); ctx.fill();
  rr(ctx, cx + s * 0.15, legY + legOff, s * 0.15, s * 0.16, s * 0.075); ctx.fill();
}

// ─── SNEEZE PARTICLES ────────────────────────────────────────────────────────

function drawSneezeParticles(ctx, cx, cy, s, phase) {
  if (phase <= 0) return;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 - Math.PI / 2;
    const dist = phase * s * 0.35;
    ctx.globalAlpha = 1 - phase * 0.8;
    ctx.fillStyle = i % 2 === 0 ? PALETTE.sneeze : PALETTE.sparkle;
    circle(ctx, cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, s * 0.05 * (1 - phase));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ─── SWEAT DROP ──────────────────────────────────────────────────────────────

function drawSweat(ctx, cx, cy, s) {
  ctx.fillStyle = PALETTE.sweat;
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.38, cy - s * 0.16);
  ctx.quadraticCurveTo(cx + s * 0.42, cy - s * 0.05, cx + s * 0.38, cy);
  ctx.quadraticCurveTo(cx + s * 0.34, cy - s * 0.05, cx + s * 0.38, cy - s * 0.16);
  ctx.fill();
}

// ─── PARTICLES (exported for renderer) ───────────────────────────────────────

export function drawStars(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.font = `bold ${p.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.star;
    ctx.fillText('★', p.x, p.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

export function drawHearts(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.font = `${p.size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = p.size > 12 ? PALETTE.heartLight : PALETTE.heart;
    ctx.fillText('♥', p.x, p.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

export function drawZzz(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle   = PALETTE.zzz;
    ctx.font        = `bold ${p.size}px monospace`;
    ctx.textAlign   = 'center';
    ctx.fillText('z', p.x, p.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

export function drawDroplets(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.font        = `${p.size}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.fillText('💧', p.x, p.y);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

// ─── MASTER DRAW ─────────────────────────────────────────────────────────────

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 *   state, frame, cx, cy, scale, breathe, jump, walkPhase,
 *   evolution, lookDir, tailPhase, blinkT, sneezePhase, spinAngle
 */
export function drawPet(ctx, opts = {}) {
  const {
    state       = 'idle',
    frame       = 0,
    cx          = 130,
    cy          = 100,
    scale       = 1,
    breathe     = 0,
    jump        = 0,
    walkPhase   = 0,
    evolution   = 0,
    lookDir     = 0,
    tailPhase   = 0,
    blinkT      = 0,
    sneezePhase = 0,
    spinAngle   = 0,
  } = opts;

  const s  = 52 * scale;
  const jy = -Math.abs(Math.sin(jump * Math.PI)) * s * 0.36;
  const acy = cy + jy;

  // glow at high evolution
  if (evolution >= 2) {
    ctx.shadowColor = 'rgba(192,132,252,0.5)';
    ctx.shadowBlur  = 18 * scale;
  }

  // spin transform
  if (spinAngle !== 0) {
    ctx.save();
    ctx.translate(cx, acy);
    ctx.rotate(spinAngle);
    ctx.translate(-cx, -acy);
  }

  const isHeart = evolution >= 2 && (state === 'happy' || state === 'excited');

  switch (state) {
    // ── IDLE ─────────────────────────────────────────────────────────────────
    case 'idle':
      drawTail(ctx, cx, acy, s, tailPhase * 0.3);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { look: lookDir, blinkT });
      drawCheeks(ctx, cx, acy, s, 0.55);
      drawMouth(ctx, cx, acy, s, 'smile');
      break;

    // ── HAPPY ─────────────────────────────────────────────────────────────────
    case 'happy':
      drawTail(ctx, cx, acy, s, tailPhase * 3);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase);
      drawArms(ctx, cx, acy, s, 'up');
      drawEyes(ctx, cx, acy, s, { happy: true, heart: isHeart });
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    // ── HUNGRY ───────────────────────────────────────────────────────────────
    case 'hungry':
      drawTail(ctx, cx, acy, s, tailPhase * 0.15);
      drawBody(ctx, cx, acy, s, breathe * 0.3);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { sad: true, blinkT });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'frown');
      drawSweat(ctx, cx, acy, s);
      break;

    // ── BEGGING ───────────────────────────────────────────────────────────────
    case 'begging':
      drawTail(ctx, cx, acy, s, tailPhase * 0.5);
      drawBody(ctx, cx, acy - s * 0.04, s, breathe);
      drawLegs(ctx, cx, acy - s * 0.04, s, 0);
      drawArms(ctx, cx, acy - s * 0.04, s, 'up');
      drawEyes(ctx, cx, acy - s * 0.04, s, { blinkT });
      // big teary eyes
      ctx.fillStyle = PALETTE.droplet;
      [cx - s * 0.14, cx + s * 0.14].forEach(tx => {
        ctx.beginPath();
        ctx.moveTo(tx, acy + s * 0.04);
        ctx.quadraticCurveTo(tx + s * 0.025, acy + s * 0.1, tx, acy + s * 0.14);
        ctx.quadraticCurveTo(tx - s * 0.025, acy + s * 0.1, tx, acy + s * 0.04);
        ctx.fill();
      });
      drawCheeks(ctx, cx, acy - s * 0.04, s, 0.8);
      drawMouth(ctx, cx, acy - s * 0.04, s, 'ohno');
      break;

    // ── EATING ───────────────────────────────────────────────────────────────
    case 'eating':
      drawTail(ctx, cx, acy, s, tailPhase * 2);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'wave');
      drawEyes(ctx, cx, acy, s, { happy: true });
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'nom', frame);
      // food item
      {
        const fx = cx + s * 0.53, fy = acy - s * 0.06;
        ctx.fillStyle = PALETTE.food;
        rr(ctx, fx - s * 0.1, fy - s * 0.14, s * 0.22, s * 0.25, s * 0.07); ctx.fill();
        ctx.strokeStyle = PALETTE.foodBite; ctx.lineWidth = s * 0.03; ctx.stroke();
      }
      break;

    // ── SLEEPING ─────────────────────────────────────────────────────────────
    case 'sleeping': {
      ctx.save();
      ctx.translate(cx, acy + s * 0.08);
      ctx.rotate(Math.PI / 2 * 0.32);
      drawBody(ctx, 0, 0, s * 0.88, breathe * 0.3);
      drawLegs(ctx, 0, 0, s * 0.88, 0);
      drawEyes(ctx, 0, 0, s * 0.88, { blink: true });
      drawCheeks(ctx, 0, 0, s * 0.88, 0.3);
      drawMouth(ctx, 0, 0, s * 0.88, 'smile');
      ctx.restore();
      break;
    }

    // ── PLAYING ───────────────────────────────────────────────────────────────
    case 'playing':
      drawTail(ctx, cx, acy, s, tailPhase * 4);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase * 2);
      drawArms(ctx, cx, acy, s, 'up');
      drawEyes(ctx, cx, acy, s, { happy: true, heart: isHeart });
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    // ── CLEANING ──────────────────────────────────────────────────────────────
    case 'cleaning':
      drawTail(ctx, cx, acy, s, tailPhase * 1.5);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'clean');
      drawEyes(ctx, cx, acy, s, { blinkT: frame % 24 < 4 ? 1 : 0 });
      drawCheeks(ctx, cx, acy, s, 0.6);
      drawMouth(ctx, cx, acy, s, 'open');
      // sparkle effect
      {
        const t = (frame % 30) / 30;
        ctx.fillStyle = 'rgba(224,242,254,0.8)';
        [[cx - s*0.12, acy - s*0.28], [cx + s*0.06, acy - s*0.32]].forEach(([sx, sy]) => {
          ctx.globalAlpha = 0.7 * Math.sin(t * Math.PI);
          ctx.font = `${s * 0.18}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('✦', sx, sy);
        });
        ctx.globalAlpha = 1; ctx.textAlign = 'left';
      }
      break;

    // ── SAD ───────────────────────────────────────────────────────────────────
    case 'sad':
      drawTail(ctx, cx, acy, s, 0);
      drawBody(ctx, cx, acy, s, breathe * 0.15);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { sad: true });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'frown');
      break;

    // ── EXCITED ───────────────────────────────────────────────────────────────
    case 'excited':
      drawTail(ctx, cx, acy, s, tailPhase * 6);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase * 3);
      drawArms(ctx, cx, acy, s, frame % 20 < 10 ? 'up' : 'wave');
      drawEyes(ctx, cx, acy, s, { happy: true, heart: isHeart });
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    // ── SICK ──────────────────────────────────────────────────────────────────
    case 'sick':
      drawTail(ctx, cx, acy, s, 0);
      drawBody(ctx, cx, acy, s, breathe * 0.05);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { xEyes: true });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'ohno');
      break;

    // ── WALKING ───────────────────────────────────────────────────────────────
    case 'walking':
      drawTail(ctx, cx, acy, s, tailPhase * 2);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase);
      drawArms(ctx, cx, acy, s, walkPhase > 0.5 ? 'wave' : 'down');
      drawEyes(ctx, cx, acy, s, { look: lookDir, blinkT });
      drawCheeks(ctx, cx, acy, s, 0.5);
      drawMouth(ctx, cx, acy, s, 'smile');
      break;

    // ── SNEEZE ────────────────────────────────────────────────────────────────
    case 'sneeze':
      drawTail(ctx, cx, acy, s, tailPhase);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'stretch');
      drawEyes(ctx, cx, acy, s, { blink: sneezePhase > 0.5 });
      drawCheeks(ctx, cx, acy, s, 0.4);
      drawMouth(ctx, cx, acy, s, sneezePhase < 0.5 ? 'wiggle' : 'ohno', frame);
      drawSneezeParticles(ctx, cx + s * 0.08, acy + s * 0.2, s, sneezePhase > 0.6 ? (sneezePhase - 0.6) / 0.4 : 0);
      break;

    // ── LOOKING AROUND ────────────────────────────────────────────────────────
    case 'lookaround':
      drawTail(ctx, cx, acy, s, tailPhase * 0.8);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { look: lookDir, blinkT });
      drawCheeks(ctx, cx, acy, s, 0.5);
      drawMouth(ctx, cx, acy, s, 'smirk');
      break;

    default:
      drawTail(ctx, cx, acy, s, tailPhase);
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, { look: lookDir, blinkT });
      drawCheeks(ctx, cx, acy, s, 0.5);
      drawMouth(ctx, cx, acy, s, 'smile');
  }

  if (spinAngle !== 0) ctx.restore();

  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
}

// ─── BACKGROUND ──────────────────────────────────────────────────────────────

export function drawBackground(ctx, W, H, timeOfDay, weather) {
  let sky1, sky2;
  if (timeOfDay < 0.25)      { sky1 = '#04000d'; sky2 = '#0a0118'; }
  else if (timeOfDay < 0.35) { sky1 = '#1a0a3c'; sky2 = '#7c2d12'; }
  else if (timeOfDay < 0.75) { sky1 = '#0d0c1d'; sky2 = '#1e1b4b'; }
  else if (timeOfDay < 0.85) { sky1 = '#1c1049'; sky2 = '#78350f'; }
  else                       { sky1 = '#04000d'; sky2 = '#0a0118'; }

  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  grad.addColorStop(0, sky1);
  grad.addColorStop(1, sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars
  if (timeOfDay < 0.32 || timeOfDay > 0.78) {
    const starSeeds = [[0.1,0.05],[0.32,0.09],[0.68,0.04],[0.85,0.13],[0.54,0.17],[0.2,0.21],[0.9,0.07],[0.44,0.11],[0.76,0.19],[0.05,0.15]];
    starSeeds.forEach(([sx, sy]) => {
      const t = timeOfDay < 0.32 ? 1 : Math.max(0, 1 - (timeOfDay - 0.78) / 0.1);
      ctx.globalAlpha = t * (0.4 + Math.random() * 0.3);
      ctx.fillStyle   = '#fff';
      const tw = 1 + Math.sin(Date.now() / 1000 + sx * 10) * 0.5;
      ctx.beginPath();
      ctx.arc(sx * W, sy * H, tw, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // moon (night) or sun (day)
  if (timeOfDay < 0.28 || timeOfDay > 0.82) {
    const mx = W * 0.85, my = H * 0.14;
    ctx.fillStyle = 'rgba(255,255,200,0.9)';
    circle(ctx, mx, my, H * 0.045); ctx.fill();
    ctx.fillStyle = sky1;
    circle(ctx, mx + H * 0.025, my - H * 0.01, H * 0.038); ctx.fill();
  } else if (timeOfDay > 0.38 && timeOfDay < 0.72) {
    const sx = W * 0.85, sy = H * 0.12;
    ctx.fillStyle = 'rgba(255,220,80,0.25)';
    circle(ctx, sx, sy, H * 0.065); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,60,0.7)';
    circle(ctx, sx, sy, H * 0.04); ctx.fill();
  }

  // floor
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(0, H * 0.79, W, H * 0.21);
  ctx.fillStyle = '#2e1065';
  ctx.fillRect(0, H * 0.77, W, H * 0.04);

  // rain
  if (weather === 'rain') {
    ctx.strokeStyle = 'rgba(125,211,252,0.35)';
    ctx.lineWidth   = 1;
    for (let i = 0; i < 24; i++) {
      const rx = (i * 11 + 3) % W;
      const ry = ((i * 17 + Date.now() / 30) % (H * 0.77 + 20)) - 10;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 2, ry + 9);
      ctx.stroke();
    }
  }
}

// ─── POOP ────────────────────────────────────────────────────────────────────

export function drawPoop(ctx, x, y, s = 1) {
  const ps = 9 * s;
  ctx.fillStyle = PALETTE.poop;
  ctx.beginPath(); ctx.ellipse(x, y + ps * 0.85, ps * 0.64, ps * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y + ps * 0.42, ps * 0.44, ps * 0.3,  0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x, y,              ps * 0.28, ps * 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = PALETTE.poopHi;
  circle(ctx, x - ps * 0.1, y - ps * 0.06, ps * 0.06); ctx.fill();
  circle(ctx, x + ps * 0.1, y - ps * 0.06, ps * 0.06); ctx.fill();
}
