// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Small designs in each new board's master names, in both languages, for the board-shape
 * integration tests (docs/board_io_v2_spec.md § 12.2). Each copies the switches to the
 * LEDs, shows its buttons (and reset button) on the lowest LEDs as pin levels, and
 * drives display 0 with a "1" and its decimal point off — statically, so a multiplexed
 * display shows it from time 0.
 */

import type { FixtureLanguage } from './fixture.js';

export interface ShapeDesign {
  readonly name: string;
  readonly content: string;
}

type Designs = Readonly<Record<FixtureLanguage, ShapeDesign>>;

export const DE10_LITE_DESIGN: Designs = {
  vhdl: {
    name: 'de10_top.vhdl',
    content: `library ieee;
use ieee.std_logic_1164.all;

entity de10_top is
  port (
    SW   : in  std_logic_vector(9 downto 0);
    KEY  : in  std_logic_vector(1 downto 0);
    LEDR : out std_logic_vector(9 downto 0);
    HEX0 : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of de10_top is
begin
  LEDR <= SW(9 downto 1) & KEY(0);
  HEX0 <= "01111001"; -- a "1", and the decimal point lit (bit 7, active low)
end architecture;
`,
  },
  verilog: {
    name: 'de10_top.v',
    content: `module de10_top(
  input  wire [9:0] SW,
  input  wire [1:0] KEY,
  output wire [9:0] LEDR,
  output wire [7:0] HEX0
);
  assign LEDR = {SW[9:1], KEY[0]};
  assign HEX0 = 8'b01111001; // a "1", and the decimal point lit (bit 7, active low)
endmodule
`,
  },
};

export const BASYS3_DESIGN: Designs = {
  vhdl: {
    name: 'basys_top.vhdl',
    content: `library ieee;
use ieee.std_logic_1164.all;

entity basys_top is
  port (
    clk  : in  std_logic;
    sw   : in  std_logic_vector(15 downto 0);
    btnC : in  std_logic;
    btnU : in  std_logic;
    led  : out std_logic_vector(15 downto 0);
    seg  : out std_logic_vector(6 downto 0);
    dp   : out std_logic;
    an   : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of basys_top is
begin
  led <= sw(15 downto 2) & btnU & btnC;
  seg <= "1111001";
  dp  <= '1';
  an  <= "1110"; -- digit 0 only, held on
end architecture;
`,
  },
  verilog: {
    name: 'basys_top.v',
    content: `module basys_top(
  input  wire        clk,
  input  wire [15:0] sw,
  input  wire        btnC,
  input  wire        btnU,
  output wire [15:0] led,
  output wire [6:0]  seg,
  output wire        dp,
  output wire [3:0]  an
);
  assign led = {sw[15:2], btnU, btnC};
  assign seg = 7'b1111001;
  assign dp  = 1'b1;
  assign an  = 4'b1110; // digit 0 only, held on
endmodule
`,
  },
};

export const NEXYS_A7_DESIGN: Designs = {
  vhdl: {
    name: 'nexys_top.vhdl',
    content: `library ieee;
use ieee.std_logic_1164.all;

entity nexys_top is
  port (
    CLK100MHZ  : in  std_logic;
    SW         : in  std_logic_vector(15 downto 0);
    BTNC       : in  std_logic;
    CPU_RESETN : in  std_logic;
    LED        : out std_logic_vector(15 downto 0);
    CA, CB, CC, CD, CE, CF, CG, DP : out std_logic;
    AN         : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of nexys_top is
begin
  LED <= SW(15 downto 2) & CPU_RESETN & BTNC;
  CA <= '1'; CB <= '0'; CC <= '0'; CD <= '1'; CE <= '1'; CF <= '1'; CG <= '1';
  DP <= '1';
  AN <= "11111110"; -- digit 0 only, held on
end architecture;
`,
  },
  verilog: {
    name: 'nexys_top.v',
    content: `module nexys_top(
  input  wire        CLK100MHZ,
  input  wire [15:0] SW,
  input  wire        BTNC,
  input  wire        CPU_RESETN,
  output wire [15:0] LED,
  output wire CA, CB, CC, CD, CE, CF, CG, DP,
  output wire [7:0]  AN
);
  assign LED = {SW[15:2], CPU_RESETN, BTNC};
  assign {CG, CF, CE, CD, CC, CB, CA} = 7'b1111001;
  assign DP = 1'b1;
  assign AN = 8'b11111110; // digit 0 only, held on
endmodule
`,
  },
};

