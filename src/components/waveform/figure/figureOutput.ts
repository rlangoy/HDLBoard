// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Where a figure goes (docs/waveform_viewer_spec.md § 8.8): onto the clipboard as PNG and
 * SVG together – each program pastes the one it reads – or into an .svg or .png file.
 */

import { downloadBlob } from '../../workbench/download';
import type { MeasureText } from './figureContent';
import { figurePng, withResolution } from './figurePng';
import type { Figure } from './figureSvg';

const SVG_TYPE = 'image/svg+xml';
const PNG_TYPE = 'image/png';

/** A rough average letter width, as a share of the font size, for when no canvas is at hand. */
const AVERAGE_LETTER_EM = 0.6;

let measuringContext: CanvasRenderingContext2D | null = null;

/** Measures text with the browser's own fonts, as the SVG will be drawn. */
export const measureText: MeasureText = (text, font) => {
  measuringContext ??= document.createElement('canvas').getContext('2d');
  if (measuringContext === null) return text.length * font.size * AVERAGE_LETTER_EM;
  measuringContext.font = `${font.size}px ${font.family}`;
  return measuringContext.measureText(text).width;
};

/** Whether this browser can put SVG on the clipboard (Chrome 124 and later, for one). */
function clipboardTakesSvg(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof ClipboardItem.supports === 'function' && ClipboardItem.supports(SVG_TYPE);
}

/** What went onto the clipboard, or `failed` when nothing did. */
export type CopyResult = 'png+svg' | 'png' | 'failed';

/**
 * Puts the figure on the clipboard. The PNG is handed over as a promise, so the copy
 * still counts as part of the click while the PNG is being drawn. The clipboard needs
 * a secure page (https, localhost, the desktop app).
 */
export async function copyFigure(figure: Figure): Promise<CopyResult> {
  if (typeof ClipboardItem === 'undefined' || navigator.clipboard?.write === undefined) return 'failed';
  const withSvg = clipboardTakesSvg();
  const items: Record<string, Promise<Blob>> = { [PNG_TYPE]: figurePng(figure) };
  if (withSvg) items[SVG_TYPE] = Promise.resolve(new Blob([figure.svg], { type: SVG_TYPE }));
  try {
    await navigator.clipboard.write([new ClipboardItem(items)]);
    return withSvg ? 'png+svg' : 'png';
  } catch {
    return 'failed';
  }
}

/** The copy's outcome in words, for a status line. */
export const COPY_MESSAGES: Readonly<Record<CopyResult, string>> = {
  'png+svg': 'Copied as PNG and SVG.',
  png: 'Copied as PNG.',
  failed: 'Could not copy. Save it as PNG or SVG instead.',
};

export function saveFigureSvg(figure: Figure, baseName: string): void {
  downloadBlob(new Blob([figure.svg], { type: SVG_TYPE }), `${baseName}.svg`);
}

/** Saves the PNG with its resolution recorded, so it is placed at its printed size. */
export async function saveFigurePng(figure: Figure, baseName: string, dpi: number): Promise<void> {
  const png = new Uint8Array(await (await figurePng(figure)).arrayBuffer());
  downloadBlob(new Blob([withResolution(png, dpi)], { type: PNG_TYPE }), `${baseName}.png`);
}
