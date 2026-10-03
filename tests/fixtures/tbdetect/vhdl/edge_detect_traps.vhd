library ieee;
use ieee.std_logic_1164.all;

-- clk <= not clk after 5 ns;   (old testbench line, kept as a note)
entity edge_detect is
  port (
    clk  : in  std_logic;
    sig  : in  std_logic;
    rise : out std_logic
  );
end entity;

architecture rtl of edge_detect is
  signal last : std_logic := '0';
  constant NOTE : string := "wait for 10 ns";
begin
  /* wait for 10 ns; */
  process (clk)
  begin
    if clk'event and clk = '1' then
      rise <= sig and not last;
      last <= sig;
    end if;
  end process;
end architecture;
