library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Only the ports this example uses are declared (CLOCK_500Hz is the
-- simulator's own slow clock): every port is optional for the simulator.
entity blinkTest is
    port (
        CLOCK_500Hz : in  std_logic;
        LED : out std_logic_vector(15 downto 0)
    );
end entity;

architecture rtl of blinkTest is

    -- 500 Hz clock -> 500 cycles per second
    -- For 2 Hz blink (LED toggles every 250 ms):
    -- Toggle period = 1 / (2 * 2 Hz) = 250 ms
    -- Cycles per toggle = 0.25 s * 500 = 125
    constant TOGGLE_COUNT : integer := 125;

    signal counter   : integer range 0 to TOGGLE_COUNT - 1 := 0;
    signal led_state : std_logic := '0';

begin

    process(CLOCK_500Hz)
    begin
        if rising_edge(CLOCK_500Hz) then
            if counter = TOGGLE_COUNT - 1 then
                counter   <= 0;
                led_state <= not led_state;
            else
                counter <= counter + 1;
            end if;
        end if;
    end process;

    -- Drive all 16 LEDs with the same blinking signal
    LED <= (others => led_state);

end architecture;
