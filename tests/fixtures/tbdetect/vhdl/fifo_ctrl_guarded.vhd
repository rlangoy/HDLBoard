library ieee;
use ieee.std_logic_1164.all;

entity fifo_ctrl is
  port (
    clk, push, full : in  std_logic;
    overflow        : out std_logic
  );
end entity;

architecture rtl of fifo_ctrl is
begin
  overflow <= push and full;

  -- synthesis translate_off
  process (clk)
  begin
    if rising_edge(clk) then
      assert not (push = '1' and full = '1') report "push while full" severity warning;
    end if;
  end process;
  -- synthesis translate_on
end architecture;
