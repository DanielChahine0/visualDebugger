import * as vscode from "vscode";
import { isInitialized } from "./llmClient";

const LOG = "[FlowFixer]";

export type StatusState =
  | "ready"
  | "needsKey"
  | "analyzingError"
  | "errorExplained"
  | "analyzingDiff"
  | "diffReviewed"
  | "analysisFailed";

export interface StatusManager {
  updateStatus(state: StatusState): void;
  dispose(): void;
}

/**
 * Creates a status bar manager that controls the Visual Debugger status bar item.
 * Dependencies are injected for testability.
 */
export function createStatusManager(statusItem: vscode.StatusBarItem): StatusManager {
  let resetStatusTimer: NodeJS.Timeout | undefined;

  const clearResetTimer = (): void => {
    if (resetStatusTimer) {
      clearTimeout(resetStatusTimer);
      resetStatusTimer = undefined;
    }
  };

  const updateStatus = (state: StatusState): void => {
    clearResetTimer();

    switch (state) {
      case "ready":
        statusItem.text = "$(bug) Visual Debugger Ready";
        statusItem.tooltip = "Visual Debugger is active. Click to open Bug Dashboard.";
        statusItem.command = "visualdebugger.showDashboard";
        break;
      case "needsKey":
        statusItem.text = "$(key) Visual Debugger: Set Gemini Key";
        statusItem.tooltip = "Gemini API key is required for analysis. Click to configure.";
        statusItem.command = "visualdebugger.setGeminiKey";
        break;
      case "analyzingError":
        statusItem.text = "$(loading~spin) Visual Debugger: Analyzing error...";
        statusItem.tooltip = "Visual Debugger is analyzing the detected error.";
        statusItem.command = "visualdebugger.showDebugPanel";
        break;
      case "errorExplained":
        statusItem.text = "$(check) Visual Debugger: Error explained";
        statusItem.tooltip = "Error explanation ready. Click to open the panel.";
        statusItem.command = "visualdebugger.showDebugPanel";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
      case "analyzingDiff":
        statusItem.text = "$(loading~spin) Visual Debugger: Reviewing fix...";
        statusItem.tooltip = "Visual Debugger is analyzing the code diff.";
        statusItem.command = "visualdebugger.showDebugPanel";
        break;
      case "diffReviewed":
        statusItem.text = "$(git-compare) Visual Debugger: Fix reviewed";
        statusItem.tooltip = "Diff review ready. Click to open the panel.";
        statusItem.command = "visualdebugger.showDebugPanel";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
      case "analysisFailed":
        statusItem.text = "$(error) Visual Debugger: Analysis failed";
        statusItem.tooltip = "Analysis failed. Check API key and logs, then retry.";
        statusItem.command = "visualdebugger.showDashboard";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
    }

    statusItem.show();
  };

  return {
    updateStatus,
    dispose: clearResetTimer,
  };
}
