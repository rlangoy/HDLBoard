-- SPDX-License-Identifier: GPL-2.0-only
-- Copyright (C) 2026 Rune Langøy
--
-- hdlb_pkg - shared helper for HDLBoard plugins (library hdlboard).
-- See docs/plugin_batch_implementation_plan.md, section "Line protocol".
--
-- Every line a plugin wants the GUI to see goes through hdlb_emit, so all
-- plugins share one format and one timestamp definition:
--
--   @@HDLB <kind> <instance> <t_ns> <payload>
--
--   <t_ns> = simulated time since the start of the run (now), integer ns.
--
-- <payload> must be printable ASCII (0x20..0x7E), at most 200 characters; the
-- server sends anything else to the console as an ordinary line.

library ieee;
use ieee.std_logic_1164.all;
use std.textio.all;

package hdlb_pkg is
  procedure hdlb_emit(kind, instance, payload : string);

  -- True if s matches [A-Za-z_][A-Za-z0-9_]* - the rule for <kind> and <instance>.
  -- Plugins use it in a concurrent assertion on their `name` generic, so a bad
  -- name stops the run at time 0 with a clear message instead of making every
  -- later line fall back to the console.
  function hdlb_is_ident(s : string) return boolean;
end package;

package body hdlb_pkg is
  function hdlb_is_ident(s : string) return boolean is
    variable c : character;
  begin
    if s'length = 0 then return false; end if;
    for i in s'range loop
      c := s(i);
      if not ((c >= 'A' and c <= 'Z') or (c >= 'a' and c <= 'z') or c = '_' or
              (i /= s'left and c >= '0' and c <= '9')) then
        return false;
      end if;
    end loop;
    return true;
  end function;

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
