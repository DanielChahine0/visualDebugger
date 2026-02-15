import * as vscode from "vscode";
import { analyzeError, isInitialized, FlowFixerError } from "./llmClient";
import { CapturedError, BugRecord } from "./types";
import { StatusManager } from "./statusManager";
import { DiffEngine } from "./diffEngine";
import { StorageProvider } from "./storage";
import { DebugPanelProvider } from "./panels/DebugPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { getSeedBugRecords } from "./seedData";

const LOG = "[FlowFixer]";

export interface Phase1Deps {
  debugPanel: DebugPanelProvider;
  dashboardPanel: DashboardPanelProvider;
  diffEngine: DiffEngine;
  storage: StorageProvider;
  statusManager: StatusManager;
}

export interface Phase1Handler {
  handlePhase1(error: CapturedError, opts?: { trigger?: "auto" | "manual" }): Promise<void>;
  getLastError(): CapturedError | undefined;
  getLastBugId(): string | undefined;
  /** Returns true if a diff review is in progress or pinned */
  isDiffReviewActive(): boolean;
  setHoldDiffReview(value: boolean): void;
  setDiffReviewPending(value: boolean): void;
  isHoldDiffReview(): boolean;
  isPendingDiffReview(): boolean;
  getBugsWithFallback(): Promise<BugRecord[]>;
}

export function createPhase1Handler(deps: Phase1Deps): Phase1Handler {
  const { debugPanel, dashboardPanel, diffEngine, storage, statusManager } = deps;

  let lastError: CapturedError | undefined;
  let lastBugId: string | undefined;
  let holdDiffReview = false;
  let pendingDiffReview = false;

  async function getBugsWithFallback(): Promise<BugRecord[]> {
    const stored = await storage.getAll();
    return stored.length > 0 ? stored : getSeedBugRecords();
  }

  async function handlePhase1(
    error: CapturedError,
    opts?: { trigger?: "auto" | "manual" }
  ): Promise<void> {
    const trigger = opts?.trigger ?? "auto";
    if ((holdDiffReview || pendingDiffReview) && trigger === "auto") {
      console.log(`${LOG} skipping auto Phase 1 while diff review is active`);
      return;
    }

    console.log(`${LOG} Phase 1: error detected - ${error.message}`);
    lastError = error;
    holdDiffReview = false;
    // New error cycle starts here. Clear any stale Phase 2 review so users
    // don't see old fix explanations before a new diff is detected.
    debugPanel.postMessage({ type: "clear" });

    diffEngine.startTracking(error.file);
    statusManager.updateStatus("analyzingError");

    try {
      if (!isInitialized()) {
        throw new FlowFixerError("No API key set");
      }

      const explanation = await analyzeError({
        language: error.language,
        filename: error.file,
        errorMessage: error.message,
        codeContext: error.codeContext,
      });

      // Guard against race: an auto Phase 1 request may have started before
      // diff review was pinned and completed after it.
      if ((holdDiffReview || pendingDiffReview) && trigger === "auto") {
        console.log(`${LOG} dropping stale auto Phase 1 result while diff review is active`);
        return;
      }

      debugPanel.postMessage({
        type: "showError",
        data: { ...explanation, raw: error },
      });

      const record: BugRecord = {
        id: `bug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: explanation.category,
        file: error.file,
        errorMessage: error.message,
        explanation,
        timestamp: Date.now(),
      };
      await storage.save(record);
      lastBugId = record.id;

      const allBugs = await getBugsWithFallback();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs: allBugs },
      });

      statusManager.updateStatus("errorExplained");
    } catch (err) {
      console.error(`${LOG} Phase 1 failed:`, err);
      statusManager.updateStatus("analysisFailed");

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(`Visual Debugger: ${err.message}`);
      }
    }
  }

  return {
    handlePhase1,
    getLastError: () => lastError,
    getLastBugId: () => lastBugId,
    isDiffReviewActive: () => holdDiffReview || pendingDiffReview,
    setHoldDiffReview: (value: boolean) => { holdDiffReview = value; },
    setDiffReviewPending: (value: boolean) => { pendingDiffReview = value; },
    isHoldDiffReview: () => holdDiffReview,
    isPendingDiffReview: () => pendingDiffReview,
    getBugsWithFallback,
  };
}
