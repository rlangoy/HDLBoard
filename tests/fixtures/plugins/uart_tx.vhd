-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- Example "student design": a synthesizable UART transmitter (8N1).
-- Used by uart_tx_tb.vhd to show the uart_monitor plugin in use.

library ieee;
use ieee.std_logic_1164.all;

entity uart_tx is
  generic (CLK_HZ : positive := 50_000_000; BAUD : positive := 115200);
  port (
    clk   : in  std_logic;
    start : in  std_logic;                       -- one clock pulse starts a byte
    data  : in  std_logic_vector(7 downto 0);
    busy  : out std_logic;
    tx    : out std_logic
  );
end entity;

architecture rtl of uart_tx is
  constant DIV : positive := CLK_HZ / BAUD;
  signal cnt : natural range 0 to DIV - 1 := 0;
  signal idx : natural range 0 to 9 := 0;
  signal sh  : std_logic_vector(9 downto 0) := (others => '1');  -- stop & data & start
  signal act : std_logic := '0';
begin
  tx   <= sh(0) when act = '1' else '1';
  busy <= act;

  process (clk)
  begin
    if rising_edge(clk) then
      if act = '0' then
        if start = '1' then
          sh <= '1' & data & '0'; act <= '1'; cnt <= 0; idx <= 0;
        end if;
      elsif cnt = DIV - 1 then
        cnt <= 0;
        if idx = 9 then
          act <= '0';
        else
          idx <= idx + 1; sh <= '1' & sh(9 downto 1);
        end if;
      else
        cnt <= cnt + 1;
      end if;
    end if;
  end process;
end architecture;
