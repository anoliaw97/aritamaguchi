#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Creates all required icon assets in ../assets/ using only Node.js built-ins
 * (zlib for deflate compression). No canvas / sharp / jimp dependency needed.
 *
 * Outputs:
 *   assets/icon.png          512×512  (Linux + electron-builder base)
 *   assets/tray.png           16×16   (system tray)
 *   assets/icon.ico                   (Windows – multi-size: 16,32,48,256)
 *   assets/dmg-background.png 540×380 (macOS DMG window background)
 */

'use strict';

const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

// ── Colour palette ────────────────────────────────────────────────────────────
const BG    = [20,  10,  46,  255];  // deep purple
const BODY  = [192, 132, 252, 255];  // lavender
const DARK  = [147,  51, 234, 255];  // purple shade
const WHITE = [255, 255, 255, 255];
const CLEAR = [  0,   0,   0,   0];

// ── Tiny PNG encoder ──────────────────────────────────────────────────────────

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc     = Buffer.allocUnsafe(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crc]);
}

/**
 * Encode an RGBA pixel array into a PNG buffer.
 * @param {number} w  Width in pixels
 * @param {number} h  Height in pixels
 * @param {Uint8Array} rgba  Flat RGBA array (w*h*4 bytes)
 */
function encodePNG(w, h, rgba) {
  // Build raw scanlines: 1 filter byte (0=None) + w*4 RGBA bytes
  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (1 + w * 4) + 1 + x * 4;
      raw[di]     = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
      raw[di + 3] = rgba[si + 3];
    }
  }
  const deflated = zlib.deflateSync(raw, { level: 9 });

  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // colour type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflated),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Pixel drawing helpers ──────────────────────────────────────────────────────

function makePixels(w, h, fill = CLEAR) {
  const px = new Uint8Array(w * h * 4);
  if (fill !== CLEAR) {
    for (let i = 0; i < w * h; i++) {
      px[i*4]=fill[0]; px[i*4+1]=fill[1]; px[i*4+2]=fill[2]; px[i*4+3]=fill[3];
    }
  }
  return px;
}

function setPixel(px, w, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= px.length / (4 * w)) return;
  const i = (y * w + x) * 4;
  px[i]=color[0]; px[i+1]=color[1]; px[i+2]=color[2]; px[i+3]=color[3];
}

function fillRect(px, W, x, y, rw, rh, color) {
  for (let dy = 0; dy < rh; dy++)
    for (let dx = 0; dx < rw; dx++)
      setPixel(px, W, x+dx, y+dy, color);
}

function fillCircle(px, W, cx, cy, r, color) {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++)
      if (dx*dx + dy*dy <= r*r)
        setPixel(px, W, cx+dx, cy+dy, color);
}

function fillEllipse(px, W, cx, cy, rx, ry, color) {
  for (let dy = -ry; dy <= ry; dy++)
    for (let dx = -rx; dx <= rx; dx++)
      if ((dx*dx)/(rx*rx) + (dy*dy)/(ry*ry) <= 1)
        setPixel(px, W, cx+dx, cy+dy, color);
}

// Draw a simple egg/DigiTama shape: oval body + large eyes + spots
function drawDigiTama(px, W, H, scale = 1) {
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  const rx = Math.floor(scale * W * 0.22);
  const ry = Math.floor(scale * H * 0.28);

  // Body
  fillEllipse(px, W, cx, cy + Math.floor(scale * H * 0.03), rx, ry, BODY);
  // Shade (darker half)
  fillEllipse(px, W, cx + Math.floor(rx * 0.15), cy + Math.floor(scale * H * 0.04),
    Math.floor(rx * 0.7), Math.floor(ry * 0.7), DARK);
  // Highlight
  fillEllipse(px, W, cx - Math.floor(rx * 0.25), cy - Math.floor(ry * 0.2),
    Math.floor(rx * 0.35), Math.floor(ry * 0.25), WHITE);
  // Eyes
  const eyeR  = Math.max(2, Math.floor(scale * W * 0.05));
  const eyeOX = Math.floor(scale * W * 0.09);
  const eyeY  = cy - Math.floor(scale * H * 0.04);
  fillCircle(px, W, cx - eyeOX, eyeY, eyeR, [20, 10, 46, 255]);
  fillCircle(px, W, cx + eyeOX, eyeY, eyeR, [20, 10, 46, 255]);
  // Eye shines
  setPixel(px, W, cx - eyeOX + Math.ceil(eyeR*0.3), eyeY - Math.ceil(eyeR*0.3), WHITE);
  setPixel(px, W, cx + eyeOX + Math.ceil(eyeR*0.3), eyeY - Math.ceil(eyeR*0.3), WHITE);
  // Cheeks
  const cheekR = Math.max(1, Math.floor(scale * W * 0.04));
  fillCircle(px, W, cx - eyeOX - eyeR, eyeY + eyeR + 1, cheekR, [244, 114, 182, 140]);
  fillCircle(px, W, cx + eyeOX + eyeR, eyeY + eyeR + 1, cheekR, [244, 114, 182, 140]);
}

