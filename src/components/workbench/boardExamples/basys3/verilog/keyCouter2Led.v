// btnC counts up, btnU resets; the count is shown on the LEDs.
module keyCouter2Led (
    input  wire        btnC,
    input  wire        btnU,
    output wire [15:0] led
);
    reg [7:0] count = 8'd0;

    // A flip-flop is built from one clock edge, plus an optional
    // asynchronous reset or set tested first. btnC is the clock (a press is
    // its rising edge); btnU is the reset, active high.
    always @(posedge btnC or posedge btnU) begin
        if (btnU)
            count <= 8'd0;                 // btnU held: reset
        else
            count <= count + 8'd1;         // btnC pressed: count up
    end

    assign led[7:0] = count;
    assign led[15:8] = 0;          // unused LEDs off
endmodule
