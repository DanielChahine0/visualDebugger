import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/**
 * Reads a `.env` file from the workspace root and returns a Map of key-value pairs.
 * Skips blank lines and `#` comments. Strips optional surrounding quotes from values.
 * Returns an empty map if no workspace is open or no `.env` file exists.
 */
export function loadEnv(): Map<string, string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return new Map();
  }

  const envPath = path.join(folders[0].uri.fsPath, ".env");

  let content: string;
  try {
    content = fs.readFileSync(envPath, "utf-8");
  } catch {
    return new Map();
  }

  const env = new Map<string, string>();

  for (const raw of content.split("\n")) {
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
      env.set(key, value);
    }
  }

  return env;
}
