-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- hdlb_pkg - shared helper for HDLBoard plugins (library hdlboard).
-- See ../../plugin_batch_implementation_plan.md, section "Line protocol".
--
-- Every line a plugin wants the GUI to see goes through hdlb_emit, so all
-- plugins share one format and one timestamp definition:
--
--   @@HDLB <kind> <instance> <t_ns> <payload>
--
--   <t_ns> = simulated time since the start of the run (now), integer ns.

library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

package hdlb_pkg is
  procedure hdlb_emit(kind, instance, payload : string);
end package;

package body hdlb_pkg is
  procedure hdlb_emit(kind, instance, payload : string) is
    variable l : line;
  begin
    write(l, string'("@@HDLB ") & kind & " " & instance & " " &
             to_string(now / 1 ns) & " " & payload);
    -- Raw stdout, not report: report prefixes "file:line:col:@time:(report note):",
    -- so the line would no longer start with @@HDLB.
    writeline(output, l);
  end procedure;
end package body;
