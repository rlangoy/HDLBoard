-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
-- The board top of the book-style fixtures: each part wired to the DE1-SoC. HEX0 is
-- sampled with an enable inside the edge condition, as the book's display wrappers do.
library ieee;
use ieee.std_logic_1164.all;

entity DE1_SoC is
   port(
      CLOCK_50: in std_logic;
      KEY: in std_logic_vector(3 downto 0);
      SW: in std_logic_vector(9 downto 0);
      LEDR: out std_logic_vector(9 downto 0);
      HEX0: out std_logic_vector(6 downto 0)
   );
end DE1_SoC;

architecture arch of DE1_SoC is
   signal reset: std_logic;
   signal count: std_logic_vector(3 downto 0);
   signal enable: std_logic;
begin
   reset <= not KEY(0);
   enable <= SW(9);

   flip_flop: entity work.dff_reset
      port map(clk=>CLOCK_50, reset=>reset, d=>SW(0), q=>LEDR(0));
   counter: entity work.mod_counter
      generic map(N=>4, M=>10)
      port map(clk=>CLOCK_50, reset=>reset, max_tick=>LEDR(1), q=>count);
   registers: entity work.reg_file
      generic map(B=>4, W=>2)
      port map(clk=>CLOCK_50, wr_en=>SW(1), w_addr=>SW(3 downto 2), r_addr=>SW(5 downto 4),
               w_data=>SW(9 downto 6), r_data=>LEDR(5 downto 2));
   edges: entity work.edge_fsm
      port map(clk=>CLOCK_50, reset=>reset, level=>KEY(1), tick=>LEDR(6));

   LEDR(9 downto 7) <= count(2 downto 0);

   process(CLOCK_50)
   begin
      if rising_edge(CLOCK_50) and enable='0' then
         HEX0 <= "000" & count;
      end if;
   end process;
end arch;
