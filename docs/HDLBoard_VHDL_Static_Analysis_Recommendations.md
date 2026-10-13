# HDLBoard VHDL Static Analysis – Review Recommendations

## Overall Assessment

The proposed architecture is strong, appropriately lightweight, and well aligned with HDLBoard’s educational goals. The largest risks are false positives, duplicate warnings, and insufficient distinction between concurrent and sequential assignments. Addressing those concerns early will make the analyzer significantly more useful for students and easier to extend in future releases.

**Guiding Principle:** GHDL determines whether the VHDL is valid. HDLBoard explains potentially problematic but legal VHDL to help students learn.

---

## High Priority Improvements

### 1. Avoid Duplicate Warnings
The current design can generate multiple warnings for the same signal when more than two overlapping assignments exist. Group related assignments into a single diagnostic where possible to reduce noise for students. Report the conflicting assignments and their source locations, highlighting the most relevant assignment while providing related locations for the other drivers.

### 2. Distinguish Concurrent and Sequential Assignments
The specification currently treats all assignments equally. Multiple assignments inside a process may represent normal sequential logic and should not automatically be analyzed using the same rules as concurrent assignments. This distinction must be part of the core model.

### 3. Parse Architecture Structure
Restrict analysis to executable regions of the design. Avoid detecting assignments inside entity declarations, comments, generics, or other non-executable sections. Parse the basic VHDL structure so assignments are understood in their correct context.

### 4. Improve Warning Messages
Always explain:
- Which assignment is being highlighted.
- Which earlier assignment conflicts with it.
- The line number of the conflicting assignment.
- Why the overlap occurs.

Educational explanations are more valuable than generic warnings. Prefer language such as:

> “LEDR(1) may be driven by multiple assignments.”

instead of:

> “Multiple driver detected.”

Warnings should teach concepts, not merely report problems. Treat multiple drivers as a warning, not automatically as an error.

### 5. Reduce False Positives
Provide a mechanism to suppress warnings for intentionally multi-driven signals. Advanced users may legitimately use resolved signals and should be able to disable specific diagnostics. Suppression of individual rules can be deferred beyond the first version, but the design should not preclude it.

---

## Architecture Recommendations

### 6. Create a Generic Rule Framework Now
Do not hardcode analysis around multiple drivers. Create a generic rule engine immediately so future checks such as unused signals, unassigned outputs, and latch detection can be added without refactoring.

### 7. Separate Parsing from Rules
The assignment extractor should only build a model of the source code. All educational checks should exist in independent rule classes. Separate parsing, the VHDL model, and analysis rules. Introduce a lightweight VHDL intermediate model (IR) between the parser and rules.

### 8. Maintain a Shared Diagnostic Format
Use a common diagnostic interface for both current and future rules. This will significantly simplify Monaco integration and future expansion. Prefer a shared diagnostic model that can also represent GHDL diagnostics, while still clearly distinguishing their origin.

---

## Parser Recommendations

### 9. Be Conservative
If the parser is uncertain about an assignment, ignore it rather than generating a potentially incorrect warning.

### 10. Track Exact Source Ranges
Store start and end positions for assignment targets. Precise highlighting greatly improves usability in Monaco.

### 11. Prepare for Future Width Information
The current `"all"` representation is appropriate, but design the data model so signal widths can be added later from declarations. Keep signal-width information extensible for future analysis.

### 12. Handle Multi-Line Assignments
Students frequently format VHDL across multiple lines. The parser should eventually support assignments that span several lines.

---

## User Experience Recommendations

### 13. Keep Analyzer Warnings Clearly Separate from GHDL Diagnostics
Students should immediately understand whether feedback comes from:
- HDLBoard educational analysis
- GHDL compilation
- GHDL simulation

### 14. Use Educational Language
Prefer explanations that teach concepts over generic compiler-style messages. Explain why the construct is suspicious and identify the conflicting assignment.

### 15. Add Quick Explanations
Consider short hover help that explains why multiple drivers are legal in VHDL but are often mistakes in beginner designs.

---

## Testing Recommendations

### 16. Add Real Student Examples
Most bugs will come from actual student code rather than synthetic test cases. Build a regression test collection from real HDLBoard submissions.

### 17. Add False-Positive Tests
Include examples where multiple drivers are intentional to prevent the analyzer from becoming overly aggressive.

### 18. Test Performance Early
The analyzer will run during editing. Verify acceptable performance with large VHDL files and frequent edits. Test the analyzer continuously while editing.

---

## Suggested Future Educational Rules

After multiple-driver detection, prioritize the following rules (generally more helpful to beginning FPGA students than deep language-level diagnostics):

1. Unassigned outputs
2. Unused signals
3. Unused inputs
4. Unconnected ports
5. Suspicious latch inference
6. Constant conditions
7. Missing clock edge detection
8. Board-specific active-low / educational signal hints

---

## Summary of Key Risks to Address Early

| Risk | Mitigation |
|------|------------|
| Duplicate warnings | Group overlapping assignments into a single diagnostic |
| Concurrent vs sequential confusion | Model assignment context explicitly |
| False positives | Conservative parsing + optional suppression path |
| Hard to extend | Generic rule framework + IR + shared diagnostics from day one |
| Poor UX | Educational wording, clear source distinction, precise ranges |
