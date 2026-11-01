// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, it } from 'vitest';
import { APP_DEFAULTS_FILE, BUILT_IN_DEFAULTS, loadAppDefaults, parseAppDefaults, type FetchDefaults } from './appDefaults';

const answer = (status: number, text = ''): FetchDefaults => async () => ({ status, ok: status >= 200 && status < 300, text: async () => text });

describe('parseAppDefaults', () => {
  it('has bouncy pushbuttons on unless the file says otherwise', () => {
    expect(BUILT_IN_DEFAULTS.bouncyButtons).toBe(true);
    expect(parseAppDefaults('{}')).toEqual({ defaults: { bouncyButtons: true }, warnings: [] });
  });

  it('takes the file\'s bouncyButtons', () => {
    expect(parseAppDefaults('{ "bouncyButtons": false }').defaults.bouncyButtons).toBe(false);
    expect(parseAppDefaults('{ "$comment": "x", "bouncyButtons": true }')).toEqual({ defaults: { bouncyButtons: true }, warnings: [] });
  });

  it('warns about a mistyped value or an unknown setting and keeps the default', () => {
    const parsed = parseAppDefaults('{ "bouncyButtons": "no", "bouncy": false }');
    expect(parsed.defaults.bouncyButtons).toBe(true);
    expect(parsed.warnings).toEqual([
      `${APP_DEFAULTS_FILE}: bouncyButtons must be true or false.`,
      `${APP_DEFAULTS_FILE}: unknown setting "bouncy" was ignored.`,
    ]);
  });

  it('uses the built-in defaults for a file that is not a JSON object', () => {
    expect(parseAppDefaults('{ bouncyButtons: false').defaults).toEqual(BUILT_IN_DEFAULTS);
    expect(parseAppDefaults('{ bouncyButtons: false').warnings[0]).toMatch(/is not valid JSON/);
    expect(parseAppDefaults('[false]').warnings).toHaveLength(1);
  });
});

describe('loadAppDefaults', () => {
  it('reads the file next to the page', async () => {
    let asked = '';
    const parsed = await loadAppDefaults(async (url) => { asked = url; return { status: 200, ok: true, text: async () => '{"bouncyButtons":false}' }; });
    expect(asked).toBe('settings.json');
    expect(parsed).toEqual({ defaults: { bouncyButtons: false }, warnings: [] });
  });

  it('is quiet when there is no file, or the host answers with a page instead', async () => {
    expect(await loadAppDefaults(answer(404))).toEqual({ defaults: BUILT_IN_DEFAULTS, warnings: [] });
    expect(await loadAppDefaults(answer(200, '<!doctype html><html></html>'))).toEqual({ defaults: BUILT_IN_DEFAULTS, warnings: [] });
  });

  it('warns, and never throws, when the file cannot be read', async () => {
    expect((await loadAppDefaults(answer(500))).warnings).toEqual([`${APP_DEFAULTS_FILE} could not be loaded: HTTP 500.`]);
    const offline = await loadAppDefaults(async () => { throw new Error('offline'); });
    expect(offline).toEqual({ defaults: BUILT_IN_DEFAULTS, warnings: [`${APP_DEFAULTS_FILE} could not be loaded: offline.`] });
  });
});
