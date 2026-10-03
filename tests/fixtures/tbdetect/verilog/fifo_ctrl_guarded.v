module fifo_ctrl (
    input  wire clk,
    input  wire push,
    input  wire full,
    output wire overflow
);
    assign overflow = push & full;
`ifndef SYNTHESIS
    always @(posedge clk)
        if (push && full) $display("push while full at %0t", $time);
`endif
endmodule
