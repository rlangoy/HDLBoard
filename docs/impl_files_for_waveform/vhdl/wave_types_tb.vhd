-- Every type the waveform viewer must show (docs/waveform_viewer_spec.md § 4, § 14).
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter4 is
  port (clk, rst : in std_logic; q : out unsigned(3 downto 0));
end entity;

architecture rtl of counter4 is
  signal count : unsigned(3 downto 0);
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then count <= (others => '0'); else count <= count + 1; end if;
    end if;
  end process;
  q <= count;
end architecture;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity wave_types_tb is
end entity;

architecture sim of wave_types_tb is
  type state_t is (idle, run, done);
  type pair_t is record
    a : std_logic;
    b : unsigned(3 downto 0);
  end record;
  signal clk     : std_logic := '0';
  signal rst     : std_logic := '1';
  signal q       : unsigned(3 downto 0);
  signal state   : state_t := idle;
  signal pair    : pair_t := ('0', "0000");
  signal ch      : character := 'A';
  signal n       : integer := 0;
  signal flag    : boolean := false;
  signal r       : real := 0.0;
  signal sv      : signed(7 downto 0) := (others => '0');
  signal lv      : std_logic_vector(7 downto 0);   -- stays U until 25 ns
  signal nine    : std_logic := 'U';
  signal b       : bit := '0';
begin
  clk <= not clk after 5 ns when now < 200 ns;
  dut : entity work.counter4 port map (clk => clk, rst => rst, q => q);

  process begin
    wait for 12 ns; rst <= '0';
    wait for 13 ns; lv <= x"A5";
    state <= run; pair <= ('1', "0101"); ch <= 'B'; n <= 42; flag <= true; r <= 3.5; sv <= to_signed(-3, 8);
    nine <= 'X'; wait for 10 ns;
    nine <= '0'; wait for 10 ns;
    nine <= '1'; wait for 10 ns;
    nine <= 'Z'; wait for 10 ns;
    nine <= 'W'; wait for 10 ns;
    nine <= 'L'; wait for 10 ns;
    nine <= 'H'; wait for 10 ns;
    nine <= '-'; b <= '1'; wait for 10 ns;
    state <= done; n <= -7;
    report "checking count" severity note;
    assert q = 0 report "count is not zero" severity error;
    wait for 80 ns;
    report "done";
    wait;
  end process;
end architecture;
