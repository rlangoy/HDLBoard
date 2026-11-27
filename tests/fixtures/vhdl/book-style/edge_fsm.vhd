-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
-- A Moore machine that gives one tick for each rising edge of its input.
library ieee;
use ieee.std_logic_1164.all;

entity edge_fsm is
   port(
      clk, reset: in std_logic;
      level: in std_logic;
      tick: out std_logic
   );
end edge_fsm;

architecture moore_arch of edge_fsm is
   type state_type is (zero, edg, one);
   signal state_reg, state_next: state_type;
begin
   -- state register
   process(clk, reset)
   begin
      if (reset='1') then
         state_reg <= zero;
      elsif (clk'event and clk='1') then
         state_reg <= state_next;
      end if;
   end process;
   -- next-state and output logic
   process(state_reg, level)
   begin
      state_next <= state_reg;
      tick <= '0';
      case state_reg is
         when zero =>
            if level='1' then
               state_next <= edg;
            end if;
         when edg =>
            tick <= '1';
            if level='1' then
               state_next <= one;
            else
               state_next <= zero;
            end if;
         when one =>
            if level='0' then
               state_next <= zero;
            end if;
      end case;
   end process;
end moore_arch;
