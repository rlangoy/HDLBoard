// Transmits one byte as RS-232 8N1: a frame of 10 bits on the Tx line.
//   BitIndex 0    : start bit (0)
//   BitIndex 1..8 : data bits, LSB first (Data[0] .. Data[7])
//   BitIndex 9    : stop bit (1)
//
// BitTimer is a free-running baud tick: a one-clock pulse once every bit
// period. Tx only changes on the clock edge that ends a BitTimer pulse,
// so every bit - the start bit included - is placed on Tx by BitTimer.
//
//   Start    : one-clock pulse; Data is latched when Start is seen in IDLE.
//              The start bit is sent on the next BitTimer tick.
//   Busy     : high from Start until the frame has been sent.
//   Complete : one-clock pulse at the end of the stop bit.
module UART_Tx #(
    parameter CLOCK_FREQ = 50_000_000,
    parameter BAUD_RATE  = 9_600
) (
    input  wire       Clk,
    input  wire       Reset,
    input  wire [7:0] Data,
    input  wire       Start,

    output wire       Tx,
    output wire       Busy,
    output reg        Complete
);

    localparam CLKS_PER_BIT = CLOCK_FREQ / BAUD_RATE;

    // IDLE      : line high, wait for Start and then for BitTimer
    // START_BIT : 0 on Tx for one bit period
    // DATA_BITS : the 8 data bits on Tx, LSB first
    // STOP_BIT  : 1 on Tx for one bit period
    localparam [1:0] IDLE      = 2'd0,
                     START_BIT = 2'd1,
                     DATA_BITS = 2'd2,
                     STOP_BIT  = 2'd3;
    reg [1:0] State = IDLE;

    // Position of the current bit in the 10-bit frame
    localparam START_BIT_INDEX      = 0;
    localparam FIRST_DATA_BIT_INDEX = 1;
    localparam LAST_DATA_BIT_INDEX  = 8;
    localparam STOP_BIT_INDEX       = 9;

    // ClkCnt counts the clocks within one bit period. BitTimer is a
    // one-clock tick on the last clock of the period: on the next clock
    // edge the next bit is placed on Tx.
    integer   ClkCnt = 0;
    wire      BitTimer = (ClkCnt == CLKS_PER_BIT - 1);

    reg [3:0] BitIndex    = START_BIT_INDEX;
    reg [7:0] DataReg     = 8'h00;
    reg       SendRequest = 1'b0;  // Start seen, waiting for BitTimer
    reg       TxReg       = 1'b1;

    initial Complete = 1'b0;

    assign Tx   = TxReg;
    assign Busy = !(State == IDLE && !SendRequest);

    // Free-running clock counter that sets the baud rate.
    always @(posedge Clk) begin : BitTimerGenerator
        if (Reset || BitTimer)
            ClkCnt <= 0;
        else
            ClkCnt <= ClkCnt + 1;
    end

    // Tx, State and BitIndex change together on the clock edge that ends
    // a BitTimer pulse: that edge is where the next bit is placed on Tx.
    // The data bit at frame position BitIndex (1..8) is DataReg[BitIndex - 1].
    always @(posedge Clk) begin : FrameTransmitter
        // Single-cycle pulse: low unless set below
        Complete <= 1'b0;

        if (Reset) begin
            State       <= IDLE;
            TxReg       <= 1'b1;
            BitIndex    <= START_BIT_INDEX;
            SendRequest <= 1'b0;
        end else begin
            case (State)

                IDLE: begin
                    if (Start) begin
                        DataReg     <= Data;
                        SendRequest <= 1'b1;
                    end

                    if (SendRequest && BitTimer) begin
                        SendRequest <= 1'b0;
                        BitIndex    <= START_BIT_INDEX;
                        TxReg       <= 1'b0;              // start bit
                        State       <= START_BIT;
                    end
                end

                START_BIT: begin
                    if (BitTimer) begin
                        BitIndex <= FIRST_DATA_BIT_INDEX;
                        TxReg    <= DataReg[0];
                        State    <= DATA_BITS;
                    end
                end

                DATA_BITS: begin
                    if (BitTimer) begin
                        if (BitIndex == LAST_DATA_BIT_INDEX) begin
                            BitIndex <= STOP_BIT_INDEX;
                            TxReg    <= 1'b1;             // stop bit
                            State    <= STOP_BIT;
                        end else begin
                            BitIndex <= BitIndex + 1;
                            TxReg    <= DataReg[BitIndex]; // the bit at BitIndex + 1
                        end
                    end
                end

                STOP_BIT: begin
                    if (BitTimer) begin
                        BitIndex <= START_BIT_INDEX;
                        TxReg    <= 1'b1;                 // line idle
                        Complete <= 1'b1;
                        State    <= IDLE;
                    end
                end

            endcase
        end
    end

endmodule
