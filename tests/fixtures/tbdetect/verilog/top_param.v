module top #(parameter W = 8) (
    input  wire         clk,
    output wire [W-1:0] q
);
    counter #(.W(W)) u_count (.clk(clk), .q(q));
    counter #(4)     u_small (.clk(clk), .q());
endmodule
