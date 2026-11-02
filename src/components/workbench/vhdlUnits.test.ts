// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { splitLines } from './textLines';
import { architectureHeaders, architectureLastLine, entityHeaders, sameName, suggestedEntityName } from './vhdlUnits';

const SOURCE = `entity DE1_SoC is
end entity;
-- architecture old of DE1_SoC is
  architecture rtl of DE1_SoC is
begin
  and_gate : block
  begin
  end block and_gate;
  p : process begin wait; end process;
end architecture rtl;

architecture RTL2 of de1_soc is begin end;
`;

describe('entityHeaders', () => {
  test('finds each entity and its line', () => {
    expect(entityHeaders(SOURCE)).toEqual([{ name: 'DE1_SoC', line: 1 }]);
  });
});

describe('architectureHeaders', () => {
  test('finds each architecture, not one in a comment', () => {
    expect(architectureHeaders(SOURCE).map(({ name, entity, line }) => ({ name, entity, line }))).toEqual([
      { name: 'rtl', entity: 'DE1_SoC', line: 4 },
      { name: 'RTL2', entity: 'de1_soc', line: 12 },
    ]);
  });

  test('says where the entity name starts', () => {
    expect(architectureHeaders(SOURCE)[0].entityStart).toBe('  architecture rtl of '.length);
  });
});

describe('architectureLastLine', () => {
  const lines = splitLines(SOURCE);

  test('is the end architecture line, past a block and a process', () => {
    expect(architectureLastLine(lines, 4)).toBe(10);
  });

  test('is the header itself for an architecture on one line', () => {
    expect(architectureLastLine(lines, 12)).toBe(12);
  });
});

describe('sameName', () => {
  test('ignores case, as VHDL does', () => {
    expect(sameName('DE1_SoC', 'de1_soc')).toBe(true);
  });
});

describe('suggestedEntityName', () => {
  test('the nearest name', () => {
    expect(suggestedEntityName('countr', ['counter', 'counter_tb_x'])).toBe('counter');
  });

  test('the only entity when none is near', () => {
    expect(suggestedEntityName('de1_soc_top', ['DE1_SoC'])).toBe('DE1_SoC');
  });

  test('none among several far ones', () => {
    expect(suggestedEntityName('blinker', ['counter', 'adder'])).toBeUndefined();
  });
});
