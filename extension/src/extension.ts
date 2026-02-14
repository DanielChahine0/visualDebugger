import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { initialize as initLLM, analyzeError, analyzeDiff, isInitialized, FlowFixerError } from "./llmClient";
import { FlowFixerStorage } from "./storage";
import { ErrorPanelProvider } from "./panels/ErrorPanel";
import { DiffPanelProvider } from "./panels/DiffPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { CapturedError, BugRecord, WebviewToExtMessage } from "./types";
import { fetchTtsAudio } from "./ttsClient";
import { getSeedBugRecords } from "./seedData";
import { loadEnv } from "./envLoader";

const LOG = "[FlowFixer]";
type StatusState =
  | "ready"
  | "needsKey"
  | "analyzingError"
  | "errorExplained"
  | "analyzingDiff"
  | "diffReviewed"
  | "analysisFailed";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log(`${LOG} activating...`);

  // --- .env support (checked before context.secrets) ---
  const envMap = loadEnv();
  const ENV_KEY_MAP: Record<string, string> = {
    "flowfixer.geminiKey": "GEMINI_API_KEY",
    "flowfixer.elevenLabsKey": "ELEVENLABS_API_KEY",
    "flowfixer.mongoUri": "MONGODB_URI",
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

  // Initialize LLM (non-fatal if no key yet)
  try {
    await initLLM(mergedSecrets);
  } catch {
    console.warn(`${LOG} LLM not initialized — set API key with 'Visual Debugger: Set Gemini API Key' or add GEMINI_API_KEY to .env`);
  }

  // --- Storage ---
  const mongoUri = await mergedSecrets.get("flowfixer.mongoUri");
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

  // --- Helper: get bugs with seed data fallback ---
  async function getBugsWithFallback(): Promise<BugRecord[]> {
    const stored = await storage.getAll();
    return stored.length > 0 ? stored : getSeedBugRecords();
  }

  // --- P2 polish: persistent status bar indicator ---
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusItem.name = "Visual Debugger";
  statusItem.command = "flowfixer.showDashboard";
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
        statusItem.command = "flowfixer.showDashboard";
        break;
      case "needsKey":
        statusItem.text = "$(key) Visual Debugger: Set Gemini Key";
        statusItem.tooltip = "Gemini API key is required for analysis. Click to configure.";
        statusItem.command = "flowfixer.setGeminiKey";
        break;
      case "analyzingError":
        statusItem.text = "$(loading~spin) Visual Debugger: Analyzing error...";
        statusItem.tooltip = "Visual Debugger is analyzing the detected error.";
        statusItem.command = "flowfixer.showErrorPanel";
        break;
      case "errorExplained":
        statusItem.text = "$(check) Visual Debugger: Error explained";
        statusItem.tooltip = "Error explanation ready. Click to open the panel.";
        statusItem.command = "flowfixer.showErrorPanel";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
      case "analyzingDiff":
        statusItem.text = "$(loading~spin) Visual Debugger: Reviewing fix...";
        statusItem.tooltip = "Visual Debugger is analyzing the code diff.";
        statusItem.command = "flowfixer.showDiffPanel";
        break;
      case "diffReviewed":
        statusItem.text = "$(git-compare) Visual Debugger: Fix reviewed";
        statusItem.tooltip = "Diff review ready. Click to open the panel.";
        statusItem.command = "flowfixer.showDiffPanel";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
      case "analysisFailed":
        statusItem.text = "$(error) Visual Debugger: Analysis failed";
        statusItem.tooltip = "Analysis failed. Check API key and logs, then retry.";
        statusItem.command = "flowfixer.showDashboard";
        resetStatusTimer = setTimeout(() => updateStatus(isInitialized() ? "ready" : "needsKey"), 5000);
        break;
    }

    statusItem.show();
  };

  context.subscriptions.push({ dispose: clearResetTimer });
  updateStatus(isInitialized() ? "ready" : "needsKey");

  // --- Pre-populate dashboard on activation ---
  // Use setImmediate-style delay so the webview has time to resolve
  setTimeout(async () => {
    const bugs = await getBugsWithFallback();
    dashboardPanel.postMessage({ type: "showDashboard", data: { bugs } });
  }, 500);

  // --- TTS message handler (shared by ErrorPanel & DiffPanel) ---
  function handleTtsRequest(msg: WebviewToExtMessage, panel: typeof errorPanel | typeof diffPanel): void {
    if (msg.type !== "requestTts") return;

    (async () => {
      const apiKey = await mergedSecrets.get("flowfixer.elevenLabsKey");
      if (!apiKey) {
        panel.postMessage({ type: "ttsError", data: { message: "No ElevenLabs API key set. Using browser speech." } });
        return;
      }
      try {
        const audio = await fetchTtsAudio(msg.text, apiKey);
        panel.postMessage({ type: "playAudio", data: { audio } });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`${LOG} TTS failed:`, errMsg);
        panel.postMessage({ type: "ttsError", data: { message: errMsg } });
      }
    })();
  }

  errorPanel.onMessage((msg) => handleTtsRequest(msg, errorPanel));
  diffPanel.onMessage((msg) => handleTtsRequest(msg, diffPanel));

  // --- Track last error for Phase 2 correlation ---
  let lastError: CapturedError | undefined;

  // --- Shared Phase 1 handler (used by both auto-detection and manual trigger) ---
  async function handlePhase1(error: CapturedError): Promise<void> {
    console.log(`${LOG} Phase 1: error detected — ${error.message}`);
    lastError = error;

    // Start tracking file changes for Phase 2
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

  // ===== PHASE 1: Error detected → LLM → Error Panel =====
  errorListener.onErrorDetected((error) => handlePhase1(error));

  // ===== PHASE 2: Diff detected → LLM → Diff Panel =====
  diffEngine.onDiffDetected(async (diff) => {
    console.log(`${LOG} Phase 2: diff detected in ${diff.file}`);

    updateStatus("analyzingDiff");

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

      updateStatus("diffReviewed");
    } catch (err) {
      console.error(`${LOG} Phase 2 failed:`, err);
      updateStatus("analysisFailed");
    }
  });

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("flowfixer.showErrorPanel", async () => {
      await vscode.commands.executeCommand("flowfixer.errorPanel.focus");
    }),
    vscode.commands.registerCommand("flowfixer.showDiffPanel", async () => {
      await vscode.commands.executeCommand("flowfixer.diffPanel.focus");
    }),
    vscode.commands.registerCommand("flowfixer.showDashboard", async () => {
      await vscode.commands.executeCommand("flowfixer.dashboardPanel.focus");
      const bugs = await getBugsWithFallback();
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
          await initLLM(mergedSecrets);
          updateStatus("ready");
          vscode.window.showInformationMessage("Visual Debugger: Gemini API key saved and connected.");
        } catch {
          updateStatus("needsKey");
          vscode.window.showWarningMessage("Visual Debugger: Key saved but initialization failed. Check the key.");
        }
      }
    }),
    vscode.commands.registerCommand("flowfixer.setElevenLabsKey", async () => {
      const key = await vscode.window.showInputBox({
        prompt: "Enter your ElevenLabs API key",
        password: true,
        ignoreFocusOut: true,
      });
      if (key) {
        await context.secrets.store("flowfixer.elevenLabsKey", key);
        vscode.window.showInformationMessage("Visual Debugger: ElevenLabs API key saved. Read Aloud is ready.");
      }
    }),
    vscode.commands.registerCommand("flowfixer.setMongoUri", async () => {
      const currentUri = await mergedSecrets.get("flowfixer.mongoUri");
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
        await context.secrets.delete("flowfixer.mongoUri");
        storage.setMongoUri(undefined);
        vscode.window.showInformationMessage("Visual Debugger: MongoDB disabled. Using local fallback storage.");
        return;
      }

      await context.secrets.store("flowfixer.mongoUri", uri);
      storage.setMongoUri(uri);
      const connected = await storage.testMongoConnection();
      if (connected) {
        const synced = await storage.syncLocalToMongo();
        vscode.window.showInformationMessage(`Visual Debugger: MongoDB URI saved and connected. Synced ${synced} local record(s).`);
      } else {
        vscode.window.showWarningMessage("Visual Debugger: URI saved, but connection failed. Using local fallback storage.");
      }
    }),

    // --- Manual trigger: analyze the current file's errors or report a logic bug ---
    vscode.commands.registerCommand("flowfixer.analyzeCurrentFile", async () => {
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
  vscode.window.showInformationMessage("Visual Debugger is active! Errors will be explained automatically.");
}

export function deactivate(): void {
  console.log(`${LOG} deactivated`);
}
