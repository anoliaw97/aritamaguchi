/**
 * sprites.js - Pixel art character definitions for Aritamaguchi
 *
 * The pet is drawn procedurally using canvas 2D paths.
 * Each "draw*" function accepts (ctx, x, y, scale, frame, params)
 * and renders one animation frame of the pet.
 *
 * Color palette is centralized here for consistency with the
 * Arduino OLED monochrome sprites (see arduino/sprites.h).
 */

export const PALETTE = {
  outline:    '#1e1b4b',
  body:       '#c084fc',
  bodyShade:  '#9333ea',
  bodyHi:     '#e9d5ff',
  eye:        '#1e1b4b',
  eyeShine:   '#ffffff',
  cheek:      '#f472b6',
  earInner:   '#e879f9',
  mouth:      '#1e1b4b',
  tongue:     '#f9a8d4',
  tooth:      '#ffffff',
  zzz:        '#818cf8',
  star:       '#fbbf24',
  heart:      '#f43f5e',
  food:       '#a3e635',
  foodBite:   '#4d7c0f',
  sparkle:    '#e0f2fe',
  dirt:       '#92400e',
  droplet:    '#7dd3fc',
  poop:       '#78350f',
  poopHi:     '#92400e',
  bubble:     'rgba(167,139,250,0.6)',
};

// ─── low-level helpers ───────────────────────────────────────────────────────

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

function lerp(a, b, t) { return a + (b - a) * t; }

// ─── sub-components ─────────────────────────────────────────────────────────

/**
 * Draw the pet's base body (rounded blob + cat ears).
 * @param {number} breathe - 0…1 breathing phase offset
 */
function drawBody(ctx, cx, cy, s, breathe = 0) {
  const bOff = Math.sin(breathe * Math.PI * 2) * s * 0.015; // subtle breathe

  // --- ears ---
  const earW = s * 0.22, earH = s * 0.26;
  const earLX = cx - s * 0.26, earRX = cx + s * 0.04;
  const earY  = cy - s * 0.46 - bOff * 0.5;

  // left ear outer
  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.moveTo(earLX, earY + earH);
  ctx.lineTo(earLX + earW * 0.5, earY);
  ctx.lineTo(earLX + earW, earY + earH);
  ctx.closePath();
  ctx.fill();
  // left ear inner
  ctx.fillStyle = PALETTE.earInner;
  ctx.beginPath();
  ctx.moveTo(earLX + earW * 0.18, earY + earH * 0.8);
  ctx.lineTo(earLX + earW * 0.5,  earY + earH * 0.2);
  ctx.lineTo(earLX + earW * 0.82, earY + earH * 0.8);
  ctx.closePath();
  ctx.fill();

  // right ear outer
  ctx.fillStyle = PALETTE.outline;
  ctx.beginPath();
  ctx.moveTo(earRX, earY + earH);
  ctx.lineTo(earRX + earW * 0.5, earY);
  ctx.lineTo(earRX + earW, earY + earH);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.earInner;
  ctx.beginPath();
  ctx.moveTo(earRX + earW * 0.18, earY + earH * 0.8);
  ctx.lineTo(earRX + earW * 0.5,  earY + earH * 0.2);
  ctx.lineTo(earRX + earW * 0.82, earY + earH * 0.8);
  ctx.closePath();
  ctx.fill();

  // --- body + head (single rounded blob) ---
  const bW = s * 0.78, bH = s * 0.72 + bOff;
  ctx.fillStyle = PALETTE.outline;
  rr(ctx, cx - bW / 2 - s * 0.02, cy - s * 0.40 - bOff, bW + s * 0.04, bH + s * 0.04, s * 0.36);
  ctx.fill();

  ctx.fillStyle = PALETTE.body;
  rr(ctx, cx - bW / 2, cy - s * 0.40 - bOff, bW, bH, s * 0.34);
  ctx.fill();

  // highlight
  ctx.fillStyle = PALETTE.bodyHi;
  rr(ctx, cx - bW * 0.3, cy - s * 0.36 - bOff, bW * 0.3, bH * 0.18, s * 0.1);
  ctx.fill();
}

