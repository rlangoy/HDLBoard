// The Basys 3 top-level interface in the board's own port names
// (the master XDC), so this file can go straight into Vivado with only a pin
// assignment added. Only the ports this example uses are declared; every
// port is optional for the simulator.
module Basys_3 (
    input  wire [15:0] sw,
    output wire [15:0] led
);
    // led = sw; the first thing every student wires up.
    assign led = sw;
endmodule
