library ieee;
use ieee.std_logic_1164.all;

entity alu is
  port (
    a, b : in  std_logic;
    op   : in  std_logic;
    y    : out std_logic
  );
end entity;

architecture rtl of alu is
begin
  y <= (a and b) when op = '0' else (a or b);
end architecture;

library ieee;
use ieee.std_logic_1164.all;

entity alu_tb is
end entity;

architecture sim of alu_tb is
  signal a, b, op, y : std_logic := '0';
begin
  dut : entity work.alu port map (a => a, b => b, op => op, y => y);

  process
  begin
    a <= '1'; b <= '1'; op <= '0';
    wait for 10 ns;
    assert y = '1' report "and failed" severity error;
    wait;
  end process;
end architecture;
