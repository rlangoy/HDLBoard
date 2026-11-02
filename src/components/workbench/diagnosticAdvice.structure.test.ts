// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Advice read from how the code is nested — declarations after `begin`, extra
 * `end`s, an architecture inside another, an unknown entity — through parse →
 * locate → advise with GHDL's own output (`ghdl -a --std=08`, GHDL 5.0.1 mcode, Windows).
 */

import { describe, expect, test } from 'vitest';
import { adviseDiagnostics, revealTarget, type AdvisedDiagnostic } from './diagnosticAdvice';
import { locateDiagnostics, type RunSnapshot } from './diagnosticLocation';
import { parseDiagnostics } from './diagnostics';

function advise(name: string, content: string, output: string): AdvisedDiagnostic[] {
  const snapshot: RunSnapshot = { files: [{ id: 'f', name, content }] };
  return adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot);
}

/** line → headline, for every error, muted or not. */
function headlines(advised: readonly AdvisedDiagnostic[]): Record<number, string | undefined> {
  return Object.fromEntries(advised.map((d) => [d.line, d.advice?.headline]));
}

const DE1_SOC = `library ieee;
use ieee.std_logic_1164.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    signal a : std_logic;
    signal b : std_logic;
    signal y : std_logic;

    a <= SW(0);
    b <= SW(1);

    y <= a and b;

    LEDR(0) <= y;
    LEDR(9 downto 1) <= (others => '0');
end architecture rtl;

end architecture;



end architecture;
`;

const DE1_SOC_OUTPUT =
  "top.vhd:26:5:error: unexpected token 'signal' in a concurrent statement list\n    signal a : std_logic;\n    ^\ntop.vhd:27:5:error: unexpected token 'signal' in a concurrent statement list\n    signal b : std_logic;\n    ^\ntop.vhd:28:5:error: unexpected token 'signal' in a concurrent statement list\n    signal y : std_logic;\n    ^\ntop.vhd:39:1:error: missing entity, architecture, package or configuration\nend architecture;\n^\ntop.vhd:43:1:error: missing entity, architecture, package or configuration\nend architecture;\n^\n";

describe('signals after the architecture’s begin, and extra ends', () => {
  const advised = advise('top.vhd', DE1_SOC, DE1_SOC_OUTPUT);

  test('each signal says it goes between is and begin, and points at the begin', () => {
    const begin = 'move this line above the `begin` on line 25.';
    expect(headlines(advised)).toMatchObject({
      26: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
      27: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
      28: `\`signal\` declarations go between \`is\` and \`begin\` — ${begin}`,
    });
    expect(advised.filter((d) => d.line <= 28).map((d) => d.advice?.relatedLine)).toEqual([25, 25, 25]);
  });

  test('none of them is muted as a follow-on: each is a mistake of its own', () => {
    expect(advised.map((d) => d.advice?.followOnOf)).toEqual([undefined, undefined, undefined, undefined, undefined]);
  });

  test('each extra end names the line that already closed the architecture', () => {
    const extra = 'Extra `end` — line 37 already closed the architecture. Delete this line.';
    expect(headlines(advised)).toMatchObject({ 39: extra, 43: extra });
    const line39 = advised.find((d) => d.line === 39);
    expect(line39?.advice?.span).toEqual({ start: 0, end: 'end architecture;'.length });
  });

  test('the editor goes to the begin the first signal should move above', () => {
    expect(revealTarget(advised)).toEqual({ fileId: 'f', line: 25 });
  });
});

