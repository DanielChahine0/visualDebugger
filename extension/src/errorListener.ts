import * as vscode from "vscode";
import { CapturedError } from "./types";

const LOG = "[FlowFixer:ErrorListener]";
const SUPPORTED_LANGUAGES = new Set([
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
]);

/** Regex patterns for common terminal error messages */
const TERMINAL_ERROR_PATTERNS = [
  // TypeError, ReferenceError, SyntaxError, RangeError, etc.
  /(?<type>\w*Error):\s*(?<msg>.+?)(?:\n|\r|$)/,
  // Node.js uncaught
  /Uncaught\s+(?<type>\w*Error):\s*(?<msg>.+?)(?:\n|\r|$)/,
  // at file:line:col
  /at\s+.*?[(/](?<file>[^\s:()]+):(?<line>\d+):(?<col>\d+)/,
];

export class ErrorListener implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private onErrorDetectedEmitter = new vscode.EventEmitter<CapturedError>();

  /** Fires when an error is detected from diagnostics or terminal */
  readonly onErrorDetected = this.onErrorDetectedEmitter.event;

  /** Track recently fired errors to avoid duplicates */
  private recentErrors = new Map<string, number>();

  constructor() {
    // Listen to diagnostics changes (compiler/linter errors)
    this.disposables.push(
      vscode.languages.onDidChangeDiagnostics((e) =>
        this.handleDiagnosticsChange(e)
      )
    );

    // Listen to debug console output for runtime errors
    this.disposables.push(
      vscode.debug.onDidReceiveDebugSessionCustomEvent((e) => {
        if (e.event === "output" && typeof e.body?.output === "string") {
          this.handleTerminalData(e.body.output);
        }
      })
    );

    // Also monitor task output (e.g., npm run dev) via task process end
    this.disposables.push(
      vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.exitCode && e.exitCode !== 0) {
          // Non-zero exit often means error — diagnostics will usually catch it
          console.log(`${LOG} task exited with code ${e.exitCode}`);
        }
      })
    );

    console.log(`${LOG} initialized`);
  }

  private async handleDiagnosticsChange(
    event: vscode.DiagnosticChangeEvent
  ): Promise<void> {
    for (const uri of event.uris) {
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === uri.toString()
      );
      if (!doc || !SUPPORTED_LANGUAGES.has(doc.languageId)) {
        continue;
      }

      const diagnostics = vscode.languages.getDiagnostics(uri);
      const errors = diagnostics.filter(
        (d) => d.severity === vscode.DiagnosticSeverity.Error
      );

      for (const diag of errors) {
        const captured = await this.buildCapturedError(
          diag.message,
          uri.fsPath,
          diag.range.start.line + 1, // 1-indexed
          doc.languageId,
          doc.getText(),
          "diagnostics"
        );

        if (captured && !this.isDuplicate(captured)) {
          this.recentErrors.set(this.errorKey(captured), Date.now());
          this.onErrorDetectedEmitter.fire(captured);
          console.log(
            `${LOG} diagnostic error: ${captured.message} at ${captured.file}:${captured.line}`
          );
        }
      }
    }
  }

  private handleTerminalData(data: string): void {
    // Match error patterns in terminal output
    const errorMatch = data.match(TERMINAL_ERROR_PATTERNS[0]);
    if (!errorMatch?.groups) return;

    const fileMatch = data.match(TERMINAL_ERROR_PATTERNS[2]);
    const file = fileMatch?.groups?.file ?? "unknown";
    const line = fileMatch?.groups?.line ? parseInt(fileMatch.groups.line) : 1;

    // Try to find the file in the workspace and get context
    this.resolveTerminalError(
      `${errorMatch.groups.type}: ${errorMatch.groups.msg}`,
      file,
      line
    );
  }

  private async resolveTerminalError(
    message: string,
    filePath: string,
    line: number
  ): Promise<void> {
    // Try to resolve relative paths against workspace
    let resolvedUri: vscode.Uri | undefined;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        const candidate = vscode.Uri.joinPath(folder.uri, filePath);
        try {
          await vscode.workspace.fs.stat(candidate);
          resolvedUri = candidate;
          break;
        } catch {
          // file not found in this folder
        }
      }
    }

    let codeContext = "";
    let language = "javascript";

    if (resolvedUri) {
      try {
        const doc = await vscode.workspace.openTextDocument(resolvedUri);
        language = doc.languageId;
        codeContext = this.extractContext(doc.getText(), line);
      } catch {
        // couldn't open
      }
    }

    const captured: CapturedError = {
      message,
      file: resolvedUri?.fsPath ?? filePath,
      line,
      language,
      codeContext,
      severity: "error",
      source: "terminal",
      timestamp: Date.now(),
    };

    if (!this.isDuplicate(captured)) {
      this.recentErrors.set(this.errorKey(captured), Date.now());
      this.onErrorDetectedEmitter.fire(captured);
      console.log(`${LOG} terminal error: ${message} at ${filePath}:${line}`);
    }
  }

  private async buildCapturedError(
    message: string,
    filePath: string,
    line: number,
    language: string,
    fullText: string,
    source: "diagnostics" | "terminal"
  ): Promise<CapturedError> {
    return {
      message,
      file: filePath,
      line,
      language,
      codeContext: this.extractContext(fullText, line),
      severity: "error",
      source,
      timestamp: Date.now(),
    };
  }

  /** Extract ±10 lines around the error line */
  private extractContext(text: string, line: number): string {
    const lines = text.split("\n");
    const start = Math.max(0, line - 11); // 10 lines before (1-indexed)
    const end = Math.min(lines.length, line + 10);
    return lines
      .slice(start, end)
      .map((l, i) => `${start + i + 1} | ${l}`)
      .join("\n");
  }

  private errorKey(err: CapturedError): string {
    return `${err.file}:${err.line}:${err.message}`;
  }

  private isDuplicate(err: CapturedError): boolean {
    const key = this.errorKey(err);
    const last = this.recentErrors.get(key);
    // Deduplicate within 2 seconds
    return !!last && Date.now() - last < 2000;
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    this.onErrorDetectedEmitter.dispose();
  }
}
