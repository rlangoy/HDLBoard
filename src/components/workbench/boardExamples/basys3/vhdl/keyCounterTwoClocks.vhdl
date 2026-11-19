library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- btnU counts up, btnD counts down; the count is shown on led(7 downto 0).
--
-- SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
-- the simulator, but synthesis rejects it, so HDLBoard labels it SIM-only.
--
-- Why: the process below reacts to two clock edges, one per button. A
-- register (a flip-flop) on the FPGA has ONE clock input. It allows one
-- clock edge, plus an optional asynchronous reset or set, and nothing more.
-- There is no flip-flop that can count on the edges of two different
-- clocks, so synthesis stops ("register clocked by two different clocks").
--
-- How to do it on the board: use ONE clock (clk), and sample the buttons
-- on it: a press is a button that was released one clock ago and is
-- pressed now. keyCounter7Seg.vhdl does exactly that.
entity keyCounterTwoClocks is
    port (
        btnU : in  std_logic;
        btnD : in  std_logic;
        led  : out std_logic_vector(15 downto 0)
    );
end entity keyCounterTwoClocks;

architecture rtl of keyCounterTwoClocks is
    signal count : unsigned(7 downto 0) := (others => '0');

begin

    counter : process (btnU, btnD)
    begin
        if rising_edge(btnU) then         -- first clock: btnU pressed
            count <= count + 1;
        elsif rising_edge(btnD) then      -- second clock: btnD pressed -> error
            count <= count - 1;
        end if;
    end process;

    led(7 downto 0) <= std_logic_vector(count);
    led(15 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
