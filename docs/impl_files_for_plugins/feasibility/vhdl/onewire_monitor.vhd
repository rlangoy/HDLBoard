-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- PROTOTYPE (feasibility study, not shipped) - passive 1-Wire monitor (standard speed).
-- dq is an input; the testbench supplies the pull-up ('H'). Payload grammar of kind "onewire":
--   RESET | PRESENCE | NOPRESENCE
--   <hh>                       one bus byte, LSB first (direction is not visible on the wire)
-- A slot is classified by sampling the line 14 us after the falling edge, which separates
-- write-1 / read-1 (line released early) from write-0 / read-0 (line still low).
library ieee;
use ieee.std_logic_1164.all;
use work.hdlb_pkg.all;

entity onewire_monitor is
  generic (name : string := "onewire");
  port (dq : in std_logic);
end entity;

architecture behav of onewire_monitor is
begin
  assert hdlb_is_ident(name) report "onewire_monitor: bad name" severity failure;

  process
    variable t0 : time;
    variable b  : std_logic_vector(7 downto 0) := (others => '0');
    variable n  : natural := 0;
  begin
    wait until falling_edge(dq);
    t0 := now;
    wait until rising_edge(dq) for 14 us;
    if to_x01(dq) = '1' then                          -- released early: a 1
      b := '1' & b(7 downto 1); n := n + 1;
    else
      wait until rising_edge(dq) for 466 us;          -- 480 us in total
      if to_x01(dq) = '0' then                        -- still low: reset pulse
        hdlb_emit("onewire", name, "RESET");
        n := 0;
        wait until rising_edge(dq);
        wait until falling_edge(dq) for 300 us;
        if to_x01(dq) = '0' then
          hdlb_emit("onewire", name, "PRESENCE");
          wait until rising_edge(dq);
        else
          hdlb_emit("onewire", name, "NOPRESENCE");
        end if;
      else                                            -- low for 14..480 us: a 0
        b := '0' & b(7 downto 1); n := n + 1;
      end if;
    end if;
    if n = 8 then
      hdlb_emit("onewire", name, to_hstring(b)); n := 0;
    end if;
  end process;
end architecture;
