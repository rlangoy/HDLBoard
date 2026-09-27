// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The renderer's only door to the desktop: `window.hdlboard`.
 *
 * The preload runs sandboxed, so it has no `fs` of its own — every method
 * here is an IPC call that main.js answers. Whether project storage is on
 * was decided once, at startup, by main.js and handed over as a command-line
 * switch; when it is off, `saveWorkspace`/`loadWorkspace` are simply not
 * exposed (and main.js registers no handler for them), so the renderer's
 * feature detection hides the whole feature rather than a button over live
 * plumbing.
 */

const { contextBridge, ipcRenderer } = require('electron');

const enabled = process.argv.includes('--hdlboard-persist');

const api = {
  enabled,
  /** Stored in <userData>/settings.json; takes effect on the next launch. */
  setEnabled: (value) => ipcRenderer.invoke('hdlboard:set-enabled', value === true),
};

if (enabled) {
  api.saveWorkspace = (json) => ipcRenderer.invoke('hdlboard:save-workspace', String(json));
  api.loadWorkspace = () => ipcRenderer.invoke('hdlboard:load-workspace');
}

contextBridge.exposeInMainWorld('hdlboard', api);
