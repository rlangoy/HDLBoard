// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { AboutDialog, UpdateStatusText } from './AboutDialog';
import type { Release } from './latestRelease';
import { UpdateBell } from './UpdateBell';
import type { UpdateStatus } from './useUpdateCheck';

const RELEASE: Release = { version: '1.6.3', name: 'HDLBoard 1.6.3', url: 'https://github.com/rlangoy/HDLBoard/releases/tag/v1.6.3' };

/** The visible text, without tags. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, '');

function bell(release: Release | null): string {
  return renderToStaticMarkup(<UpdateBell release={release} checkEnabled onCheckEnabledChange={() => undefined} />);
}

function aboutText(status: UpdateStatus): string {
  return textOf(renderToStaticMarkup(<UpdateStatusText status={status} onCheck={() => undefined} />));
}

describe('UpdateBell', () => {
  test('is not there without a newer release', () => {
    expect(bell(null)).toBe('');
  });

  test('shows a badge counting the one notice', () => {
    expect(bell(RELEASE)).toContain('<span class="wb-update__badge" aria-hidden="true">1</span>');
  });

  test('names the release for screen readers', () => {
    expect(bell(RELEASE)).toContain('aria-label="Update available: HDLBoard 1.6.3"');
  });

  test('keeps its notice closed until clicked', () => {
    expect(bell(RELEASE)).not.toContain('wb-update__notice');
  });
});

describe('About › Updates', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('offers a check before the first one', () => {
    expect(aboutText({ kind: 'unchecked' })).toBe('Not checked yet. Check now');
  });

  test('says when it is checking, and keeps its button', () => {
    expect(aboutText({ kind: 'checking' })).toBe('Asking GitHub for the latest release. Checking…');
  });

  test('marks the button inert while checking', () => {
    expect(renderToStaticMarkup(<UpdateStatusText status={{ kind: 'checking' }} onCheck={() => undefined} />)).toContain('aria-disabled="true"');
  });

  test('names the latest release when up to date', () => {
    expect(aboutText({ kind: 'upToDate', latest: { ...RELEASE, version: '1.6.1' } })).toBe(
      'Up to date — the latest release is v1.6.1. Check again',
    );
  });

  test('links the newer release', () => {
    expect(aboutText({ kind: 'available', latest: RELEASE })).toBe('v1.6.3 is available. View release Check again');
  });

  test('says why a check failed and offers another', () => {
    expect(aboutText({ kind: 'failed', reason: 'GitHub answered 403' })).toBe(
      'Could not check for updates (GitHub answered 403). Try again',
    );
  });

  test('has no Updates row when the dialog is given no update check', () => {
    vi.stubGlobal('__APP_VERSION__', '1.6.2');
    expect(renderToStaticMarkup(<AboutDialog open onClose={() => undefined} />)).not.toContain('Updates');
  });
});