/** Draw two simple round eyes. closed=true for squint/sleep */
function drawEyes(ctx, cx, cy, s, blink = false, happy = false) {
  const eyeXL = cx - s * 0.2, eyeXR = cx + s * 0.2;
  const eyeY  = cy - s * 0.08;
  const eyeR  = s * 0.1;

  if (blink) {
    // horizontal line squint
    ctx.strokeStyle = PALETTE.eye;
    ctx.lineWidth = s * 0.04;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(eyeXL - eyeR, eyeY); ctx.lineTo(eyeXL + eyeR, eyeY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(eyeXR - eyeR, eyeY); ctx.lineTo(eyeXR + eyeR, eyeY); ctx.stroke();
    return;
  }

  if (happy) {
    // ^_^ arcs
    ctx.strokeStyle = PALETTE.eye;
    ctx.lineWidth = s * 0.04;
    ctx.lineCap = 'round';
    [eyeXL, eyeXR].forEach(ex => {
      ctx.beginPath();
      ctx.arc(ex, eyeY + eyeR * 0.4, eyeR, Math.PI, 0);
      ctx.stroke();
    });
    return;
  }

  // normal eyes
  [eyeXL, eyeXR].forEach(ex => {
    ctx.fillStyle = PALETTE.eye;
    circle(ctx, ex, eyeY, eyeR); ctx.fill();
    ctx.fillStyle = PALETTE.eyeShine;
    circle(ctx, ex + eyeR * 0.3, eyeY - eyeR * 0.3, eyeR * 0.3); ctx.fill();
  });
}

/** Draw cheek blush circles */
function drawCheeks(ctx, cx, cy, s, intensity = 1) {
  if (intensity <= 0) return;
  ctx.fillStyle = `rgba(244, 114, 182, ${0.35 * intensity})`;
  circle(ctx, cx - s * 0.28, cy, s * 0.1); ctx.fill();
  circle(ctx, cx + s * 0.28, cy, s * 0.1); ctx.fill();
}

/** Draw mouth – type: 'smile' | 'frown' | 'open' | 'ohno' | 'nom' */
function drawMouth(ctx, cx, cy, s, type = 'smile', frame = 0) {
  const mx = cx, my = cy + s * 0.12;
  ctx.strokeStyle = PALETTE.mouth;
  ctx.lineWidth = s * 0.04;
  ctx.lineCap = 'round';

  if (type === 'smile') {
    ctx.beginPath();
    ctx.arc(mx, my - s * 0.04, s * 0.13, 0.2, Math.PI - 0.2);
    ctx.stroke();
  } else if (type === 'big-smile') {
    ctx.beginPath();
    ctx.arc(mx, my - s * 0.06, s * 0.18, 0, Math.PI);
    ctx.stroke();
    // teeth
    ctx.fillStyle = PALETTE.tooth;
    ctx.beginPath();
    ctx.arc(mx, my - s * 0.06, s * 0.16, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = PALETTE.tongue;
    circle(ctx, mx, my + s * 0.02, s * 0.07); ctx.fill();
  } else if (type === 'frown') {
    ctx.beginPath();
    ctx.arc(mx, my + s * 0.08, s * 0.13, Math.PI + 0.2, -0.2);
    ctx.stroke();
  } else if (type === 'open') {
    ctx.fillStyle = PALETTE.outline;
    circle(ctx, mx, my, s * 0.07); ctx.fill();
  } else if (type === 'nom') {
    const phase = frame % 4;
    const h = phase < 2 ? s * 0.1 : s * 0.04;
    ctx.fillStyle = PALETTE.outline;
    ctx.beginPath();
    ctx.ellipse(mx, my, s * 0.12, h, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'ohno') {
    ctx.fillStyle = PALETTE.outline;
    ctx.beginPath();
    ctx.ellipse(mx, my, s * 0.08, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draw little arms/hands */
function drawArms(ctx, cx, cy, s, pose = 'down') {
  ctx.fillStyle = PALETTE.outline;
  ctx.strokeStyle = PALETTE.outline;
  ctx.lineWidth = s * 0.04;
  ctx.lineCap = 'round';

  const armBaseY = cy + s * 0.1;
  if (pose === 'down') {
    // small nubs at sides
    rr(ctx, cx - s * 0.43, armBaseY, s * 0.12, s * 0.18, s * 0.06); ctx.fill();
    rr(ctx, cx + s * 0.31, armBaseY, s * 0.12, s * 0.18, s * 0.06); ctx.fill();
  } else if (pose === 'up') {
    // raised arms
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.38, armBaseY - s * 0.04);
    ctx.lineTo(cx - s * 0.52, armBaseY - s * 0.26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.38, armBaseY - s * 0.04);
    ctx.lineTo(cx + s * 0.52, armBaseY - s * 0.26);
    ctx.stroke();
    // paws
    circle(ctx, cx - s * 0.54, armBaseY - s * 0.3, s * 0.07); ctx.fill();
    circle(ctx, cx + s * 0.54, armBaseY - s * 0.3, s * 0.07); ctx.fill();
  } else if (pose === 'wave') {
    // left down, right wave
    rr(ctx, cx - s * 0.43, armBaseY, s * 0.12, s * 0.18, s * 0.06); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.38, armBaseY - s * 0.04);
    ctx.lineTo(cx + s * 0.52, armBaseY - s * 0.24);
    ctx.stroke();
    circle(ctx, cx + s * 0.54, armBaseY - s * 0.28, s * 0.07); ctx.fill();
  } else if (pose === 'clean') {
    // both arms up, close to face
    [cx - s * 0.28, cx + s * 0.16].forEach(ax => {
      ctx.beginPath();
      ctx.moveTo(ax + s * 0.06, armBaseY - s * 0.02);
      ctx.lineTo(ax + s * 0.06, armBaseY - s * 0.32);
      ctx.stroke();
      circle(ctx, ax + s * 0.06, armBaseY - s * 0.36, s * 0.07); ctx.fill();
    });
  }
}

/** Draw tiny legs/feet */
function drawLegs(ctx, cx, cy, s, walk = 0) {
  ctx.fillStyle = PALETTE.outline;
  const legY = cy + s * 0.29;
  const legOff = Math.sin(walk * Math.PI * 2) * s * 0.06;

  rr(ctx, cx - s * 0.28, legY - legOff, s * 0.14, s * 0.14, s * 0.07); ctx.fill();
  rr(ctx, cx + s * 0.14, legY + legOff, s * 0.14, s * 0.14, s * 0.07); ctx.fill();
}

// ─── particle / effect helpers ───────────────────────────────────────────────

export function drawStars(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = PALETTE.star;
    ctx.font = `${p.size}px sans-serif`;
    ctx.fillText('★', p.x - p.size / 2, p.y + p.size / 2);
  });
  ctx.globalAlpha = 1;
}

export function drawHearts(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = PALETTE.heart;
    ctx.font = `${p.size}px sans-serif`;
    ctx.fillText('♥', p.x - p.size / 2, p.y + p.size / 2);
  });
  ctx.globalAlpha = 1;
}

