import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so these are available inside the hoisted vi.mock factory
const {
  mockGetDiagnostics,
  mockOnDidChangeDiagnostics,
  mockEventEmitterFire,
  mockEventEmitterDispose,
} = vi.hoisted(() => ({
  mockGetDiagnostics: vi.fn(),
  mockOnDidChangeDiagnostics: vi.fn(() => ({ dispose: vi.fn() })),
  mockEventEmitterFire: vi.fn(),
  mockEventEmitterDispose: vi.fn(),
}));

vi.mock("vscode", () => {
  const EventEmitter = vi.fn().mockImplementation(() => ({
    event: vi.fn(),
    fire: mockEventEmitterFire,
    dispose: mockEventEmitterDispose,
  }));

  return {
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
    CodeLens: class {
      range: any;
      command: any;
      constructor(range: any, command?: any) {
        this.range = range;
        this.command = command;
      }
    },
    Range: class {
      start: any;
      end: any;
      constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
      }
    },
    EventEmitter,
  };
});

import { FlowFixerCodeLensProvider, SUPPORTED_LANGUAGES } from "../codeLensProvider";

function makeDocument(languageId: string, fsPath: string = "/test/file.ts") {
  return {
    uri: { fsPath, toString: () => fsPath },
    languageId,
    getText: () => "const x = 1;\nconst y = 2;\n",
  } as any;
}

function makeDiagnostic(line: number, message: string, severity: number = 0) {
  return {
    range: {
      start: { line, character: 0 },
      end: { line, character: 10 },
    },
    message,
    severity,
  };
}

describe("FlowFixerCodeLensProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports SUPPORTED_LANGUAGES with JS/TS languages", () => {
    expect(SUPPORTED_LANGUAGES).toContain("javascript");
    expect(SUPPORTED_LANGUAGES).toContain("typescript");
    expect(SUPPORTED_LANGUAGES).toContain("javascriptreact");
    expect(SUPPORTED_LANGUAGES).toContain("typescriptreact");
    expect(SUPPORTED_LANGUAGES).toHaveLength(4);
  });

  it("registers diagnostics change listener on construction", () => {
    new FlowFixerCodeLensProvider();
    expect(mockOnDidChangeDiagnostics).toHaveBeenCalledOnce();
  });

  it("returns empty array for unsupported languages", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("python");
    mockGetDiagnostics.mockReturnValue([]);

    const lenses = provider.provideCodeLenses(doc);
    expect(lenses).toEqual([]);
  });

  it("returns empty array when no error diagnostics exist", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("typescript");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(0, "unused variable", 1), // Warning, not Error
    ]);

    const lenses = provider.provideCodeLenses(doc);
    expect(lenses).toEqual([]);
  });

  it("creates two CodeLens per error diagnostic", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("typescript");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(5, "TypeError: Cannot read properties of undefined"),
    ]);

    const lenses = provider.provideCodeLenses(doc);
    expect(lenses).toHaveLength(2);
  });

  it("first CodeLens is 'Explain this error' with correct command", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("typescript", "/src/app.ts");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(10, "SyntaxError: Unexpected token"),
    ]);

    const lenses = provider.provideCodeLenses(doc);
    const explainLens = lenses[0];

    expect(explainLens.command.title).toContain("Explain this error");
    expect(explainLens.command.command).toBe("visualdebugger.explainCodeLensError");
    expect(explainLens.command.arguments).toEqual(["/src/app.ts", 11, "SyntaxError: Unexpected token"]);
  });

  it("second CodeLens is 'Fix it for me' with correct command", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("typescript", "/src/app.ts");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(10, "SyntaxError: Unexpected token"),
    ]);

    const lenses = provider.provideCodeLenses(doc);
    const fixLens = lenses[1];

    expect(fixLens.command.title).toContain("Fix it for me");
    expect(fixLens.command.command).toBe("visualdebugger.fixCodeLensError");
    expect(fixLens.command.arguments).toEqual(["/src/app.ts", 11, "SyntaxError: Unexpected token"]);
  });

  it("creates lenses for multiple errors", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("javascript");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(0, "Error 1"),
      makeDiagnostic(5, "Error 2"),
      makeDiagnostic(10, "Error 3"),
    ]);

    const lenses = provider.provideCodeLenses(doc);
    expect(lenses).toHaveLength(6); // 2 per error x 3 errors
  });

  it("filters out warnings and only processes errors", () => {
    const provider = new FlowFixerCodeLensProvider();
    const doc = makeDocument("typescriptreact");
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(0, "Error!", 0),    // Error
      makeDiagnostic(2, "Warning!", 1),  // Warning
      makeDiagnostic(4, "Info!", 2),     // Information
      makeDiagnostic(6, "Hint!", 3),     // Hint
    ]);

    const lenses = provider.provideCodeLenses(doc);
    expect(lenses).toHaveLength(2); // Only the Error produces lenses
  });

  it("works for all supported languages", () => {
    const provider = new FlowFixerCodeLensProvider();
    mockGetDiagnostics.mockReturnValue([
      makeDiagnostic(0, "Test error"),
    ]);

    for (const lang of SUPPORTED_LANGUAGES) {
      const doc = makeDocument(lang);
      const lenses = provider.provideCodeLenses(doc);
      expect(lenses).toHaveLength(2);
    }
  });

  it("dispose cleans up resources", () => {
    const provider = new FlowFixerCodeLensProvider();
    provider.dispose();
    expect(mockEventEmitterDispose).toHaveBeenCalled();
  });
});
