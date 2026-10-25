// The DE10-Lite top-level interface in the board's own port names
// (the board's pin names), so this file can go straight into Quartus with only a pin
// assignment added. Only the ports this example uses are declared; every
// port is optional for the simulator.
module DE10_Lite (
    input  wire [9:0] SW,
    output wire [9:0] LEDR
);
    // LEDR = SW; the first thing every student wires up.
    assign LEDR = SW;
endmodule
