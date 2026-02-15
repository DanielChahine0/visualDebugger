import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as vscode from "vscode";
import { loadEnv } from "../envLoader";

vi.mock("fs");
vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [],
  },
}));

describe("envLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (vscode.workspace.workspaceFolders as any) = [];
  });

  it("returns empty map when no files exist and no workspace open", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = loadEnv();
    expect(result.size).toBe(0);
  });

  it("loads from extension directory", () => {
    vi.mocked(fs.existsSync).mockImplementation((p: any) => p.includes("extension"));
    vi.mocked(fs.readFileSync).mockReturnValue("KEY=EXT_VAL");

    const result = loadEnv();
    expect(result.get("KEY")).toBe("EXT_VAL");
  });

  it("loads from workspace root and takes priority over extension", () => {
    (vscode.workspace.workspaceFolders as any) = [{ uri: { fsPath: "/ws" } }];
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((p: any) => {
      const normalized = p.replace(/\\/g, "/");
      if (normalized.endsWith("/ws/.env")) return "KEY=WS_VAL\nWS_ONLY=TRUE";
      return "KEY=EXT_VAL";
    });

    const result = loadEnv();
    expect(result.get("KEY")).toBe("WS_VAL");
    expect(result.get("WS_ONLY")).toBe("TRUE");
  });

  it("loads from parent of workspace root", () => {
    (vscode.workspace.workspaceFolders as any) = [{ uri: { fsPath: "/ws/subdir" } }];
    vi.mocked(fs.existsSync).mockImplementation((p: any) => {
      const normalized = p.replace(/\\/g, "/");
      return normalized.endsWith("/ws/.env");
    });
    vi.mocked(fs.readFileSync).mockReturnValue("PARENT_KEY=PARENT_VAL");

    const result = loadEnv();
    expect(result.get("PARENT_KEY")).toBe("PARENT_VAL");
  });

  it("skips comments and blank lines", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("# comment\n\nKEY=VAL\n  # indented comment");

    const result = loadEnv();
    expect(result.size).toBe(1);
    expect(result.get("KEY")).toBe("VAL");
  });

  it("strips surrounding quotes", () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('S_QUOTE=\'val1\'\nD_QUOTE="val2"');

    const result = loadEnv();
    expect(result.get("S_QUOTE")).toBe("val1");
    expect(result.get("D_QUOTE")).toBe("val2");
  });
});
