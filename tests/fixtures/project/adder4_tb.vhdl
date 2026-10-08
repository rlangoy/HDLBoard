library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Testbench for adder4: no ports, so it runs on its own (no board).
entity adder4_tb is
end entity;

architecture sim of adder4_tb is
    signal a, b : unsigned(3 downto 0) := (others => '0');
    signal sum  : unsigned(4 downto 0);
begin
    dut: entity work.adder4
        port map (a => a, b => b, sum => sum);

    stimulus: process
        variable expected : natural;
        variable failed   : natural := 0;
    begin
        -- Every combination of a and b: 16 x 16 = 256 cases.
        for i in 0 to 15 loop
            for j in 0 to 15 loop
                a <= to_unsigned(i, 4);
                b <= to_unsigned(j, 4);
                wait for 10 ns;
                expected := i + j;
                if to_integer(sum) /= expected then
                    failed := failed + 1;
                    report integer'image(i) & " + " & integer'image(j) & " gave "
                         & integer'image(to_integer(sum)) severity error;
                end if;
            end loop;
        end loop;

        -- A few samples, so the console shows what was checked.
        a <= "0011"; b <= "0101"; wait for 10 ns;
        report "3 + 5 = " & integer'image(to_integer(sum));
        a <= "1111"; b <= "0001"; wait for 10 ns;
        report "15 + 1 = " & integer'image(to_integer(sum)) & " (carry out)";
        a <= "1111"; b <= "1111"; wait for 10 ns;
        report "15 + 15 = " & integer'image(to_integer(sum));

        if failed = 0 then
            report "PASS: all 256 additions correct";
        else
            report "FAIL: " & integer'image(failed) & " of 256 wrong" severity error;
        end if;
        wait;   -- done
    end process;
end architecture;
