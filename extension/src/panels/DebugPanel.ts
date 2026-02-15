import * as vscode from "vscode";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";
import { getWebviewHtml } from "./panelUtils";

const LOG = "[FlowFixer:DebugPanel]";

export class DebugPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "visualdebugger.debugPanel";
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
      this.view.show?.(true);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    try {
      return getWebviewHtml(webview, this.extensionUri, "debug.html", {
        'href="styles.css"': "styles.css",
        'src="config.js"': "config.js",
      }, {
        extraConnectSrc: ["https://api.elevenlabs.io", "blob:"],
        extraMediaSrc: ["blob:", "data:"],
        extraFontSrc: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      });
    } catch (e) {
      console.error(`${LOG} Failed to read debug.html`, e);
      return `<div>Error loading resource: ${e}</div>`;
    }
  }
}
