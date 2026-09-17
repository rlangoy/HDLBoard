/**
 * Generates the persistent-process testbench — the shipped design per the
 * Phase 2 spike (../../ghdl_implementation_plan.md § 5.4.1). Elaborated
 * once per session; a single `ghdl -r` then free-runs for the life of the
 * session, polling a small input file for `SW`/`KEY` on a fixed cadence
 * and publishing `LEDR`/`HEX0..HEX5` to an output file whenever they
 * change.
 *
 * The input/output file formats are deliberately identical to the wire
 * protocol's own `STIM`/`STATE` payloads (§ 6.3/§ 6.4) — 14 bits in,
 * 52 bits out, same bit order — so the Node side of this backend can pass
 * those lines through close to verbatim, with no reformatting step.
 *
 * Only ports the entity actually declares are wired into the port map
 * (§ 7.3); everything else keeps its testbench-side default, which is
 * chosen to be the electrically "off" value for that signal, so an
 * unconnected output reads as blank rather than undefined (Appendix B).
 */

const TB_ENTITY = 'de1soc_sim_tb';

const HEX_NAMES = ['hex0', 'hex1', 'hex2', 'hex3', 'hex4', 'hex5'] as const;

/** `port =>` associations for whichever of these the entity declares. */
function buildPortMap(ports: ReadonlySet<string>): string {
  const known: Array<[string, string]> = [
    ['clock_50', 'clk_sig'],
    ['sw', 'sw_sig'],
    ['key', 'key_sig'],
    ['ledr', 'ledr_sig'],
    ...HEX_NAMES.map((h): [string, string] => [h, `${h}_sig`]),
    ['rst', 'rst_sig'],
  ];
  const assocs = known
    .filter(([formal]) => ports.has(formal))
    .map(([formal, actual]) => `${formal} => ${actual}`);
  if (assocs.length === 0) return '';
  return `\n    port map (\n      ${assocs.join(',\n      ')}\n    )`;
}

/**
 * `rst` is not a DE1-SoC pin (§ 3.2) — a legacy file that declares it
 * gets it wired from `not KEY(0)` when the entity also has `key`, so
 * older files still elaborate; with no `key` to source it from, it is
 * tied permanently deasserted rather than left floating.
 */
function buildRstDrive(ports: ReadonlySet<string>): string {
  if (!ports.has('rst')) return '';
  return ports.has('key')
    ? "\n  rst_sig <= not key_sig(0);"
    : "\n  rst_sig <= '0';";
}

export function generateTestbench(entityName: string, ports: ReadonlySet<string>): string {
  const portMap = buildPortMap(ports);
  const rstDrive = buildRstDrive(ports);

  return `library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

entity ${TB_ENTITY} is
  generic (
    input_file  : string  := "";
    output_file : string  := "";
    poll_cycles : integer := 50
  );
end entity;

architecture sim of ${TB_ENTITY} is
  -- Testbench-side signals for every board direction, regardless of which
  -- the entity actually declares — buildPortMap() above only connects the
  -- ones that exist. Defaults are each signal's electrically "off" value,
  -- so an unassociated output reads as blank on the wire, not undefined.
  signal clk_sig  : std_logic := '0';
  signal rst_sig  : std_logic := '0';
  signal sw_sig   : std_logic_vector(9 downto 0) := (others => '0');
  signal key_sig  : std_logic_vector(3 downto 0) := (others => '1');
  signal ledr_sig : std_logic_vector(9 downto 0) := (others => '0');
  signal hex0_sig, hex1_sig, hex2_sig, hex3_sig, hex4_sig, hex5_sig
    : std_logic_vector(6 downto 0) := (others => '1');

  function sl2c(v : std_logic) return character is
  begin
    case v is
      when '0' => return '0';
      when '1' => return '1';
      when others => return 'X';
    end case;
  end function;

  function slv2str(v : std_logic_vector) return string is
    variable s : string(1 to v'length);
    variable idx : integer := 1;
  begin
    for i in v'high downto v'low loop
      s(idx) := sl2c(v(i));
      idx := idx + 1;
    end loop;
    return s;
  end function;

begin

  uut: entity work.${entityName}${portMap};
${rstDrive}

  -- Free-running clock. Never blocks, never waits on I/O — the property
  -- the Phase 2 spike exists to prove is achievable (§ 5.4.1). Doubles as
  -- both the DUT's CLOCK_50 (when declared) and the poll loop's own
  -- timing reference, so there is always something to poll cycles
  -- against even for a design with no clock port at all.
  clkgen : process
  begin
    clk_sig <= '0'; wait for 10 ns;
    clk_sig <= '1'; wait for 10 ns;
  end process;

  io : process
    file fin  : text;
    file fout : text;
    variable status : file_open_status;
    variable l : line;
    variable rec : string(1 to 14);
    variable last : string(1 to 52) := (others => ' ');
    variable now  : string(1 to 52);
  begin
    loop
      for i in 1 to poll_cycles loop
        wait until rising_edge(clk_sig);
      end loop;

      -- STIM's own wire format (§ 6.3): SW9..SW0, KEY3..KEY0, 14 bits.
      -- A missing file (no STIM sent yet this session) is not an error —
      -- inputs simply keep their declared defaults.
      if input_file'length > 0 then
        file_open(status, fin, input_file, read_mode);
        if status = open_ok then
          if not endfile(fin) then
            readline(fin, l);
            if l'length >= 14 then
              read(l, rec);
              for i in 0 to 9 loop
                sw_sig(9 - i) <= '1' when rec(1 + i) = '1' else '0';
              end loop;
              for i in 0 to 3 loop
                key_sig(3 - i) <= '1' when rec(11 + i) = '1' else '0';
              end loop;
            end if;
          end if;
          file_close(fin);
        end if;
      end if;

      -- STATE's own wire format (§ 6.4): LEDR then HEX0..HEX5, 52 bits.
      now := slv2str(ledr_sig) & slv2str(hex0_sig) & slv2str(hex1_sig)
                               & slv2str(hex2_sig) & slv2str(hex3_sig)
                               & slv2str(hex4_sig) & slv2str(hex5_sig);
      if now /= last and output_file'length > 0 then
        -- Opened, written and closed on every change rather than held
        -- open for the session: file_close is what flushes, and a
        -- concurrent reader on the Node side needs that flush to see
        -- the update without waiting for this process to exit.
        file_open(status, fout, output_file, write_mode);
        write(l, now);
        writeline(fout, l);
        file_close(fout);
        last := now;
      end if;
    end loop;
  end process;

end architecture;
`;
}
