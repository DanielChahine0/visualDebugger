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
    <div id="empty-state" class="empty-state">
      <p>No bug history yet.</p>
      <p class="muted">Your bug patterns will appear here as FlowFixer tracks errors.</p>
    </div>
    <div id="dashboard-content" style="display:none;">
      <h3>Bug Categories</h3>
      <div id="category-chart" class="chart-container">
        <div class="bar-chart" id="bar-chart"></div>
      </div>
      <section>
        <h3>Focus Area</h3>
        <p id="focus-area"></p>
      </section>
      <section>
        <h3>Recent Bugs</h3>
        <div id="recent-bugs"></div>
      </section>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'showDashboard') {
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';
        const bugs = msg.data.bugs;
        renderDashboard(bugs);
      }
    });

    function renderDashboard(bugs) {
      // Count by category
      const counts = { 'Syntax Error': 0, 'Logic Error': 0, 'Runtime Error': 0 };
      bugs.forEach(b => { if (counts[b.category] !== undefined) counts[b.category]++; });

      const max = Math.max(...Object.values(counts), 1);
      const chart = document.getElementById('bar-chart');
      chart.innerHTML = Object.entries(counts).map(([cat, count]) => {
        const pct = (count / max) * 100;
        const cls = cat.toLowerCase().replace(/\\s+/g, '-');
        return '<div class="bar-row">' +
          '<span class="bar-label">' + cat + '</span>' +
          '<div class="bar-track"><div class="bar-fill bar-' + cls + '" style="width:' + pct + '%"></div></div>' +
          '<span class="bar-count">' + count + '</span>' +
          '</div>';
      }).join('');

      // Focus area = highest category
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const focus = sorted[0];
      document.getElementById('focus-area').textContent =
        focus[1] > 0
          ? 'You struggle most with ' + focus[0] + 's. Focus on understanding these patterns.'
          : 'Keep coding! Patterns will emerge as you encounter more bugs.';

      // Recent bugs
      const recent = document.getElementById('recent-bugs');
      recent.innerHTML = bugs.slice(-10).reverse().map(b => {
        const cls = b.category.toLowerCase().replace(/\\s+/g, '-');
        const time = new Date(b.timestamp).toLocaleString();
        return '<div class="bug-item">' +
          '<span class="badge badge-' + cls + ' badge-sm">' + b.category + '</span> ' +
          '<span class="muted">' + b.file.split(/[\\\\/]/).pop() + '</span> ' +
          '<span class="muted">' + time + '</span>' +
          '</div>';
      }).join('');
    }
  </script>
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
