module alu (input wire a, input wire b, input wire op, output wire y);
    assign y = op ? (a | b) : (a & b);
endmodule

module alu_tb;
    reg a = 1'b0, b = 1'b0, op = 1'b0;
    wire y;

    alu dut (.a(a), .b(b), .op(op), .y(y));

    initial begin
        a = 1'b1; b = 1'b1;
        #10 $display("y=%b", y);
        $finish;
    end
endmodule
