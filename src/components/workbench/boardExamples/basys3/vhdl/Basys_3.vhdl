library ieee;
use ieee.std_logic_1164.all;

-- The Basys 3 top-level interface in the board's own port names
-- (the master XDC), so this file can go straight into Vivado with only a pin
-- assignment added. Only the ports this example uses are declared; every
-- port is optional for the simulator.
entity Basys_3 is
    port (
        sw : in  std_logic_vector(15 downto 0);
        led : out std_logic_vector(15 downto 0)
    );
end entity;

architecture rtl of Basys_3 is
begin
    -- led <= sw; the first thing every student wires up.
    led <= sw;
end architecture;
