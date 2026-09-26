// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module blinkTest (
    input  wire        CLOCK_500Hz,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // 500 Hz clock -> 500 cycles per second
    // For 2 Hz blink (LED toggles every 250 ms):
    // Toggle period = 1 / (2 * 2 Hz) = 250 ms
    // Cycles per toggle = 0.25 s * 500 = 125
    localparam TOGGLE_COUNT = 125;
    // Wide enough for any TOGGLE_COUNT: a fixed [6:0] would stop at 127 and never
    // reach a larger count, so the LEDs would not blink (the VHDL integer range
    // sizes itself; a Verilog reg does not).
    localparam COUNTER_WIDTH = $clog2(TOGGLE_COUNT + 1);

    reg [COUNTER_WIDTH-1:0] counter = 0;   // counts 0 .. TOGGLE_COUNT-1
    reg       led_state = 1'b0;

    always @(posedge CLOCK_500Hz) begin
        if (counter == TOGGLE_COUNT - 1) begin
            counter   <= 0;
            led_state <= ~led_state;
        end else begin
            counter <= counter + 1'b1;
        end
    end

    // Drive all 10 LEDs with the same blinking signal
    assign LEDR = {10{led_state}};

    // The VHDL original leaves these outputs undriven; Verilog would read
    // them as high-impedance, so they are blanked explicitly (active low).
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
