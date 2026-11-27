-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
-- A D flip-flop with an asynchronous reset, written with clk'event in parentheses.
library ieee;
use ieee.std_logic_1164.all;

entity dff_reset is
   port(
      clk, reset: in std_logic;
      d: in std_logic;
      q: out std_logic
   );
end dff_reset;

architecture arch of dff_reset is
begin
   process(clk, reset)
   begin
      if (reset='1') then
         q <= '0';
      elsif (clk'event and clk='1') then
         q <= d;
      end if;
   end process;
end arch;
