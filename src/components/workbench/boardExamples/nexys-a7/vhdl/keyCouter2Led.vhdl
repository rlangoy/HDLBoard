library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- BTNC counts up, BTNU resets; the count is shown on the LEDs.
entity keyCouter2Led is
    port (
        BTNC : in  std_logic;
        BTNU : in  std_logic;
        LED  : out std_logic_vector(15 downto 0)
    );
end entity keyCouter2Led;

architecture rtl of keyCouter2Led is
    signal count : unsigned(7 downto 0) := (others => '0');

begin

    -- A flip-flop is built from one clock edge, plus an optional
    -- asynchronous reset or set tested as a level before it. BTNC is the
    -- clock (a press is its rising edge); BTNU is the reset, active high.
    counter : process (BTNC, BTNU)
    begin
        if BTNU = '1' then
            count <= (others => '0');          -- BTNU held: reset
        elsif rising_edge(BTNC) then
            count <= count + 1;                -- BTNC pressed: count up
        end if;
    end process;

    LED(7 downto 0) <= std_logic_vector(count);
    LED(15 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