describe('an architecture inside another architecture', () => {
  const HEADER = DE1_SOC.split('\n').slice(0, 24).join('\n');
  const NESTED = `${HEADER}

    signal a : std_logic;
    signal b : std_logic;
    signal y : std_logic;
begin


architecture rtl2 of DE1_SoC is

    signal a : std_logic;
    signal b : std_logic;
    signal y : std_logic;
begin

end architecture
    a <= SW(0);
    b <= SW(1);

    y <= a and b;

    LEDR(0) <= y;
    LEDR(9 downto 1) <= (others => '0');
end architecture rtl;





`;
  const OUTPUT =
    "nest.vhd:32:1:error: unexpected token 'architecture' in a concurrent statement list\narchitecture rtl2 of DE1_SoC is\n^\nnest.vhd:35:5:error: unexpected token 'signal' in a concurrent statement list\n    signal b : std_logic;\n    ^\nnest.vhd:36:5:error: unexpected token 'signal' in a concurrent statement list\n    signal y : std_logic;\n    ^\nnest.vhd:37:1:error: unexpected token 'begin' in a concurrent statement list\nbegin\n^\nnest.vhd:40:5:error: misspelling, \"rtl\" expected\n    a <= SW(0);\n    ^\nnest.vhd:40:6:error: missing \";\" at end of architecture\n    a <= SW(0);\n     ^\nnest.vhd:41:5:error: missing entity, architecture, package or configuration\n    b <= SW(1);\n    ^\nnest.vhd:43:5:error: missing entity, architecture, package or configuration\n    y <= a and b;\n    ^\nnest.vhd:45:5:error: missing entity, architecture, package or configuration\n    LEDR(0) <= y;\n    ^\nnest.vhd:46:5:error: missing entity, architecture, package or configuration\n    LEDR(9 downto 1) <= (others => '0');\n    ^\nnest.vhd:47:1:error: missing entity, architecture, package or configuration\nend architecture rtl;\n^\n";
  const advised = advise('nest.vhd', NESTED, OUTPUT);
  const first = advised[0];

  test('the inner architecture says what is wrong, on its own keyword', () => {
    expect(first.line).toBe(32);
    expect(first.advice?.headline).toBe(
      'An architecture cannot be placed inside another architecture — end `rtl` with `end architecture;` before this line.',
    );
    expect(first.advice?.span).toEqual({ start: 0, end: 'architecture'.length });
  });

  test('it points at the outer architecture: you are already inside it', () => {
    expect(first.advice?.relatedLine).toBe(24);
    expect(first.advice?.relatedNote).toBe('You are already inside this architecture.');
  });

  test('every later error is muted as caused by it — the signals too', () => {
    expect(advised.slice(1).map((d) => d.advice?.followOnOf)).toEqual(Array(advised.length - 1).fill(32));
  });

  test('without an architecture above, the headline names none', () => {
    const lone = advise('x.vhd', 'architecture b of e is', "x.vhd:1:1:error: unexpected token 'architecture' in a concurrent statement list\n");
    expect(lone[0].advice?.headline).toBe(
      'An architecture cannot be placed inside another architecture — end the one above with `end architecture;` before this line.',
    );
    expect(lone[0].advice?.relatedLine).toBeUndefined();
  });

  test('an entity inside an architecture', () => {
    const source = 'architecture rtl of e is\nbegin\nentity f is end;';
    const entity = advise('y.vhd', source, "y.vhd:3:1:error: unexpected token 'entity' in a concurrent statement list\n");
    expect(entity[0].advice?.headline).toBe(
      'An entity cannot be placed inside an architecture — end `rtl` with `end architecture;` before this line.',
    );
  });
});

