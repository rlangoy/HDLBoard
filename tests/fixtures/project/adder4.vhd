library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- A 4-bit adder: the design under test. No board ports.
entity adder4 is
    port (
        a   : in  unsigned(3 downto 0);
        b   : in  unsigned(3 downto 0);
        sum : out unsigned(4 downto 0)   -- one bit wider: the carry out
    );
end entity;

architecture rtl of adder4 is
begin
    sum <= resize(a, 5) + resize(b, 5);
end architecture;
