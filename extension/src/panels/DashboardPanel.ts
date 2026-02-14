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
  <style>
    .trend-wrap {
      border: 1px solid var(--vscode-widget-border);
      border-radius: 8px;
      padding: 10px;
      background: var(--vscode-editor-background);
    }
    .trend-svg {
      width: 100%;
      height: 140px;
      display: block;
    }
    .trend-axis {
      stroke: var(--vscode-widget-border);
      stroke-width: 1;
    }
    .trend-line {
      fill: none;
      stroke: #4fc3f7;
      stroke-width: 2.5;
    }
    .trend-point {
      fill: #4fc3f7;
    }
    .trend-labels {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .trend-label {
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
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
        <h3>Trend Over Sessions (Last 7 Days)</h3>
        <div class="trend-wrap">
          <div id="trend-chart"></div>
          <div id="trend-labels" class="trend-labels"></div>
        </div>
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

      renderTrendChart(bugs);

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

    function renderTrendChart(bugs) {
      const end = new Date();
      end.setHours(0, 0, 0, 0);
      const dayStarts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        dayStarts.push(d);
      }

      const counts = dayStarts.map(() => 0);
      for (const bug of bugs) {
        const ts = new Date(bug.timestamp);
        ts.setHours(0, 0, 0, 0);
        const index = dayStarts.findIndex(d => d.getTime() === ts.getTime());
        if (index >= 0) {
          counts[index]++;
        }
      }

      const max = Math.max(...counts, 1);
      const width = 320;
      const height = 120;
      const x0 = 16;
      const x1 = width - 16;
      const y0 = 10;
      const y1 = height - 12;

      const points = counts.map((count, i) => {
        const x = x0 + ((x1 - x0) * i) / Math.max(6, counts.length - 1);
        const y = y1 - ((y1 - y0) * count) / max;
        return { x, y, count };
      });

      const trendChart = document.getElementById('trend-chart');
      trendChart.innerHTML = '<svg class="trend-svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="Bug trend line chart">' +
        '<line class="trend-axis" x1="' + x0 + '" y1="' + y1 + '" x2="' + x1 + '" y2="' + y1 + '"></line>' +
        '<polyline class="trend-line" points="' + points.map(p => p.x + ',' + p.y).join(' ') + '"></polyline>' +
        points.map(p => '<circle class="trend-point" cx="' + p.x + '" cy="' + p.y + '" r="3"></circle>').join('') +
        '</svg>';

      const labels = document.getElementById('trend-labels');
      labels.innerHTML = dayStarts
        .map(d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
        .map(label => '<span class="trend-label">' + label + '</span>')
        .join('');
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
