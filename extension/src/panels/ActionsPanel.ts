import * as vscode from "vscode";
import * as fs from "fs";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";

const LOG = "[FlowFixer:ActionsPanel]";

export class ActionsPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "flowfixer.actionsPanel";
  private view?: vscode.WebviewView;
  private onMessageEmitter = new vscode.EventEmitter<WebviewToExtMessage>();
  readonly onMessage = this.onMessageEmitter.event;
  private pendingMessage?: ExtToWebviewMessage;

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
      if (msg.type === "ready" && this.pendingMessage) {
        webviewView.webview.postMessage(this.pendingMessage);
        console.log(`${LOG} replayed pending message`);
      }
      this.onMessageEmitter.fire(msg);
    });

    console.log(`${LOG} view resolved`);
  }

  postMessage(message: ExtToWebviewMessage): void {
    this.pendingMessage = message;
    if (this.view) {
      this.view.webview.postMessage(message);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const htmlPath = vscode.Uri.joinPath(this.extensionUri, "src", "webview", "actions.html");
    const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "src", "webview", "styles.css"));
    const nonce = getNonce();

    let html = "";
    try {
      html = fs.readFileSync(htmlPath.fsPath, "utf8");
    } catch (e) {
      console.error(`${LOG} Failed to read actions.html`, e);
      return `<div>Error loading resource: ${e}</div>`;
    }

    html = html.replace('href="styles.css"', `href="${stylesUri}"`);
    html = html.replace(/<script/g, `<script nonce="${nonce}"`);

    const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">`;
    html = html.replace('<head>', `<head>${csp}`);

    return html;
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
