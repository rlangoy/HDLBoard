// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/** The Board pane built from each board's shape (docs/board_io_v2_spec.md § 5.1, § 12.1). */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { builtInBoard, DEFAULT_BOARD } from '../../boards/boardCatalog';
import { decodeState, outputsOff, restInputs } from '../../boards/boardShape';
import type { BoardDefinition } from '../../boards/types';
import { BoardIoPanel } from './BoardIoPanel';

function render(board: BoardDefinition, outputs = outputsOff(board.ports)): string {
  return renderToStaticMarkup(<BoardIoPanel board={board} outputs={outputs} inputs={restInputs(board.ports)} onInputsChange={() => {}} />);
}

const count = (html: string, pattern: RegExp): number => html.match(pattern)?.length ?? 0;
const switchCount = (html: string) => count(html, /role="switch"/g);
const ledCount = (html: string) => count(html, /class="pb-ui pb-led[ "]/g);
const buttonCount = (html: string) => count(html, /class="pb-ui pb-key[ "]/g);
const displayCount = (html: string) => count(html, /class="pb-ui pb-hex[ "]/g);

describe('BoardIoPanel', () => {
  it.each([
    ['default', [10, 10, 4, 6]],
    ['de1-soc', [10, 10, 4, 6]],
    ['de10-lite', [10, 10, 2, 6]],
    ['basys3', [16, 16, 5, 4]],
    ['nexys-a7', [16, 16, 6, 8]],
  ])('draws %s with its switches, LEDs, buttons (and reset) and displays: %j', (id, counts) => {
    const html = render(builtInBoard(id));
    expect([switchCount(html), ledCount(html), buttonCount(html), displayCount(html)]).toEqual(counts);
  });

  it('draws a cross with each button named by its port and position', () => {
    const html = render(builtInBoard('basys3'));
    for (const name of ['btnC (centre)', 'btnU (up)', 'btnL (left)', 'btnR (right)', 'btnD (down)']) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(html).toContain('pb-cross__cell--up');
  });

  it('draws a reset button only on the Nexys A7', () => {
    expect(render(builtInBoard('nexys-a7'))).toContain('aria-label="CPU_RESETN (reset)"');
    for (const id of ['default', 'de10-lite', 'basys3']) expect(render(builtInBoard(id))).not.toContain('(reset)');
  });

  it('lights the decimal point on the DE10-Lite', () => {
    const board = builtInBoard('de10-lite');
    const pointOnDisplay0 = '0'.repeat(10) + '01111111' + '1'.repeat(40);
    const outputs = decodeState(board.ports, pointOnDisplay0);
    if (outputs === undefined) throw new Error('the test STATE does not fit the DE10-Lite');
    expect(count(render(board, outputs), /pb-hex__dp is-lit/g)).toBe(1);
    expect(count(render(DEFAULT_BOARD), /pb-hex__dp is-lit/g)).toBe(0);
  });

  it('heads each part with the board\'s own names', () => {
    const html = render(builtInBoard('basys3'));
    expect(html).toContain('LEDs (led[15:0])');
    expect(html).toContain('Switches (sw[15:0])');
    expect(html).toContain('Btn (btnC, btnU, btnL, btnR, btnD)');
    expect(html).toContain('7-seg (seg[6:0], dp, an[3:0])');
    expect(html).not.toContain('AN &lt;=');
    expect(render(builtInBoard('nexys-a7'))).not.toContain('AN &lt;=');
    expect(render(DEFAULT_BOARD)).toContain('7-seg (HEXn_N[6:0])');
  });

  it('provides collapse menus for displays and pushbuttons', () => {
    const html = render(DEFAULT_BOARD);
    expect(html).toContain('aria-label="7-Segment Displays options"');
    expect(html).toContain('aria-label="Pushbuttons options"');
  });

  it('shows only the saved display indices while retaining their original labels', () => {
    const board = builtInBoard('nexys-a7');
    const html = renderToStaticMarkup(<BoardIoPanel board={board} outputs={outputsOff(board.ports)} inputs={restInputs(board.ports)} onInputsChange={() => {}} displaySettings={{ sevenSegment: { visible: [0, 3, 7], visibilityCount: 8 } }} />);
    expect(displayCount(html)).toBe(3);
    expect(html).toContain('AN7');
    expect(html).toContain('AN3');
    expect(html).not.toContain('aria-label="AN6 ');
    expect(html).toContain('5 displays hidden');
  });
});

describe('BoardIoPanel pushbutton bounce', () => {
  const panel = (buttonBounce?: 'none' | 'bouncy') => {
    const board = builtInBoard('de1-soc');
    return renderToStaticMarkup(<BoardIoPanel board={board} outputs={outputsOff(board.ports)} inputs={restInputs(board.ports)} onInputsChange={() => {}} buttonBounce={buttonBounce} />);
  };

  it('shows no badge by default: the buttons act as they always did', () => {
    expect(panel()).not.toContain('pb-io-bouncy');
    expect(panel('none')).not.toContain('pb-io-bouncy');
  });

  it('marks the pushbutton panel "Bouncy" while the contacts bounce', () => {
    expect(panel('bouncy')).toMatch(/class="pb-io-bouncy"[^>]*>.*Bouncy<\/span>/);
  });
});
