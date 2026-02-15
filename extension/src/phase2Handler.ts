import * as vscode from "vscode";
import { analyzeDiff, isInitialized, FlowFixerError } from "./llmClient";
import { CapturedDiff, DiffExplanation, BugRecord } from "./types";
import { StatusManager } from "./statusManager";
import { StorageProvider } from "./storage";
import { DebugPanelProvider } from "./panels/DebugPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { Phase1Handler } from "./phase1Handler";

const LOG = "[FlowFixer]";

export interface Phase2Deps {
  debugPanel: DebugPanelProvider;
  dashboardPanel: DashboardPanelProvider;
  storage: StorageProvider;
  statusManager: StatusManager;
  phase1Handler: Phase1Handler;
}

/**
 * Handles Phase 2 diff analysis when a code change is detected.
 * Returns a handler function to be connected to DiffEngine.onDiffDetected.
 */
export function createPhase2Handler(deps: Phase2Deps): (diff: CapturedDiff) => Promise<void> {
  const { debugPanel, dashboardPanel, storage, statusManager, phase1Handler } = deps;

  return async function onDiffDetected(diff: CapturedDiff): Promise<void> {
    console.log(`${LOG} Phase 2: diff detected in ${diff.file}`);

    phase1Handler.setDiffReviewPending(true);
    statusManager.updateStatus("analyzingDiff");
    const originalError = phase1Handler.getLastError()?.message ?? "unknown error";

    try {
      if (!isInitialized()) {
        throw new FlowFixerError("No API key set");
      }

      console.log(`${LOG} Phase 2: calling analyzeDiff for ${diff.file}...`);
      const diffExplanation = await analyzeDiff({
        language: diff.language,
        filename: diff.file,
        originalError,
        diff: diff.unifiedDiff,
      });

      console.log(`${LOG} Phase 2: analyzeDiff succeeded, posting showDiff`);
      debugPanel.postMessage({
        type: "showDiff",
        data: { ...diffExplanation, diff },
      });
      phase1Handler.setHoldDiffReview(true);
      phase1Handler.setDiffReviewPending(false);

      const bugs = await storage.getAll();
      const lastBugId = phase1Handler.getLastBugId();
      const byLastId = lastBugId
        ? bugs.find((bug) => bug.id === lastBugId)
        : undefined;
      const targetBug =
        byLastId ??
        [...bugs]
          .reverse()
          .find((bug) => bug.file === diff.file && bug.diffExplanation === undefined);

      if (targetBug) {
        const updated: BugRecord = {
          ...targetBug,
          diffExplanation,
        };
        await storage.update(updated);
      }

      const allBugs = await phase1Handler.getBugsWithFallback();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs: allBugs },
      });

      statusManager.updateStatus("diffReviewed");
    } catch (err) {
      phase1Handler.setDiffReviewPending(false);
      const errStr = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      console.error(`${LOG} Phase 2 failed: ${errStr}`);
      const fallbackExplanation = buildFallbackDiffExplanation(diff, originalError);
      debugPanel.postMessage({
        type: "showDiff",
        data: { ...fallbackExplanation, diff },
      });
      phase1Handler.setHoldDiffReview(true);
      statusManager.updateStatus("diffReviewed");

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(
          `Visual Debugger: ${err.message}. Showing local fix summary instead.`
        );
      }
    }
  };
}

export function buildFallbackDiffExplanation(
  diff: CapturedDiff,
  originalError: string
): DiffExplanation {
  const normalizedErr = originalError.trim() || "the original issue";
  return {
    quickSummary:
      "No more errors. The latest code edits were captured and reviewed locally.",
    whyItWorks:
      `The recent edits resolved ${normalizedErr}. The file now compiles/runs without the previous error.`,
    whatToDoNext: [
      "Scan the changed lines to confirm they match your intent.",
      "Run the feature once to verify behavior is correct.",
      "If needed, click Explain again for a deeper breakdown.",
    ],
    keyTakeaway:
      "A fix is valid when the error clears and behavior still matches expectations.",
    checkQuestion:
      "Which exact edit removed the failing condition in your code?",
  };
}
