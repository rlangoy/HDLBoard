// SPDX-License-Identifier: GPL-2.0-only
export type BoardLayout = 'single-column' | 'two-columns';
export const DEFAULT_BOARD_LAYOUT: BoardLayout = 'two-columns';

const STORAGE_KEY = 'hdlboard.board-layout.v1';

export function loadBoardLayout(): BoardLayout {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'single-column' || value === 'two-columns' ? value : DEFAULT_BOARD_LAYOUT;
  } catch {
    return DEFAULT_BOARD_LAYOUT;
  }
}

export function saveBoardLayout(layout: BoardLayout): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // The preference remains in effect for this session.
  }
}

/** Follow local preference changes from other tabs without writing them back. */
export function subscribeBoardLayout(onChange: (layout: BoardLayout) => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if ((event.key === STORAGE_KEY || event.key === null) && event.storageArea === window.localStorage) {
      onChange(loadBoardLayout());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}
