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

const { contextBridge, ipcRenderer, webUtils } = require('electron');

const enabled = process.argv.includes('--hdlboard-persist');

const api = {
  enabled,
  /** Stored in <userData>/settings.json; takes effect on the next launch. */
  setEnabled: (value) => ipcRenderer.invoke('hdlboard:set-enabled', value === true),
};

// window.confirm's stand-in (desktop.ts confirmDialog): synchronous, like confirm itself.
api.confirm = (message) => ipcRenderer.sendSync('hdlboard:confirm', String(message)) === true;

// Open Project by a file path, and Save project back into its folder (docs/PROJECTS.md).
// Always there: they do not depend on workspace storage being on.
api.readLocalFile = (filePath) => ipcRenderer.invoke('hdlboard:read-local-file', String(filePath));
api.writeLocalFile = (filePath, text) => ipcRenderer.invoke('hdlboard:write-local-file', String(filePath), String(text));
// Save project's folder layout: a folder and a path relative to it (docs/impl_project_structure.md § 6.6).
api.listFolderFiles = (base, relative) => ipcRenderer.invoke('hdlboard:list-folder-files', String(base), String(relative));
api.deleteLocalFile = (base, relative) => ipcRenderer.invoke('hdlboard:delete-local-file', String(base), String(relative));
api.folderIsEmpty = (base, relative) => ipcRenderer.invoke('hdlboard:folder-is-empty', String(base), String(relative));
api.removeEmptyFolder = (base, relative) => ipcRenderer.invoke('hdlboard:remove-empty-folder', String(base), String(relative));
// Where a chosen or dropped file is on disk, so a project file opened with Upload File
// reads its files from its own folder without asking for it. '' for a file with no path
// (one taken out of a .zip).
api.pathForFile = (file) => {
  try {
    return webUtils.getPathForFile(file);
  } catch {
    return '';
  }
};

// The Projects page: the projects folder and the project files in it (docs/project_browse_page.md § 6.2).
api.listLocalProjects = () => ipcRenderer.invoke('hdlboard:list-local-projects');
api.chooseProjectsFolder = () => ipcRenderer.invoke('hdlboard:choose-projects-folder');
api.showInFolder = (filePath) => ipcRenderer.invoke('hdlboard:show-in-folder', String(filePath));

// GitHub sign-in, kept encrypted for this Windows user until Sign out (docs/GITHUB.md).
api.loadGitHubToken = () => ipcRenderer.invoke('hdlboard:load-github-token');
api.saveGitHubToken = (token) => ipcRenderer.invoke('hdlboard:save-github-token', String(token));
api.forgetGitHubToken = () => ipcRenderer.invoke('hdlboard:forget-github-token');
// GitHub's sign-in pages in a dialog of the app's own (main.js). Answers the web flow's
// callback, or null once the window is closed.
api.openGitHubWindow = (url, options = {}) =>
  ipcRenderer.invoke('hdlboard:open-github-window', String(url), {
    title: options.title === undefined ? undefined : String(options.title),
    callbackUrl: options.callbackUrl === undefined ? undefined : String(options.callbackUrl),
  });
api.closeGitHubWindow = () => ipcRenderer.invoke('hdlboard:close-github-window');

if (enabled) {
  api.saveWorkspace = (json) => ipcRenderer.invoke('hdlboard:save-workspace', String(json));
  api.loadWorkspace = () => ipcRenderer.invoke('hdlboard:load-workspace');
}

contextBridge.exposeInMainWorld('hdlboard', api);
