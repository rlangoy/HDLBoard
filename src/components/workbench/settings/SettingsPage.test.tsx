// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BUILT_IN_CATALOG } from '../../../boards/boardCatalog';
import { SettingsPage, type SettingsPageProps } from './SettingsPage';
import { PREFERENCE_SECTIONS, sectionLabel, SUPPORT_SECTIONS, type SettingsSectionId } from './settingsSections';

const ignore = () => undefined;
const setting = <T,>(value: T) => ({ value, onChange: ignore });

const PROPS: SettingsPageProps = {
  section: 'general',
  onSectionChange: ignore,
  onClose: ignore,
  general: { languages: setting(new Set(['vhdl'] as const)), keepProject: null },
  boardIo: {
    board: { boards: BUILT_IN_CATALOG, boardId: 'de1-soc', locked: false, onChange: ignore, onViewSettings: ignore },
    layout: setting('two-columns' as const),
    bouncyButtons: setting(true),
  },
  editor: { split: setting('auto' as const) },
  simulation: { recordWaves: setting(false) },
  updates: { checkAtStartUp: setting(true), check: { status: { kind: 'unchecked' }, onCheck: ignore } },
};

const render = (section: SettingsSectionId, props: Partial<SettingsPageProps> = {}) =>
  renderToStaticMarkup(<SettingsPage {...PROPS} {...props} section={section} />);

/** The visible text, without tags. */
const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** The text of every card title, in order. */
const cardTitles = (html: string) => [...html.matchAll(/<h3[^>]*class="wb-settings-card__title"[^>]*>([^<]*)</g)].map((match) => match[1]);

beforeEach(() => vi.stubGlobal('__APP_VERSION__', '1.6.3'));
afterEach(() => vi.unstubAllGlobals());

describe('the sidebar', () => {
  test('lists the settings, then Help & feedback', () => {
    const labels = [...render('general').matchAll(/class="wb-settings-nav__item"[^>]*>.*?<\/span>([^<]+)</g)].map((match) => match[1]);
    expect(labels).toEqual(['General', 'Board &amp; I/O', 'Editor', 'Simulation', 'Updates', 'Help &amp; feedback']);
  });

  test('marks the section shown as the current page', () => {
    expect(render('editor')).toMatch(/aria-current="page"[^>]*><span class="wb-settings-nav__icon">.*?<\/span>Editor</);
  });

  test('marks only one section', () => {
    expect(render('updates').match(/aria-current="page"/g)).toHaveLength(1);
  });

  test("shows the HDLBoard mark for Board & I/O", () => {
    expect(render('general')).toMatch(/<span class="wb-settings-nav__icon"><svg viewBox="0 0 32 32"[^>]*><path d="M8 4h16[^"]*"><\/path><\/svg><\/span>Board &amp; I\/O/);
  });

  test('offers the way back to the workspace', () => {
    expect(textOf(render('general'))).toContain('Back to workspace');
  });
});

describe('the header', () => {
  test('says changes need no saving', () => {
    expect(textOf(render('general'))).toContain('Changes are saved automatically');
  });

  test('has a status that announces only a save', () => {
    expect(render('general')).toContain('<span role="status"></span>Changes are saved automatically');
  });

  test('has no Done button: Back to workspace is the one way back', () => {
    expect(textOf(render('general'))).not.toContain('Done');
  });

  test('has the close button of the other full views', () => {
    expect(render('general')).toContain('class="hdl-close-button" aria-label="Close settings"');
  });
});

describe('each section', () => {
  test.each<[SettingsSectionId, string[]]>([
    ['general', ['Appearance', 'Languages']],
    ['board', ['Board', 'Board simulator layout', 'Pushbuttons']],
    ['editor', ['Testbench split view']],
    ['simulation', ['Waveforms']],
    ['updates', ['Updates']],
    ['help', ['Help us improve it', 'Reporting a bug?']],
  ])('%s shows its own cards', (section, titles) => {
    expect(cardTitles(render(section))).toEqual(titles);
  });

  test('labels the region with the section name', () => {
    expect(render('simulation')).toContain('role="region" aria-label="Simulation"');
  });
});

describe('General', () => {
  test('offers three appearances, each with a preview', () => {
    expect(render('general').match(/class="wb-theme-preview"/g)).toHaveLength(3);
  });

  test('previews System as a light and a dark window', () => {
    expect(render('general')).toMatch(/window--light.*?window--dark"[^]*?<\/span><\/span><span class="wb-settings__note">Follow/);
  });

  test('ticks the preferred languages only', () => {
    expect(render('general').match(/type="checkbox" checked=""/g)).toHaveLength(1);
  });
});

describe('Board & I/O', () => {
  test('selects the layout in use', () => {
    expect(render('board')).toMatch(/wb-settings-layout is-selected"><input type="radio"[^>]*checked="" value="two-columns"/);
  });

  test('shows the board details', () => {
    expect(textOf(render('board'))).toContain('Details: 10 LEDs, 6 HEX displays, 10 switches, 4 buttons');
  });

  test('offers Manage boards', () => {
    expect(textOf(render('board'))).toContain('Manage boards');
  });

  test('shows bouncy pushbuttons as a switch that is on', () => {
    expect(render('board')).toMatch(/<input type="checkbox" role="switch" class="wb-settings-switch__input" checked=""/);
  });
});

describe('Simulation', () => {
  test('shows waveform recording as a switch that is off', () => {
    expect(render('simulation')).toMatch(/<input type="checkbox" role="switch" class="wb-settings-switch__input"\/>/);
  });
});

describe('Updates', () => {
  test('names the version running here', () => {
    expect(textOf(render('updates'))).toContain('HDLBoard 1.6.3');
  });

  test('offers a check now', () => {
    expect(textOf(render('updates'))).toContain('Check now');
  });
});

describe('Help & feedback', () => {
  test('opens a bug report with its title started', () => {
    expect(render('help')).toContain('href="https://github.com/rlangoy/HDLBoard/issues/new?title=Bug%3A%20"');
  });

  test('opens a suggestion with its title started', () => {
    expect(render('help')).toContain('?title=Suggestion%3A%20"');
  });
});

describe('sectionLabel', () => {
  test.each([...PREFERENCE_SECTIONS, ...SUPPORT_SECTIONS])('names $id as $label', ({ id, label }) => {
    expect(sectionLabel(id)).toBe(label);
  });
});
