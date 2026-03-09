/**
 * sprites.js — Aritamaguchi Anime Girl Renderer
 *
 * Procedural canvas-2D chibi anime girl.
 * Appearance (hair/dress color) driven by Groq AI via state.groqState.
 *
 * Global entry point: drawFrame(ctx, W, H, state)
 */

/* ── math helpers ─────────────────────────────────────────────────────────── */
const TAU = Math.PI * 2;
function sin(t) { return Math.sin(t); }
function cos(t) { return Math.cos(t); }

/* ── canvas helpers ───────────────────────────────────────────────────────── */
function circle(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
}
function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
}

/* ── color helpers ────────────────────────────────────────────────────────── */
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r, g, b];
}
function lighten(hex, amt) {
  const [r,g,b] = hexToRgb(hex);
  const cl = v => Math.min(255, Math.round(v + amt));
  return `rgb(${cl(r)},${cl(g)},${cl(b)})`;
}
function rgba(hex, a) {
  const [r,g,b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
══════════════════════════════════════════════════════════════════════════════ */
function drawFrame(ctx, W, H, state) {
  const {
    animState   = 'idle',
    facing      = 1,
    surface     = 'floor',
    isOnCeiling = false,
    breatheT    = 0,
    walkPhase   = 0,
    hunger      = 4,
    strength    = 4,
    poopCount   = 0,
    sick        = false,
    calling     = false,
    callReason  = null,
    flashAlpha  = 0,
    flashColor  = '#ffffff',
    groqState   = {},
  } = state;

  const hairColor  = groqState.hairColor  || '#FF9EC4';
  const dressColor = groqState.dressColor || '#6CA8FF';
  const now = Date.now() / 1000;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Surface orientation (Shimeji-style)
  if (isOnCeiling) {
    ctx.scale(1, -1);
  } else if (surface === 'left_wall') {
    ctx.rotate(-Math.PI / 2);
  } else if (surface === 'right_wall') {
    ctx.rotate(Math.PI / 2);
  }
  if (facing === -1 && !isOnCeiling && surface === 'floor') {
    ctx.scale(-1, 1);
  }

  drawAnimeGirl(ctx, animState, hairColor, dressColor, walkPhase, now, sick);

  ctx.restore();

  // HUD always upright
  drawHUD(ctx, W, H, { hunger, strength, poopCount, calling, callReason, animState });

  // Flash overlay
  if (flashAlpha > 0.01) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = flashColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

/* ══════════════════════════════════════════════════════════════════════════════
   CHIBI ANIME GIRL  (all coords relative to canvas center = origin)
   Layout (upright):
     Hair top:    y = -52
     Head center: y = -22,  r = 22
     Neck:        y = -1 .. +5
     Dress body:  y = +5  .. +38
     Legs:        y = +38 .. +58
     Shoes:       y = +58
══════════════════════════════════════════════════════════════════════════════ */
function drawAnimeGirl(ctx, animState, hairColor, dressColor, walkPhase, now, sick) {
  /* ── per-state offsets & transforms ─────────────────────────────── */
  let bodyBob     = 0;
  let breatheScale = 1 + sin(now * 1.4) * 0.012; // subtle breathing always
  let squash      = 1;

  if (animState === 'walking' || animState === 'ceiling_walk') {
    bodyBob = sin(walkPhase * TAU) * 3;
  }
  if (animState === 'win' || animState === 'happy') {
    const jumpT = (sin(now * 6) + 1) / 2;
    bodyBob = -jumpT * 12;
    squash  = 1 + jumpT * 0.08;
  }
  if (animState === 'lose' || animState === 'sad') {
    bodyBob = 4;
  }
  if (animState === 'calling') {
    bodyBob = sin(now * 10) * 2;
  }

  ctx.save();
  ctx.translate(0, bodyBob);
  ctx.scale(breatheScale * squash, breatheScale / squash);

  /* ── 1. TWIN TAILS (behind head, drawn first) ────────────────────── */
  const tailSwing = sin(now * 3) * 4;           // gentle swinging
  const walkHair  = animState === 'walking' ? sin(walkPhase * TAU) * 3 : 0;

  // left tail
  ctx.save();
  ctx.translate(-18, -28 + walkHair);
  ctx.rotate(-0.25 + tailSwing * 0.03);
  _drawTwinTail(ctx, hairColor, -1);
  ctx.restore();

  // right tail
  ctx.save();
  ctx.translate(18, -28 + walkHair);
  ctx.rotate(0.25 - tailSwing * 0.03);
  _drawTwinTail(ctx, hairColor, 1);
  ctx.restore();

  /* ── 2. HEAD ─────────────────────────────────────────────────────── */
  const SKIN = '#FDDBB4';
  ctx.fillStyle   = SKIN;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1.5;
  circle(ctx, 0, -22, 22);
  ctx.fill();
  ctx.stroke();

  /* ── 3. HAIR TOP (on head) ───────────────────────────────────────── */
  ctx.fillStyle   = hairColor;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1.2;
  // Main hair cap
  ctx.beginPath();
  ctx.ellipse(0, -34, 21, 14, 0, Math.PI, 0);
  ctx.lineTo(22, -22);
  ctx.arc(0, -22, 22, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Side hair (covers ears)
  ctx.beginPath();
  ctx.ellipse(-22, -24, 5, 10, -0.3, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(22, -24, 5, 10, 0.3, 0, TAU);
  ctx.fill();

  // Bangs (fringe) — 3 locks over forehead
  [[-10,0], [0,-2], [10,0]].forEach(([bx, by]) => {
    ctx.fillStyle   = lighten(hairColor, -15);
    ctx.beginPath();
    ctx.ellipse(bx, -40 + by, 6, 10, 0, 0, Math.PI);
    ctx.fill();
  });

  /* ── 4. EARS ─────────────────────────────────────────────────────── */
  ctx.fillStyle   = SKIN;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1;
  [-1, 1].forEach(side => {
    ellipse(ctx, side * 23, -20, 4, 6);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,150,130,0.4)';
    ellipse(ctx, side * 23, -20, 2, 3.5);
    ctx.fill();
    ctx.fillStyle = SKIN;
  });

  /* ── 5. EYES ─────────────────────────────────────────────────────── */
  const sleeping = animState === 'sleeping';
  const petted   = animState === 'being_petted';
  const blinkT   = sleeping ? 1 : Math.max(0, sin(now * 0.5) > 0.96 ? (now % 0.5) * 5 : 0);
  const openness = Math.max(0.05, 1 - blinkT);

  [-1, 1].forEach(side => {
    const ex = side * 9;
    const ey = -26;

    if (sleeping) {
      // closed crescent
      ctx.strokeStyle = '#1a0a00';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(ex, ey + 2, 5, Math.PI, 0);
      ctx.stroke();
    } else if (petted) {
      // crescent happy eyes
      ctx.fillStyle = '#1a0a00';
      ctx.beginPath();
      ctx.arc(ex, ey, 5 * openness, Math.PI, 0);
      ctx.fill();
      // blush
      ctx.fillStyle = 'rgba(255,100,120,0.5)';
      ellipse(ctx, ex + side*1, ey + 6, 5, 2.5);
      ctx.fill();
    } else {
      // White of eye
      ctx.fillStyle   = '#fff';
      ctx.strokeStyle = '#1a0a00';
      ctx.lineWidth   = 1;
      ellipse(ctx, ex, ey, 5.5, 7 * openness);
      ctx.fill(); ctx.stroke();

      if (openness > 0.3) {
        // Iris (use complementary of hairColor for variety)
        ctx.fillStyle = lighten(hairColor, -60);
        ellipse(ctx, ex, ey + 1, 4, 5 * openness);
        ctx.fill();
        // Pupil
        ctx.fillStyle = '#1a0a00';
        ellipse(ctx, ex, ey + 1, 2.2, 3 * openness);
        ctx.fill();
        // Shine
        ctx.fillStyle = '#ffffff';
        circle(ctx, ex + 1.5, ey - 1.5, 1.8);
        ctx.fill();
        circle(ctx, ex - 1, ey + 2, 0.9);
        ctx.fill();
        // Lashes (3 short lines above)
        ctx.strokeStyle = '#1a0a00';
        ctx.lineWidth = 1;
        [-3, 0, 3].forEach(lx => {
          ctx.beginPath();
          ctx.moveTo(ex + lx, ey - 6 * openness);
          ctx.lineTo(ex + lx + side * 0.5, ey - 9 * openness);
          ctx.stroke();
        });
      }
    }

    // Eyebrow
    if (!sleeping) {
      ctx.strokeStyle = lighten(hairColor, -80);
      ctx.lineWidth   = 1.5;
      ctx.lineCap     = 'round';
      const browLift  = (animState === 'sad' || animState === 'lose') ? 2 : 0;
      ctx.beginPath();
      ctx.moveTo(ex - 5, ey - 10 + browLift);
      ctx.quadraticCurveTo(ex, ey - 12 + browLift, ex + 5, ey - 10 + browLift);
      ctx.stroke();
    }
  });

  /* ── 6. NOSE + MOUTH ─────────────────────────────────────────────── */
  // Tiny nose
  ctx.fillStyle = 'rgba(200,120,90,0.5)';
  ellipse(ctx, 1, -15, 2, 1.2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1.2;
  ctx.lineCap     = 'round';
  if (animState === 'happy' || animState === 'win' || animState === 'eating') {
    // Big smile
    ctx.fillStyle = '#e05080';
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI);
    ctx.fill(); ctx.stroke();
    // tiny teeth
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3.5, -10, 7, 2.5);
  } else if (animState === 'sad' || animState === 'lose') {
    ctx.beginPath();
    ctx.arc(0, -6, 4, Math.PI, 0);
    ctx.stroke();
  } else if (animState === 'being_petted') {
    // small w-mouth / happy
    ctx.beginPath();
    ctx.moveTo(-4, -10);
    ctx.quadraticCurveTo(-2, -8, 0, -10);
    ctx.quadraticCurveTo(2, -12, 4, -10);
    ctx.stroke();
  } else {
    // neutral small smile
    ctx.beginPath();
    ctx.arc(0, -11, 3.5, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }

  /* ── 7. CHEEKS ───────────────────────────────────────────────────── */
  const blushAlpha = (animState === 'being_petted' || animState === 'happy') ? 0.65
                   : animState === 'win' ? 0.5 : 0.25;
  ctx.fillStyle = `rgba(255,120,140,${blushAlpha})`;
  ellipse(ctx, -14, -18, 6, 3.5);
  ctx.fill();
  ellipse(ctx, 14, -18, 6, 3.5);
  ctx.fill();

  /* ── 8. NECK ─────────────────────────────────────────────────────── */
  ctx.fillStyle = SKIN;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(-4, -2, 8, 8, 2);
  ctx.fill(); ctx.stroke();

  /* ── 9. ARMS ─────────────────────────────────────────────────────── */
  const walkArmSwing = animState === 'walking' ? sin(walkPhase * TAU) * 0.4 : 0;
  const climbArmL    = animState === 'climbing' ? -0.9 + sin(now * 4) * 0.3 : -0.15 + walkArmSwing;
  const climbArmR    = animState === 'climbing' ?  0.4 - sin(now * 4) * 0.3 :  0.15 - walkArmSwing;
  const winArm       = animState === 'win' || animState === 'happy' ? -0.8 : 0;

  _drawArm(ctx, -14, 10, climbArmL - winArm, dressColor, SKIN);
  _drawArm(ctx,  14, 10, climbArmR + winArm, dressColor, SKIN);

  /* ── 10. DRESS BODY ──────────────────────────────────────────────── */
  // Collar / bodice
  ctx.fillStyle   = lighten(dressColor, 30);
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.roundRect(-10, 5, 20, 14, 3);
  ctx.fill(); ctx.stroke();

  // White collar bow
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#ddd';
  ctx.lineWidth = 0.8;
  // left bow lobe
  ctx.beginPath(); ctx.ellipse(-3, 8, 4, 2.5, -0.5, 0, TAU); ctx.fill(); ctx.stroke();
  // right bow lobe
  ctx.beginPath(); ctx.ellipse(3, 8, 4, 2.5, 0.5, 0, TAU); ctx.fill(); ctx.stroke();
  // center knot
  circle(ctx, 0, 8, 2); ctx.fillStyle = '#eee'; ctx.fill();

  // Skirt (A-line trapezoid)
  ctx.fillStyle   = dressColor;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1.2;
  ctx.beginPath();
  ctx.moveTo(-11, 18);
  ctx.lineTo(-19, 40);
  ctx.quadraticCurveTo(0, 44, 19, 40);
  ctx.lineTo(11, 18);
  ctx.closePath();
  ctx.fill(); ctx.stroke();

  // Skirt highlight
  ctx.fillStyle = rgba(dressColor, 0.3);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(-6, 18);
  ctx.lineTo(-10, 38);
  ctx.lineTo(0, 40);
  ctx.lineTo(6, 18);
  ctx.closePath();
  ctx.fill();

  /* ── 11. LEGS ────────────────────────────────────────────────────── */
  const legLSwing = animState === 'walking' ? sin(walkPhase * TAU) * 6 : 0;
  const legRSwing = animState === 'walking' ? -sin(walkPhase * TAU) * 6 : 0;

  _drawLeg(ctx, -7, 40, legLSwing, hairColor);
  _drawLeg(ctx,  7, 40, legRSwing, hairColor);

  /* ── 12. SPECIAL EFFECTS ─────────────────────────────────────────── */
  if (animState === 'sleeping') {
    _drawZzz(ctx, 26, -38, now);
  }
  if (sick || animState === 'sick') {
    _drawSweat(ctx, 18, -38, now);
  }
  if (animState === 'win' || animState === 'happy') {
    _drawSparkles(ctx, now);
  }
  if (animState === 'being_petted') {
    // Heart above head
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const heartY = -56 + sin(now * 3) * 3;
    ctx.fillText('♥', 0, heartY);
  }
  if (animState === 'calling') {
    const on = Math.floor(now * 2.5) % 2 === 0;
    if (on) {
      ctx.font      = 'bold 14px sans-serif';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 22, -50);
    }
  }
  if (animState === 'evolving') {
    ctx.fillStyle   = `rgba(255,255,255,${0.4 + sin(now * 8) * 0.4})`;
    ctx.fillRect(-26, -60, 52, 120);
  }
  if (animState === 'training') {
    _drawSweat(ctx, -20, -40, now);
  }
  // Lose: tear drops
  if (animState === 'lose' || animState === 'sad') {
    ctx.fillStyle = '#7dd3fc';
    const tearY = -20 + ((now * 30) % 20);
    ellipse(ctx, -13, tearY, 1.5, 2.5); ctx.fill();
    ellipse(ctx,  13, tearY, 1.5, 2.5); ctx.fill();
  }

  ctx.restore(); // bodyBob / breathe
}

/* ── Sub-drawers ──────────────────────────────────────────────────────────── */

function _drawTwinTail(ctx, hairColor, side) {
  // Elongated rounded tail hanging down
  ctx.fillStyle   = hairColor;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.ellipse(side * 3, 18, 9, 22, side * 0.2, 0, TAU);
  ctx.fill(); ctx.stroke();
  // Hair band
  ctx.fillStyle = lighten(hairColor, -40);
  ellipse(ctx, side * 3, -2, 7, 4);
  ctx.fill();
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ellipse(ctx, side * 1, 8, 4, 10);
  ctx.fill();
}

function _drawArm(ctx, ax, ay, angle, sleeveColor, skinColor) {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(angle);

  // Sleeve
  ctx.fillStyle   = sleeveColor;
  ctx.strokeStyle = '#3a2010';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(-4, 0, 8, 14, 3);
  ctx.fill(); ctx.stroke();

  // Hand
  ctx.fillStyle   = skinColor;
  ctx.strokeStyle = '#3a2010';
  circle(ctx, 0, 17, 4.5);
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function _drawLeg(ctx, lx, ly, swing, shoeColor) {
  ctx.save();
  ctx.translate(lx, ly);
  ctx.rotate(swing * 0.05);

  // White sock / leg
  ctx.fillStyle   = '#ffffff';
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.roundRect(-4, 0, 8, 14, 2);
  ctx.fill(); ctx.stroke();

  // Shoe (small dark rounded rect)
  ctx.fillStyle   = '#2a1a0a';
  ctx.strokeStyle = '#1a0a00';
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.roundRect(-5, 13, 10, 6, 3);
  ctx.fill(); ctx.stroke();

  ctx.restore();
}

function _drawZzz(ctx, ox, oy, now) {
  ['z','Z','Z'].forEach((z, i) => {
    const phase = ((now * 0.6 + i * 0.4) % 1);
    ctx.globalAlpha = Math.min(1, phase < 0.5 ? phase * 2 : (1 - phase) * 2);
    ctx.font        = `bold ${10 + i * 3}px sans-serif`;
    ctx.fillStyle   = '#818cf8';
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(z, ox + i * 8, oy - phase * 16 - i * 10);
  });
  ctx.globalAlpha = 1;
}

function _drawSweat(ctx, ox, oy, now) {
  const phase = (now * 1.2) % 1;
  ctx.globalAlpha = 0.75 + sin(now * 4) * 0.2;
  ctx.fillStyle   = '#7dd3fc';
  circle(ctx, ox, oy + phase * 12, 3.5);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function _drawSparkles(ctx, now) {
  const pts = [[-28,-30],[28,-26],[4,-50],[-16,10]];
  pts.forEach(([px, py], i) => {
    const phase = ((now * 2 + i * 0.5) % 1);
    ctx.globalAlpha = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
    ctx.fillStyle   = '#fbbf24';
    ctx.font        = '12px sans-serif';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', px, py - phase * 12);
  });
  ctx.globalAlpha = 1;
}

/* ══════════════════════════════════════════════════════════════════════════════
   HUD (hunger/strength hearts, poop, status indicators)
══════════════════════════════════════════════════════════════════════════════ */
function drawHUD(ctx, W, H, { hunger, strength, poopCount, calling, callReason, animState }) {
  ctx.textBaseline = 'middle';

  if (hunger < 4) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < hunger ? '#f43f5e' : 'rgba(255,255,255,0.2)';
      ctx.font      = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('♥', 6 + i * 16, 14);
    }
    ctx.font      = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('HGR', 7, 24);
  }

  if (strength < 4) {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < strength ? '#60a5fa' : 'rgba(255,255,255,0.2)';
      ctx.font      = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('♥', 6 + i * 16, H - 24);
    }
    ctx.font      = '7px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('STR', 7, H - 14);
  }

  for (let i = 0; i < poopCount; i++) {
    ctx.font      = '14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('💩', W - 6 - i * 18, H - 18);
  }

  if (calling) {
    const on = Math.floor(Date.now() / 400) % 2 === 0;
    if (on) {
      ctx.font      = 'bold 18px sans-serif';
      ctx.fillStyle = callReason === 'hungry' ? '#ef4444' : '#fbbf24';
      ctx.textAlign = 'center';
      ctx.fillText('!', W * 0.5, 18);
    }
  }

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
   FLOOR SHADOW  (called from app.js before drawFrame)
══════════════════════════════════════════════════════════════════════════════ */
function drawShadow(ctx, W, H, surface) {
  if (surface !== 'floor') return;
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H - 6, 26, 7, 0, 0, TAU);
  ctx.fill();
}
