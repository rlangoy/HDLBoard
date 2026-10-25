library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- BTNC counts up, BTNU resets; the count is shown on the LEDs.
entity counter8 is
    port (
        BTNC    : in  std_logic;
        BTNU    : in  std_logic;
        LED : out std_logic_vector(15 downto 0)
    );
end entity counter8;

architecture rtl of counter8 is
    signal count : unsigned(7 downto 0) := (others => '0');


begin

    process (BTNC, BTNU)
    begin
       if rising_edge(BTNU) then
                count <= (others => '0');          -- BTNU: reset
       elsif rising_edge(BTNC) then
                count <= count + 1;                -- BTNC: count up
       end if;
    end process;

    LED(7 downto 0) <= std_logic_vector(count);
    LED(15 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
