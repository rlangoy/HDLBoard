// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { createExplorerFolds, type ExplorerPane } from './explorerFolds';

/** An Explorer that is open or shut, as `show` leaves it. */
function explorerPane(open: boolean) {
  const pane = {
    collapsed: !open,
    show(next: boolean) {
      pane.collapsed = !next;
    },
  };
  return pane satisfies ExplorerPane;
}

/** Lets the releases settle, as they do after the update that made them. */
const settled = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe('createExplorerFolds', () => {
  test('folds the Explorer for the first holder', () => {
    const pane = explorerPane(true);
    createExplorerFolds(() => pane).hold('settings');
    expect(pane.collapsed).toBe(true);
  });

  test('opens it again once the last holder lets go', async () => {
    const pane = explorerPane(true);
    const folds = createExplorerFolds(() => pane);
    folds.hold('settings');
    folds.release('settings');
    await settled();
    expect(pane.collapsed).toBe(false);
  });

  test('keeps it shut when it was shut before', async () => {
    const pane = explorerPane(false);
    const folds = createExplorerFolds(() => pane);
    folds.hold('settings');
    folds.release('settings');
    await settled();
    expect(pane.collapsed).toBe(true);
  });

  test('keeps it folded from Settings to the waveform', async () => {
    const pane = explorerPane(true);
    const folds = createExplorerFolds(() => pane);
    folds.hold('settings');
    folds.hold('waveform');
    folds.release('settings');
    await settled();
    expect(pane.collapsed).toBe(true);
  });

  test('keeps it folded from the waveform to Settings, the release arriving first', async () => {
    const pane = explorerPane(true);
    const folds = createExplorerFolds(() => pane);
    folds.hold('waveform');
    folds.release('waveform');
    folds.hold('settings');
    await settled();
    expect(pane.collapsed).toBe(true);
  });

  test('remembers the Explorer as it was before the first view, through a handover', async () => {
    const pane = explorerPane(true);
    const folds = createExplorerFolds(() => pane);
    folds.hold('waveform');
    folds.release('waveform');
    folds.hold('settings');
    await settled();
    folds.release('settings');
    await settled();
    expect(pane.collapsed).toBe(false);
  });

  test('ignores a release from a view that never held it', async () => {
    const pane = explorerPane(true);
    const folds = createExplorerFolds(() => pane);
    folds.hold('settings');
    folds.release('waveform');
    await settled();
    expect(pane.collapsed).toBe(true);
  });
});
