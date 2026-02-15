import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeDocument, makeDiagnostic, makeCapturedError } from "./helpers";

// ---------------------------------------------------------------------------
// Hoisted mocks – available inside vi.mock() factories
// ---------------------------------------------------------------------------
const {
  mockGetDiagnostics,
  mockOnDidChangeDiagnostics,
  mockOnDidReceiveDebugSessionCustomEvent,
  mockOnDidEndTaskProcess,
  mockEventEmitterFire,
  mockEventEmitterDispose,
  mockEventEmitterEvent,
  mockTextDocuments,
  mockState,
  mockOpenTextDocument,
  mockFsStat,
  mockUriJoinPath,
} = vi.hoisted(() => ({
  mockGetDiagnostics: vi.fn().mockReturnValue([]),
  mockOnDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
  mockOnDidReceiveDebugSessionCustomEvent: vi.fn(() => ({ dispose: vi.fn() })),
  mockOnDidEndTaskProcess: vi.fn(() => ({ dispose: vi.fn() })),
  mockEventEmitterFire: vi.fn(),
  mockEventEmitterDispose: vi.fn(),
  mockEventEmitterEvent: vi.fn(),
  mockTextDocuments: [] as Array<ReturnType<typeof makeDocument>>,
  mockState: {
    workspaceFolders: undefined as
      | Array<{ uri: { fsPath: string; toString: () => string } }>
      | undefined,
  },
  mockOpenTextDocument: vi.fn(),
  mockFsStat: vi.fn(),
  mockUriJoinPath: vi.fn(),
}));

