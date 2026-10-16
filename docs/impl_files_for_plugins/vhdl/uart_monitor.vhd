-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- uart_monitor - HDLBoard reference plugin (library hdlboard).
-- See ../../plugin_batch_implementation_plan.md.
--
-- Behavioural UART receiver (8N1, LSB first) that watches one serial line
-- and reports every received byte to the GUI as
--
--   @@HDLB uart <name> <t_ns> <hh>        byte received
--   @@HDLB uart <name> <t_ns> <hh> FE     byte received, stop bit was '0'
--
-- It is the far end of the cable, not FPGA logic: it is not meant to be
-- synthesizable, and `wait for` costs almost nothing in simulation.
-- All settings are generics with defaults - there is no plugin config.

library ieee;
use ieee.std_logic_1164.all;
use work.hdlb_pkg.all;             -- work = hdlboard when this file is analysed

entity uart_monitor is
  generic (
    name : string   := "uart";     -- instance name = GUI tab ([A-Za-z_][A-Za-z0-9_]*)
    baud : positive := 115200
  );
  port (
    rx : in std_logic              -- the line being watched (typically the design's TX)
  );
end entity;

architecture behav of uart_monitor is
  constant BIT_T : time := 1 sec / baud;
begin
  process
    variable b : std_logic_vector(7 downto 0);
  begin
    wait until falling_edge(rx);                 -- start bit
    wait for BIT_T / 2;                          -- middle of the start bit
    if rx = '0' then                             -- ignore glitches shorter than half a bit
      for i in 0 to 7 loop
        wait for BIT_T;
        b(i) := rx;                              -- LSB first
      end loop;
      wait for BIT_T;                            -- middle of the stop bit
      if rx = '1' then
        hdlb_emit("uart", name, to_hstring(b));
      else
        hdlb_emit("uart", name, to_hstring(b) & " FE");   -- framing error
      end if;
    end if;
  end process;
end architecture;
