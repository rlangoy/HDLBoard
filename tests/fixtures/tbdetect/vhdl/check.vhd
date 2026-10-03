library ieee;
use ieee.std_logic_1164.all;

entity check is
end entity;

architecture sim of check is
  signal clk, done : std_logic := '0';
begin
  dut : entity work.counter_done port map (clk => clk, done => done);

  process
  begin
    wait until done = '1';
  end process;
end architecture;
