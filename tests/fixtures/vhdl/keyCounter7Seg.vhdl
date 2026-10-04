library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Press KEY0 to count up, KEY1 to reset. The count (00..99) is shown in
-- decimal on HEX1 (tens) and HEX0 (ones); the other displays stay blank.
entity keyCounter7Seg is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity keyCounter7Seg;

architecture rtl of keyCounter7Seg is

    -- One digit (0..9) to its segments, active low: bit 0 is segment a,
    -- bit 6 is segment g, and '0' lights a segment.
    function to_segments(digit : integer range 0 to 9) return std_logic_vector is
    begin
        case digit is
            when 0 => return "1000000";
            when 1 => return "1111001";
            when 2 => return "0100100";
            when 3 => return "0110000";
            when 4 => return "0011001";
            when 5 => return "0010010";
            when 6 => return "0000010";
            when 7 => return "1111000";
            when 8 => return "0000000";
            when 9 => return "0010000";
        end case;
    end function;

    signal ones     : integer range 0 to 9 := 0;
    signal tens     : integer range 0 to 9 := 0;
    -- The keys as they were on the previous clock edge: a press is the
    -- edge where a key goes from released ('1') to pressed ('0').
    signal key_prev : std_logic_vector(1 downto 0) := "11";

begin

    process (CLOCK_50)
    begin
        if rising_edge(CLOCK_50) then
            key_prev <= KEY_N(1 downto 0);

            if key_prev(1) = '1' and KEY_N(1) = '0' then         -- KEY1: reset
                ones <= 0;
                tens <= 0;
            elsif key_prev(0) = '1' and KEY_N(0) = '0' then      -- KEY0: count up
                if ones = 9 then
                    ones <= 0;
                    if tens = 9 then
                        tens <= 0;                               -- 99 wraps to 00
                    else
                        tens <= tens + 1;
                    end if;
                else
                    ones <= ones + 1;
                end if;
            end if;
        end if;
    end process;

    HEX0_N <= to_segments(ones);
    HEX1_N <= to_segments(tens);

    -- Unused displays: all segments off (active low).
    HEX2_N <= (others => '1');
    HEX3_N <= (others => '1');
    HEX4_N <= (others => '1');
    HEX5_N <= (others => '1');

end architecture rtl;
