// BTNC counts up, BTNU resets; the count is shown on the LEDs.
module counter8 (
    input  wire       BTNC,
    input  wire       BTNU,
    output wire [15:0] LED
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b00;

    // BTNU: reset, BTNC: count up. Both act on a button *press*, i.e. the
    // edge where the active-high button goes from released to pressed.
    always @(BTNC or BTNU) begin
        if (key_prev[1] == 1'b0 && BTNU == 1'b1)
            count <= 8'd0;
        else if (key_prev[0] == 1'b0 && BTNC == 1'b1)
            count <= count + 8'd1;
        key_prev <= {BTNU, BTNC};
    end

    assign LED[7:0] = count;
    assign LED[15:8] = 0;          // unused LEDs off
endmodule
