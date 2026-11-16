# Beginner Verilog diagnostics in HDLBoard: research report

Date: 14 November 2026  
Scope: diagnostic research and temporary test cases; no application code changes.

## Executive summary

HDLBoard already provides useful Verilog help for misspelled keywords and identifiers, a likely missing semicolon, implicit-wire typos, and common `wire`/`reg` mistakes. The largest remaining opportunities are **port and parameter connection errors**, **width and range warnings**, and **runtime errors the editor cannot locate**. These are common situations in board exercises where a student needs the object, its actual and expected widths, and a concrete next step — not only Icarus's terminology.

In 44 deliberately small examples, the real HDLBoard backend returned 28 error outcomes and completed 16 runs. The editor's parsing/advice functions produced at least one located diagnostic in 35 cases; 8 cases produced a non-follow-on advice headline. These counts describe this **chosen, non-representative corpus**, not the prevalence of student mistakes or a quality score. Some completed examples intentionally demonstrate behavior that the simulator accepts, and some parseable messages are already understandable. Two cases exercise a known typo pattern, so counts are not independent categories.

**Recommended order:** (1) locate Icarus runtime `Error:` messages; (2) explain width, bit/part-select and truncation warnings; (3) explain missing modules, named ports, parameters and port counts; (4) improve high-confidence syntax messages and missing block closers; (5) explore opt-in, low-noise checks for silent behavioral mistakes. Preserve the actual compiler message in the tooltip and avoid suggesting a correction unless the code supports it.

## Method and boundaries

