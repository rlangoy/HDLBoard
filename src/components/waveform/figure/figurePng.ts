// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * A figure as PNG (docs/waveform_viewer_spec.md § 8.9): drawn from its SVG, so the two
 * never differ, at the figure's own pixel size. A report figure's PNG also carries its
 * resolution, so a word processor places it at its printed size instead of guessing.
 */

import { crc32 } from '../../workbench/zip';
import type { Figure } from './figureSvg';

const PNG_SIGNATURE_LENGTH = 8;
/** The IHDR chunk – length, type, 13 bytes of data, CRC – always comes first. */
const IHDR_CHUNK_LENGTH = 25;
const METRES_PER_INCH = 0.0254;

/** A chunk is its data's length, its type, the data, and a CRC of type and data. */
const TYPE_AT = 4;
const DATA_AT = 8;
const CRC_LENGTH = 4;
/** pHYs data: pixels per unit across and down, four bytes each, then one byte for the unit. */
const PHYS_TYPE = 'pHYs';
const PHYS_DATA_LENGTH = 9;
const UINT32_LENGTH = 4;
const PHYS_Y_AT = DATA_AT + UINT32_LENGTH;
const PHYS_UNIT_AT = PHYS_Y_AT + UINT32_LENGTH;
const PHYS_UNIT_METRE = 1;
const PHYS_CRC_AT = DATA_AT + PHYS_DATA_LENGTH;

/** Draws the SVG onto a canvas of the figure's pixel size and encodes it. */
export async function figurePng(figure: Figure): Promise<Blob> {
  const image = await loadSvg(figure.svg);
  const canvas = document.createElement('canvas');
  canvas.width = figure.pixelWidth;
  canvas.height = figure.pixelHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) throw new Error('The figure could not be drawn.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob === null ? reject(new Error('The figure could not be drawn.')) : resolve(blob)), 'image/png'));
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const image = new Image();
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The figure could not be drawn.'));
    image.src = url;
  }).finally(() => URL.revokeObjectURL(url));
}

/** The pHYs chunk: the same number of pixels per metre across and down. */
function physChunk(dpi: number): Uint8Array {
  const chunk = new Uint8Array(PHYS_CRC_AT + CRC_LENGTH);
  const view = new DataView(chunk.buffer);
  const pixelsPerMetre = Math.round(dpi / METRES_PER_INCH);
  view.setUint32(0, PHYS_DATA_LENGTH);
  chunk.set([...PHYS_TYPE].map((c) => c.charCodeAt(0)), TYPE_AT);
  view.setUint32(DATA_AT, pixelsPerMetre);
  view.setUint32(PHYS_Y_AT, pixelsPerMetre);
  view.setUint8(PHYS_UNIT_AT, PHYS_UNIT_METRE);
  view.setUint32(PHYS_CRC_AT, crc32(chunk.subarray(TYPE_AT, PHYS_CRC_AT)));
  return chunk;
}

/** The PNG with its resolution recorded, right after the IHDR chunk where PNG wants it. */
export function withResolution(png: Uint8Array, dpi: number): Uint8Array<ArrayBuffer> {
  const at = PNG_SIGNATURE_LENGTH + IHDR_CHUNK_LENGTH;
  const phys = physChunk(dpi);
  const result = new Uint8Array(png.length + phys.length);
  result.set(png.subarray(0, at));
  result.set(phys, at);
  result.set(png.subarray(at), at + phys.length);
  return result;
}
