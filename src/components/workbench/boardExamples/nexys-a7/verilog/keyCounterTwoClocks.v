// BTNU counts up, BTND counts down; the count is shown on LED[7:0].
//
// SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
// the simulator, but synthesis rejects it, so HDLBoard labels it SIM-only.
//
// Why: count is written by two always blocks, each on its own clock edge,
// one per button. A register (a flip-flop) on the FPGA has ONE clock input. It
// allows one clock edge, plus an optional asynchronous reset or set, and
// nothing more. No flip-flop can count on the edges of two different
// clocks, so synthesis stops ("can't resolve multiple constant drivers").
//
// How to do it on the board: use ONE clock (CLK100MHZ), and sample the buttons
// on it: a press is a button that was released one clock ago and is pressed
// now. keyCounter7Seg.v does exactly that.
module keyCounterTwoClocks (
    input  wire        BTNU,
    input  wire        BTND,
    output wire [15:0] LED
);
    reg [7:0] count = 8'd0;

    always @(posedge BTNU)             // first clock: BTNU pressed
        count <= count + 8'd1;

    always @(posedge BTND)             // second clock: BTND pressed -> error
        count <= count - 8'd1;

    assign LED[7:0] = count;
    assign LED[15:8] = 0;           // unused LEDs off
endmodule
