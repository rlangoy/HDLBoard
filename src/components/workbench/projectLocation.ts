// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where Open Project reads a project file from (docs/PROJECTS.md): what the student
 * typed, as an http(s) URL — absolute, or relative to the page, so a host can publish
 * projects next to HDLBoard — or as a file path, which only the Windows app can read.
 * Pure: no React, no DOM.
 */

export type ProjectLocation = { kind: 'url'; url: string } | { kind: 'path'; path: string };

export const PATH_NEEDS_DESKTOP =
  'A file path can only be opened in the Windows app. In a browser, use Upload File and select the project file with its files, or give a URL.';

/** Parses what was typed, against the address of the page; returns why it cannot be used, as a string. */
export function parseProjectLocation(input: string, pageUrl: string): ProjectLocation | string {
  const text = input.trim().replace(/^"(.*)"$/, '$1');
  if (text === '') return 'Enter the URL or path of a project file.';
  if (/^file:\/\//i.test(text)) return { kind: 'path', path: fileUrlToPath(text) };
  // C:\… or C:/…, and \\server\share\…
  if (/^[a-z]:[\\/]/i.test(text) || /^\\\\/.test(text)) return { kind: 'path', path: text };
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^https?:/i.test(text)) return 'Only http:// and https:// URLs, or a file path, can be opened.';
  let url: URL;
  try {
    url = new URL(text, pageUrl);
  } catch {
    return `"${text}" is not a valid URL.`;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http:// and https:// URLs can be opened.';
  return { kind: 'url', url: url.toString() };
}

function fileUrlToPath(fileUrl: string): string {
  let rest = decodeURIComponent(fileUrl.replace(/^file:\/\//i, ''));
  // file:///C:/x → C:/x ; file://server/share → \\server\share
  if (/^\/[a-z]:\//i.test(rest)) rest = rest.slice(1);
  else if (!rest.startsWith('/')) rest = `\\\\${rest}`;
  return rest.replace(/\//g, '\\');
}

/** Whether a project's location is a file path (opened in the Windows app), not a URL or a bare name. */
export function isFilePath(location: string): boolean {
  return /^[a-z]:[\\/]/i.test(location) || /^\\\\/.test(location);
}

/** The folder of a file path, without the trailing separator. */
export function folderOfPath(path: string): string {
  const cut = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return cut < 0 ? '' : path.slice(0, cut);
}

/** `name` in `folder`, with the separator the folder already uses. */
export function pathInFolder(folder: string, name: string): string {
  const separator = folder.includes('/') && !folder.includes('\\') ? '/' : '\\';
  return `${folder}${separator}${name}`;
}
