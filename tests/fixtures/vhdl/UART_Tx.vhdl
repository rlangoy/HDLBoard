library ieee;
use ieee.std_logic_1164.all;

-- Transmits one byte as RS-232 8N1: a frame of 10 bits on the Tx line.
--   BitIndex 0    : start bit ('0')
--   BitIndex 1..8 : data bits, LSB first (Data(0) .. Data(7))
--   BitIndex 9    : stop bit ('1')
--
-- BitTimer is a free-running baud tick: a one-clock pulse once every bit
-- period. Tx only changes on the clock edge that ends a BitTimer pulse,
-- so every bit - the start bit included - is placed on Tx by BitTimer.
--
--   Start    : one-clock pulse; Data is latched when Start is seen in IDLE.
--              The start bit is sent on the next BitTimer tick.
--   Busy     : high from Start until the frame has been sent.
--   Complete : one-clock pulse at the end of the stop bit.
entity UART_Tx is
    generic (
        CLOCK_FREQ : positive := 50_000_000;
        BAUD_RATE  : positive := 9_600
    );
    port (
        Clk      : in  std_logic;
        Reset    : in  std_logic;
        Data     : in  std_logic_vector(7 downto 0);
        Start    : in  std_logic;

        Tx       : out std_logic;
        Busy     : out std_logic;
        Complete : out std_logic
    );
end entity UART_Tx;

architecture RTL of UART_Tx is

    constant CLKS_PER_BIT : positive := CLOCK_FREQ / BAUD_RATE;

    -- IDLE      : line high, wait for Start and then for BitTimer
    -- START_BIT : '0' on Tx for one bit period
    -- DATA_BITS : the 8 data bits on Tx, LSB first
    -- STOP_BIT  : '1' on Tx for one bit period
    type StateType is (IDLE, START_BIT, DATA_BITS, STOP_BIT);
    signal State : StateType := IDLE;

    -- Position of the current bit in the 10-bit frame
    constant START_BIT_INDEX      : natural := 0;
    constant FIRST_DATA_BIT_INDEX : natural := 1;
    constant LAST_DATA_BIT_INDEX  : natural := 8;
    constant STOP_BIT_INDEX       : natural := 9;

    -- ClkCnt counts the clocks within one bit period. BitTimer is a
    -- one-clock tick on the last clock of the period: on the next clock
    -- edge the next bit is placed on Tx.
    signal ClkCnt      : natural range 0 to CLKS_PER_BIT - 1 := 0;
    signal BitTimer    : std_logic;

    signal BitIndex    : natural range START_BIT_INDEX to STOP_BIT_INDEX := START_BIT_INDEX;
    signal DataReg     : std_logic_vector(7 downto 0) := (others => '0');
    signal SendRequest : std_logic := '0';  -- Start seen, waiting for BitTimer
    signal TxReg       : std_logic := '1';
    signal CompleteReg : std_logic := '0';

    -- The data bit sent at frame position Index (1..8): Data(0)..Data(7)
    function Data_Bit(Byte : std_logic_vector(7 downto 0); Index : natural)
        return std_logic is
    begin
        return Byte(Index - FIRST_DATA_BIT_INDEX);
    end function Data_Bit;

begin

    Tx       <= TxReg;
    Busy     <= '0' when State = IDLE and SendRequest = '0' else '1';
    Complete <= CompleteReg;

    BitTimer <= '1' when ClkCnt = CLKS_PER_BIT - 1 else '0';

    -- Free-running clock counter that sets the baud rate.
    BitTimerGenerator : process (Clk)
    begin
        if rising_edge(Clk) then
            if Reset = '1' or BitTimer = '1' then
                ClkCnt <= 0;
            else
                ClkCnt <= ClkCnt + 1;
            end if;
        end if;
    end process BitTimerGenerator;

    -- Tx, State and BitIndex change together on the clock edge that ends
    -- a BitTimer pulse: that edge is where the next bit is placed on Tx.
    FrameTransmitter : process (Clk)
    begin
        if rising_edge(Clk) then
            -- Single-cycle pulse: low unless set below
            CompleteReg <= '0';

            if Reset = '1' then
                State       <= IDLE;
                TxReg       <= '1';
                BitIndex    <= START_BIT_INDEX;
                SendRequest <= '0';
            else
                case State is

                    when IDLE =>
                        if Start = '1' then
                            DataReg     <= Data;
                            SendRequest <= '1';
                        end if;

                        if SendRequest = '1' and BitTimer = '1' then
                            SendRequest <= '0';
                            BitIndex    <= START_BIT_INDEX;
                            TxReg       <= '0';               -- start bit
                            State       <= START_BIT;
                        end if;

                    when START_BIT =>
                        if BitTimer = '1' then
                            BitIndex <= FIRST_DATA_BIT_INDEX;
                            TxReg    <= Data_Bit(DataReg, FIRST_DATA_BIT_INDEX);
                            State    <= DATA_BITS;
                        end if;

                    when DATA_BITS =>
                        if BitTimer = '1' then
                            if BitIndex = LAST_DATA_BIT_INDEX then
                                BitIndex <= STOP_BIT_INDEX;
                                TxReg    <= '1';              -- stop bit
                                State    <= STOP_BIT;
                            else
                                BitIndex <= BitIndex + 1;
                                TxReg    <= Data_Bit(DataReg, BitIndex + 1);
                            end if;
                        end if;

                    when STOP_BIT =>
                        if BitTimer = '1' then
                            BitIndex    <= START_BIT_INDEX;
                            TxReg       <= '1';               -- line idle
                            CompleteReg <= '1';
                            State       <= IDLE;
                        end if;

                end case;
            end if;
        end if;
    end process FrameTransmitter;

end architecture RTL;
