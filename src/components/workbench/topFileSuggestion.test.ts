// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { builtInBoard } from '../../boards/boardCatalog';
import { boardDesignPortNames, portKeysOf } from '../../boards/boardPorts';
import type { BoardDefinition } from '../../boards/types';
import { designView } from './simOnly/designView';
import { BOARD_PORTS, source, vhdlDesign } from './simOnly/simOnly.testSupport';
import { analyzeProject, type SourceFile } from './tbDetect/analyzeProject';
import { EMPTY_OVERRIDES, type TestbenchOverrides } from './tbDetect/types';
import { MAX_PORTS_NAMED, NO_DECLINED_FILES, topFileSuggestion, type DeclinedFiles } from './topFileSuggestion';

/** A design wired to the board: SW in, LEDR out. */
const boardDesign = (name: string, body = 'LEDR <= SW;') => source(`${name}.vhd`, vhdlDesign(name, BOARD_PORTS, body));

/** A board design that instantiates `child` (an entity of the same ports). */
const boardDesignUsing = (name: string, child: string) =>
  boardDesign(name, `u_${child}: entity work.${child} port map (LEDR => LEDR, SW => SW, CLOCK_50 => CLOCK_50);`);

/** A portless testbench that instantiates `dut`. */
const testbenchOf = (dut: string) =>
  source(
    `${dut}_tb.vhd`,
    `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${dut}_tb is\nend entity;\narchitecture sim of ${dut}_tb is\n  signal SW : std_logic_vector(9 downto 0);\n  signal LEDR : std_logic_vector(9 downto 0);\nbegin\n  dut: entity work.${dut} port map (SW => SW, LEDR => LEDR, CLOCK_50 => '0');\n  process\n  begin\n    SW <= (others => '1');\n    wait for 10 ns;\n    assert LEDR = SW report "mismatch";\n    wait;\n  end process;\nend architecture;\n`,
  );

const verilogBoardDesign = (name: string) =>
  source(`${name}.v`, `module ${name}(input [9:0] SW, output [9:0] LEDR);\n  assign LEDR = SW;\nendmodule\n`);

interface Asked {
  readonly files: readonly SourceFile[];
  readonly shown: string | null;
  readonly top: string | null;
  readonly topUnit?: string | null;
  readonly overrides?: TestbenchOverrides;
  readonly declined?: DeclinedFiles;
  /** The active board; the DE1-SoC unless a test says otherwise. */
  readonly board?: BoardDefinition;
}

const DE1_SOC = builtInBoard('de1-soc');

function suggest({ files, shown, top, topUnit = null, overrides = EMPTY_OVERRIDES, declined = NO_DECLINED_FILES, board = DE1_SOC }: Asked) {
  // As Workbench reads it: role detection by every board-design name, the offer by the active board's own.
  const { corrected, parts } = designView(analyzeProject(files, boardDesignPortNames(board)), overrides);
  return topFileSuggestion({
    project: corrected,
    overrides,
    parts,
    boardPorts: portKeysOf(board),
    shownFileId: shown,
    topFileId: top,
    topUnit,
    declined,
  });
}

const LAB1 = boardDesign('lab1');
const LAB2 = boardDesign('lab2');

describe('a file that looks like the Top-File', () => {
  test('is a board design shown while another one is top', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd' })?.fileId).toBe('lab2.vhd');
  });

  test('is suggested while no file is top', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: null })?.fileId).toBe('lab2.vhd');
  });

  test('is named with its entity', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd' })?.unitName).toBe('lab2');
  });

  test('is named with the board ports it uses, as written', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd' })?.boardPorts).toEqual(['LEDR', 'SW', 'CLOCK_50']);
  });

  test(`names at most ${MAX_PORTS_NAMED} board ports`, () => {
    const wide = source('wide.vhd', vhdlDesign('wide', `${BOARD_PORTS}; KEY : in std_logic_vector(3 downto 0)`, 'LEDR <= SW;'));
    expect(suggest({ files: [LAB1, wide], shown: 'wide.vhd', top: 'lab1.vhd' })?.boardPorts).toHaveLength(MAX_PORTS_NAMED);
  });

  test('is a board design its own testbench instantiates, while another design is top', () => {
    expect(suggest({ files: [LAB1, LAB2, testbenchOf('lab2')], shown: 'lab2.vhd', top: 'lab1.vhd' })?.fileId).toBe('lab2.vhd');
  });

  test('is a board design only a file the student marked Treat as testbench instantiates', () => {
    const files = [LAB1, LAB2, boardDesignUsing('wrapper', 'lab2')];
    const overrides: TestbenchOverrides = { ...EMPTY_OVERRIDES, roles: { 'wrapper.vhd': 'tb' } };
    expect(suggest({ files, shown: 'lab2.vhd', top: 'lab1.vhd', overrides })?.fileId).toBe('lab2.vhd');
  });

  test('can be a Verilog module', () => {
    const lab3 = verilogBoardDesign('lab3');
    expect(suggest({ files: [LAB1, lab3], shown: 'lab3.v', top: 'lab1.vhd' })?.fileId).toBe('lab3.v');
  });
});

