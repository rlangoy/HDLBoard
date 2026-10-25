library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- btnC counts up, btnU resets; the count is shown on the LEDs.
entity counter8 is
    port (
        btnC    : in  std_logic;
        btnU    : in  std_logic;
        led : out std_logic_vector(15 downto 0)
    );
end entity counter8;

architecture rtl of counter8 is
    signal count : unsigned(7 downto 0) := (others => '0');


begin

    process (btnC, btnU)
    begin
       if rising_edge(btnU) then
                count <= (others => '0');          -- btnU: reset
       elsif rising_edge(btnC) then
                count <= count + 1;                -- btnC: count up
       end if;
    end process;

    led(7 downto 0) <= std_logic_vector(count);
    led(15 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