// ── Generate icon.png (512×512) ────────────────────────────────────────────────

function generateIconPNG() {
  const W = 512, H = 512;
  const px = makePixels(W, H, BG);

  // Outer glow ring
  fillCircle(px, W, W/2, H/2, 200, [100, 50, 180, 120]);
  fillCircle(px, W, W/2, H/2, 185, BG);

  drawDigiTama(px, W, H, 1.0);

  fs.writeFileSync(path.join(ASSETS, 'icon.png'), encodePNG(W, H, px));
  console.log('  ✔  assets/icon.png (512×512)');
}

// ── Generate tray.png (16×16) ─────────────────────────────────────────────────

function generateTrayPNG() {
  const W = 16, H = 16;
  const px = makePixels(W, H, CLEAR);
  drawDigiTama(px, W, H, 0.85);
  fs.writeFileSync(path.join(ASSETS, 'tray.png'), encodePNG(W, H, px));
  console.log('  ✔  assets/tray.png (16×16)');
}

// ── Generate dmg-background.png (540×380) ─────────────────────────────────────

function generateDmgBg() {
  const W = 540, H = 380;
  const px = makePixels(W, H);

  // Radial-ish gradient: dark purple → mid purple
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t  = y / H;
      const r  = Math.floor(20  + t * 30);
      const g  = Math.floor(10  + t * 10);
      const b  = Math.floor(46  + t * 40);
      setPixel(px, W, x, y, [r, g, b, 255]);
    }
  }

  // Decorative large ghost-circle
  fillCircle(px, W, W/2, H*0.45, 90, [100, 50, 180, 60]);

  // Small mascot in lower-left area
  drawDigiTama(px, W, Math.floor(W*0.35), Math.floor(H*0.7), 0.5);

  fs.writeFileSync(path.join(ASSETS, 'dmg-background.png'), encodePNG(W, H, px));
  console.log('  ✔  assets/dmg-background.png (540×380)');
}

// ── Generate icon.ico (Windows multi-size) ────────────────────────────────────

function generateICO() {
  // Sizes required by Windows: 16, 32, 48, 256
  const sizes = [16, 32, 48, 256];

  // Build each PNG
  const pngBufs = sizes.map(s => {
    const px = makePixels(s, s, BG);
    drawDigiTama(px, s, s, 0.85);
    return encodePNG(s, s, px);
  });

  // ICO header
  const count  = sizes.length;
  const headerSize = 6 + count * 16;
  let   offset = headerSize;

  const header = Buffer.allocUnsafe(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: ICO
  header.writeUInt16LE(count, 4);  // image count

  const entries = [];
  for (let i = 0; i < count; i++) {
    const s   = sizes[i];
    const buf = pngBufs[i];
    const e   = Buffer.allocUnsafe(16);
    e[0]  = s >= 256 ? 0 : s;  // width  (0 means 256)
    e[1]  = s >= 256 ? 0 : s;  // height
    e[2]  = 0;                  // colour count
    e[3]  = 0;                  // reserved
    e.writeUInt16LE(1,  4);     // colour planes
    e.writeUInt16LE(32, 6);     // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }

  const ico = Buffer.concat([header, ...entries, ...pngBufs]);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), ico);
  console.log('  ✔  assets/icon.ico (16, 32, 48, 256)');
}

// ── Run ───────────────────────────────────────────────────────────────────────

console.log('Generating icon assets...');
generateIconPNG();
generateTrayPNG();
generateDmgBg();
generateICO();
console.log('Done.');
