-- Starter top file for the Nexys A7 board, made by HDLBoard.
-- Buttons: active high, reset button active low. Displays: active low, multiplexed (digit enables active low).
-- Board resources:
--   Board definitions: https://github.com/Digilent/digilent-xdc/blob/master/Nexys-A7-100T-Master.xdc
--   I/O top file: https://github.com/Digilent/Nexys-A7-100T-GPIO/blob/master/src/hdl/top.vhd
library ieee;
use ieee.std_logic_1164.all;

entity starter_top is
    port (
        CLK100MHZ   : in  std_logic;
        CLOCK_500Hz : in  std_logic; -- Simulator only (HDLBoard): delete this port before synthesis.
        SW          : in  std_logic_vector(15 downto 0);
        BTNC        : in  std_logic;
        BTNU        : in  std_logic;
        BTNL        : in  std_logic;
        BTNR        : in  std_logic;
        BTND        : in  std_logic;
        CPU_RESETN  : in  std_logic;
        LED         : out std_logic_vector(15 downto 0);
        CA          : out std_logic;
        CB          : out std_logic;
        CC          : out std_logic;
        CD          : out std_logic;
        CE          : out std_logic;
        CF          : out std_logic;
        CG          : out std_logic;
        DP          : out std_logic;
        AN          : out std_logic_vector(7 downto 0)
    );
end entity;

architecture rtl of starter_top is
begin
    -- The LEDs follow the switches.
    LED <= SW(15 downto 0);
    -- The displays are off.
    CA <= '1';
    CB <= '1';
    CC <= '1';
    CD <= '1';
    CE <= '1';
    CF <= '1';
    CG <= '1';
    DP <= '1';
    AN <= (others => '1');
end architecture;
