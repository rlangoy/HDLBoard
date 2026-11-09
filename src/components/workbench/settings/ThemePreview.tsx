// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { ThemePreference } from '../../../theme/themePreference';

type Tone = 'light' | 'dark';

const WINDOW_CLASS: Readonly<Record<Tone, string>> = {
  light: 'wb-theme-preview__window wb-theme-preview__window--light',
  dark: 'wb-theme-preview__window wb-theme-preview__window--dark',
};

/** A tiny HDLBoard window in one theme: the header bar, the side bar and the editor. */
function MiniWindow({ tone }: { tone: Tone }) {
  return (
    <span className={WINDOW_CLASS[tone]}>
      <span className="wb-theme-preview__bar" />
      <span className="wb-theme-preview__side" />
      <span className="wb-theme-preview__editor" />
    </span>
  );
}

/** Settings › Appearance: what each choice looks like. System shows both, split on the diagonal. */
export function ThemePreview({ theme }: { theme: ThemePreference }) {
  return (
    <span className="wb-theme-preview" aria-hidden="true">
      {theme === 'dark' ? <MiniWindow tone="dark" /> : <MiniWindow tone="light" />}
      {theme === 'system' && <MiniWindow tone="dark" />}
    </span>
  );
}
