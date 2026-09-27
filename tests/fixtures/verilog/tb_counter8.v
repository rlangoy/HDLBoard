// Self-checking testbench: no ports, so it runs on its own (batch mode).
module tb_counter8;
    reg        CLOCK_50 = 1'b0;
    reg  [3:0] KEY_N    = 4'b1111;
    wire [9:0] LEDR;

    counter8 dut (.CLOCK_50(CLOCK_50), .KEY_N(KEY_N), .LEDR(LEDR));

    always #10 CLOCK_50 = ~CLOCK_50;

    task press(input integer key);
        begin
            KEY_N[key] = 1'b0;
            #100;
            KEY_N[key] = 1'b1;
            #100;
        end
    endtask

    initial begin
        #100;
        press(0);
        press(0);
        press(0);
        $display("count after 3 presses = %0d", LEDR[7:0]);
        press(1);
        $display("count after reset     = %0d", LEDR[7:0]);
        if (LEDR[7:0] === 8'd0) $display("PASS");
        else                    $display("FAIL");
        $finish;
    end
endmodule
