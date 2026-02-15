import * as vscode from "vscode";
import { ExtToWebviewMessage, WebviewToExtMessage } from "../types";
import { getWebviewHtml } from "./panelUtils";

const LOG = "[FlowFixer:DashboardPanel]";

export class DashboardPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "visualdebugger.dashboardPanel";
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
    try {
      return getWebviewHtml(webview, this.extensionUri, "dashboard.html", {
        'href="styles.css"': "styles.css",
      }, {
        extraScriptSrc: ["https://cdn.jsdelivr.net"],
        extraConnectSrc: ["https://api.elevenlabs.io", "blob:"],
        extraMediaSrc: ["blob:", "data:"],
        extraFontSrc: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      });
    } catch (e) {
      console.error(`${LOG} Failed to read dashboard.html`, e);
      return `<div>Error loading resource: ${e}</div>`;
    }
  }
}
