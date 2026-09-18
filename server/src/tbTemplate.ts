// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * Generates the persistent-process testbench — the shipped design per the
 * Phase 2 spike (../../ghdl_implementation_plan.md § 5.4.1). Elaborated
 * once per session; a single `ghdl -r` then free-runs for the life of the
 * session, polling a small input file for `SW`/`KEY` on a fixed cadence
 * and publishing `LEDR`/`HEX0..HEX5` to an output file whenever they
 * change.
 *
 * The input file is a queue, not a snapshot (§ 5.13): one `<seq> <bits>`
 * line per not-yet-acknowledged `STIM`, applied here one per poll, oldest
 * first. The output file is `<bits> <seq>` — `STATE`'s 52 bits plus the
 * last applied `seq`, which is how the Node side knows what it may drop
 * from the queue. The bit fields themselves keep the wire protocol's own
 * `STIM`/`STATE` payload order (§ 6.3/§ 6.4), so they pass through
 * verbatim.
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
    ['clock_500hz', 'clk500_sig'],
    ['sw', 'sw_sig'],
    ['key_n', 'key_sig'],
    ['ledr', 'ledr_sig'],
    ...HEX_NAMES.map((h): [string, string] => [`${h}_n`, `${h}_sig`]),
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
 * gets it wired from `not KEY_N(0)` when the entity also has `key_n`, so
 * older files still elaborate; with no `key_n` to source it from, it is
 * tied permanently deasserted rather than left floating.
 */
function buildRstDrive(ports: ReadonlySet<string>): string {
  if (!ports.has('rst')) return '';
  return ports.has('key_n')
    ? "\n  rst_sig <= not key_sig(0);"
    : "\n  rst_sig <= '0';";
}

