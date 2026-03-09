/**
 * sprites.js — Aritamaguchi Desktop Pet Renderer
 *
 * Procedural canvas-2D drawing for all 7 Digimon evolution stages.
 * Inspired by VPet's animation states and Shimeji-ee's surface orientations.
 *
 * Global entry point: drawFrame(ctx, W, H, state)
 *
 * state object (received from main via IPC every ~16ms):
 *   stage, form, formColor, animState, animFrame, facing,
 *   surface, isOnCeiling, isOnWallL, isOnWallR,
 *   breatheT, walkPhase, hunger, strength, poopCount,
 *   sick, calling, callReason, flashAlpha, flashColor,
 *   discipline, careMistakes, battleWins
 */

/* ── palette ──────────────────────────────────────────────────────────────── */
const PAL = {
  outline:   '#1e1b4b',
  eye:       '#1e1b4b',
  eyeShine:  '#ffffff',
  cheek:     'rgba(244,114,182,0.55)',
  mouth:     '#1e1b4b',
  tongue:    '#f9a8d4',
  tooth:     '#ffffff',
  sweat:     '#7dd3fc',
  star:      '#fbbf24',
  heart:     '#f43f5e',
  zzz:       '#818cf8',
  poop:      '#78350f',
  poopHi:    '#92400e',
  sick:      '#bef264',
};

/* ── math helpers ─────────────────────────────────────────────────────────── */
const TAU = Math.PI * 2;
function lerp(a, b, t) { return a + (b - a) * t; }
function sin(t)  { return Math.sin(t); }
function cos(t)  { return Math.cos(t); }

