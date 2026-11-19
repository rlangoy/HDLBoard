// KEY0 counts up, KEY1 counts down; the count is shown on LEDR[7:0].
//
// SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
// the simulator, but not on the board, so HDLBoard labels it SIM-only.
//
// Why: the always block below reacts to two clock edges, one per key. A
// register (a flip-flop) on the FPGA has ONE clock input. It allows one
// clock edge, plus an optional asynchronous reset or set that loads a
// constant, and nothing more. Here down would have to be a reset, but it
// loads count - 1, so it is really a second clock, and no flip-flop can
// count on the edges of two different clocks. Synthesis either refuses it
// or builds latches that power up undefined and do not count.
//
// How to do it on the board: use ONE clock (CLOCK_50), and sample the keys
// on it: a press is a key that was released one clock ago and is pressed
// now. keyCounter7Seg.v does exactly that.
module keyCounterTwoClocks (
    input  wire [1:0] KEY,
    output wire [9:0] LEDR
);
    reg  [7:0] count = 8'd0;
    wire       up    = ~KEY[0];   // 1 while KEY0 is pressed (active low)
    wire       down  = ~KEY[1];   // 1 while KEY1 is pressed

    always @(posedge up or posedge down) begin   // two clocks -> error
        if (down)
            count <= count - 8'd1;   // KEY1 pressed: count down
        else
            count <= count + 8'd1;   // KEY0 pressed: count up
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;        // unused LEDs off
endmodule
