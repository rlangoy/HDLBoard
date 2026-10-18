// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** Writing SVG as text: elements, attributes and numbers, with names and values escaped. Pure. */

import type { FigureFont } from './typography';

export type Attributes = Readonly<Record<string, string | number | undefined>>;

const DECIMALS = 2;

/** A coordinate with two decimals, trailing zeros dropped: a hundredth of a point is plenty. */
const num = (value: number): string => String(Number(value.toFixed(DECIMALS)));

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeXml = (text: string): string => text.replace(/[&<>"]/g, (c) => ESCAPES[c]);

function attributeText(attributes: Attributes): string {
  return Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${typeof value === 'number' ? num(value) : escapeXml(String(value))}"`)
    .join('');
}

/** An element; with no content it closes itself. */
export function element(name: string, attributes: Attributes, content = ''): string {
  const open = `<${name}${attributeText(attributes)}`;
  return content === '' ? `${open}/>` : `${open}>${content}</${name}>`;
}

/** The attributes that set a text element's font. */
export const fontAttributes = (font: FigureFont): Attributes => ({ 'font-family': font.family, 'font-size': font.size });

/** A text element: the text is escaped here. */
export const textElement = (attributes: Attributes, text: string): string => element('text', attributes, escapeXml(text));

/** Path data, built one piece at a time: `M x y H x2`, `M x y V y2`. */
export class PathData {
  private readonly parts: string[] = [];

  moveTo(x: number, y: number): this {
    this.parts.push(`M${num(x)} ${num(y)}`);
    return this;
  }

  horizontalTo(x: number): this {
    this.parts.push(`H${num(x)}`);
    return this;
  }

  verticalTo(y: number): this {
    this.parts.push(`V${num(y)}`);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.parts.push(`L${num(x)} ${num(y)}`);
    return this;
  }

  close(): this {
    this.parts.push('Z');
    return this;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  toString(): string {
    return this.parts.join('');
  }
}

/** A path element for `data`, or nothing when it is empty. */
export function pathElement(data: PathData, attributes: Attributes): string {
  return data.isEmpty ? '' : element('path', { d: data.toString(), ...attributes });
}
