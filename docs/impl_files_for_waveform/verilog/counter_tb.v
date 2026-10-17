// Icarus fixture: shared identifier codes, compressed vectors, a memory (spec § 4, § 14).
module counter4(input clk, input rst, output reg [3:0] q);
  always @(posedge clk) if (rst) q <= 4'd0; else q <= q + 4'd1;
endmodule

module counter_tb;
  reg clk = 0;
  reg rst = 1;
  wire [3:0] q;
  reg [7:0] mem [0:3];
  reg [7:0] data;
  integer i;
  counter4 dut(.clk(clk), .rst(rst), .q(q));
  always #5 clk = ~clk;
  initial begin
    data = 8'bz;
    #12 rst = 0;
    #20 data = 8'h3c;
    #20 data = 8'bxxxx0101;
    #100 $display("done at %0t", $time);
    $finish;
  end
endmodule
