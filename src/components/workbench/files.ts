/* ------------------------------------------------------------------ *
 * Starter project shown in the Files panel — a plausible small design
 * (top-level entity, two helper modules, a package and a testbench) so
 * the workbench opens looking like a project mid-course, not empty.
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
        KEY      : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0     : out std_logic_vector(6 downto 0);
        HEX1     : out std_logic_vector(6 downto 0);
        HEX2     : out std_logic_vector(6 downto 0);
        HEX3     : out std_logic_vector(6 downto 0);
        HEX4     : out std_logic_vector(6 downto 0);
        HEX5     : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    -- LEDR <= SW; the first thing every student wires up.
    LEDR <= SW;

    -- Blank until you add your own 7-segment logic (see display7seg.vhd)
    -- — active low, so all-ones is "off".
    HEX0 <= (others => '1');
    HEX1 <= (others => '1');
    HEX2 <= (others => '1');
    HEX3 <= (others => '1');
    HEX4 <= (others => '1');
    HEX5 <= (others => '1');
end architecture;
`;

const DISPLAY7SEG_VHD = `library ieee;
use ieee.std_logic_1164.all;

entity display7seg is
    port (
        nibble : in  std_logic_vector(3 downto 0);
        seg    : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of display7seg is
begin
    -- Active low: '0' lights a segment; MSB-first "gfedcba"
    process(nibble) is
    begin
        case nibble is
            when "0000" => seg <= "1000000"; -- 0
            when "0001" => seg <= "1111001"; -- 1
            when "0010" => seg <= "0100100"; -- 2
            when "0011" => seg <= "0110000"; -- 3
            when "0100" => seg <= "0011001"; -- 4
            when "0101" => seg <= "0010010"; -- 5
            when "0110" => seg <= "0000010"; -- 6
            when "0111" => seg <= "1111000"; -- 7
            when "1000" => seg <= "0000000"; -- 8
            when "1001" => seg <= "0011000"; -- 9, open tail
            when "1010" => seg <= "0001000"; -- A
            when "1011" => seg <= "0000011"; -- b
            when "1100" => seg <= "1000110"; -- C
            when "1101" => seg <= "0100001"; -- d
            when "1110" => seg <= "0000110"; -- E
            when "1111" => seg <= "0001110"; -- F
            when others => seg <= "1111111";
        end case;
    end process;
end architecture;
`;

const LEDS_VHD = `library ieee;
use ieee.std_logic_1164.all;

entity leds is
    port (
        sw  : in  std_logic_vector(9 downto 0);
        led : out std_logic_vector(9 downto 0)
    );
end entity;

architecture rtl of leds is
begin
    -- LEDR <= SW, the first thing every student wires up
    led <= sw;
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

const UTILITY_PKG_VHD = `library ieee;
use ieee.std_logic_1164.all;

package utility_pkg is
    function hex7seg(nibble : std_logic_vector(3 downto 0))
        return std_logic_vector;
end package;

package body utility_pkg is
    function hex7seg(nibble : std_logic_vector(3 downto 0))
        return std_logic_vector is
    begin
        case nibble is
            when "0000" => return "1000000";
            when "0001" => return "1111001";
            when others => return "1111111";
        end case;
    end function;
end package body;
`;

const TB_DE1_SOC_VHD = `library ieee;
use ieee.std_logic_1164.all;

-- A student's own offline testbench (work/) — separate from, and never
-- sent to, the interactive board simulator, which generates its own.
entity tb_de1_soc is
end entity;

architecture sim of tb_de1_soc is
    signal clock_50 : std_logic := '0';
    signal sw       : std_logic_vector(9 downto 0) := (others => '0');
    signal key      : std_logic_vector(3 downto 0) := (others => '1');
    signal ledr     : std_logic_vector(9 downto 0);
    signal hex0, hex1, hex2, hex3, hex4, hex5 : std_logic_vector(6 downto 0);
begin
    clock_50 <= not clock_50 after 10 ns;

    uut : entity work.DE1_SoC
        port map (
            CLOCK_50 => clock_50,
            SW       => sw,
            KEY      => key,
            LEDR     => ledr,
            HEX0     => hex0,
            HEX1     => hex1,
            HEX2     => hex2,
            HEX3     => hex3,
            HEX4     => hex4,
            HEX5     => hex5
        );

    stim : process is
    begin
        wait for 20 ns;
        sw <= "0000000001";
        wait;
    end process;
end architecture;
`;

export const STARTER_FILES: VhdlFile[] = [
  { id: 'de1_soc', name: 'DE1_SoC.vhd', folder: 'vhdl', content: DE1_SOC_VHD },
  { id: 'display7seg', name: 'display7seg.vhd', folder: 'vhdl', content: DISPLAY7SEG_VHD },
  { id: 'leds', name: 'leds.vhd', folder: 'vhdl', content: LEDS_VHD },
  { id: 'buttons', name: 'buttons.vhd', folder: 'vhdl', content: BUTTONS_VHD },
  { id: 'utility_pkg', name: 'utility_pkg.vhd', folder: 'vhdl', content: UTILITY_PKG_VHD },
  { id: 'tb_de1_soc', name: 'tb_de1_soc.vhd', folder: 'work', content: TB_DE1_SOC_VHD },
];

export const DEFAULT_OPEN_TABS = ['de1_soc', 'display7seg', 'leds', 'buttons'];

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'DE1_SoC.vhd';
