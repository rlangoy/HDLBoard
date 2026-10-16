-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- Example student testbench: tests uart_tx and watches its output with the
-- hdlboard.uart_monitor plugin. Expected stdout: uart_tx_tb.expected.txt
-- (the GUI shows "Hei!" in the tab "TX").

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
library hdlboard;                                -- HDLBoard plugins

entity uart_tx_tb is
end entity;

architecture sim of uart_tx_tb is
  signal clk   : std_logic := '0';
  signal start : std_logic := '0';
  signal data  : std_logic_vector(7 downto 0) := (others => '0');
  signal busy, tx : std_logic;
  constant MSG : string := "Hei!";
begin
  clk <= not clk after 10 ns;                    -- 50 MHz

  dut: entity work.uart_tx
    port map (clk => clk, start => start, data => data, busy => busy, tx => tx);

  mon: entity hdlboard.uart_monitor
    generic map (name => "TX")                   -- baud left at its default (115200)
    port map (rx => tx);

  stim: process
  begin
    wait for 1 us;
    for i in MSG'range loop
      data <= std_logic_vector(to_unsigned(character'pos(MSG(i)), 8));
      wait until rising_edge(clk); start <= '1';
      wait until rising_edge(clk); start <= '0';
      wait until busy = '0';
    end loop;
    wait for 20 us;
    std.env.finish;                              -- a batch run must end by itself
  end process;
end architecture;
