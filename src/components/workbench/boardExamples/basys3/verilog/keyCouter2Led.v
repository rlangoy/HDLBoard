// btnC counts up, btnU resets; the count is shown on the LEDs.
module counter8 (
    input  wire       btnC,
    input  wire       btnU,
    output wire [15:0] led
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b00;

    // btnU: reset, btnC: count up. Both act on a button *press*, i.e. the
    // edge where the active-high button goes from released to pressed.
    always @(btnC or btnU) begin
        if (key_prev[1] == 1'b0 && btnU == 1'b1)
            count <= 8'd0;
        else if (key_prev[0] == 1'b0 && btnC == 1'b1)
            count <= count + 8'd1;
        key_prev <= {btnU, btnC};
    end

    assign led[7:0] = count;
    assign led[15:8] = 0;          // unused LEDs off
endmodule
