module check;
    reg  a = 1'b0;
    wire y;

    inverter u_inv (.a(a), .y(y));

    initial begin
        a = 1'b1;
    end
endmodule
