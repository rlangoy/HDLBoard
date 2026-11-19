library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- btnC counts up, btnU resets; the count is shown on the LEDs.
entity keyCouter2Led is
    port (
        btnC : in  std_logic;
        btnU : in  std_logic;
        led  : out std_logic_vector(15 downto 0)
    );
end entity keyCouter2Led;

architecture rtl of keyCouter2Led is
    signal count : unsigned(7 downto 0) := (others => '0');

begin

    -- A flip-flop is built from one clock edge, plus an optional
    -- asynchronous reset or set tested as a level before it. btnC is the
    -- clock (a press is its rising edge); btnU is the reset, active high.
    counter : process (btnC, btnU)
    begin
        if btnU = '1' then
            count <= (others => '0');          -- btnU held: reset
        elsif rising_edge(btnC) then
            count <= count + 1;                -- btnC pressed: count up
        end if;
    end process;

    led(7 downto 0) <= std_logic_vector(count);
    led(15 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
