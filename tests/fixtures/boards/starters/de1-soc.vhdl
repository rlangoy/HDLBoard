-- Starter top file for the DE1-SoC board, made by HDLBoard.
-- Buttons: active low. Displays: active low.
library ieee;
use ieee.std_logic_1164.all;

entity starter_top is
    port (
        CLOCK_50    : in  std_logic;
        CLOCK_500Hz : in  std_logic; -- Simulator only (HDLBoard): delete this port before synthesis.
        SW          : in  std_logic_vector(9 downto 0);
        KEY         : in  std_logic_vector(3 downto 0);
        LEDR        : out std_logic_vector(9 downto 0);
        HEX0        : out std_logic_vector(6 downto 0);
        HEX1        : out std_logic_vector(6 downto 0);
        HEX2        : out std_logic_vector(6 downto 0);
        HEX3        : out std_logic_vector(6 downto 0);
        HEX4        : out std_logic_vector(6 downto 0);
        HEX5        : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of starter_top is
begin
    -- The LEDs follow the switches.
    LEDR <= SW(9 downto 0);
    -- The displays are off.
    HEX0 <= (others => '1');
    HEX1 <= (others => '1');
    HEX2 <= (others => '1');
    HEX3 <= (others => '1');
    HEX4 <= (others => '1');
    HEX5 <= (others => '1');
end architecture;
