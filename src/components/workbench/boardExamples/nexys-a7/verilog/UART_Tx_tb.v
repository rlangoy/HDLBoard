// Presses BTNC once so UART_Tx sends 'A' (0x41) as one RS-232 frame.
// Not self-checking: open the waveform and follow the transmitter's FSM
// through IDLE -> START_BIT -> DATA_BITS -> STOP_BIT -> IDLE.
//
// The baud rate is raised to 10 Mbaud so one bit lasts only 10 clocks
// (100 ns) and the whole frame fits in a short, readable waveform.
// Expected Tx: idle 1, start 0, data 1 0 0 0 0 0 1 0 (LSB first), stop 1.
// BitIndex in UART_Tx counts the frame: 0 = start, 1..8 = data, 9 = stop.
// BitTimer is a free-running baud tick; every bit, the start bit included,
// is placed on Tx at the clock edge that ends a BitTimer pulse.
module UART_Tx_tb;

    localparam CLOCK_FREQ   = 100_000_000;
    localparam BAUD_RATE    = 10_000_000;  // Make it simple: 10 clocks per Tx bit
    localparam CLOCK_PERIOD = 10;         // ns
    localparam [7:0] CHAR_A = 8'h41;      // ASCII 'A'

    reg        clk      = 1'b0;
    reg        btn0     = 1'b0;  // BTNC, active high
    wire       start;
    wire       tx;
    wire       busy;
    wire       complete;
    wire [1:0] state;            // uut's State, shown with the testbench's signals

    UART_Tx #(
        .CLOCK_FREQ(CLOCK_FREQ),
        .BAUD_RATE(BAUD_RATE)
    ) uut (
        .Clk(clk),
        .Reset(1'b0),
        .Data(CHAR_A),
        .Start(start),
        .Tx(tx),
        .Busy(busy),
        .Complete(complete)
    );

    // Pressing BTNC starts a frame; UART_Tx only reacts to Start in IDLE.
    assign start = btn0;

    // The transmitter's state, read from inside uut (a hierarchical name).
    assign state = uut.State;

    always #(CLOCK_PERIOD / 2) clk = !clk;

    // Ends the simulation once the frame has been sent.
    initial begin : Stimulus
        $display("IDLE: Tx line is high, waiting for BTNC");
        #(5 * CLOCK_PERIOD);

        $display("BTNC pressed: sending 'A' (0x41)");
        btn0 = 1'b1;
        #(5 * CLOCK_PERIOD);
        btn0 = 1'b0;

        @(posedge complete);
        $display("Frame sent: back in IDLE");
        #(5 * CLOCK_PERIOD);

        $finish;
    end

endmodule
