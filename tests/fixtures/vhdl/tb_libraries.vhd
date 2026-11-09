-- Simulation-only smoke test for the packages in the supplied example.
-- GHDL commands:
--   ghdl -a --std=08 -fsynopsys tb_libraries.vhd
--   ghdl -e --std=08 -fsynopsys tb_libraries
--   ghdl -r --std=08 -fsynopsys tb_libraries --assert-level=error
--
-- The legacy Synopsys packages require -fsynopsys in GHDL.
-- Qualified names avoid conflicts between numeric packages and operators.
-- For new RTL designs, normally use std_logic_1164 and numeric_std only.

library IEEE;
use IEEE.std_logic_1164.all;
use IEEE.std_logic_textio.all;
use IEEE.std_logic_arith.all;
use IEEE.numeric_bit.all;
use IEEE.numeric_std.all;
use IEEE.std_logic_signed.all;
use IEEE.std_logic_unsigned.all;
use IEEE.math_real.all;
use IEEE.math_complex.all;

library STD;
use STD.standard;
use STD.textio;

entity tb_libraries is
end entity;

architecture test of tb_libraries is
begin
    tests : process
        variable u : IEEE.numeric_std.unsigned(7 downto 0);
        variable b : IEEE.numeric_bit.unsigned(7 downto 0);
        variable v : std_logic_vector(7 downto 0);
        variable z : IEEE.math_complex.complex;
        variable l : STD.textio.line;
        variable n : STD.standard.integer;
        variable good : boolean;
    begin
        report "Starting library tests";

        -- Test basic logic from std_logic_1164.
        assert (std_logic'('1') and std_logic'('0')) = '0'
            report "std_logic_1164 failed" severity failure;

        -- Test unsigned arithmetic on std_logic-based vectors.
        u := IEEE.numeric_std."+"
             (IEEE.numeric_std.to_unsigned(12, 8),
              IEEE.numeric_std.to_unsigned(5, 8));
        assert IEEE.numeric_std.to_integer(u) = 17
            report "numeric_std failed" severity failure;

        -- Test unsigned arithmetic on bit-based vectors.
        b := IEEE.numeric_bit."+"
             (IEEE.numeric_bit.to_unsigned(9, 8),
              IEEE.numeric_bit.to_unsigned(6, 8));
        assert IEEE.numeric_bit.to_integer(b) = 15
            report "numeric_bit failed" severity failure;

        -- Test the legacy integer-to-vector conversion.
        v := IEEE.std_logic_arith.conv_std_logic_vector(42, 8);
        assert IEEE.std_logic_1164."="(v, std_logic_vector'(x"2A"))
            report "std_logic_arith failed" severity failure;

        -- The same bit pattern has different signed and unsigned meanings.
        v := x"FE";
        assert IEEE.std_logic_signed.conv_integer(v) = -2
            report "std_logic_signed conversion failed" severity failure;
        assert IEEE.std_logic_unsigned.conv_integer(v) = 254
            report "std_logic_unsigned conversion failed" severity failure;

        -- Call each legacy addition operator explicitly.
        v := IEEE.std_logic_signed."+"(std_logic_vector'(x"FE"), 1);
        assert IEEE.std_logic_signed.conv_integer(v) = -1
            report "std_logic_signed addition failed" severity failure;

        v := IEEE.std_logic_unsigned."+"(std_logic_vector'(x"FE"), 1);
        assert IEEE.std_logic_unsigned.conv_integer(v) = 255
            report "std_logic_unsigned addition failed" severity failure;

        -- Use a tolerance when comparing real-valued calculations.
        assert abs(IEEE.math_real.sqrt(9.0) - 3.0) < 1.0E-6
            report "math_real failed" severity failure;

        -- The magnitude of 3 + 4j is 5.
        z := (re => 3.0, im => 4.0);
        assert abs(IEEE.math_complex."abs"(z) - 5.0) < 1.0E-6
            report "math_complex failed" severity failure;

        -- Write and read an integer using an in-memory text line.
        STD.textio.write(l, 123);
        STD.textio.read(l, n, good);
        assert good and n = 123
            report "textio integer round trip failed" severity failure;
        STD.textio.deallocate(l);

        -- Exercise the hexadecimal text I/O interface.
        -- In VHDL-2008 these routines are provided by std_logic_1164;
        -- std_logic_textio remains available as a compatibility package.
        hwrite(l, std_logic_vector'(x"A5"));
        hread(l, v, good);
        assert good and IEEE.std_logic_1164."="(v, std_logic_vector'(x"A5"))
            report "Logic text I/O round trip failed" severity failure;
        STD.textio.deallocate(l);

        -- Send a text line to the simulator console.
        STD.textio.write(l, string'("All library tests passed."));
        STD.textio.writeline(STD.textio.output, l);
        wait;
    end process;
end architecture;
