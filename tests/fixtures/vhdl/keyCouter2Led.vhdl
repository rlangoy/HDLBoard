library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- KEY_N(0) counts up, KEY_N(1) resets; the count is shown on LEDR(7 downto 0).
entity keyCouter2Led is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity keyCouter2Led;

architecture rtl of keyCouter2Led is
    signal count : unsigned(7 downto 0) := (others => '0');

begin

    -- A flip-flop is built from one clock edge, plus an optional
    -- asynchronous reset or set tested as a level before it. KEY_N(0) is the
    -- clock (a press is its falling edge); KEY_N(1) is the reset, active low.
    counter : process (KEY_N)
    begin
        if KEY_N(1) = '0' then
            count <= (others => '0');          -- KEY_N(1) held: reset
        elsif falling_edge(KEY_N(0)) then
            count <= count + 1;                -- KEY_N(0) pressed: count up
        end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
