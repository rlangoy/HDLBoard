-- Starter top file for the Default board, made by HDLBoard.
-- Buttons: active low. Displays: active low.
library ieee;
use ieee.std_logic_1164.all;

entity starter_top is
    port (
        CLOCK_50    : in  std_logic;
        CLOCK_500Hz : in  std_logic; -- Simulator only (HDLBoard): delete this port before synthesis.
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

architecture rtl of starter_top is
begin
    -- The LEDs follow the switches.
    LEDR <= SW(9 downto 0);
    -- The displays are off.
    HEX0_N <= (others => '1');
    HEX1_N <= (others => '1');
    HEX2_N <= (others => '1');
    HEX3_N <= (others => '1');
    HEX4_N <= (others => '1');
    HEX5_N <= (others => '1');
end architecture;
