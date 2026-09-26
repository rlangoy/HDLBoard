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

    reg [6:0] counter   = 7'd0;      // counts 0 .. TOGGLE_COUNT-1
    reg       led_state = 1'b0;

    always @(posedge CLOCK_500Hz) begin
        if (counter == TOGGLE_COUNT - 1) begin
            counter   <= 7'd0;
            led_state <= ~led_state;
        end else begin
            counter <= counter + 7'd1;
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

const TB_COUNTER8_V = `// Self-checking testbench: no ports, so it runs on its own (batch mode).
module tb_counter8;
    reg        CLOCK_50 = 1'b0;
    reg  [3:0] KEY_N    = 4'b1111;
    wire [9:0] LEDR;

    counter8 dut (.CLOCK_50(CLOCK_50), .KEY_N(KEY_N), .LEDR(LEDR));

    always #10 CLOCK_50 = ~CLOCK_50;

    task press(input integer key);
        begin
            KEY_N[key] = 1'b0;
            #100;
            KEY_N[key] = 1'b1;
            #100;
        end
    endtask

    initial begin
        #100;
        press(0);
        press(0);
        press(0);
        $display("count after 3 presses = %0d", LEDR[7:0]);
        press(1);
        $display("count after reset     = %0d", LEDR[7:0]);
        if (LEDR[7:0] === 8'd0) $display("PASS");
        else                    $display("FAIL");
        $finish;
    end
endmodule
`;

export const STARTER_FILES: VhdlFile[] = [
  { id: 'de1_soc', name: 'DE1_SoC.vhdl', folder: 'vhdl', content: DE1_SOC_VHD },
  { id: 'blink_test', name: 'blinkTest.vhdl', folder: 'vhdl', content: BLINK_TEST_VHD },
  { id: 'key_counter_2_led', name: 'keyCouter2Led.vhdl', folder: 'vhdl', content: KEY_COUNTER_2_LED_VHD },
  { id: 'de1_soc_v', name: 'DE1_SoC.v', folder: 'verilog', content: DE1_SOC_V },
  { id: 'blink_test_v', name: 'blinkTest.v', folder: 'verilog', content: BLINK_TEST_V },
  { id: 'key_counter_2_led_v', name: 'keyCouter2Led.v', folder: 'verilog', content: KEY_COUNTER_2_LED_V },
  { id: 'tb_counter8_v', name: 'tb_counter8.v', folder: 'verilog', content: TB_COUNTER8_V },
];

export const DEFAULT_OPEN_TABS = ['de1_soc'];

/** The top-level entity a simulation run elaborates — shown in the Simulation card. */
export const TOP_LEVEL_ENTITY = 'DE1_SoC.vhdl';