/**
 * Four digits refreshed from the 500 Hz clock, digit d showing the digit d, while
 * `SW(0)` is up; with it down every digit enable is off, so the digits go dark once
 * DISPLAY_PERSIST has passed.
 */
export const BASYS3_REFRESH_DESIGN: Designs = {
  vhdl: {
    name: 'refresh.vhdl',
    content: `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity refresh is
  port (
    CLOCK_500Hz : in  std_logic;
    sw  : in  std_logic_vector(15 downto 0);
    seg : out std_logic_vector(6 downto 0);
    an  : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of refresh is
  type patterns_t is array (0 to 3) of std_logic_vector(6 downto 0);
  constant DIGITS : patterns_t := ("1000000", "1111001", "0100100", "0110000");
  signal digit : unsigned(1 downto 0) := "00";
begin
  process (CLOCK_500Hz)
  begin
    if rising_edge(CLOCK_500Hz) then
      digit <= digit + 1;
    end if;
  end process;

  seg <= DIGITS(to_integer(digit));
  an  <= "1111" when sw(0) = '0' else
         "1110" when digit = 0 else
         "1101" when digit = 1 else
         "1011" when digit = 2 else
         "0111";
end architecture;
`,
  },
  verilog: {
    name: 'refresh.v',
    content: `module refresh(
  input  wire        CLOCK_500Hz,
  input  wire [15:0] sw,
  output reg  [6:0]  seg,
  output reg  [3:0]  an
);
  reg [1:0] digit = 2'd0;
  always @(posedge CLOCK_500Hz) digit <= digit + 2'd1;
  always @(*) begin
    case (digit)
      2'd0: seg = 7'b1000000;
      2'd1: seg = 7'b1111001;
      2'd2: seg = 7'b0100100;
      default: seg = 7'b0110000;
    endcase
    an = sw[0] ? ~(4'b0001 << digit) : 4'b1111;
  end
endmodule
`,
  },
};

/**
 * Digit 0 held on for 100 ms (50 ticks of the 500 Hz clock), then digit 1 instead: a scan
 * slower than DISPLAY_PERSIST. Digit 0 must stay lit for 75 ms after it is switched off,
 * not go dark at once because it was switched on more than 75 ms before.
 */
export const BASYS3_SLOW_SCAN_DESIGN: Designs = {
  vhdl: {
    name: 'slowscan.vhdl',
    content: `library ieee;
use ieee.std_logic_1164.all;

entity slowscan is
  port (
    CLOCK_500Hz : in  std_logic;
    seg : out std_logic_vector(6 downto 0);
    an  : out std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of slowscan is
  signal ticks : integer range 0 to 50 := 0;
begin
  process (CLOCK_500Hz)
  begin
    if rising_edge(CLOCK_500Hz) and ticks < 50 then
      ticks <= ticks + 1;
    end if;
  end process;

  seg <= "1111001";
  an  <= "1110" when ticks < 50 else "1101";
end architecture;
`,
  },
  verilog: {
    name: 'slowscan.v',
    content: `module slowscan(
  input  wire       CLOCK_500Hz,
  output wire [6:0] seg,
  output wire [3:0] an
);
  reg [5:0] ticks = 6'd0;
  always @(posedge CLOCK_500Hz) if (ticks < 6'd50) ticks <= ticks + 6'd1;
  assign seg = 7'b1111001;
  assign an = (ticks < 6'd50) ? 4'b1110 : 4'b1101;
endmodule
`,
  },
};
