/**
 * preload.js — Electron context bridge
 *
 * Exposes a safe, minimal API to the renderer process.
 * No Node.js APIs leak into the renderer.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ── Mouse passthrough ────────────────────────────────────────────────────
  // Tell main whether to forward or consume mouse events on transparent pixels
  setIgnoreMouse: (ignore) =>
    ipcRenderer.send('set-ignore-mouse', { ignore }),

  // ── Drag / throw (Shimeji style) ─────────────────────────────────────────
  dragStart: (screenX, screenY) => ipcRenderer.send('drag-start', { screenX, screenY }),
  dragMove:  (screenX, screenY) => ipcRenderer.send('drag-move',  { screenX, screenY }),
  dragEnd:   ()                  => ipcRenderer.send('drag-end'),

  // ── VPet interactions ────────────────────────────────────────────────────
  // Click/pet the character
  petAction: () => ipcRenderer.send('pet-action'),

  // Toolbar button clicked
  toolbarAction: (action) => ipcRenderer.send('toolbar-action', { action }),

  // Right-click → show tray context menu
  contextMenu: () => ipcRenderer.send('context-menu'),

  // ── State subscriptions ──────────────────────────────────────────────────
  // Receive draw state every ~16ms from main physics loop
  onDraw: (callback) =>
    ipcRenderer.on('draw', (_event, state) => callback(state)),

  // Receive speech bubble text messages from main
  onMessage: (callback) =>
    ipcRenderer.on('message', (_event, text) => callback(text)),

  // Get the current draw state once (used for first frame before loop starts)
  getInitState: () => ipcRenderer.invoke('get-init-state'),

  // ── Groq API key prompt ──────────────────────────────────────────────────
  saveGroqKey:  (key) => ipcRenderer.send('save-groq-key', { key }),
  openExternal: (url) => ipcRenderer.send('open-external', { url }),
});
