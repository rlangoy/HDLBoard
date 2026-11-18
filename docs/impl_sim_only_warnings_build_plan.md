# Simulation-only warnings — Build Plan

Status: plan, not started. Date: 2026-11-18.

How to build docs/impl_sim_only_warnings.md (*the spec*) following temp/clean_code.md (*the rules*). Section
numbers like § 4.2 point into the spec.

## 1. How the rules apply here

The repo already enforces part of the rules. `eslint.config.js` checks every file listed in `NEW_CODE` for:

- function length: 40 lines;
- parameters: 3;
- complexity: 8;
- nesting: 3;
- magic numbers, `any` and `!`.

That is the working definition of "clean" for this feature. The rest of the rules are checked in review.

| Rule | What it means for this feature |
|---|---|
| Follow standard conventions | Do it the way the detector does: pure modules, rules as data (`rules.ts`), all strings in one file (`testbenchText.ts`), table-driven tests (`rules.test.ts`). |
| Keep it simple; needless complexity | No new framework. Reuse `addToFiles`, `withUnits`, `ruleById`, `testbenchStem`, `contradictsCode` and the block logic in `regions.ts`. |
| Boy scout rule | Fix what we touch: `Instance` reused for port offsets, `simOnlyRegions` with two meanings, the on/off-only stored choice, the radio list in `EditorSection.tsx`. Each is its own commit with no change in behaviour. |
| Always find root cause | Stale markers after an edit (§ 2, item 9) are fixed at the source: warnings show only for text the analysis has seen. We don't add more places that clear markers. |
| Configurable data at high levels | `Workbench` reads the mode once and turns it into a `DesignCheck`. No code below it asks for the mode. |
| Polymorphism over if/else | The two modes are two functions in one table, not `if (mode === …)` in five places. Tiers, groups, badges and constructs are tables too. |
| Dependency injection | Board ports, the board's clock, the mode and `fetch` are passed in as arguments, the way `boardPorts` is today. |
| Law of Demeter | The UI gets finished answers (`groupOf(fileId)`, `simOnlyRegions.get(fileId)`). It never walks `analysis.byFile.get(…).units…` itself. |
| Encapsulate boundary conditions | One function builds unit keys (it holds the VHDL case rule), one decides whether a line may get a warning (`isWarnable`, shared by phase 1 and 2), and one walk handles cycles. |
| Value objects over primitives | `UnitRef`, `CheckInput`, `FileGroup` instead of loose strings and long parameter lists. |
| Few arguments, no flag arguments | Parameter objects where the spec has four arguments. The `enabled` flag becomes the mode table. `withSimModel` and `withoutSimModel` replace `setSimModel(…, on)`. |
| No side effects | Everything in `simOnly/` is pure. The two new hooks only hold state and memoise. |
| Descriptive, searchable names | The spec's words, used the same way everywhere: *construct*, *finding*, *tier*, *hardware unit*, *code group*, *Simulation model*. Regexes and limits are named constants. |
| Small, one thing | New logic goes in new, small files. `Workbench.tsx` (2350 lines), `useTestbenchSplit.tsx` (399) and `diagnosticStore.ts` get wiring lines only; they are not in `NEW_CODE`. |
| Tests: one assert, fast, independent | `test.each` tables with one expectation per case. Pure functions, so only the two hook tests need React or timers. |

## 2. Changes to the spec's design

These problems show up when the spec is laid over the code. Settle them before step 1; the steps below assume the
*Plan* column. Once agreed, fold them back into the spec.

