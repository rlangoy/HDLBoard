// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy
import { describe, expect, it } from 'vitest';
import darkCss from './themes/dark.css?raw';
import { DARK_PREFIX, findValue, parseThemeBlocks } from './themeCss.testSupport';

const TEXT = 4.5;
const CONTROL = 3;
/** An unlit LED or segment must still read as a shape on its surface… */
const UNLIT_VISIBLE = 1.5;
/** …and a lit one must stand out at least this many times more. */
const LIT_OVER_UNLIT = 1.5;
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

function hexColour(name: string): string {
  const value = findValue(dark, name);
  if (value === undefined || !HEX_COLOUR.test(value)) throw new Error(`${name} must be #rrggbb or #rrggbbaa in dark.css`);
  return value.toLowerCase();
}

function opaqueColour(name: string): string {
  const value = hexColour(name);
  if (value.length !== 7) throw new Error(`${name} must be opaque (#rrggbb) in dark.css`);
  return value;
}

function byte(hex: string, offset: number): number {
  return parseInt(hex.slice(offset, offset + 2), 16);
}

/** Alpha-composites `top` (#rrggbbaa or #rrggbb) over the opaque `base`. */
function composite(top: string, base: string): string {
  const alpha = top.length === 9 ? byte(top, 7) / 255 : 1;
  const mix = (offset: number) => Math.round(byte(top, offset) * alpha + byte(base, offset) * (1 - alpha));
  return `#${[1, 3, 5].map((offset) => mix(offset).toString(16).padStart(2, '0')).join('')}`;
}

function rendered(background: Background): string {
  return typeof background === 'string' ? opaqueColour(background) : composite(hexColour(background.name), opaqueColour(background.over));
}

function channel(hex: string, offset: number): number {
  const value = byte(hex, offset) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

function contrast(a: string, b: string): number {
  const [brighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (brighter + 0.05) / (darker + 0.05);
}

describe('Dark contrast', () => {
  it.each(PAIRS)('%s (pair %#) meets its minimum', (foreground, background, minimum) => {
    expect(contrast(opaqueColour(foreground), rendered(background))).toBeGreaterThanOrEqual(minimum);
  });

  it.each(LIT_UNLIT)('%s is clearly stronger than %s, which stays visible', (lit, unlit, surface) => {
    const unlitContrast = contrast(opaqueColour(unlit), opaqueColour(surface));
    const litContrast = contrast(opaqueColour(lit), opaqueColour(surface));
    expect(unlitContrast).toBeGreaterThanOrEqual(UNLIT_VISIBLE);
    expect(litContrast).toBeGreaterThanOrEqual(unlitContrast * LIT_OVER_UNLIT);
  });
});
