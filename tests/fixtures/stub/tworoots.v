module alpha(input a, output y);
  assign y = ~a;
endmodule

module beta(input [3:0] b, output [3:0] z);
  assign z = b;
endmodule
