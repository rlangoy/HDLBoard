// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { SIGN_IN_CHANNEL } from '../../github/config';
import { cancelledError, SignInError } from '../../github/signInError';
import type { AuthorizationCallback } from '../../github/webFlow';
import { desktopBridge } from './desktop';

const WINDOW_NAME = 'hdlboard-github-sign-in';
const WINDOW_FEATURES = 'popup,width=520,height=760';

/**
 * Opens GitHub's sign-in page in a small window, or a blank one to send there once
 * the address is known. Called straight from a click, before any await, or the
 * browser blocks it. Null when blocked. The Windows app uses inAppGitHubWindow instead.
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

/** Where the one-click sign-in shows GitHub's "Authorize" page, and hears back. */
export interface AuthorizeWindow {
  /** Shows the page and answers GitHub's redirect back to HDLBoard. */
  authorize(url: string): Promise<AuthorizationCallback>;
  close(): void;
}

/** The browser's pop-up, opened at once: call it straight from the click. Throws when blocked. */
export function authorizeInPopup(signal: AbortSignal): AuthorizeWindow {
  const popup = openGitHubWindow();
  if (popup === null) throw new SignInError('popup-blocked', 'The browser blocked the GitHub window. Allow pop-ups for this page and try again.');
  const callback = waitForSignInCallback(signal);
  return {
    authorize: (url) => {
      popup.location.href = url;
      return callback;
    },
    close: () => popup.close(),
  };
}

/** The Windows app's GitHub window: a dialog over the app (winInstaller/electron/main.js). */
export interface InAppGitHubWindow {
  /** Shows a GitHub page, titled `title`; `onClosed` runs once the window is gone. */
  show(url: string, title: string, onClosed: () => void): void;
  /** The one-click sign-in in the dialog: GitHub's redirect to `callbackUrl` is caught, not loaded. Closing the window cancels. */
  authorizer(callbackUrl: string, signal: AbortSignal): AuthorizeWindow;
  close(): void;
}

/** Null in a browser, where openGitHubWindow is the GitHub window. */
export function inAppGitHubWindow(): InAppGitHubWindow | null {
  const bridge = desktopBridge();
  const open = bridge?.openGitHubWindow;
  const close = bridge?.closeGitHubWindow;
  if (!open || !close) return null;
  return {
    // Should the dialog fail, the user's own browser still serves the code sign-in.
    show: (url, title, onClosed) => void open(url, { title }).then(onClosed, () => openGitHubWindow(url)),
    authorizer: (callbackUrl, signal) => ({
      authorize: (url) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => {
            void close();
            reject(cancelledError());
          });
          open(url, { callbackUrl }).then((answer) => (answer === null ? reject(cancelledError()) : resolve(answer)), reject);
        }),
      close: () => void close(),
    }),
    close: () => void close(),
  };
}

/**
 * The Windows app's choice between its own GitHub dialog and the user's web browser
 * for the sign-in page (the GitHub dialog's checkbox). On until unticked: the browser
 * already has the user's GitHub sign-in, passkeys and passwords. Kept in localStorage,
 * which the desktop app keeps between launches; these two never throw.
 */
const SIGN_IN_IN_BROWSER_KEY = 'hdlboard.githubSignInInBrowser.v1';

export function loadSignInInBrowser(): boolean {
  try {
    return window.localStorage.getItem(SIGN_IN_IN_BROWSER_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function saveSignInInBrowser(inBrowser: boolean): void {
  try {
    window.localStorage.setItem(SIGN_IN_IN_BROWSER_KEY, String(inBrowser));
  } catch {
    // Only a convenience: the choice is simply not remembered.
  }
}
