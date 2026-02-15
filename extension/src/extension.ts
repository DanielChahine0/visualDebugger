import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { initialize as initLLM, analyzeError, analyzeDiff, isInitialized, testConnection, FlowFixerError } from "./llmClient";
import { FlowFixerStorage } from "./storage";
import { DebugPanelProvider } from "./panels/DebugPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { CapturedError, BugRecord, WebviewToExtMessage } from "./types";

import { getSeedBugRecords } from "./seedData";
import { loadEnv } from "./envLoader";
import { fetchTtsAudio } from "./ttsClient";
import { FlowFixerCodeLensProvider, SUPPORTED_LANGUAGES } from "./codeLensProvider";

const LOG = "[FlowFixer]";
const TTS_MIME_TYPE = "audio/mpeg";
type StatusState =
  | "ready"
  | "needsKey"
  | "analyzingError"
  | "errorExplained"
  | "analyzingDiff"
  | "diffReviewed"
  | "analysisFailed";

interface MessageTarget {
  postMessage(message: unknown): void;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`${LOG} activating...`);

  // --- .env support (checked before context.secrets) ---
  const envMap = loadEnv();
  const ENV_KEY_MAP: Record<string, string> = {
    "visualdebugger.geminiKey": "GEMINI_API_KEY",
    "visualdebugger.elevenLabsKey": "ELEVENLABS_API_KEY",
    "visualdebugger.mongoUri": "MONGODB_URI",
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
  const mongoUri = await mergedSecrets.get("visualdebugger.mongoUri");
  const storage = new FlowFixerStorage(context.globalState, mongoUri);

  const debugPanel = new DebugPanelProvider(context.extensionUri);
  const dashboardPanel = new DashboardPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(DebugPanelProvider.viewType, debugPanel),
    vscode.window.registerWebviewViewProvider(DashboardPanelProvider.viewType, dashboardPanel)
  );

  // --- CodeLens provider ---
  const codeLensProvider = new FlowFixerCodeLensProvider();
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
    vscode.window.onDidChangeActiveTextEditor(() => updateActionsPanel())
  );

  // Fire once on activation to pick up existing errors
  setTimeout(updateActionsPanel, 300);

  async function getBugsWithFallback(): Promise<BugRecord[]> {
    const stored = await storage.getAll();
    return stored.length > 0 ? stored : getSeedBugRecords();
  }

  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = "Visual Debugger";
  statusItem.command = "visualdebugger.showDashboard";
  context.subscriptions.push(statusItem);

  let resetStatusTimer: NodeJS.Timeout | undefined;
  const clearResetTimer = () => {
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

  context.subscriptions.push({ dispose: clearResetTimer });
  updateStatus(isInitialized() ? "ready" : "needsKey");

  setTimeout(async () => {
    const bugs = await getBugsWithFallback();
    dashboardPanel.postMessage({ type: "showDashboard", data: { bugs } });
  }, 500);

  // TTS runs directly in the webview (calls ElevenLabs API from browser context)
  // No extension-host proxy needed

  // --- Track last error for Phase 2 correlation ---
  let lastError: CapturedError | undefined;
  let lastBugId: string | undefined;
  let holdDiffReview = false;
  let pendingDiffReview = false;

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
    updateStatus("analyzingError");

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

      updateStatus("errorExplained");
    } catch (err) {
      console.error(`${LOG} Phase 1 failed:`, err);
      updateStatus("analysisFailed");

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(`Visual Debugger: ${err.message}`);
      }
    }
  }

  async function handleWebviewMessage(
    source: "error" | "diff" | "dashboard",
    target: MessageTarget,
    message: WebviewToExtMessage
  ): Promise<void> {
    switch (message.type) {
      case "ready":
        console.log(`${LOG} ${source} panel ready`);
        return;
      case "diffReviewClosed":
        holdDiffReview = false;
        console.log(`${LOG} diff review unpinned by user`);
        return;
      case "quizAnswer":
        console.log(`${LOG} quiz answered from ${source} panel: ${message.answer}`);
        return;
      case "requestTts": {
        const text = message.text.trim();
        if (!text) return;

        const elevenLabsKey = await mergedSecrets.get("visualdebugger.elevenLabsKey");
        if (!elevenLabsKey) {
          target.postMessage({
            type: "ttsError",
            data: { message: "ElevenLabs key not set. Using browser voice fallback." },
          });
          return;
        }

        try {
          const base64Audio = await fetchTtsAudio(text, elevenLabsKey);
          target.postMessage({
            type: "playAudio",
            data: { base64Audio, mimeType: TTS_MIME_TYPE },
          });
        } catch (err) {
          console.error(`${LOG} TTS request failed:`, err);
          target.postMessage({
            type: "ttsError",
            data: { message: "TTS request failed. Using browser voice fallback." },
          });
        }
        return;
      }
    }
  }

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
        const lines = doc.getText().split("\n");
        const start = Math.max(0, line - 11);
        const end = Math.min(lines.length, line + 10);
        const codeContext = lines
          .slice(start, end)
          .map((l, i) => `${start + i + 1} | ${l}`)
          .join("\n");

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

        void handlePhase1(captured, { trigger: "manual" });
      } else {
        void handleWebviewMessage("error", debugPanel, msg);
      }
    }),
    dashboardPanel.onMessage((msg) => {
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

  diffEngine.onDiffDetected(async (diff) => {
    console.log(`${LOG} Phase 2: diff detected in ${diff.file}`);

    pendingDiffReview = true;
    updateStatus("analyzingDiff");

    try {
      if (!isInitialized()) {
        throw new FlowFixerError("No API key set");
      }

      const originalError = lastError?.message ?? "unknown error";
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
      holdDiffReview = true;
      pendingDiffReview = false;

      const bugs = await storage.getAll();
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

      const allBugs = await getBugsWithFallback();
      dashboardPanel.postMessage({
        type: "showDashboard",
        data: { bugs: allBugs },
      });

      updateStatus("diffReviewed");
    } catch (err) {
      pendingDiffReview = false;
      const errStr = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      console.error(`${LOG} Phase 2 failed: ${errStr}`);
      updateStatus("analysisFailed");

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(`Visual Debugger: ${err.message}`);
      }
    }
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
      const bugs = await getBugsWithFallback();
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
          updateStatus("ready");
          vscode.window.showInformationMessage("Visual Debugger: Gemini API key saved and connected.");
        } catch {
          updateStatus("needsKey");
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
        updateStatus("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Visual Debugger: Connection Failed. ${msg}`);
        updateStatus("needsKey");
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
    vscode.commands.registerCommand("visualdebugger.setMongoUri", async () => {
      const currentUri = await mergedSecrets.get("visualdebugger.mongoUri");
      const uriInput = await vscode.window.showInputBox({
        prompt: "Enter your MongoDB Atlas connection URI (leave empty to disable)",
        password: true,
        value: currentUri ?? "",
        ignoreFocusOut: true,
      });

      if (uriInput === undefined) {
        return;
      }

      const uri = uriInput.trim();

      if (!uri) {
        await context.secrets.delete("visualdebugger.mongoUri");
        storage.setMongoUri(undefined);
        vscode.window.showInformationMessage("Visual Debugger: MongoDB disabled. Using local fallback storage.");
        return;
      }

      await context.secrets.store("visualdebugger.mongoUri", uri);
      storage.setMongoUri(uri);
      const connected = await storage.testMongoConnection();
      if (connected) {
        const synced = await storage.syncLocalToMongo();
        vscode.window.showInformationMessage(`Visual Debugger: MongoDB URI saved and connected. Synced ${synced} local record(s).`);
      } else {
        vscode.window.showWarningMessage("Visual Debugger: URI saved, but connection failed. Using local fallback storage.");
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

        await handlePhase1(captured, { trigger: "manual" });
      } else {
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

        await handlePhase1(captured, { trigger: "manual" });
      }
    }),
    vscode.commands.registerCommand("visualdebugger.explainCodeLensError", async (file: string, line: number, message: string) => {
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
      const text = doc?.getText() ?? "";
      const lines = text.split("\n");
      const start = Math.max(0, line - 11);
      const end = Math.min(lines.length, line + 10);
      const codeContext = lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1} | ${l}`)
        .join("\n");

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

      await handlePhase1(captured, { trigger: "manual" });
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
