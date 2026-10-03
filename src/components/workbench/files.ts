// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/* ------------------------------------------------------------------ *
 * Starter project shown in the Files panel — the DE1-SoC top-level
 * entity plus a few small example designs (each in VHDL and Verilog; the
 * Verilog ones sit in `verilog/`), so the workbench opens
 * looking like a project mid-course, not empty.
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

export const STARTER_FILES: VhdlFile[] = [
  { id: 'de1_soc', name: 'DE1_SoC.vhdl', folder: 'vhdl', content: DE1_SOC_VHD },
  { id: 'blink_test', name: 'blinkTest.vhdl', folder: 'vhdl', content: BLINK_TEST_VHD },
  { id: 'key_counter_2_led', name: 'keyCouter2Led.vhdl', folder: 'vhdl', content: KEY_COUNTER_2_LED_VHD },
  { id: 'and_gate', name: 'and_gate.vhdl', folder: 'vhdl', content: AND_GATE_VHD },
  { id: 'and_gate_tb', name: 'and_gate_tb.vhd', folder: 'vhdl', content: AND_GATE_TB_VHD },
  { id: 'de1_soc_v', name: 'DE1_SoC.v', folder: 'verilog', content: DE1_SOC_V },
  { id: 'blink_test_v', name: 'blinkTest.v', folder: 'verilog', content: BLINK_TEST_V },
  { id: 'key_counter_2_led_v', name: 'keyCouter2Led.v', folder: 'verilog', content: KEY_COUNTER_2_LED_V },
  { id: 'and_gate_v', name: 'and_gate.v', folder: 'verilog', content: AND_GATE_V },
  { id: 'and_gate_tb_v', name: 'and_gate_tb.v', folder: 'verilog', content: AND_GATE_TB_V },
];

export const DEFAULT_OPEN_TABS = ['de1_soc'];

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'DE1_SoC.vhdl';
