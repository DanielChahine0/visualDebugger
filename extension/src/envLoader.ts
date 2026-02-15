import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Reads a `.env` file from the workspace root and returns a Map of key-value pairs.
 * Skips blank lines and `#` comments. Strips optional surrounding quotes from values.
 * Returns an empty map if no workspace is open or no `.env` file exists.
 */
/**
 * Reads a `.env` file from the workspace root and the extension directory.
 * Returns a merged Map of key-value pairs.
 * Skips blank lines and `#` comments. Strips optional surrounding quotes from values.
 */
export function loadEnv(): Map<string, string> {
  const env = new Map<string, string>();

  // 1. Extension directory (stable location for keys)
  const extensionEnvPath = path.join(__dirname, "..", ".env");
  loadIntoMap(extensionEnvPath, env);

  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const wsPath = folders[0].uri.fsPath;

    // 2. Parent directory (covers many multi-repo setups)
    const parentEnvPath = path.join(wsPath, "..", ".env");
    loadIntoMap(parentEnvPath, env);

    // 3. Workspace root (highest priority)
    const wsEnvPath = path.join(wsPath, ".env");
    loadIntoMap(wsEnvPath, env);
  }

  return env;
}

function loadIntoMap(filePath: string, map: Map<string, string>): void {
  try {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) {
        continue;
      }

      const eqIndex = line.indexOf("=");
      if (eqIndex === -1) {
        continue;
      }

      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();

      // Strip matching surrounding quotes (single or double)
      if (
        value.length >= 2 &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = value.slice(1, -1);
      }

      if (key && value) {
        map.set(key, value);
      }
    }
  } catch (err) {
    console.warn(`[FlowFixer:EnvLoader] Failed to read ${filePath}:`, err);
  }
}
