module blinker (
    input  wire clk,
    output reg  led
);
    // #10 $display("old debug"); $finish;
    /* always #5 clk = ~clk; */
    localparam [8*12-1:0] MSG = "#5 $finish";
`ifdef NEVER_DEFINED
    initial $finish;
`endif
    always @(posedge clk) led <= ~led;
endmodule
