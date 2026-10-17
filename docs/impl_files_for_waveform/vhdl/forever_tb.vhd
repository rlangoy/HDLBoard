-- A testbench that never ends: the size guard must stop it (spec § 7.5).
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity forever_tb is
end entity;

architecture sim of forever_tb is
  type state_t is (idle, run, done);
  signal clk   : std_logic := '0';
  signal count : unsigned(3 downto 0) := (others => '0');
  signal state : state_t := idle;
begin
  clk <= not clk after 5 ns;
  process (clk) begin
    if rising_edge(clk) then
      count <= count + 1;
      case state is
        when idle => state <= run;
        when run  => if count = 15 then state <= done; end if;
        when done => state <= idle;
      end case;
    end if;
  end process;
end architecture;
