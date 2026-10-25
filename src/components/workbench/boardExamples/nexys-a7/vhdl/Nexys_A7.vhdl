library ieee;
use ieee.std_logic_1164.all;

-- The Nexys A7 top-level interface in the board's own port names
-- (the master XDC), so this file can go straight into Vivado with only a pin
-- assignment added. Only the ports this example uses are declared; every
-- port is optional for the simulator.
entity Nexys_A7 is
    port (
        SW : in  std_logic_vector(15 downto 0);
        LED : out std_logic_vector(15 downto 0)
    );
end entity;

architecture rtl of Nexys_A7 is
begin
    -- LED <= SW; the first thing every student wires up.
    LED <= SW;
end architecture;
