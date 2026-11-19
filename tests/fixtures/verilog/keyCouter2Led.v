// KEY_N[0] counts up, KEY_N[1] resets; the count is shown on LEDR[7:0].
module keyCouter2Led (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR
);
    reg [7:0] count = 8'd0;

    // A flip-flop is built from one clock edge, plus an optional
    // asynchronous reset or set tested first. KEY_N[0] is the clock (a press
    // is its falling edge); KEY_N[1] is the reset, active low.
    always @(negedge KEY_N[0] or negedge KEY_N[1]) begin
        if (!KEY_N[1])
            count <= 8'd0;                 // KEY_N[1] held: reset
        else
            count <= count + 8'd1;         // KEY_N[0] pressed: count up
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;          // unused LEDs off
endmodule
