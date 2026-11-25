// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { parseAppDefaults } from './appDefaults';
import { BOUNCY_BUTTONS, bouncyButtonsInEffect } from './useBouncyOption';

describe('bouncy pushbuttons in effect', () => {
  it('are off while settings.json loads', () => {
    expect(bouncyButtonsInEffect(null, null)).toBe(false);
  });

  it('follow settings.json', () => {
    expect(bouncyButtonsInEffect(null, false)).toBe(false);
  });

  it("are the student's own choice over the file", () => {
    expect(bouncyButtonsInEffect(true, false)).toBe(true);
  });

  it("are the student's own choice while the file loads", () => {
    expect(bouncyButtonsInEffect(true, null)).toBe(true);
  });

  it('are on with a settings.json that does not say', () => {
    expect(BOUNCY_BUTTONS.startupDefaultOf(parseAppDefaults('{}').defaults)).toBe(true);
  });
});
