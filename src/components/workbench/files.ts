// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * The built-in source files: the DE1-SoC top-level entity plus a few
 * small example designs, each in VHDL and Verilog (the Verilog ones sit in
 * `verilog/`). A fresh workspace starts with only the two top-level files
 * (STARTER_FILES); the rest are offered by the Examples pane (examples.ts),
 * which copies one into the Files panel when it is opened.
 * ------------------------------------------------------------------ */

export interface VhdlFile {
  id: string;
  name: string;
  /** Folder the file tree groups it under. */
  folder: 'vhdl' | 'verilog' | 'work';
  content: string;
}

const DE1_SOC_VHD = `library ieee;
use ieee.std_logic_1164.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity DE1_SoC is
    port (
        CLOCK_50 : in  std_logic;
        SW       : in  std_logic_vector(9 downto 0);
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0);
        HEX0_N   : out std_logic_vector(6 downto 0);
        HEX1_N   : out std_logic_vector(6 downto 0);
        HEX2_N   : out std_logic_vector(6 downto 0);
        HEX3_N   : out std_logic_vector(6 downto 0);
        HEX4_N   : out std_logic_vector(6 downto 0);
        HEX5_N   : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of DE1_SoC is
begin
    -- LEDR <= SW; the first thing every student wires up.
    LEDR <= SW;

    -- Blank until you add your own 7-segment logic — active low, so
    -- all-ones is "off".
    HEX0_N <= (others => '1');
    HEX1_N <= (others => '1');
    HEX2_N <= (others => '1');
    HEX3_N <= (others => '1');
    HEX4_N <= (others => '1');
    HEX5_N <= (others => '1');
end architecture;
`;

const BLINK_TEST_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- The real DE1-SoC top-level interface: these are the board's own pin
-- names, not a stand-in for them, so this file can go straight into
-- Quartus with only a pin assignment added. Every port here is optional
-- for the simulator — a design that only declares SW and LEDR is a
-- perfectly normal first lab.
entity blinkTest is
    port (
        CLOCK_500Hz : in  std_logic;
        SW          : in  std_logic_vector(9 downto 0);
        KEY_N       : in  std_logic_vector(3 downto 0);
        LEDR        : out std_logic_vector(9 downto 0);
        HEX0_N      : out std_logic_vector(6 downto 0);
        HEX1_N      : out std_logic_vector(6 downto 0);
        HEX2_N      : out std_logic_vector(6 downto 0);
        HEX3_N      : out std_logic_vector(6 downto 0);
        HEX4_N      : out std_logic_vector(6 downto 0);
        HEX5_N      : out std_logic_vector(6 downto 0)
    );
end entity;

architecture rtl of blinkTest is

    -- 500 Hz clock -> 500 cycles per second
    -- For 2 Hz blink (LED toggles every 250 ms):
    -- Toggle period = 1 / (2 * 2 Hz) = 250 ms
    -- Cycles per toggle = 0.25 s * 500 = 125
    constant TOGGLE_COUNT : integer := 125;

    signal counter   : integer range 0 to TOGGLE_COUNT - 1 := 0;
    signal led_state : std_logic := '0';

begin

    process(CLOCK_500Hz)
    begin
        if rising_edge(CLOCK_500Hz) then
            if counter = TOGGLE_COUNT - 1 then
                counter   <= 0;
                led_state <= not led_state;
            else
                counter <= counter + 1;
            end if;
        end if;
    end process;

    -- Drive all 10 LEDs with the same blinking signal
    LEDR <= (others => led_state);

end architecture;
`;

const KEY_COUNTER_2_LED_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter8 is
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity counter8;

architecture rtl of counter8 is
    signal count : unsigned(7 downto 0) := (others => '0');


begin

    process (CLOCK_50, KEY_N)
    begin
       if falling_edge(KEY_N(1)) then
                count <= (others => '0');          -- KEY_N(1): reset
       elsif falling_edge(KEY_N(0)) then
                count <= count + 1;                -- KEY_N(0): count up
       end if;
    end process;

    LEDR(7 downto 0) <= std_logic_vector(count);
    LEDR(9 downto 8) <= (others => '0');           -- unused LEDs off

end architecture rtl;
`;

const DE1_SOC_V = `// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module DE1_SoC (
    input  wire        CLOCK_50,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // LEDR = SW; the first thing every student wires up.
    assign LEDR = SW;

    // Blank until you add your own 7-segment logic - active low, so
    // all-ones is "off".
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
`;