describe('an architecture of an entity no file declares', () => {
  const HEADER = DE1_SOC.split('\n').slice(0, 23).join('\n');
  const UNKNOWN = `${HEADER}
architecture rtl of DE1_SdddoC is

    signal a : std_logic;
begin
    a <= SW(0);
end architecture rtl;
`;
  const OUTPUT =
    'unk.vhd:24:21:error: entity "DE1_SdddoC" was not analysed\narchitecture rtl of DE1_SdddoC is\n                    ^\n';

  test('says the entity is unknown, suggests the only one, and points at it', () => {
    const [unknown] = advise('unk.vhd', UNKNOWN, OUTPUT);
    expect(unknown.advice?.headline).toBe('Unknown entity `DE1_SdddoC` — did you mean `DE1_SoC` (line 9)?');
    expect(unknown.advice?.relatedLine).toBe(9);
    expect(unknown.advice?.span).toEqual({ start: 20, end: 30 });
  });

  test('offers a Quick Fix that writes the suggested entity', () => {
    const [unknown] = advise('unk.vhd', UNKNOWN, OUTPUT);
    expect(unknown.advice?.fix).toEqual({ kind: 'replaceEntityName', written: 'DE1_SdddoC', entity: 'DE1_SoC' });
  });

  const TWO_ENTITIES = 'entity counter is end;\nentity counter_tb is end;\narchitecture a of countr is begin end;';

  test('with several entities, the nearest name', () => {
    const [near] = advise('c.vhd', TWO_ENTITIES, 'c.vhd:3:19:error: entity "countr" was not analysed\n');
    expect(near.advice?.headline).toBe('Unknown entity `countr` — did you mean `counter` (line 1)?');
  });

  test('with several entities and none near, no guess', () => {
    const source = TWO_ENTITIES.replace('countr', 'blinker');
    const [far] = advise('c.vhd', source, 'c.vhd:3:19:error: entity "blinker" was not analysed\n');
    expect(far.advice?.headline).toBe('Unknown entity `blinker` — no file in the project declares an entity with that name.');
    expect(far.advice?.fix).toBeUndefined();
  });

  test('no Quick Fix when the header is split over two lines: it could not change the name', () => {
    const split = 'entity counter is end;\narchitecture a of countr\nis begin end;';
    const [near] = advise('c.vhd', split, 'c.vhd:2:19:error: entity "countr" was not analysed\n');
    expect([near.advice?.headline, near.advice?.fix]).toEqual(['Unknown entity `countr` — did you mean `counter` (line 1)?', undefined]);
  });

  test('an entity in another file is named without a line', () => {
    const snapshot: RunSnapshot = {
      files: [
        { id: 'a', name: 'a.vhd', content: 'architecture rtl of tope is begin end;' },
        { id: 'b', name: 'b.vhd', content: 'entity top is end;' },
      ],
    };
    const output = 'a.vhd:1:21:error: entity "tope" was not analysed\n';
    const [advised] = adviseDiagnostics(locateDiagnostics(parseDiagnostics(output), snapshot, snapshot.files), snapshot);
    expect(advised.advice?.headline).toBe('Unknown entity `tope` — did you mean `top`?');
    expect(advised.advice?.relatedLine).toBeUndefined();
  });

  test('an entity that exists but has an error stays a muted follow-on', () => {
    const source = 'entity e is port (a : inn bit); end;\narchitecture rtl of e is begin end;';
    const output =
      'm.vhd:1:23:error: no declaration for "inn"\nm.vhd:2:21:error: entity "e" was not analysed\n';
    const advised = advise('m.vhd', source, output);
    expect(advised[1].advice?.followOnOf).toBe(1);
  });

  test('not muted when another error comes first', () => {
    const source = 'entity e is end;\narchitecture rtl of ee is begin x <= couter; end;';
    const output = 'm.vhd:2:21:error: entity "ee" was not analysed\nm.vhd:2:31:error: no declaration for "couter"\n';
    expect(advise('m.vhd', source, output)[0].advice?.followOnOf).toBeUndefined();
  });
});

describe('other declarations after the architecture’s begin', () => {
  const SOURCE = `entity e is end;
architecture a of e is
begin
  variable v : integer;
  shared variable w : integer;
  impure function f return integer is begin return 1; end;
end;
`;
  const OUTPUT =
    "va.vhd:4:3:error: unexpected token 'variable' in a concurrent statement list\n  variable v : integer;\n  ^\nva.vhd:5:3:error: unexpected token 'shared' in a concurrent statement list\n  shared variable w : integer;\n  ^\nva.vhd:6:3:error: unexpected token 'impure' in a concurrent statement list\n  impure function f return integer is begin return 1; end;\n  ^\nva.vhd:7:1:error: missing entity, architecture, package or configuration\nend;\n^\n";
  const advised = headlines(advise('va.vhd', SOURCE, OUTPUT));

  test('a variable belongs in a process', () => {
    expect(advised[4]).toBe(
      'A `variable` can only be declared in a process, between `process` and `begin` — in the architecture, use a `signal`.',
    );
  });

  test('the end; the misplaced function leaves unmatched is caused by that function, not the first mistake', () => {
    const [last] = advise('va.vhd', SOURCE, OUTPUT).slice(-1);
    expect(last.advice?.headline).toBe('Probably caused by the error on line 6 — fix that one first and run again.');
  });

  test('shared variable and impure function are named in full', () => {
    expect([advised[5], advised[6]]).toEqual([
      '`shared variable` declarations go between `is` and `begin` — move this line above the `begin` on line 3.',
      '`impure function` declarations go between `is` and `begin` — move this line above the `begin` on line 3.',
    ]);
  });
});

