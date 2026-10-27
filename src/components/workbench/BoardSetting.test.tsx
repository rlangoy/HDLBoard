// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BUILT_IN_CATALOG, builtInBoard } from '../../boards/boardCatalog';
import { BoardSetting } from './BoardSetting';
import { boardSummary } from './boardText';

it('summarizes the configured components, including multiplexed displays and reset', () => {
  expect(boardSummary(builtInBoard('de1-soc'))).toBe('10 LEDs, 6 HEX displays, 10 switches, 4 buttons');
  expect(boardSummary(builtInBoard('nexys-a7'))).toBe('16 LEDs, 8 HEX displays, 16 switches, 5 buttons, 1 reset button');
  const board = builtInBoard('de1-soc');
  expect(boardSummary({ ...board, ports: { ...board.ports, leds: { port: '', count: 0 }, switches: { port: '', count: 0 }, pushbuttons: { ...board.ports.pushbuttons, group: { kind: 'scalars', ports: [] } }, sevenSegment: { kind: 'independent', ports: [], width: 7, activeLow: true } } })).toBe('No LEDs, displays, switches or buttons configured');
});

it('shows the selected board information', () => {
  const html = renderToStaticMarkup(<BoardSetting boards={BUILT_IN_CATALOG} boardId="basys3" locked={false} onChange={() => {}} onViewSettings={() => {}} />);
  expect(html).toContain('Basys 3');
  expect(html).toContain('16 LEDs, 4 HEX displays, 16 switches, 5 buttons');
  expect(html).toContain('Manage board');
  expect(html).toContain('Board definitions');
  expect(html).toContain('I/O examples');
});

it('marks a missing board without showing an installed-board icon', () => {
  const html = renderToStaticMarkup(<BoardSetting boards={BUILT_IN_CATALOG} boardId="missing" locked={false} onChange={() => {}} />);
  expect(html).toContain('not installed');
  expect(html).not.toContain('wb-board-select__icon');
  expect(html).not.toContain('Add or manage boards in Board settings');
  expect(html).toContain('Edit boards/boards.json');
});
