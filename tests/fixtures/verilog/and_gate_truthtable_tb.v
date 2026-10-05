// Tests the AND gate and prints its truth table.
`timescale 1ns/1ps

module and_gate_truthtable_tb;

    reg a;
    reg b;
    wire y;

    // Device Under Test
    and_gate uut (
        .a(a),
        .b(b),
        .y(y)
    );

    integer i;
    integer j;
    reg expected;

    initial begin

        $display("");
        $display("AND Truth Table");
        $display("---------------");
        $display("A B | Y");
        $display("---+---");

        // Test all four input combinations
        for (i = 0; i <= 1; i = i + 1) begin
            for (j = 0; j <= 1; j = j + 1) begin

                a = i;
                b = j;

                #10;

                expected = a & b;

                // Print truth table row
                $display("%d %d | %d", a, b, y);

                // Check result
                if (y !== expected) begin
                    $display(
                        "ERROR: %d AND %d should be %d, but got %d",
                        a, b, expected, y
                    );
                end

            end
        end

        $display("---------------");
        $display("All tests passed!");

        $finish;
    end

endmodule
