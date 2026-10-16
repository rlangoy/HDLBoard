-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- PROTOTYPE (feasibility study, not shipped) - passive SPI monitor.
-- Settings are generics with defaults (no plugin config). Payload grammar of kind "spi":
--   B                          chip select asserted
--   <mosi hex> <miso hex>      one word, MSB first
--   E                          chip select released
library ieee;
use ieee.std_logic_1164.all;
use work.hdlb_pkg.all;

entity spi_monitor is
  generic (
    name : string   := "spi";
    cpol : natural range 0 to 1 := 0;
    cpha : natural range 0 to 1 := 0;
    bits : positive range 1 to 32 := 8
  );
  port (cs_n, sclk, mosi, miso : in std_logic);
end entity;

architecture behav of spi_monitor is
  -- Modes 0 and 3 sample on the rising edge, modes 1 and 2 on the falling edge.
  constant SAMPLE_RISING : boolean := cpol = cpha;
begin
  assert hdlb_is_ident(name) report "spi_monitor: bad name" severity failure;

  process
    variable n    : natural := 0;
    variable m, s : std_logic_vector(bits - 1 downto 0) := (others => '0');
    variable cp, sp : std_logic := '1';
    variable c, k   : std_logic;
    variable edge   : boolean;
  begin
    wait on cs_n, sclk;
    c := to_x01(cs_n); k := to_x01(sclk);
    if cp = '1' and c = '0' then
      hdlb_emit("spi", name, "B"); n := 0;
    elsif cp = '0' and c = '1' then
      hdlb_emit("spi", name, "E"); n := 0;
    elsif c = '0' and sp /= k then
      edge := (SAMPLE_RISING and k = '1') or (not SAMPLE_RISING and k = '0');
      if edge then
        m := m(bits - 2 downto 0) & to_x01(mosi);
        s := s(bits - 2 downto 0) & to_x01(miso);
        n := n + 1;
        if n = bits then
          hdlb_emit("spi", name, to_hstring(m) & " " & to_hstring(s));
          n := 0;
        end if;
      end if;
    end if;
    cp := c; sp := k;
  end process;
end architecture;
