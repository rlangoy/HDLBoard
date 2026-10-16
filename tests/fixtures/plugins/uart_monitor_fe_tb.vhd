-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- Plugin self-test: drives the line directly (no student design) to check
--   1. a framing error is reported as "<hh> FE"
--   2. timestamps beyond 2**31 ns (about 2.1 s) are printed correctly
-- Expected stdout: uart_monitor_fe_tb.expected.txt

library ieee;
use ieee.std_logic_1164.all;
library hdlboard;

entity uart_monitor_fe_tb is
end entity;

architecture sim of uart_monitor_fe_tb is
  constant BIT_T : time := 1 sec / 115200;
  signal line_s : std_logic := '1';
begin
  mon: entity hdlboard.uart_monitor generic map (name => "RX") port map (rx => line_s);

  process
  begin
    wait for 10 us;
    line_s <= '0'; wait for 9 * BIT_T;           -- start bit + data 0x00
    line_s <= '0'; wait for BIT_T;               -- missing stop bit -> FE
    line_s <= '1'; wait for 3 sec;               -- move past 2**31 ns
    line_s <= '0'; wait for BIT_T;               -- start bit
    line_s <= '1'; wait for 9 * BIT_T;           -- data 0xFF + stop bit
    wait for 5 us;
    std.env.finish;
  end process;
end architecture;
