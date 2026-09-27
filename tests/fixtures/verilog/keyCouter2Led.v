module counter8 (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b11;

    // KEY_N[1]: reset, KEY_N[0]: count up. Both act on a button *press*,
    // i.e. the falling edge of the active-low key.
    always @(KEY_N[1:0]) begin
        if (key_prev[1] && !KEY_N[1])
            count <= 8'd0;
        else if (key_prev[0] && !KEY_N[0])
            count <= count + 8'd1;
        key_prev <= KEY_N[1:0];
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;          // unused LEDs off
endmodule
