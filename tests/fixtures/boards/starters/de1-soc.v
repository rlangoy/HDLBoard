// Starter top file for the DE1-SoC board, made by HDLBoard.
// Buttons: active low. Displays: active low.
module starter_top (
    input  wire       CLOCK_50,
    input  wire       CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.
    input  wire [9:0] SW,
    input  wire [3:0] KEY,
    output wire [9:0] LEDR,
    output wire [6:0] HEX0,
    output wire [6:0] HEX1,
    output wire [6:0] HEX2,
    output wire [6:0] HEX3,
    output wire [6:0] HEX4,
    output wire [6:0] HEX5
);
    // The LEDs follow the switches.
    assign LEDR = SW[9:0];
    // The displays are off.
    assign HEX0 = {7{1'b1}};
    assign HEX1 = {7{1'b1}};
    assign HEX2 = {7{1'b1}};
    assign HEX3 = {7{1'b1}};
    assign HEX4 = {7{1'b1}};
    assign HEX5 = {7{1'b1}};
endmodule
