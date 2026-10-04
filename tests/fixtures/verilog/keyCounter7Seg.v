// Press KEY0 to count up, KEY1 to reset. The count (00..99) is shown in
// decimal on HEX1 (tens) and HEX0 (ones); the other displays stay blank.
module keyCounter7Seg (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // One digit (0..9) to its segments, active low: bit 0 is segment a,
    // bit 6 is segment g, and 0 lights a segment.
    function [6:0] to_segments(input [3:0] digit);
        case (digit)
            4'd0: to_segments = 7'b1000000;
            4'd1: to_segments = 7'b1111001;
            4'd2: to_segments = 7'b0100100;
            4'd3: to_segments = 7'b0110000;
            4'd4: to_segments = 7'b0011001;
            4'd5: to_segments = 7'b0010010;
            4'd6: to_segments = 7'b0000010;
            4'd7: to_segments = 7'b1111000;
            4'd8: to_segments = 7'b0000000;
            4'd9: to_segments = 7'b0010000;
            default: to_segments = 7'b1111111;
        endcase
    endfunction

    reg [3:0] ones = 4'd0;
    reg [3:0] tens = 4'd0;
    // The keys as they were on the previous clock edge: a press is the
    // edge where a key goes from released (1) to pressed (0).
    reg [1:0] key_prev = 2'b11;

    always @(posedge CLOCK_50) begin
        key_prev <= KEY_N[1:0];

        if (key_prev[1] && !KEY_N[1]) begin              // KEY1: reset
            ones <= 4'd0;
            tens <= 4'd0;
        end else if (key_prev[0] && !KEY_N[0]) begin     // KEY0: count up
            if (ones == 4'd9) begin
                ones <= 4'd0;
                tens <= (tens == 4'd9) ? 4'd0 : tens + 4'd1; // 99 wraps to 00
            end else begin
                ones <= ones + 4'd1;
            end
        end
    end

    assign HEX0_N = to_segments(ones);
    assign HEX1_N = to_segments(tens);

    // Unused displays: all segments off (active low).
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
