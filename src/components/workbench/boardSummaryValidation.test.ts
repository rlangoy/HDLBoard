// SPDX-License-Identifier: GPL-2.0-only
import { expect, it } from 'vitest';
import { parseBoardFile } from '../../boards/parseBoards';
import { boardSummary } from './boardText';

it('normalizes omitted optional components and rejects malformed board data', () => {
  const board = { id: 'minimal', name: 'Minimal', ports: { clock: 'CLK', leds: { port: 'LED', count: 1 } } };
  const parse = (ports: object) => parseBoardFile(JSON.stringify({ version: 2, boards: [{ ...board, ports }] }), { fileName: 'boards.json', origin: 'user' });
  const valid = parse(board.ports);
  expect(valid.warnings).toEqual([]);
  expect(boardSummary(valid.boards[0])).toBe('1 LED');
  expect(valid.boards[0].ports.switches.count).toBe(0);
  for (const malformed of [{ leds: undefined }, { leds: {} }, { switches: {} }, { pushbuttons: {} }, { sevenSegment: { kind: 'independent' } }]) {
    const result = parse({ ...board.ports, ...malformed });
    expect(result.boards).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  }
});
