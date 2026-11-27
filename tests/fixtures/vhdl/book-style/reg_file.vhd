-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
-- A small register file: one write port, one read port.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity reg_file is
   generic(
      B: integer := 4;
      W: integer := 2
   );
   port(
      clk: in std_logic;
      wr_en: in std_logic;
      w_addr, r_addr: in std_logic_vector(W-1 downto 0);
      w_data: in std_logic_vector(B-1 downto 0);
      r_data: out std_logic_vector(B-1 downto 0)
   );
end reg_file;

architecture arch of reg_file is
   type reg_array is array (2**W-1 downto 0) of std_logic_vector(B-1 downto 0);
   signal array_reg: reg_array;
begin
   process(clk)
   begin
      if (clk'event and clk='1') then
         if wr_en='1' then
            array_reg(to_integer(unsigned(w_addr))) <= w_data;
         end if;
      end if;
   end process;
   r_data <= array_reg(to_integer(unsigned(r_addr)));
end arch;
