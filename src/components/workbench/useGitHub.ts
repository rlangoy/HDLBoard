// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthProxy, type AuthProxyConfig } from '../../github/authProxy';
import { SIGN_IN_CALLBACK_PAGE } from '../../github/config';
import { DeviceFlowSignIn, type DeviceCode } from '../../github/deviceFlow';
import { GitHubApiError } from '../../github/githubHttp';
import { openGitHubSession, type GitHubSession } from '../../github/session';
import { cancelledError, SignInError } from '../../github/signInError';
import type { TokenStore } from '../../github/tokenStore';
import { WebFlowSignIn } from '../../github/webFlow';
import { copyText } from './clipboard';
import { openGitHubWindow, waitForSignInCallback } from './gitHubWindow';

/** Where the sign-in is: what the GitHub dialog shows while signed out. */
export type SignInStep =
  | { kind: 'idle' }
  | { kind: 'restoring' }
  | { kind: 'starting' }
  | { kind: 'waiting-for-github' }
  | { kind: 'device-code'; code: DeviceCode };

export interface GitHubConnection {
  session: GitHubSession | null;
  step: SignInStep;
  /** Why the last sign-in failed, for the user. */
  error: string | null;
  /** The Windows app keeps the sign-in after it is closed; a browser tab does not. */
  remembersSignIn: boolean;
  /** Call when the GitHub dialog opens: reads the sign-in settings, and retries a stored sign-in. */
  prepare(): void;
  /** Must be called from a click: it may open a window. */
  signIn(): void;
  signInWithToken(accessToken: string): void;
  cancel(): void;
  signOut(): void;
}

const IDLE: SignInStep = { kind: 'idle' };

/**
 * The GitHub sign-in (docs/GITHUB.md). The device flow — paste a code on github.com —
 * works with every HDLBoard server and in the Windows app; when the server holds the
 * OAuth App's client secret, a browser gets the one-click web flow instead.
 */
export function useGitHub(authBaseUrl: string, tokenStore: TokenStore, isDesktop: boolean): GitHubConnection {
  const [session, setSession] = useState<GitHubSession | null>(null);
  const [step, setStep] = useState<SignInStep>(IDLE);
  const [error, setError] = useState<string | null>(null);
  const config = useRef<AuthProxyConfig | null>(null);
  const cancelSignIn = useRef<AbortController | null>(null);
  const proxy = useMemo(() => new AuthProxy(authBaseUrl), [authBaseUrl]);

  const startSession = useCallback(
    async (accessToken: string) => {
      const opened = await openGitHubSession(accessToken);
      await tokenStore.save(accessToken);
      setSession(opened);
    },
    [tokenStore],
  );

  const attempt = useCallback(async (nextStep: SignInStep, signIn: () => Promise<void>) => {
    setError(null);
    setStep(nextStep);
    try {
      await signIn();
    } catch (failure) {
      setError(messageFor(failure));
    } finally {
      setStep(IDLE);
    }
  }, []);

  const restore = useCallback(async () => {
    const storedToken = await tokenStore.load();
    if (storedToken === null) return;
    setStep({ kind: 'restoring' });
    try {
      await startSession(storedToken);
    } catch (failure) {
      if (failure instanceof GitHubApiError && failure.kind !== 'network') await tokenStore.forget();
    } finally {
      setStep(IDLE);
    }
  }, [tokenStore, startSession]);

  useEffect(() => void restore(), [restore]);

  const readConfig = useCallback(async () => {
    config.current ??= await proxy.readConfig();
    return config.current;
  }, [proxy]);

  const prepare = useCallback(() => {
    readConfig().catch(() => undefined);
    if (session === null && step.kind === 'idle') void restore();
  }, [readConfig, restore, session, step.kind]);

  const beginCancellable = () => {
    cancelSignIn.current = new AbortController();
    return cancelSignIn.current.signal;
  };

  // The window is opened before the first await, while the click still allows pop-ups.
  const signInWithWebFlow = (clientId: string) =>
    attempt({ kind: 'waiting-for-github' }, async () => {
      const githubWindow = openGitHubWindow();
      if (githubWindow === null) throw new SignInError('popup-blocked', 'The browser blocked the GitHub window. Allow pop-ups for this page and try again.');
      const signal = beginCancellable();
      const callback = waitForSignInCallback(signal);
      try {
        const webFlow = new WebFlowSignIn(clientId, callbackUrl(), proxy.post);
        const request = await webFlow.createRequest();
        githubWindow.location.href = request.url;
        await startSession(await webFlow.exchangeForToken(request, await callback));
      } finally {
        githubWindow.close();
      }
    });

  const signInWithDeviceCode = () =>
    attempt({ kind: 'starting' }, async () => {
      const githubWindow = isDesktop ? null : openGitHubWindow();
      try {
        const deviceFlow = new DeviceFlowSignIn((await readConfig()).clientId, proxy.post);
        const code = await deviceFlow.requestCode();
        setStep({ kind: 'device-code', code });
        if (githubWindow === null) openGitHubWindow(code.verificationUri);
        else githubWindow.location.href = code.verificationUri;
        // Not awaited: with the GitHub window in front, the clipboard may wait for focus that never comes.
        void copyText(code.userCode);
        await startSession(await deviceFlow.waitForAccessToken(code, beginCancellable()));
      } finally {
        githubWindow?.close();
      }
    });

  const signIn = () => {
    const known = config.current;
    if (known?.webFlow && !isDesktop) void signInWithWebFlow(known.clientId);
    else void signInWithDeviceCode();
  };

  const signInWithToken = (accessToken: string) => void attempt({ kind: 'starting' }, () => startSession(accessToken.trim()));

  const cancel = () => cancelSignIn.current?.abort(cancelledError());

  const signOut = () => {
    void tokenStore.forget();
    setSession(null);
    setError(null);
  };

  return { session, step, error, remembersSignIn: tokenStore.remembersAcrossRestarts, prepare, signIn, signInWithToken, cancel, signOut };
}

/** public/github-callback.html, next to the page: GitHub returns there after "Authorize". */
function callbackUrl(): string {
  return new URL(SIGN_IN_CALLBACK_PAGE, window.location.href.split(/[?#]/)[0]).toString();
}

/** A message for the user, or null when they cancelled and nothing needs saying. */
function messageFor(failure: unknown): string | null {
  if (failure instanceof SignInError && failure.kind === 'cancelled') return null;
  return failure instanceof Error ? failure.message : String(failure);
}