const BLINK_TEST_V = `// The real DE1-SoC top-level interface: these are the board's own pin
// names, not a stand-in for them, so this file can go straight into
// Quartus with only a pin assignment added. Every port here is optional
// for the simulator - a design that only declares SW and LEDR is a
// perfectly normal first lab.
module blinkTest (
    input  wire        CLOCK_500Hz,
    input  wire [9:0]  SW,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // 500 Hz clock -> 500 cycles per second
    // For 2 Hz blink (LED toggles every 250 ms):
    // Toggle period = 1 / (2 * 2 Hz) = 250 ms
    // Cycles per toggle = 0.25 s * 500 = 125
    localparam TOGGLE_COUNT = 125;
    // Wide enough for any TOGGLE_COUNT: a fixed [6:0] would stop at 127 and never
    // reach a larger count, so the LEDs would not blink (the VHDL integer range
    // sizes itself; a Verilog reg does not).
    localparam COUNTER_WIDTH = $clog2(TOGGLE_COUNT + 1);

    reg [COUNTER_WIDTH-1:0] counter = 0;   // counts 0 .. TOGGLE_COUNT-1
    reg       led_state = 1'b0;

    always @(posedge CLOCK_500Hz) begin
        if (counter == TOGGLE_COUNT - 1) begin
            counter   <= 0;
            led_state <= ~led_state;
        end else begin
            counter <= counter + 1'b1;
        end
    end

    // Drive all 10 LEDs with the same blinking signal
    assign LEDR = {10{led_state}};

    // The VHDL original leaves these outputs undriven; Verilog would read
    // them as high-impedance, so they are blanked explicitly (active low).
    assign HEX0_N = 7'b1111111;
    assign HEX1_N = 7'b1111111;
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
`;

const KEY_COUNTER_2_LED_V = `module counter8 (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [9:0]  LEDR
);
    reg [7:0] count    = 8'd0;
    reg [1:0] key_prev = 2'b11;

    // KEY_N[1]: reset, KEY_N[0]: count up. Both act on a button *press*,
    // i.e. the falling edge of the active-low key.
    always @(KEY_N[1:0]) begin
        if (key_prev[1] && !KEY_N[1])
            count <= 8'd0;
        else if (key_prev[0] && !KEY_N[0])
            count <= count + 8'd1;
        key_prev <= KEY_N[1:0];
    end

    assign LEDR[7:0] = count;
    assign LEDR[9:8] = 2'b00;          // unused LEDs off
endmodule
`;

const KEY_COUNTER_7SEG_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

