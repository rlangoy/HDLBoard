library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- KEY0 counts up, KEY1 resets; the count is shown on the LEDs.
entity keyCouter2Led is
    port (
        KEY  : in  std_logic_vector(1 downto 0);
        LEDR : out std_logic_vector(9 downto 0)
    );
end entity keyCouter2Led;

architecture rtl of keyCouter2Led is
    signal count : unsigned(7 downto 0) := (others => '0');

begin

    -- Quartus builds a flip-flop from one clock edge, plus an optional
    -- asynchronous reset or set tested as a level before it. KEY(0) is the
    -- clock (a press is its falling edge); KEY(1) is the reset, active low.
    counter : process (KEY)
    begin
        if KEY(1) = '0' then
            count <= (others => '0');          -- KEY1 held: reset
        elsif falling_edge(KEY(0)) then
            count <= count + 1;                -- KEY0 pressed: count up
        end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
