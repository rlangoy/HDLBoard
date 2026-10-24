// Press KEY0 to send 'A', KEY1 to send 'B' over RS-232 (8N1, 9600 baud).
// The serial line is shown on LEDR0 (idle high, so the LED is lit when
// nothing is sent) and LEDR1 lights while a frame is being transmitted.
// On real hardware, route Tx to a GPIO pin with a USB-UART adapter.
// A key press while a frame is still being sent is ignored.
module keyUartTx #(
    parameter CLOCK_FREQ = 50_000_000,
    parameter BAUD_RATE  = 9_600
) (
    input  wire       CLOCK_50,
    input  wire [3:0] KEY_N,
    output wire [9:0] LEDR
);

    localparam [7:0] CHAR_A = 8'h41;  // ASCII 'A'
    localparam [7:0] CHAR_B = 8'h42;  // ASCII 'B'

    // The keys as they were on the previous clock edge: a press is the
    // edge where a key goes from released (1) to pressed (0).
    reg  [1:0] key_prev = 2'b11;
    wire       key0_pressed;
    wire       key1_pressed;

    reg  [7:0] tx_data  = 8'h00;
    reg        tx_start = 1'b0;
    wire       tx;
    wire       tx_busy;

    UART_Tx #(
        .CLOCK_FREQ(CLOCK_FREQ),
        .BAUD_RATE(BAUD_RATE)
    ) Transmitter (
        .Clk(CLOCK_50),
        .Reset(1'b0),
        .Data(tx_data),
        .Start(tx_start),
        .Tx(tx),
        .Busy(tx_busy),
        .Complete()
    );

    assign key0_pressed = (key_prev[0] == 1'b1 && KEY_N[0] == 1'b0);
    assign key1_pressed = (key_prev[1] == 1'b1 && KEY_N[1] == 1'b0);

    // Picks the character for the pressed key and gives the transmitter
    // a one-clock Start pulse, but only when it is idle.
    always @(posedge CLOCK_50) begin : CharacterSelector
        key_prev <= KEY_N[1:0];
        tx_start <= 1'b0;

        if (tx_busy == 1'b0) begin
            if (key0_pressed) begin
                tx_data  <= CHAR_A;
                tx_start <= 1'b1;
            end else if (key1_pressed) begin
                tx_data  <= CHAR_B;
                tx_start <= 1'b1;
            end
        end
    end

    assign LEDR[0]   = tx;
    assign LEDR[1]   = tx_busy;
    assign LEDR[9:2] = 8'b0000_0000;

endmodule
