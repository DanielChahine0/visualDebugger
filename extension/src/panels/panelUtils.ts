import * as vscode from "vscode";
import * as crypto from "crypto";
import * as fs from "fs";

/** Generate a cryptographically secure nonce for CSP. */
export function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * Options for building the Content-Security-Policy header.
 * Each field accepts extra sources to append to the default directive.
 */
export interface CspOptions {
  /** Extra sources for script-src (e.g. `https://cdn.jsdelivr.net`). */
  extraScriptSrc?: string[];
  /** Extra sources for connect-src (e.g. `https://api.elevenlabs.io`). */
  extraConnectSrc?: string[];
  /** Extra sources for media-src (e.g. `blob:`). */
  extraMediaSrc?: string[];
  /** Extra sources for font-src (e.g. Google Fonts origins). */
  extraFontSrc?: string[];
  /** Extra sources for img-src. */
  extraImgSrc?: string[];
}

/**
 * Load an HTML file from `dist/webview/`, inject a secure CSP meta tag,
 * replace local resource references with webview-safe URIs, and add a
 * nonce to every `<script` tag.
 *
 * @param webview      The target webview.
 * @param extensionUri The root URI of the extension (for resolving paths).
 * @param htmlFileName The HTML file inside `dist/webview/` to load.
 * @param resourceMap  Map of original href/src values to their filenames
 *                     inside `dist/webview/` — used to rewrite references
 *                     to webview-safe URIs.
 *                     Example: `{ 'href="styles.css"': "styles.css", 'src="config.js"': "config.js" }`
 * @param cspOptions   Extra CSP directives (see {@link CspOptions}).
 */
export function getWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  htmlFileName: string,
  resourceMap: Record<string, string> = {},
  cspOptions: CspOptions = {},
): string {
  const htmlPath = vscode.Uri.joinPath(extensionUri, "dist", "webview", htmlFileName);
  let html = fs.readFileSync(htmlPath.fsPath, "utf-8");

  const nonce = getNonce();

  // Replace local resource references with webview-safe URIs.
  for (const [original, fileName] of Object.entries(resourceMap)) {
    const uri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, "dist", "webview", fileName),
    );
    // Build the replacement by swapping the bare filename for the full URI.
    const replacement = original.replace(fileName, uri.toString());
    html = html.replace(original, replacement);
  }

  // Add nonce to every <script tag (inline and external).
  html = html.replace(/<script/g, `<script nonce="${nonce}"`);

  // Build a secure CSP (no 'unsafe-eval').
  const scriptSrc = [`'nonce-${nonce}'`, ...(cspOptions.extraScriptSrc ?? [])].join(" ");
  const connectSrc = (cspOptions.extraConnectSrc ?? []).length > 0
    ? ` connect-src ${cspOptions.extraConnectSrc!.join(" ")};`
    : "";
  const mediaSrc = (cspOptions.extraMediaSrc ?? []).length > 0
    ? ` media-src ${cspOptions.extraMediaSrc!.join(" ")};`
    : "";
  const fontSrc = (cspOptions.extraFontSrc ?? []).length > 0
    ? ` font-src ${cspOptions.extraFontSrc!.join(" ")};`
    : "";
  const imgSrc = (cspOptions.extraImgSrc ?? []).length > 0
    ? ` img-src ${cspOptions.extraImgSrc!.join(" ")};`
    : " img-src data:;";

  const csp = [
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none';`,
    ` style-src ${webview.cspSource} 'unsafe-inline';`,
    ` script-src ${scriptSrc};`,
    connectSrc,
    mediaSrc,
    fontSrc,
    imgSrc,
    `">`,
  ].join("");

  html = html.replace("<head>", `<head>${csp}`);

  return html;
}
