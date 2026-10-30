// SPDX-License-Identifier: GPL-2.0-only
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bitGroups, formatIoValue, groupHex, GroupedIoPanel } from './GroupedIoPanel';

describe('grouped board I/O', () => {
  it('keeps groups aligned to original bit positions for different board widths', () => {
    expect(bitGroups(10, 4)).toEqual([[9, 8], [7, 6, 5, 4], [3, 2, 1, 0]]);
    expect(bitGroups(10, 8)).toEqual([[9, 8], [7, 6, 5, 4, 3, 2, 1, 0]]);
    expect(bitGroups(16, 8)).toEqual([[15, 14, 13, 12, 11, 10, 9, 8], [7, 6, 5, 4, 3, 2, 1, 0]]);
  });

  it('formats the full underlying group with the required number of digits', () => {
    const bits = [1, 0, 0, 0, 1, 0, 0, 1, 1, 0] as const;
    expect(bitGroups(10, 8).map((group) => groupHex([...bits], group))).toEqual(['0x1', '0x91']);
    expect(bitGroups(10, 4).map((group) => groupHex([...bits], group))).toEqual(['0x1', '0x9', '0x1']);
  });

  it('formats the complete value in binary, hexadecimal and decimal', () => {
    const bits = [1, 0, 1, 0, 1, 0, 0, 0, 1, 0] as const;
    expect(formatIoValue([...bits], 'binary')).toBe('0100010101');
    expect(formatIoValue([...bits], 'hex')).toBe('1 15');
    expect(formatIoValue([...bits], 'decimal')).toBe('277');
    expect(formatIoValue([0, 0, 0, 0, 0], 'hex')).toBe('00');
    expect(formatIoValue([...Array(16).fill(0).map((_, i) => (i === 0 || i === 15 ? 1 : 0))], 'hex')).toBe('80 01');
    expect(formatIoValue(Array(60).fill(1), 'decimal')).toBe('1152921504606846975');
  });

  it('renders numbered switches ungrouped by default', () => {
    const html = renderToStaticMarkup(<GroupedIoPanel kind="switches" count={4} bits={[1, 0, 1, 0]} name="SW" title="Switches" />);
    expect(html).toContain('aria-label="SW2"');
    expect(html).not.toContain('pb-io-hex');
    expect(html).toContain('aria-label="SW Binary value">0101</output>');
    expect(html).toContain('aria-label="Switch display options"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows the full LED value alongside grouped values', () => {
    const html = renderToStaticMarkup(<GroupedIoPanel kind="leds" count={4} bits={[1, 1, 0, 0]} name="LEDR" title="LEDs" />);
    expect(html).toContain('aria-label="LEDR Binary value">0011</output>');
    expect(html).toContain('aria-label="LED display options"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('renders only the selected readout, binary first if several are stored', () => {
    const settings = (readouts: { binary: boolean; hexadecimal: boolean; decimal: boolean }) => ({ groupSize: 4 as const, visible: [0, 1, 2, 3], readouts });
    const render = (readouts: { binary: boolean; hexadecimal: boolean; decimal: boolean }) => renderToStaticMarkup(<GroupedIoPanel kind="leds" count={4} bits={[1, 1, 0, 0]} name="LEDR" title="LEDs" settings={settings(readouts)} />);
    const hex = render({ binary: false, hexadecimal: true, decimal: false });
    expect(hex).toContain('LEDR Hex:');
    expect(hex).toContain('aria-label="LEDR Hex value">3</output>');
    expect(hex).not.toContain('Hexadecimal');
    expect(render({ binary: false, hexadecimal: false, decimal: true })).toContain('LEDR Decimal value">3</output>');
    const all = render({ binary: true, hexadecimal: true, decimal: true });
    expect(all).toContain('LEDR Binary value">0011</output>');
    expect(all).not.toContain('LEDR Hex:');
    expect(all).not.toContain('LEDR Decimal:');
  });
});
