library ieee;
use ieee.std_logic_1164.all;

entity DE1_SoC is
  port (
    SW   : in  std_logic_vector(9 downto 0);
    LEDR : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of DE1_SoC is
begin
  LEDR <= SW after 2 ns;
end architecture;
