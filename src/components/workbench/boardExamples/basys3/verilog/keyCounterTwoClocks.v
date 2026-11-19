// btnU counts up, btnD counts down; the count is shown on led[7:0].
//
// SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
// the simulator, but not on the board, so HDLBoard labels it SIM-only.
//
// Why: the always block below reacts to two clock edges, one per button. A
// register (a flip-flop) on the FPGA has ONE clock input. It allows one
// clock edge, plus an optional asynchronous reset or set that loads a
// constant, and nothing more. Here btnD would have to be a reset, but it
// loads count - 1, so it is really a second clock, and no flip-flop can
// count on the edges of two different clocks. Synthesis either refuses it
// or builds latches that power up undefined and do not count.
//
// How to do it on the board: use ONE clock (clk), and sample the buttons
// on it: a press is a button that was released one clock ago and is
// pressed now. keyCounter7Seg.v does exactly that.
module keyCounterTwoClocks (
    input  wire        btnU,
    input  wire        btnD,
    output wire [15:0] led
);
    reg [7:0] count = 8'd0;

    always @(posedge btnU or posedge btnD) begin   // two clocks -> error
        if (btnD)
            count <= count - 8'd1;   // btnD pressed: count down
        else
            count <= count + 8'd1;   // btnU pressed: count up
    end

    assign led[7:0] = count;
    assign led[15:8] = 0;             // unused LEDs off
endmodule
