// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useEffect, useRef, useState } from 'react';
import { desktopBridge, updatesManagedBy } from './desktop';
import { errorText } from './errorText';
import { fetchLatestRelease, type Release } from './latestRelease';
import { isNewerVersion } from './releaseVersion';
import { loadStoredChoice, saveStoredChoice } from './storedChoice';

/**
 * Settings › Updates › Check for updates: whether HDLBoard asks GitHub for its
 * latest release when it starts. The user's choice is kept in this browser, like
 * the dialog's other preferences; until they make one, it is on in the Windows
 * app, which has no other way to hear of a new version, and off in a browser.
 * In the snap there is no check at all: snapd installs new versions itself, and a
 * release found on GitHub reaches the Snap Store only later (updatesManagedBy).
 */

const STORAGE_KEY = 'hdlboard.updates.check';

/** What the last check found. */
export type UpdateStatus =
  | { readonly kind: 'unchecked' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'upToDate'; readonly latest: Release }
  | { readonly kind: 'available'; readonly latest: Release }
  | { readonly kind: 'failed'; readonly reason: string };

/** The stored choice, or null when the user has not made one. Never throws. */
export function loadUpdateCheckChoice(): boolean | null {
  return loadStoredChoice(STORAGE_KEY);
}

export function saveUpdateCheckChoice(on: boolean): void {
  saveStoredChoice(STORAGE_KEY, on);
}

/** On in the Windows app (it has the desktop bridge), off in a browser. */
export function defaultUpdateCheck(): boolean {
  return desktopBridge() !== undefined;
}

/** Off, whatever was stored, where something else keeps the app up to date. */
export function updateCheckEnabled(): boolean {
  if (updatesManagedBy() !== null) return false;
  return loadUpdateCheckChoice() ?? defaultUpdateCheck();
}

/**
 * The newer release to tell about after a check: the one found, none when the check
 * found the version running is the latest, and the one known before while a check
 * is under way or has failed, so the bell does not go away under the user's cursor.
 */
export function newerReleaseAfter(status: UpdateStatus, known: Release | null): Release | null {
  if (status.kind === 'available') return status.latest;
  if (status.kind === 'upToDate') return null;
  return known;
}

/** Compares the latest release with the version running. */
export function statusOfRelease(latest: Release, runningVersion: string): UpdateStatus {
  return isNewerVersion(latest.version, runningVersion) ? { kind: 'available', latest } : { kind: 'upToDate', latest };
}

export interface UpdateCheck {
  /** Who keeps this copy up to date ('the Snap Store'), or null when the user does: then nothing here asks GitHub. */
  readonly managedBy: string | null;
  readonly enabled: boolean;
  /** Turning it on checks at once. */
  readonly setEnabled: (on: boolean) => void;
  readonly status: UpdateStatus;
  /** The newer release the bell tells about, if any (newerReleaseAfter). */
  readonly newerRelease: Release | null;
  /** Checks now, whether or not the start-up check is on (About › Check now). */
  readonly checkNow: () => void;
}

export function useUpdateCheck(
  runningVersion: string = __APP_VERSION__,
  fetchRelease: () => Promise<Release> = fetchLatestRelease,
): UpdateCheck {
  // Kept in state as well as storage, so a choice made this session holds even when storage is blocked.
  const [managedBy] = useState(updatesManagedBy);
  const [enabled, setEnabledState] = useState(updateCheckEnabled);
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'unchecked' });
  const [newerRelease, setNewerRelease] = useState<Release | null>(null);
  // Only the newest check's answer is shown, when a second one starts before the first is answered.
  const newestCheck = useRef(0);

  const checkNow = useCallback(() => {
    const check = ++newestCheck.current;
    setStatus({ kind: 'checking' });
    fetchRelease()
      .then(
        (latest) => statusOfRelease(latest, runningVersion),
        (error: unknown): UpdateStatus => ({ kind: 'failed', reason: errorText(error) }),
      )
      .then((found) => {
        if (check !== newestCheck.current) return;
        setStatus(found);
        setNewerRelease((known) => newerReleaseAfter(found, known));
      });
  }, [fetchRelease, runningVersion]);

  // The start-up check, once: the choice as the page opened, not as it is later.
  const checkAtStartUp = useRef(enabled);
  useEffect(() => {
    if (checkAtStartUp.current) checkNow();
    checkAtStartUp.current = false;
  }, [checkNow]);

  const setEnabled = useCallback((on: boolean) => {
    if (managedBy !== null) return;
    saveUpdateCheckChoice(on);
    setEnabledState(on);
    if (on) checkNow();
  }, [checkNow, managedBy]);

  return { managedBy, enabled, setEnabled, status, newerRelease, checkNow };
}