export function generateTestbench(entityName: string, ports: ReadonlySet<string>): string {
  const portMap = buildPortMap(ports);
  const rstDrive = buildRstDrive(ports);
  const hasClock50 = ports.has('clock_50');

  return `library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

entity ${TB_ENTITY} is
  generic (
    input_file       : string  := "";
    output_file      : string  := "";
    poll_interval_ns : integer := 1000;
    min_dwell_ns     : integer := 0;
    heartbeat_file   : string  := "";
    pacing_file      : string  := ""
  );
end entity;

architecture sim of ${TB_ENTITY} is
  -- Testbench-side signals for every board direction, regardless of which
  -- the entity actually declares — buildPortMap() above only connects the
  -- ones that exist. Defaults are each signal's electrically "off" value,
  -- so an unassociated output reads as blank on the wire, not undefined.
  signal clk_sig    : std_logic := '0';
  signal clk500_sig : std_logic := '0';
  signal rst_sig    : std_logic := '0';
  signal sw_sig     : std_logic_vector(9 downto 0) := (others => '0');
  signal key_sig    : std_logic_vector(3 downto 0) := (others => '1');
  signal ledr_sig   : std_logic_vector(9 downto 0) := (others => '0');
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
${
  hasClock50
    ? `
  -- Free-running clock, only instantiated when the entity actually
  -- declares CLOCK_50 (§ 5.8) — its own 20 ns period is what makes a
  -- design that depends on it need millions of edges per visible change
  -- (§ 5.5). The \`io\` process below no longer rides on this clock's
  -- edges for its own timing (§ 5.8): this process exists solely to
  -- drive the DUT's own CLOCK_50 input.
  clkgen : process
  begin
    clk_sig <= '0'; wait for 10 ns;
    clk_sig <= '1'; wait for 10 ns;
  end process;
`
    : ''
}
  -- CLOCK_500Hz: not a real DE1-SoC pin (§ 3.2) — a simulator-only
  -- convenience, already divided down to a human-visible rate, so a
  -- design can be genuinely sequential (a counter, a debouncer, a
  -- blinking LED) without hand-writing a 50 MHz divider, which would be
  -- correct but impractical to run interactively (§ 5.5). Runs
  -- unconditionally, like clkgen when present — 500 Hz is cheap enough on
  -- its own (§ 5.8) that there is nothing to gain by making this process
  -- itself conditional on the entity declaring it.
  clk500gen : process
  begin
    clk500_sig <= '0'; wait for 1 ms;
    clk500_sig <= '1'; wait for 1 ms;
  end process;

  -- Real-time pacing heartbeat (§ 5.9): reports this session's own
  -- simulated-time progress to the Node side every 20 ms of simulated
  -- time, so a session that would otherwise run far ahead of wall-clock
  -- time (§ 5.8's fix made this the common case for anything not
  -- declaring CLOCK_50) is held back toward it — a design's timing in
  -- the simulator is then a real prediction of its timing on actual
  -- hardware, not an accident of how many events GHDL happened to process
  -- per real second.
  --
  -- The holding back happens here, not by the Node side stopping this
  -- process (§ 5.13): after each 20 ms step this blocks on one line from
  -- pacing_file, a FIFO the Node side writes one line into per 20 ms of
  -- real time. A late Node side can therefore only ever slow the
  -- simulation, never let it run ahead — which SIGSTOP-after-the-fact
  -- could, by as much as the Node event loop happened to be stalled.
  heartbeat : process
    file fhb   : text;
    file fpace : text;
    variable status : file_open_status;
    variable l : line;
    variable paced : boolean := false;
  begin
    if pacing_file'length > 0 then
      file_open(status, fpace, pacing_file, read_mode);
      paced := status = open_ok;
    end if;
    loop
      wait for 20 ms;
      if heartbeat_file'length > 0 then
        file_open(status, fhb, heartbeat_file, write_mode);
        if status = open_ok then
          write(l, now / 1 ms);
          writeline(fhb, l);
          file_close(fhb);
        end if;
      end if;
      if paced then
        readline(fpace, l);
      end if;
    end loop;
  end process;

  io : process
    file fin  : text;
    file fout : text;
    variable status : file_open_status;
    -- Separate lines for reading and writing: a queue entry skipped
    -- part-way through parsing leaves its unread remainder in its line,
    -- and sharing one with the output would prepend that to STATE (§ 5.14).
    variable lin  : line;
    variable lout : line;
    variable rec : string(1 to 14);
    variable sep : character;
    variable seq : integer;
    variable ok  : boolean;
    variable applied_seq : integer := 0;
    variable applied_at  : time := 0 ns;
    variable last : string(1 to 52) := (others => ' ');
    variable last_seq : integer := -1;
    variable now_bits : string(1 to 52);
  begin
    loop
      -- A plain time-based wait, not clock edges (§ 5.8) — this process
      -- has nothing to do with whatever clock, if any, the DUT itself
      -- runs on; tying it to CLOCK_50's own 20 ns period was what made a
      -- CLOCK_500Hz-only (or clockless) design pay CLOCK_50's cost anyway.
      wait for poll_interval_ns * 1 ns;

      -- A queue of \`<seq> <SW9..SW0 KEY3..KEY0>\` lines, oldest first
      -- (§ 5.13). At most one is applied per poll, and not before the
      -- previous one has held for min_dwell_ns — so a press and release
      -- that reached the Node side together (a stalled event loop, a slow
      -- machine) still arrive here as two transitions with a real, visible
      -- gap between them, instead of the release overwriting the press
      -- before it was ever sampled. A missing file (no STIM sent yet this
      -- session) is not an error — inputs keep their declared defaults.
      if input_file'length > 0 and now - applied_at >= min_dwell_ns * 1 ns then
        file_open(status, fin, input_file, read_mode);
        if status = open_ok then
          while not endfile(fin) loop
            readline(fin, lin);
            read(lin, seq, ok);
            next when not ok or seq <= applied_seq;
            read(lin, sep, ok);
            next when not ok or lin'length < 14;
            read(lin, rec);
            for i in 0 to 9 loop
              sw_sig(9 - i) <= '1' when rec(1 + i) = '1' else '0';
            end loop;
            for i in 0 to 3 loop
              key_sig(3 - i) <= '1' when rec(11 + i) = '1' else '0';
            end loop;
            applied_seq := seq;
            applied_at := now;
            exit;
          end loop;
          file_close(fin);
        end if;
      end if;

      -- STATE's own wire format (§ 6.4): LEDR then HEX0..HEX5, 52 bits,
      -- then the last applied input seq — the Node side's acknowledgement.
      now_bits := slv2str(ledr_sig) & slv2str(hex0_sig) & slv2str(hex1_sig)
                                    & slv2str(hex2_sig) & slv2str(hex3_sig)
                                    & slv2str(hex4_sig) & slv2str(hex5_sig);
      if (now_bits /= last or applied_seq /= last_seq) and output_file'length > 0 then
        -- Opened, written and closed on every change rather than held
        -- open for the session: file_close is what flushes, and a
        -- concurrent reader on the Node side needs that flush to see
        -- the update without waiting for this process to exit.
        file_open(status, fout, output_file, write_mode);
        write(lout, now_bits & ' ');
        write(lout, applied_seq);
        writeline(fout, lout);
        file_close(fout);
        last := now_bits;
        last_seq := applied_seq;
      end if;
    end loop;
  end process;

end architecture;
`;
}