export function drawZzz(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = PALETTE.zzz;
    ctx.font = `bold ${p.size}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-pixel') || 'monospace'}`;
    ctx.fillText('z', p.x, p.y);
  });
  ctx.globalAlpha = 1;
}

export function drawDroplets(ctx, particles) {
  particles.forEach(p => {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = PALETTE.droplet;
    ctx.font = `${p.size}px sans-serif`;
    ctx.fillText('💧', p.x - p.size / 2, p.y + p.size / 2);
  });
  ctx.globalAlpha = 1;
}

// ─── full animation states ───────────────────────────────────────────────────

/**
 * Master draw function. Call with current pet state info.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 */
export function drawPet(ctx, opts = {}) {
  const {
    state   = 'idle',
    frame   = 0,
    cx      = 100,
    cy      = 80,
    scale   = 1,
    breathe = 0,
    jump    = 0,     // 0..1, vertical bounce offset
    walkPhase = 0,
    evolution = 0,   // 0=baby 1=juvenile 2=adult
  } = opts;

  const s  = 48 * scale;
  const jy = -Math.abs(Math.sin(jump * Math.PI)) * s * 0.3;
  const acy = cy + jy;

  // extra glow for high affection
  if (evolution >= 2) {
    ctx.shadowColor = 'rgba(192,132,252,0.4)';
    ctx.shadowBlur  = 14 * scale;
  }

  switch (state) {
    case 'idle':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, frame % 80 < 3);
      drawCheeks(ctx, cx, acy, s, 0.6);
      drawMouth(ctx, cx, acy, s, 'smile');
      break;

    case 'happy':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase);
      drawArms(ctx, cx, acy, s, 'up');
      drawEyes(ctx, cx, acy, s, false, true);
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    case 'hungry':
      drawBody(ctx, cx, acy, s, breathe * 0.3);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, false, false);
      // droopy eyes
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth   = s * 0.035;
      ctx.lineCap     = 'round';
      [[cx - s * 0.2, acy - s * 0.1], [cx + s * 0.2, acy - s * 0.1]].forEach(([ex, ey]) => {
        ctx.beginPath();
        ctx.moveTo(ex - s * 0.1, ey - s * 0.04);
        ctx.lineTo(ex + s * 0.04, ey + s * 0.04);
        ctx.stroke();
      });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'frown');
      break;

    case 'eating':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'wave');
      drawEyes(ctx, cx, acy, s, false, true);
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'nom', frame);
      // food item
      {
        const fx = cx + s * 0.5, fy = acy - s * 0.05;
        ctx.fillStyle = PALETTE.food;
        rr(ctx, fx - s * 0.1, fy - s * 0.12, s * 0.2, s * 0.22, s * 0.06);
        ctx.fill();
        ctx.strokeStyle = PALETTE.foodBite;
        ctx.lineWidth = s * 0.03;
        ctx.stroke();
      }
      break;

    case 'sleeping': {
      // lying on side - rotate the whole thing
      ctx.save();
      ctx.translate(cx, acy + s * 0.1);
      ctx.rotate(Math.PI / 2 * 0.35);
      drawBody(ctx, 0, 0, s * 0.85, breathe * 0.4);
      drawLegs(ctx, 0, 0, s * 0.85, 0);
      drawEyes(ctx, 0, 0, s * 0.85, true);
      drawCheeks(ctx, 0, 0, s * 0.85, 0.3);
      drawMouth(ctx, 0, 0, s * 0.85, 'smile');
      ctx.restore();
      break;
    }

    case 'playing':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase);
      drawArms(ctx, cx, acy, s, 'up');
      drawEyes(ctx, cx, acy, s, false, true);
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    case 'cleaning':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'clean');
      drawEyes(ctx, cx, acy, s, frame % 20 < 3);
      drawCheeks(ctx, cx, acy, s, 0.7);
      drawMouth(ctx, cx, acy, s, 'open');
      break;

    case 'sad':
      drawBody(ctx, cx, acy, s, breathe * 0.2);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      // sad eyes (lines slanted down)
      ctx.strokeStyle = PALETTE.eye;
      ctx.lineWidth   = s * 0.04;
      ctx.lineCap     = 'round';
      [[cx - s * 0.2, acy - s * 0.08], [cx + s * 0.2, acy - s * 0.08]].forEach(([ex, ey]) => {
        ctx.beginPath();
        ctx.moveTo(ex - s * 0.08, ey - s * 0.04);
        ctx.lineTo(ex + s * 0.08, ey + s * 0.04);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex + s * 0.08, ey - s * 0.04);
        ctx.lineTo(ex - s * 0.08, ey + s * 0.04);
        ctx.stroke();
      });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'frown');
      break;

    case 'excited':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase * 2);
      drawArms(ctx, cx, acy, s, 'up');
      drawEyes(ctx, cx, acy, s, frame % 12 < 2);
      drawCheeks(ctx, cx, acy, s, 1);
      drawMouth(ctx, cx, acy, s, 'big-smile');
      break;

    case 'sick':
      drawBody(ctx, cx, acy, s, breathe * 0.1);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      // x-x eyes
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth   = s * 0.045;
      ctx.lineCap     = 'round';
      [[cx - s * 0.2, acy - s * 0.08], [cx + s * 0.2, acy - s * 0.08]].forEach(([ex, ey]) => {
        ctx.beginPath(); ctx.moveTo(ex-s*0.08,ey-s*0.08); ctx.lineTo(ex+s*0.08,ey+s*0.08); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ex+s*0.08,ey-s*0.08); ctx.lineTo(ex-s*0.08,ey+s*0.08); ctx.stroke();
      });
      drawCheeks(ctx, cx, acy, s, 0);
      drawMouth(ctx, cx, acy, s, 'ohno');
      break;

    case 'walking':
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, walkPhase);
      drawArms(ctx, cx, acy, s, walkPhase > 0.5 ? 'wave' : 'down');
      drawEyes(ctx, cx, acy, s, frame % 60 < 3);
      drawCheeks(ctx, cx, acy, s, 0.5);
      drawMouth(ctx, cx, acy, s, 'smile');
      break;

    case 'begging':
      drawBody(ctx, cx, acy - s * 0.05, s, breathe);
      drawLegs(ctx, cx, acy - s * 0.05, s, 0);
      drawArms(ctx, cx, acy - s * 0.05, s, 'up');
      drawEyes(ctx, cx, acy - s * 0.05, s, false, false);
      // teary eyes
      ctx.fillStyle = PALETTE.droplet;
      circle(ctx, cx - s * 0.15, acy + s * 0.02, s * 0.04); ctx.fill();
      circle(ctx, cx + s * 0.15, acy + s * 0.02, s * 0.04); ctx.fill();
      drawCheeks(ctx, cx, acy - s * 0.05, s, 0.8);
      drawMouth(ctx, cx, acy - s * 0.05, s, 'ohno');
      break;

    default:
      drawBody(ctx, cx, acy, s, breathe);
      drawLegs(ctx, cx, acy, s, 0);
      drawArms(ctx, cx, acy, s, 'down');
      drawEyes(ctx, cx, acy, s, false);
      drawCheeks(ctx, cx, acy, s, 0.5);
      drawMouth(ctx, cx, acy, s, 'smile');
  }

  ctx.shadowBlur  = 0;
  ctx.shadowColor = 'transparent';
}