describe('no suggestion', () => {
  test('when the shown file is the Top-File', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab1.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('when no file is shown', () => {
    expect(suggest({ files: [LAB1, LAB2], shown: null, top: 'lab1.vhd' })).toBeNull();
  });

  test('for a sub-entity of the top, even one with board ports', () => {
    const files = [boardDesignUsing('lab1', 'child'), boardDesign('child')];
    expect(suggest({ files, shown: 'child.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a sub-entity two levels down', () => {
    const files = [boardDesignUsing('lab1', 'middle'), boardDesignUsing('middle', 'leaf'), boardDesign('leaf')];
    expect(suggest({ files, shown: 'leaf.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a sub-entity of another design, which is not the top either', () => {
    const files = [LAB1, boardDesignUsing('lab2', 'child'), boardDesign('child')];
    expect(suggest({ files, shown: 'child.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a child of a file the student marked Treat as design', () => {
    const files = [LAB1, testbenchOf('lab2'), LAB2];
    const overrides: TestbenchOverrides = { ...EMPTY_OVERRIDES, roles: { 'lab2_tb.vhd': 'rtl' } };
    expect(suggest({ files, shown: 'lab2.vhd', top: 'lab1.vhd', overrides })).toBeNull();
  });

  test('for the design the top testbench tests', () => {
    expect(suggest({ files: [LAB2, testbenchOf('lab2')], shown: 'lab2.vhd', top: 'lab2_tb.vhd' })).toBeNull();
  });

  test('for a testbench', () => {
    expect(suggest({ files: [LAB1, LAB2, testbenchOf('lab2')], shown: 'lab2_tb.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a board design the student marked Treat as testbench', () => {
    const overrides: TestbenchOverrides = { ...EMPTY_OVERRIDES, roles: { 'lab2.vhd': 'tb' } };
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd', overrides })).toBeNull();
  });

  test('for a design without board ports', () => {
    const adder = source('adder.vhd', vhdlDesign('adder', 'a, b : in std_logic; s : out std_logic', 's <= a xor b;'));
    expect(suggest({ files: [LAB1, adder], shown: 'adder.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a file in work/', () => {
    const work: SourceFile = { ...LAB2, folder: 'work' };
    expect(suggest({ files: [LAB1, work], shown: 'lab2.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('for a file the student declined this session', () => {
    const declined = NO_DECLINED_FILES.with('lab2.vhd');
    expect(suggest({ files: [LAB1, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd', declined })).toBeNull();
  });
});

/** An entity with the board's ports and no architecture: the architecture is in another file. */
const entityOnly = (name: string) =>
  source(`${name}.vhd`, `library ieee;\nuse ieee.std_logic_1164.all;\nentity ${name} is\n  port (${BOARD_PORTS});\nend entity;\n`);

/** An architecture of `entity`, in a file of its own, that instantiates `child`. */
const architectureUsing = (entity: string, child: string) =>
  source(
    `${entity}_rtl.vhd`,
    `architecture rtl of ${entity} is\nbegin\n  u_${child}: entity work.${child} port map (LEDR => LEDR, SW => SW, CLOCK_50 => CLOCK_50);\nend architecture;\n`,
  );

describe('review: the unit the offer names and runs', () => {
  test('is the wrapper, not a board-facing helper declared before it in the same file', () => {
    const helperFirst = source('lab2.vhd', `${boardDesign('helper').content}\n${boardDesignUsing('lab2', 'helper').content}`);
    expect(suggest({ files: [LAB1, helperFirst], shown: 'lab2.vhd', top: 'lab1.vhd' })?.unitName).toBe('lab2');
  });
});

describe('review: the hierarchy of the Top-File', () => {
  test('includes an architecture written in another file than its entity', () => {
    const files = [entityOnly('lab1'), architectureUsing('lab1', 'child'), boardDesign('child')];
    expect(suggest({ files, shown: 'child.vhd', top: 'lab1.vhd' })).toBeNull();
  });

  test('includes a Verilog instance inside a generate if', () => {
    const top = source('top.v', 'module top(input [9:0] SW, output [9:0] LEDR);\ngenerate if (1) begin : enabled\n  child u_child (.SW(SW), .LEDR(LEDR));\nend endgenerate\nendmodule\n');
    const child = verilogBoardDesign('child');
    expect(suggest({ files: [top, child], shown: 'child.v', top: 'top.v' })).toBeNull();
  });

  test('starts from the unit Start runs, not from a testbench beside it in the Top-File', () => {
    const top = source('lab1.vhd', `${LAB1.content}\n${testbenchOf('lab2').content}`);
    expect(suggest({ files: [top, LAB2], shown: 'lab2.vhd', top: 'lab1.vhd', topUnit: 'lab1' })?.fileId).toBe('lab2.vhd');
  });
});

describe('review: the board ports named as evidence', () => {
  test('are the active board’s own: DE1-SoC names on a Basys 3 are no reason to offer', () => {
    const de1Names = source('old.vhd', vhdlDesign('old', 'CLOCK_50 : in std_logic; HEX0_N : out std_logic_vector(6 downto 0)', ''));
    expect(suggest({ files: [LAB1, de1Names], shown: 'old.vhd', top: 'lab1.vhd', board: builtInBoard('basys3') })).toBeNull();
  });

  test('are never a parameter that sizes a Verilog port', () => {
    const sized = source('sized.v', 'module sized #(parameter SW = 8)(input [SW-1:0] data);\nendmodule\n');
    expect(suggest({ files: [LAB1, sized], shown: 'sized.v', top: 'lab1.vhd' })).toBeNull();
  });
});

describe('the declined files', () => {
  test('start empty', () => {
    expect(NO_DECLINED_FILES.has('lab2.vhd')).toBe(false);
  });

  test('leave the set they grew from unchanged', () => {
    NO_DECLINED_FILES.with('lab2.vhd');
    expect(NO_DECLINED_FILES.has('lab2.vhd')).toBe(false);
  });
});
