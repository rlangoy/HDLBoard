library ieee;
use ieee.std_logic_1164.all;

-- Press btnC to count from 00 to 99; btnU resets the count.
-- CLOCK_500Hz is provided by HDLBoard, not by the physical board.
entity keyCounter7Seg is
    port (
        CLOCK_500Hz : in  std_logic;
        btnC        : in  std_logic;
        btnU        : in  std_logic;
        seg         : out std_logic_vector(6 downto 0);
        dp          : out std_logic;
        an          : out std_logic_vector(3 downto 0)
    );
end entity;

architecture rtl of keyCounter7Seg is
    -- Segment bits are gfedcba; a zero lights a segment.
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

    signal ones, tens : integer range 0 to 9 := 0;
    signal previous_count_button : std_logic := '0';
    signal refresh_count : integer range 0 to 100 := 0;
    signal show_tens : std_logic := '0';
begin
    process (CLOCK_500Hz)
    begin
        if rising_edge(CLOCK_500Hz) then
            -- Count once when the button changes from released to pressed.
            previous_count_button <= btnC;
            if btnU = '1' then
                ones <= 0;
                tens <= 0;
            elsif btnC = '1' and previous_count_button = '0' then
                if ones = 9 then
                    ones <= 0;
                    if tens = 9 then
                        tens <= 0;
                    else
                        tens <= tens + 1;
                    end if;
                else
                    ones <= ones + 1;
                end if;
            end if;

            -- Switch digits every 4 clock cycles (8 ms). Each digit is
            -- refreshed at 62.5 Hz; the remaining digits stay blank.
            -- Change the comparison to 100 to see the multiplexing happen.
            if refresh_count = 3 then
                refresh_count <= 0;
                show_tens <= not show_tens;
            else
                refresh_count <= refresh_count + 1;
            end if;
        end if;
    end process;

    seg <= to_segments(ones) when show_tens = '0' else to_segments(tens);
    an <= "1110" when show_tens = '0' else "1101";
    dp <= '1'; -- Decimal point off (active low).
end architecture;
