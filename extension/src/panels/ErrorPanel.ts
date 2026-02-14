import * as vscode from "vscode";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";

const LOG = "[FlowFixer:ErrorPanel]";

export class ErrorPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "flowfixer.errorPanel";
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

  /** Send data to the webview */
  postMessage(message: ExtToWebviewMessage): void {
    if (this.view) {
      this.view.webview.postMessage(message);
      this.view.show?.(true);
    } else {
      console.warn(`${LOG} no active view to post message to`);
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
  <title>Error Explanation</title>
</head>
<body>
  <div id="root">
    <div id="empty-state" class="empty-state">
      <p>No errors detected yet.</p>
      <p class="muted">Visual Debugger will explain errors when they appear in your code.</p>
    </div>
    <div id="error-content" style="display:none;">
      <div class="badge-row">
        <span id="category-badge" class="badge"></span>
        <span id="location" class="muted"></span>
      </div>
      <section>
        <h3>What happened?</h3>
        <p id="explanation"></p>
      </section>
      <section>
        <h3>How to fix it</h3>
        <p id="how-to-fix"></p>
      </section>
      <section>
        <h3>How to prevent it</h3>
        <p id="how-to-prevent"></p>
      </section>
      <section>
        <h3>Best practices</h3>
        <p id="best-practices"></p>
      </section>
      <section id="quiz-section" style="display:none;">
        <h3>Test yourself</h3>
        <p id="quiz-question"></p>
        <div id="quiz-options"></div>
        <p id="quiz-feedback" style="display:none;"></p>
      </section>
    </div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    vscode.postMessage({ type: 'ready' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.type === 'showError') {
        document.getElementById('empty-state').style.display = 'none';
        document.getElementById('error-content').style.display = 'block';
        const d = msg.data;

        const badge = document.getElementById('category-badge');
        badge.textContent = d.category;
        badge.className = 'badge badge-' + d.category.toLowerCase().replace(/\\s+/g, '-');

        document.getElementById('location').textContent = d.location;
        document.getElementById('explanation').textContent = d.explanation;
        document.getElementById('how-to-fix').textContent = d.howToFix;
        document.getElementById('how-to-prevent').textContent = d.howToPrevent;
        document.getElementById('best-practices').textContent = d.bestPractices;

        // Quiz
        if (d.quiz) {
          const qs = document.getElementById('quiz-section');
          qs.style.display = 'block';
          document.getElementById('quiz-question').textContent = d.quiz.question;
          const opts = document.getElementById('quiz-options');
          opts.innerHTML = '';
          d.quiz.options.forEach((opt) => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option';
            btn.textContent = opt;
            btn.onclick = () => {
              const letter = opt.charAt(0);
              vscode.postMessage({ type: 'quizAnswer', answer: letter });
              const fb = document.getElementById('quiz-feedback');
              fb.style.display = 'block';
              if (letter === d.quiz.correct) {
                fb.textContent = 'Correct! ' + d.quiz.explanation;
                fb.className = 'quiz-correct';
              } else {
                fb.textContent = 'Not quite. ' + d.quiz.explanation;
                fb.className = 'quiz-incorrect';
              }
              opts.querySelectorAll('button').forEach(b => b.disabled = true);
            };
            opts.appendChild(btn);
          });
        }
      } else if (msg.type === 'clear') {
        document.getElementById('empty-state').style.display = 'block';
        document.getElementById('error-content').style.display = 'none';
      }
    });
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
