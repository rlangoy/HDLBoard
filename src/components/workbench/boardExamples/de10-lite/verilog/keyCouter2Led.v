// KEY0 counts up, KEY1 resets; the count is shown on the LEDs.
module keyCouter2Led (
    input  wire [1:0] KEY,
    output wire [9:0] LEDR
);
    reg [7:0] count = 8'd0;

    // Quartus builds a flip-flop from one clock edge, plus an optional
    // asynchronous reset or set tested first. KEY[0] is the clock (a press
    // is its falling edge); KEY[1] is the reset, active low.
    always @(negedge KEY[0] or negedge KEY[1]) begin
        if (!KEY[1])
            count <= 8'd0;                 // KEY1 held: reset
        else
            count <= count + 8'd1;         // KEY0 pressed: count up
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 0;          // unused LEDs off
endmodule
