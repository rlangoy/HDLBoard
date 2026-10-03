module DE1_SoC (
    input  wire [9:0] SW,
    output wire [9:0] LEDR
);
    assign #2 LEDR = SW;
endmodule
