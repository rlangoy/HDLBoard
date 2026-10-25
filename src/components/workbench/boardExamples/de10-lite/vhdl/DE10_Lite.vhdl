library ieee;
use ieee.std_logic_1164.all;

-- The DE10-Lite top-level interface in the board's own port names
-- (the board's pin names), so this file can go straight into Quartus with only a pin
-- assignment added. Only the ports this example uses are declared; every
-- port is optional for the simulator.
entity DE10_Lite is
    port (
        SW : in  std_logic_vector(9 downto 0);
        LEDR : out std_logic_vector(9 downto 0)
    );
end entity;

architecture rtl of DE10_Lite is
begin
    -- LEDR <= SW; the first thing every student wires up.
    LEDR <= SW;
end architecture;
