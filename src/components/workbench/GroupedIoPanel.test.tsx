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
    expect(formatIoValue([...bits], 'hex')).toBe('0x115');
    expect(formatIoValue([...bits], 'decimal')).toBe('277');
    expect(formatIoValue([0, 0, 0, 0, 0], 'hex')).toBe('0x00');
    expect(formatIoValue(Array(60).fill(1), 'decimal')).toBe('1152921504606846975');
  });

  it('renders numbered switches ungrouped by default', () => {
    const html = renderToStaticMarkup(<GroupedIoPanel kind="switches" count={4} bits={[1, 0, 1, 0]} name="SW" title="Switches" />);
    expect(html).toContain('aria-label="SW2"');
    expect(html).not.toContain('pb-io-hex');
    expect(html).toContain('aria-label="SW value">0101</output>');
    expect(html).toContain('aria-label="Switch display options"');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows the full LED value alongside grouped values', () => {
    const html = renderToStaticMarkup(<GroupedIoPanel kind="leds" count={4} bits={[1, 1, 0, 0]} name="LEDR" title="LEDs" />);
    expect(html).toContain('aria-label="LEDR value">0011</output>');
    expect(html).toContain('aria-label="LED display options"');
    expect(html).toContain('aria-expanded="false"');
  });
});
