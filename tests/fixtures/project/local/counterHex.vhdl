library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counterHex is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity counterHex;

architecture rtl of counterHex is
    signal count    : unsigned(7 downto 0) := (others => '0');
    signal key_prev : std_logic_vector(1 downto 0) := "11";

    function hex7seg(value : unsigned(3 downto 0))
        return std_logic_vector is
    begin
        case value is
            when x"0" => return "1000000";
            when x"1" => return "1111001";
            when x"2" => return "0100100";
            when x"3" => return "0110000";
            when x"4" => return "0011001";
            when x"5" => return "0010010";
            when x"6" => return "0000010";
            when x"7" => return "1111000";
            when x"8" => return "0000000";
            when x"9" => return "0010000";
            when x"A" => return "0001000";
            when x"B" => return "0000011";
            when x"C" => return "1000110";
            when x"D" => return "0100001";
            when x"E" => return "0000110";
            when x"F" => return "0001110";
            when others => return "1111111";
        end case;
    end function;

begin

    process(KEY_N(1 downto 0))
    begin
        if key_prev(1) = '1' and KEY_N(1) = '0' then
            count <= (others => '0');
        elsif key_prev(0) = '1' and KEY_N(0) = '0' then
            count <= count + 1;
        end if;

        key_prev <= KEY_N(1 downto 0);
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= "00";

    HEX0_N <= hex7seg(count(3 downto 0));
    HEX1_N <= hex7seg(count(7 downto 4));

    HEX2_N <= "1111111";
    HEX3_N <= "1111111";
    HEX4_N <= "1111111";
    HEX5_N <= "1111111";

end architecture rtl;
