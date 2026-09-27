library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter8 is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity counter8;

architecture rtl of counter8 is
    signal count : unsigned(7 downto 0) := (others => '0');


begin

    process (CLOCK_50, KEY_N)
    begin
       if falling_edge(KEY_N(1)) then
                count <= (others => '0');          -- KEY_N(1): reset
       elsif falling_edge(KEY_N(0)) then
                count <= count + 1;                -- KEY_N(0): count up
       end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
