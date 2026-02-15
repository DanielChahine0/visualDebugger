---
status: resolved
trigger: "Diff Review panel (Phase 2) never triggers after accepting AI fixes"
created: 2026-02-14T00:00:00Z
updated: 2026-02-15T02:30:00Z
---

## Current Focus

hypothesis: CONFIRMED - DiffEngine only triggered Phase 2 when ALL errors cleared to zero AND only via save or diagnostics paths
test: Added three new detection paths to DiffEngine
expecting: Phase 2 now triggers reliably in all fix scenarios
next_action: Test in VS Code

## Symptoms

expected: After accepting AI fix, diffEngine detects change, Gemini analyzes diff, Diff Panel shows review
actual: Diff Panel stays showing "No AI fixes to review yet", status bar never shows "Reviewing fix"
errors: No visible errors reported
reproduction: Accept any AI fix after Phase 1 error detection
started: Present since DiffEngine was first implemented

## Eliminated

- Path normalization issues: fsPath is consistent across all code paths
- Event emitter wiring: onDiffDetected is correctly subscribed in extension.ts
- Webview message delivery: showDiff message handler is correct in debug.html
- Refactoring regression: phase2Handler.ts is functionally identical to the original inline handler
- pendingMessage race: Messages are delivered directly when webview is visible
- TypeScript compilation: No type errors, build output is current
- startTracking snapshot timing: Snapshot is captured before AI fix is applied

## Evidence

1. DiffEngine had only TWO detection paths:
   a. **Save path** (onDidSaveTextDocument): Only fires when user explicitly saves. Many AI tools modify the buffer without saving.
   b. **Diagnostics path** (onDidChangeDiagnostics): Only fires when ALL errors clear to zero. If a file has multiple errors and the AI only fixes one, this path does not trigger.

2. Both paths existed in the original code and the refactored code - this is a design gap, not a regression.

3. The most common user flow (AI tool modifies buffer, some errors remain) falls through BOTH detection paths, resulting in Phase 2 never triggering.

## Resolution

root_cause: DiffEngine required ALL diagnostics errors to clear to zero before triggering Phase 2. Files with multiple errors, or AI fixes that don't immediately clear diagnostics, never triggered diff detection. Additionally, there was no fallback for buffer-only changes (no save event).

fix: Added three improvements to DiffEngine:
  1. **Error count decrease detection**: When error count drops (even if not to zero), the diagnostics path now triggers. This handles the case where a file has multiple errors and the AI fixes the tracked one.
  2. **Content change detection** (onDidChangeTextDocument): A new listener detects buffer modifications with a 1.5s debounce. This handles AI tools that modify the buffer without saving and without immediately clearing diagnostics.
  3. **Extracted scheduleDiffComputation helper**: Centralizes debounce logic. The content-change timer is automatically cancelled if the diagnostics path fires first, preventing duplicate diff events.

verification: All 178 tests pass (28 diffEngine tests including 6 new ones for the new detection paths).

files_changed:
  - extension/src/diffEngine.ts (added onDidChangeTextDocument listener, error count decrease detection, content change debounce, initialErrorCount tracking)
  - extension/src/__tests__/diffEngine.test.ts (added 6 new tests for error count decrease, content change detection, timer cancellation, edge cases)