- Source context: [existing Verilog diagnostic research](editor_diagnostics_verilog_research.md), [Icarus advice rules](../src/components/workbench/icarusAdvice.ts), and [VHDL range/type advice](editor_diagnostics_range_and_type_advice.md). This research extends rather than replaces the earlier 33-case study.
- Selected examples from undergraduate teaching material and simulator documentation, then wrote original minimal programs. The [Icarus warning options documentation](https://steveicarus.github.io/iverilog/usage/command_line_flags.html) describes warnings for implicit nets, port binding and out-of-range selects; [Cornell's introductory notes](https://people.ece.cornell.edu/land/courses/ece5760/Verilog/Verilog_index.html) discuss blocking/nonblocking assignments. [Lattice's HDL coding guidelines](https://www.latticesemi.com/~/media/LatticeSemi/Documents/UserManuals/EI/HDLcodingguidelines.pdf?document_id=48203) discuss simulation/synthesis mismatches. These sources inform case selection; they do not establish a measured student error frequency.
- Platform: Windows, HDLBoard backend from this workspace, bundled Icarus Verilog **13.0**. Each case was run through a real loopback WebSocket session with the selected top module `top`; the backend performs its ordinary port discovery and build. No custom compiler flags were supplied. The backend's second compile enables `-Wall`, excluding timescale warnings.
- The harness fed each backend `ERROR` body, or each `LOG` line, through the actual editor parser, file-location, and Verilog advice functions. It did **not** automate a browser or visually verify the editor. Warning continuation lines were fed one at a time, as they arrive; the current stateless handling cannot attach a continuation to a preceding `LOG` line.
- The cases and captured data (`*.v` files, `cases.json`, `run.ts` and `results.json`) were a temporary corpus in the author's working copy (`temp/verilog-novice-research/`, which is not committed). Its script started a loopback backend with temporary session directories, and depended on the built backend under `server/dist` and the vendored Windows Icarus installation.
- Results are not a cross-version guarantee. Verify on Icarus 12 and 13, Linux and Windows, and with the supported language-generation options before implementing text rules. Explicitly test normal board designs, portless testbenches, multiple source files and the editor UI. Header-cycle tests are outside this corpus; they were investigated separately.

## Findings and proposed improvements

### P1 — Runtime errors can have no editor marker

**Measured:** `unknown_system_task.v` uses `$disply` instead of `$display`. HDLBoard returns an `ERROR runtime` body containing `unknown_system_task.v:2: Error: System task/function $disply() is not defined by any module.` The diagnostic pipeline produced **no located diagnostics**, even though the filename and line are present. The recognizer handles lowercase Icarus `error:` but not this capitalized runtime `Error:`. Compare `runtime_fatal.v`: `FATAL:` arrived in a log, and its location was recognized.

**Student-facing proposal:** show “`$disply` is not a known system task. Did you mean `$display`?” only if a unique close match is known; otherwise “`$disply` is not defined; check the spelling and whether the required module or extension is available.” Mark the call and preserve the original runtime message. Parse the exact runtime form and severity without assuming every simulation's text is compiler output. Verify Linux/12.0 spelling and an actual browser run.

### P1 — Port width mismatch: say what gets lost or added

**Measured:** `port_width.v`, line 4: `Port 1 (data) of module child expects 4 bit(s), given 8.` HDLBoard shows this as a warning with no specific advice. A subsequent `LOG` line says `Pruning 4 high bits of the expression.` but it is not attached as a detail. In `output_width.v`, the corresponding continuation says `Padding 4 high bits of the port.` The direction and what is padded or pruned matter.

**Proposal:** “Port `data` of `child` expects 4 bits; the connected expression has 8. Four high bits are discarded. Check the port and signal widths.” If direction and indices are known from the correct module/instance, show a clearly labeled possible slice or extension; do not automatically select low bits or infer signedness. For output and inout connections, derive the direction from the formal declaration and the compiler's continuation rather than reusing the input explanation. Attach continuation details across consecutive log frames. Test both Icarus 12 and 13 wordings and named/positional connections.

### P1 — Bit and part selects: identify the declared range and the `x`

**Measured:** `index_outside.v`, line 3: `Constant bit select [5] is after vector data[3:0].` The subsequent line says the result is replaced with `1'bx`; it is not attached to the warning. `part_select_width.v` similarly selects `[7:2]` from `[3:0]`, and Icarus says out-of-bounds bits become `x`. `slice_reversed.v` fails with `part select data[0:3] is out of order.` None gets tailored advice.

**Proposal:** “`data` has indices 3 down to 0; index 5 is outside that range, so this select produces `x`.” For `[0:3]` on a `[7:0]` vector, explain the declaration's direction and offer `[3:0]` only if that is a valid, clearly labeled example. Preserve the actual indices, not an assumed zero-based range; test ascending declarations, parameterized bounds, negative bounds, variable indices, partial selects, and no known range. Do not claim that a dynamic index was checked when the compiler did not report it.

### P1 — Module, port, parameter and port-count failures

**Measured:**

- `unknown_module.v`: `Unknown module type: adder`.
- `unknown_port_typo.v`: `port ``dtaa'' is not a port of u1.` The child declares `data`, but no candidate is offered.
- `unknown_named_parameter.v`: `parameter `WIDHT` not found in `top.u1`.`
- `wrong_number_ports.v`: `Wrong number of ports. Expecting at most 3, got 4.`

All four are located, but receive no tailored headline. A separate positional example with *fewer* arguments completed, so the tool must not assume that every unconnected port is illegal.

**Proposal:** explain that a module must be defined in an included project source and suggest a near module name only when unambiguous. For named ports/parameters, show the instance, its resolved module and a unique close declaration (for example `data` for `dtaa`); otherwise ask the student to compare with the declaration. For excess positional arguments, say that the instance provides four connections for a module with three ports and suggest named connections as an option. Resolve names with Verilog case sensitivity, project file scope, generated/conditional constructs, and same-name filtering in mind. Do not invent a suggestion for an unresolved or ambiguous module.

### P1 — Undefined macro and implicit net without a spelling candidate

**Measured:** `undefined_macro.v`, line 2: `macro MAX_COUNT undefined (and assumed null) at this point.` It completed, and the resulting display output was `32`; it received no tailored advice. `implicit_no_candidate.v`: Icarus warned `implicit definition of wire 'answer'.` but there was no explanation because there was no close declared identifier. By contrast, `implicit_typo.v` already says the undeclared name may be a misspelling and that Verilog made a new unconnected wire.

**Proposal:** explain that the macro has not been defined *at that point*; check spelling, definition/include order, active `ifdef` branch and project defines. For a new implicit wire, explain that Verilog created a one-bit wire automatically, that it may be unintended, and that the student can declare it explicitly; suggest a name only with a strong unambiguous match. Do not assert every implicit net is wrong. Consider an opt-in strict `default_nettype none` workflow separately, since it changes compilation behavior.

### P1 — Syntax diagnostics need targeted, cautious explanations

**Measured:** `wrong_assign_operator.v` (`=<`), `comparison_equals.v` (`=` in an `if`), `bad_binary_digit.v` (`4'b1020`), `bad_sensitivity.v` (missing `)`), `missing_else_colon.v` (a `case` arm missing `:`), and `missing_begin2.v` (two statements after an unbraced `if`) all produce bare `syntax error` or a generic follow-on, without a specific headline. The case-arm example also reports `Incomprehensible case expression.` at the next line. A generic previous-line semicolon suggestion can be irrelevant for these cases.

**Proposal:** add narrow, ordered rules only when the syntax and context are clear:

- In `if (...)`, a lone assignment `=` where a comparison is expected: suggest checking `==`; do not confuse legal relational `<=` with assignment.
- Explain `=<` as an invalid operator; suggest `<=` only in a procedural assignment context. In a comparison, the intended relation could differ.
- For `4'b1020`, identify `2` as invalid in a binary literal and explain the allowed binary digits including `x` and `z`; also validate other bases.
- Point to an unmatched event-control `(` and, with balanced token evidence, a missing `:` on a case item.
- Where a second procedural statement and an `else` give strong evidence, explain that multiple statements belong inside `begin ... end`; do not infer intent from indentation alone.

The generic syntax message must remain available. Test comments, strings, multiline code, legal operators, incomplete edits and cascade suppression; Icarus often reports a line after the actual error.

### P2 — Unclosed constructs and duplicate declarations

**Measured:** `missing_endmodule.v` and `syntax_lost_eof.v` yield only `syntax error` at the end of the file and `I give up.` `case_missing_endcase.v` gives the same generic result at `end`. The current output does not identify the opening construct. `duplicate_signal.v` gets a located message that `x` was already declared, plus a useful declaration detail, but does not explain the conflict in simpler words.

**Proposal:** for an end-of-file error, look for an *unambiguously* unmatched `module`/`endmodule`, `begin`/`end`, or `case`/`endcase`; point at its opening line and say what may be missing. Avoid a specific claim when comments, preprocessor conditionals, generated code or malformed syntax make nesting uncertain. For duplicates, keep Icarus's existing related declaration and say “`x` is already declared on line N; remove or rename one declaration,” only after confirming it is the same scope.

### P2 — Numeric literal truncation and undiagnosed assignment widths

**Measured:** `literal_truncated.v` writes `4'd31`. The warning says `Numeric constant truncated to 4 bits.` and the observed output was `15`; the warning has no tailored advice. `assign_width.v` assigns `8'hff` to a four-bit wire and completes with `narrowed=f` and **no warning** from the current pipeline.

**Proposal:** for a reported literal truncation, say the literal's written width and, only for a safely evaluated literal, its representable range and resulting truncated value; suggest making the width large enough or intentionally selecting bits. For assignments with no compiler message, a separate optional width analysis could point out definite static narrowing, but it must not imply an error when truncation is intentional. Handle signedness, unsized literals, expression sizing, casts, concatenations, parameters and unknown values before giving numeric conclusions.

## Accepted Verilog with no diagnostic: separate from compiler-message improvements

These are **observations and candidates for optional educational checks**, not compiler errors and not grounds for an unconditional red error:

- `incomplete_combination.v`: the incomplete combinational assignment completed and displayed `q=x`; in a hardware-oriented interpretation it can infer storage. A teaching hint can ask whether all branches should assign the output, while allowing intentional latches.
- `blocking_sequential.v`: the clocked process completed with `a=1 b=1`; blocking assignments execute in order. Explain the scheduling difference and offer nonblocking assignments as a conventional sequential design choice, not a mechanical fix or a claim that all blocking assignments are invalid.
- `conflicting_driver.v`: two continuous drivers of a resolved wire completed and displayed `x`. Multiple drivers can be intentional; only contextual advice about resolution and unknown values is safe.
- `division_zero.v`: division by zero displayed `x` rather than a compiler error. Consider an observed-value explanation or a narrowly proven static check; do not claim this is a runtime exception.
- `wrong_operator_le.v`: `if (a <= 1)` compiled and printed `yes`; `<=` is a valid comparison in this context. A tool cannot infer that the student intended an assignment merely from the symbol.
- `invalid_range.v` and `multiple_driver.v` also completed. Their names describe the *hypothesis under test*, not a verified language error; retain them as negative controls and avoid deriving rules from the names alone.

## Known good controls and qualification of existing advice

`missing_semicolon.v` and `missing_semicolon_last.v` got a likely missing-semicolon headline and the previous line; `keyword_always.v` suggested `always`; `undeclared_rhs.v` suggested `counter`; `implicit_typo.v` suggested `led_out`. These are worth preserving with regression tests. `wire_procedural.v` and `reg_continuous.v` received existing wire/reg explanations. The former's wording mentions an `always` block even though the example uses `initial`; “procedural block (`always` or `initial`)” would be more precise. Advice must remain sensitive to Verilog generation: `logic` and continuous assignment rules vary with the selected language mode.

`missing_include.v` was located on the include line and retained the compiler's text. The separate circular-include pre-check already handles the straightforward cycle; do not duplicate it or promise that macro-dependent loops are always found.

## Suggested implementation and validation strategy

1. Add a measured corpus covering real backend output per Icarus version; assert the primary marker's file, line, severity, headline, and original message. Include controls that must not trigger each rule.
2. Fix runtime `Error:` location parsing and test ERROR frames independently from user `$display` text. Check that casing changes do not turn notes or user output into errors.
3. Make warning details survive per-line `LOG` delivery, then add rules for stable Icarus warning patterns. Preserve other simulator output and session boundaries.
4. Add source-aware advice for ports, parameters, width and range, restricted to a uniquely resolved declaration. Keep safe generic wording when parsing or preprocessing makes a conclusion uncertain.
5. Add focused syntax rules and construct matching with separate cascading-error tests. Check actual displayed gutter, inline message and tooltip in a browser.
6. Treat silent semantic checks as a separately designed, opt-in educational feature with explicit controls for intentional patterns. They are not derivable from the compiler messages above.

## Full measured corpus inventory

The status below is the real session's final outcome; “advice” refers to a primary, non-follow-on editor headline. The first located message is shortened for scanning; the corpus's `results.json` held all frames and follow-on diagnostics.

| Case | Outcome | Primary located diagnostic or observed output | Primary advice |
|---|---|---|---|
| `missing_semicolon` | analyze | syntax error | Yes |
| `wrong_assign_operator` | analyze | syntax error | No |
| `comparison_equals` | analyze | syntax error | No |
| `keyword_always` | analyze | syntax error | Yes |
| `missing_endmodule` | analyze | syntax error | No |
| `missing_begin` | analyze | syntax error | No |
| `bad_sensitivity` | analyze | syntax error | No |
| `wire_procedural` | analyze | 'q' is not a valid l-value for a procedural assignment. | Yes |
| `reg_continuous` | elaborate | Variable 'q' cannot be driven by a continuous assignment/module. | Yes |
| `undeclared_rhs` | elaborate | Unable to bind wire/reg/memory \`countr' in \`top' | Yes |
| `unknown_identifier` | elaborate | Unable to bind wire/reg/memory \`missing_signal' in \`top' | No |
| `implicit_typo` | completed | implicit definition of wire 'led_ou'. | Yes |
| `implicit_no_candidate` | completed | implicit definition of wire 'answer'. | No |
| `unknown_module` | elaborate | Unknown module type: adder | No |
| `unknown_port` | elaborate | port \`\`input_a'' is not a port of u1. | No |
| `unknown_named_parameter` | elaborate | parameter \`WIDHT\` not found in \`top.u1\`. | No |
| `wrong_number_ports` | elaborate | Wrong number of ports. Expecting at most 3, got 4. | No |
| `port_width` | completed | Port 1 (data) of module child expects 4 bit(s), given 8. | No |
| `output_width` | completed | Port 1 (data) of module child expects 8 bit(s), given 4. | No |
| `index_outside` | completed | Constant bit select [5] is after vector data[3:0]. | No |
| `slice_reversed` | elaborate | part select data[0:3] is out of order. | No |
| `invalid_range` | completed | xx | No |
| `duplicate_signal` | analyze | 'x' has already been declared in this scope. | No |
| `multiple_driver` | completed | No located diagnostic or user output | No |
| `assign_width` | completed | narrowed=f | No |
| `literal_truncated` | completed | Numeric constant truncated to 4 bits. | No |
| `incomplete_combination` | completed | q=x | No |
| `blocking_sequential` | completed | a=1 b=1 | No |
| `division_zero` | completed | quotient=          x | No |
| `bad_binary_digit` | analyze | syntax error | No |
| `case_missing_endcase` | analyze | syntax error | No |
| `missing_include` | analyze | Include file defs_missing.vh not found | No |
| `syntax_lost_eof` | analyze | syntax error | No |
| `unknown_system_task` | runtime | unknown_system_task.v:2: Error: System task/function $disply() is not defined by any module. | No |
| `unknown_port_typo` | elaborate | port \`\`dtaa'' is not a port of u1. | No |
| `part_select_width` | completed | Part select [7:2] is selecting after the vector x[3:0]. | No |
| `undefined_macro` | completed | macro MAX_COUNT undefined (and assumed null) at this point. | No |
| `missing_else_colon` | analyze | syntax error | No |
| `missing_begin2` | analyze | syntax error | No |
| `bad_module_name` | elaborate | Unable to bind wire/reg/memory \`countr' in \`top' | Yes |
| `missing_semicolon_last` | analyze | syntax error | Yes |
| `conflicting_driver` | completed | x=x | No |
| `wrong_operator_le` | completed | yes | No |
| `runtime_fatal` | runtime | failure example | No |

The table records what the harness observed; “No” advice does not mean the compiler message is wrong or that a new rule is necessarily desirable.
