library ieee;
use ieee.std_logic_1164.all;

entity sync_reg is
  generic (WIDTH : positive);
  port (
    clk : in  std_logic;
    d   : in  std_logic_vector(WIDTH - 1 downto 0);
    q   : out std_logic_vector(WIDTH - 1 downto 0)
  );
end entity;

architecture rtl of sync_reg is
begin
  assert WIDTH <= 32 report "WIDTH too large" severity failure;

  process
  begin
    wait until rising_edge(clk);
    q <= d after 1 ns;
  end process;
end architecture;
