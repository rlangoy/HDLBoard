// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import type { Bit } from '../board';

/** The pin level of a button nobody is touching: `1` when active low. */
export const releasedLevel = (activeLow: boolean): Bit => (activeLow ? 1 : 0);

/** The pin level of a button, pressed or released. */
export const levelWhen = (pressed: boolean, activeLow: boolean): Bit =>
  pressed === activeLow ? 0 : 1;
