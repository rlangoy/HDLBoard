// KEY0 counts up, KEY1 resets; the count is shown on the LEDs.
module counter8 (
    input  wire [1:0] KEY,
    output wire [9:0] LEDR
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b11;

    // KEY1: reset, KEY0: count up. Both act on a button *press*, i.e. the
    // edge where the active-low button goes from released to pressed.
    always @(KEY[1:0]) begin
        if (key_prev[1] == 1'b1 && KEY[1] == 1'b0)
            count <= 8'd0;
        else if (key_prev[0] == 1'b1 && KEY[0] == 1'b0)
            count <= count + 8'd1;
        key_prev <= KEY[1:0];
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 0;          // unused LEDs off
endmodule
