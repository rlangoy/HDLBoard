library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- KEY0 counts up, KEY1 counts down; the count is shown on LEDR(7 downto 0).
--
-- SIM-ONLY ON PURPOSE: this is what NOT to write for an FPGA. It runs in
-- the simulator, but synthesis rejects it, so HDLBoard labels it SIM-only.
--
-- Why: the process below reacts to two clock edges, one per key. A register
-- (a flip-flop) on the FPGA has ONE clock input. It allows one clock edge,
-- plus an optional asynchronous reset or set, and nothing more. There is no
-- flip-flop that can count on the edges of two different clocks, so
-- synthesis stops with "can't infer register for count ... because its
-- behavior depends on the edges of multiple distinct clocks".
--
-- How to do it on the board: use ONE clock (CLOCK_50), and sample the keys
-- on it: a press is a key that was released one clock ago and is pressed
-- now. keyCounter7Seg.vhdl does exactly that.
entity keyCounterTwoClocks is
    port (
        KEY   : in  std_logic_vector(1 downto 0);
        LEDR  : out std_logic_vector(9 downto 0)
    );
end entity keyCounterTwoClocks;

architecture rtl of keyCounterTwoClocks is
    signal count : unsigned(7 downto 0) := (others => '0');
    signal up    : std_logic;   -- '1' while KEY0 is pressed
    signal down  : std_logic;   -- '1' while KEY1 is pressed

begin

    up   <= not KEY(0);       -- the keys are active low
    down <= not KEY(1);

    counter : process (up, down)
    begin
        if rising_edge(up) then         -- first clock: KEY0 pressed
            count <= count + 1;
        elsif rising_edge(down) then    -- second clock: KEY1 pressed -> error
            count <= count - 1;
        end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
