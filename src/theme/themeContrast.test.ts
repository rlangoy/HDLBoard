// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { describe, expect, it } from 'vitest';
import darkCss from './themes/dark.css?raw';
import { DARK_PREFIX, findValueIn, parseThemeBlocks } from './themeCss.testSupport';

const TEXT = 4.5;
const CONTROL = 3;
/** An unlit LED or segment must still read as a shape on its surface… */
const UNLIT_VISIBLE = 1.5;
/** …and a lit one must stand out at least this many times more. */
const LIT_OVER_UNLIT = 1.5;
const OPAQUE_HEX_LENGTH = '#rrggbb'.length;
const TRANSLUCENT_HEX_LENGTH = '#rrggbbaa'.length;
const HEX_COLOUR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;

const dark = parseThemeBlocks(darkCss, DARK_PREFIX);

/** A translucent variable as seen on screen: composited over an opaque base variable. */
interface Layer {
  readonly name: string;
  readonly over: string;
}

type Background = string | Layer;
type Pair = readonly [foreground: string, background: Background, minimum: number];

const selection: Layer = { name: '--wb-code-selection', over: '--wb-code-bg' };
const errorLine: Layer = { name: '--wb-diag-error-bg', over: '--wb-code-bg' };
const warningLine: Layer = { name: '--wb-diag-warning-bg', over: '--wb-code-bg' };
const occurrence: Layer = { name: '--wb-occ-bg', over: '--wb-code-bg' };

const PAIRS: readonly Pair[] = [
  ['--wb-text', '--wb-sidebar-bg', TEXT],
  ['--wb-text-muted', '--wb-sidebar-bg', TEXT],
  ['--wb-text', '--wb-dialog-bg', TEXT],
  ['--wb-text-body', '--wb-dialog-bg', TEXT],
  ['--wb-accent-ink', '--wb-sidebar-bg', TEXT],
  ['--wb-accent-dark-ink', '--wb-dialog-bg', TEXT],
  ['--wb-code-fg', '--wb-code-bg', TEXT],
  ['--wb-gutter-fg', '--wb-sidebar-bg', TEXT],
  ['--wb-syn-keyword', '--wb-code-bg', TEXT],
  ['--wb-syn-type', '--wb-code-bg', TEXT],
  ['--wb-syn-comment', '--wb-code-bg', TEXT],
  ['--wb-syn-string', '--wb-code-bg', TEXT],
  ['--wb-syn-number', '--wb-code-bg', TEXT],
  ['--wb-syn-punct', '--wb-code-bg', TEXT],
  ['--wb-syn-directive', '--wb-code-bg', TEXT],
  ['--wb-syn-system', '--wb-code-bg', TEXT],
  ['--wb-code-fg', selection, TEXT],
  ['--wb-syn-comment', selection, TEXT],
  ['--wb-syn-keyword', selection, TEXT],
  ['--wb-code-fg', errorLine, TEXT],
  ['--wb-diag-error-text', errorLine, TEXT],
  ['--wb-diag-warning-text', warningLine, TEXT],
  ['--wb-code-fg', occurrence, TEXT],
  ['--wb-code-fg', '--wb-find-current-bg', TEXT],
  ['--pb-label', '--pb-card-bg', TEXT],
  ['--pb-readout-fg', '--pb-readout-bg', TEXT],
  ['--pb-menu-text', '--pb-surface', TEXT],
  ['--wv-axis-text', '--wv-bg', TEXT],
  ['--wv-trace-bus-text', '--wv-bg', TEXT],
  ['--wb-text', '--wb-menu-bg', TEXT],
  ['--wb-dialog-callout-fg', '--wb-dialog-callout-bg', TEXT],
  ['--wb-projects-error-fg', '--wb-projects-error-bg', TEXT],
  ['--wb-console-line-fg', '--wb-console-bg', TEXT],
  ['--wv-tooltip-fg', '--wv-tooltip-bg', TEXT],
  ['--wb-header-bg-dark-ink', '--wv-report-band-button-primary-bg', TEXT],
  ['--wb-header-bg-dark-ink', '--wb-dialog-badge-bg', CONTROL],
  ['--wb-header-bg-dark-ink', '--wv-report-band-badge-bg', CONTROL],
  ['--pb-focus', '--pb-card-bg', CONTROL],
  ['--pb-sw-body-edge', '--pb-card-bg', CONTROL],
  ['--pb-led-ring', '--pb-card-bg', CONTROL],
];

/** [lit colour, unlit colour, surface they sit on]. */
const LIT_UNLIT: readonly (readonly [lit: string, unlit: string, surface: string])[] = [
  ['--pb-led-body', '--pb-led-off', '--pb-card-bg'],
  ['--pb-hex-seg-on', '--pb-hex-seg-off', '--pb-part-face'],
];

/** A variable's Dark value, as `selector` sees it (its own block, else the block that sets it). */
function hexColour(name: string, selector = ':root'): string {
  const value = findValueIn(dark, selector, name);
  if (value === undefined || !HEX_COLOUR.test(value)) throw new Error(`${name} must be #rrggbb or #rrggbbaa in ${selector}`);
  return value.toLowerCase();
}

