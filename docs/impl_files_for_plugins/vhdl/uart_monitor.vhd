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
--   @@HDLB uart <name> <t_ns> <hh> FE     byte received, stop bit was not '1'
--   @@HDLB uart <name> <t_ns> XX [FE]     a data bit was undefined (U, X, Z, W, -)
--
-- Behaviour (8N1, LSB first):
--   * A start bit is a falling edge '1' -> '0'. U -> '0' and X -> '0' are not edges.
--   * The line is sampled in the middle of each bit. Changes between two samples
--     (glitches) are not seen; a start bit that is no longer '0' half a bit later
--     is ignored.
--   * Back-to-back bytes work: after the stop bit is sampled (half a bit before its
--     end) the monitor is already waiting for the next falling edge.
--   * One line per byte. After a framing error the monitor does not resynchronise
--     inside the frame; it waits for the next falling edge. If the line is held low
--     (a break) there is none until it returns high.
--   * baud must be at most 10 Mbaud: timestamps are whole nanoseconds.
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
  assert hdlb_is_ident(name)
    report "uart_monitor: generic name must match [A-Za-z_][A-Za-z0-9_]*, got """ & name & """"
    severity failure;
  assert baud <= 10_000_000
    report "uart_monitor: baud must be at most 10000000"
    severity failure;

  process
    variable b       : std_logic_vector(7 downto 0);
    variable unknown : boolean;
    variable stop_ok : boolean;
  begin
    wait until falling_edge(rx);                 -- start bit
    wait for BIT_T / 2;                          -- middle of the start bit
    if to_x01(rx) = '0' then                     -- ignore glitches shorter than half a bit
      unknown := false;
      for i in 0 to 7 loop
        wait for BIT_T;
        b(i) := to_x01(rx);                      -- LSB first; U, X, Z, W, - become 'X'
        if b(i) = 'X' then unknown := true; end if;
      end loop;
      wait for BIT_T;                            -- middle of the stop bit
      stop_ok := to_x01(rx) = '1';
      if unknown then
        if stop_ok then hdlb_emit("uart", name, "XX");
        else            hdlb_emit("uart", name, "XX FE");
        end if;
      elsif stop_ok then
        hdlb_emit("uart", name, to_hstring(b));
      else
        hdlb_emit("uart", name, to_hstring(b) & " FE");   -- framing error
      end if;
    end if;
  end process;
end architecture;
