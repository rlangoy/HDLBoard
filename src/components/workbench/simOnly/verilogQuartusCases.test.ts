// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { checkOf, source } from './simOnly.testSupport';
import type { SimOnlyConstructId } from './types';

/**
 * Verilog shapes from the gplgpu project (an Altera DDR3 controller, VGA and drawing
 * engines) that the latch, delay and `$time` checks misread (docs/impl_sim_only_warnings.md
 * § 3.3, § 3.4). Every module was run through Quartus Prime 25.1 Lite (`quartus_map`,
 * Cyclone V 5CSEMA5F31C6); the label says what Quartus did.
 */

const latchesIn = (content: string): number[] =>
  checkOf([source('t.v', content)]).findings.filter((f) => f.construct === 'vlog-level-storage' && f.tier !== 'quiet').map((f) => f.line);

const B0 = "1'b0";

const LATCHES: [label: string, module: string, lines: number[]][] = [
  [
    'one bit per always in a generate for (no latch)',
    'module t #(parameter N = 4) (input [N-1:0] d, output reg [N-1:0] q);\n  genvar i;\n  generate for (i = 0; i < N; i = i + 1) begin : g\n    always @(*) q[i] = d[i];\n  end endgenerate\nendmodule',
    [],
  ],
  [
    'a genvar bit set on both branches of an if (no latch)',
    `module t (input [3:0] d, input e, output reg [3:0] q);\n  genvar i;\n  generate for (i = 0; i < 4; i = i + 1) begin : g\n    always @(*) if (e) q[i] = d[i]; else q[i] = ${B0};\n  end endgenerate\nendmodule`,
    [],
  ],
  [
    'a genvar bit set by an if without else (Warning 10240)',
    'module t (input [3:0] d, input e, output reg [3:0] q);\n  genvar i;\n  generate for (i = 0; i < 4; i = i + 1) begin : g\n    always @(*) if (e) q[i] = d[i];\n  end endgenerate\nendmodule',
    [4],
  ],
  [
    'a case on a concatenation that names every value (no latch)',
    "module t (input a, b, input [3:0] c, d, output reg [3:0] x);\n  always @* case ({a, b})\n    2'b00: x = c;\n    2'b01: x = d;\n    2'b10: x = ~c;\n    2'b11: x = ~d;\n  endcase\nendmodule",
    [],
  ],
  [
    'a case on a concatenation that misses a value (Warnings 10270, 10240)',
    "module t (input a, b, input [3:0] c, d, output reg [3:0] x);\n  always @* case ({a, b})\n    2'b00: x = c;\n    2'b01: x = d;\n    2'b10: x = ~c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'an if on a parameter: only the branch it picks is built (no latch)',
    'module t #(parameter R = 2) (input a, b, output reg x, output reg y);\n  always @* if (R == 2) x = a; else begin x = b; y = a; end\nendmodule',
    [],
  ],
  [
    'an if on a parameter whose branch keeps a value (Warning 10240)',
    'module t #(parameter R = 2) (input a, b, output reg x);\n  always @* if (R == 2) begin if (a) x = b; end else x = a;\nendmodule',
    [2],
  ],
  [
    'an if on a parameter an instance may override (no latch with R = 2; Warning 10240 in an instance with #(.R(1)))',
    'module t #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule',
    [2],
  ],
  [
    'an if on numbers the check need not evaluate: (!2) == 1 is false (Warning 10240)',
    'module t (input d, e, output reg q);\n  always @* if (!2 == 1) q = d; else if (e) q = d;\nendmodule',
    [2],
  ],
  [
    "an if on numbers of mixed signedness: 4'shF < 4'h1 compares unsigned, false (Warning 10240)",
    "module t (input d, e, output reg q);\n  always @* if (4'shF < 4'h1) q = d; else if (e) q = d;\nendmodule",
    [2],
  ],
  [
    'an if/else if on a string parameter: complete, or no assignment at all, for every value (no latch, also with ROWCOL and OTHER)',
    'module t #(parameter MODE = "COLROW") (input a, b, output reg x, output reg y);\n  always @* begin\n    if (MODE == "COLROW") begin x = a; y = b; end\n    else if (MODE == "ROWCOL") begin x = b; y = a; end\n  end\nendmodule',
    [],
  ],
  [
    'a loop bounded by a parameter in the other branch of an if on it (no latch, with W = 1 or #(.W(4)))',
    'module t #(parameter W = 1) (input [W-1:0] a, b, input e, output reg [W-1:0] x);\n  integer i;\n  always @* if (W == 1) x = e ? a : b; else for (i = 0; i < W; i = i + 1) x[i] = a[i] ^ b[i];\nendmodule',
    [],
  ],
  [
    'two if guards on different strings of one parameter (Warning 10240 in an instance with #(.MODE("B")))',
    'module t #(parameter MODE = "A") (input d, en, output reg q);\n  always @* begin\n    if (MODE == "A") q = d;\n    if (MODE == "B") if (en) q = d;\n  end\nendmodule',
    [2],
  ],
  [
    'a latch in the branch W = 1 takes, beside a loop in the other (Warning 10240)',
    'module t #(parameter W = 1) (input [W-1:0] d, input en, output reg [W-1:0] q);\n  integer i;\n  always @* if (W == 1) begin if (en) q = d; end else for (i = 0; i < W; i = i + 1) q[i] = d[i];\nendmodule',
    [3],
  ],
  [
    'a case whose selector a parameter widens: four labels miss values with #(.S(2)) (Warning 10240)',
    "module t #(parameter S = 1) (input [S-1:0] s, input a, b, c, output reg x);\n  always @* case ({s, a})\n    2'b00: x = b;\n    2'b01: x = c;\n    2'b10: x = ~b;\n    2'b11: x = ~c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'an if on a localparam no instance can change: only its branch is built (no latch)',
    'module t (input d, e, output reg q);\n  localparam ON = 1;\n  always @* if (ON) q = d; else if (e) q = d;\nendmodule',
    [],
  ],
  [
    '// synopsys full_case on a case that misses a value (no latch)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s) // synopsys full_case\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [],
  ],
  [
    '/* synopsys full_case parallel_case */ (no latch)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s) /* synopsys full_case parallel_case */\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [],
  ],
  [
    '(* full_case *) before the case (no latch)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* full_case *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [],
  ],
  [
    '// synopsys full_case on the line before the case (no latch)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @*\n    // synopsys full_case\n    case (s)\n      2'd0: x = a;\n      2'd1: x = b;\n      2'd2: x = c;\n    endcase\nendmodule",
    [],
  ],
  [
    'a full_case directive in an `ifdef branch that is not compiled (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s)\n`ifdef FOO\n    // synthesis full_case\n`endif\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'full_case as an attribute value, (* keep = "full_case" *) (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* keep = \"full_case\" *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'a full_case directive inside translate_off (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s)\n// synthesis translate_off\n    // synthesis full_case\n// synthesis translate_on\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'full_case inside a quoted attribute value, (* keep = "foo, full_case=bar" *) (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* keep = \"foo, full_case=bar\" *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    '// synopsys parallel_case alone (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s) // synopsys parallel_case\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'parts indexed by a parameter the check cannot work out, set on every path (no latch)',
    'module t #(parameter N = 8) (input [N-1:0] d, input e, output reg [N-1:0] q);\n  localparam H = $clog2(N) + 2;\n  always @* begin\n    q[H-1:0] = d[H-1:0];\n    if (e) q[N-1:H] = 0;\n    else q[N-1:H] = d[N-1:H];\n  end\nendmodule',
    [],
  ],
  [
    'a part indexed by such a parameter, set by an if without else (Warning 10240)',
    'module t #(parameter N = 8) (input [N-1:0] d, input e, output reg [N-1:0] q);\n  localparam H = $clog2(N) + 2;\n  always @* begin\n    q[H-1:0] = d[H-1:0];\n    if (e) q[N-1:H] = d[N-1:H];\n  end\nendmodule',
    [3],
  ],
];

describe('Verilog latches, as Quartus builds them', () => {
  test.each(LATCHES)('%s', (_label, module, lines) => {
    expect(latchesIn(module)).toEqual(lines);
  });
});

const constructsIn = (content: string): [SimOnlyConstructId, string][] =>
  checkOf([source('t.v', content)]).findings.map((f) => [f.construct, f.tier]);

/** Board ports, so a module with a delay is read as a design, not a testbench. */
const BOARD = 'input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR';

describe('delays and $time, as Quartus builds them', () => {
  test('q <= #1 d in a clocked block: a quiet note (Quartus drops the delay, no message)', () => {
    const module = `module t (${BOARD});\n  always @(posedge CLOCK_50 or negedge SW[9])\n    if (!SW[9]) LEDR <= 0;\n    else LEDR <= #1 SW;\nendmodule`;
    expect(constructsIn(module)).toEqual([['vlog-clocked-delay', 'quiet']]);
  });

  test('a # delay before a statement stays SIM-only (Quartus drops it too; the simulation waits)', () => {
    expect(constructsIn(`module t (${BOARD});\n  always @(SW) #1 LEDR = SW;\nendmodule`)).toContainEqual(['vlog-delay', 'never']);
  });

  test('$time printed by $write is no finding of its own (Warning 10175: ignored)', () => {
    const module = 'module t (input clk, d, output reg q);\n  always @(posedge clk) begin\n    q <= d;\n    if (d) $write($time);\n  end\nendmodule';
    expect(constructsIn(module)).toEqual([['vlog-display', 'quiet']]);
  });

  test('$time read by the design stays SIM-only (Error 10174)', () => {
    const module = 'module t (input clk, d, output reg q);\n  always @(posedge clk)\n    if ($time > 0) q <= d;\nendmodule';
    expect(constructsIn(module)).toEqual([['vlog-time', 'never']]);
  });
});
