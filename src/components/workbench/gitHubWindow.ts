// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { SIGN_IN_CHANNEL } from '../../github/config';
import { cancelledError } from '../../github/signInError';
import type { AuthorizationCallback } from '../../github/webFlow';

const WINDOW_NAME = 'hdlboard-github-sign-in';
const WINDOW_FEATURES = 'popup,width=520,height=760';

/**
 * Opens GitHub's sign-in page in a small window, or a blank one to send there once
 * the address is known. Called straight from a click, before any await, or the
 * browser blocks it. Null when blocked — and always in the Windows app, which opens
 * GitHub in the user's own web browser instead (winInstaller/electron/main.js).
 */
export function openGitHubWindow(url = ''): Window | null {
  return window.open(url, WINDOW_NAME, WINDOW_FEATURES);
}

/**
 * Waits for public/github-callback.html to report back. A BroadcastChannel is
 * used because GitHub's pages cut the link between the two windows.
 */
export function waitForSignInCallback(signal: AbortSignal): Promise<AuthorizationCallback> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(SIGN_IN_CHANNEL);
    channel.onmessage = (event: MessageEvent<AuthorizationCallback>) => {
      channel.close();
      resolve(event.data);
    };
    signal.addEventListener('abort', () => {
      channel.close();
      reject(cancelledError());
    });
  });
}
