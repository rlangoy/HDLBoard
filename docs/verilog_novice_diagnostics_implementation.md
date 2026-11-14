# Beginner Verilog diagnostics: implementation and validation

Date: 14 November 2026

Implements the compiler-message recommendations in [the research report](../verilog-novice-diagnostics-report.md). Verilog now uses the existing VHDL diagnostic presentation: error/warning gutter markers, source underlines where justified, inline explanations, related-line hints, accessible status text, and tooltips retaining the original compiler message and notes. There is no separate Verilog renderer or stylesheet.

## Implemented

- Locate Icarus's capitalized runtime `Error:` messages, including an unknown system task. Suggest a known system task only when there is one close match.
- Explain port widths, bit/part selects outside a declared range, reversed selects, numeric literal truncation, undefined macros, and implicit wires without requiring a spelling candidate.
- Preserve consecutive Icarus warning notes delivered in separate `LOG` frames. Padding/pruning explanations use the compiler's own distinction between the port and the expression. They do not infer signedness or select a corrective slice.
- Explain unknown modules, named ports/parameters, excess positional connections, and duplicate declarations. Port/parameter suggestions come from a uniquely resolved module, with case-sensitive matching and a generic fallback for ambiguous or preprocessed source.
- Explain narrow, source-supported syntax cases: `=<`, assignment in an `if` condition, invalid based-literal digits, an unclosed event-control parenthesis, a missing case-item colon, an unbraced multi-statement `if`, and unmatched block/module/case closers.
- Preserve student-written `$warning`, `$error`, and `$fatal` text even when it resembles compiler output.
- Console links retain recorded advice and continuation details, preserve other markers, and can restore a dismissed message. Advice is reused only while the file still matches the run snapshot.

Ordinary simulation output, accepted truncating assignments, intentional latches, multiple drivers, and blocking assignments do not acquire new warnings. The research proposed those as a separate optional analysis feature; this implementation does not change compilation or language semantics.

## Structure and code review

The implementation and self-review used `temp/clean_code.md` and the repository's existing VHDL design. Parsing, storage, source analysis, message wording and presentation remain separate:

- `diagnostics.ts` recognizes output and carries adjacent notes across frames.
- `diagnosticStore.ts` merges details into an existing message without incrementing its count. Duplicate updates keep object identity; streamed details are bounded.
- `icarusMessageAdvice.ts` holds measured compiler-message patterns.
- `icarusSyntaxAdvice.ts` contains small token-based checks, reusing the editor tokenizer and parenthesis matching.
- `verilogModuleLookup.ts` reuses the symbol analysis for scoped port and parameter candidates. It receives the tokens `icarusAdvice.ts` already computed, for the project's Verilog files only.
- `verilogDirectives.ts` decides once, for both of the above, when preprocessing makes the written source unreliable.
- `diagnosticText.ts` owns the wording; the existing editor components render it.

New implementation files are included in the repository's clean-code ESLint rules, including limits on function length, parameters, complexity and nesting. No lint exceptions or dependencies were added.

Review corrections included limiting missing-closer advice to EOF/conflicting closers, protecting runtime report wording, preserving advice on console navigation, avoiding JavaScript prototype names as construct openers, and removing misleading claims that every implicit wire is unconnected. Regression tests cover these decisions and reject ambiguous spelling suggestions.

A second review against `temp/clean_code.md` removed the duplicated preprocessing check, converted the reported line to the tokens' 0-based numbering in one place, replaced a flag argument (`portAdjustment`) and a hidden dependency on the `module` capture group, split the module and member rules, and extracted the parser's note handling and the store's duplicate merge into small named functions. It also fixed an unclosed `if (` being read to the end of the line as its condition, which could suggest `==` for an ordinary assignment.

## Validation

The checked-in `src/components/workbench/fixtures/verilog-novice.json` contains the 44 original sources and captured backend frames. Tests replay the actual parser, file locator, advisors, store and shared text formatter. Controls verify legal operators, comments/strings, runtime assertions, preprocessing, same-name instances in different modules, ambiguous declarations and streamed-note boundaries.

- Final full frontend suite: **169 files, 3,258 tests passed**, including the runtime-report, console-link and prototype-name regressions.
- `npm run build`: passed. Vite reports the existing large-bundle advisory.
- `npm run lint`: passed, including the new files under the clean-code rules.
- **All 44 original examples ran through the actual HDLBoard UI in Chrome**, using the browser connection and the real local backend with bundled Icarus 13.0. No WebSocket responses were mocked. Editing cleared the previous markers in all 44 cases. The eight accepted-code controls remained unmarked.
- After the second review, all 44 examples were run again in Chrome against the real backend and compared with the earlier captured results: markers, severities, headlines and underlines were identical in all 44. The two-module cases were also compared with the committed version served side by side. A console link restored the full port-width advice for an unchanged file and only the compiler text after an edit.
- Additional Chrome checks passed for a student `$warning` containing compiler-like wording, a repaired clean run, and console navigation retaining the full port-width warning and pruning detail.
- A real GHDL/VHDL missing-semicolon control retained its existing red marker, underline, inline message, related compiler detail and status announcement. Clicking its console link preserved those details. The temporary browser edit was restored afterward.

Temporary browser sources, the reusable inspection helper, captured UI results and command logs are under `temp/verilog-novice-research/`. The browser exposed no Pluno tool registry, so testing used the available Chrome automation connection. The helper can register its read-only inspection tool when that registry is available.

## Boundaries

The new rules are deliberately conservative, not a Verilog parser or linter. Complex generated/preprocessed module references receive generic advice instead of speculative spelling fixes. Syntax heuristics do not offer automatic edits. Unknown messages retain their compiler text. Existing Icarus 12 wording fixtures remain covered, but live verification for this change was Windows/Icarus 13; Linux and a live Icarus 12 installation were not tested.