describe('an architecture whose statements start without begin', () => {
  const NO_BEGIN = `${DE1_SOC.split('\n').slice(0, 23).join('\n')}
architecture rtl of DE1_SoC is

    -- LEDR <= SW; the first thing every student wires up.
    LED<= SW;

    -- Blank until you add your own 7-segment logic — active low, so
    -- all-ones is "off".
    HEX0_N <= (others => '1');
end architecture;
`;
  const OUTPUT =
    "nb.vhd:27:5:error: object class keyword such as 'variable' is expected\n    LED<= SW;\n    ^\nnb.vhd:31:5:error: 'begin' is expected instead of \"hex0_n\"\n    HEX0_N <= (others => '1');\n    ^\n";
  const [first, second] = advise('nb.vhd', NO_BEGIN, OUTPUT);

  test('says begin is missing before the assignment, and offers to insert it', () => {
    expect(first.advice).toMatchObject({
      headline: 'Missing `begin` — insert `begin` before this assignment.',
      fix: { kind: 'insertBegin' },
    });
  });

  test('GHDL asking for begin further down follows from it', () => {
    expect(second.advice?.followOnOf).toBe(27);
  });

  test.each([
    ['  p1: process begin wait; end process;', "object class keyword such as 'variable' is expected", 'process'],
    ['  u1: entity work.e port map (x => s, y => s);', "object class keyword such as 'variable' is expected", 'instance'],
    ['  with s select y <= x when others;', "'begin' is expected instead of 'with'", 'assignment'],
    ['  assert x = s;', "'begin' is expected instead of 'assert'", 'assertion'],
  ])('%s is named as a %s', (statement, message, kind) => {
    const source = `entity e is port (x : in bit; y : out bit); end;\narchitecture a of e is\n  signal s : bit;\n${statement}\nend;`;
    const [advised] = advise('q.vhd', source, `q.vhd:4:3:error: ${message}\n`);
    expect(advised.advice?.headline).toBe(`Missing \`begin\` — insert \`begin\` before this ${kind}.`);
  });

  test('a misspelled begn says begin is missing, and GHDL asking for begin later follows from it', () => {
    const source = "entity e is end;\narchitecture a of e is\n  signal s : bit;\n  begn\n  s <= '1';\nend;";
    const output =
      "nb5.vhd:4:3:error: object class keyword such as 'variable' is expected\n  begn\n  ^\nnb5.vhd:6:1:error: 'begin' is expected instead of 'end'\nend;\n^\n";
    expect(headlines(advise('nb5.vhd', source, output))).toEqual({
      4: 'Missing `begin` — `begn` is probably a misspelled `begin`.',
      6: 'Probably caused by the error on line 4 — fix that one first and run again.',
    });
  });

  describe('a word far from begin where begin belongs (begisasa)', () => {
    const SOURCE = `${DE1_SOC.split('\n').slice(0, 23).join('\n')}
architecture rtl of DE1_SoC is
begisasa
    -- LEDR <= SW; the first thing every student wires up.
    LEDR <= SW;

    -- Blank until you add your own 7-segment logic — active low, so
    -- all-ones is "off".
    HEX0_N <= (others => '1');
end architecture;
`;
    const OUTPUT =
      "bg.vhd:25:1:error: object class keyword such as 'variable' is expected\nbegisasa\n^\nbg.vhd:31:5:error: 'begin' is expected instead of \"hex0_n\"\n    HEX0_N <= (others => '1');\n    ^\n";
    const [first, second] = advise('bg.vhd', SOURCE, OUTPUT);

    test('says begin is missing and the word is probably it, misspelled', () => {
      expect(first.advice?.headline).toBe('Missing `begin` — `begisasa` is probably a misspelled `begin`.');
    });

    test('underlines the word and offers to replace it', () => {
      expect(first.advice).toMatchObject({ span: { start: 0, end: 'begisasa'.length }, fix: { kind: 'replaceWithBegin' } });
    });

    test('GHDL asking for begin later follows from it', () => {
      expect(second.advice?.followOnOf).toBe(25);
    });
  });

  test('a lone word before more declarations is no begin', () => {
    const source = 'entity e is end;\narchitecture a of e is\n  sgnal\n  signal t : bit;\nbegin\nend;';
    const [advised] = advise('d.vhd', source, "d.vhd:3:3:error: object class keyword such as 'variable' is expected\n");
    expect(advised.advice?.headline ?? '').not.toContain('Missing `begin`');
  });

  test('after a mistake in another architecture, GHDL asking for begin is named after the missing begin', () => {
    const source =
      'entity e is port (x : in bit; y : out bit); end;\narchitecture a of e is\nbegin\n  y <= x\nend;\n\narchitecture b of e is\n  signal s : bit;\n  s <= x;\n  y <= s;\nend;';
    const output =
      "two.vhd:4:9:error: ';' expected at end of signal assignment\n  y <= x\n        ^\ntwo.vhd:4:9:error: (found: 'end')\ntwo.vhd:9:3:error: object class keyword such as 'variable' is expected\n  s <= x;\n  ^\ntwo.vhd:10:3:error: 'begin' is expected instead of \"y\"\n  y <= s;\n  ^\n";
    expect(headlines(advise('two.vhd', source, output))).toMatchObject({
      9: 'Missing `begin` — insert `begin` before this assignment.',
      10: 'Probably caused by the error on line 9 — fix that one first and run again.',
    });
  });

  test('a misspelled declaration keyword is not taken for a statement', () => {
    const source = 'entity e is end;\narchitecture a of e is\n  sigal s : bit;\nbegin\nend;';
    const [advised] = advise('d.vhd', source, "d.vhd:3:3:error: object class keyword such as 'variable' is expected\n");
    expect(advised.advice?.headline).not.toContain('Missing `begin`');
  });
});

