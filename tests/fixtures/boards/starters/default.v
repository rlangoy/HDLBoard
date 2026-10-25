// Starter top file for the Default board, made by HDLBoard.
// Buttons: active low. Displays: active low.
module starter_top (
    input  wire       CLOCK_50,
    input  wire       CLOCK_500Hz, // Simulator only (HDLBoard): delete this port before synthesis.
    input  wire [9:0] SW,
    input  wire [3:0] KEY_N,
    output wire [9:0] LEDR,
    output wire [6:0] HEX0_N,
    output wire [6:0] HEX1_N,
    output wire [6:0] HEX2_N,
    output wire [6:0] HEX3_N,
    output wire [6:0] HEX4_N,
    output wire [6:0] HEX5_N
);
    // The LEDs follow the switches.
    assign LEDR = SW[9:0];
    // The displays are off.
    assign HEX0_N = {7{1'b1}};
    assign HEX1_N = {7{1'b1}};
    assign HEX2_N = {7{1'b1}};
    assign HEX3_N = {7{1'b1}};
    assign HEX4_N = {7{1'b1}};
    assign HEX5_N = {7{1'b1}};
endmodule
