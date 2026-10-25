// Starter top file for the Nexys A7 board, made by HDLBoard.
// Buttons: active high, reset button active low. Displays: active low, multiplexed (digit enables active low).
// Board resources:
//   Board definitions: https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc
//   I/O top file: https://github.com/Digilent/Nexys-A7-100T-GPIO/blob/master/src/hdl/top.vhd
module starter_top (
    input  wire        CLK100MHZ,
    input  wire        CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.
    input  wire [15:0] SW,
    input  wire        BTNC,
    input  wire        BTNU,
    input  wire        BTNL,
    input  wire        BTNR,
    input  wire        BTND,
    input  wire        CPU_RESETN,
    output wire [15:0] LED,
    output wire        CA,
    output wire        CB,
    output wire        CC,
    output wire        CD,
    output wire        CE,
    output wire        CF,
    output wire        CG,
    output wire        DP,
    output wire [7:0]  AN
);
    wire [6:0] HEX;
    assign {CG, CF, CE, CD, CC, CB, CA} = HEX; // single segments as one vector: HEX[0] is segment a (CA)
    // The LEDs follow the switches.
    assign LED = SW[15:0];
    // The displays are off.
    assign HEX = {7{1'b1}};
    assign DP = 1'b1;
    assign AN = {8{1'b1}};
endmodule
