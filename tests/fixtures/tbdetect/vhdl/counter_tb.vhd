library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter_tb is
end entity;

architecture sim of counter_tb is
  signal clk   : std_logic := '0';
  signal reset : std_logic := '1';
  signal q     : unsigned(7 downto 0);
begin
  dut : entity work.counter
    port map (clk => clk, reset => reset, q => q);

  clk <= not clk after 10 ns;

  stimulus : process
  begin
    wait for 25 ns;
    reset <= '0';
    wait for 200 ns;
    assert q = 10 report "count should be 10" severity error;
    std.env.stop;
    wait;
  end process;
end architecture;