| # | Spec | Problem | Plan |
|---|---|---|---|
| 1 | `codeGroups(analysis, hardware, findings, overrides)` | Four parameters; the lint maximum is three. | `codeGroups(input: CheckInput)`, where `CheckInput = { view, overrides, findings }` and `view` is the `DesignView` of item 7: `{ raw, corrected, hardware }`. |
| 2 | `useSimOnlyWarnings(analysis, overrides, enabled)` | Flag argument. And having no findings is not enough: *Simulation only* must also hide the `SIM-only` group of a *Simulation model*. | A mode table, `DESIGN_CHECKS[mode](input)`. `synthesisCheck` does everything. `simulationCheck` is a null object: no findings, groups from roles alone, no synthesis roots. |
| 3 | A construct has `fromRule` **or** `find` | Half one thing, half the other: every caller has to ask which one it has. | Every construct has `find`. `fromRule(id)` is an adapter that returns `ruleById(id).find`, so the regex still lives once, in `rules.ts`. It runs on the text, not on stored evidence, so it also works for unowned architectures (§ 4.1), which have no evidence. |
| 4 | `FileGroup = CodeGroup \| 'mixed'` | Can't say "mixed, and its design part is SIM-only", which § 2.1 and § 5.3 need for the icon. | `FileGroup = 'rtl' \| 'sim-only' \| 'tb' \| 'mixed' \| 'mixed-sim-only'`. The UI looks each one up in a table. |
| 5 | `simOnlyRegions` | Two meanings: the `translate_off` line spans (`blank.ts`, `UnitText`) and the UI's SIM-only regions. | Rename the line spans to `hiddenFromSynthesis` (in `blank.ts`, `rules.ts` and `analyzeProject.ts`). `simOnlyRegions` then means only the UI regions. |
| 6 | `Instance.guarded` | `designUnits.ts` also uses `Instance` for port offsets (`portOffsets`, whose `line` holds an offset). | Add `PortOffset { name, offset }` first. Then only real instances get `guarded`. |
| 7 | `effectiveFile` gives `asDesign` units the role `rtl` | `effectiveFile` is called about 20 times, in 4 files; changing it is rigidity. | Leave it alone. `withHardwareRoles(project, hardware)` returns a corrected `ProjectAnalysis`, built with `withUnits`, and `useTestbenchSplit` passes that to everything it calls. The student's mark still wins, because `effectiveFile` applies it on top. |
| 8 | `mergeDiagnostics(run, live)`, new in `diagnosticStore.ts` | Would repeat the caps and dedup of `addToFiles`. | Turn the live findings into `AdvisedDiagnostic[]` and give the editor `addToFiles(runByFile, live)`, memoised. The store needs no new function. |
| 9 | (not in the spec) | An edit clears the file's run markers right away (`handleContentChange` → `dismissDiagnostics`), because their line numbers are now wrong. Merged into the same `diagnostics` prop, live warnings would get everything run markers get: they would stay on old lines for 500 ms, and the status line would say "Click or type in the file to clear the markers" (`CLEAR_HINT`), which isn't true for them. Hiding them on every edit doesn't work either: a long message gets rows of its own under the line (`extraRows.ts`), so the code would jump at every typing pause, and the polite status line would speak again each time. | Three rules, listed below the table. |
| 10 | The mode is stored "like the other editor choices" | `storedChoice.ts` stores only on/off, `appDefaults.ts` knows only booleans, and `useBouncyOption` would be copied. | Generalise each once (step 5): a stored value with a validator, a `choice` setting type, and a shared `useHostSetting` hook that `useBouncyOption` is rebuilt on. |
| 11 | *Show example* in the tooltip | The line tooltip is a plain `title` string (`EditorSurface.tsx`, `describeLine`) and can't hold a link. | Needs a decision (§ 6, Q1). |
| 12 | (not in the spec) | The tooltip names the compiler before the message, and the default name is `GHDL` (`diagnosticText.ts`, `DEFAULT_COMPILER`). | Live warnings set `advice.compiler: 'HDLBoard'`. |
| 13 | (not in the spec) | `regionIndex` is one number, for the TB pane only: `stepRegion` always moves the TB pane, and `regionNav` returns `null` for RTL. | Give each pane its own region index. |
| 14 | Role correction in *Simulation only* | § 6 only says "testbench detection is unchanged". | Keep the correction in both modes. It fixes pairing, not warnings, and pairing shouldn't change when the student flips the setting (§ 6, Q2). |
| 15 | `simOnlyFindings(file, hardware)` matches each file | Matching needs the blanked code, which `FileAnalysis` doesn't keep. Blanking every file again every 500 ms wastes time. | `simOnly/matches.ts` blanks a file once and caches its matches in a `WeakMap` keyed by the file's `FileAnalysis`. `analyzeProject` reuses that object while the content is unchanged. The project level only filters the matches by hardware. Findings read the **raw** analysis: `withHardwareRoles` and `withRoleOverride` build new objects, so on the corrected analysis the cache would miss on exactly the corrected files, which are the SIM-only designs. |

