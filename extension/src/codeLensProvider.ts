import * as vscode from "vscode";

const LOG = "[FlowFixer:CodeLens]";

export const SUPPORTED_LANGUAGES = [
  "javascript",
  "typescript",
  "javascriptreact",
  "typescriptreact",
];

export class FlowFixerCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private disposable: vscode.Disposable;

  constructor() {
    this.disposable = vscode.languages.onDidChangeDiagnostics(() => {
      this._onDidChangeCodeLenses.fire();
    });
    console.log(`${LOG} initialized`);
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!SUPPORTED_LANGUAGES.includes(document.languageId)) {
      return [];
    }

    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const errors = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    );

    const lenses: vscode.CodeLens[] = [];

    for (const diag of errors) {
      const range = new vscode.Range(
        diag.range.start.line, 0,
        diag.range.start.line, 0
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(lightbulb) Explain this error",
          command: "visualdebugger.explainCodeLensError",
          arguments: [document.uri.fsPath, diag.range.start.line + 1, diag.message],
          tooltip: "Get an ADHD-friendly explanation of this error",
        }),
        new vscode.CodeLens(range, {
          title: "$(wrench) Fix it for me",
          command: "visualdebugger.fixCodeLensError",
          arguments: [document.uri.fsPath, diag.range.start.line + 1, diag.message],
          tooltip: "Get step-by-step fix instructions",
        })
      );
    }

    return lenses;
  }

  dispose(): void {
    this.disposable.dispose();
    this._onDidChangeCodeLenses.dispose();
  }
}
