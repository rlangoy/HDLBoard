// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

import { describe, expect, test } from 'vitest';
import { EMPTY_OVERRIDES } from '../tbDetect/types';
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

/**
 * A top module that instantiates `instance` (the module and its overrides, `t #(.R(1))`) as
 * `u`. A module nothing overrides is built with its defaults; one an instance overrides is
 * checked for every value its parameters may take (parameterOverrides.ts).
 */
const top = (instance: string, ports: string, connections: string): string =>
  `module top (${ports});\n  ${instance} u (${connections});\nendmodule`;

const WIDENED_CASE =
  "module t #(parameter S = 1) (input [S-1:0] s, input a, b, c, output reg x);\n  always @* case ({s, a})\n    2'b00: x = b;\n    2'b01: x = c;\n    2'b10: x = ~b;\n    2'b11: x = ~c;\n  endcase\nendmodule";
/** A module that writes q[I] or q[1]: the same bit, and no latch, only while DEPTH is 2. */
const CLOG2_SUB = 'module sub #(parameter DEPTH = 2) (input d, en, output reg [2:1] q);\n  localparam I = $clog2(DEPTH);\n  always @* if (en) q[I] = d; else q[1] = d;\nendmodule';
/** A module whose case names every value of `s` only while its body parameter B is 1. */
const SUB_B = 'module sub (input s, a, b, output reg x);\n  parameter B = 1;\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule';
/** A module whose `q` keeps its value unless R is 2. */
const CHILD = 'module child #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule';
const MOVED_LABEL ='module t #(parameter B = 1) (input s, a, b, output reg x);\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule';

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
    'an if on a parameter nothing overrides: R = 2 picks the branch (no latch)',
    'module t #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule',
    [],
  ],
  [
    'the same module, and a top that instantiates it with #(.R(1)) (Warning 10240)',
    `module t #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\n${top('t #(.R(1))', 'input d, e, output q', '.d(d), .e(e), .q(q)')}`,
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
    'two if guards on different strings of one parameter, a top with #(.MODE("B")) (Warning 10240)',
    `module t #(parameter MODE = "A") (input d, en, output reg q);\n  always @* begin\n    if (MODE == "A") q = d;\n    if (MODE == "B") if (en) q = d;\n  end\nendmodule\n${top('t #(.MODE("B"))', 'input d, en, output q', '.d(d), .en(en), .q(q)')}`,
    [2],
  ],
  [
    'a latch in the branch W = 1 takes, beside a loop in the other (Warning 10240)',
    'module t #(parameter W = 1) (input [W-1:0] d, input en, output reg [W-1:0] q);\n  integer i;\n  always @* if (W == 1) begin if (en) q = d; end else for (i = 0; i < W; i = i + 1) q[i] = d[i];\nendmodule',
    [3],
  ],
  [
    'a case on {s, a} with s one bit wide by default: four labels name every value (no latch)',
    WIDENED_CASE,
    [],
  ],
  [
    'the same case, and a top that widens s with #(.S(2)): four labels miss values (Warning 10240)',
    `${WIDENED_CASE}\n${top('t #(.S(2))', 'input [1:0] s, input a, b, c, output x', '.s(s), .a(a), .b(b), .c(c), .x(x)')}`,
    [2],
  ],
  [
    'an if on a localparam no instance can change: only its branch is built (no latch)',
    'module t (input d, e, output reg q);\n  localparam ON = 1;\n  always @* if (ON) q = d; else if (e) q = d;\nendmodule',
    [],
  ],
  [
    "a localparam that wraps: 32'hffff_ffff + 32'd1 is 0, so if (ON) takes the else (Warning 10240)",
    "module t (input d, en, output reg q);\n  localparam ON = 32'hffff_ffff + 32'd1;\n  always @* if (ON) q = d; else if (en) q = d;\nendmodule",
    [3],
  ],
  [
    'the range of a localparam list holds for each item: [0:0] makes ON = 2 a 0 (Warnings 10230, 10240)',
    'module t (input d, en, output reg q);\n  localparam [0:0] FIRST = 0, ON = 2;\n  always @* if (ON) q = d; else if (en) q = d;\nendmodule',
    [3],
  ],
  [
    "a casez whose selector width is a parameter, one wildcard label for half the values (Warnings 10270, 10240)",
    "module t #(parameter W = 2) (input [W-1:0] s, input a, output reg x);\n  always @* casez (s)\n    2'b0?: x = a;\n  endcase\nendmodule",
    [2],
  ],
  [
    'a case label that is a parameter, B = 1 by default: 0 and B name every value (no latch)',
    MOVED_LABEL,
    [],
  ],
  [
    'the same case, and a top that moves B with #(.B(2)) (Warnings 10199, 10270, 10240)',
    `${MOVED_LABEL}\n${top('t #(.B(2))', 'input s, a, b, output x', '.s(s), .a(a), .b(b), .x(x)')}`,
    [2],
  ],
  [
    'a body parameter of a module without a parameter port list, overridden by #(.B(2)) (Warning 10240)',
    `module t (input s, a, b, output reg x);\n  parameter B = 1;\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule\n${top('t #(.B(2))', 'input s, a, b, output x', '.s(s), .a(a), .b(b), .x(x)')}`,
    [3],
  ],
  [
    'the same parameter, overridden by a defparam of an instance in the same file (Warning 10240)',
    `module t (input s, a, b, output reg x);\n  parameter B = 1;\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule\n${top('t', 'input s, a, b, output x', '.s(s), .a(a), .b(b), .x(x)').replace('endmodule', '  defparam u.B = 2;\nendmodule')}`,
    [3],
  ],
  [
    'two generate blocks declaring their own ON: the second one, 0, leaves r unassigned when en is low (Warning 10240)',
    'module t (input d, en, output reg q, output reg r);\n  generate\n    if (1) begin : g1\n      localparam [0:0] ON = 1;\n      always @* q = d;\n    end\n    if (1) begin : g2\n      localparam [0:0] ON = 0;\n      always @* if (ON) r = d; else if (en) r = d;\n    end\n  endgenerate\nendmodule',
    [9],
  ],
  [
    'a defparam resolved in its own module: two modules each have an instance u (Warning 10240 in child)',
    'module child #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule other #(parameter R = 2) (input d, output q);\n  assign q = d;\nendmodule\nmodule a (input d, output q);\n  other u (.d(d), .q(q));\nendmodule\nmodule t (input d, e, output q, p);\n  a ua (.d(d), .q(p));\n  child u (.d(d), .e(e), .q(q));\n  defparam u.R = 1;\nendmodule',
    [2],
  ],
  [
    'an override passed through a macro, child `CHILD_PARAM u (…) (Warning 10240)',
    '`define CHILD_PARAM #(.R(1))\nmodule child #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule t (input d, e, output q);\n  child `CHILD_PARAM u (.d(d), .e(e), .q(q));\nendmodule',
    [3],
  ],
  [
    "a bit index of $clog2(32'hffff_ffff + 32'd1): the sum wraps to 0, so q[I] and q[32] are two bits (Warning 10240)",
    "module t (input d, en, output reg [32:0] q);\n  localparam I = $clog2(32'hffff_ffff + 32'd1);\n  always @* if (en) q[I] = d; else q[32] = d;\nendmodule",
    [3],
  ],
  [
    'an override passed through a macro alias, `define OUTER `INNER (Warning 10240)',
    `\`define INNER #(.R(1))\n\`define OUTER \`INNER\n${CHILD}\nmodule t (input d, e, output q);\n  child \`OUTER u (.d(d), .e(e), .q(q));\nendmodule`,
    [4],
  ],
  [
    'an override macro defined in the active branch, an empty one in an `ifdef branch that is not compiled (Warning 10240)',
    `\`ifdef FOO\n\`define CHILD_PARAM\n\`else\n\`define CHILD_PARAM #(.R(1))\n\`endif\n${CHILD}\nmodule t (input d, e, output q);\n  child \`CHILD_PARAM u (.d(d), .e(e), .q(q));\nendmodule`,
    [7],
  ],
  [
    'a defparam inside a generate block, another u in the block before it (Warning 10240 in child)',
    `${CHILD}\nmodule other #(parameter R = 2) (input d, output q);\n  assign q = d;\nendmodule\nmodule t (input d, e, output q, p);\n  generate\n    if (1) begin : g1\n      other u (.d(d), .q(p));\n    end\n    if (1) begin : g2\n      child u (.d(d), .e(e), .q(q));\n      defparam u.R = 1;\n    end\n  endgenerate\nendmodule`,
    [2],
  ],
  [
    "a bit index of $clog2(A + B) with A = 4'hf and B = 4'h1: the 4-bit sum is not 16, so q[I] and q[4] are two bits (Warning 10240)",
    "module t (input d, en, output reg [4:0] q);\n  localparam A = 4'hf, B = 4'h1;\n  localparam I = $clog2(A + B);\n  always @* if (en) q[I] = d; else q[4] = d;\nendmodule",
    [4],
  ],
  [
    'a loop bound W-1 with localparam [7:0] W = 4: computed in 32 bits, 3, so q[0..2] are kept when en is low (Warning 10240)',
    'module t (input [3:0] d, input en, output reg [3:0] q);\n  localparam [7:0] W = 4;\n  integer i;\n  always @* if (en) for (i = 0; i < W-1; i = i + 1) q[i] = d[i];\nendmodule',
    [4],
  ],
  [
    'a bit index N % W with integer N = -3 and [7:0] W = 3: unsigned, so 1, not 0 (Warning 10240, latches on q[0] and q[1])',
    'module t (input d, en, output reg [3:0] q);\n  localparam integer N = -3;\n  localparam [7:0] W = 3;\n  localparam I = N % W;\n  always @* if (en) q[I] = d; else q[0] = d;\nendmodule',
    [5],
  ],
  [
    'a module named through a macro, `CELL #(.R(1)) u with `define CELL child (Warning 10240)',
    `\`define CELL child\n${CHILD}\nmodule t (input d, e, output q);\n  \`CELL #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    'an override in an `ifdef branch on a macro an included file defines (Warning 10240 with config.vh)',
    `\`include "config.vh"\n${CHILD}\nmodule t (input d, e, output q);\n\`ifdef USE_OVERRIDE\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`else\n  child u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [3],
  ],
  [
    'a named block whose reg ON shadows localparam ON = 0 (Warning 10240)',
    'module t (input d, en, output reg q);\n  localparam ON = 0;\n  always @* begin : blk\n    reg ON;\n    ON = en;\n    if (ON) q = d;\n  end\nendmodule',
    [3],
  ],
  [
    "a signal of a width the check cannot compute, written wholly and by a loop when en is high, not at all when it is low (Warning 10240)",
    "module t (input [3:0] d, input en, output reg [3:0] q);\n  localparam W = 4'd2 + 4'd2;\n  reg [W-1:0] r;\n  integer i;\n  always @* if (en) begin r = d; for (i = 0; i < W; i = i + 1) r[i] = d[i]; end\n  always @* q = r;\nendmodule",
    [5],
  ],
  [
    '(* full_case *) in the text of a macro that is not used (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @*\n`define UNUSED (* full_case *)\n    case (s)\n      2'd0: x = a;\n      2'd1: x = b;\n      2'd2: x = c;\n    endcase\nendmodule",
    [2],
  ],
  [
    '(* FULL_CASE *): attribute names are case-sensitive (Warning 10335, unrecognized; 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* FULL_CASE *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'an override macro used right after a named generate block, begin : gen_block (Warning 10240)',
    `\`define CHILD child #(.R(1))\n${CHILD}\nmodule t (input d, e, output q);\n  generate if (1) begin : gen_block\n    \`CHILD u (.d(d), .e(e), .q(q));\n  end endgenerate\nendmodule`,
    [3],
  ],
  [
    'a module named by a macro call with arguments, `CELL(0) #(.R(1)) u (Warning 10240)',
    `\`define CELL(x) child\n${CHILD}\nmodule t (input d, e, output q);\n  \`CELL(0) #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    "a case on {busword[0], a}, busword an array of 2-bit words: three bits, four 2-bit labels (Warnings 10270, 10240)",
    "module t (input [1:0] w, input a, b, c, d, output reg x);\n  wire [1:0] busword [0:0];\n  assign busword[0] = w;\n  always @* case ({busword[0], a})\n    2'b00: x = b;\n    2'b01: x = c;\n    2'b10: x = d;\n    2'b11: x = ~d;\n  endcase\nendmodule",
    [4],
  ],
  [
    'a named block whose reg i shadows genvar i (Warning 10240)',
    'module t (input d, gate, output reg q);\n  genvar i;\n  always @* begin : blk\n    reg i;\n    i = gate;\n    if (i) q = d;\n  end\nendmodule',
    [3],
  ],
  [
    'an if on a macro, `ON, that names a signal though a localparam ON exists (Warning 10240)',
    '`define ON en\nmodule t (input d, en, output reg q);\n  localparam ON = 1;\n  always @* if (`ON) q = d;\nendmodule',
    [4],
  ],
  [
    'a localparam list typed [BITS[0]:0]: its range holds for ON = 2 too, a 0 (Warnings 10230, 10240)',
    "module t (input d, en, output reg q);\n  localparam [1:0] BITS = 2'b00;\n  localparam [BITS[0]:0] FIRST = 0, ON = 2;\n  always @* if (ON) q = d; else if (en) q = d;\nendmodule",
    [4],
  ],
  [
    'every bit of q assigned, then q[I] with I = 1 << 1 when en is high (no latch)',
    'module t (input [3:0] d, input en, output reg [3:0] q);\n  localparam I = 1 << 1;\n  always @* begin\n    q = d;\n    if (en) q[I] = ~d[I];\n  end\nendmodule',
    [],
  ],
  [
    "a casez on s[(W):0] with localparam [1:0] W = 1 and the label 2'b?? (no latch)",
    "module t (input [(W):0] s, input a, output reg x);\n  localparam [1:0] W = 1;\n  always @* casez (s)\n    2'b??: x = a;\n  endcase\nendmodule",
    [],
  ],
  [
    'if (MODE == 1) q = d; else if (c) q = d; else repeat (1) q[0] = d[0], N 5 by an override: q[4:1] are kept (Info 10041 for q[1] to q[4])',
    'module sub #(parameter N = 1, MODE = 0) (input c, input [N-1:0] d, output reg [N-1:0] q);\n  always @* if (MODE == 1) q = d; else if (c) q = d; else repeat (1) q[0] = d[0];\nendmodule\nmodule t (input c, input [4:0] d, output [4:0] q);\n  sub #(.N(5)) u (.c(c), .d(d), .q(q));\nendmodule',
    [2],
  ],
  [
    "a function's own reg [0:0] mem [1:0] beside the module's reg [1:0] mem [1:0]: case (mem[i]) with 0 and 1 misses values (Warning 10240)",
    'module t (input i, input [1:0] a, b, input x0, x1, output reg x);\n  reg [1:0] mem [1:0];\n  always @* begin mem[0] = a; mem[1] = b; end\n  always @* case (mem[i])\n    0: x = x0;\n    1: x = x1;\n  endcase\n  function f;\n    input k;\n    reg [0:0] mem [1:0];\n    begin\n      mem[0] = k;\n      f = mem[0];\n    end\n  endfunction\nendmodule',
    [4],
  ],
  [
    'a translate_off inside `ifdef SYNTHESIS: Quartus does not define it, skips the pragma and builds the override after `endif (Warning 10240)',
    `${CHILD}\nmodule t (input d, e, output q);\n\`ifdef SYNTHESIS\n// synthesis translate_off\n\`endif\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [2],
  ],
  [
    '`define SKIP_PARAMS inside translate_off: Quartus never defines it, so `ifndef SKIP_PARAMS takes the override (Warning 10240)',
    `// synthesis translate_off\n\`define SKIP_PARAMS\n// synthesis translate_on\n${CHILD}\nmodule t (input d, e, output q);\n\`ifndef SKIP_PARAMS\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`else\n  child u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [5],
  ],
  [
    'child `HASH (.R(1)) u with `define HASH #: the # ends the macro, the override follows the use (Warning 10240)',
    `\`define HASH #\n${CHILD}\nmodule t (input d, e, output q);\n  child \`HASH (.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    'a translate_off inside a left-out `ifndef X is no pragma: the override after its `endif is built (Warning 10240)',
    `\`define X\n${CHILD}\nmodule t (input d, e, output q);\n\`ifndef X\n// synthesis translate_off\n\`endif\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    'case (mem[i]) of int unsigned mem [0:1], labels 0 and 1: a word is 32 bits (Warning 10240)',
    'module t (input i, input a, b, output reg x);\n  int unsigned mem [0:1];\n  initial begin mem[0] = 0; mem[1] = 5; end\n  always @* case (mem[i])\n    0: x = a;\n    1: x = b;\n  endcase\nendmodule',
    [4],
  ],
  [
    "casez (s[i +: W]) with localparam W = 2, labels 2'b0? and 2'b1?: two bits, every value (no latch)",
    "module t (input [3:0] s, input [1:0] i, input a, b, output reg x);\n  localparam W = 2;\n  always @* casez (s[i +: W])\n    2'b0?: x = a;\n    2'b1?: x = b;\n  endcase\nendmodule",
    [],
  ],
  [
    '`ifdef LOCAL, LOCAL defined in the file: the `elsif CONFIG override after it is never built (no latch)',
    `\`define LOCAL\n${CHILD}\nmodule t (input d, e, output q);\n\`ifdef LOCAL\n  child u (.d(d), .e(e), .q(q));\n\`elsif CONFIG\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [],
  ],
  [
    '`define INST child u (…); used beside defparam u.R = 1, while another module has other u (…): u is child here (Warning 10240)',
    `\`define INST child u (.d(d), .e(e), .q(q));\n${CHILD}\nmodule other #(parameter R = 2) (input d, e, output q); assign q = d; endmodule\nmodule holder (input d, e, output q);\n  other u (.d(d), .e(e), .q(q));\nendmodule\nmodule t (input d, e, output q, r);\n  \`INST\n  defparam u.R = 1;\n  holder h (.d(d), .e(e), .q(r));\nendmodule`,
    [3],
  ],
  [
    'case (mem[i]) of tri [1:0] mem [0:1], labels 0 and 1: a word is two bits (Warning 10240)',
    'module t (input i, input [1:0] a, b, input x0, x1, output reg x);\n  tri [1:0] mem [0:1];\n  assign mem[0] = a;\n  assign mem[1] = b;\n  always @* case (mem[i])\n    0: x = x0;\n    1: x = x1;\n  endcase\nendmodule',
    [5],
  ],
  [
    'a named block whose logic [0:0][0:0] ON shadows localparam ON = 1 (Quartus: Error 10166 under always_comb, a latch)',
    'module t (input d, en, output reg q);\n  localparam ON = 1;\n  always @* begin : blk\n    logic [0:0][0:0] ON;\n    ON = en;\n    if (ON) q = d;\n  end\nendmodule',
    [3],
  ],
  [
    'localparam [W-1:0] ZERO = 0, ONE = 1 with localparam W = 1: the labels ZERO and ONE name both values (no latch)',
    'module t (input s, input a, b, output reg x);\n  localparam W = 1;\n  localparam [W-1:0] ZERO = 0, ONE = 1;\n  always @* case (s)\n    ZERO: x = a;\n    ONE: x = b;\n  endcase\nendmodule',
    [],
  ],
  [
    '`CELL(2) #(.R(1)) u with `define CELL(s) child``s: the pasted name is not followed, every module counts as overridden (Warning 10240)',
    `\`define CELL(s) child\`\`s\nmodule child2 #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule t (input d, e, output q);\n  \`CELL(2) #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    "localparam [2:0] ZERO = 2'd0 / (2'd3 + 2'd1): 3 bits wide, the divisor is 4 and ZERO is 0 (no latch)",
    "module t (input s, input a, b, output reg x);\n  localparam [2:0] ZERO = 2'd0 / (2'd3 + 2'd1);\n  always @* case (s)\n    ZERO: x = a;\n    1: x = b;\n  endcase\nendmodule",
    [],
  ],
  [
    '`CELL(0) `P(1) u with `define CELL(x) child and `define P(v) #(.R(v)): the override follows a macro call (Warning 10240)',
    `\`define CELL(x) child\n\`define P(v) #(.R(v))\n${CHILD}\nmodule t (input d, e, output q);\n  \`CELL(0) \`P(1) u (.d(d), .e(e), .q(q));\nendmodule`,
    [4],
  ],
  [
    '`ifdef USE_CHILD child `else other `endif u, then defparam u.R = 1: with a header that defines USE_CHILD, child is overridden (Warning 10240)',
    `\`include "r3_hdr.vh"\n${CHILD}\nmodule other #(parameter R = 2) (input d, e, output q); assign q = d; endmodule\nmodule t (input d, e, output q);\n\`ifdef USE_CHILD\n  child\n\`else\n  other\n\`endif\n  u (.d(d), .e(e), .q(q));\n  defparam u.R = 1;\nendmodule`,
    [3],
  ],
  [
    '`define SET `define OMIT_LATCH defines SET only: `ifndef OMIT_LATCH takes the override (Warning 10240)',
    `\`define SET \`define OMIT_LATCH\n${CHILD}\nmodule t (input d, e, output q);\n\`ifndef OMIT_LATCH\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`else\n  child u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [3],
  ],
  [
    'case (mem[i]) of integer mem [0:1], labels 0 and 1: a word is 32 bits (Warning 10240)',
    'module t (input i, input a, b, output reg x);\n  integer mem [0:1];\n  initial begin mem[0] = 0; mem[1] = 5; end\n  always @* case (mem[i])\n    0: x = a;\n    1: x = b;\n  endcase\nendmodule',
    [4],
  ],
  [
    'a generate block whose localparam time ON = 0 shadows localparam ON = 1 (Warning 10240)',
    'module t (input d, en, output reg q);\n  localparam ON = 1;\n  generate if (1) begin : g\n    localparam time ON = 0;\n    always @* if (ON) q = d; else if (en) q = d;\n  end endgenerate\nendmodule',
    [5],
  ],
  [
    '`define KEYWORD defparam before a real defparam u.R = 1: the macro text hides nothing (Warning 10240)',
    `\`define KEYWORD defparam\n${CHILD}\nmodule t (input d, e, output q);\n  child u (.d(d), .e(e), .q(q));\n  defparam u.R = 1;\nendmodule`,
    [3],
  ],
  [
    "wire [W-1:0] sel with localparam signed [7:0] W = 2: W - 1 is 1, and 2'd0 to 2'd3 name every value (no latch)",
    "module t (input [1:0] s, input [3:0] v, output reg x);\n  localparam signed [7:0] W = 2;\n  wire [W-1:0] sel = s;\n  always @* case (sel)\n    2'd0: x = v[0];\n    2'd1: x = v[1];\n    2'd2: x = v[2];\n    2'd3: x = v[3];\n  endcase\nendmodule",
    [],
  ],
  [
    "case (mem[idx]) of wire [W-1:0] mem [0:1], W 3 by an override: four 2-bit labels miss values (Warning 10240)",
    "module sub #(parameter W = 2) (input [W-1:0] a, b, input idx, input [3:0] v, output reg x);\n  wire [W-1:0] mem [0:1];\n  assign mem[0] = a;\n  assign mem[1] = b;\n  always @* case (mem[idx])\n    2'd0: x = v[0];\n    2'd1: x = v[1];\n    2'd2: x = v[2];\n    2'd3: x = v[3];\n  endcase\nendmodule\nmodule t (input [2:0] a, b, input idx, input [3:0] v, output x);\n  sub #(.W(3)) u (.a(a), .b(b), .idx(idx), .v(v), .x(x));\nendmodule",
    [5],
  ],
  [
    '`ifdef X `A `else `B `endif #(.R(1)) u, the module names macros: with X defined by a header, child_a is overridden (Warning 10240)',
    `\`define A child_a\n\`define B child_b\nmodule child_a #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule child_b #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule t (input d, e, output q);\n\`ifdef X\n  \`A\n\`else\n  \`B\n\`endif\n  #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [4, 7],
  ],
  [
    '`define X, then an `include whose header undefines it: Quartus takes the `else override (Warning 10240)',
    `\`define X\n\`include "n5_hdr.vh"\n${CHILD}\nmodule t (input d, e, output q);\n\`ifdef X\n  child u (.d(d), .e(e), .q(q));\n\`else\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [4],
  ],
  [
    "a function's own localparam i = 1 beside a generate loop's genvar i: the i = 0 copy keeps q[0] (Info 10041 for q[0])",
    "module t (input [1:0] d, input en, output reg [1:0] q);\n  genvar i;\n  generate for (i = 0; i < 2; i = i + 1) begin : g\n    always @* if (i) q[i] = d[i]; else if (en) q[i] = d[i];\n  end endgenerate\n  function integer f;\n    input integer x;\n    localparam i = 1;\n    begin\n      f = x + i;\n    end\n  endfunction\nendmodule",
    [4],
  ],
  [
    "gplgpu alt_mem_ddrx_rdata_path: genvar i in a generate loop and a function's own integer i: q[i] on both branches (no latch)",
    "module t #(parameter N = 4) (input [N-1:0] d, e, output reg [N-1:0] q);\n  genvar i;\n  generate for (i = 0; i < N; i = i + 1) begin : g\n    always @* if (e[i]) q[i] = d[i]; else q[i] = 1'b0;\n  end endgenerate\n  function integer log2;\n    input [31:0] value;\n    integer i;\n    begin\n      log2 = 0;\n      for (i = 0; 2**i < value; i = i + 1) log2 = i + 1;\n    end\n  endfunction\nendmodule",
    [],
  ],
  [
    'q[N-1:0] and q[N] of an overridden module, N 6: every bit of q[N:0] (no latch)',
    "module sub #(parameter N = 4) (input c, input [N:1] d, output reg [N:0] q);\n  always @* begin\n    if (c) begin\n      q[N-1:0] = d;\n      q[N] = 1'b0;\n    end else\n      q = {d, 1'b1};\n  end\nendmodule\nmodule t (input c, input [6:1] d, output [6:0] q);\n  sub #(.N(6)) u (.c(c), .d(d), .q(q));\nendmodule",
    [],
  ],
  [
    'q[I] with I = $clog2(DEPTH), DEPTH 2 by default: q[1] on both branches (no latch)',
    `${CLOG2_SUB}\nmodule t (input d, en, output [2:1] q);\n  sub u (.d(d), .en(en), .q(q));\nendmodule`,
    [],
  ],
  [
    '`ifdef USE_A child_a `else child_b `endif #(.R(1)) u: a header that defines USE_A makes it child_a overridden (Warning 10240)',
    `module child_a #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule child_b #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule t (input d, e, output q);\n\`ifdef USE_A\n  child_a\n\`else\n  child_b\n\`endif\n  #(.R(1)) u (.d(d), .e(e), .q(q));\nendmodule`,
    [2, 5],
  ],
  [
    'defparam u.R = 1 in a fragment `include puts inside the module: outside any module, it reaches every instance u (Warning 10240)',
    `defparam u.R = 1;\n${CHILD}\nmodule t (input d, e, output q);\n  child u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    'child `PASS(#(.R(1))) u with `define PASS(x) x: the override is a macro argument (Warning 10240)',
    `\`define PASS(x) x\n${CHILD}\nmodule t (input d, e, output q);\n  child \`PASS(#(.R(1))) u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    'child #`R u with `define R 1: a macro as the override value (Warning 10240)',
    `\`define R 1\n${CHILD}\nmodule t (input d, e, output q);\n  child #\`R u (.d(d), .e(e), .q(q));\nendmodule`,
    [3],
  ],
  [
    "casez (mem[0]) of wire [1:0] mem [0:0], the one label 2'b??: a word is two bits (no latch)",
    "module t (input [1:0] s, input a, output reg x);\n  wire [1:0] mem [0:0];\n  assign mem[0] = s;\n  always @* casez (mem[0])\n    2'b??: x = a;\n  endcase\nendmodule",
    [],
  ],
  [
    'a generate block whose tri ON shadows localparam ON = 1 (Warning 10240)',
    'module t (input d, en, output reg q);\n  localparam ON = 1;\n  generate if (1) begin : g\n    tri ON;\n    assign ON = en;\n    always @* if (ON) q = d;\n  end endgenerate\nendmodule',
    [6],
  ],
  [
    '// synopsys FULL_CASE: Verilog directives are lowercase (Warnings 10335, unrecognized; 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s) // synopsys FULL_CASE\n    2'b00: x = a;\n    2'b01: x = b;\n    2'b10: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    '// SYNOPSYS full_case: the keyword is lowercase too (Warning 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* case (s) // SYNOPSYS full_case\n    2'b00: x = a;\n    2'b01: x = b;\n    2'b10: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    '// SYNTHESIS TRANSLATE_OFF hides nothing in Verilog: Quartus builds the latch inside (Warning 10240)',
    'module t (input d, e, output reg q);\n// SYNTHESIS TRANSLATE_OFF\n  always @* if (e) q = d;\n// SYNTHESIS TRANSLATE_ON\nendmodule',
    [3],
  ],
  [
    "localparam [8:0] P = 8'hFF + 8'h01 is 256, as wide as its type (Quartus takes the P == 256 branch, Info 10041 for q[2])",
    "module t (input d, e, output reg [7:0] q);\n  localparam [8:0] P = 8'hFF + 8'h01;\n  generate if (P == 0) begin : is_0\n    always @* q[1] = d;\n  end else if (P == 256) begin : is_256\n    always @* if (e) q[2] = d;\n  end else begin : other\n    always @* q[3] = d;\n  end endgenerate\nendmodule",
    [6],
  ],
  [
    'USE_DEFAULT defined under `ifndef BOARD_CONFIG: with a header that defines BOARD_CONFIG, Quartus takes the `else override (Warning 10240)',
    `\`ifndef BOARD_CONFIG\n\`define USE_DEFAULT\n\`endif\n${CHILD}\nmodule t (input d, e, output q);\n\`ifdef USE_DEFAULT\n  child u (.d(d), .e(e), .q(q));\n\`else\n  child #(.R(1)) u (.d(d), .e(e), .q(q));\n\`endif\nendmodule`,
    [5],
  ],
  [
    'child, then #(.R(1)) inside `ifndef SYNTHESIS, then the instance name (Warning 10240)',
    `${CHILD}\nmodule t (input d, e, output q);\n  child\n\`ifndef SYNTHESIS\n  #(.R(1))\n\`endif\n  u (.d(d), .e(e), .q(q));\nendmodule`,
    [2],
  ],
  [
    'a macro that instantiates other, then child #(.R(1)): the second module is overridden too (Warning 10240)',
    `\`define PAIR other v (.a(d), .b()); child #(.R(1)) u (.d(d), .e(e), .q(q));\nmodule other (input a, output b); assign b = a; endmodule\n${CHILD}\nmodule t (input d, e, output q);\n  \`PAIR\nendmodule`,
    [4],
  ],
  [
    'an override before a trailing // synthesis translate_off on its line is built (Warning 10240)',
    `${CHILD}\nmodule t (input d, e, output q, r);\n  child #(.R(1)) u (.d(d), .e(e), .q(q)); // synthesis translate_off\n  assign r = d;\n  // synthesis translate_on\nendmodule`,
    [2],
  ],
  [
    'a delay macro, always `TICK clk = ~clk with `define TICK #5, overrides nothing (no latch in child)',
    `\`define TICK #5\n${CHILD}\nmodule t (input d, e, output q);\n  child u (.d(d), .e(e), .q(q));\n  reg clk;\n  initial clk = 0;\n  always \`TICK clk = ~clk;\nendmodule`,
    [],
  ],
  [
    "casez (s[i]) with the one label 1'b?: a variable index still selects one bit (no latch)",
    "module t (input [3:0] s, input [1:0] i, input a, output reg x);\n  always @* casez (s[i])\n    1'b?: x = a;\n  endcase\nendmodule",
    [],
  ],
  [
    "$clog2 of one unsigned constant, localparam [7:0] DEPTH = 4: W is 2 and 2'b0?, 2'b1? name every value (no latch)",
    "module t (input [1:0] s, input a, b, output reg x);\n  localparam [7:0] DEPTH = 4;\n  localparam W = $clog2(DEPTH);\n  wire [W-1:0] sel = s;\n  always @* casez (sel)\n    2'b0?: x = a;\n    2'b1?: x = b;\n  endcase\nendmodule",
    [],
  ],
  [
    'a macro whose formal names the module, `define INST(M) M #(.R(1)) u … and `INST(child) (Warning 10240)',
    `\`define INST(M) M #(.R(1)) u (.d(d), .e(e), .q(q));\n${CHILD}\nmodule t (input d, e, output q);\n  \`INST(child)\nendmodule`,
    [3],
  ],
  [
    'a defparam a macro emits, `SET_PARAM(u) with `define SET_PARAM(inst) defparam inst.R = 1; (Warning 10240)',
    `\`define SET_PARAM(inst) defparam inst.R = 1;\n${CHILD}\nmodule t (input d, e, output q);\n  child u (.d(d), .e(e), .q(q));\n  \`SET_PARAM(u)\nendmodule`,
    [3],
  ],
  [
    'an override inside translate_off: synthesis builds only the default instance (no latch)',
    `${SUB_B}\nmodule t (input s, a, b, output x, y);\n  sub u (.s(s), .a(a), .b(b), .x(x));\n// synthesis translate_off\n  sub #(.B(2)) v (.s(s), .a(a), .b(b), .x(y));\n// synthesis translate_on\nendmodule`,
    [],
  ],
  [
    'an override inside `ifndef SYNTHESIS: Quartus does not define SYNTHESIS, so it builds it (Warnings 10199, 10270, 10240)',
    `${SUB_B}\nmodule t (input s, a, b, output x, y);\n  sub u (.s(s), .a(a), .b(b), .x(x));\n\`ifndef SYNTHESIS\n  sub #(.B(2)) v (.s(s), .a(a), .b(b), .x(y));\n\`endif\nendmodule`,
    [3],
  ],
  [
    'a named block whose time ON shadows localparam ON = 1 (Warning 10240)',
    'module t (input d, en, output reg q);\n  localparam ON = 1;\n  always @* begin : blk\n    time ON;\n    ON = en;\n    if (ON) q = d;\n  end\nendmodule',
    [3],
  ],
  [
    "q[0] and q[1'b0 + 1'b1] both assigned: a select of literals only is a fixed bit (no latch)",
    "module t (input [1:0] d, output reg [1:0] q);\n  always @* begin\n    q[0] = d[0];\n    q[1'b0 + 1'b1] = d[1];\n  end\nendmodule",
    [],
  ],
  [
    'an override in a macro continued on the next line with \\ (Warning 10240)',
    `\`define CHILD_PARAM \\\n  #(.R(1))\n${CHILD}\nmodule t (input d, e, output q);\n  child \`CHILD_PARAM u (.d(d), .e(e), .q(q));\nendmodule`,
    [4],
  ],
  [
    'a macro alias that expands to two modules around a redefinition of what it names (Warning 10240 in both)',
    'module childa #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\nmodule childb #(parameter R = 2) (input d, e, output reg q);\n  always @* if (R == 2) q = d; else if (e) q = d;\nendmodule\n`define INNER childa #(.R(1))\n`define OUTER `INNER\nmodule t (input d, e, output q, p);\n  `OUTER ua (.d(d), .e(e), .q(q));\n`define INNER childb #(.R(1))\n  `OUTER ub (.d(d), .e(e), .q(p));\nendmodule',
    [2, 5],
  ],
  [
    'a defparam g.u.R for the second instance of child v (…), u (…); and another u elsewhere (Warning 10240 in child)',
    `${CHILD}\nmodule other #(parameter R = 2) (input d, output q);\n  assign q = d;\nendmodule\nmodule t (input d, e, output q, q1, p);\n  generate\n    if (1) begin : g\n      child v (.d(d), .e(e), .q(q1)), u (.d(d), .e(e), .q(q));\n    end\n  endgenerate\n  other u (.d(d), .q(p));\n  defparam g.u.R = 1;\nendmodule`,
    [2],
  ],
  [
    "a casez on a selector in parentheses, casez ((s)), W = $clog2(4) and only 2'b0? (Warnings 10270, 10240)",
    "module t #(parameter W = $clog2(4)) (input [W-1:0] s, input a, output reg x);\n  always @* casez ((s))\n    2'b0?: x = a;\n  endcase\nendmodule",
    [2],
  ],
  [
    "a casez whose one label is all wildcards, 2'b?? for s[W-1:0] with W = $clog2(4) (no latch)",
    "module t #(parameter W = $clog2(4)) (input [W-1:0] s, input a, output reg x);\n  always @* casez (s)\n    2'b??: x = a;\n  endcase\nendmodule",
    [],
  ],
  [
    "an unsized all-wildcard label, 'b?, with a top that sets W = 5 (Warning 10270, no latch)",
    `module t #(parameter W = 2) (input [W-1:0] s, input a, output reg x);\n  always @* casez (s)\n    'b?: x = a;\n  endcase\nendmodule\n${top('t #(.W(5))', 'input [4:0] s, input a, output x', '.s(s), .a(a), .x(x)')}`,
    [],
  ],
  [
    "a casez on s[W-1:0] with W = $clog2(4), one wildcard label for half the values (Warnings 10270, 10240)",
    "module t #(parameter W = $clog2(4)) (input [W-1:0] s, input a, output reg x);\n  always @* casez (s)\n    2'b0?: x = a;\n  endcase\nendmodule",
    [2],
  ],
  [
    'a body parameter of a module with a parameter port list is local (Warning 10222; #(.B(2)) is Error 10213): no latch',
    'module t #(parameter W = 1) (input s, a, b, output reg x);\n  parameter B = 1;\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule',
    [],
  ],
  [
    'a state machine on typed localparams that name every state, no default (no latch)',
    "module t (input clk, reset, go, output reg [1:0] o);\n  localparam [1:0] S0 = 2'b00, S1 = 2'b01, S2 = 2'b10, S3 = 2'b11;\n  reg [1:0] state, next;\n  always @(posedge clk) if (reset) state <= S0; else state <= next;\n  always @* case (state)\n    S0: next = go ? S1 : S0;\n    S1: next = S2;\n    S2: next = S3;\n    S3: next = S0;\n  endcase\n  always @* o = state;\nendmodule",
    [],
  ],
  [
    'strings told apart by their spaces: MODE == "AB" and MODE == "A B", a top with #(.MODE("A B")) (Warning 10240)',
    `module t #(parameter MODE = "AB") (input d, en, output reg q);\n  always @* begin\n    if (MODE == "AB") q = d;\n    if (MODE == "A B") if (en) q = d;\n  end\nendmodule\n${top('t #(.MODE("A B"))', 'input d, en, output q', '.d(d), .en(en), .q(q)')}`,
    [2],
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
    'an escaped quote inside an attribute value, (* keep = "foo\\", full_case=bar" *) (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* keep = \"foo\\\", full_case=bar\" *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [2],
  ],
  [
    'full_case inside a braced attribute value, (* keep = {1\'b0, full_case == 1\'b1} *) (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  localparam full_case = 1;\n  always @* (* keep = {1'b0, full_case == 1'b1} *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
    [3],
  ],
  [
    'full_case inside a comment in an attribute, (* keep = 1 /*, full_case = foo */ *) (Warnings 10270, 10240)',
    "module t (input [1:0] s, input a, b, c, output reg x);\n  always @* (* keep = 1 /*, full_case = foo */ *) case (s)\n    2'd0: x = a;\n    2'd1: x = b;\n    2'd2: x = c;\n  endcase\nendmodule",
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

describe('invalid HDL being edited does not stop the check', () => {
  test('a localparam of absurd range, [99999999999999999:0] (Quartus: Warning 10259, constant value overflow)', () => {
    const module = 'module t (input d, en, output reg q);\n  localparam [99999999999999999:0] ON = 1;\n  always @* if (ON) q = d; else if (en) q = d;\nendmodule';
    // ON is not computed, so both of its branches are checked: the else keeps q.
    expect(latchesIn(module)).toEqual([3]);
  });

  test('a port range of $clog2 nested 5000 deep is not computed, and stops nothing', () => {
    const nested = `${'$clog2('.repeat(5000)}4${')'.repeat(5000)}`;
    const module = `module t (input [${nested}:0] s, input d, en, output reg q);\n  always @* if (en) q = d;\nendmodule`;
    expect(latchesIn(module)).toEqual([2]);
  });

  test('a generated localparam of 10 000 additions is not computed, and stops nothing', () => {
    const sum = Array.from({ length: 10_000 }, () => '1').join(' + ');
    const module = `module t (input d, en, output reg q);\n  localparam ON = ${sum};\n  always @* if (ON) q = d; else if (en) q = d;\nendmodule`;
    expect(latchesIn(module)).toEqual([3]);
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

  test('a parameter list #(…) on the same line as a clocked q <= #1 d is no delay (Quartus builds it)', () => {
    const module = `module t #(parameter N = 1) (${BOARD}); always @(posedge CLOCK_50) LEDR <= #1 SW; endmodule`;
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

  test('$time passed to a function named log$display is read by the design: no print (Error 10174)', () => {
    const module = 'module t (output [63:0] q);\n  function [63:0] log$display;\n    input [63:0] v;\n    log$display = v;\n  endfunction\n  assign q = log$display($time);\nendmodule';
    expect(constructsIn(module)).toContainEqual(['vlog-time', 'never']);
  });
});

describe("a testbench's overrides change no synthesized module", () => {
  /** Complete only while B is 1: Quartus builds it with its default, no latch. */
  const design = "module sub (input s, a, b, output reg x);\n  parameter B = 1;\n  always @* case (s)\n    0: x = a;\n    B: x = b;\n  endcase\nendmodule";
  const bench = "module sub_tb;\n  reg s, a, b;\n  wire x;\n  sub #(.B(2)) dut (.s(s), .a(a), .b(b), .x(x));\n  initial begin\n    s = 0; a = 0; b = 1;\n    #10 $finish;\n  end\nendmodule";
  const latches = (files: ReturnType<typeof source>[], overrides = EMPTY_OVERRIDES) =>
    checkOf(files, overrides).findings.filter((f) => f.construct === 'vlog-level-storage' && f.tier !== 'quiet').map((f) => `${f.fileId}@${f.line}`);

  test('a testbench nothing instantiates, with sub #(.B(2)) dut: sub keeps its default (no latch)', () => {
    expect(latches([source('sub.v', design), source('sub_tb.v', bench)])).toEqual([]);
  });

  test('a testbench the top instantiates under `ifndef SYNTHESIS may be built: its override counts (Quartus builds it, Warning 10240)', () => {
    const top = 'module t (input s, a, b, output x);\n  sub u (.s(s), .a(a), .b(b), .x(x));\n`ifndef SYNTHESIS\n  sub_tb tb ();\n`endif\nendmodule';
    expect(latches([source('sub.v', design), source('sub_tb.v', bench), source('t.v', top)])).toEqual(['sub.v@3']);
  });

  test('a file the student marked as a testbench is left out too', () => {
    const other = "module other (input s, a, b, output x);\n  sub #(.B(2)) u (.s(s), .a(a), .b(b), .x(x));\nendmodule";
    const marked = { ...EMPTY_OVERRIDES, roles: { 'other.v': 'tb' as const } };
    expect(latches([source('sub.v', design), source('other.v', other)], marked)).toEqual([]);
    expect(latches([source('sub.v', design), source('other.v', other)])).toEqual(['sub.v@3']);
  });
});