Rules for live warnings (item 9):

- **Lines.** A file keeps its last live warnings while its line count is the line count its analysis was made from
  (`countLines` in `diagnosticLocation.ts`). Typing within a line changes nothing on screen. When a line is added or
  removed, the file's live warnings hide until the analysis catches up, 500 ms later.
- **Clearing.** A click or an edit dismisses run markers only. Live warnings are outside `useDiagnostics`, so the
  dismissal never reaches them.
- **Status line.** `LineMessage` gets `live?: true`. `summarize` adds `CLEAR_HINT` only when the file has a message
  that isn't live. Its tests cover both cases.

The jump to the first error is not affected: only a run triggers it (`revealFirstError`, with the run's diagnostics).

Three rules for the corrected analysis (item 7):

- It is derived and memoised. It is never stored in `TestbenchOverrides`, which `desktop.ts` saves.
- It is never passed as `previous` to `analyzeProject`, whose content cache would then keep the corrected roles.
- `hardwareView` reads only the detector's roles and the student's marks, never its own output, so the dependency
  runs one way.

## 3. Shape

```
tbDetect/ (per file, cached by content)   simOnly/ (project level, pure)                    shell
analyzeFile → FileAnalysis                hardwareView(project, overrides) → HardwareView
  + architectures (§ 4.1)                   ├─ withHardwareRoles → corrected analysis → pairing, split, Run
  + hiddenFromSynthesis (§ 4.3)             ├─ matchesOf(file) → simOnlyFindings → SimOnlyFinding[]
  + Instance.guarded                        └─ DESIGN_CHECKS[mode] → DesignCheck
                                                 { findings, groups, synthesisRoots }
                                                          │
                                          useDesignCheck → editor markers, Files dots, badge,
                                                           icon, regions, console summary
```

`simOnly/` imports from `tbDetect/`, never the other way round.

| File in `simOnly/` | Holds |
|---|---|
| `types.ts` | `SimOnlyConstructId`, `Tier`, `SimOnlyFinding`, `CodeGroup`, `FileGroup`, `CodeGroups`, `HardwareView`, `DesignView`, `UnitRef`, `CheckInput`, `DesignCheck`, `DesignCheckMode`. Data only. |
| `unitRef.ts` | `unitRef(file, name)` and `unitRefKey(ref)`: the only place a `fileId:unitKey` string is built. |
| `constructs.ts` | `SimOnlyConstruct`, `fromRule`, and `CONSTRUCTS: Record<Language, readonly SimOnlyConstruct[]>`. |
| `vhdlConstructs.ts`, `verilogConstructs.ts` | The new matchers, written like those in `rules.ts`, with the exceptions of § 3.3. |
| `matches.ts` | `matchesOf(file)`: the matches of every unit and unowned architecture, cached. |
| `hardware.ts` | `hardwareView` and its parts: the roots, `resolvedDut` and the walk. |
| `hardwareRoles.ts` | `withHardwareRoles`, and `designView`, which memoises the hardware view and the corrected analysis together. |
| `findings.ts` | `simOnlyFindings(view)` and `isWarnable`. |
| `groups.ts` | `codeGroups(input)`, `groupsFromRoles(project)` and the SIM-only regions. |
| `designCheck.ts` | `DESIGN_CHECKS`, `synthesisCheck` and `simulationCheck`. |
| `findingDiagnostics.ts` | Findings → `AdvisedDiagnostic[]`, with a tier table. |
| `simOnlyText.ts` | `CONSTRUCT_TEXT: Record<SimOnlyConstructId, ConstructText>`, so TypeScript fails when a construct has no text. Also the summary strings. |
| `consoleSummary.ts` | One summary line per SIM-only file at Start. |

The UI strings stay in `testbenchText.ts` (§ 5.3).

## 4. Steps — phase 1

**Gate for every step:**

- `npm test`, `npm run lint` and `npm run typecheck` pass.
- `fixtures.golden.test.ts` and `score.test.ts` pass without changes (S7).
- Each step is one commit or more, straight to `main`, with a pathspec.
- Refactors come first, in their own commits, before the change that needs them: make the change easy, then make the
  easy change.

### Step 0 — Lint gate

- Add `src/components/workbench/simOnly/**/*.ts` to `NEW_CODE`, along with every new hook, component and test file
  this plan names.
- Old files stay out of `NEW_CODE`, as the config asks. The lines we add to them still follow the limits.

### Step 1 — Constructs and their texts (spec step 1)

Pure code, no UI. Files: `types.ts`, `constructs.ts`, `vhdlConstructs.ts`, `verilogConstructs.ts`, `simOnlyText.ts`.

```ts
export interface SimOnlyConstruct {
  readonly id: SimOnlyConstructId;
  readonly tier: Tier;
  /** Lines where the construct is used as an operation, not only named (S10). */
  readonly find: (text: UnitText) => readonly number[];
}
```

- **Reused through `fromRule`:** only rules whose every match is an operation. Check each one against its cases in
  `rules.test.ts`.
- **New matchers:**
  - VHDL file operations, and calls that end the simulation (not the `use` clauses alone);
  - `now`;
  - `access`, `new` and `deallocate`;
  - protected types, and a `shared variable` of one;
  - `uniform`;
  - `real` signals and ports;
  - `force`/`release`, `fork`/`join` and `event`;
  - `$time`/`$realtime` and `$random`/`$urandom`;
  - event waits inside `always` too (today's rule only looks in `initial`);
  - `wait until`, with the clock-edge exception.
- **Names:** every regex is a named constant (`VHDL_NOW`), and every exception is a named predicate
  (`isOnlyClockEdgeWait`).
- **`constructs.test.ts`:**
  - one `[id, positive, negative]` table per language, like `rules.test.ts`;
  - a second table with the negatives of § 3.3: the dual-port RAM template, `use std.textio.all;` alone, an `initial`
    ROM, `wait until rising_edge`, `real` in constants and generics, and `assert` on a generic.
- **`simOnlyText.test.ts`:** every construct has a title, a reason and an alternative, and none is empty. This is a
  structure test, like `diagnosticAdvice.structure.test.ts`.

### Step 2 — Which code is hardware (spec step 2)

**Refactors first**, each its own commit, behaviour unchanged:

1. `PortOffset` in `designUnits.ts`.
2. Rename `simOnlyRegions` to `hiddenFromSynthesis` in `blank.ts`, `rules.ts` and `analyzeProject.ts`.
3. Move pairing's private `definingFile` to `analyzeProject.ts`, next to `unitKey`, as
   `definingFileOf(project, language, name)`. Pairing and `hardware.ts` both use it.
4. Export the block filter in `regions.ts` as `blocksHolding(unit, lines)`, for step 3.

**Then:**

- **Detector facts.** Add `FileAnalysis.architectures` (§ 4.1), `FileAnalysis.hiddenFromSynthesis` and
  `Instance.guarded`.
  - The `Pick` in `withUnits` takes the new fields.
  - Roles and scores don't change. The golden test compares only roles, rules, scores and confidence, so it passes
    untouched.
- **`hardware.ts`:**

  ```ts
  export function hardwareView(project: ProjectAnalysis, overrides: TestbenchOverrides): HardwareView;
  ```

  - Each of the four root rules is its own small predicate.
  - `resolvedDut` is the five steps of § 4.2, each a function returning a unit or `undefined`, chained with `??`.
  - One `reachable(roots, next)` walk with a visited set. Cycles are handled there and nowhere else.
  - It reuses `testbenchStem` and `contradictsCode` instead of copying pairing.
- **`hardwareRoles.ts`:** `withHardwareRoles`, and `designView(project, overrides)`, which returns
  `DesignView { raw, corrected, hardware }`. A one-entry cache on the identity of both inputs, because React calls it
  with the same objects many times per render. Findings read `raw`; pairing, groups by role and the UI read
  `corrected`.
- **Wiring in `useTestbenchSplit`:** correct both `analysis.current` and `analysis.flush()`, through one local helper.
  Nothing else in the hook changes. Expose `designView` on `TestbenchSplit`.
- **`hardware.test.ts`:** the case table of § 4 as `test.each`, plus the walk, cycle, case and guarded-instance tests
  of § 9.
- **`pairing.test.ts`:**
  - `counter_tb` pairs with the corrected `counter`;
  - the student's *Treat as testbench* beats the correction;
  - whenever `dutOf` names a design, pairing names the same one.

### Step 3 — Groups and the *Simulation model* mark (spec step 3)

- **`findings.ts`:**
  - `simOnlyFindings(view)` runs `matchesOf` on `view.raw` (so the cache hits, § 2, item 15) and keeps hardware units
    and their unowned architectures. It drops lines in `hiddenFromSynthesis` and keeps one finding per construct per
    line.
  - A *Simulation model* keeps its findings, because the group needs them (S9); `isWarnable` keeps them off its lines.
  - `isWarnable(file, line, check)` is the one rule for "may this line get a warning". Phase 2 uses it too.
- **`groups.ts`:**
  - `codeGroups(input)` follows the findings, never the role (§ 5.1). Only `never` and `ignored` findings make a unit
    `sim-only`; `quiet` ones don't.
  - `groupsFromRoles(view.corrected)` is for *Simulation only*. It reads the corrected roles, so a design the board
    uses shows `RTL` in both modes (§ 2, item 14).
  - The SIM-only regions are built with `blocksHolding`.
- **`designCheck.ts`:** the `DESIGN_CHECKS` table.
- **The `simModels` override.** Without these edits the mark is lost on load, or left behind when its file is
  deleted:
  - `types.ts`: an optional field, so `EMPTY_OVERRIDES` stays as it is;
  - `desktop.ts`: `parseOverrides` keeps the ids of known files;
  - `splitModel.ts`: `withoutFile` drops the entry; add `withSimModel` and `withoutSimModel`.
- **`groups.test.ts`:** the `groups.test.ts` list of § 9, as one table.
- **`desktop.test.ts`:**
  - the mark survives a save and a load;
  - a workspace without the field loads;
  - an unknown file id is dropped.

### Step 4 — Live warnings in the editor (spec step 4)

- **`findingDiagnostics.ts`:**
  - `TIER_LOOK: Record<Tier, { severity, quiet }>`;
  - `findingDiagnostics(check, files)` returns `AdvisedDiagnostic[]`;
  - the message is a fixed text from `simOnlyText.ts`, so dedup works;
  - the advice sets `headline` and `compiler: 'HDLBoard'`;
  - each message has `live: true`;
  - a file whose line count differs from that of its analysis is left out (§ 2, item 9).
- **`useDesignCheck.ts`:** `useDesignCheck({ designView, overrides, mode, files })`, memoised on the analysis. It
  reruns only when the detector does, so typing stays as fast as today.
- **`Workbench.tsx`, wiring only:** compute `addToFiles(diagnostics.byFile, check.diagnostics)` once, in a `useMemo`,
  and pass it both to `CodeEditor` and to `problemsOf`. Today both read `diagnostics.byFile`; neither may keep doing
  so.
- **Tests:**
  - `findingDiagnostics.test.ts`: each tier, quiet warnings, an edit within a line that keeps the warnings, and an
    added line that hides them;
  - `diagnosticStore.test.ts`: the merge keeps the caps and the dedup, and keeps `live`;
  - `diagnosticText.test.ts`: `summarize` gives `CLEAR_HINT` with a run marker, and not with live warnings alone;
  - a hook test: `startRun` keeps the live warnings, which by design live outside the store.
- **Performance:** add `matchesOf` and `simOnlyFindings` on the large file to the budget in `performance.test.ts`.

### Step 5 — The *Design check* setting (spec step 5)

**Refactors first:**

1. `storedChoice.ts`: add `loadStoredValue(key, isValue)` and `saveStoredValue(key, value)`. The on/off functions
   become wrappers, and their tests don't change.
2. `appDefaults.ts`: each `SETTING_TYPES` entry becomes `{ kind: 'boolean' }` or `{ kind: 'choice', values }`. A new
   setting is still one line.
3. Move the logic of `useBouncyOption` (the student's choice, else `settings.json`, else a value while loading) into
   `useHostSetting<T>({ storageKey, isValue, fromDefaults, whileLoading })`. `useBouncyOption` becomes a few lines on
   top of it, and its tests don't change.
4. `EditorSection.tsx`: turn the split card's radio list into `ChoiceCard<T>({ title, choices, setting })`, so the new
   card is not a copy of it.

**Then:**

- **`designCheckMode.ts`:** `DesignCheckMode = 'synthesis' | 'simulation'`, the storage key `hdlboard.designCheck.v1`,
  and `useDesignCheckMode()`.
  - While `settings.json` is loading, the mode is `simulation`, the quiet one, the same way bouncy buttons are off
    while it loads. A course that switched the check off never sees warnings flash.
- **`appDefaults.ts`:** add `designCheck`, default `synthesis`. Add it to `public/settings.json` too, as
  `bouncyButtons` is.
- **Settings › Editor:** a second `ChoiceCard`. `SettingsPage` passes it `designCheck: Setting<DesignCheckMode>`.
- **`logRunBoard`:** in *Simulation only*, the line adds "Design check: Simulation only", linked to the setting with
  `logWithLink`, the way the board link is.
- **Docs:** a row in `docs/SETTINGS.md`, next to `bouncyButtons`.
- **Tests:**
  - `appDefaults.test.ts`: a valid value, and a wrong one that warns;
  - `designCheckMode.test.ts`: the default, the file's value, a stored choice that beats the file, another tab
    followed;
  - `SettingsPage.test.tsx`: the card shows and saves.

### Step 6 — The `SIM-only` group in the UI (spec step 6)

- **Icons and badge:**
  - `icons.tsx`: `SimOnlyIcon`, a chip with a wave mark.
  - `RoleIcon.tsx` takes a `FileGroup`. A `GROUP_LOOK: Record<FileGroup, …>` table replaces today's ternaries.
  - `fileRows` reads `groupOf` from the `DesignCheck` instead of `roleOf`.
  - `EditorPaneHeader.tsx`: the badge's label and tint come from a `BADGE_LOOK` table keyed by the pane's
    `CodeGroup`.
  - The badge menu gets *Simulation model*, a check item, and a *Detected* line built from the findings
    (`detectedSimOnly(findings)` in `testbenchText.ts`).
- **Regions:**
  - Each pane gets its own region index (in `splitPaneModels.tsx` and `useTestbenchSplit.tsx`).
  - The design pane's navigator reads the SIM-only regions, and Alt+PageUp/PageDown steps through the focused pane's
    regions.
  - The gutter gets a faint amber band, made from the existing warning tokens, so `themeContrast.test.ts` stays green.
- **The change to `RTL`:**
  - A pure `groupChanges(before, after)` finds the changes.
  - A small hook keeps the last groups and writes to a polite live region.
  - Only `sim-only → rtl` and `rtl → sim-only` are announced.
- **Strings:** all in `testbenchText.ts`: `TEXT.simOnlyLabel`, `simOnlyTooltip(n)`, `TEXT.fileRoleSimOnly`,
  `TEXT.simModel`, `TEXT.simModelHint`, `nowRtl(name)`.
- **Tests:**
  - the icon of each group, with text as well as colour;
  - the badge label of each group;
  - a table for `groupChanges`;
  - stepping through regions in each pane.
- **In the app:** in Chrome, the "In the app" script of § 9.

### Step 7 — *Show example* (spec step 7)

Blocked on Q1. Whatever the answer:

- The templates are data in `simOnly/examples.ts`, one per language.
- The board's clock name and frequency are passed in. A board without a clock gets "the board's clock".
- The cycle count is computed, not written out: `cyclesFor(milliseconds, hertz)`.

### Step 8 — Console summary at Start (spec step 8)

- `consoleSummary.ts`: `simOnlySummary(check, files)` returns `{ text, fileId, line }[]`.
- `warnProjectChecks` logs each one with `logWithLink`, linked to the file's first finding.
- *Simulation only* has no findings, so it gets no lines. No mode check is needed.
- Tests: one line per file, the right wording for one line and for two, and nothing in *Simulation only*.

### Step 9 — Docs (spec step 10)

- `docs/changelog.txt` and the help text.
- The third group in docs/impl_split_screen.md § 4.5.
- The status line of the spec.
- No version bump unless Rune asks for one.

## 5. Phase 2 — `ghdl --synth` (after phase 1 ships)

The same rules apply. New server files go into the `NEW_CODE` list in `server/eslint.config.js`.

| Part | Where | Notes |
|---|---|---|
| Check that the GHDL builds have synthesis | `winInstaller`, `linuxAppImage` (`fetch-ghdl.sh`), `docker` | An integration test that skips, with a clear reason, when `--synth` is missing. |
| Protocol 8 | `server/src/protocol.ts`: decode and encode `SYNTH-CHECK`, `SYNTH` and `SYNTH-END`. `clientConnection.ts` and `hdlClient.ts`: `PROTOCOL_VERSION` `'8'`, `SYNTH_PROTOCOL = 8`, and a line in the version history. | `RUN` doesn't change. One function checks the run number. |
| Targets | `simOnly/synthTargets.ts`: `synthTargets(check, run)`, from `DesignCheck.synthesisRoots`. | *Simulation only* has no roots (the null object), so no frame is sent, with no mode check. Named limit: `MAX_SYNTH_TARGETS = 3`. |
| Session | `server/src/session.ts` | Keeps the targets for the next `RUN` only, then forgets them. One place, tested. |
| Engine | New `server/src/engines/ghdlSynth.ts`, not more lines in `ghdlEngine.ts`: `runSynthCheck({ dir, flags, targets, signal, limitMs })`. | Its own child process. It is killed by the run's abort signal or after `SYNTH_TIME_LIMIT_MS = 2000`, counts in `processCount`, and is skipped when there is no room. The flags come from `planGhdlFlags`, not rebuilt. |
| Advice | `synthAdvice.ts`: a table from message pattern to construct text. | A message that isn't in the table keeps GHDL's text. |
| Suppression | Client, after a message is located. | `isWarnable` from phase 1: the same rule, not a copy. |
| Merge | `findingDiagnostics.ts` | The live text first, GHDL's text as a detail. |

Tests: the phase 2 and protocol lists of § 9.

## 6. Open questions

1. ***Show example*** (§ 2, item 11). The tooltip is plain text, so it can't hold a link. Options:
   - (a) a button on the line, where the Quick Fix sits (Ctrl+.), that opens the example in a small popover;
   - (b) a Quick Fix that inserts the template, which changes the student's code, not what "show" says;
   - (c) a link in the console summary only.

   I recommend (a): it reuses a place the student already knows.
2. **Role correction in *Simulation only*** (item 14): keep it, as recommended, or switch it off?
3. **Live warnings while typing** (item 9). Is the plan's behaviour right?
   - A click leaves them in place.
   - Typing within a line leaves them in place.
   - Adding or removing a line hides the file's live warnings for 500 ms. If those warnings have rows of their own,
     the code below moves up for that time.

   The alternative is to shift the warnings by the lines added above them, which avoids the hiding but needs more code.
4. **The spec's own § 12.** Question 4 (the label text) decides the badge width in step 6.

## 7. Order

- Steps 1 and 2 don't depend on each other.
- Step 3 needs both, and step 4 needs step 3.
- Step 5 can come at any time before step 4 is wired into `Workbench`.
- Steps 6–8 need steps 3–5.
- Phase 2 starts once phase 1 has shipped.
