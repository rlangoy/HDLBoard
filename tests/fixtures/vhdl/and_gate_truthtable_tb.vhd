-- Tests the AND gate and prints its truth table.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity and_gate_truthtable_tb is
end entity and_gate_truthtable_tb;

architecture sim of and_gate_truthtable_tb is

    signal a : std_logic := '0';
    signal b : std_logic := '0';
    signal y : std_logic;

begin

    -- Device Under Test
    uut : entity work.and_gate
        port map (
            a => a,
            b => b,
            y => y
        );

    -- Test process
    process
        variable pattern : std_logic_vector(1 downto 0);
        variable expected : std_logic;
    begin

        report "AND Truth Table" severity note;
        report "--------------"  severity note;
        report " A   B  |  Y  "  severity note;
        report "--------+-----"  severity note;

        -- Test all four input combinations
        for i in 0 to 3 loop

            -- Generate A and B
            pattern := std_logic_vector(to_unsigned(i, 2));

            a <= pattern(1);
            b <= pattern(0);

            -- Wait for the DUT to respond
            wait for 10 ns;

            -- Calculate expected result
            expected := a and b;

            -- Print truth table row
            report
                std_logic'image(a) & " " &
                std_logic'image(b) & " | " &
                std_logic'image(y)
                severity note;

            -- Check result
            assert y = expected
                report
                    "ERROR: " &
                    std_logic'image(a) & " AND " &
                    std_logic'image(b) & " should be " &
                    std_logic'image(expected) &
                    ", but got " &
                    std_logic'image(y)
                severity error;

        end loop;

        report "--------------" severity note;
        report "All tests passed!" severity note;

        wait;
    end process;

end architecture sim;
