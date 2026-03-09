/**
 * app.js — Aritamaguchi Desktop Pet Renderer
 *
 * VPet-inspired interactions:
 *   - Hover toolbar (Feed / Medicine / Train / Battle buttons)
 *   - Click-to-pet → petting animation
 *   - Speech bubble (MessageBar)
 *
 * Shimeji-inspired physics UI:
 *   - Drag to move pet (throw on release)
 *   - Mouse passthrough on transparent pixels
 *
 * Communicates with main.js via window.electronAPI (injected by preload.js).
 */

'use strict';

(() => {
  const canvas = document.getElementById('pet-canvas');
  const ctx    = canvas.getContext('2d');
  const W      = canvas.width;
  const H      = canvas.height;

  // ── State ──────────────────────────────────────────────────────────────────
  let currentState    = null;
  let dragging        = false;
  let dragStartX      = 0;
  let dragStartY      = 0;
  let didDrag         = false;      // distinguish click vs drag

  // VPet toolbar
  let toolbarVisible  = false;
  let toolbarHoverIdx = -1;         // which button is hovered (-1 = none)

  // VPet speech bubble
  let message         = '';
  let messageTimer    = 0;

  // ── Toolbar layout (4 buttons in a row above pet) ─────────────────────────
  const TB_BTNS = [
    { icon: '🍖', label: 'Feed',     action: 'feed'      },
    { icon: '💊', label: 'Medicine', action: 'medicine'  },
    { icon: '💪', label: 'Train',    action: 'train'     },
    { icon: '⚔️', label: 'Battle',   action: 'battle'    },
  ];
  const TB_BTN_W  = 34;
  const TB_BTN_H  = 30;
  const TB_PAD    = 4;
  const TB_TOTAL  = TB_BTNS.length * TB_BTN_W + (TB_BTNS.length - 1) * TB_PAD;
  const TB_X      = (W - TB_TOTAL) / 2;
  const TB_Y      = 4;   // top of canvas

  function toolbarBtnRect(i) {
    return {
      x: TB_X + i * (TB_BTN_W + TB_PAD),
      y: TB_Y,
      w: TB_BTN_W,
      h: TB_BTN_H,
    };
  }

  function toolbarHitTest(mx, my) {
    if (!toolbarVisible) return -1;
    for (let i = 0; i < TB_BTNS.length; i++) {
      const r = toolbarBtnRect(i);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) return i;
    }
    return -1;
  }

  // ── Speech bubble ─────────────────────────────────────────────────────────
  function showMessage(text, durationMs = 2500) {
    message      = text;
    messageTimer = Date.now() + durationMs;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function render(state) {
    ctx.clearRect(0, 0, W, H);

    if (!state) return;

    // Shadow (only on floor)
    const sz = [40, 52, 64, 76, 90, 100, 112][Math.min(state.stage ?? 1, 6)];
    drawShadow(ctx, W, H, state.surface, sz);

    // Pet sprite
    drawFrame(ctx, W, H, state);

    // VPet toolbar overlay
    if (toolbarVisible) drawToolbar(ctx);

    // Speech bubble
    if (message && Date.now() < messageTimer) {
      drawSpeechBubble(ctx, W, H, message);
    } else {
      message = '';
    }
  }

  function drawToolbar(ctx) {
    // Background pill
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = '#1e1b4b';
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth   = 1.5;
    rr(ctx, TB_X - 6, TB_Y - 2, TB_TOTAL + 12, TB_BTN_H + 4, 8);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;

    // Buttons
    TB_BTNS.forEach((btn, i) => {
      const r   = toolbarBtnRect(i);
      const hot = toolbarHoverIdx === i;

      // button bg
      ctx.fillStyle   = hot ? '#7c3aed' : 'rgba(124,58,237,0.35)';
      ctx.strokeStyle = hot ? '#a78bfa' : 'transparent';
      ctx.lineWidth   = 1;
      rr(ctx, r.x, r.y, r.w, r.h, 5);
      ctx.fill(); ctx.stroke();

      // icon
      ctx.font      = '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = hot ? 1 : 0.85;
      ctx.fillText(btn.icon, r.x + r.w / 2, r.y + r.h / 2);
      ctx.globalAlpha = 1;
    });

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  function drawSpeechBubble(ctx, W, H, text) {
    const bubbleW = Math.min(W - 16, text.length * 7 + 16);
    const bubbleH = 22;
    const bx      = (W - bubbleW) / 2;
    const by      = H * 0.08;

    ctx.save();
    ctx.globalAlpha = 0.92;

    // bubble background
    ctx.fillStyle   = '#f3e8ff';
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth   = 1.5;
    rr(ctx, bx, by, bubbleW, bubbleH, 6);
    ctx.fill(); ctx.stroke();

    // tail pointing down toward pet
    ctx.beginPath();
    ctx.moveTo(W / 2 - 5, by + bubbleH);
    ctx.lineTo(W / 2 + 5, by + bubbleH);
    ctx.lineTo(W / 2,     by + bubbleH + 7);
    ctx.closePath();
    ctx.fillStyle = '#f3e8ff';
    ctx.fill();
    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth   = 1;
    ctx.stroke();

    // text
    ctx.font         = '8px "monospace"';
    ctx.fillStyle    = '#1e1b4b';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha  = 1;
    ctx.fillText(text, W / 2, by + bubbleH / 2, bubbleW - 8);

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // roundRect helper (may not be available in older Electron Chromium)
  function rr(ctx, x, y, w, h, r) {
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }
  }

  // ── Mouse passthrough ──────────────────────────────────────────────────────
  // Only pass mouse clicks through completely transparent pixels of the canvas.
  canvas.addEventListener('mousemove', (e) => {
    const px = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data;
    const isTransparent = px[3] < 10;

    window.electronAPI.setIgnoreMouse(isTransparent);

    // Update toolbar hover highlight
    if (!isTransparent) {
      toolbarHoverIdx = toolbarHitTest(e.offsetX, e.offsetY);
    }
  });

  canvas.addEventListener('mouseenter', () => {
    toolbarVisible = true;
  });

  canvas.addEventListener('mouseleave', () => {
    toolbarVisible  = false;
    toolbarHoverIdx = -1;
    // Re-enable passthrough when mouse leaves (safety)
    window.electronAPI.setIgnoreMouse(true);
  });

  // ── Drag (Shimeji throw) ───────────────────────────────────────────────────
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // only left button

    // Check we're over a visible pixel
    const px = ctx.getImageData(e.offsetX, e.offsetY, 1, 1).data;
    if (px[3] < 10) return;

    // Check if over toolbar
    if (toolbarHitTest(e.offsetX, e.offsetY) >= 0) return;

    dragging   = true;
    didDrag    = false;
    dragStartX = e.screenX;
    dragStartY = e.screenY;

    window.electronAPI.dragStart(e.screenX, e.screenY);
    canvas.style.cursor = 'grabbing';
    window.electronAPI.setIgnoreMouse(false);
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = Math.abs(e.screenX - dragStartX);
    const dy = Math.abs(e.screenY - dragStartY);
    if (dx > 3 || dy > 3) didDrag = true;
    window.electronAPI.dragMove(e.screenX, e.screenY);
  });

  window.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    canvas.style.cursor = 'grab';

    if (didDrag) {
      window.electronAPI.dragEnd();
    } else {
      // VPet: click (no drag) = pet the character
      window.electronAPI.dragEnd(); // stop drag state in main
      window.electronAPI.petAction(); // trigger petting
      showMessage('✨ *pets*', 1800);
    }
    didDrag = false;
  });

  // ── Right-click → tray context menu ───────────────────────────────────────
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.electronAPI.contextMenu();
  });

  // ── Toolbar button clicks ──────────────────────────────────────────────────
  canvas.addEventListener('click', (e) => {
    const idx = toolbarHitTest(e.offsetX, e.offsetY);
    if (idx < 0) return;
    const btn = TB_BTNS[idx];
    window.electronAPI.toolbarAction(btn.action);

    // Show feedback message
    const msgs = {
      feed:     '🍖 Nom nom!',
      medicine: '💊 Feel better!',
      train:    '💪 Training!',
      battle:   '⚔️ Fight!',
    };
    showMessage(msgs[btn.action] || '...', 2000);
  });

  // ── IPC draw loop ──────────────────────────────────────────────────────────
  window.electronAPI.onDraw((state) => {
    currentState = state;
    render(state);
  });

  // ── Listen for message events from main ───────────────────────────────────
  window.electronAPI.onMessage((text) => {
    showMessage(text, 2500);
  });

  // ── Initial frame ─────────────────────────────────────────────────────────
  window.electronAPI.getInitState().then((state) => {
    if (state) { currentState = state; render(state); }
  });

})();
