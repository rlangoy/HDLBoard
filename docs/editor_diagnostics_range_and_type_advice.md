# Editor Diagnostics — Advice on range and type errors

> Licensed under the [GNU General Public License v2.0](../LICENSE).

**Status: built 2026-11-14.** It extends the advice of
[`editor_diagnostics_improvement_plan.md`](editor_diagnostics_improvement_plan.md) (*the
advice plan*), whose § 4.12 left run-time messages without advice, to the two kinds of
mistake a beginner makes most after syntax: a value outside its range, and a value of
the wrong type. Every message below was produced by **GHDL 6.0.0**, both the Windows
app's bundled `ghdl.exe` and the winget build, which printed identical text, with the
backend's flags (§ 1).

## 1. What was measured

`tools/ghdl-range-corpus.mjs` runs 55 small designs the way the backend runs a portless
design: `ghdl -a --std=08 <file>`, `-e`, `-r`, bare file names, the file's directory as
cwd. It keeps the text the browser gets about the step that failed, and writes
`src/components/workbench/rangeAndType.corpus.ts`:

```
node tools/ghdl-range-corpus.mjs capture --ghdl ghdl > ghdl-6.json
node tools/ghdl-range-corpus.mjs generate ghdl-6.json          # --check: only compare
```

The cases are the five student examples of `GHDL-tests/range-checks.hdlboard.json`
(kept as written, hint comments included), 20 more run-time mistakes and 30 analysis
mistakes. `rangeAndType.golden.test.ts` holds what the student reads for each one.

### 1.1 Three facts the measurement showed

1. **A run's failed check goes to stdout, not stderr.** The backend forwards stdout one
   line per `LOG` frame; the `ERROR runtime` frame only says that the simulation exited.
   Each `LOG` line is parsed alone, so anything spread over lines was lost.
2. **`overflow detected` names no place.** Its line is the first frame of the backtrace
   printed under it:

   ```
   ghdl:error: overflow detected
     instance: /slice_bounds/P0
     from: process work.slice_bounds(test).P0 at slice_bounds.vhd:14
     from: [unknown caller]
     from: process work.slice_bounds(test).P0 at slice_bounds.vhd:12
   ghdl:error: simulation failed
   ```

   Together with fact 1, this is why `slice_bounds.vhd` showed no marker at all.
3. **A successful analysis prints its warnings to nobody.** GHDL warns
   `value constraints don't match target ones [-Wruntime-error]` at analysis, but the
   backend sends `-a`'s output only when it fails. The advice therefore reads the
   failing line and its declarations itself; it never relies on those warnings.

### 1.2 GHDL's words

| GHDL says | Mistakes behind it in the corpus |
|---|---|
| `bound check failure at f.vhd:11` | integer range passed (+1, −1), `natural` below 0, vectors of different lengths (`a`, `a & b`, `u + 1`, `to_unsigned(5, 8)`, a slice), slice starting below 0, `'succ` of the last value, a function's return value, `to_integer` into a range |
| `overflow detected` + backtrace | slice past the top, slice in the wrong direction (`v(0 to hi)` of a `downto` vector), 32-bit integer overflow |
| `index (8) out of bounds (7 downto 0) at f.vhd:15` | index past the end (variable, loop, `to_integer(addr)`) |
| `division by 0` | division by zero: **no place at all**, so nothing can be marked |
| `can't match "count" with type array type "STD_ULOGIC_VECTOR"` | integer, `unsigned`, `std_logic` … where a `std_logic_vector` is needed (GHDL names the base type, which the student never wrote) |
| `no function declarations for operator "="` | `led <= (a = b)` (a condition as a bit), `sw = 5` (a vector compared with a number) |
| `no function declarations for operator "+"` | arithmetic on `std_logic_vector` |
| `direction of the range mismatch` (analysis) | a slice with constant ends in the wrong direction, `a(0 to 3)` of a `downto` vector |
| `string length does not match that of anonymous integer subtype defined at …` | a start value with the wrong number of bits |
| `actual constraints don't match formal ones` | a port map connecting 8 bits to a 4-bit port |

## 2. How the advice is found

Three pure modules read what advice needs from the source, by pattern, and give up
(`undefined`) rather than guess:

- **`vhdlDeclarations.ts`**: every signal, variable, constant, port, generic,
  parameter and loop variable with its type: a vector with its range, a number with
  its range, an enumeration with its literals, or a scalar. Subtypes, array types and
  `x'range` are followed; widths like `WIDTH - 1 downto 0` are evaluated with the
  file's constants (`staticInteger.ts`). A generic's default counts as its value only
  when no `generic map` in the project could set it (the board testbench sets none).
  A slice that moves keeps its length when its ends differ by a constant
  (`i downto i - 3` has 4 bits). The nearest declaration above a line wins.
- **`vhdlExpression.ts`**: the assignment on a line (a label or a case choice in front
  is skipped), its `name(…)` parts, and how many bits a value has (`a & b`, `u + 1`,
  `x"AB"`, `to_unsigned(5, 8)`, `a(5 downto 2)`), only when certain.
- **`rangeAdvice.ts`**: one list of rules per GHDL message, tried in order. For
  `bound check failure`: a function's return value, `'succ`/`'pred`, two vector lengths
  that are both known and differ (certain, so before any slice is suspected), a slice,
  a vector whose value's width is unknown, a number's range, an overflow, and last a
  general direction. A number "went above" or "below" its range only when the amount
  added or subtracted is known and positive: `count + delta` may go either way. It points at the
  declaration that sets the limit (`relatedLine`, with the note *"value is declared here:
  integer range 0 to 3"*), or at the loop that runs too far.
- **`typeAdvice.ts`**: the student's own type names and the conversion to write, from
  one table of conversions between families (`std_logic_vector`, `unsigned`, `signed`,
  `integer`, `std_logic`, `bit`, `bit_vector`, `boolean`). The width a conversion needs is
  the target's number of bits when known, else `target'length`. Port widths come from
  the entity's declaration in any file of the project.

Where it plugs in:

- `diagnostics.ts`: a GHDL run error without a place (`unplaced`) waits for the first
  backtrace frame (`callSite`). `DiagnosticParser` carries it from one `LOG` line to the
  next; `useDiagnostics` keeps one parser per run.
- `diagnosticAdvice.ts`: a failed run check (an error with a line but no column whose
  message is a range check) gets `rangeAdvice`'s advice, in a `LOG` line as in an
  `ERROR` frame. A design's own `report`/`assert` text has a column, so it never does:
  the advice plan's § 4.12 concern still holds. Analysis errors get two more rules,
  `rangeError` and `typeError`, first in the list.
- All wording is in `diagnosticText.ts` (`rangeText`, `typeText`).

## 3. Not covered

- **`division by 0`**: GHDL prints no place, so there is no line to mark.
- **Other GHDL back ends.** Linux packages and the Docker image may use the LLVM or GCC
  back end; their run-time text was not measured. A message in another shape is shown
  as before, without advice.
- **Values.** GHDL does not print the value that failed, and the advice does not
  simulate: it says *"went above 3"* from the expression `value + 1`, never *"was 4"*.
- **Scope.** Declarations are found by pattern, not resolved: the nearest declaration
  above the line is taken, and a name declared in a package is not found (no advice).
