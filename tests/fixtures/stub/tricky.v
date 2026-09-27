`include "defs.vh"
// module fake_in_comment(input x);
/* module fake_block(input y); */
module helper #(parameter W = 4) (input [W-1:0] a, output [W-1:0] b);
  assign b = ~a;
endmodule

module top_ifdef #(parameter N = `BOARD_W, parameter signed [7:0] K = -1) (
    input  wire CLOCK_50,
    input  wire [`BOARD_W-1:0] SW,
`ifdef WITH_KEYS
    input  wire [3:0] KEY_N,
`endif
`ifdef NOT_DEFINED
    input  wire [3:0] NEVER_PORT,
`endif
    (* keep *) output wire [`BOARD_W-1:0] LEDR
);
  genvar i;
  generate for (i = 0; i < N; i = i + 1) begin : g
    assign LEDR[i] = SW[i];
  end endgenerate
  wire [3:0] unused;
  helper #(.W(4)) h (.a(KEY_N), .b(unused));
endmodule
