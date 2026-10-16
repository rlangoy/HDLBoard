-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- Plugin self-test of the receiver semantics documented in uart_monitor.vhd.
-- Expected stdout: uart_monitor_edge_tb.expected.txt
--
--   line A (115200 baud, default)          line B (9600 baud, generic)
--   1. initial 'U' -> '1'   : no output    5. "Hi" at 9600 baud
--   2. glitch of 1/4 bit    : no output
--   3. 55 AA 0F back-to-back, no idle gap beyond the stop bit
--   4. data bit 3 undefined : XX

library ieee;
use ieee.std_logic_1164.all;
library hdlboard;

entity uart_monitor_edge_tb is
end entity;

architecture sim of uart_monitor_edge_tb is
  constant BIT_A : time := 1 sec / 115200;
  constant BIT_B : time := 1 sec / 9600;
  signal a : std_logic;                          -- starts as 'U'
  signal b : std_logic := '1';

  procedure send_byte(signal s : out std_logic; v : std_logic_vector(7 downto 0); bt : time) is
  begin
    s <= '0'; wait for bt;                       -- start bit
    for i in 0 to 7 loop s <= v(i); wait for bt; end loop;
    s <= '1'; wait for bt;                       -- stop bit
  end procedure;
begin
  mon_a: entity hdlboard.uart_monitor generic map (name => "A")                port map (rx => a);
  mon_b: entity hdlboard.uart_monitor generic map (name => "B", baud => 9600)  port map (rx => b);

  process
  begin
    wait for 2 us;
    a <= '1'; wait for 10 us;                    -- 1. U -> 1 is not a falling edge
    a <= '0'; wait for BIT_A / 4;                -- 2. glitch, line is '1' again at mid-bit
    a <= '1'; wait for 2 * BIT_A;
    send_byte(a, x"55", BIT_A);                  -- 3. no gap between the calls
    send_byte(a, x"AA", BIT_A);
    send_byte(a, x"0F", BIT_A);
    wait for 5 * BIT_A;
    send_byte(a, "0000X000", BIT_A);             -- 4. bit 3 undefined
    wait for 5 * BIT_A;
    send_byte(b, x"48", BIT_B);                  -- 5. 'H' at 9600 baud
    send_byte(b, x"69", BIT_B);                  --    'i'
    wait for 2 * BIT_B;
    std.env.finish;
  end process;
end architecture;
