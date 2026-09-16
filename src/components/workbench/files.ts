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

const TOP_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity top is
    port (
        clk : in  std_logic;
        rst : in  std_logic;

        -- I/O to the board
        led : out std_logic_vector(9 downto 0);
        hex : out std_logic_vector(6 downto 0);
        sw  : in  std_logic_vector(9 downto 0);
        key : in  std_logic_vector(3 downto 0);
        btn : in  std_logic_vector(3 downto 0)
    );
end entity;

architecture rtl of top is
    signal led_reg : std_logic_vector(9 downto 0);
begin
    -- Example: copy switches to leds
    process(clk, rst) is
    begin
        if rst = '1' then
            led_reg <= (others => '0');
        elsif rising_edge(clk) then
            led_reg <= sw;
        end if;
    end process;

    led <= led_reg;

    -- Add your own logic for 7-seg, buttons etc.
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

const TB_TOP_VHD = `library ieee;
use ieee.std_logic_1164.all;

entity tb_top is
end entity;

architecture sim of tb_top is
    signal clk : std_logic := '0';
    signal rst : std_logic := '1';
    signal sw  : std_logic_vector(9 downto 0) := (others => '0');
    signal key : std_logic_vector(3 downto 0) := (others => '1');
    signal btn : std_logic_vector(3 downto 0) := (others => '1');
    signal led : std_logic_vector(9 downto 0);
    signal hex : std_logic_vector(6 downto 0);
begin
    clk <= not clk after 10 ns;

    uut : entity work.top
        port map (
            clk => clk,
            rst => rst,
            led => led,
            hex => hex,
            sw  => sw,
            key => key,
            btn => btn
        );

    stim : process is
    begin
        wait for 20 ns;
        rst <= '0';
        wait;
    end process;
end architecture;
`;

export const STARTER_FILES: VhdlFile[] = [
  { id: 'top', name: 'top.vhd', folder: 'vhdl', content: TOP_VHD },
  { id: 'display7seg', name: 'display7seg.vhd', folder: 'vhdl', content: DISPLAY7SEG_VHD },
  { id: 'leds', name: 'leds.vhd', folder: 'vhdl', content: LEDS_VHD },
  { id: 'buttons', name: 'buttons.vhd', folder: 'vhdl', content: BUTTONS_VHD },
  { id: 'utility_pkg', name: 'utility_pkg.vhd', folder: 'vhdl', content: UTILITY_PKG_VHD },
  { id: 'tb_top', name: 'tb_top.vhd', folder: 'work', content: TB_TOP_VHD },
];

export const DEFAULT_OPEN_TABS = ['top', 'display7seg', 'leds', 'buttons'];

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'top.vhd';