vi.mock("vscode", () => {
  const EventEmitter = vi.fn().mockImplementation(() => ({
    event: mockEventEmitterEvent,
    fire: mockEventEmitterFire,
    dispose: mockEventEmitterDispose,
  }));

  return {
    languages: {
      getDiagnostics: mockGetDiagnostics,
      onDidChangeDiagnostics: mockOnDidChangeDiagnostics,
    },
    debug: {
      onDidReceiveDebugSessionCustomEvent:
        mockOnDidReceiveDebugSessionCustomEvent,
    },
    tasks: {
      onDidEndTaskProcess: mockOnDidEndTaskProcess,
    },
    workspace: {
      get textDocuments() {
        return mockTextDocuments;
      },
      get workspaceFolders() {
        return mockState.workspaceFolders;
      },
      openTextDocument: mockOpenTextDocument,
      fs: { stat: mockFsStat },
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    Uri: {
      joinPath: mockUriJoinPath,
      file: (path: string) => ({
        fsPath: path,
        toString: () => path,
      }),
    },
    EventEmitter,
  };
});

import { ErrorListener } from "../errorListener";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Invoke the onDidChangeDiagnostics callback that was registered during construction. */
function fireDiagnosticsChange(
  uris: Array<{ fsPath: string; toString: () => string }>,
) {
  const cb = mockOnDidChangeDiagnostics.mock.calls[0]?.[0];
  if (!cb) throw new Error("No diagnostics change callback registered");
  return cb({ uris });
}

/** Invoke the debug session custom event callback. */
function fireDebugSessionEvent(event: string, body?: unknown) {
  const cb = mockOnDidReceiveDebugSessionCustomEvent.mock.calls[0]?.[0];
  if (!cb) throw new Error("No debug session event callback registered");
  return cb({ event, body });
}

/** Invoke the task process end callback. */
function fireTaskProcessEnd(exitCode: number | undefined) {
  const cb = mockOnDidEndTaskProcess.mock.calls[0]?.[0];
  if (!cb) throw new Error("No task process end callback registered");
  return cb({ exitCode });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ErrorListener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset mutable shared state
    mockTextDocuments.length = 0;
    mockState.workspaceFolders = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ------- Construction -------

  it("constructs without errors", () => {
    expect(() => new ErrorListener()).not.toThrow();
  });

  it("registers three VS Code listeners on construction", () => {
    new ErrorListener();
    expect(mockOnDidChangeDiagnostics).toHaveBeenCalledOnce();
    expect(mockOnDidReceiveDebugSessionCustomEvent).toHaveBeenCalledOnce();
    expect(mockOnDidEndTaskProcess).toHaveBeenCalledOnce();
  });

  // ------- Diagnostic error detection -------

  it("fires onErrorDetected for Error-severity diagnostics", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\nconst y = 2;\n",
    });
    mockTextDocuments.push(doc);

    const errorDiag = makeDiagnostic({ line: 0, message: "Missing semicolon", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    expect(captured.message).toBe("Missing semicolon");
    expect(captured.file).toBe("/src/app.ts");
    expect(captured.line).toBe(1); // 0-indexed line + 1
    expect(captured.language).toBe("typescript");
    expect(captured.source).toBe("diagnostics");
    expect(captured.severity).toBe("error");
  });

  it("ignores Warning-severity diagnostics", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    const warningDiag = makeDiagnostic({ line: 0, message: "Unused variable", severity: 1 });
    mockGetDiagnostics.mockReturnValue([warningDiag]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("ignores Information and Hint severity diagnostics", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    const infoDiag = makeDiagnostic({ line: 0, message: "Info", severity: 2 });
    const hintDiag = makeDiagnostic({ line: 1, message: "Hint", severity: 3 });
    mockGetDiagnostics.mockReturnValue([infoDiag, hintDiag]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  // ------- Unsupported languages -------

  it("ignores diagnostics for unsupported languages", async () => {
    const doc = makeDocument({
      fsPath: "/src/main.py",
      languageId: "python",
    });
    mockTextDocuments.push(doc);

    const errorDiag = makeDiagnostic({ line: 0, message: "SyntaxError", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("ignores URIs that have no matching open text document", async () => {
    // No documents in workspace — textDocuments is empty
    const uri = { fsPath: "/src/missing.ts", toString: () => "/src/missing.ts" };
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic({ line: 0, message: "Error", severity: 0 }),
    ]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([uri]);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("processes all four supported JS/TS languages", async () => {
    const languages = [
      "javascript",
      "typescript",
      "javascriptreact",
      "typescriptreact",
    ];

    for (const lang of languages) {
      vi.clearAllMocks();
      mockTextDocuments.length = 0;

      const doc = makeDocument({ fsPath: `/src/file.${lang}`, languageId: lang });
      mockTextDocuments.push(doc);
      mockGetDiagnostics.mockReturnValue([
        makeDiagnostic({ line: 0, message: `Error in ${lang}`, severity: 0 }),
      ]);

      const listener = new ErrorListener();
      await fireDiagnosticsChange([doc.uri]);

      expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    }
  });

  // ------- Deduplication -------

  it("suppresses duplicate errors within 2 seconds", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    const errorDiag = makeDiagnostic({ line: 5, message: "Type mismatch", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag]);

    const listener = new ErrorListener();

    // First fire — should emit
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1);

    // Advance less than 2 seconds
    vi.advanceTimersByTime(1000);

    // Second fire — same error, should be suppressed
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1); // still 1
  });

  it("fires again for same error after 2 seconds have elapsed", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    const errorDiag = makeDiagnostic({ line: 5, message: "Type mismatch", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag]);

    const listener = new ErrorListener();

    // First fire
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1);

    // Advance past 2 seconds
    vi.advanceTimersByTime(2500);

    // Second fire — should emit again
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(2);
  });

  it("allows different errors at different locations simultaneously", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    const errorDiag1 = makeDiagnostic({ line: 5, message: "Error A", severity: 0 });
    const errorDiag2 = makeDiagnostic({ line: 10, message: "Error B", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag1, errorDiag2]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).toHaveBeenCalledTimes(2);
  });

  // ------- Self-cleaning of stale entries -------

  it("cleans stale entries from recentErrors during isDuplicate", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    // First error
    const errorDiag1 = makeDiagnostic({ line: 1, message: "Error A", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag1]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1);

    // Advance past 2 seconds so Error A becomes stale
    vi.advanceTimersByTime(3000);

    // Fire a different error — this triggers isDuplicate which cleans stale entries
    const errorDiag2 = makeDiagnostic({ line: 2, message: "Error B", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag2]);
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(2);

    // Now re-fire Error A — it should fire again since it was cleaned
    mockGetDiagnostics.mockReturnValue([errorDiag1]);
    await fireDiagnosticsChange([doc.uri]);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(3);
  });

  // ------- Terminal error matching -------

  it("detects terminal errors matching the TypeError pattern", async () => {
    // Make resolveTerminalError skip workspace resolution
    mockState.workspaceFolders = undefined;

    const listener = new ErrorListener();

    fireDebugSessionEvent("output", {
      output: "TypeError: Cannot read properties of undefined (reading 'map')\n",
    });

    // resolveTerminalError is async, give it a tick
    await vi.advanceTimersByTimeAsync(0);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    expect(captured.message).toBe(
      "TypeError: Cannot read properties of undefined (reading 'map')",
    );
    expect(captured.source).toBe("terminal");
    expect(captured.file).toBe("unknown");
  });

  it("extracts file and line from terminal error with stack trace", async () => {
    mockState.workspaceFolders = undefined;

    const listener = new ErrorListener();

    const output = [
      "ReferenceError: foo is not defined",
      "    at Object.<anonymous> (/src/index.js:42:5)",
    ].join("\n");

    fireDebugSessionEvent("output", { output });

    await vi.advanceTimersByTimeAsync(0);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    expect(captured.message).toBe("ReferenceError: foo is not defined");
    expect(captured.file).toContain("index.js");
    expect(captured.line).toBe(42);
  });

  it("ignores debug output that does not match error patterns", () => {
    const listener = new ErrorListener();

    fireDebugSessionEvent("output", {
      output: "Server started on port 3000",
    });

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("ignores debug events that are not 'output' type", () => {
    const listener = new ErrorListener();
    fireDebugSessionEvent("stopped", { reason: "breakpoint" });
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("ignores debug events where body.output is not a string", () => {
    const listener = new ErrorListener();
    fireDebugSessionEvent("output", { output: 42 });
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  // ------- Terminal error with workspace resolution -------

  it("resolves terminal error file against workspace folders", async () => {
    const workspaceUri = {
      fsPath: "/workspace",
      toString: () => "/workspace",
    };
    mockState.workspaceFolders = [{ uri: workspaceUri }];

    const candidateUri = {
      fsPath: "/workspace/src/index.js",
      toString: () => "/workspace/src/index.js",
    };
    mockUriJoinPath.mockReturnValue(candidateUri);
    mockFsStat.mockResolvedValue({}); // file exists

    const resolvedDoc = makeDocument({
      fsPath: "/workspace/src/index.js",
      languageId: "javascript",
      text: "line1\nline2\nline3\n",
    });
    mockOpenTextDocument.mockResolvedValue(resolvedDoc);

    const listener = new ErrorListener();

    const output = [
      "TypeError: x is not a function",
      "    at module (src/index.js:2:10)",
    ].join("\n");

    fireDebugSessionEvent("output", { output });

    await vi.advanceTimersByTimeAsync(10);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    expect(captured.file).toBe("/workspace/src/index.js");
    expect(captured.language).toBe("javascript");
  });

  // ------- Context extraction -------

  it("uses extractCodeContext for building code context", async () => {
    const lines = Array.from({ length: 25 }, (_, i) => `line ${i + 1}`);
    const fullText = lines.join("\n");

    const doc = makeDocument({
      fsPath: "/src/big.ts",
      languageId: "typescript",
      text: fullText,
    });
    mockTextDocuments.push(doc);

    const errorDiag = makeDiagnostic({ line: 14, message: "Error here", severity: 0 });
    mockGetDiagnostics.mockReturnValue([errorDiag]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    // Line 15 (1-indexed), context should include lines around it
    expect(captured.codeContext).toContain("15 | line 15");
    // Should include lines before
    expect(captured.codeContext).toContain("5 | line 5");
  });

  // ------- Error key generation -------

  it("generates unique error keys based on file:line:message", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockTextDocuments.push(doc);

    // Two errors on different lines with different messages
    const diag1 = makeDiagnostic({ line: 0, message: "Error A", severity: 0 });
    const diag2 = makeDiagnostic({ line: 5, message: "Error B", severity: 0 });
    mockGetDiagnostics.mockReturnValue([diag1, diag2]);

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc.uri]);

    // Both should fire since they have different keys
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(2);

    const call1 = mockEventEmitterFire.mock.calls[0][0];
    const call2 = mockEventEmitterFire.mock.calls[1][0];

    // Verify distinctness
    expect(call1.message).not.toBe(call2.message);
  });

  // ------- Task process end -------

  it("logs non-zero task exit codes without firing error event", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const listener = new ErrorListener();
    fireTaskProcessEnd(1);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("task exited with code 1"),
    );
    expect(mockEventEmitterFire).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("does not log for tasks that exit with code 0", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const listener = new ErrorListener();
    fireTaskProcessEnd(0);

    // Only the initialization log, not a task exit log
    const taskLogCalls = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes("task exited"),
    );
    expect(taskLogCalls).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  // ------- Dispose -------

  it("dispose cleans up all listeners and emitter", () => {
    const listener = new ErrorListener();
    listener.dispose();

    // Three subscription disposables + EventEmitter dispose
    expect(mockEventEmitterDispose).toHaveBeenCalledOnce();
  });

  it("dispose can be called multiple times without error", () => {
    const listener = new ErrorListener();
    expect(() => {
      listener.dispose();
      listener.dispose();
    }).not.toThrow();
  });

  // ------- Multiple URIs in single diagnostic change event -------

  it("processes multiple URIs in a single diagnostic change event", async () => {
    const doc1 = makeDocument({
      fsPath: "/src/a.ts",
      languageId: "typescript",
    });
    const doc2 = makeDocument({
      fsPath: "/src/b.tsx",
      languageId: "typescriptreact",
    });
    mockTextDocuments.push(doc1, doc2);

    mockGetDiagnostics.mockImplementation((uri: { toString: () => string }) => {
      const path = uri.toString();
      if (path === "/src/a.ts") {
        return [makeDiagnostic({ line: 0, message: "Error in a.ts", severity: 0 })];
      }
      if (path === "/src/b.tsx") {
        return [makeDiagnostic({ line: 3, message: "Error in b.tsx", severity: 0 })];
      }
      return [];
    });

    const listener = new ErrorListener();
    await fireDiagnosticsChange([doc1.uri, doc2.uri]);

    expect(mockEventEmitterFire).toHaveBeenCalledTimes(2);
  });
});
