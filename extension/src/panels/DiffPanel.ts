import * as vscode from "vscode";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";

const LOG = "[FlowFixer:DiffPanel]";

export class DiffPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "flowfixer.diffPanel";
  private view?: vscode.WebviewView;
  private onMessageEmitter = new vscode.EventEmitter<WebviewToExtMessage>();
  readonly onMessage = this.onMessageEmitter.event;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((msg: WebviewToExtMessage) => {
      this.onMessageEmitter.fire(msg);
    });

    console.log(`${LOG} view resolved`);
  }

  postMessage(message: ExtToWebviewMessage): void {
    if (this.view) {
      this.view.webview.postMessage(message);
      this.view.show?.(true);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "src", "webview", "styles.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "diffPanel.js")
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Diff Review</title>
</head>
<body>
  <div id="root">
    <div id="empty-state" class="empty-state">
      <p>No AI fixes detected yet.</p>
      <p class="muted">After an error is explained, Visual Debugger will track the next file save to show what changed.</p>
    </div>
    <div id="diff-content" style="display:none;">
      <h3>What the AI changed</h3>
      <pre id="diff-view" class="diff-view"></pre>
      <section>
        <h3>What changed</h3>
        <p id="what-changed"></p>
      </section>
      <section>
        <h3>Why it fixes the bug</h3>
        <p id="why-it-fixes"></p>
      </section>
      <section>
        <h3>Key takeaway</h3>
        <p id="key-takeaway" class="takeaway"></p>
      </section>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = "";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}
