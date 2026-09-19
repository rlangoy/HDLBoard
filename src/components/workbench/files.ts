// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * Starter project shown in the Files panel — the DE1-SoC top-level
 * entity plus a few small example designs, so the workbench opens
 * looking like a project mid-course, not empty.
 * ------------------------------------------------------------------ */

export interface VhdlFile {
  id: string;
  name: string;
  /** Folder the file tree groups it under. */
  folder: 'vhdl' | 'work';
  content: string;
}

const DE1_SOC_VHD = `library ieee;
use ieee.std_logic_1164.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    -- LEDR <= SW; the first thing every student wires up.
    LEDR <= SW;

    -- Blank until you add your own 7-segment logic — active low, so
    -- all-ones is "off".
    HEX0_N <= (others => '1');
    HEX1_N <= (others => '1');
    HEX2_N <= (others => '1');
    HEX3_N <= (others => '1');
    HEX4_N <= (others => '1');
    HEX5_N <= (others => '1');
end architecture;
`;

const BUTTONS_VHD = `library ieee;
use ieee.std_logic_1164.all;

entity buttons is
    port (
        clk  : in  std_logic;
        key  : in  std_logic_vector(3 downto 0);
        held : out std_logic_vector(3 downto 0)
    );
end entity;

architecture rtl of buttons is
begin
    -- KEY is active low: '0' means held
    process(clk) is
    begin
        if rising_edge(clk) then
            held <= not key;
        end if;
    end process;
end architecture;
`;

const BLINK_TEST_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity blinkTest is
    port (
        CLOCK_500Hz : in  std_logic;
        SW          : in  std_logic_vector(9 downto 0);
        KEY_N       : in  std_logic_vector(3 downto 0);
        LEDR        : out std_logic_vector(9 downto 0);
        HEX0_N      : out std_logic_vector(6 downto 0);
        HEX1_N      : out std_logic_vector(6 downto 0);
        HEX2_N      : out std_logic_vector(6 downto 0);
        HEX3_N      : out std_logic_vector(6 downto 0);
        HEX4_N      : out std_logic_vector(6 downto 0);
        HEX5_N      : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of blinkTest is

    -- 500 Hz clock -> 500 cycles per second
    -- For 2 Hz blink (LED toggles every 250 ms):
    -- Toggle period = 1 / (2 * 2 Hz) = 250 ms
    -- Cycles per toggle = 0.25 s * 500 = 125
    constant TOGGLE_COUNT : integer := 125;

    signal counter   : integer range 0 to TOGGLE_COUNT - 1 := 0;
    signal led_state : std_logic := '0';

begin

    process(CLOCK_500Hz)
    begin
        if rising_edge(CLOCK_500Hz) then
            if counter = TOGGLE_COUNT - 1 then
                counter   <= 0;
                led_state <= not led_state;
            else
                counter <= counter + 1;
            end if;
        end if;
    end process;

    -- Drive all 10 LEDs with the same blinking signal
    LEDR <= (others => led_state);

end architecture;
`;

const KEY_COUNTER_2_LED_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter8 is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity counter8;

architecture rtl of counter8 is
    signal count : unsigned(7 downto 0) := (others => '0');


begin

    process (CLOCK_50, KEY_N)
    begin
       if falling_edge(KEY_N(1)) then
                count <= (others => '0');          -- KEY_N(1): reset
       elsif falling_edge(KEY_N(0)) then
                count <= count + 1;                -- KEY_N(0): count up
       end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
`;

export const STARTER_FILES: VhdlFile[] = [
  { id: 'de1_soc', name: 'DE1_SoC.vhdl', folder: 'vhdl', content: DE1_SOC_VHD },
  { id: 'buttons', name: 'buttons.vhd', folder: 'vhdl', content: BUTTONS_VHD },
  { id: 'blink_test', name: 'blinkTest.vhdl', folder: 'vhdl', content: BLINK_TEST_VHD },
  { id: 'key_counter_2_led', name: 'keyCouter2Led.vhdl', folder: 'vhdl', content: KEY_COUNTER_2_LED_VHD },
];

export const DEFAULT_OPEN_TABS = ['de1_soc', 'buttons'];

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'DE1_SoC.vhdl';