/* ── canvas helpers ───────────────────────────────────────────────────────── */
function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
}
function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/* ── SIZE TABLE per stage ──────────────────────────────────────────────────── */
const STAGE_SIZE = [40, 52, 64, 76, 90, 100, 112]; // body radius-ish

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
══════════════════════════════════════════════════════════════════════════════ */
function drawFrame(ctx, W, H, state) {
  const {
    stage = 1, formColor = '#c084fc', animState = 'idle',
    animFrame = 0, facing = 1,
    surface = 'floor', isOnCeiling = false,
    breatheT = 0, walkPhase = 0,
    hunger = 4, strength = 4, poopCount = 0,
    sick = false, calling = false, callReason = null,
    flashAlpha = 0, flashColor = '#ffffff',
  } = state;

  const now = Date.now() / 1000;

  // ── canvas transform based on surface ─────────────────────────────────────
  ctx.save();
  ctx.translate(W / 2, H / 2);

  if (isOnCeiling) {
    ctx.scale(1, -1);                       // flip upside-down
  } else if (surface === 'left_wall') {
    ctx.rotate(-Math.PI / 2);              // rotate for wall grip
  } else if (surface === 'right_wall') {
    ctx.rotate(Math.PI / 2);
  }

  if (facing === -1 && !isOnCeiling && surface === 'floor') {
    ctx.scale(-1, 1);                       // mirror left-facing
  }

  // ── draw based on stage ───────────────────────────────────────────────────
  const t  = now;
  const sz = STAGE_SIZE[Math.min(stage, 6)];

  switch (stage) {
    case 0:  drawEgg(ctx, sz, animState, t); break;
    case 1:  drawBaby1(ctx, sz, formColor, animState, animFrame, t, walkPhase); break;
    case 2:  drawBaby2(ctx, sz, formColor, animState, animFrame, t, walkPhase); break;
    default: drawDigimon(ctx, sz, formColor, stage, animState, animFrame, t, walkPhase, sick); break;
  }

  ctx.restore();

  // ── HUD (always upright, on top of everything) ────────────────────────────
  drawHUD(ctx, W, H, { hunger, strength, poopCount, calling, callReason, animState, formColor });

  // ── flash overlay ─────────────────────────────────────────────────────────
  if (flashAlpha > 0.01) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   EGG  (stage 0)
══════════════════════════════════════════════════════════════════════════════ */
function drawEgg(ctx, sz, animState, t) {
  const wobble = sin(t * 3) * 0.05 + 1;
  ctx.save();
  ctx.scale(wobble, 1 / wobble);

  // shell
  ctx.fillStyle = '#e9d5ff';
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2;
  ellipse(ctx, 0, sz * 0.1, sz * 0.42, sz * 0.52);
  ctx.fill(); ctx.stroke();

  // spots
  ctx.fillStyle = '#c084fc';
  [[-.2, -.15, .09], [.18, .05, .07], [-.05, .25, .06]].forEach(([dx, dy, r]) => {
    circle(ctx, dx * sz, dy * sz, r * sz);
    ctx.fill();
  });

  // crack lines (when about to hatch = evolving state)
  if (animState === 'evolving') {
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-sz * 0.1, -sz * 0.2);
    ctx.lineTo(sz * 0.05, sz * 0.05);
    ctx.lineTo(-sz * 0.08, sz * 0.1);
    ctx.stroke();
  }

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════════
   BABY I  (stage 1) — tiny blob, dot eyes only
══════════════════════════════════════════════════════════════════════════════ */
function drawBaby1(ctx, sz, color, animState, animFrame, t, walkPhase) {
  const bounce = animState === 'walking' ? sin(walkPhase * TAU) * sz * 0.08 : 0;
  const breathe = sin(t * 1.4) * 0.025 + 1;
  ctx.save();
  ctx.translate(0, bounce);
  ctx.scale(breathe, 1 / breathe);

  // body blob
  ctx.fillStyle = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2;
  circle(ctx, 0, 0, sz * 0.5);
  ctx.fill(); ctx.stroke();

  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ellipse(ctx, -sz * 0.15, -sz * 0.2, sz * 0.18, sz * 0.13);
  ctx.fill();

  // eyes (tiny dots)
  const eyeY  = -sz * 0.06;
  const eyeX  = sz * 0.16;
  const eyeR  = sz * 0.08;
  drawEye(ctx, -eyeX, eyeY, eyeR, animState, t);
  drawEye(ctx,  eyeX, eyeY, eyeR, animState, t);

  // mouth
  drawMouth(ctx, 0, sz * 0.15, sz * 0.1, animState);

  // sleeping ZZZ
  if (animState === 'sleeping') drawZzz(ctx, sz * 0.45, -sz * 0.45, sz, t);

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════════
   BABY II  (stage 2) — small creature, stub ears, tiny tail
══════════════════════════════════════════════════════════════════════════════ */
function drawBaby2(ctx, sz, color, animState, animFrame, t, walkPhase) {
  const bounce  = animState === 'walking' ? sin(walkPhase * TAU) * sz * 0.09 : 0;
  const breathe = sin(t * 1.3) * 0.02 + 1;
  ctx.save();
  ctx.translate(0, bounce);
  ctx.scale(breathe, 1 / breathe);

  // tail
  drawTail(ctx, sz * 0.45, sz * 0.15, sz * 0.22, t, color);

  // body
  ctx.fillStyle = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth = 2;
  ellipse(ctx, 0, sz * 0.08, sz * 0.42, sz * 0.48);
  ctx.fill(); ctx.stroke();

  // head
  circle(ctx, 0, -sz * 0.25, sz * 0.36);
  ctx.fill(); ctx.stroke();

  // ears (stubs)
  drawStubEar(ctx, -sz * 0.28, -sz * 0.55, sz * 0.12, sz * 0.16, color);
  drawStubEar(ctx,  sz * 0.28, -sz * 0.55, sz * 0.12, sz * 0.16, color);

  // highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ellipse(ctx, -sz * 0.12, -sz * 0.38, sz * 0.14, sz * 0.1);
  ctx.fill();

  // eyes
  const eyeY = -sz * 0.28;
  const eyeX = sz * 0.14;
  const eyeR = sz * 0.1;
  drawEye(ctx, -eyeX, eyeY, eyeR, animState, t);
  drawEye(ctx,  eyeX, eyeY, eyeR, animState, t);

  // cheeks
  ctx.fillStyle = PAL.cheek;
  circle(ctx, -eyeX - eyeR, eyeY + eyeR + 2, eyeR * 0.8); ctx.fill();
  circle(ctx,  eyeX + eyeR, eyeY + eyeR + 2, eyeR * 0.8); ctx.fill();

  // mouth
  drawMouth(ctx, 0, -sz * 0.1, sz * 0.11, animState);

  if (animState === 'sleeping') drawZzz(ctx, sz * 0.48, -sz * 0.55, sz, t);
  if (animState === 'sick')     drawSweat(ctx, sz * 0.3, -sz * 0.5, sz, t);

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════════
   ROOKIE → MEGA  (stages 3–6) — generic Digimon body, grows with stage
══════════════════════════════════════════════════════════════════════════════ */
function drawDigimon(ctx, sz, color, stage, animState, animFrame, t, walkPhase, sick) {
  const bobY    = animState === 'walking' ? sin(walkPhase * TAU) * sz * 0.1 : 0;
  const breathe = sin(t * 1.2) * 0.02 + 1;
  const squash  = animState === 'win' ? 1.15 : (animState === 'lose' ? 0.88 : 1);

  // climbing pose offset
  const climbPhase = animState === 'climbing' ? sin(t * 4) * sz * 0.06 : 0;

  ctx.save();
  ctx.translate(climbPhase, bobY);
  ctx.scale(breathe * squash, (1 / breathe) * (1 / squash));

  // ── body segments (all stages share this base) ───────────────────────────
  const bodyH  = sz * 0.55;
  const bodyW  = sz * 0.48;
  const headR  = sz * 0.38;
  const headY  = -sz * 0.3;
  const bodyY  = sz * 0.15;

  // tail (varies by stage)
  if (stage <= 4) drawTail(ctx, sz * 0.48, bodyY - sz * 0.05, sz * 0.28, t, color);

  // body
  ctx.fillStyle   = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 2 + stage * 0.3;

  ellipse(ctx, 0, bodyY, bodyW, bodyH);
  ctx.fill(); ctx.stroke();

  // belly patch (lighter)
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ellipse(ctx, 0, bodyY + sz * 0.05, bodyW * 0.65, bodyH * 0.65);
  ctx.fill();

  // head
  ctx.fillStyle   = color;
  ctx.strokeStyle = PAL.outline;
  circle(ctx, 0, headY, headR);
  ctx.fill(); ctx.stroke();

  // ears (grow with stage)
  const earH = sz * (0.18 + stage * 0.02);
  const earW = sz * (0.1  + stage * 0.01);
  const earOX = headR * 0.65;
  const earY  = headY - headR * 0.55;
  drawPointedEar(ctx, -earOX, earY, earW, earH, color, t, animState === 'being_petted');
  drawPointedEar(ctx,  earOX, earY, earW, earH, color, t, animState === 'being_petted');

  // head highlight
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ellipse(ctx, -headR * 0.28, headY - headR * 0.3, headR * 0.3, headR * 0.2);
  ctx.fill();

  // eyes
  const eyeY = headY - headR * 0.08;
  const eyeX = headR * 0.38;
  const eyeR = sz * (0.09 + stage * 0.005);
  drawEye(ctx, -eyeX, eyeY, eyeR, animState, t);
  drawEye(ctx,  eyeX, eyeY, eyeR, animState, t);

  // cheeks
  ctx.fillStyle = PAL.cheek;
  circle(ctx, -(eyeX + eyeR * 0.8), eyeY + eyeR, eyeR * 0.9); ctx.fill();
  circle(ctx,  (eyeX + eyeR * 0.8), eyeY + eyeR, eyeR * 0.9); ctx.fill();

  // mouth
  drawMouth(ctx, 0, headY + headR * 0.42, sz * 0.13, animState);

  // legs/feet (simple rounded stubs)
  const legY  = bodyY + bodyH * 0.78;
  const legOX = bodyW * 0.45;
  const legR  = sz * 0.11;
  ctx.fillStyle = color;
  ctx.strokeStyle = PAL.outline;
  circle(ctx, -legOX, legY, legR); ctx.fill(); ctx.stroke();
  circle(ctx,  legOX, legY, legR); ctx.fill(); ctx.stroke();

  // arms (simple stubs, raised when climbing)
  const armAngle = animState === 'climbing'
    ? (-0.8 + sin(t * 4) * 0.4)
    : (animState === 'win' ? -0.6 : -0.2);
  drawArm(ctx, -bodyW - sz * 0.02, bodyY - sz * 0.1, sz * 0.16, armAngle, color);
  drawArm(ctx,  bodyW + sz * 0.02, bodyY - sz * 0.1, sz * 0.16, armAngle + Math.PI, color);

  // Sick indicator (green sweat drops)
  if (sick || animState === 'sick') {
    drawSweat(ctx, headR * 0.7, headY - headR * 0.6, sz, t);
  }

  // Sleeping ZZZs
  if (animState === 'sleeping') {
    drawZzz(ctx, headR + sz * 0.12, headY - headR * 0.7, sz, t);
  }

  // Training: sweat drops + raised arm
  if (animState === 'training') {
    drawSweat(ctx, -headR * 0.3, headY - headR, sz * 0.7, t);
  }

  // Win sparkles
  if (animState === 'win') {
    drawSparkles(ctx, sz, t);
  }

  ctx.restore();
}

/* ══════════════════════════════════════════════════════════════════════════════
   SUB-DRAWERS
══════════════════════════════════════════════════════════════════════════════ */

function drawEye(ctx, cx, cy, r, animState, t) {
  const blinkT   = animState === 'sleeping' ? 1 : Math.max(0, sin(t * 0.7) > 0.97 ? (t % 0.5) * 4 : 0);
  const openness = Math.max(0.05, 1 - blinkT);

  ctx.fillStyle = PAL.eye;
  ellipse(ctx, cx, cy, r, r * openness);
  ctx.fill();

  if (openness > 0.3) {
    // shine
    ctx.fillStyle = PAL.eyeShine;
    circle(ctx, cx + r * 0.3, cy - r * 0.3, r * 0.28);
    ctx.fill();

    // heart eyes when being petted
    if (animState === 'being_petted') {
      ctx.fillStyle = '#f43f5e';
      ctx.font = `${Math.round(r * 1.8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', cx, cy);
    }
  }
}

function drawMouth(ctx, cx, cy, r, animState) {
  ctx.strokeStyle = PAL.mouth;
  ctx.lineWidth   = 1.5;
  ctx.fillStyle   = PAL.tongue;

  if (animState === 'eating' || animState === 'happy' || animState === 'win') {
    // open happy mouth
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    // tongue
    ctx.fillStyle = PAL.tongue;
    ellipse(ctx, cx, cy + r * 0.5, r * 0.45, r * 0.3);
    ctx.fill();
  } else if (animState === 'lose' || animState === 'sad') {
    // frown
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.6, r, Math.PI, 0);
    ctx.stroke();
  } else {
    // neutral smile
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.8, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
}

function drawTail(ctx, tx, ty, len, t, color) {
  const ang = sin(t * 5) * 0.6;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.rotate(ang);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 4;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.5, len, -len * 0.25);
  ctx.stroke();
  // tip
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  circle(ctx, len, -len * 0.25, 4);
  ctx.fill();
  ctx.restore();
}

function drawStubEar(ctx, cx, cy, w, h, color) {
  ctx.fillStyle   = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  ellipse(ctx, cx, cy, w, h);
  ctx.fill(); ctx.stroke();
  // inner
  ctx.fillStyle = 'rgba(255,182,193,0.55)';
  ellipse(ctx, cx, cy, w * 0.55, h * 0.6);
  ctx.fill();
}

function drawPointedEar(ctx, cx, cy, w, h, color, t, wiggle) {
  const wag = wiggle ? sin(t * 8) * 0.15 : 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wag * Math.sign(cx));
  ctx.fillStyle   = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-w, -h);
  ctx.lineTo(w, -h);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  // inner pink
  ctx.fillStyle = 'rgba(255,182,193,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, -h * 0.15);
  ctx.lineTo(-w * 0.55, -h * 0.85);
  ctx.lineTo( w * 0.55, -h * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawArm(ctx, ax, ay, len, angle, color) {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineWidth   = 5;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, len);
  ctx.stroke();
  // hand (circle)
  ctx.fillStyle   = color;
  ctx.strokeStyle = PAL.outline;
  ctx.lineWidth   = 1.5;
  circle(ctx, 0, len, len * 0.38);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawZzz(ctx, ox, oy, sz, t) {
  const texts = ['z', 'Z', 'Z'];
  texts.forEach((z, i) => {
    const phase = (t * 0.6 + i * 0.4) % 1;
    ctx.globalAlpha = Math.min(1, phase < 0.5 ? phase * 2 : (1 - phase) * 2);
    ctx.font        = `bold ${sz * (0.12 + i * 0.04)}px sans-serif`;
    ctx.fillStyle   = PAL.zzz;
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(z, ox + i * sz * 0.09, oy - phase * sz * 0.3 - i * sz * 0.12);
  });
  ctx.globalAlpha = 1;
  ctx.textAlign   = 'left';
}

function drawSweat(ctx, ox, oy, sz, t) {
  const phase = (t * 1.2) % 1;
  ctx.globalAlpha = 0.7 + sin(t * 3) * 0.3;
  ctx.fillStyle   = PAL.sweat;
  ctx.beginPath();
  ctx.arc(ox, oy + phase * sz * 0.15, sz * 0.06, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawSparkles(ctx, sz, t) {
  const pts = [[-sz*0.5, -sz*0.4], [sz*0.55, -sz*0.35], [0, -sz*0.65], [-sz*0.3, sz*0.5]];
  pts.forEach(([px, py], i) => {
    const phase = ((t * 2 + i * 0.5) % 1);
    ctx.globalAlpha = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    ctx.fillStyle   = PAL.star;
    ctx.font        = `${sz * 0.18}px sans-serif`;
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', px, py - phase * sz * 0.15);
  });
  ctx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════════════════════════
   HUD  (hunger/strength hearts, poop, status labels)
══════════════════════════════════════════════════════════════════════════════ */
function drawHUD(ctx, W, H, { hunger, strength, poopCount, calling, callReason, animState, formColor }) {
  ctx.textBaseline = 'middle';
  ctx.font         = '10px sans-serif';

  // ── Hunger hearts (top-left) ──────────────────────────────────────────────
  if (hunger < 4) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < hunger ? '#f43f5e' : 'rgba(255,255,255,0.2)';
      ctx.font      = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('♥', 6 + i * 16, 14);
    }
    ctx.font = '7px "monospace"';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('HGR', 7, 24);
  }

  // ── Strength hearts (bottom-left) ────────────────────────────────────────
  if (strength < 4) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < strength ? '#60a5fa' : 'rgba(255,255,255,0.2)';
      ctx.font      = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('♥', 6 + i * 16, H - 24);
    }
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('STR', 7, H - 14);
  }

  // ── Poop (bottom-right, stacked) ─────────────────────────────────────────
  for (let i = 0; i < poopCount; i++) {
    ctx.font      = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('💩', W - 6 - i * 18, H - 18);
  }

  // ── Calling indicator ────────────────────────────────────────────────────
  if (calling) {
    const on = Math.floor(Date.now() / 400) % 2 === 0;
    if (on) {
      ctx.font      = 'bold 18px sans-serif';
      ctx.fillStyle = callReason === 'hungry' ? '#ef4444' : '#fbbf24';
      ctx.textAlign = 'center';
      ctx.fillText('!', W * 0.5, 18);
    }
  }

  // ── Sick label ───────────────────────────────────────────────────────────
  if (animState === 'sick') {
    ctx.font      = '8px monospace';
    ctx.fillStyle = '#bef264';
    ctx.textAlign = 'center';
    ctx.fillText('SICK', W / 2, H - 10);
  }

  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

/* ══════════════════════════════════════════════════════════════════════════════
   FLOOR SHADOW  (drawn before pet, in app.js)
══════════════════════════════════════════════════════════════════════════════ */
function drawShadow(ctx, W, H, surface, sz) {
  if (surface !== 'floor') return;
  const shadowW = sz * 0.8;
  const shadowH = sz * 0.18;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 8, shadowW / 2, shadowH / 2, 0, 0, TAU);
  ctx.fill();
}
