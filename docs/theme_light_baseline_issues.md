# Light theme — baseline contrast issues

Logged at Gate 1 of `docs/HDLBoard_Black_Theme_Spec.md` (Phase 1), 8 November 2026.

Phase 1 moved today's colours into `src/theme/themes/light.css` without changing any of them,
so these shortfalls are the current appearance, not regressions. **They are not fixed in this
delivery** (spec § 2.1 T05, Appendix A). Any Light fix is a separate, later commit with
before/after evidence.

Method: WCAG 2.2 relative luminance, on the rendered colour. Translucent layers (the editor
selection) are composited over their background first. The pairs are the ones the Dark contrast
test checks (`src/theme/themeContrast.test.ts`), evaluated with the Light values.

| Foreground | Background | Ratio | Target | Where it shows |
| --- | --- | --- | --- | --- |
| `--wb-gutter-fg` `#94a3b8` | `--wb-sidebar-bg` `#f8fafc` | 2.45 : 1 | 4.5 : 1 | Editor line numbers |
| `--wb-syn-comment` `#16a34a` | `--wb-code-bg` `#ffffff` | 3.30 : 1 | 4.5 : 1 | Code comments |
| `--wb-syn-comment` `#16a34a` | selection, `#c8d8fa` composited | 2.30 : 1 | 4.5 : 1 | A comment inside a text selection |
| `--wb-accent-ink` `#2f6fed` | `--wb-sidebar-bg` `#f8fafc` | 4.35 : 1 | 4.5 : 1 | Accent-coloured text on the side panels |
| `--pb-sw-body-edge` `#b9bdc4` | `--pb-card-bg` `#fafcfd` | 1.83 : 1 | 3 : 1 | Outline of a switch housing (non-text) |

All other checked pairs pass in Light: main, muted and body text, the code text, the other seven
syntax colours, Board I/O labels and readouts, menu text, waveform axis and bus text, the focus
ring and the LED package ring.

Notes for a later fix:

- The switch housing reads as a raised shape through its gradient and shadow, so its 1 px edge
  is not its only cue; a fix should still be measured in the board panel.
- Darkening `--wb-syn-comment` to about `#15803d` (5.0 : 1 on white) would also lift the
  in-selection ratio, but changes how every listing looks; it needs a visual review.
