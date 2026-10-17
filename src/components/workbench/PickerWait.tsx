// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useCallback, useState } from 'react';
import './PickerWait.css';

/**
 * While the browser's own file or folder window is open, and for the time after it
 * closes until the page has what was chosen. Chrome can take several seconds to hand
 * over files picked from a large folder, and without this the page looks as if the
 * click did nothing.
 *
 * - 'choosing': the browser's window is (still) open.
 * - 'reading': it has closed — the page got its focus back — and the files are on the way.
 */
export type PickerPhase = 'choosing' | 'reading';

export interface PickerWait {
  readonly phase: PickerPhase | null;
  /** Runs `work` (the picker and the reading after it) with the notice shown; resolves as `work` does. */
  wait<T>(work: () => Promise<T>): Promise<T>;
}

export function usePickerWait(): PickerWait {
  const [phase, setPhase] = useState<PickerPhase | null>(null);
  const wait = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    setPhase('choosing');
    // The native window takes the focus; the page gets it back when the window closes.
    const onFocus = () => setPhase((now) => (now === null ? null : 'reading'));
    window.addEventListener('focus', onFocus);
    const done = () => {
      window.removeEventListener('focus', onFocus);
      setPhase(null);
    };
    let started: Promise<T>;
    try {
      started = work();
    } catch (err) {
      done();
      return Promise.reject(err);
    }
    return started.finally(done);
  }, []);
  return { phase, wait };
}

const TEXT: Record<PickerPhase, string> = {
  choosing: 'Choose in the window that opened…',
  reading: 'Opening what you chose…',
};

/** A small notice with a spinner over the page, for `usePickerWait`'s phase. */
export function PickerWaitNotice({ phase }: { readonly phase: PickerPhase | null }) {
  if (phase === null) return null;
  return (
    <div className={`wb-picker-wait is-${phase}`} role="status" aria-live="polite">
      <div className="wb-picker-wait__card">
        <span className="wb-picker-wait__spinner" aria-hidden="true" />
        <span>
          {TEXT[phase]}
          {phase === 'reading' && <span className="wb-picker-wait__hint">This can take a few seconds.</span>}
        </span>
      </div>
    </div>
  );
}
