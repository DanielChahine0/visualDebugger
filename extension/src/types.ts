/** Captured error from diagnostics or terminal */
export interface CapturedError {
  message: string;
  file: string;
  line: number;
  language: string;
  codeContext: string; // ±10 lines around the error
  severity: "error" | "warning";
  source: "diagnostics" | "terminal";
  timestamp: number;
}

/** Phase 1: LLM error explanation response */
export interface ErrorExplanation {
  category: "Syntax Error" | "Logic Error" | "Runtime Error";
  location: string;
  explanation: string;
  howToFix: string;
  howToPrevent: string;
  bestPractices: string;
  quiz?: {
    question: string;
    options: string[];
    correct: string;
    explanation: string;
  };
}

/** Captured diff between before/after save */
export interface CapturedDiff {
  file: string;
  language: string;
  beforeContent: string;
  afterContent: string;
  unifiedDiff: string;
  timestamp: number;
}

/** Phase 2: LLM diff explanation response */
export interface DiffExplanation {
  whatChanged: string;
  whyItFixes: string;
  keyTakeaway: string;
}

/** Stored bug record for dashboard */
export interface BugRecord {
  id: string;
  category: "Syntax Error" | "Logic Error" | "Runtime Error";
  file: string;
  errorMessage: string;
  explanation: ErrorExplanation;
  diffExplanation?: DiffExplanation;
  timestamp: number;
}

/** Messages from extension host -> webview */
export type ExtToWebviewMessage =
  | { type: "showError"; data: ErrorExplanation & { raw: CapturedError } }
  | { type: "showDiff"; data: DiffExplanation & { diff: CapturedDiff } }
  | { type: "showDashboard"; data: { bugs: BugRecord[] } }
  | { type: "clear" };

/** Messages from webview -> extension host */
export type WebviewToExtMessage =
  | { type: "quizAnswer"; answer: string }
  | { type: "requestTts"; text: string }
  | { type: "ready" };
