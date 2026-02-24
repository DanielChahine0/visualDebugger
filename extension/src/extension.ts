import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { initialize as initLLM, isInitialized, testConnection } from "./llmClient";
import { VisualDebuggerStorage } from "./storage";
import { DebugPanelProvider } from "./panels/DebugPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { CapturedError } from "./types";
import { loadEnv } from "./envLoader";
import { VisualDebuggerCodeLensProvider, SUPPORTED_LANGUAGES } from "./codeLensProvider";
import { extractCodeContext } from "./utils";
import { createStatusManager } from "./statusManager";
import { createPhase1Handler } from "./phase1Handler";
import { createPhase2Handler } from "./phase2Handler";
import { createMessageHandler } from "./messageHandler";

const LOG = "[VisualDebugger]";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`${LOG} activating...`);

  // --- .env support (checked before context.secrets) ---
  const envMap = loadEnv();
  const ENV_KEY_MAP: Record<string, string> = {
    "visualdebugger.geminiKey": "GEMINI_API_KEY",
    "visualdebugger.elevenLabsKey": "ELEVENLABS_API_KEY",
  };
  const mergedSecrets = {
    async get(key: string): Promise<string | undefined> {
      const envKey = ENV_KEY_MAP[key];
      if (envKey) {
        const envVal = envMap.get(envKey);
        if (envVal) { return envVal; }
      }
      return context.secrets.get(key);
    },
  };

  // --- Core services ---
  const errorListener = new ErrorListener();
  const diffEngine = new DiffEngine();

  try {
    await initLLM(mergedSecrets);
  } catch {
    console.warn(`${LOG} LLM not initialized — set API key with 'Visual Debugger: Set Gemini API Key' or add GEMINI_API_KEY to .env`);
  }

  // --- Storage ---
  const storage = new VisualDebuggerStorage(context.globalState);

  const debugPanel = new DebugPanelProvider(context.extensionUri);
  const dashboardPanel = new DashboardPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DebugPanelProvider.viewType, debugPanel),
    vscode.window.registerWebviewViewProvider(DashboardPanelProvider.viewType, dashboardPanel)
  );

  // --- CodeLens provider ---
  const codeLensProvider = new VisualDebuggerCodeLensProvider();
  const codeLensSelector = SUPPORTED_LANGUAGES.map((lang) => ({ language: lang }));
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(codeLensSelector, codeLensProvider),
    codeLensProvider
  );

  // --- Actions panel: sync diagnostics from active editor ---
  function updateActionsPanel(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      debugPanel.postMessage({ type: "updateErrors", data: { count: 0, fileName: "", firstError: null } });
      return;
    }
    const doc = editor.document;
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);

    const fileName = doc.uri.fsPath.split(/[\\/]/).pop() ?? doc.uri.fsPath;

    if (errors.length > 0) {
      const first = errors[0];
      debugPanel.postMessage({
        type: "updateErrors",
        data: {
          count: errors.length,
          fileName,
          firstError: {
            file: doc.uri.fsPath,
            line: first.range.start.line + 1,
            message: first.message,
          },
        },
      });
    } else {
      debugPanel.postMessage({ type: "updateErrors", data: { count: 0, fileName, firstError: null } });
    }
  }

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => updateActionsPanel()),
    vscode.window.onDidChangeActiveTextEditor(() => updateActionsPanel()),
    vscode.workspace.onDidSaveTextDocument(async () => {
      const bugs = await phase1.getBugsWithFallback();
      dashboardPanel.postMessage({ type: "showDashboard", data: { bugs } });
    })
  );

  // Fire once on activation to pick up existing errors
  setTimeout(updateActionsPanel, 300);

  // --- Status bar ---
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = "Visual Debugger";
  statusItem.command = "visualdebugger.showDashboard";
  context.subscriptions.push(statusItem);

  const statusManager = createStatusManager(statusItem);
  context.subscriptions.push({ dispose: () => statusManager.dispose() });
  statusManager.updateStatus(isInitialized() ? "ready" : "needsKey");

  // --- Phase 1 handler ---
  const phase1 = createPhase1Handler({ debugPanel, dashboardPanel, diffEngine, storage, statusManager });

  // Seed dashboard on activation
  setTimeout(async () => {
    const bugs = await phase1.getBugsWithFallback();
    dashboardPanel.postMessage({ type: "showDashboard", data: { bugs } });
  }, 500);

  // --- Phase 2 handler ---
  const onDiffDetected = createPhase2Handler({ debugPanel, dashboardPanel, storage, statusManager, phase1Handler: phase1 });
  diffEngine.onDiffDetected(onDiffDetected);

  // --- Message handler ---
  const handleWebviewMessage = createMessageHandler({ mergedSecrets });

  context.subscriptions.push(
    debugPanel.onMessage((msg) => {
      if (msg.type === "explainError") {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const doc = editor.document;
        const diagnostics = vscode.languages.getDiagnostics(doc.uri);
        const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
        if (errors.length === 0) return;

        const first = errors[0];
        const line = first.range.start.line + 1;
        const codeContext = extractCodeContext(doc.getText(), line);

        const captured: CapturedError = {
          message: first.message,
          file: doc.uri.fsPath,
          line,
          language: doc.languageId,
          codeContext,
          severity: "error",
          source: "diagnostics",
          timestamp: Date.now(),
        };

        void phase1.handlePhase1(captured, { trigger: "manual" });
      } else if (msg.type === "diffReviewClosed") {
        phase1.setHoldDiffReview(false);
        void handleWebviewMessage("error", debugPanel, msg);
      } else {
        void handleWebviewMessage("error", debugPanel, msg);
      }
    }),
    dashboardPanel.onMessage((msg) => {
      if (msg.type === "diffReviewClosed") {
        phase1.setHoldDiffReview(false);
      }
      void handleWebviewMessage("dashboard", dashboardPanel, msg);
    })
  );

  // errorListener only logs — it does NOT auto-trigger handlePhase1.
  // The user explicitly clicks "Explain This Error" (or uses CodeLens / command
  // palette) to analyse a single error.  Auto-triggering was burning API keys
  // on every transient diagnostic change (line shifts, partial edits, etc.).
  errorListener.onErrorDetected((error) => {
    console.log(`${LOG} errorListener fired (ignored): ${error.message} at ${error.file}:${error.line}`);
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("visualdebugger.showDebugPanel", async () => {
      await vscode.commands.executeCommand("visualdebugger.debugPanel.focus");
    }),
    vscode.commands.registerCommand("visualdebugger.showErrorPanel", async () => {
      await vscode.commands.executeCommand("visualdebugger.debugPanel.focus");
    }),
    vscode.commands.registerCommand("visualdebugger.showDiffPanel", async () => {
      await vscode.commands.executeCommand("visualdebugger.debugPanel.focus");
    }),
    vscode.commands.registerCommand("visualdebugger.showDashboard", async () => {
      await vscode.commands.executeCommand("visualdebugger.dashboardPanel.focus");
      const bugs = await phase1.getBugsWithFallback();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs },
      });
    }),
    vscode.commands.registerCommand("visualdebugger.setGeminiKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your Gemini API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("visualdebugger.geminiKey", key);
        try {
          await initLLM(mergedSecrets);
          statusManager.updateStatus("ready");
          vscode.window.showInformationMessage("Visual Debugger: Gemini API key saved and connected.");
        } catch {
          statusManager.updateStatus("needsKey");
          vscode.window.showWarningMessage("Visual Debugger: Key saved but initialization failed. Check the key.");
        }
      }
    }),
    vscode.commands.registerCommand("visualdebugger.testGeminiConnection", async () => {
      try {
        if (!isInitialized()) {
          // Attempt to init if not already (e.g. if key was just added to .env)
          await initLLM(mergedSecrets);
        }

        vscode.window.showInformationMessage("Visual Debugger: Testing Gemini connection...");
        const response = await testConnection();
        vscode.window.showInformationMessage(`Visual Debugger: Connection Successful! Gemini replied: "${response}"`);
        statusManager.updateStatus("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Visual Debugger: Connection Failed. ${msg}`);
        statusManager.updateStatus("needsKey");
      }
    }),
    vscode.commands.registerCommand("visualdebugger.setElevenLabsKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your ElevenLabs API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("visualdebugger.elevenLabsKey", key);
        vscode.window.showInformationMessage("Visual Debugger: ElevenLabs API key saved. Read Aloud is ready.");
      }
    }),
    vscode.commands.registerCommand("visualdebugger.analyzeCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("Visual Debugger: No active editor.");
        return;
      }

      const doc = editor.document;
      const diagnostics = vscode.languages.getDiagnostics(doc.uri);
      const errors = diagnostics.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error
      );

      if (errors.length > 0) {
        const diag = errors[0];
        const line = diag.range.start.line + 1;
        const codeContext = extractCodeContext(doc.getText(), line);

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

        await phase1.handlePhase1(captured, { trigger: "manual" });
      } else {
        const errorMsg = await vscode.window.showInputBox({
          prompt: "No compiler errors found. Describe the bug (e.g., 'renders an extra item', 'TypeError: Cannot read properties of undefined')",
          placeHolder: "What went wrong?",
          ignoreFocusOut: true,
        });

        if (!errorMsg) return;

        const line = editor.selection.active.line + 1;
        const codeContext = extractCodeContext(doc.getText(), line);

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

        await phase1.handlePhase1(captured, { trigger: "manual" });
      }
    }),
    vscode.commands.registerCommand("visualdebugger.explainCodeLensError", async (file: string, line: number, message: string) => {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
      const text = doc?.getText() ?? "";
      const codeContext = extractCodeContext(text, line);

      const captured: CapturedError = {
        message,
        file,
        line,
        language: doc?.languageId ?? "typescript",
        codeContext,
        severity: "error",
        source: "diagnostics",
        timestamp: Date.now(),
      };

      await phase1.handlePhase1(captured, { trigger: "manual" });
    }),
    vscode.commands.registerCommand("visualdebugger.fixCodeLensError", async (file: string, line: number, message: string) => {
      const action = await vscode.window.showInformationMessage(
        "Try fixing it yourself first! Use the error explanation to understand what went wrong, then apply the suggested fix.",
        "Show Explanation",
        "Open File"
      );
      if (action === "Show Explanation") {
        await vscode.commands.executeCommand("visualdebugger.explainCodeLensError", file, line, message);
      } else if (action === "Open File") {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc, { selection: new vscode.Range(line - 1, 0, line - 1, 0) });
      }
    }),
  );

  context.subscriptions.push(errorListener, diffEngine, storage);

  console.log(`${LOG} activated successfully`);
  vscode.window.showInformationMessage("Visual Debugger is active! Errors will be explained automatically.");
}

export function deactivate(): void {
  console.log(`${LOG} deactivated`);
}
