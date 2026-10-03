library ieee;
use ieee.std_logic_1164.all;

entity and_gate_tb is
end entity and_gate_tb;

architecture sim of and_gate_tb is

    signal a : std_logic := '0';
    signal b : std_logic := '0';
    signal y : std_logic;

begin

    -- Unit Under Test
    uut : entity work.and_gate(rtl)
        port map (
            a => a,
            b => b,
            y => y
        );

    -- Test stimulus and verification
    process
    begin

        -- Test 1: 0 AND 0 = 0
        a <= '0';
        b <= '0';
        wait for 10 ns;

        assert y = '0'
            report "Test 1 failed: 0 AND 0 should be 0"
            severity error;


        -- Test 2: 0 AND 1 = 0
        a <= '0';
        b <= '1';
        wait for 10 ns;

        assert y = '0'
            report "Test 2 failed: 0 AND 1 should be 0"
            severity error;


        -- Test 3: 1 AND 0 = 0
        a <= '1';
        b <= '0';
        wait for 10 ns;

        assert y = '0'
            report "Test 3 failed: 1 AND 0 should be 0"
            severity error;


        -- Test 4: 1 AND 1 = 1
        a <= '1';
        b <= '1';
        wait for 10 ns;

        assert y = '1'
            report "Test 4 failed: 1 AND 1 should be 1"
            severity error;


        report "All tests passed" severity note;

        wait;
    end process;

end architecture sim;
