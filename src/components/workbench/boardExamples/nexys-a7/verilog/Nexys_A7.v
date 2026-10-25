// The Nexys A7 top-level interface in the board's own port names
// (the master XDC), so this file can go straight into Vivado with only a pin
// assignment added. Only the ports this example uses are declared; every
// port is optional for the simulator.
module Nexys_A7 (
    input  wire [15:0] SW,
    output wire [15:0] LED
);
    // LED = SW; the first thing every student wires up.
    assign LED = SW;
endmodule