// ─── environment / background elements ──────────────────────────────────────

export function drawBackground(ctx, W, H, timeOfDay, weather) {
  // time-of-day sky gradient
  let sky1, sky2;
  if (timeOfDay < 0.25) {
    // night
    sky1 = '#05010f'; sky2 = '#0d0520';
  } else if (timeOfDay < 0.35) {
    // dawn
    sky1 = '#1a0a3c'; sky2 = '#7c2d12';
  } else if (timeOfDay < 0.75) {
    // day
    sky1 = '#0d0c1d'; sky2 = '#1e1b4b';
  } else if (timeOfDay < 0.85) {
    // dusk
    sky1 = '#1c1049'; sky2 = '#78350f';
  } else {
    // night
    sky1 = '#05010f'; sky2 = '#0d0520';
  }

  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.7);
  grad.addColorStop(0, sky1);
  grad.addColorStop(1, sky2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // stars (night / dawn / dusk)
  if (timeOfDay < 0.3 || timeOfDay > 0.8) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    const starSeeds = [
      [0.1, 0.05], [0.3, 0.08], [0.7, 0.04], [0.85, 0.12],
      [0.55, 0.15], [0.2, 0.18], [0.9, 0.06], [0.45, 0.1],
    ];
    starSeeds.forEach(([sx, sy]) => {
      const alpha = timeOfDay < 0.3 ? 1 : (1 - (timeOfDay - 0.8) / 0.2);
      ctx.globalAlpha = alpha * 0.7;
      circle(ctx, sx * W, sy * H, 1);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // floor / grass
  ctx.fillStyle = '#1e1b4b';
  ctx.fillRect(0, H * 0.78, W, H * 0.22);

  ctx.fillStyle = '#2e1065';
  ctx.fillRect(0, H * 0.76, W, H * 0.04);

  // rain
  if (weather === 'rain') {
    ctx.strokeStyle = 'rgba(125,211,252,0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 20; i++) {
      const rx = (i * 13 + 7) % W;
      const ry = (i * 19 + 3) % (H * 0.76);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 2, ry + 8);
      ctx.stroke();
    }
  }
}

// ─── poop indicator ──────────────────────────────────────────────────────────

export function drawPoop(ctx, x, y, s = 1) {
  const ps = 8 * s;
  ctx.fillStyle = PALETTE.poop;
  ctx.beginPath();
  ctx.ellipse(x, y + ps * 0.8, ps * 0.6, ps * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y + ps * 0.4, ps * 0.4, ps * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, y, ps * 0.25, ps * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = PALETTE.poopHi;
  circle(ctx, x - ps * 0.1, y - ps * 0.05, ps * 0.06); ctx.fill();
  circle(ctx, x + ps * 0.1, y - ps * 0.05, ps * 0.06); ctx.fill();
}
