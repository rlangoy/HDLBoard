-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- PROTOTYPE (feasibility study, not shipped) - passive I2C monitor.
-- Watches an open-drain bus; scl and sda are inputs and the testbench supplies
-- the pull-ups ('H'). Payload grammar of kind "i2c":
--   S | Sr | P                 start, repeated start, stop
--   ADDR <hh> <R|W> <A|N>      first byte after a start: 7-bit address in hex, direction, ACK/NACK
--   DATA <hh> <A|N>            further bytes
library ieee;
use ieee.std_logic_1164.all;
use work.hdlb_pkg.all;

entity i2c_monitor is
  generic (name : string := "i2c");
  port (scl, sda : in std_logic);
end entity;

architecture behav of i2c_monitor is
begin
  assert hdlb_is_ident(name) report "i2c_monitor: bad name" severity failure;

  process
    variable busy, first : boolean := false;
    variable n      : natural := 0;
    variable sh     : std_logic_vector(7 downto 0) := (others => '0');
    variable sp, dp : std_logic := '1';
    variable s, d   : std_logic;
    variable r      : string(1 to 1);
  begin
    wait on scl, sda;
    s := to_x01(scl); d := to_x01(sda);
    if sp = '1' and s = '1' and dp = '1' and d = '0' then          -- SDA falls while SCL high
      if busy then hdlb_emit("i2c", name, "Sr"); else hdlb_emit("i2c", name, "S"); end if;
      busy := true; first := true; n := 0;
    elsif sp = '1' and s = '1' and dp = '0' and d = '1' then       -- SDA rises while SCL high
      if busy then hdlb_emit("i2c", name, "P"); end if;
      busy := false; n := 0;
    elsif sp = '0' and s = '1' and busy then                       -- SCL rising: sample SDA
      if n < 8 then
        sh := sh(6 downto 0) & d; n := n + 1;
      else                                                         -- 9th clock: ACK bit
        r(1) := 'A'; if d = '1' then r(1) := 'N'; end if;
        if first then
          if sh(0) = '1' then
            hdlb_emit("i2c", name, "ADDR " & to_hstring("0" & sh(7 downto 1)) & " R " & r);
          else
            hdlb_emit("i2c", name, "ADDR " & to_hstring("0" & sh(7 downto 1)) & " W " & r);
          end if;
          first := false;
        else
          hdlb_emit("i2c", name, "DATA " & to_hstring(sh) & " " & r);
        end if;
        n := 0;
      end if;
    end if;
    sp := s; dp := d;
  end process;
end architecture;
