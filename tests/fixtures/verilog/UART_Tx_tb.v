// Presses KEY0 once so UART_Tx sends 'A' (0x41) as one RS-232 frame.
// Not self-checking: open the waveform and follow the transmitter's FSM
// through IDLE -> START_BIT -> DATA_BITS -> STOP_BIT -> IDLE.
//
// The baud rate is raised to 5 Mbaud so one bit lasts only 10 clocks
// (200 ns) and the whole frame fits in a short, readable waveform.
// Expected Tx: idle 1, start 0, data 1 0 0 0 0 0 1 0 (LSB first), stop 1.
// BitIndex in UART_Tx counts the frame: 0 = start, 1..8 = data, 9 = stop.
// BitTimer is a free-running baud tick; every bit, the start bit included,
// is placed on Tx at the clock edge that ends a BitTimer pulse.
module UART_Tx_tb;

    localparam CLOCK_FREQ   = 50_000_000;
    localparam BAUD_RATE    = 5_000_000;  // Make it simple: 10 clocks per Tx bit
    localparam CLOCK_PERIOD = 20;         // ns
    localparam [7:0] CHAR_A = 8'h41;      // ASCII 'A'

    reg  clock_50 = 1'b0;
    reg  key0_n   = 1'b1;  // KEY0, active low
    wire start;
    wire tx;
    wire busy;
    wire complete;

    UART_Tx #(
        .CLOCK_FREQ(CLOCK_FREQ),
        .BAUD_RATE(BAUD_RATE)
    ) uut (
        .Clk(clock_50),
        .Reset(1'b0),
        .Data(CHAR_A),
        .Start(start),
        .Tx(tx),
        .Busy(busy),
        .Complete(complete)
    );

    // Pressing KEY0 starts a frame; UART_Tx only reacts to Start in IDLE.
    assign start = !key0_n;

    always #(CLOCK_PERIOD / 2) clock_50 = !clock_50;

    // Ends the simulation once the frame has been sent.
    initial begin : Stimulus
        $display("IDLE: Tx line is high, waiting for KEY0");
        #(5 * CLOCK_PERIOD);

        $display("KEY0 pressed: sending 'A' (0x41)");
        key0_n = 1'b0;
        #(5 * CLOCK_PERIOD);
        key0_n = 1'b1;

        @(posedge complete);
        $display("Frame sent: back in IDLE");
        #(5 * CLOCK_PERIOD);

        $finish;
    end

endmodule
