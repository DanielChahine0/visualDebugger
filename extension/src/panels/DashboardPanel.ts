import * as vscode from "vscode";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";

const LOG = "[FlowFixer:DashboardPanel]";

export class DashboardPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "flowfixer.dashboardPanel";
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
      vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "dashboardScript.js")
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Bug Dashboard</title>
</head>
<body>
  <div id="root">
    <p id="status-live" class="sr-only" aria-live="polite"></p>
    <div id="empty-state" class="empty-state">
      <p>No bug history yet.</p>
      <p class="muted">Your bug patterns will appear here as Visual Debugger tracks errors.</p>
    </div>
    <div id="dashboard-content" style="display:none;">
      <section>
        <h3>Bug Categories</h3>
        <div class="chart-container"><canvas id="category-chart" aria-label="Bug category bar chart"></canvas></div>
      </section>
      <section>
        <h3>Focus Area</h3>
        <p id="focus-area"></p>
      </section>
      <section>
        <h3>Trend Over Sessions (Last 7 Days)</h3>
        <div class="chart-container"><canvas id="trend-chart" aria-label="7 day bug trend"></canvas></div>
      </section>
      <section>
        <h3>Recent Bugs</h3>
        <div id="recent-bugs"></div>
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
