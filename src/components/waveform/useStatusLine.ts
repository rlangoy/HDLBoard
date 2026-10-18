// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { useEffect, useState } from 'react';

const SHOWN_MS = 4000;

/** A short line that says how the last action went – "Copied as PNG and SVG." – cleared after a while. */
export function useStatusLine(): [string, (message: string) => void] {
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (status === '') return undefined;
    const timer = window.setTimeout(() => setStatus(''), SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [status]);
  return [status, setStatus];
}
