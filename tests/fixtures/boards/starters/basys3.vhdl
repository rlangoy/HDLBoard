-- Starter top file for the Basys 3 board, made by HDLBoard.
-- Buttons: active high. Displays: active low, multiplexed (digit enables active low).
-- Board resources:
--   Board definitions: https://github.com/Digilent/Basys3/blob/master/Resources/XDC/Basys3_Master.xdc
--   I/O examples: https://github.com/Digilent/Basys3/blob/master/Projects/GPIO/src/hdl/GPIO_Demo.vhd
library ieee;
use ieee.std_logic_1164.all;

entity starter_top is
    port (
        clk         : in  std_logic;
        CLOCK_500Hz : in  std_logic; -- Simulator only (HDLBoard): delete this port before synthesis.
        sw          : in  std_logic_vector(15 downto 0);
        btnC        : in  std_logic;
        btnU        : in  std_logic;
        btnL        : in  std_logic;
        btnR        : in  std_logic;
        btnD        : in  std_logic;
        led         : out std_logic_vector(15 downto 0);
        seg         : out std_logic_vector(6 downto 0);
        dp          : out std_logic;
        an          : out std_logic_vector(3 downto 0)
    );
end entity;

architecture rtl of starter_top is
begin
    -- The LEDs follow the switches.
    led <= sw(15 downto 0);
    -- The displays are off.
    seg <= (others => '1');
    dp <= '1';
    an <= (others => '1');
end architecture;
