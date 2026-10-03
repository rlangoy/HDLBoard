module counter8 (
    input  wire       clk,
    input  wire       reset,
    output reg  [7:0] q
);
    reg [7:0] init_rom [0:0];

    initial $readmemh("counter_init.hex", init_rom);

    always @(posedge clk)
        if (reset) q <= init_rom[0];
        else       q <= q + 8'd1;
endmodule
