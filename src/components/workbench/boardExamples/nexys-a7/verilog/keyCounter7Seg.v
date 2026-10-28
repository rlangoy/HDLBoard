// Press BTNC to count from 00 to 99; BTNU resets the count.
// CLOCK_500Hz is provided by HDLBoard, not by the physical board.
module keyCounter7Seg (
    input  wire       CLOCK_500Hz,
    input  wire       BTNC,
    input  wire       BTNU,
    output wire       CA, CB, CC, CD, CE, CF, CG,
    output wire       DP,
    output wire [7:0] AN
);
    // Segment bits are gfedcba; a zero lights a segment.
    function [6:0] to_segments;
        input [3:0] digit;
        begin
            case (digit)
                0: to_segments = 7'b1000000;
                1: to_segments = 7'b1111001;
                2: to_segments = 7'b0100100;
                3: to_segments = 7'b0110000;
                4: to_segments = 7'b0011001;
                5: to_segments = 7'b0010010;
                6: to_segments = 7'b0000010;
                7: to_segments = 7'b1111000;
                8: to_segments = 7'b0000000;
                9: to_segments = 7'b0010000;
                default: to_segments = 7'b1111111;
            endcase
        end
    endfunction

    reg [3:0] ones = 0;
    reg [3:0] tens = 0;
    reg previous_count_button = 0;
    reg [6:0] refresh_count = 0; // Holds values from 0 to 100.
    reg show_tens = 0;

    always @(posedge CLOCK_500Hz) begin
        // Count once when the button changes from released to pressed.
        previous_count_button <= BTNC;
        if (BTNU) begin
            ones <= 0;
            tens <= 0;
        end else if (BTNC && !previous_count_button) begin
            if (ones == 9) begin
                ones <= 0;
                if (tens == 9)
                    tens <= 0;
                else
                    tens <= tens + 1;
            end else begin
                ones <= ones + 1;
            end
        end

        // Switch digits every 4 clock cycles (8 ms). Each digit is
        // refreshed at 62.5 Hz; the remaining digits stay blank.
        // Change the comparison to 100 to see the multiplexing happen.
        if (refresh_count == 3) begin
            refresh_count <= 0;
            show_tens <= !show_tens;
        end else begin
            refresh_count <= refresh_count + 1;
        end
    end

    wire [6:0] segments;

    assign segments = show_tens ? to_segments(tens) : to_segments(ones);
    assign AN = show_tens ? 8'b11111101 : 8'b11111110;
    assign {CG, CF, CE, CD, CC, CB, CA} = segments;
    assign DP = 1'b1; // Decimal point off (active low).
endmodule
