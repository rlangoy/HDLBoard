// SPDX-License-Identifier: GPL-2.0-only
// Copyright (C) 2026 Rune Langøy

/**
 * The simulator locations, given on the command line. Each flag stands in for the
 * environment variable of the same name and wins over it, so an installer can write the
 * paths it chose into the shortcut it creates rather than into the user's environment:
 *
 *   --iverilog-dir <dir>   IVERILOG_DIR — a self-contained Icarus tree (run with -B/-M)
 *   --ghdl-dir <dir>       GHDL_DIR     — a GHDL installation, the program in <dir>/bin
 *   --ghdl-exe <path>      GHDL_EXE     — the GHDL program itself
 *
 * Both `--flag value` and `--flag=value` are accepted. The script entry parses strictly —
 * a typo'd flag is an error, not a silently ignored setting — while Electron parses
 * leniently, because its argv also carries Chromium's switches and the app path.
 */

export interface ToolArgs {
  iverilogDir?: string;
  ghdlDir?: string;
  ghdlExe?: string;
}

export type ToolArgsResult = { readonly ok: true; readonly args: ToolArgs } | { readonly ok: false; readonly error: string };

const FLAGS: Readonly<Record<string, keyof ToolArgs>> = {
  '--iverilog-dir': 'iverilogDir',
  '--ghdl-dir': 'ghdlDir',
  '--ghdl-exe': 'ghdlExe',
};

export const TOOL_ARGS_USAGE = [
  'usage: node dist/server.js [--iverilog-dir <dir>] [--ghdl-dir <dir>] [--ghdl-exe <path>]',
  '  --iverilog-dir <dir>  Icarus Verilog tree (overrides IVERILOG_DIR)',
  '  --ghdl-dir <dir>      GHDL installation, program in <dir>/bin (overrides GHDL_DIR)',
  '  --ghdl-exe <path>     GHDL program (overrides GHDL_EXE)',
].join('\n');

export function parseToolArgs(argv: readonly string[], { strict }: { strict: boolean }): ToolArgsResult {
  const args: ToolArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    const key = FLAGS[flag];
    if (key === undefined) {
      if (strict) return { ok: false, error: `unknown argument: ${arg}` };
      continue;
    }
    const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
    if (value === undefined || value === '' || (eq === -1 && value.startsWith('--'))) {
      return { ok: false, error: `${flag} needs a value` };
    }
    args[key] = value;
  }
  return { ok: true, args };
}
