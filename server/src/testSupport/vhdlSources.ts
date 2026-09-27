// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Small VHDL designs that exist to provoke one behaviour of the GHDL path each — a
 * syntax error, an elaboration problem, a two-file project, a portless testbench —
 * shared by the characterization tests and the engine tests so the two cannot drift.
 */

export const SYNTAX_ERROR_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity bad is
  port (SW : in std_logic_vector(9 downto 0)
end entity;
`;

/** Has no port the board provides, so the backend cannot recognise it as a board design. */
export const NO_BOARD_PORTS_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity aloof is
  port (a : in std_logic; b : out std_logic);
end entity;

architecture rtl of aloof is
begin
  b <= a;
end architecture;
`;

/**
 * A board port plus one the board does not have, with no default: the generated
 * testbench cannot instantiate it. Today that surfaces as an `internal` error, which
 * is a quirk of the current backend — pinned by the tests, not endorsed.
 */
export const UNKNOWN_INPUT_PORT_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity lonely is
  port (
    SW   : in  std_logic_vector(9 downto 0);
    BTN  : in  std_logic;
    LEDR : out std_logic_vector(9 downto 0)
  );
end entity;

architecture rtl of lonely is
begin
  LEDR <= SW when BTN = '1' else (others => '0');
end architecture;
`;

export const INVERTER_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity inverter is
  port (a : in std_logic_vector(9 downto 0); y : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of inverter is
begin
  y <= not a;
end architecture;
`;

/** Instantiates `inverter` from the other file: a project that spans two files. */
export const INVERTING_TOP_VHDL = `library ieee;
use ieee.std_logic_1164.all;

entity inv_top is
  port (SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0));
end entity;

architecture rtl of inv_top is
begin
  u : entity work.inverter port map (a => SW, y => LEDR);
end architecture;
`;

/** No ports at all: the backend runs it directly, as a self-contained testbench. */
export const PORTLESS_TESTBENCH_VHDL = `entity tb_hello is
end entity;

architecture sim of tb_hello is
begin
  process
  begin
    report "hello one";
    wait for 10 ns;
    report "hello two";
    wait;
  end process;
end architecture;
`;