describe('declarations after a process’s begin', () => {
  const PROCESS = `entity e is end;
architecture a of e is
begin
  process
  begin
    variable v : integer;
    wait;
  end process;
  constant c : integer := 1;
end;
`;
  const OUTPUT =
    "p.vhd:6:5:error: declaration not allowed within statements\n    variable v : integer;\n    ^\np.vhd:9:3:error: unexpected token 'constant' in a concurrent statement list\n  constant c : integer := 1;\n  ^\n";

  test('a variable goes between process and begin; a constant after the process still in the architecture', () => {
    expect(headlines(advise('p.vhd', PROCESS, OUTPUT))).toEqual({
      6: '`variable` declarations go between `process` and `begin` — move this line above the `begin` on line 5.',
      9: '`constant` declarations go between `is` and `begin` — move this line above the `begin` on line 3.',
    });
  });

  const IN_IF = `library ieee; use ieee.std_logic_1164.all;
entity e is port (sw : in std_logic; q : out std_logic); end;
architecture a of e is
begin
  process(sw)
  begin
    if sw = '1' then
      signal z : std_logic;
      variable w : integer;
    end if;
  end process;
end;
`;
  const IN_IF_OUTPUT =
    'inif.vhd:8:7:error: declaration not allowed within statements\n      signal z : std_logic;\n      ^\ninif.vhd:9:7:error: declaration not allowed within statements\n      variable w : integer;\n      ^\n';

  const WITH_FUNCTION = `entity e is end;
architecture a of e is
begin
  process
    function f return integer is
    begin
      return 1;
    end function;
  begin
    variable v : integer;
    wait;
  end process;
end;
`;
  const WITH_FUNCTION_OUTPUT = 'pf.vhd:10:5:error: declaration not allowed within statements\n    variable v : integer;\n    ^\n';

  test('a function the process declares does not count as where the variable is', () => {
    expect(headlines(advise('pf.vhd', WITH_FUNCTION, WITH_FUNCTION_OUTPUT))).toEqual({
      10: '`variable` declarations go between `process` and `begin` — move this line above the `begin` on line 9.',
    });
  });

  test('a signal in a process belongs to the architecture', () => {
    expect(headlines(advise('inif.vhd', IN_IF, IN_IF_OUTPUT))).toEqual({
      8: 'A `signal` cannot be declared in a process — declare it in the architecture, above the `begin` on line 4.',
      9: '`variable` declarations go between `process` and `begin` — move this line above the `begin` on line 6.',
    });
  });
});
