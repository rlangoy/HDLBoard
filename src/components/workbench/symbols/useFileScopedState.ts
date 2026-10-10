// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

interface Owned<T> {
  readonly fileId: string;
  readonly value: T | undefined;
}

/**
 * `useState` for something that belongs to one file, such as a cursor or pointer
 * position. A pane reuses its editor when it switches tabs, so a plain state would
 * carry the old file's position into the new one; this one reads as undefined as
 * soon as `fileId` changes. An update that returns the current value keeps the
 * state as it was, so React still skips the re-render.
 */
export function useFileScopedState<T>(fileId: string): [T | undefined, Dispatch<SetStateAction<T | undefined>>] {
  const [owned, setOwned] = useState<Owned<T>>({ fileId, value: undefined });
  const currentFileId = useRef(fileId);
  currentFileId.current = fileId;

  const setValue = useCallback(
    (action: SetStateAction<T | undefined>) =>
      setOwned((previous) => {
        const id = currentFileId.current;
        const current = previous.fileId === id ? previous.value : undefined;
        const next = action instanceof Function ? action(current) : action;
        return next === current && previous.fileId === id ? previous : { fileId: id, value: next };
      }),
    [],
  );

  return [owned.fileId === fileId ? owned.value : undefined, setValue];
}
