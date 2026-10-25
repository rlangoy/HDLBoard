// Starter top file for the Basys 3 board, made by HDLBoard.
// Buttons: active high. Displays: active low, multiplexed (digit enables active low).
// Board resources:
//   Board definitions: https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc
//   I/O examples: https://github.com/Digilent/Basys3/blob/master/Projects/GPIO/src/hdl/GPIO_Demo.vhd
module starter_top (
    input  wire        clk,
    input  wire        CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.
    input  wire [15:0] sw,
    input  wire        btnC,
    input  wire        btnU,
    input  wire        btnL,
    input  wire        btnR,
    input  wire        btnD,
    output wire [15:0] led,
    output wire [6:0]  seg,
    output wire        dp,
    output wire [3:0]  an
);
    // The LEDs follow the switches.
    assign led = sw[15:0];
    // The displays are off.
    assign seg = {7{1'b1}};
    assign dp = 1'b1;
    assign an = {4{1'b1}};
endmodule
