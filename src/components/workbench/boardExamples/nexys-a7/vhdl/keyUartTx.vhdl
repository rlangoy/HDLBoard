library ieee;
use ieee.std_logic_1164.all;

-- Press BTNC to send 'A', BTNU to send 'B' over RS-232 (8N1, 9600 baud).
-- The serial line is shown on LED0 (idle high, so the LED is lit when
-- nothing is sent) and LED1 lights while a frame is being transmitted.
-- On real hardware, route Tx to a GPIO pin with a USB-UART adapter.
-- A button press while a frame is still being sent is ignored.
entity keyUartTx is
    generic (
        CLOCK_FREQ : positive := 100_000_000;
        BAUD_RATE  : positive := 9_600
    );
    port (
        CLK100MHZ : in  std_logic;
        BTNC    : in  std_logic;
        BTNU    : in  std_logic;
        LED : out std_logic_vector(15 downto 0)
    );
end entity keyUartTx;

architecture rtl of keyUartTx is

    constant CHAR_A : std_logic_vector(7 downto 0) := x"41";  -- ASCII 'A'
    constant CHAR_B : std_logic_vector(7 downto 0) := x"42";  -- ASCII 'B'

    -- The buttons as they were on the previous clock edge: a press is the
    -- edge where a button goes from released ('0') to pressed ('1').
    signal key_prev     : std_logic_vector(1 downto 0) := "00";
    signal key0_pressed : boolean;
    signal key1_pressed : boolean;

    signal tx_data  : std_logic_vector(7 downto 0) := (others => '0');
    signal tx_start : std_logic := '0';
    signal tx       : std_logic;
    signal tx_busy  : std_logic;

begin

    Transmitter : entity work.UART_Tx
        generic map (
            CLOCK_FREQ => CLOCK_FREQ,
            BAUD_RATE  => BAUD_RATE
        )
        port map (
            Clk      => CLK100MHZ,
            Reset    => '0',
            Data     => tx_data,
            Start    => tx_start,
            Tx       => tx,
            Busy     => tx_busy,
            Complete => open
        );

    key0_pressed <= key_prev(0) = '0' and BTNC = '1';
    key1_pressed <= key_prev(1) = '0' and BTNU = '1';

    -- Picks the character for the pressed button and gives the transmitter
    -- a one-clock Start pulse, but only when it is idle.
    CharacterSelector : process (CLK100MHZ)
    begin
        if rising_edge(CLK100MHZ) then
            key_prev <= BTNU & BTNC;
            tx_start <= '0';

            if tx_busy = '0' then
                if key0_pressed then
                    tx_data  <= CHAR_A;
                    tx_start <= '1';
                elsif key1_pressed then
                    tx_data  <= CHAR_B;
                    tx_start <= '1';
                end if;
            end if;
        end if;
    end process CharacterSelector;

    LED(0)          <= tx;
    LED(1)          <= tx_busy;
    LED(15 downto 2) <= (others => '0');

end architecture rtl;
