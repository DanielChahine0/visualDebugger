import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { LLMClient } from "./llmClient";
import { FlowFixerStorage } from "./storage";
import { ErrorPanelProvider } from "./panels/ErrorPanel";
import { DiffPanelProvider } from "./panels/DiffPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { CapturedError, BugRecord } from "./types";

const LOG = "[FlowFixer]";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`${LOG} activating...`);

  // --- Core services ---
  const errorListener = new ErrorListener();
  const diffEngine = new DiffEngine();
  const llmClient = new LLMClient(context.secrets);
  await llmClient.initialize();

  // --- Storage ---
  const mongoUri = await context.secrets.get("flowfixer.mongoUri");
  const storage = new FlowFixerStorage(context.globalState, mongoUri);

  // --- Panel providers ---
  const errorPanel = new ErrorPanelProvider(context.extensionUri);
  const diffPanel = new DiffPanelProvider(context.extensionUri);
  const dashboardPanel = new DashboardPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ErrorPanelProvider.viewType, errorPanel),
    vscode.window.registerWebviewViewProvider(DiffPanelProvider.viewType, diffPanel),
    vscode.window.registerWebviewViewProvider(DashboardPanelProvider.viewType, dashboardPanel)
  );

  // --- Track last error for Phase 2 correlation ---
  let lastError: CapturedError | undefined;

  // ===== PHASE 1: Error detected → LLM → Error Panel =====
  errorListener.onErrorDetected(async (error) => {
    console.log(`${LOG} Phase 1: error detected — ${error.message}`);
    lastError = error;

    // Start tracking file changes for Phase 2
    diffEngine.startTracking(error.file);

    // Show status bar feedback
    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = "$(loading~spin) FlowFixer: Analyzing error...";
    statusItem.show();

    try {
      const explanation = await llmClient.explainError(error);

      // Send to Error Panel
      errorPanel.postMessage({
        type: "showError",
        data: { ...explanation, raw: error },
      });

      // Save to storage
      const record: BugRecord = {
        id: `bug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        category: explanation.category,
        file: error.file,
        errorMessage: error.message,
        explanation,
        timestamp: Date.now(),
      };
      await storage.save(record);

      // Update dashboard
      const allBugs = await storage.getAll();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs: allBugs },
      });

      statusItem.text = "$(bug) FlowFixer: Error explained";
      setTimeout(() => statusItem.dispose(), 5000);
    } catch (err) {
      console.error(`${LOG} Phase 1 failed:`, err);
      statusItem.text = "$(error) FlowFixer: Analysis failed";
      setTimeout(() => statusItem.dispose(), 5000);
    }
  });

  // ===== PHASE 2: Diff detected → LLM → Diff Panel =====
  diffEngine.onDiffDetected(async (diff) => {
    console.log(`${LOG} Phase 2: diff detected in ${diff.file}`);

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = "$(loading~spin) FlowFixer: Analyzing fix...";
    statusItem.show();

    try {
      const originalError = lastError?.message ?? "unknown error";
      const diffExplanation = await llmClient.explainDiff(diff, originalError);

      // Send to Diff Panel
      diffPanel.postMessage({
        type: "showDiff",
        data: { ...diffExplanation, diff },
      });

      statusItem.text = "$(diff) FlowFixer: Fix reviewed";
      setTimeout(() => statusItem.dispose(), 5000);
    } catch (err) {
      console.error(`${LOG} Phase 2 failed:`, err);
      statusItem.text = "$(error) FlowFixer: Diff analysis failed";
      setTimeout(() => statusItem.dispose(), 5000);
    }
  });

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("flowfixer.showErrorPanel", () => {
      vscode.commands.executeCommand("flowfixer.errorPanel.focus");
    }),
    vscode.commands.registerCommand("flowfixer.showDiffPanel", () => {
      vscode.commands.executeCommand("flowfixer.diffPanel.focus");
    }),
    vscode.commands.registerCommand("flowfixer.showDashboard", async () => {
      vscode.commands.executeCommand("flowfixer.dashboardPanel.focus");
      const bugs = await storage.getAll();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs },
      });
    }),
    vscode.commands.registerCommand("flowfixer.setGeminiKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your Gemini API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("flowfixer.geminiKey", key);
        await llmClient.initialize();
        vscode.window.showInformationMessage("FlowFixer: Gemini API key saved.");
      }
    }),
    vscode.commands.registerCommand("flowfixer.setMongoUri", async () => {
      const uri = await vscode.window.showInputBox({
        prompt: "Enter your MongoDB Atlas connection URI",
        password: true,
        ignoreFocusOut: true,
      });
      if (uri) {
        await context.secrets.store("flowfixer.mongoUri", uri);
        vscode.window.showInformationMessage("FlowFixer: MongoDB URI saved. Restart extension to connect.");
      }
    })
  );

  // --- Disposables ---
  context.subscriptions.push(errorListener, diffEngine, storage);

  console.log(`${LOG} activated successfully`);
  vscode.window.showInformationMessage("FlowFixer is active! Errors will be explained automatically.");
}

export function deactivate(): void {
  console.log(`${LOG} deactivated`);
}