-- Press KEY0 to count up, KEY1 to reset. The count (00..99) is shown in
-- decimal on HEX1_N (tens) and HEX0_N (ones); the other displays stay blank.
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
`;

const KEY_COUNTER_7SEG_V = `// Press KEY0 to count up, KEY1 to reset. The count (00..99) is shown in
// decimal on HEX1_N (tens) and HEX0_N (ones); the other displays stay blank.
module keyCounter7Seg (
    input  wire        CLOCK_50,
    input  wire [3:0]  KEY_N,
    output wire [6:0]  HEX0_N,
    output wire [6:0]  HEX1_N,
    output wire [6:0]  HEX2_N,
    output wire [6:0]  HEX3_N,
    output wire [6:0]  HEX4_N,
    output wire [6:0]  HEX5_N
);
    // One digit (0..9) to its segments, active low: bit 0 is segment a,
    // bit 6 is segment g, and 0 lights a segment.
    function [6:0] to_segments(input [3:0] digit);
        case (digit)
            4'd0: to_segments = 7'b1000000;
            4'd1: to_segments = 7'b1111001;
            4'd2: to_segments = 7'b0100100;
            4'd3: to_segments = 7'b0110000;
            4'd4: to_segments = 7'b0011001;
            4'd5: to_segments = 7'b0010010;
            4'd6: to_segments = 7'b0000010;
            4'd7: to_segments = 7'b1111000;
            4'd8: to_segments = 7'b0000000;
            4'd9: to_segments = 7'b0010000;
            default: to_segments = 7'b1111111;
        endcase
    endfunction

    reg [3:0] ones = 4'd0;
    reg [3:0] tens = 4'd0;
    // The keys as they were on the previous clock edge: a press is the
    // edge where a key goes from released (1) to pressed (0).
    reg [1:0] key_prev = 2'b11;

    always @(posedge CLOCK_50) begin
        key_prev <= KEY_N[1:0];

        if (key_prev[1] && !KEY_N[1]) begin              // KEY1: reset
            ones <= 4'd0;
            tens <= 4'd0;
        end else if (key_prev[0] && !KEY_N[0]) begin     // KEY0: count up
            if (ones == 4'd9) begin
                ones <= 4'd0;
                tens <= (tens == 4'd9) ? 4'd0 : tens + 4'd1; // 99 wraps to 00
            end else begin
                ones <= ones + 4'd1;
            end
        end
    end

    assign HEX0_N = to_segments(ones);
    assign HEX1_N = to_segments(tens);

    // Unused displays: all segments off (active low).
    assign HEX2_N = 7'b1111111;
    assign HEX3_N = 7'b1111111;
    assign HEX4_N = 7'b1111111;
    assign HEX5_N = 7'b1111111;
endmodule
`;

const AND_GATE_VHD = `library ieee;
use ieee.std_logic_1164.all;

entity and_gate is
    port (
        a : in  std_logic;
        b : in  std_logic;
        y : out std_logic
    );
end entity and_gate;

architecture rtl of and_gate is
begin
    y <= a and b;
end architecture rtl;
`;

const AND_GATE_TB_VHD = `library ieee;
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
`;

const AND_GATE_V = `module and_gate (
    input  wire a,
    input  wire b,
    output wire y
);
    assign y = a & b;
endmodule
`;

const AND_GATE_TB_V = `// Self-checking testbench: no ports, so it runs on its own (batch mode).
module and_gate_tb;

    reg  a = 1'b0;
    reg  b = 1'b0;
    wire y;

    // Unit Under Test
    and_gate uut (
        .a(a),
        .b(b),
        .y(y)
    );

    integer errors = 0;

    // Test stimulus and verification
    initial begin

        // Test 1: 0 AND 0 = 0
        a = 1'b0;
        b = 1'b0;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 1 failed: 0 AND 0 should be 0");
            errors = errors + 1;
        end

        // Test 2: 0 AND 1 = 0
        a = 1'b0;
        b = 1'b1;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 2 failed: 0 AND 1 should be 0");
            errors = errors + 1;
        end

        // Test 3: 1 AND 0 = 0
        a = 1'b1;
        b = 1'b0;
        #10;
        if (y !== 1'b0) begin
            $display("ERROR: Test 3 failed: 1 AND 0 should be 0");
            errors = errors + 1;
        end

        // Test 4: 1 AND 1 = 1
        a = 1'b1;
        b = 1'b1;
        #10;
        if (y !== 1'b1) begin
            $display("ERROR: Test 4 failed: 1 AND 1 should be 1");
            errors = errors + 1;
        end

        if (errors == 0) $display("All tests passed");
        else             $display("%0d test(s) failed", errors);

        $finish;
    end

endmodule
`;

const AND_GATE_TRUTHTABLE_TB_VHD = `-- Tests the AND gate and prints its truth table.
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
`;

const AND_GATE_TRUTHTABLE_TB_V = `// Tests the AND gate and prints its truth table.
\`timescale 1ns/1ps

module and_gate_truthtable_tb;

    reg a;
    reg b;
    wire y;

    // Device Under Test
    and_gate uut (
        .a(a),
        .b(b),
        .y(y)
    );

    integer i;
    integer j;
    reg expected;

    initial begin

        $display("");
        $display("AND Truth Table");
        $display("---------------");
        $display("A B | Y");
        $display("---+---");

        // Test all four input combinations
        for (i = 0; i <= 1; i = i + 1) begin
            for (j = 0; j <= 1; j = j + 1) begin

                a = i;
                b = j;

                #10;

                expected = a & b;

                // Print truth table row
                $display("%d %d | %d", a, b, y);

                // Check result
                if (y !== expected) begin
                    $display(
                        "ERROR: %d AND %d should be %d, but got %d",
                        a, b, expected, y
                    );
                end

            end
        end

        $display("---------------");
        $display("All tests passed!");

        $finish;
    end

endmodule
`;

// Key to UART Tx: a board design that sends a character per key press through an RS-232
// transmitter, and a testbench that shows one frame in the waveform.
const KEY_UART_TX_VHD = `library ieee;
use ieee.std_logic_1164.all;

-- Press KEY0 to send 'A', KEY1 to send 'B' over RS-232 (8N1, 9600 baud).
-- The serial line is shown on LEDR0 (idle high, so the LED is lit when
-- nothing is sent) and LEDR1 lights while a frame is being transmitted.
-- On real hardware, route Tx to a GPIO pin with a USB-UART adapter.
-- A key press while a frame is still being sent is ignored.
entity keyUartTx is
    generic (
        CLOCK_FREQ : positive := 50_000_000;
        BAUD_RATE  : positive := 9_600
    );
    port (
        CLOCK_50 : in  std_logic;
        KEY_N    : in  std_logic_vector(3 downto 0);
        LEDR     : out std_logic_vector(9 downto 0)
    );
end entity keyUartTx;

architecture rtl of keyUartTx is

    constant CHAR_A : std_logic_vector(7 downto 0) := x"41";  -- ASCII 'A'
    constant CHAR_B : std_logic_vector(7 downto 0) := x"42";  -- ASCII 'B'

    -- The keys as they were on the previous clock edge: a press is the
    -- edge where a key goes from released ('1') to pressed ('0').
    signal key_prev     : std_logic_vector(1 downto 0) := "11";
    signal key0_pressed : boolean;
    signal key1_pressed : boolean;

    signal tx_data  : std_logic_vector(7 downto 0) := (others => '0');
    signal tx_start : std_logic := '0';
    signal tx       : std_logic;
    signal tx_busy  : std_logic;

begin

    Transmitter : entity work.UART_Tx
        generic map (
            CLOCK_FREQ => CLOCK_FREQ,
            BAUD_RATE  => BAUD_RATE
        )
        port map (
            Clk      => CLOCK_50,
            Reset    => '0',
            Data     => tx_data,
            Start    => tx_start,
            Tx       => tx,
            Busy     => tx_busy,
            Complete => open
        );

    key0_pressed <= key_prev(0) = '1' and KEY_N(0) = '0';
    key1_pressed <= key_prev(1) = '1' and KEY_N(1) = '0';

    -- Picks the character for the pressed key and gives the transmitter
    -- a one-clock Start pulse, but only when it is idle.
    CharacterSelector : process (CLOCK_50)
    begin
        if rising_edge(CLOCK_50) then
            key_prev <= KEY_N(1 downto 0);
            tx_start <= '0';

            if tx_busy = '0' then
                if key0_pressed then
                    tx_data  <= CHAR_A;
                    tx_start <= '1';
                elsif key1_pressed then
                    tx_data  <= CHAR_B;
                    tx_start <= '1';
                end if;
            end if;
        end if;
    end process CharacterSelector;

    LEDR(0)          <= tx;
    LEDR(1)          <= tx_busy;
    LEDR(9 downto 2) <= (others => '0');

end architecture rtl;
`;

const UART_TX_VHD = `-- The transmitter's states, in a package so that a testbench can show
-- them too (UART_Tx_tb copies uut's State into its own signal).
--   IDLE      : line high, wait for Start and then for BitTimer
--   START_BIT : '0' on Tx for one bit period
--   DATA_BITS : the 8 data bits on Tx, LSB first
--   STOP_BIT  : '1' on Tx for one bit period
package UART_Tx_pkg is
    type StateType is (IDLE, START_BIT, DATA_BITS, STOP_BIT);
end package UART_Tx_pkg;

library ieee;
use ieee.std_logic_1164.all;
use work.UART_Tx_pkg.all;

-- Transmits one byte as RS-232 8N1: a frame of 10 bits on the Tx line.
--   BitIndex 0    : start bit ('0')
--   BitIndex 1..8 : data bits, LSB first (Data(0) .. Data(7))
--   BitIndex 9    : stop bit ('1')
--
-- BitTimer is a free-running baud tick: a one-clock pulse once every bit
-- period. Tx only changes on the clock edge that ends a BitTimer pulse,
-- so every bit - the start bit included - is placed on Tx by BitTimer.
--
--   Start    : one-clock pulse; Data is latched when Start is seen in IDLE.
--              The start bit is sent on the next BitTimer tick.
--   Busy     : high from Start until the frame has been sent.
--   Complete : one-clock pulse at the end of the stop bit.
entity UART_Tx is
    generic (
        CLOCK_FREQ : positive := 50_000_000;
        BAUD_RATE  : positive := 9_600
    );
    port (
        Clk      : in  std_logic;
        Reset    : in  std_logic;
        Data     : in  std_logic_vector(7 downto 0);
        Start    : in  std_logic;

        Tx       : out std_logic;
        Busy     : out std_logic;
        Complete : out std_logic
    );
end entity UART_Tx;

architecture RTL of UART_Tx is

    constant CLKS_PER_BIT : positive := CLOCK_FREQ / BAUD_RATE;

    -- The states are in UART_Tx_pkg, at the top of this file.
    signal State : StateType := IDLE;

    -- Position of the current bit in the 10-bit frame
    constant START_BIT_INDEX      : natural := 0;
    constant FIRST_DATA_BIT_INDEX : natural := 1;
    constant LAST_DATA_BIT_INDEX  : natural := 8;
    constant STOP_BIT_INDEX       : natural := 9;

    -- ClkCnt counts the clocks within one bit period. BitTimer is a
    -- one-clock tick on the last clock of the period: on the next clock
    -- edge the next bit is placed on Tx.
    signal ClkCnt      : natural range 0 to CLKS_PER_BIT - 1 := 0;
    signal BitTimer    : std_logic;

    signal BitIndex    : natural range START_BIT_INDEX to STOP_BIT_INDEX := START_BIT_INDEX;
    signal DataReg     : std_logic_vector(7 downto 0) := (others => '0');
    signal SendRequest : std_logic := '0';  -- Start seen, waiting for BitTimer
    signal TxReg       : std_logic := '1';
    signal CompleteReg : std_logic := '0';

    -- The data bit sent at frame position Index (1..8): Data(0)..Data(7)
    function Data_Bit(Byte : std_logic_vector(7 downto 0); Index : natural)
        return std_logic is
    begin
        return Byte(Index - FIRST_DATA_BIT_INDEX);
    end function Data_Bit;

begin

    Tx       <= TxReg;
    Busy     <= '0' when State = IDLE and SendRequest = '0' else '1';
    Complete <= CompleteReg;

    BitTimer <= '1' when ClkCnt = CLKS_PER_BIT - 1 else '0';

    -- Free-running clock counter that sets the baud rate.
    BitTimerGenerator : process (Clk)
    begin
        if rising_edge(Clk) then
            if Reset = '1' or BitTimer = '1' then
                ClkCnt <= 0;
            else
                ClkCnt <= ClkCnt + 1;
            end if;
        end if;
    end process BitTimerGenerator;

    -- Tx, State and BitIndex change together on the clock edge that ends
    -- a BitTimer pulse: that edge is where the next bit is placed on Tx.
    FrameTransmitter : process (Clk)
    begin
        if rising_edge(Clk) then
            -- Single-cycle pulse: low unless set below
            CompleteReg <= '0';

            if Reset = '1' then
                State       <= IDLE;
                TxReg       <= '1';
                BitIndex    <= START_BIT_INDEX;
                SendRequest <= '0';
            else
                case State is

                    when IDLE =>
                        if Start = '1' then
                            DataReg     <= Data;
                            SendRequest <= '1';
                        end if;

                        if SendRequest = '1' and BitTimer = '1' then
                            SendRequest <= '0';
                            BitIndex    <= START_BIT_INDEX;
                            TxReg       <= '0';               -- start bit
                            State       <= START_BIT;
                        end if;

                    when START_BIT =>
                        if BitTimer = '1' then
                            BitIndex <= FIRST_DATA_BIT_INDEX;
                            TxReg    <= Data_Bit(DataReg, FIRST_DATA_BIT_INDEX);
                            State    <= DATA_BITS;
                        end if;

                    when DATA_BITS =>
                        if BitTimer = '1' then
                            if BitIndex = LAST_DATA_BIT_INDEX then
                                BitIndex <= STOP_BIT_INDEX;
                                TxReg    <= '1';              -- stop bit
                                State    <= STOP_BIT;
                            else
                                BitIndex <= BitIndex + 1;
                                TxReg    <= Data_Bit(DataReg, BitIndex + 1);
                            end if;
                        end if;

                    when STOP_BIT =>
                        if BitTimer = '1' then
                            BitIndex    <= START_BIT_INDEX;
                            TxReg       <= '1';               -- line idle
                            CompleteReg <= '1';
                            State       <= IDLE;
                        end if;

                end case;
            end if;
        end if;
    end process FrameTransmitter;

end architecture RTL;
`;

const UART_TX_TB_VHD = `-- Presses KEY0 once so UART_Tx sends 'A' (0x41) as one RS-232 frame.
-- Not self-checking: open the waveform and follow the transmitter's FSM
-- through IDLE -> START_BIT -> DATA_BITS -> STOP_BIT -> IDLE.
--
-- The baud rate is raised to 5 Mbaud so one bit lasts only 10 clocks
-- (200 ns) and the whole frame fits in a short, readable waveform.
-- Expected Tx: idle 1, start 0, data 1 0 0 0 0 0 1 0 (LSB first), stop 1.
-- BitIndex in UART_Tx counts the frame: 0 = start, 1..8 = data, 9 = stop.
-- BitTimer is a free-running baud tick; every bit, the start bit included,
-- is placed on Tx at the clock edge that ends a BitTimer pulse.
library ieee;
use ieee.std_logic_1164.all;
use work.UART_Tx_pkg.all;

entity UART_Tx_tb is
end entity UART_Tx_tb;

architecture sim of UART_Tx_tb is

    constant CLOCK_FREQ   : positive := 50_000_000;
    constant BAUD_RATE    : positive := 5_000_000;  -- Make it simple 10clks per txBit
    constant CLOCK_PERIOD : time     := 20 ns;
    constant CHAR_A       : std_logic_vector(7 downto 0) := x"41";  -- ASCII 'A'

    signal clock_50 : std_logic := '0';
    signal key0_n   : std_logic := '1';  -- KEY0, active low
    signal start    : std_logic;
    signal tx       : std_logic;
    signal busy     : std_logic;
    signal complete : std_logic;
    signal sim_done : boolean := false;
    signal state    : StateType;  -- uut's State, shown with the testbench's signals

begin

    uut : entity work.UART_Tx
        generic map (
            CLOCK_FREQ => CLOCK_FREQ,
            BAUD_RATE  => BAUD_RATE
        )
        port map (
            Clk      => clock_50,
            Reset    => '0',
            Data     => CHAR_A,
            Start    => start,
            Tx       => tx,
            Busy     => busy,
            Complete => complete
        );

    -- Pressing KEY0 starts a frame; UART_Tx only reacts to Start in IDLE.
    start <= not key0_n;

    -- The transmitter's state, read from inside uut (a VHDL-2008 external name).
    state <= <<signal .UART_Tx_tb.uut.State : StateType>>;

    -- Stops once the stimulus is done, so the simulation ends by itself.
    clock_50 <= not clock_50 after CLOCK_PERIOD / 2 when not sim_done;

    Stimulus : process
    begin
        report "IDLE: Tx line is high, waiting for KEY0" severity note;
        wait for 5 * CLOCK_PERIOD;

        report "KEY0 pressed: sending 'A' (0x41)" severity note;
        key0_n <= '0';
        wait for 5 * CLOCK_PERIOD;
        key0_n <= '1';

        wait until complete = '1';
        report "Frame sent: back in IDLE" severity note;
        wait for 5 * CLOCK_PERIOD;

        sim_done <= true;
        wait;
    end process Stimulus;

end architecture sim;
`;

const KEY_UART_TX_V = `// Press KEY0 to send 'A', KEY1 to send 'B' over RS-232 (8N1, 9600 baud).
// The serial line is shown on LEDR0 (idle high, so the LED is lit when
// nothing is sent) and LEDR1 lights while a frame is being transmitted.
// On real hardware, route Tx to a GPIO pin with a USB-UART adapter.
// A key press while a frame is still being sent is ignored.
module keyUartTx #(
    parameter CLOCK_FREQ = 50_000_000,
    parameter BAUD_RATE  = 9_600
) (
    input  wire       CLOCK_50,
    input  wire [3:0] KEY_N,
    output wire [9:0] LEDR
);

    localparam [7:0] CHAR_A = 8'h41;  // ASCII 'A'
    localparam [7:0] CHAR_B = 8'h42;  // ASCII 'B'

    // The keys as they were on the previous clock edge: a press is the
    // edge where a key goes from released (1) to pressed (0).
    reg  [1:0] key_prev = 2'b11;
    wire       key0_pressed;
    wire       key1_pressed;

    reg  [7:0] tx_data  = 8'h00;
    reg        tx_start = 1'b0;
    wire       tx;
    wire       tx_busy;

    UART_Tx #(
        .CLOCK_FREQ(CLOCK_FREQ),
        .BAUD_RATE(BAUD_RATE)
    ) Transmitter (
        .Clk(CLOCK_50),
        .Reset(1'b0),
        .Data(tx_data),
        .Start(tx_start),
        .Tx(tx),
        .Busy(tx_busy),
        .Complete()
    );

    assign key0_pressed = (key_prev[0] == 1'b1 && KEY_N[0] == 1'b0);
    assign key1_pressed = (key_prev[1] == 1'b1 && KEY_N[1] == 1'b0);

    // Picks the character for the pressed key and gives the transmitter
    // a one-clock Start pulse, but only when it is idle.
    always @(posedge CLOCK_50) begin : CharacterSelector
        key_prev <= KEY_N[1:0];
        tx_start <= 1'b0;

        if (tx_busy == 1'b0) begin
            if (key0_pressed) begin
                tx_data  <= CHAR_A;
                tx_start <= 1'b1;
            end else if (key1_pressed) begin
                tx_data  <= CHAR_B;
                tx_start <= 1'b1;
            end
        end
    end

    assign LEDR[0]   = tx;
    assign LEDR[1]   = tx_busy;
    assign LEDR[9:2] = 8'b0000_0000;

endmodule
`;

const UART_TX_V = `// Transmits one byte as RS-232 8N1: a frame of 10 bits on the Tx line.
//   BitIndex 0    : start bit (0)
//   BitIndex 1..8 : data bits, LSB first (Data[0] .. Data[7])
//   BitIndex 9    : stop bit (1)
//
// BitTimer is a free-running baud tick: a one-clock pulse once every bit
// period. Tx only changes on the clock edge that ends a BitTimer pulse,
// so every bit - the start bit included - is placed on Tx by BitTimer.
//
//   Start    : one-clock pulse; Data is latched when Start is seen in IDLE.
//              The start bit is sent on the next BitTimer tick.
//   Busy     : high from Start until the frame has been sent.
//   Complete : one-clock pulse at the end of the stop bit.
module UART_Tx #(
    parameter CLOCK_FREQ = 50_000_000,
    parameter BAUD_RATE  = 9_600
) (
    input  wire       Clk,
    input  wire       Reset,
    input  wire [7:0] Data,
    input  wire       Start,

    output wire       Tx,
    output wire       Busy,
    output wire       Complete
);

    localparam CLKS_PER_BIT = CLOCK_FREQ / BAUD_RATE;

    // The states of the transmitter. The waveform shows State by these names.
    // IDLE      : line high, wait for Start and then for BitTimer
    // START_BIT : 0 on Tx for one bit period
    // DATA_BITS : the 8 data bits on Tx, LSB first
    // STOP_BIT  : 1 on Tx for one bit period
    localparam [1:0] IDLE      = 2'd0,
                     START_BIT = 2'd1,
                     DATA_BITS = 2'd2,
                     STOP_BIT  = 2'd3;
    reg [1:0] State = IDLE;

    // Position of the current bit in the 10-bit frame
    localparam START_BIT_INDEX      = 0;
    localparam FIRST_DATA_BIT_INDEX = 1;
    localparam LAST_DATA_BIT_INDEX  = 8;
    localparam STOP_BIT_INDEX       = 9;

    // ClkCnt counts the clocks within one bit period. BitTimer is a
    // one-clock tick on the last clock of the period: on the next clock
    // edge the next bit is placed on Tx.
    integer   ClkCnt      = 0;
    wire      BitTimer;

    reg [3:0] BitIndex    = START_BIT_INDEX;
    reg [7:0] DataReg     = 8'h00;
    reg       SendRequest = 1'b0;  // Start seen, waiting for BitTimer
    reg       TxReg       = 1'b1;
    reg       CompleteReg = 1'b0;

    // The data bit sent at frame position Index (1..8): Data[0]..Data[7]
    function Data_Bit(input [7:0] Byte, input integer Index);
        Data_Bit = Byte[Index - FIRST_DATA_BIT_INDEX];
    endfunction

    assign Tx       = TxReg;
    assign Busy     = (State == IDLE && SendRequest == 1'b0) ? 1'b0 : 1'b1;
    assign Complete = CompleteReg;

    assign BitTimer = (ClkCnt == CLKS_PER_BIT - 1) ? 1'b1 : 1'b0;

    // Free-running clock counter that sets the baud rate.
    always @(posedge Clk) begin : BitTimerGenerator
        if (Reset == 1'b1 || BitTimer == 1'b1)
            ClkCnt <= 0;
        else
            ClkCnt <= ClkCnt + 1;
    end

    // Tx, State and BitIndex change together on the clock edge that ends
    // a BitTimer pulse: that edge is where the next bit is placed on Tx.
    always @(posedge Clk) begin : FrameTransmitter
        // Single-cycle pulse: low unless set below
        CompleteReg <= 1'b0;

        if (Reset == 1'b1) begin
            State       <= IDLE;
            TxReg       <= 1'b1;
            BitIndex    <= START_BIT_INDEX;
            SendRequest <= 1'b0;
        end else begin
            case (State)

                IDLE: begin
                    if (Start == 1'b1) begin
                        DataReg     <= Data;
                        SendRequest <= 1'b1;
                    end

                    if (SendRequest == 1'b1 && BitTimer == 1'b1) begin
                        SendRequest <= 1'b0;
                        BitIndex    <= START_BIT_INDEX;
                        TxReg       <= 1'b0;              // start bit
                        State       <= START_BIT;
                    end
                end

                START_BIT: begin
                    if (BitTimer == 1'b1) begin
                        BitIndex <= FIRST_DATA_BIT_INDEX;
                        TxReg    <= Data_Bit(DataReg, FIRST_DATA_BIT_INDEX);
                        State    <= DATA_BITS;
                    end
                end

                DATA_BITS: begin
                    if (BitTimer == 1'b1) begin
                        if (BitIndex == LAST_DATA_BIT_INDEX) begin
                            BitIndex <= STOP_BIT_INDEX;
                            TxReg    <= 1'b1;             // stop bit
                            State    <= STOP_BIT;
                        end else begin
                            BitIndex <= BitIndex + 1;
                            TxReg    <= Data_Bit(DataReg, BitIndex + 1);
                        end
                    end
                end

                STOP_BIT: begin
                    if (BitTimer == 1'b1) begin
                        BitIndex    <= START_BIT_INDEX;
                        TxReg       <= 1'b1;              // line idle
                        CompleteReg <= 1'b1;
                        State       <= IDLE;
                    end
                end

            endcase
        end
    end

endmodule
`;

const UART_TX_TB_V = `// Presses KEY0 once so UART_Tx sends 'A' (0x41) as one RS-232 frame.
// Not self-checking: open the waveform and follow the transmitter's FSM
// through IDLE -> START_BIT -> DATA_BITS -> STOP_BIT -> IDLE.
//
// The baud rate is raised to 5 Mbaud so one bit lasts only 10 clocks
// (200 ns) and the whole frame fits in a short, readable waveform.
// Expected Tx: idle 1, start 0, data 1 0 0 0 0 0 1 0 (LSB first), stop 1.
// BitIndex in UART_Tx counts the frame: 0 = start, 1..8 = data, 9 = stop.
// BitTimer is a free-running baud tick; every bit, the start bit included,
// is placed on Tx at the clock edge that ends a BitTimer pulse.
module UART_Tx_tb;

    localparam CLOCK_FREQ   = 50_000_000;
    localparam BAUD_RATE    = 5_000_000;  // Make it simple: 10 clocks per Tx bit
    localparam CLOCK_PERIOD = 20;         // ns
    localparam [7:0] CHAR_A = 8'h41;      // ASCII 'A'

    reg        clock_50 = 1'b0;
    reg        key0_n   = 1'b1;  // KEY0, active low
    wire       start;
    wire       tx;
    wire       busy;
    wire       complete;
    wire [1:0] state;            // uut's State, shown with the testbench's signals

    UART_Tx #(
        .CLOCK_FREQ(CLOCK_FREQ),
        .BAUD_RATE(BAUD_RATE)
    ) uut (
        .Clk(clock_50),
        .Reset(1'b0),
        .Data(CHAR_A),
        .Start(start),
        .Tx(tx),
        .Busy(busy),
        .Complete(complete)
    );

    // Pressing KEY0 starts a frame; UART_Tx only reacts to Start in IDLE.
    assign start = !key0_n;

    // The transmitter's state, read from inside uut (a hierarchical name).
    assign state = uut.State;

    always #(CLOCK_PERIOD / 2) clock_50 = !clock_50;

    // Ends the simulation once the frame has been sent.
    initial begin : Stimulus
        $display("IDLE: Tx line is high, waiting for KEY0");
        #(5 * CLOCK_PERIOD);

        $display("KEY0 pressed: sending 'A' (0x41)");
        key0_n = 1'b0;
        #(5 * CLOCK_PERIOD);
        key0_n = 1'b1;

        @(posedge complete);
        $display("Frame sent: back in IDLE");
        #(5 * CLOCK_PERIOD);

        $finish;
    end

endmodule
`;

export const EXAMPLE_FILES: VhdlFile[] = [
  { id: 'de1_soc', name: 'DE1_SoC.vhdl', folder: 'vhdl', content: DE1_SOC_VHD },
  { id: 'blink_test', name: 'blinkTest.vhdl', folder: 'vhdl', content: BLINK_TEST_VHD },
  { id: 'key_counter_2_led', name: 'keyCouter2Led.vhdl', folder: 'vhdl', content: KEY_COUNTER_2_LED_VHD },
  { id: 'key_counter_7seg', name: 'keyCounter7Seg.vhdl', folder: 'vhdl', content: KEY_COUNTER_7SEG_VHD },
  { id: 'and_gate', name: 'and_gate.vhdl', folder: 'vhdl', content: AND_GATE_VHD },
  { id: 'and_gate_tb', name: 'and_gate_tb.vhd', folder: 'vhdl', content: AND_GATE_TB_VHD },
  { id: 'and_gate_truthtable_tb', name: 'and_gate_truthtable_tb.vhd', folder: 'vhdl', content: AND_GATE_TRUTHTABLE_TB_VHD },
  { id: 'key_uart_tx', name: 'keyUartTx.vhdl', folder: 'vhdl', content: KEY_UART_TX_VHD },
  { id: 'uart_tx', name: 'UART_Tx.vhdl', folder: 'vhdl', content: UART_TX_VHD },
  { id: 'uart_tx_tb', name: 'UART_Tx_tb.vhd', folder: 'vhdl', content: UART_TX_TB_VHD },
  { id: 'de1_soc_v', name: 'DE1_SoC.v', folder: 'verilog', content: DE1_SOC_V },
  { id: 'blink_test_v', name: 'blinkTest.v', folder: 'verilog', content: BLINK_TEST_V },
  { id: 'key_counter_2_led_v', name: 'keyCouter2Led.v', folder: 'verilog', content: KEY_COUNTER_2_LED_V },
  { id: 'key_counter_7seg_v', name: 'keyCounter7Seg.v', folder: 'verilog', content: KEY_COUNTER_7SEG_V },
  { id: 'and_gate_v', name: 'and_gate.v', folder: 'verilog', content: AND_GATE_V },
  { id: 'and_gate_tb_v', name: 'and_gate_tb.v', folder: 'verilog', content: AND_GATE_TB_V },
  { id: 'and_gate_truthtable_tb_v', name: 'and_gate_truthtable_tb.v', folder: 'verilog', content: AND_GATE_TRUTHTABLE_TB_V },
  { id: 'key_uart_tx_v', name: 'keyUartTx.v', folder: 'verilog', content: KEY_UART_TX_V },
  { id: 'uart_tx_v', name: 'UART_Tx.v', folder: 'verilog', content: UART_TX_V },
  { id: 'uart_tx_tb_v', name: 'UART_Tx_tb.v', folder: 'verilog', content: UART_TX_TB_V },
];

/** What a first start shows in the Files panel: the board's top level, in both languages. */
export const STARTER_FILES: VhdlFile[] = EXAMPLE_FILES.filter((f) => f.id === 'de1_soc' || f.id === 'de1_soc_v');

/** The file shown on a first start. */
export const DEFAULT_SHOWN_FILE = 'de1_soc';

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'DE1_SoC.vhdl';