function opaqueColour(name: string, selector = ':root'): string {
  const value = hexColour(name, selector);
  if (value.length !== OPAQUE_HEX_LENGTH) throw new Error(`${name} must be opaque (#rrggbb) in ${selector}`);
  return value;
}

/** Where each channel's two hex digits start in #rrggbbaa. */
const RED = 1;
const GREEN = 3;
const BLUE = 5;
const ALPHA = 7;
const CHANNEL_MAX = 255;
const HEX_BASE = 16;

function byte(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), HEX_BASE);
}

function alphaOf(hex: string): number {
  return hex.length === TRANSLUCENT_HEX_LENGTH ? byte(hex, ALPHA) / CHANNEL_MAX : 1;
}

/** Alpha-composites `top` (#rrggbbaa or #rrggbb) over the opaque `base`. */
function composite(top: string, base: string): string {
  const alpha = alphaOf(top);
  const mix = (offset: number) => Math.round(byte(top, offset) * alpha + byte(base, offset) * (1 - alpha));
  return `#${[RED, GREEN, BLUE].map((offset) => mix(offset).toString(HEX_BASE).padStart(2, '0')).join('')}`;
}

function rendered(background: Background): string {
  if (typeof background === 'string') return opaqueColour(background);
  return composite(hexColour(background.name), opaqueColour(background.over));
}

/** WCAG 2.2 relative luminance (https://www.w3.org/TR/WCAG22/#dfn-relative-luminance). */
function channel(hex: string, offset: number): number {
  const value = byte(hex, offset) / CHANNEL_MAX;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, RED) + 0.7152 * channel(hex, GREEN) + 0.0722 * channel(hex, BLUE);
}

/** WCAG 2.2 contrast ratio (https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio). */
function contrast(a: string, b: string): number {
  const [brighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (brighter + 0.05) / (darker + 0.05);
}

describe('Dark contrast', () => {
  it.each(PAIRS)('%s (pair %#) meets its minimum', (foreground, background, minimum) => {
    expect(contrast(opaqueColour(foreground), rendered(background))).toBeGreaterThanOrEqual(minimum);
  });

  const onSurface = (name: string, surface: string) => contrast(opaqueColour(name), opaqueColour(surface));

  it.each(LIT_UNLIT)('next to %s, the unlit %s stays visible on %s', (_, unlit, surface) => {
    expect(onSurface(unlit, surface)).toBeGreaterThanOrEqual(UNLIT_VISIBLE);
  });

  it.each(LIT_UNLIT)('%s is clearly stronger than %s', (lit, unlit, surface) => {
    expect(onSurface(lit, surface)).toBeGreaterThanOrEqual(onSurface(unlit, surface) * LIT_OVER_UNLIT);
  });
});

/** The Board I/O blocks whose variants override colours of the base .pb-ui block. */
const ACCENT_BLOCKS = ['.pb-ui', '.pb-ui.pb-accent-switches', '.pb-ui.pb-accent-keys', '.pb-ui.pb-accent-hex, .pb-ui.pb-accent-leds'];
const LED_BLOCKS = ['.pb-ui', '.pb-led--green', '.pb-led--amber'];

/** [foreground, background, minimum], read from one block with the base block's values beneath. */
const BLOCK_PAIRS: readonly Pair[] = [
  ['--pb-accent-title', '--pb-accent-head', TEXT],
  ['--pb-menu-selected-fg', '--pb-menu-selected', TEXT],
  ['--pb-menu-trigger-fg', '--pb-card-bg', TEXT],
  ['--wb-io-hidden-fg', '--pb-accent-title', TEXT],
  ['--pb-menu-focus', '--pb-surface', CONTROL],
];

describe('Dark contrast in every Board I/O variant', () => {
  const cases = ACCENT_BLOCKS.flatMap((selector) =>
    BLOCK_PAIRS.map(([foreground, background, minimum]) => ({ selector, foreground, background: background as string, minimum })));
  it.each(cases)('$selector: $foreground on $background', ({ selector, foreground, background, minimum }) => {
    expect(contrast(opaqueColour(foreground, selector), opaqueColour(background, selector))).toBeGreaterThanOrEqual(minimum);
  });

  const ledContrast = (selector: string, name: string) =>
    contrast(opaqueColour(name, selector), opaqueColour('--pb-card-bg', selector));

  it.each(LED_BLOCKS)('%s: an unlit LED stays visible', (selector) => {
    expect(ledContrast(selector, '--pb-led-off')).toBeGreaterThanOrEqual(UNLIT_VISIBLE);
  });

  it.each(LED_BLOCKS)('%s: a lit LED is clearly stronger than an unlit one', (selector) => {
    expect(ledContrast(selector, '--pb-led-body')).toBeGreaterThanOrEqual(ledContrast(selector, '--pb-led-off') * LIT_OVER_UNLIT);
  });

  it('the report selection label stays readable on the selection', () => {
    expect(contrast(opaqueColour('--wv-report-selection-span-fg'), opaqueColour('--wv-selection'))).toBeGreaterThanOrEqual(TEXT);
  });
});
