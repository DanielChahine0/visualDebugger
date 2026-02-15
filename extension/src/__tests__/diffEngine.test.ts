import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { makeDocument } from "./helpers";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockOnWillSaveTextDocument,
  mockOnDidSaveTextDocument,
  mockOnDidChangeDiagnostics,
  mockOnDidChangeTextDocument,
  mockGetDiagnostics,
  mockEventEmitterFire,
  mockEventEmitterDispose,
  mockEventEmitterEvent,
  mockTextDocuments,
  mockOpenTextDocument,
  mockCreatePatch,
} = vi.hoisted(() => ({
  mockOnWillSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  mockOnDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  mockOnDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
  mockOnDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
  mockGetDiagnostics: vi.fn().mockReturnValue([]),
  mockEventEmitterFire: vi.fn(),
  mockEventEmitterDispose: vi.fn(),
  mockEventEmitterEvent: vi.fn(),
  mockTextDocuments: [] as Array<ReturnType<typeof makeDocument>>,
  mockOpenTextDocument: vi.fn(),
  mockCreatePatch: vi.fn().mockReturnValue("mock-patch"),
}));

vi.mock("vscode", () => {
  const EventEmitter = vi.fn().mockImplementation(() => ({
    event: mockEventEmitterEvent,
    fire: mockEventEmitterFire,
    dispose: mockEventEmitterDispose,
  }));

  return {
    workspace: {
      onWillSaveTextDocument: mockOnWillSaveTextDocument,
      onDidSaveTextDocument: mockOnDidSaveTextDocument,
      onDidChangeTextDocument: mockOnDidChangeTextDocument,
      get textDocuments() {
        return mockTextDocuments;
      },
      openTextDocument: mockOpenTextDocument,
    },
    languages: {
      getDiagnostics: mockGetDiagnostics,
      onDidChangeDiagnostics: mockOnDidChangeDiagnostics,
    },
    DiagnosticSeverity: {
      Error: 0,
      Warning: 1,
      Information: 2,
      Hint: 3,
    },
    Uri: {
      file: (path: string) => ({
        fsPath: path,
        toString: () => path,
      }),
    },
    EventEmitter,
  };
});

vi.mock("diff", () => ({
  createPatch: mockCreatePatch,
}));

import { DiffEngine } from "../diffEngine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Invoke the onWillSaveTextDocument callback. */
function fireWillSave(doc: ReturnType<typeof makeDocument>) {
  const cb = mockOnWillSaveTextDocument.mock.calls[0]?.[0];
  if (!cb) throw new Error("No onWillSaveTextDocument callback registered");
  cb({ document: doc });
}

/** Invoke the onDidSaveTextDocument callback. */
function fireDidSave(doc: ReturnType<typeof makeDocument>) {
  const cb = mockOnDidSaveTextDocument.mock.calls[0]?.[0];
  if (!cb) throw new Error("No onDidSaveTextDocument callback registered");
  cb(doc);
}

/** Invoke the onDidChangeDiagnostics callback. */
function fireDiagnosticsChange(
  uris: Array<{ fsPath: string; toString: () => string }>,
) {
  const cb = mockOnDidChangeDiagnostics.mock.calls[0]?.[0];
  if (!cb) throw new Error("No onDidChangeDiagnostics callback registered");
  cb({ uris });
}

