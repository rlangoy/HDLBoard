// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where the GitHub access token is kept between page loads (docs/GITHUB.md).
 * The token is never written to a project, a gist, a URL or the console.
 */
export interface TokenStore {
  /** True when the token survives closing HDLBoard, so the user stays signed in. */
  readonly remembersAcrossRestarts: boolean;
  load(): Promise<string | null>;
  save(accessToken: string): Promise<void>;
  forget(): Promise<void>;
}

/** The Windows app's encrypted token file (winInstaller/electron/main.js). */
export interface DesktopTokenBridge {
  loadGitHubToken(): Promise<string | null>;
  saveGitHubToken(accessToken: string): Promise<boolean>;
  forgetGitHubToken(): Promise<boolean>;
}

const SESSION_KEY = 'hdlboard-github-token';

/**
 * In a browser: this tab only (sessionStorage), so a reload keeps the user signed in
 * and closing the tab signs out. Storage can be unavailable (private windows,
 * blocked site data); then the user simply signs in again after a reload.
 */
export function browserTokenStore(): TokenStore {
  return {
    remembersAcrossRestarts: false,
    load: async () => tryStorage(() => sessionStorage.getItem(SESSION_KEY), null),
    save: async (accessToken) => tryStorage(() => sessionStorage.setItem(SESSION_KEY, accessToken), undefined),
    forget: async () => tryStorage(() => sessionStorage.removeItem(SESSION_KEY), undefined),
  };
}

/** In the Windows app: encrypted for this Windows user (DPAPI), kept until Sign out. */
export function desktopTokenStore(bridge: DesktopTokenBridge): TokenStore {
  return {
    remembersAcrossRestarts: true,
    load: () => bridge.loadGitHubToken(),
    save: async (accessToken) => void (await bridge.saveGitHubToken(accessToken)),
    forget: async () => void (await bridge.forgetGitHubToken()),
  };
}

function tryStorage<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}
