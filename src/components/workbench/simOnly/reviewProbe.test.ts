import { test } from 'vitest';
import { checkOf, source, vhdlDesign } from './simOnly.testSupport';
test('review probe', () => {
 const v=`module top(input CLOCK_50, input [9:0] SW, output reg [9:0] LEDR);\nalways @(posedge CLOCK_50 or posedge SW[0])\n if (SW[0]) LEDR[3:0] <= LEDR[2:0] + 1; else LEDR[3:0] <= SW[3:0];\nendmodule`;
 const body=`process(CLOCK_50, SW) begin\n if SW(0) = '1' then LEDR(3 downto 0) <= '0' & std_logic_vector(unsigned(LEDR(2 downto 0)) + 1);\n elsif rising_edge(CLOCK_50) then LEDR(3 downto 0) <= SW(3 downto 0); end if;\nend process;`;
 const h=vhdlDesign('top','CLOCK_50 : in std_logic; SW : in std_logic_vector(9 downto 0); LEDR : out std_logic_vector(9 downto 0)',body);
 for(const [name,code] of [['top.v',v],['top.vhd',h]]) {const r=checkOf([source(name,code)]);console.log('REVIEW',JSON.stringify({findings:r.findings,group:r.groups.byFile.get(name)}));}
});
