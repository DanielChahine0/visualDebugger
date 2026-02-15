import type {
  BugCategory,
  CapturedError,
  Phase1Response,
  Phase2Response,
  BugRecord,
  ErrorExplanation,
  Quiz,
} from "../types.js";

// ---------------------------------------------------------------------------
// Mock VS Code objects
// ---------------------------------------------------------------------------

interface MockTextDocument {
  uri: { fsPath: string; toString: () => string };
  fileName: string;
  languageId: string;
  getText: () => string;
}

/**
 * Creates a mock VS Code TextDocument with sensible defaults.
 * Every field can be overridden via the `overrides` parameter.
 */
export function makeDocument(
  overrides: Partial<MockTextDocument & { fsPath: string; languageId: string; text: string }> = {},
): MockTextDocument {
  const fsPath = overrides.fsPath ?? "/test/file.ts";
  const languageId = overrides.languageId ?? "typescript";
  const text = overrides.text ?? "const x = 1;\nconst y = 2;\n";

  return {
    uri: overrides.uri ?? { fsPath, toString: () => fsPath },
    fileName: fsPath,
    languageId,
    getText: overrides.getText ?? (() => text),
  };
}

interface MockDiagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  message: string;
  severity: number;
}

/**
 * Creates a mock VS Code Diagnostic with sensible defaults.
 * Severity 0 = Error by default (matches vscode.DiagnosticSeverity.Error).
 */
export function makeDiagnostic(
  overrides: Partial<MockDiagnostic & { line: number; message: string; severity: number }> = {},
): MockDiagnostic {
  const line = overrides.line ?? 0;
  const message = overrides.message ?? "Test error";
  const severity = overrides.severity ?? 0;

  return {
    range: overrides.range ?? {
      start: { line, character: 0 },
      end: { line, character: 10 },
    },
    message,
    severity,
  };
}

// ---------------------------------------------------------------------------
// Domain objects from types.ts
// ---------------------------------------------------------------------------

/**
 * Creates a mock CapturedError with sensible defaults.
 */
export function makeCapturedError(overrides: Partial<CapturedError> = {}): CapturedError {
  return {
    message: "TypeError: Cannot read properties of undefined (reading 'map')",
    file: "App.tsx",
    line: 10,
    language: "typescriptreact",
    codeContext: "const items = data.map(item => <li>{item}</li>);",
    severity: "error",
    source: "diagnostics",
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Creates a mock Quiz with sensible defaults.
 */
function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    question: "Why does calling .map() on undefined throw an error?",
    options: [
      "A) .map() only works on strings",
      "B) undefined is not an array and has no .map() method",
      "C) The array is empty",
      "D) .map() is deprecated",
    ],
    correct: "B",
    explanation:
      "undefined is not an object and doesn't have any methods. .map() is an Array method, so you need an actual array to call it on.",
    ...overrides,
  };
}

/**
 * Creates a mock Phase1Response (Required<ErrorExplanation>) with sensible defaults.
 */
export function makePhase1Response(overrides: Partial<Phase1Response> = {}): Phase1Response {
  return {
    category: "Runtime Error",
    location: "line 10, App.tsx",
    tldr: "You called .map() on undefined data.",
    explanation:
      "You're trying to call .map() on a variable that is undefined.",
    howToFix:
      "Initialize your state with an empty array: useState([]) instead of useState().",
    howToPrevent:
      "Always initialize state with a default value that matches the type you expect.",
    bestPractices:
      "Use optional chaining (data?.map()) or provide a fallback (data || []).map().",
    keyTerms: ["Cannot read properties", "undefined", "map"],
    suggestedPrompt:
      "Fix the TypeError in App.tsx at line 10 where data.map() fails.\n\nContext:\n- data is undefined on first render\n\nWhat to fix:\n- Add [] as the initial value: useState([])\n\nExplain:\n- Why undefined causes this TypeError",
    quiz: makeQuiz(overrides.quiz),
    ...overrides,
  };
}

/**
 * Creates a mock Phase2Response (DiffExplanation) with sensible defaults.
 */
export function makePhase2Response(overrides: Partial<Phase2Response> = {}): Phase2Response {
  return {
    quickSummary: "useState now starts with an empty array.",
    whyItWorks:
      "Before, data had no starting value, making it undefined. Now data starts as [].",
    whatToDoNext: [
      "Confirm useState([]) has square brackets inside.",
      "Look for other useState() calls that may need a starting value.",
      "Run the app and verify the TypeError is gone.",
    ],
    keyTakeaway:
      "Always give useState a starting value that matches how you use it.",
    checkQuestion:
      "What happens if you call .map() on something that is undefined?",
    ...overrides,
  };
}

/**
 * Creates a mock BugRecord with sensible defaults.
 */
export function makeBugRecord(overrides: Partial<BugRecord> = {}): BugRecord {
  return {
    id: "bug-001",
    category: "Runtime Error",
    file: "App.tsx",
    errorMessage: "TypeError: Cannot read properties of undefined (reading 'map')",
    explanation: makePhase1Response(overrides.explanation),
    diffExplanation: undefined,
    timestamp: Date.now(),
    ...overrides,
  };
}
