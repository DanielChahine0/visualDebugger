import * as vscode from "vscode";
import { ErrorListener } from "./errorListener";
import { DiffEngine } from "./diffEngine";
import { initialize as initLLM, analyzeError, analyzeDiff, isInitialized, testConnection, FlowFixerError } from "./llmClient";
import { FlowFixerStorage } from "./storage";
import { ErrorPanelProvider } from "./panels/ErrorPanel";
import { DiffPanelProvider } from "./panels/DiffPanel";
import { DashboardPanelProvider } from "./panels/DashboardPanel";
import { CapturedError, BugRecord, WebviewToExtMessage } from "./types";

import { getSeedBugRecords } from "./seedData";
import { loadEnv } from "./envLoader";
import { fetchTtsAudio } from "./ttsClient";

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

  try {
    await initLLM(mergedSecrets);
  } catch {
    console.warn(`${LOG} LLM not initialized — set API key with 'Visual Debugger: Set Gemini API Key' or add GEMINI_API_KEY to .env`);
  }

  // --- Storage ---
  const mongoUri = await mergedSecrets.get("flowfixer.mongoUri");
  const storage = new FlowFixerStorage(context.globalState, mongoUri);

  const errorPanel = new ErrorPanelProvider(context.extensionUri);
  const diffPanel = new DiffPanelProvider(context.extensionUri);
  const dashboardPanel = new DashboardPanelProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ErrorPanelProvider.viewType, errorPanel),
    vscode.window.registerWebviewViewProvider(DiffPanelProvider.viewType, diffPanel),
    vscode.window.registerWebviewViewProvider(DashboardPanelProvider.viewType, dashboardPanel)
  );

  async function getBugsWithFallback(): Promise<BugRecord[]> {
    const stored = await storage.getAll();
    return stored.length > 0 ? stored : getSeedBugRecords();
  }

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

  setTimeout(async () => {
    const bugs = await getBugsWithFallback();
    dashboardPanel.postMessage({ type: "showDashboard", data: { bugs } });
  }, 500);

  // TTS runs directly in the webview (calls ElevenLabs API from browser context)
  // No extension-host proxy needed

  // --- Track last error for Phase 2 correlation ---
  let lastError: CapturedError | undefined;
  let lastBugId: string | undefined;

  async function handlePhase1(error: CapturedError): Promise<void> {
    console.log(`${LOG} Phase 1: error detected - ${error.message}`);
    lastError = error;
    // New error cycle starts here. Clear any stale Phase 2 review so users
    // don't see old fix explanations before a new diff is detected.
    diffPanel.postMessage({ type: "clear" });

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

      errorPanel.postMessage({
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
      case "quizAnswer":
        console.log(`${LOG} quiz answered from ${source} panel: ${message.answer}`);
        return;
      case "requestTts": {
        const text = message.text.trim();
        if (!text) return;

        const elevenLabsKey = await mergedSecrets.get("flowfixer.elevenLabsKey");
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
    errorPanel.onMessage((msg) => {
      void handleWebviewMessage("error", errorPanel, msg);
    }),
    diffPanel.onMessage((msg) => {
      void handleWebviewMessage("diff", diffPanel, msg);
    }),
    dashboardPanel.onMessage((msg) => {
      void handleWebviewMessage("dashboard", dashboardPanel, msg);
    })
  );

  errorListener.onErrorDetected((error) => handlePhase1(error));

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

      diffPanel.postMessage({
        type: "showDiff",
        data: { ...diffExplanation, diff },
      });

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
      console.error(`${LOG} Phase 2 failed:`, err);
      updateStatus("analysisFailed");

      if (err instanceof FlowFixerError) {
        vscode.window.showWarningMessage(`Visual Debugger: ${err.message}`);
      }
    }
  });

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
    vscode.commands.registerCommand("flowfixer.testGeminiConnection", async () => {
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

  context.subscriptions.push(errorListener, diffEngine, storage);

  console.log(`${LOG} activated successfully`);
  vscode.window.showInformationMessage("Visual Debugger is active! Errors will be explained automatically.");
}

export function deactivate(): void {
  console.log(`${LOG} deactivated`);
}
