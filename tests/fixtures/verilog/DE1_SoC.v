// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module DE1_SoC (
    input  wire        CLOCK_50,
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
    // LEDR = SW; the first thing every student wires up.
    assign LEDR = SW;

    // Blank until you add your own 7-segment logic - active low, so
    // all-ones is "off".
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