/** Invoke the onDidChangeTextDocument callback. */
function fireContentChange(doc: ReturnType<typeof makeDocument>, contentChanges = [{ text: "x" }]) {
  const cb = mockOnDidChangeTextDocument.mock.calls[0]?.[0];
  if (!cb) throw new Error("No onDidChangeTextDocument callback registered");
  cb({ document: doc, contentChanges });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiffEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockTextDocuments.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ------- Construction -------

  it("constructs without errors", () => {
    expect(() => new DiffEngine()).not.toThrow();
  });

  it("registers four VS Code listeners on construction", () => {
    new DiffEngine();
    expect(mockOnWillSaveTextDocument).toHaveBeenCalledOnce();
    expect(mockOnDidSaveTextDocument).toHaveBeenCalledOnce();
    expect(mockOnDidChangeDiagnostics).toHaveBeenCalledOnce();
    expect(mockOnDidChangeTextDocument).toHaveBeenCalledOnce();
  });

  // ------- startTracking / stopTracking -------

  it("startTracking sets tracking state and captures snapshot", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Verify tracking is active by triggering a save — it should process
    const updatedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 2;\n",
    });
    // Replace getText to return new content
    fireDidSave(updatedDoc);

    // The diff should fire because we're tracking and content changed
    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
  });

  it("stopTracking clears tracking state", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");
    engine.stopTracking();

    // After stopping, saves should not trigger diffs
    fireDidSave(doc);
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("stopTracking clears the beforeSaveContent map", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");
    engine.stopTracking();

    // Re-start tracking the same file
    engine.startTracking("/src/app.ts");

    // Should be able to capture a new snapshot (map was cleared)
    // Trigger save with different content
    const updatedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 2;\n",
    });
    fireDidSave(updatedDoc);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
  });

  it("stopTracking clears pending debounce timer", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);
    mockGetDiagnostics.mockReturnValue([]); // 0 errors = cleared

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Trigger diagnostics clearing to set debounce timer
    fireDiagnosticsChange([doc.uri]);

    // Stop tracking before debounce fires
    engine.stopTracking();

    // Advance past debounce — nothing should happen
    vi.advanceTimersByTime(1000);
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("cannot start tracking a different file while already tracking", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");
    engine.startTracking("/src/other.ts"); // Should be ignored

    // Verify the second call was rejected via log
    const ignoreLogs = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes("ignoring startTracking"),
    );
    expect(ignoreLogs.length).toBeGreaterThan(0);

    consoleSpy.mockRestore();
  });

  it("can re-start tracking for the same file", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");
    engine.startTracking("/src/app.ts"); // Same file — should succeed

    // Should NOT have an "ignoring" log
    const ignoreLogs = consoleSpy.mock.calls.filter((c) =>
      String(c[0]).includes("ignoring startTracking"),
    );
    expect(ignoreLogs).toHaveLength(0);

    consoleSpy.mockRestore();
  });

  it("opens the file asynchronously if not in textDocuments", async () => {
    // No docs in textDocuments
    const openedDoc = makeDocument({
      fsPath: "/src/missing.ts",
      languageId: "typescript",
      text: "initial content\n",
    });
    mockOpenTextDocument.mockResolvedValue(openedDoc);

    const engine = new DiffEngine();
    engine.startTracking("/src/missing.ts");

    // Wait for the async open
    await vi.advanceTimersByTimeAsync(0);

    expect(mockOpenTextDocument).toHaveBeenCalledOnce();
  });

  // ------- Diff detection on save -------

  it("fires onDiffDetected when file content changes between before-save and after-save", () => {
    const beforeDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(beforeDoc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Simulate save with changed content
    const afterDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 2;\n",
    });

    fireDidSave(afterDoc);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
    const captured = mockEventEmitterFire.mock.calls[0][0];
    expect(captured.file).toBeDefined();
    expect(captured.beforeContent).toBe("const x = 1;\n");
    expect(captured.afterContent).toBe("const x = 2;\n");
    expect(captured.unifiedDiff).toBe("mock-patch");
  });

  it("does not fire onDiffDetected when content is unchanged", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Save with identical content
    fireDidSave(doc);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("does not capture before-save content for a non-tracked file", () => {
    const trackedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "tracked content\n",
    });
    mockTextDocuments.push(trackedDoc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Will-save on a different file
    const otherDoc = makeDocument({
      fsPath: "/src/other.ts",
      languageId: "typescript",
      text: "other content\n",
    });
    fireWillSave(otherDoc);

    // Save the other doc — should have no baseline, so no diff
    const otherDocChanged = makeDocument({
      fsPath: "/src/other.ts",
      languageId: "typescript",
      text: "changed\n",
    });
    fireDidSave(otherDocChanged);

    // Only the tracked file's diff should ever fire. Since we saved the wrong file, nothing fires.
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("stops tracking after first diff is captured", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // First save with changed content
    const afterDoc1 = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 2;\n",
    });
    fireDidSave(afterDoc1);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1);

    // Second save — tracking should have stopped
    const afterDoc2 = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 3;\n",
    });
    fireDidSave(afterDoc2);
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1); // still 1
  });

  // ------- Diagnostics-based diff detection (errors clearing) -------

  it("debounce timer is set when errors clear on tracked file", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);
    mockGetDiagnostics.mockReturnValue([]); // No errors = cleared

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    fireDiagnosticsChange([doc.uri]);

    // Timer set but not fired yet — no diff emitted
    expect(mockEventEmitterFire).not.toHaveBeenCalled();

    // Advance to debounce
    vi.advanceTimersByTime(500);

    // Now it should have attempted to compute the diff
    // (content is same so it won't actually fire in this case)
    // But the debounce mechanism was exercised
  });

  it("multiple diagnostic changes within debounce window only fire once", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);
    mockGetDiagnostics.mockReturnValue([]); // No errors = cleared

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Simulate the file being modified after startTracking captured the snapshot
    const modifiedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 999;\n",
    });
    // Replace the doc in textDocuments so computeDiffForTrackedFile finds it
    mockTextDocuments.length = 0;
    mockTextDocuments.push(modifiedDoc);

    // Fire diagnostics cleared three times rapidly
    fireDiagnosticsChange([doc.uri]);
    vi.advanceTimersByTime(100);
    fireDiagnosticsChange([doc.uri]);
    vi.advanceTimersByTime(100);
    fireDiagnosticsChange([doc.uri]);

    // Wait for the debounce to fire
    await vi.advanceTimersByTimeAsync(500);

    // Should only fire once (the debounce resets each time)
    expect(mockEventEmitterFire).toHaveBeenCalledTimes(1);
  });

  it("does not react to diagnostics changes when not tracking", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
    });
    mockGetDiagnostics.mockReturnValue([]);

    const engine = new DiffEngine();
    // Not calling startTracking

    fireDiagnosticsChange([doc.uri]);
    vi.advanceTimersByTime(1000);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("ignores diagnostics changes for files other than tracked file", () => {
    const trackedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "tracked\n",
    });
    mockTextDocuments.push(trackedDoc);

    const otherUri = { fsPath: "/src/other.ts", toString: () => "/src/other.ts" };
    mockGetDiagnostics.mockReturnValue([]);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Fire diagnostics change for a different file
    fireDiagnosticsChange([otherUri]);
    vi.advanceTimersByTime(1000);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("does not fire diff when errors remain on tracked file", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    // Still has errors
    mockGetDiagnostics.mockReturnValue([
      { severity: 0, message: "Error", range: { start: { line: 0 } } },
    ]);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    fireDiagnosticsChange([doc.uri]);
    vi.advanceTimersByTime(1000);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  // ------- Error count decrease triggers diff detection -------

  it("fires diff when error count decreases but does not reach zero", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    // Start with 3 errors
    mockGetDiagnostics.mockReturnValue([
      { severity: 0, message: "Error 1", range: { start: { line: 0 } } },
      { severity: 0, message: "Error 2", range: { start: { line: 1 } } },
      { severity: 0, message: "Error 3", range: { start: { line: 2 } } },
    ]);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Now only 1 error remains (decrease from 3 to 1)
    mockGetDiagnostics.mockReturnValue([
      { severity: 0, message: "Error 3", range: { start: { line: 2 } } },
    ]);

    // Replace doc with modified version
    const modifiedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 999;\n",
    });
    mockTextDocuments.length = 0;
    mockTextDocuments.push(modifiedDoc);

    fireDiagnosticsChange([doc.uri]);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
  });

  it("does not fire diff when error count stays the same", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    // Start with 2 errors
    mockGetDiagnostics.mockReturnValue([
      { severity: 0, message: "Error 1", range: { start: { line: 0 } } },
      { severity: 0, message: "Error 2", range: { start: { line: 1 } } },
    ]);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Still 2 errors (count unchanged)
    fireDiagnosticsChange([doc.uri]);
    vi.advanceTimersByTime(1000);

    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  // ------- Content change detection -------

  it("fires diff after content change debounce when diagnostics path does not fire", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Simulate content change (AI tool modifies buffer)
    const modifiedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 42;\n",
    });
    mockTextDocuments.length = 0;
    mockTextDocuments.push(modifiedDoc);

    fireContentChange(doc);

    // Not yet fired (1.5s debounce)
    vi.advanceTimersByTime(1000);
    expect(mockEventEmitterFire).not.toHaveBeenCalled();

    // After 1.5s total, it should fire
    await vi.advanceTimersByTimeAsync(600);
    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
  });

  it("content change timer is cancelled when diagnostics path fires first", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Content change starts 1.5s timer
    const modifiedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 42;\n",
    });
    mockTextDocuments.length = 0;
    mockTextDocuments.push(modifiedDoc);

    fireContentChange(doc);

    // Before content timer fires, diagnostics clear (triggers 500ms timer)
    mockGetDiagnostics.mockReturnValue([]);
    fireDiagnosticsChange([doc.uri]);

    // Wait for diagnostics debounce (500ms)
    await vi.advanceTimersByTimeAsync(600);

    // Diff should have fired once via diagnostics path
    expect(mockEventEmitterFire).toHaveBeenCalledOnce();

    // Wait past the content change timer (1.5s total) — should NOT fire again
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockEventEmitterFire).toHaveBeenCalledOnce(); // still 1
  });

  it("content change on non-tracked file is ignored", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Content change on a different file
    const otherDoc = makeDocument({
      fsPath: "/src/other.ts",
      languageId: "typescript",
    });
    fireContentChange(otherDoc);

    vi.advanceTimersByTime(2000);
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  it("content change with empty contentChanges array is ignored", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    fireContentChange(doc, []);

    vi.advanceTimersByTime(2000);
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });

  // ------- computeDiffForTrackedFile (opens file if not in textDocuments) -------

  it("opens file via openTextDocument if not in textDocuments when errors clear", async () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Clear textDocuments to simulate file not being open
    mockTextDocuments.length = 0;
    mockGetDiagnostics.mockReturnValue([]);

    const openedDoc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 2;\n",
    });
    mockOpenTextDocument.mockResolvedValue(openedDoc);

    fireDiagnosticsChange([doc.uri]);

    await vi.advanceTimersByTimeAsync(600);

    expect(mockOpenTextDocument).toHaveBeenCalled();
    expect(mockEventEmitterFire).toHaveBeenCalledOnce();
  });

  // ------- Dispose -------

  it("dispose cleans up listeners, timers, and emitter", () => {
    const engine = new DiffEngine();
    engine.dispose();

    expect(mockEventEmitterDispose).toHaveBeenCalledOnce();
  });

  it("dispose can be called multiple times without error", () => {
    const engine = new DiffEngine();
    expect(() => {
      engine.dispose();
      engine.dispose();
    }).not.toThrow();
  });

  it("dispose stops tracking and clears debounce timer", () => {
    const doc = makeDocument({
      fsPath: "/src/app.ts",
      languageId: "typescript",
      text: "const x = 1;\n",
    });
    mockTextDocuments.push(doc);
    mockGetDiagnostics.mockReturnValue([]);

    const engine = new DiffEngine();
    engine.startTracking("/src/app.ts");

    // Trigger debounce timer
    fireDiagnosticsChange([doc.uri]);

    // Dispose before debounce fires
    engine.dispose();

    // Advance past debounce — nothing should happen
    vi.advanceTimersByTime(1000);

    // Only the dispose fire, no diff fire
    // mockEventEmitterFire should not have been called for diff
    expect(mockEventEmitterFire).not.toHaveBeenCalled();
  });
});
