// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';
import { cx } from '../board';
import { copyText } from './clipboard';
import { CheckIcon, CopyIcon } from './icons';
import './PaneHeaderButton.css';

/** How long the check mark shows after a copy. */
const CONFIRMATION_MS = 1500;

type CopyState = 'idle' | 'copied' | 'failed';

const TITLE: Record<CopyState, string> = {
  idle: 'Copy the code',
  copied: 'Copied',
  failed: 'Could not copy — select the code and press Ctrl+C',
};

/** In a pane header, beside the file name: copies the whole file to the clipboard. */
export function CopyCodeButton({ fileName, code, label, visibleLabel }: { code: string; visibleLabel?: string } & ({ fileName: string; label?: never } | { label: string; fileName?: never })) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = window.setTimeout(() => setState('idle'), CONFIRMATION_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = async () => setState((await copyText(code)) ? 'copied' : 'failed');

  return (
    <span className="wb-copycode-control">
      <button
        type="button"
        className={cx('wb-copycode', state !== 'idle' && `is-${state}`)}
        aria-label={label ?? (fileName ? `Copy the code of ${fileName}` : TITLE.idle)}
        title={state === 'idle' && label ? label : TITLE[state]}
        onClick={() => void copy()}
      >
        {state === 'copied' ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
        {visibleLabel && <span>{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : visibleLabel}</span>}
      </button>
      <span className="wb-sr-only" role="status" aria-live="polite">
        {state === 'idle' ? '' : TITLE[state]}
      </span>
    </span>
  );
}
