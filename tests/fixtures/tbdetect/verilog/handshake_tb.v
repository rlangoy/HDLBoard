module handshake_tb;
    reg  clk = 1'b0, start = 1'b0;
    wire done;

    always #5 clk = ~clk;

    handshake dut (.clk(clk), .start(start), .done(done));

    initial begin
        repeat (3) @(posedge clk);
        start = 1'b1;
        @(posedge done);
        $display("done");
    end
endmodule
