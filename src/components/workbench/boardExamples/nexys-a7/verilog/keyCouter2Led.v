// BTNC counts up, BTNU resets; the count is shown on the LEDs.
module keyCouter2Led (
    input  wire        BTNC,
    input  wire        BTNU,
    output wire [15:0] LED
);
    reg [7:0] count = 8'd0;

    // A flip-flop is built from one clock edge, plus an optional
    // asynchronous reset or set tested first. BTNC is the clock (a press is
    // its rising edge); BTNU is the reset, active high.
    always @(posedge BTNC or posedge BTNU) begin
        if (BTNU)
            count <= 8'd0;                 // BTNU held: reset
        else
            count <= count + 8'd1;         // BTNC pressed: count up
    end

    assign LED[7:0] = count;
    assign LED[15:8] = 0;          // unused LEDs off
endmodule
