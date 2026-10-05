// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Puts text on the clipboard. The Clipboard API exists only in a secure context
 * (https, localhost, the desktop app); a page opened over plain http — the LAN
 * address of a classroom server, say — copies through a hidden selection instead.
 * Resolves to whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused (no permission, page not focused): try the selection below.
    }
  }
  return copyThroughSelection(text);
}

/** The pre-Clipboard-API way: select the text in a hidden textarea and run the copy command. */
function copyThroughSelection(text: string): boolean {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  focused?.focus();
  return copied;
}
