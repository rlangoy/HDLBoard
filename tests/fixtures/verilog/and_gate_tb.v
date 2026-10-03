// Self-checking testbench: no ports, so it runs on its own (batch mode).
module and_gate_tb;

    reg  a = 1'b0;
    reg  b = 1'b0;
    wire y;

    // Unit Under Test
    and_gate uut (
        .a(a),
        .b(b),
        .y(y)
    );

    integer errors = 0;

    // Test stimulus and verification
    initial begin

        // Test 1: 0 AND 0 = 0
        a = 1'b0;
        b = 1'b0;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 1 failed: 0 AND 0 should be 0");
            errors = errors + 1;
        end

        // Test 2: 0 AND 1 = 0
        a = 1'b0;
        b = 1'b1;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 2 failed: 0 AND 1 should be 0");
            errors = errors + 1;
        end

        // Test 3: 1 AND 0 = 0
        a = 1'b1;
        b = 1'b0;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 3 failed: 1 AND 0 should be 0");
            errors = errors + 1;
        end

        // Test 4: 1 AND 1 = 1
        a = 1'b1;
        b = 1'b1;
        #10;
        if (y !== 1'b1) begin
            $display("ERROR: Test 4 failed: 1 AND 1 should be 1");
            errors = errors + 1;
        end

        if (errors == 0) $display("All tests passed");
        else             $display("%0d test(s) failed", errors);

        $finish;
    end

endmodule
