import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { initialize as initLLM, analyzeError, analyzeDiff, isInitialized, FlowFixerError } from "./llmClient";
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

  // Initialize LLM (non-fatal if no key yet)
  try {
    await initLLM(context.secrets);
  } catch {
    console.warn(`${LOG} LLM not initialized — set API key with 'FlowFixer: Set Gemini API Key'`);
  }

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

  // --- Shared Phase 1 handler (used by both auto-detection and manual trigger) ---
  async function handlePhase1(error: CapturedError): Promise<void> {
    console.log(`${LOG} Phase 1: error detected — ${error.message}`);
    lastError = error;

    // Start tracking file changes for Phase 2
    diffEngine.startTracking(error.file);

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = "$(loading~spin) FlowFixer: Analyzing error...";
    statusItem.show();

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

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(`FlowFixer: ${err.message}`);
      }
    }
  }

  // ===== PHASE 1: Error detected → LLM → Error Panel =====
  errorListener.onErrorDetected((error) => handlePhase1(error));

  // ===== PHASE 2: Diff detected → LLM → Diff Panel =====
  diffEngine.onDiffDetected(async (diff) => {
    console.log(`${LOG} Phase 2: diff detected in ${diff.file}`);

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusItem.text = "$(loading~spin) FlowFixer: Analyzing fix...";
    statusItem.show();

    try {
      if (!isInitialized()) {
        throw new FlowFixerError("No API key set");
      }

      const originalError = lastError?.message ?? "unknown error";
      const diffExplanation = await analyzeDiff({
        language: diff.language,
        filename: diff.file,
        originalError,
        diff: diff.unifiedDiff,
      });

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
        try {
          await initLLM(context.secrets);
          vscode.window.showInformationMessage("FlowFixer: Gemini API key saved and connected.");
        } catch {
          vscode.window.showWarningMessage("FlowFixer: Key saved but initialization failed. Check the key.");
        }
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
    }),

    // --- Manual trigger: analyze the current file's errors or report a logic bug ---
    vscode.commands.registerCommand("flowfixer.analyzeCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("FlowFixer: No active editor.");
        return;
      }

      const doc = editor.document;
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      const errors = diagnostics.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error
      );

      if (errors.length > 0) {
        // Use the first error from diagnostics
        const diag = errors[0];
        const line = diag.range.start.line + 1;
        const lines = doc.getText().split("\n");
        const start = Math.max(0, line - 11);
        const end = Math.min(lines.length, line + 10);
        const codeContext = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1} | ${l}`)
          .join("\n");

        const captured: CapturedError = {
          message: diag.message,
          file: doc.uri.fsPath,
          line,
          language: doc.languageId,
          codeContext,
          severity: "error",
          source: "diagnostics",
          timestamp: Date.now(),
        };

        await handlePhase1(captured);
      } else {
        // No diagnostics — prompt user for error message (logic/runtime errors)
        const errorMsg = await vscode.window.showInputBox({
          prompt: "No compiler errors found. Describe the bug (e.g., 'renders an extra item', 'TypeError: Cannot read properties of undefined')",
          placeHolder: "What went wrong?",
          ignoreFocusOut: true,
        });

        if (!errorMsg) return;

        const line = editor.selection.active.line + 1;
        const lines = doc.getText().split("\n");
        const start = Math.max(0, line - 11);
        const end = Math.min(lines.length, line + 10);
        const codeContext = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1} | ${l}`)
          .join("\n");

        const captured: CapturedError = {
          message: errorMsg,
          file: doc.uri.fsPath,
          line,
          language: doc.languageId,
          codeContext,
          severity: "error",
          source: "terminal",
          timestamp: Date.now(),
        };

        await handlePhase1(captured);
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
