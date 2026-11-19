// KEY0 counts up, KEY1 counts down; the count is shown on LEDR[7:0].
//
// SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
// the simulator, but synthesis rejects it, so HDLBoard labels it SIM-only.
//
// Why: count is written by two always blocks, each on its own clock edge,
// one per key. A register (a flip-flop) on the FPGA has ONE clock input. It
// allows one clock edge, plus an optional asynchronous reset or set, and
// nothing more. No flip-flop can count on the edges of two different
// clocks, so synthesis stops ("can't resolve multiple constant drivers").
//
// How to do it on the board: use ONE clock (CLOCK_50), and sample the keys
// on it: a press is a key that was released one clock ago and is pressed
// now. keyCounter7Seg.v does exactly that.
module keyCounterTwoClocks (
    input  wire [3:0] KEY_N,
    output wire [9:0] LEDR
);
    reg  [7:0] count = 8'd0;
    wire       up    = ~KEY_N[0];   // 1 while KEY0 is pressed (active low)
    wire       down  = ~KEY_N[1];   // 1 while KEY1 is pressed

    always @(posedge up)                // first clock: KEY0 pressed
        count <= count + 8'd1;

    always @(posedge down)              // second clock: KEY1 pressed -> error
        count <= count - 8'd1;

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;           // unused LEDs off
endmodule
