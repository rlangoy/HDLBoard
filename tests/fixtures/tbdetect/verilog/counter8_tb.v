`timescale 1ns / 1ps
module counter8_tb;
    reg        clk = 1'b0;
    reg        reset = 1'b1;
    wire [7:0] q;

    counter8 dut (.clk(clk), .reset(reset), .q(q));

    always #5 clk = ~clk;

    initial begin
        #12 reset = 1'b0;
        #100;
        if (q !== 8'd10) $display("FAIL q=%0d", q);
        else             $display("PASS");
        $finish;
    end
endmodule
