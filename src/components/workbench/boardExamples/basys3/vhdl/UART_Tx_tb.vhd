-- Presses btnC once so UART_Tx sends 'A' (0x41) as one RS-232 frame.
-- Not self-checking: open the waveform and follow the transmitter's FSM
-- through IDLE -> START_BIT -> DATA_BITS -> STOP_BIT -> IDLE.
--
-- The baud rate is raised to 10 Mbaud so one bit lasts only 10 clocks
-- (100 ns) and the whole frame fits in a short, readable waveform.
-- Expected Tx: idle 1, start 0, data 1 0 0 0 0 0 1 0 (LSB first), stop 1.
-- BitIndex in UART_Tx counts the frame: 0 = start, 1..8 = data, 9 = stop.
-- BitTimer is a free-running baud tick; every bit, the start bit included,
-- is placed on Tx at the clock edge that ends a BitTimer pulse.
library ieee;
use ieee.std_logic_1164.all;
use work.UART_Tx_pkg.all;

entity UART_Tx_tb is
end entity UART_Tx_tb;

architecture sim of UART_Tx_tb is

    constant CLOCK_FREQ   : positive := 100_000_000;
    constant BAUD_RATE    : positive := 10_000_000;  -- Make it simple 10clks per txBit
    constant CLOCK_PERIOD : time     := 10 ns;
    constant CHAR_A       : std_logic_vector(7 downto 0) := x"41";  -- ASCII 'A'

    signal clk      : std_logic := '0';
    signal btn0     : std_logic := '0';  -- btnC, active high
    signal start    : std_logic;
    signal tx       : std_logic;
    signal busy     : std_logic;
    signal complete : std_logic;
    signal sim_done : boolean := false;
    signal state    : StateType;  -- uut's State, shown with the testbench's signals

begin

    uut : entity work.UART_Tx
        generic map (
            CLOCK_FREQ => CLOCK_FREQ,
            BAUD_RATE  => BAUD_RATE
        )
        port map (
            Clk      => clk,
            Reset    => '0',
            Data     => CHAR_A,
            Start    => start,
            Tx       => tx,
            Busy     => busy,
            Complete => complete
        );

    -- Pressing btnC starts a frame; UART_Tx only reacts to Start in IDLE.
    start <= btn0;

    -- The transmitter's state, read from inside uut (a VHDL-2008 external name).
    state <= <<signal .UART_Tx_tb.uut.State : StateType>>;

    -- Stops once the stimulus is done, so the simulation ends by itself.
    clk <= not clk after CLOCK_PERIOD / 2 when not sim_done;

    Stimulus : process
    begin
        report "IDLE: Tx line is high, waiting for btnC" severity note;
        wait for 5 * CLOCK_PERIOD;

        report "btnC pressed: sending 'A' (0x41)" severity note;
        btn0 <= '1';
        wait for 5 * CLOCK_PERIOD;
        btn0 <= '0';

        wait until complete = '1';
        report "Frame sent: back in IDLE" severity note;
        wait for 5 * CLOCK_PERIOD;

        sim_done <= true;
        wait;
    end process Stimulus;

end architecture sim;
